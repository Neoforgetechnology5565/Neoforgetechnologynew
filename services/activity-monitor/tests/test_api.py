import io
import time

import pytest

from app.jobs import Alert
from app.activity import Candidate, Evidence

SAMPLE = "pedestrians-opencv-vtest"


def up(client, data: bytes, name="v.mp4"):
    return client.post("/api/videos/upload", files={"file": (name, io.BytesIO(data), "video/mp4")})


def wait(client, vid, states=("completed", "failed", "cancelled"), timeout=120):
    t = time.time()
    while time.time() - t < timeout:
        st = client.get(f"/api/videos/{vid}/status").json()
        assert "status" in st, st
        if st["status"] in states:
            return st
        time.sleep(0.5)
    raise AssertionError("timeout")


def test_health_and_samples(client):
    h = client.get("/api/health").json()
    assert h["ok"] and "not an emergency" in h["notice"] and h["models"]["pose"]["licence"].startswith("Apache")
    s = client.get("/api/samples").json()["samples"]
    assert s and s[0]["id"] == SAMPLE and "does_not_demonstrate" in s[0]
    assert client.get(f"/api/samples/{SAMPLE}/video").status_code == 200
    assert client.get("/api/samples/..%2F..%2Fetc/video").status_code == 404
    assert client.get("/api/samples/unknown/video").status_code == 404


@pytest.mark.parametrize("data,code", [(b"", 400), (b"hello world, not a video at all" * 10, 415), (b"\xff\xd8\xff\xe0" + b"0" * 64, 415), (b"\x89PNG\r\n\x1a\n" + b"0" * 64, 415)])
def test_upload_validation(client, data, code):
    assert up(client, data).status_code == code


def test_truncated_video_is_rejected_cleanly(client, video):
    r = up(client, video.read_bytes()[:600])
    assert r.status_code == 422 and "work" not in r.text and "/tmp" not in r.text


def test_oversize_rejected(client):
    r = up(client, b"\x00\x00\x00\x18ftypmp42" + b"0" * (21 * 1_000_000))
    assert r.status_code == 413


def test_needs_exactly_one_source(client, video):
    assert client.post("/api/videos/upload").status_code == 400
    r = client.post("/api/videos/upload", data={"sample_id": SAMPLE}, files={"file": ("v.mp4", video.read_bytes(), "video/mp4")})
    assert r.status_code == 400
    assert client.post("/api/videos/upload", data={"sample_id": "nope"}).status_code == 404


def test_ids_are_validated(client):
    for p in ("/api/videos/abc/status", "/api/videos/" + "0" * 32 + "/status", "/api/videos/..%2F..%2Fx/status"):
        assert client.get(p).status_code == 404
    assert client.post("/api/alerts/../../x/review", json={"status": "dismissed"}).status_code in (404, 405)
    assert client.post("/api/alerts/" + "0" * 32 + "-1/review", json={"status": "dismissed"}).status_code == 404
    assert client.post("/api/alerts/notanid/review", json={"status": "dismissed"}).status_code == 404


def test_process_validation_and_results_gating(client, video):
    vid = up(client, video.read_bytes()).json()["video_id"]
    assert client.get(f"/api/videos/{vid}/summary").status_code == 409     # nothing before processing
    assert client.get(f"/api/videos/{vid}/alerts").status_code == 409
    for body in ({"sample_fps": 0}, {"sample_fps": "x"}, {"det_threshold": 2}, {"start_s": 5, "end_s": 1}, {"start_s": 1000}, {"fall": {"min_lying_s": -1}}, {"aggression": {"min_arm_speed": True}}, {"fall": "no"}):
        assert client.post(f"/api/videos/{vid}/process", json=body).status_code == 400, body
    assert client.post(f"/api/videos/{vid}/process", json=[1]).status_code in (400, 422)


def test_video_without_people_completes_with_no_alerts(client, video):
    """The synthetic clip has no people: the service must report that, not invent any."""
    v = up(client, video.read_bytes()).json()
    assert v["video"]["width"] == 320 and v["notice"]
    assert client.post(f"/api/videos/{v['video_id']}/process", json={"sample_fps": 5}).status_code == 202
    st = wait(client, v["video_id"])
    assert st["status"] == "completed" and st["alert_count"] == 0
    s = client.get(f"/api/videos/{v['video_id']}/summary").json()
    assert s["counts"]["person_observations"] == 0 and s["counts"]["tracks"] == 0 and s["counts"]["alerts"] == 0
    assert any("No people" in w for w in s["warnings"])
    assert client.get(f"/api/videos/{v['video_id']}/alerts").json()["alerts"] == []
    f = client.get(f"/api/videos/{v['video_id']}/frames").json()
    assert f["frames"] and all(x["persons"] == [] for x in f["frames"])
    assert client.get(f"/api/videos/{v['video_id']}/export?kind=alerts.csv").text.startswith("alert_id,kind")
    assert client.get(f"/api/videos/{v['video_id']}/export?kind=nope").status_code == 422
    a = client.get(f"/api/videos/{v['video_id']}/annotated")
    assert a.status_code == 200 and a.headers["content-type"] == "video/mp4" and len(a.content) > 500
    assert client.get(f"/api/videos/{v['video_id']}/annotated?alert={v['video_id']}-1").status_code == 404
    assert client.delete(f"/api/videos/{v['video_id']}").json()["deleted"]
    assert client.get(f"/api/videos/{v['video_id']}/status").status_code == 404


