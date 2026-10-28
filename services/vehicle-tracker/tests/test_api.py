"""End-to-end API tests against the REAL model and the real sample video. Expected relationships are checked, not benchmark numbers."""
import io
import time

import cv2
import numpy as np
import pytest

from conftest import SAMPLE, make_client, wait_job


def frames_of(client, job_id):
    out, start = [], 0
    while True:
        r = client.get(f"/api/jobs/{job_id}/frames", params={"start": start, "limit": 1000}).json()
        out += r["frames"]
        if not r["frames"]:
            return out
        start = r["next_start"]


@pytest.fixture(scope="module")
def sample_job(client):
    r = client.post("/api/detect/video", data={"sample_id": "highway-dashcam", "stride": "2"})
    assert r.status_code == 202, r.text
    return wait_job(client, r.json()["job_id"])


def test_health_and_samples(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["model"].startswith("yolox") and h["classes"] == ["car", "motorcycle", "bus", "truck"]
    s = client.get("/api/samples").json()["samples"]
    assert s and s[0]["license"] and s[0]["attribution"]
    assert client.get(s[0]["video_url"]).status_code == 200


def test_video_job_completes_with_real_detections(client, sample_job):
    j = sample_job
    assert j["status"] == "completed", j
    s = j["summary"]
    assert s["frames_processed"] == 250 and s["detection_instances_processed"] > 0 and s["unique_tracks_observed"] >= 1
    assert s["average_fps"] > 0 and s["processing_seconds"] > 0  # measured, not invented
    fr = frames_of(client, j["job_id"])
    assert len(fr) == s["frames_processed"]


def test_counts_are_consistent_per_frame(client, sample_job):
    fr = frames_of(client, sample_job["job_id"])
    total, seen = 0, set()
    prev_unique = 0
    for f in fr:
        d = f["detections"]
        assert f["vehicles_visible"] == len(d)                                    # visible = this frame's detections
        assert sum(f["class_counts"].values()) == f["vehicles_visible"]           # class split sums to visible
        total += len(d)
        assert f["detection_instances_processed"] == total                        # instances accumulate separately...
        for x in d:
            if x["confirmed"]:
                seen.add(x["track_id"])
            b = x["bbox"]
            assert 0 <= b["x1"] < b["x2"] <= 1280 and 0 <= b["y1"] < b["y2"] <= 720  # pixel coordinates inside the original frame
            assert 0 < x["confidence"] <= 1 and x["class"] in ("car", "motorcycle", "bus", "truck")
        assert f["unique_tracks_observed"] == len(seen) >= prev_unique             # ...from unique tracks, which never decrease
        assert sum(f["unique_by_class"].values()) == f["unique_tracks_observed"]
        prev_unique = f["unique_tracks_observed"]
    assert len(seen) < total                                                       # a vehicle seen in many frames is NOT counted many times
    assert any(f["vehicles_visible"] >= 2 for f in fr), "sample has frames with several vehicles"


def test_tracking_ids_persist_across_frames(client, sample_job):
    fr = frames_of(client, sample_job["job_id"])
    per_id = {}
    for f in fr:
        for x in f["detections"]:
            if x["track_id"] is not None:
                per_id.setdefault(x["track_id"], []).append(f["frame_index"])
    assert per_id, "tracks were created"
    assert max(len(v) for v in per_id.values()) >= 20, "at least one vehicle keeps one id for 20+ processed frames"


def test_processed_video_is_playable_and_matches_the_run(client, sample_job):
    jid = sample_job["job_id"]
    out = sample_job["outputs"]
    url = out["video_mp4"] or out["video_webm"]
    assert url
    r = client.get(url)
    assert r.status_code == 200 and len(r.content) > 10_000
    p = f"/tmp/vt-test-{jid}.{'mp4' if out['video_mp4'] else 'webm'}"
    open(p, "wb").write(r.content)
    cap = cv2.VideoCapture(p)
    n = 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        n += 1
        assert fr.shape[:2] == (720, 1280)
    cap.release()
    assert abs(n - sample_job["summary"]["frames_processed"]) <= 1
    # the original stays available for side-by-side comparison
    o = client.get(out["original"])
    assert o.status_code == 200 and o.headers["content-type"].startswith("video/")


def test_exports_json_and_csv(client, sample_job):
    jid = sample_job["job_id"]
    j = client.get(f"/api/jobs/{jid}/result", params={"include_frames": "true"}).json()
    assert len(j["frames"]) == sample_job["summary"]["frames_processed"]
    csv_rows = client.get(f"/api/jobs/{jid}/result.csv").text.strip().splitlines()
    assert csv_rows[0].startswith("frame_number,timestamp_seconds,track_id")
    assert len(csv_rows) - 1 == sample_job["summary"]["detection_instances_processed"]


def test_image_detection_on_a_real_frame(client):
    cap = cv2.VideoCapture(str(SAMPLE))
    cap.set(cv2.CAP_PROP_POS_FRAMES, 300)
    ok, frame = cap.read()
    assert ok
    ok, buf = cv2.imencode(".jpg", frame)
    r = client.post("/api/detect/image", files={"file": ("frame.jpg", buf.tobytes(), "image/jpeg")}, data={"conf": "0.3"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["vehicles_visible"] == len(j["detections"]) >= 1 and sum(j["class_counts"].values()) == j["vehicles_visible"]
    assert all(d["track_id"] is None for d in j["detections"]) and j["inference_ms"] > 0


def test_stop_cancels_a_running_job_and_keeps_partial_results(client):
    r = client.post("/api/detect/video", data={"sample_id": "highway-dashcam"})
    jid = r.json()["job_id"]
    t0 = time.time()
    while client.get(f"/api/jobs/{jid}").json()["progress"]["frames_processed"] < 15 and time.time() - t0 < 60:
        time.sleep(0.1)
    assert client.post(f"/api/jobs/{jid}/stop").status_code == 200
    j = wait_job(client, jid)
    assert j["status"] == "cancelled" and 15 <= j["summary"]["frames_processed"] < 500
    assert len(frames_of(client, jid)) == j["summary"]["frames_processed"]
    assert client.delete(f"/api/jobs/{jid}").status_code == 200
    assert client.get(f"/api/jobs/{jid}").status_code == 404  # cleaned up


def test_virtual_line_counts_crossings_separately(client):
    r = client.post("/api/detect/video", data={"sample_id": "highway-dashcam", "stride": "2", "line": "0.0,0.62,1.0,0.62"})
    j = wait_job(client, r.json()["job_id"])
    lc = j["summary"]["line_crossings"]
    assert lc and lc["total"] == lc["a_to_b"] + lc["b_to_a"] and lc["total"] >= 0
    assert j["summary"]["unique_tracks_observed"] >= 1  # reported separately from line crossings


# ---- error handling and safety ---------------------------------------------------------------------------------------
def test_invalid_uploads_get_clear_errors(client):
    def post(name, data, **kw):
        return client.post("/api/detect/video", files={"file": (name, data, "application/octet-stream")}, **kw)
    assert post("a.mp4", b"").status_code == 400
    r = post("notes.mp4", b"hello this is not a video at all, just text" * 50)
    assert r.status_code == 415 and "Unsupported" in r.json()["detail"]
    r = post("a.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 200)  # right magic bytes, undecodable content
    assert r.status_code == 422
    jpg = cv2.imencode(".jpg", np.zeros((64, 64, 3), np.uint8))[1].tobytes()
    assert post("x.mp4", jpg).status_code == 415                                   # an image sent to the video endpoint
    assert client.post("/api/detect/video").status_code == 400                    # nothing sent
    assert client.post("/api/detect/video", data={"sample_id": "../../etc/passwd"}).status_code == 404
    assert client.post("/api/detect/video", data={"sample_id": "highway-dashcam", "conf": "0.99"}).status_code == 400
    assert client.post("/api/detect/video", data={"sample_id": "highway-dashcam", "line": "0,0,0,0"}).status_code == 400
    r = client.post("/api/detect/image", files={"file": ("a.jpg", b"not an image", "image/jpeg")})
    assert r.status_code == 415
    bomb = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + (60000).to_bytes(4, "big") + (60000).to_bytes(4, "big") + b"\x08\x02\x00\x00\x00" + b"\x00" * 20
    r = client.post("/api/detect/image", files={"file": ("a.png", bomb, "image/png")})
    assert r.status_code == 422 and "too large" in r.json()["detail"]


def test_ids_are_not_paths_and_errors_do_not_leak_internals(client):
    for bad in ["../etc/passwd", "..%2f..%2fetc", "a" * 32, "0" * 32, "x"]:
        r = client.get(f"/api/jobs/{bad}")
        assert r.status_code == 404
        assert "/tmp" not in r.text and "Traceback" not in r.text
    assert client.get("/api/samples/..%2fmanifest/video").status_code in (404, 422)


def test_size_and_duration_limits(small_client):
    big = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 1_500_000
    r = small_client.post("/api/detect/video", files={"file": ("big.mp4", big, "video/mp4")})
    assert r.status_code == 413
    r = small_client.post("/api/detect/video", data={"sample_id": "highway-dashcam"})  # 20 s > 5 s limit
    assert r.status_code == 422 and "trim" in r.json()["detail"]


def test_busy_service_rejects_instead_of_overloading(tmp_path):
    with make_client(tmp_path, max_concurrent_jobs=1, max_queued_jobs=0) as c:
        r1 = c.post("/api/detect/video", data={"sample_id": "highway-dashcam", "stride": "5"})
        assert r1.status_code == 202
        r2 = c.post("/api/detect/video", data={"sample_id": "highway-dashcam", "stride": "5"})
        assert r2.status_code == 503 and "busy" in r2.json()["detail"]
        c.post(f"/api/jobs/{r1.json()['job_id']}/stop")
        wait_job(c, r1.json()["job_id"])
