"""End-to-end API tests against the REAL models and the real sample video. Expected relationships are checked, not benchmark numbers."""
import time

import cv2
import numpy as np
import pytest

from conftest import SAMPLE, make_client, wait_job

SID = "factory-corridor-ppe"


def frames_of(client, job_id):
    out, start = [], 0
    while True:
        r = client.get(f"/api/jobs/{job_id}/frames", params={"start": start, "limit": 1000}).json()
        out += r["frames"]
        if not r["frames"]:
            return out
        start = r["next_start"]


def workers(f):
    return [d for d in f["detections"] if d["class"] == "worker"]


@pytest.fixture(scope="module")
def sample_job(client):
    r = client.post("/api/detect/video", data={"sample_id": SID, "stride": "3"})
    assert r.status_code == 202, r.text
    return wait_job(client, r.json()["job_id"])


def test_health_and_samples(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["person_model"].startswith("yolox") and h["ppe_model"] == "worker_safety_mobilenet" and h["ppe_classes"] == ["hard_hat", "safety_vest"]
    s = client.get("/api/samples").json()["samples"]
    assert s and s[0]["license"] and s[0]["attribution"] and s[0]["scenarios"]
    assert client.get(s[0]["video_url"]).status_code == 200


def test_video_job_completes_with_real_detections(client, sample_job):
    j = sample_job
    assert j["status"] == "completed", j
    s = j["summary"]
    assert s["frames_processed"] == 650 and s["detection_instances_processed"] > 0 and s["unique_worker_tracks"] >= 1
    assert s["average_fps"] > 0 and s["processing_seconds"] > 0 and s["ppe_detection_ms_per_frame"] > 0  # measured, not invented
    assert len(frames_of(client, j["job_id"])) == s["frames_processed"]


def test_per_frame_counts_are_consistent(client, sample_job):
    fr = frames_of(client, sample_job["job_id"])
    total, seen, prev_unique = 0, set(), 0
    for f in fr:
        w = workers(f)
        assert f["workers_visible"] == len(w)
        assert f["compliant_workers"] + f["potential_ppe_violations"] + f["uncertain_classifications"] == len(w)  # every worker has exactly one assessment
        assert f["hard_hats_detected"] == sum(d["class"] == "hard_hat" for d in f["detections"])
        assert f["safety_vests_detected"] == sum(d["class"] == "safety_vest" for d in f["detections"])
        total += len(f["detections"])
        assert f["detection_instances_processed"] == total                       # instances accumulate separately...
        for d in f["detections"]:
            b = d["bbox"]
            assert 0 <= b["x1"] < b["x2"] <= 960 and 0 <= b["y1"] < b["y2"] <= 540  # pixel coordinates inside the original frame
            assert 0 < d["confidence"] <= 1
            if d["class"] == "worker":
                a = d["ppe_assessment"]
                assert a["status"] in ("compliant", "potential_violation", "uncertain") and set(a["items"]) == {"hard_hat", "safety_vest"}
                if a["status"] == "potential_violation":
                    assert any(a["items"][k]["state"] == "not_detected" for k in a["items"])
                    if not a["reliable_view"]:  # a conclusion kept through a brief poor view must say so
                        assert any("current view is poor" in r for r in a["reasons"])
                if a["status"] == "compliant":
                    assert all(a["items"][k]["state"] == "detected" for k in a["items"])
                if d["confirmed"]:
                    seen.add(d["track_id"])
        assert f["unique_worker_tracks"] == len(seen) >= prev_unique             # ...from unique tracks, which never decrease
        prev_unique = f["unique_worker_tracks"]
    assert 1 <= len(seen) < sum(f["workers_visible"] for f in fr)                # a worker seen in many frames is NOT counted many times


def test_sample_contains_both_compliant_and_flagged_workers_and_ids_persist(client, sample_job):
    """The corridor clip has people with full PPE and people without a vest; both must be found, and IDs must persist."""
    fr = frames_of(client, sample_job["job_id"])
    statuses = {}
    for f in fr:
        for d in workers(f):
            if d["track_id"] is not None:
                statuses.setdefault(d["track_id"], set()).add(d["ppe_assessment"]["status"])
    assert any("compliant" in s for s in statuses.values()), statuses
    assert any("potential_violation" in s for s in statuses.values()), statuses
    per_id = {}
    for f in fr:
        for d in workers(f):
            if d["track_id"] is not None:
                per_id.setdefault(d["track_id"], []).append(f["frame_index"])
    assert max(len(v) for v in per_id.values()) >= 40, "one worker keeps one id across 40+ processed frames"


def test_ppe_boxes_belong_to_a_worker_and_sit_where_the_item_would(client, sample_job):
    fr = frames_of(client, sample_job["job_id"])
    n = 0
    for f in fr:
        ws = {d["track_id"]: d["bbox"] for d in workers(f) if d["track_id"] is not None}
        for d in f["detections"]:
            if d["class"] == "worker" or d["worker_track_id"] is None or d["worker_track_id"] not in ws:
                continue
            w, b = ws[d["worker_track_id"]], d["bbox"]
            cy, h = (b["y1"] + b["y2"]) / 2, w["y2"] - w["y1"]
            rel = (cy - w["y1"]) / h
            assert (-0.12 <= rel <= 0.40) if d["class"] == "hard_hat" else (0.18 <= rel <= 0.92)
            n += 1
    assert n > 50


def test_processed_video_is_playable_and_matches_the_run(client, sample_job):
    out = sample_job["outputs"]
    url = out["video_mp4"] or out["video_webm"]
    assert url
    r = client.get(url)
    assert r.status_code == 200 and len(r.content) > 10_000
    p = f"/tmp/ppe-test-{sample_job['job_id']}.{'mp4' if out['video_mp4'] else 'webm'}"
    open(p, "wb").write(r.content)
    cap, n = cv2.VideoCapture(p), 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        n += 1
        assert fr.shape[:2] == (540, 960)
    cap.release()
    assert abs(n - sample_job["summary"]["frames_processed"]) <= 1
    o = client.get(out["original"])
    assert o.status_code == 200 and o.headers["content-type"].startswith("video/")


def test_exports_json_and_csv(client, sample_job):
    jid = sample_job["job_id"]
    j = client.get(f"/api/jobs/{jid}/result", params={"include_frames": "true"}).json()
    assert len(j["frames"]) == sample_job["summary"]["frames_processed"]
    rows = client.get(f"/api/jobs/{jid}/result.csv").text.strip().splitlines()
    assert rows[0].startswith("frame_number,timestamp_seconds,class,worker_track_id")
    assert len(rows) - 1 == sample_job["summary"]["detection_instances_processed"]


def frame_jpg(n):
    cap = cv2.VideoCapture(str(SAMPLE))
    cap.set(cv2.CAP_PROP_POS_FRAMES, n)
    ok, frame = cap.read()
    assert ok
    return cv2.imencode(".jpg", frame)[1].tobytes()


def test_image_detection_on_a_real_frame(client):
    # frame 640 shows one worker in a hard hat and orange vest next to a person in black without either (verified by eye when the sample was chosen)
    r = client.post("/api/detect/image", files={"file": ("frame.jpg", frame_jpg(640), "image/jpeg")})
    assert r.status_code == 200, r.text
    j = r.json()
    w = [d for d in j["detections"] if d["class"] == "worker"]
    assert j["workers_visible"] == len(w) >= 2 and j["inference_ms"] > 0
    assert j["hard_hats_detected"] >= 1 and j["safety_vests_detected"] >= 1
    assert all(d["track_id"] is None for d in j["detections"])
    assert any(d["ppe_assessment"]["status"] == "compliant" for d in w)
    assert any(d["ppe_assessment"]["status"] == "potential_violation" for d in w)


def test_dropping_a_requirement_never_creates_violations(client):
    both = client.post("/api/detect/image", files={"file": ("f.jpg", frame_jpg(640), "image/jpeg")}).json()
    hat_only = client.post("/api/detect/image", files={"file": ("f.jpg", frame_jpg(640), "image/jpeg")}, data={"require_vest": "false"}).json()
    assert both["compliant_workers"] <= hat_only["compliant_workers"]            # dropping a requirement can never create violations
    assert hat_only["potential_ppe_violations"] <= both["potential_ppe_violations"]


def test_an_empty_scene_gives_no_workers_and_no_violations(client):
    j = client.post("/api/detect/image", files={"file": ("f.jpg", frame_jpg(5), "image/jpeg")}).json()   # empty corridor at the start of the clip
    assert j["workers_visible"] == 0 and j["potential_ppe_violations"] == 0 and j["detections"] == []


def test_stop_cancels_a_running_job_and_keeps_partial_results(client):
    jid = client.post("/api/detect/video", data={"sample_id": SID}).json()["job_id"]
    t0 = time.time()
    while client.get(f"/api/jobs/{jid}").json()["progress"]["frames_processed"] < 15 and time.time() - t0 < 60:
        time.sleep(0.1)
    assert client.post(f"/api/jobs/{jid}/stop").status_code == 200
    j = wait_job(client, jid)
    assert j["status"] == "cancelled" and 15 <= j["summary"]["frames_processed"] < 1950
    assert len(frames_of(client, jid)) == j["summary"]["frames_processed"]
    assert client.delete(f"/api/jobs/{jid}").status_code == 200
    assert client.get(f"/api/jobs/{jid}").status_code == 404  # cleaned up


def test_zone_counts_workers_inside_separately(client):
    j = wait_job(client, client.post("/api/detect/video", data={"sample_id": SID, "stride": "6", "zone": "0.0,0.0,1.0,1.0", "write_video": "false"}).json()["job_id"])
    z = j["summary"]["zone"]
    assert z and z["peak_workers_inside"] >= 1 and z["peak_workers_inside"] <= j["summary"]["peak_workers_visible"]
    fr = frames_of(client, j["job_id"])
    assert all(f["zone"]["workers_inside"] <= f["workers_visible"] for f in fr)


# ---- error handling and safety ---------------------------------------------------------------------------------------
def test_invalid_uploads_get_clear_errors(client):
    def post(name, data, **kw):
        return client.post("/api/detect/video", files={"file": (name, data, "application/octet-stream")}, **kw)
    assert post("a.mp4", b"").status_code == 400
    r = post("notes.mp4", b"hello this is not a video at all, just text" * 50)
    assert r.status_code == 415 and "Unsupported" in r.json()["detail"]
    assert post("a.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 200).status_code == 422  # right magic bytes, undecodable content
    jpg = cv2.imencode(".jpg", np.zeros((64, 64, 3), np.uint8))[1].tobytes()
    assert post("x.mp4", jpg).status_code == 415                                            # an image sent to the video endpoint
    assert client.post("/api/detect/video").status_code == 400                             # nothing sent
    assert client.post("/api/detect/video", data={"sample_id": "../../etc/passwd"}).status_code == 404
    assert client.post("/api/detect/video", data={"sample_id": SID, "conf": "0.99"}).status_code == 400
    assert client.post("/api/detect/video", data={"sample_id": SID, "ppe_conf": "0.01"}).status_code == 400
    assert client.post("/api/detect/video", data={"sample_id": SID, "zone": "0.5,0.5,0.5,0.9"}).status_code == 400
    assert client.post("/api/detect/video", data={"sample_id": SID, "zone": "a,b,c,d"}).status_code == 400
    assert client.post("/api/detect/image", files={"file": ("a.jpg", b"not an image", "image/jpeg")}).status_code == 415
    bomb = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + (60000).to_bytes(4, "big") + (60000).to_bytes(4, "big") + b"\x08\x02\x00\x00\x00" + b"\x00" * 20
    r = client.post("/api/detect/image", files={"file": ("a.png", bomb, "image/png")})
    assert r.status_code == 422 and "too large" in r.json()["detail"]


def test_ids_are_not_paths_and_errors_do_not_leak_internals(client):
    for bad in ["../etc/passwd", "..%2f..%2fetc", "a" * 32, "0" * 32, "x"]:
        r = client.get(f"/api/jobs/{bad}")
        assert r.status_code == 404 and "/tmp" not in r.text and "Traceback" not in r.text
    assert client.get("/api/samples/..%2fmanifest/video").status_code in (404, 422)


def test_size_and_duration_limits(small_client):
    big = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 1_500_000
    assert small_client.post("/api/detect/video", files={"file": ("big.mp4", big, "video/mp4")}).status_code == 413
    r = small_client.post("/api/detect/video", data={"sample_id": SID})  # 65 s > 5 s limit
    assert r.status_code == 422 and "trim" in r.json()["detail"]


def test_busy_service_rejects_instead_of_overloading(tmp_path):
    with make_client(tmp_path, max_concurrent_jobs=1, max_queued_jobs=0) as c:
        r1 = c.post("/api/detect/video", data={"sample_id": SID, "stride": "10"})
        assert r1.status_code == 202
        r2 = c.post("/api/detect/video", data={"sample_id": SID, "stride": "10"})
        assert r2.status_code == 503 and "busy" in r2.json()["detail"]
        c.post(f"/api/jobs/{r1.json()['job_id']}/stop")
        wait_job(c, r1.json()["job_id"])