def test_limits_are_enforced(client, video):
    vid = up(client, video.read_bytes()).json()["video_id"]
    r = client.post("/api/videos/upload", data={"sample_id": SAMPLE}).json()["video_id"]
    assert client.post(f"/api/videos/{r}/process", json={"sample_fps": 12}).status_code == 422   # 79.5 s x 12 fps exceeds the frame limit
    assert client.post(f"/api/videos/{r}/process", json={"sample_fps": 5, "start_s": 0, "end_s": 200}).status_code in (202, 422)
    client.post(f"/api/videos/{r}/cancel")


def test_cancel(client, video):
    v = up(client, video.read_bytes()).json()["video_id"]
    client.post(f"/api/videos/{v}/process", json={})
    client.post(f"/api/videos/{v}/cancel")
    st = wait(client, v)
    assert st["status"] in ("cancelled", "completed")


def test_review_endpoint_records_decisions(client, video):
    """White-box: an alert object is placed in a finished job to exercise the review API. (Alerts shown to users only ever come from the pipeline.)"""
    vid = up(client, video.read_bytes()).json()["video_id"]
    client.post(f"/api/videos/{vid}/process", json={})
    wait(client, vid)
    mgr = client.app.state.jobs
    v = mgr.videos[vid]
    v.alerts = [Alert(f"{vid}-1", Candidate("fall", [1], 1.0, 2.0, 1.5, [Evidence("x", 1, ">= 0", True)]))]
    a = client.get(f"/api/videos/{vid}/alerts").json()["alerts"]
    assert len(a) == 1 and a[0]["status"] == "pending" and a[0]["title"].startswith("Possible fall")
    r = client.post(f"/api/alerts/{vid}-1/review", json={"status": "dismissed", "note": "  nurse walking to bed  "})
    assert r.status_code == 200 and r.json()["status"] == "dismissed" and r.json()["note"] == "nurse walking to bed" and r.json()["reviewed_at"]
    assert client.get(f"/api/videos/{vid}/alerts?status=dismissed").json()["alerts"][0]["id"] == f"{vid}-1"
    assert client.get(f"/api/videos/{vid}/alerts?status=pending").json()["alerts"] == []
    assert client.post(f"/api/alerts/{vid}-1/review", json={"status": "bogus"}).status_code == 400
    assert client.post(f"/api/alerts/{vid}-1/review", json={"status": "confirmed", "note": 5}).status_code == 400
    assert client.post(f"/api/alerts/{vid}-9/review", json={"status": "confirmed"}).status_code == 404
    assert client.post(f"/api/alerts/{vid}-1/review", json={"status": "pending"}).json()["reviewed_at"] is None
    client.post(f"/api/alerts/{vid}-1/review", json={"status": "uncertain"})
    assert client.post(f"/api/videos/{vid}/reanalyse", json={}).status_code == 409     # would discard a review
    assert client.post(f"/api/videos/{vid}/reanalyse", json={"discard_reviews": True}).status_code == 200
    assert client.get(f"/api/videos/{vid}/alerts").json()["alerts"] == []


@pytest.mark.slow
def test_real_sample_end_to_end(client):
    v = client.post("/api/videos/upload", data={"sample_id": SAMPLE}).json()
    assert client.post(f"/api/videos/{v['video_id']}/process", json={"sample_fps": 5}).status_code == 202
    st = wait(client, v["video_id"], timeout=600)
    assert st["status"] == "completed"
    s = client.get(f"/api/videos/{v['video_id']}/summary").json()
    assert s["counts"]["analysed_frames"] > 350 and s["counts"]["person_observations"] > 1500 and s["counts"]["tracks_with_pose"] >= 5
    assert s["counts"]["alerts_by_kind"].get("fall", 0) == 0      # nobody falls in this clip
    assert s["counts"]["alerts"] <= 1                              # default thresholds: at most a stray false alarm on walking
