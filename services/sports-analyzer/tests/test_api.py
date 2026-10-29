import io
import json
import os
import time
from pathlib import Path

import pytest

from conftest import synthetic_video

CAL = {"time": 1.0, "points": [{"id": "corner_tl", "x": 60, "y": 40}, {"id": "corner_tr", "x": 580, "y": 50}, {"id": "pen_l_top", "x": 130, "y": 100}, {"id": "pen_l_bottom", "x": 120, "y": 260},
                               {"id": "centre_spot", "x": 320, "y": 180}, {"id": "spot_r", "x": 480, "y": 180}]}


def wait(client, jid, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/api/sports/jobs/{jid}").json()
        if j["status"] in ("completed", "failed", "cancelled"):
            return j
        time.sleep(0.2)
    raise AssertionError("job did not finish")


def post(client, video, params=None, name="clip.mp4"):
    return client.post("/api/sports/analyze", files={"file": (name, open(video, "rb"), "video/mp4")}, data={"params": json.dumps(params or {})})


def test_health_reports_real_model_and_limits(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["detector"] == "footandball" and h["tracker"] == "ByteTrack" and h["limits"]["max_video_mb"] == 20
    assert h["model"]["code_licence"] == "MIT"


def test_pitch_model_endpoint(client):
    d = client.get("/api/sports/pitch?length=100&width=64").json()
    assert d["length_m"] == 100 and any(l["id"] == "centre_spot" and l["x"] == 50 for l in d["landmarks"])
    assert client.get("/api/sports/pitch?length=5").status_code == 422


def test_samples_empty_without_manifest_and_path_traversal_blocked(client):
    assert client.get("/api/sports/samples").json() == {"samples": []}
    assert client.get("/api/sports/samples/..%2F..%2Fetc%2Fpasswd/video").status_code in (404, 422)
    assert client.post("/api/sports/analyze", data={"sample_id": "../x"}).status_code == 404


@pytest.mark.parametrize("params,msg", [({"sport": "tennis"}, "Only football"), ({"sample_fps": 99}, "sample_fps"), ({"player_conf": "high"}, "number"), ({"end_s": 1, "start_s": 5}, "greater"),
                                          ({"team_mode": "colors"}, "team_colors"), ({"team_mode": "zzz"}, "team_mode")])
def test_parameter_validation(client, video, params, msg):
    r = post(client, video, params)
    assert r.status_code == 400 and msg in r.json()["detail"]


def test_bad_params_json(client, video):
    r = client.post("/api/sports/analyze", files={"file": ("a.mp4", open(video, "rb"), "video/mp4")}, data={"params": "{not json"})
    assert r.status_code == 400


def test_upload_validation(client, tmp_path, video):
    assert client.post("/api/sports/analyze").status_code == 400  # neither file nor sample
    assert client.post("/api/sports/analyze", files={"file": ("a.mp4", b"", "video/mp4")}).status_code == 400
    assert client.post("/api/sports/analyze", files={"file": ("a.mp4", b"not a video at all, just text" * 10, "video/mp4")}).status_code == 415
    png = b"\x89PNG\r\n\x1a\n" + b"\0" * 100
    assert client.post("/api/sports/analyze", files={"file": ("a.mp4", png, "video/mp4")}).status_code == 415  # the bytes decide, not the name
    broken = tmp_path / "broken.mp4"
    broken.write_bytes(Path(video).read_bytes()[:120] + b"\0" * 500)  # valid ftyp header, damaged body
    r = client.post("/api/sports/analyze", files={"file": ("a.mp4", open(broken, "rb"), "video/mp4")})
    assert r.status_code == 422 and ("could not" in r.json()["detail"].lower() or "no frame" in r.json()["detail"].lower())
    big = io.BytesIO(b"\x00\x00\x00\x18ftypmp42" + b"\0" * (21 * 1_000_000))
    assert client.post("/api/sports/analyze", files={"file": ("big.mp4", big, "video/mp4")}).status_code == 413


def test_window_longer_than_limit_is_rejected(client, tmp_path):
    long = synthetic_video(tmp_path / "long.mp4", seconds=40)
    r = post(client, long)
    assert r.status_code == 422 and "up to 30 s" in r.json()["detail"]
    assert post(client, long, {"start_s": 20, "end_s": 30}).status_code == 202


def test_full_job_on_real_video_is_honest_when_nothing_is_found(client, video):
    r = post(client, video, {"sample_fps": 5})
    assert r.status_code == 202
    j = wait(client, r.json()["job_id"])
    assert j["status"] == "completed", j
    res = client.get(f"/api/sports/jobs/{j['job_id']}/results").json()
    s = res["summary"]
    assert s["samples_analysed"] == 15 and s["source_frames_decoded"] > 60 and s["processing_fps"] > 0
    assert s["tracks_kept"] == len(res["tracks"]) and s["player_detections"] >= 0
    assert res["pitch_mapping"]["status"] == "unavailable" and "calibration" in res["pitch_mapping"]["reason"]
    assert all(row[7] is None and row[8] is None for f in res["frames"] for row in f["p"])  # no pitch positions without calibration
    assert res["methodology"]["tracking"].startswith("ByteTrack") and res["limitations"]
    assert client.get(f"/api/sports/jobs/{j['job_id']}/heatmap").status_code == 409  # no heatmap without a pitch mapping
    assert client.get(f"/api/sports/jobs/{j['job_id']}/export.csv?kind=stats").status_code == 200
    assert client.get(f"/api/sports/jobs/{j['job_id']}/export.csv?kind=zzz").status_code == 422


def test_calibration_flow_and_errors(client, video):
    jid = wait(client, post(client, video).json()["job_id"])["job_id"]
    u = f"/api/sports/jobs/{jid}"
    r = client.post(f"{u}/calibrate", json=CAL).json()
    assert r["pitch_mapping"]["status"] in ("available", "poor") and r["pitch_mapping"]["calibration"]["points_used"] == 6
    h = client.get(f"{u}/heatmap").json()
    assert h["rows"] == 34 and h["cols"] == 53 and h["observations"] == 0 and "not meaningful" in h["warning"]
    bad = lambda body: client.post(f"{u}/calibrate", json=body)
    assert "At least 4" in bad({"time": 1.0, "points": CAL["points"][:3]}).json()["pitch_mapping"]["reason"]
    assert "Unknown pitch landmark" in bad({"time": 1.0, "points": [{"id": "x", "x": 1, "y": 1}] * 4}).json()["pitch_mapping"]["reason"]
    assert "outside the video frame" in bad({"time": 1.0, "points": [{**p, "x": 9999} for p in CAL["points"]]}).json()["pitch_mapping"]["reason"]
    assert "outside the analysed" in bad({"time": 500.0, "points": CAL["points"]}).json()["pitch_mapping"]["reason"]
    assert "straight line" in bad({"time": 1.0, "points": [{"id": i, "x": 100 + 50 * k, "y": 100 + 20 * k} for k, i in enumerate(["corner_tl", "half_top", "corner_tr", "circle_top"])]}).json()["pitch_mapping"]["reason"]
    assert client.post(f"{u}/calibrate", json={"clear": True}).json()["pitch_mapping"]["status"] == "unavailable"


def test_frame_and_video_endpoints(client, video):
    jid = wait(client, post(client, video).json()["job_id"])["job_id"]
    f = client.get(f"/api/sports/jobs/{jid}/frame?time=1.0")
    assert f.status_code == 200 and f.headers["content-type"] == "image/jpeg" and f.content[:3] == b"\xff\xd8\xff" and f.headers["x-frame-index"] == "25"
    assert client.get(f"/api/sports/jobs/{jid}/frame?time=-1").status_code == 422
    v = client.get(f"/api/sports/jobs/{jid}/video?original=true", headers={"Range": "bytes=0-99"})
    assert v.status_code == 206 and len(v.content) == 100


def test_unknown_and_malformed_job_ids(client):
    for jid in ("0" * 32, "../../etc", "zz"):
        assert client.get(f"/api/sports/jobs/{jid}").status_code == 404
        assert client.delete(f"/api/sports/jobs/{jid}").status_code == 404


def test_cancel_and_delete(client, tmp_path):
    long = synthetic_video(tmp_path / "c.mp4", seconds=25)
    jid = post(client, long, {"sample_fps": 12}).json()["job_id"]
    time.sleep(0.5)
    assert client.post(f"/api/sports/jobs/{jid}/cancel").json()["cancel_requested"]
    j = wait(client, jid)
    assert j["status"] == "cancelled"
    assert client.get(f"/api/sports/jobs/{jid}/results").status_code == 409
    assert client.delete(f"/api/sports/jobs/{jid}").json() == {"deleted": True}
    assert client.get(f"/api/sports/jobs/{jid}").status_code == 404


def test_queue_limit_returns_503(client, tmp_path):
    long = synthetic_video(tmp_path / "q.mp4", seconds=25)
    codes = [post(client, long, {"sample_fps": 12}).status_code for _ in range(5)]
    assert 503 in codes and codes[0] == 202


def test_too_many_analysed_frames_fails_cleanly(tmp_path):
    from fastapi.testclient import TestClient
    from app.config import Settings
    from app.main import create_app
    s = Settings(work_dir=tmp_path / "w", samples_dir=tmp_path / "s", max_samples=10)
    v = synthetic_video(tmp_path / "v.mp4", seconds=5)
    with TestClient(create_app(s)) as c:
        j = wait(c, post(c, v, {"sample_fps": 5}).json()["job_id"])
        assert j["status"] == "failed" and "limit is 10" in j["error_detail"] and "/" not in (j["error"] or "")


@pytest.mark.slow
def test_real_football_footage_detects_players_and_ball(tmp_path):
    """Needs SPORTS_TEST_VIDEO: a real long-shot football clip. Asserts real detections, tracks and ball observations, then calibrates when SPORTS_TEST_CAL is given."""
    from fastapi.testclient import TestClient
    from app.config import Settings
    from app.main import create_app
    path = os.environ.get("SPORTS_TEST_VIDEO")
    if not path or not Path(path).is_file():
        pytest.skip("set SPORTS_TEST_VIDEO to a football clip")
    with TestClient(create_app(Settings(work_dir=tmp_path / "w", samples_dir=tmp_path / "s", max_video_mb=200))) as c:
        jid = wait(c, post(c, path, {"start_s": 15, "end_s": 30}, name="real.mp4").json()["job_id"], timeout=600)["job_id"]
        res = c.get(f"/api/sports/jobs/{jid}/results").json()
        s = res["summary"]
        assert s["samples_analysed"] == 75 and s["player_detections"] > 100 and s["tracks_kept"] >= 5
        assert s["ball"]["observed"] >= 1 and s["processing_fps"] > 0
        assert max(r["observations"] for r in res["tracks"]) >= 20
        cal = os.environ.get("SPORTS_TEST_CAL")
        if cal:
            r = c.post(f"/api/sports/jobs/{jid}/calibrate", json=json.loads(cal)).json()
            assert r["pitch_mapping"]["status"] in ("available", "poor")
            assert any(t["pitch"] and t["pitch"]["status"] == "ok" for t in r["tracks"])
            assert c.get(f"/api/sports/jobs/{jid}/heatmap").json()["observations"] > 30
