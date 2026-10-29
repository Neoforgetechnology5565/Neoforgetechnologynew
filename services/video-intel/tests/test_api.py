"""End-to-end tests on real files: the pedestrian clip (real footage) and the two composite clips whose ground truth is known."""
import io

import cv2
import numpy as np
import pytest

from tests.conftest import FIXTURES, SAMPLES, run_file, run_sample, truth, up

ROI = [[200, 180], [520, 180], [520, 520], [200, 520]]


@pytest.fixture(scope="module")
def ped(client):
    return run_sample(client, "pedestrians-opencv-vtest", mode="restaurant", sample_fps=5, start_s=0, end_s=30)


@pytest.fixture(scope="module")
def tt(client):
    return run_file(client, FIXTURES / "table-tennis-composite.mp4", mode="tabletennis", sample_fps=30, ball=True, ball_kind="white")


@pytest.fixture(scope="module")
def bb(client):
    return run_file(client, FIXTURES / "basketball-composite.mp4", mode="basketball", sample_fps=15, ball=True, ball_kind="orange")


def test_health_samples_and_models_are_described_honestly(client):
    h = client.get("/api/health").json()
    assert h["ok"] and "YOLOX" in h["models"]["detector"]["name"] and "no appearance" in h["models"]["tracker"]["note"] and "never interpolated" in h["models"]["ball"]["note"]
    assert "does not recognise faces" in h["notice"]
    ids = {x["id"] for x in client.get("/api/samples").json()["samples"]}
    assert ids == {"pedestrians-opencv-vtest"}  # no composite clips are shipped as samples
    for x in client.get("/api/samples").json()["samples"]:
        assert x["licence"] and x["source"] and x["does_not_demonstrate"]
    lm = client.get("/api/court-landmarks").json()
    assert lm["court_m"] == [28.0, 15.0] and any(x["x_m"] == 14.0 for x in lm["landmarks"])


def test_uploads_are_validated_by_content(client):
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    assert client.post("/api/videos", files=up("x.mp4", png)).status_code == 415
    assert client.post("/api/videos", files=up("x.mp4", b"")).status_code == 400
    assert client.post("/api/videos", files=up("x.mp4", b"hello world, not a video at all............")).status_code == 415
    assert client.post("/api/videos", files=up("x.mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * 200)).status_code == 422  # right container marker, undecodable
    big = b"\x1a\x45\xdf\xa3" + b"0" * 6_000_000
    assert client.post("/api/videos", files=up("big.webm", big)).status_code == 413
    assert client.post("/api/videos", data={"sample_id": "nope"}).status_code == 404
    assert client.post("/api/videos", data={"sample_id": "../../etc/passwd"}).status_code == 404
    assert client.post("/api/videos").status_code == 400
    assert client.get("/api/videos/" + "0" * 32).status_code == 404 and client.get("/api/videos/../x").status_code in (404, 405)


def test_results_are_refused_before_analysis_and_parameters_are_validated(client):
    vid = client.post("/api/videos", data={"sample_id": "pedestrians-opencv-vtest"}).json()["video_id"]
    assert client.get(f"/api/videos/{vid}/observations").status_code == 409
    assert client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI}).status_code == 409
    assert client.post(f"/api/videos/{vid}/jobs", json={"mode": "karate"}).status_code == 400
    assert client.post(f"/api/videos/{vid}/jobs", json={"sample_fps": 500}).status_code == 400
    assert client.post(f"/api/videos/{vid}/jobs", json={"start_s": 10, "end_s": 5}).status_code == 400
    assert client.post(f"/api/videos/{vid}/jobs", json={"ball_kind": "purple"}).status_code == 400
    assert client.delete(f"/api/videos/{vid}").json() == {"deleted": True}
    assert client.get(f"/api/videos/{vid}").status_code == 404


def test_restaurant_pipeline_on_real_footage_tracks_people_and_reports_events(client, ped):
    vid, st = ped
    assert st["summary"]["tracks"] >= 4 and st["summary"]["person_observations"] > 200 and st["summary"]["ball_points"] == 0
    obs = client.get(f"/api/videos/{vid}/observations").json()
    assert len(obs["frames"]) == st["summary"]["analysed_frames"] and obs["width"] == 768 and obs["ball_points"] == []
    r = client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI, "min_stay_s": 3, "merge_gap_s": 2, "min_observations": 2}).json()
    assert r["summary"]["events"] >= 1
    for e in r["events"]:
        assert 0 <= e["entry_t"] <= e["exit_t"] <= 30.5 and e["duration_s"] == pytest.approx(e["exit_t"] - e["entry_t"], abs=0.011)
        assert e["complete"] == (e["entry_observed"] and e["exit_observed"])
        if e["flag"]:
            assert e["duration_s"] >= 3 and e["flag"] == "Potential Extended Area Presence"
    # stricter threshold flags no more events than a lenient one
    strict = client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI, "min_stay_s": 25, "merge_gap_s": 2, "min_observations": 2}).json()
    assert strict["summary"]["flagged"] <= r["summary"]["flagged"]
    # an area nobody enters has no events
    empty = client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": [[0, 0], [20, 0], [20, 20], [0, 20]]}).json()
    assert empty["events"] == []
    assert client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": [[0, 0], [5, 5]]}).status_code == 422
    assert client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI, "min_stay_s": -1}).status_code == 400


def test_restaurant_attendance_comparison_with_manual_links(client, ped):
    vid, _ = ped
    base = client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI, "min_stay_s": 3, "min_observations": 2}).json()
    tid = base["events"][0]["track_id"]
    emp = [{"id": "e1", "name": "Alex Demo", "role": "Server", "shift_start": "12:00", "shift_end": "12:20"}, {"id": "e2", "name": "Sam Demo", "role": "Cook", "shift_start": "12:00", "shift_end": "12:20"}]
    r = client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI, "min_stay_s": 3, "min_observations": 2, "employees": emp, "links": {str(tid): "e1"}, "clock_start": "12:00:00"}).json()
    rows = {x["employee_id"]: x for x in r["attendance"]["rows"]}
    assert rows["e1"]["linked_tracks"] == [tid] and rows["e1"]["status"] != "Insufficient Data" or "incomplete" in rows["e1"]["explanation"]
    assert rows["e2"]["status"] == "Insufficient Data"  # nobody linked: no comparison is made
    assert client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI, "employees": "x"}).status_code == 400
    assert client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI, "employees": emp, "clock_start": "noon"}).status_code == 422


def test_evidence_clip_is_a_real_video_cut_from_the_source(client, ped):
    vid, _ = ped
    e = client.post(f"/api/videos/{vid}/analyze/restaurant", json={"roi": ROI, "min_stay_s": 3, "min_observations": 2}).json()["events"][0]
    r = client.post(f"/api/videos/{vid}/clip", json={"t0": e["entry_t"], "t1": min(e["exit_t"], e["entry_t"] + 4), "track_ids": [e["track_id"]], "roi": ROI, "pad_s": 1})
    assert r.status_code == 200, r.text
    c = client.get(r.json()["url"])
    assert c.status_code == 200 and c.headers["content-type"] == "video/mp4" and len(c.content) > 5000
    w = client.get(r.json()["url_webm"])
    assert w.status_code == 200 and w.headers["content-type"] == "video/webm" and w.content[:4] == b"\x1a\x45\xdf\xa3"  # a WebM too, for browsers without H.264
    path = client.app.state.jobs.get(vid).clips[r.json()["clip_id"]][0]
    cap = cv2.VideoCapture(str(path))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ok, fr = cap.read()
    assert ok and n >= 10 and fr.shape[1] <= 960
    assert abs(n / cap.get(cv2.CAP_PROP_FPS) - (r.json()["t1"] - r.json()["t0"])) < 1.0
    again = client.post(f"/api/videos/{vid}/clip", json={"t0": e["entry_t"], "t1": min(e["exit_t"], e["entry_t"] + 4), "track_ids": [e["track_id"]], "roi": ROI, "pad_s": 1}).json()
    assert again["clip_id"] == r.json()["clip_id"]  # cached, not regenerated
    assert client.post(f"/api/videos/{vid}/clip", json={"t0": 5, "t1": 3}).status_code == 400
    assert client.post(f"/api/videos/{vid}/clip", json={"t0": 0, "t1": 100}).status_code == 422
    assert client.get(f"/api/videos/{vid}/clips/{'0' * 12}").status_code == 404 and client.get(f"/api/videos/{vid}/clips/..%2Fx").status_code in (404, 422)


def test_playback_copy_and_frame_endpoint(client, ped):
    vid, _ = ped
    import time
    for _ in range(60):
        if client.get(f"/api/videos/{vid}").json()["playback"] != "pending":
            break
        time.sleep(0.5)
    assert client.get(f"/api/videos/{vid}").json()["playback"] == "ready"
    assert client.get(f"/api/videos/{vid}/playback").headers["content-type"] == "video/mp4"
    assert client.get(f"/api/videos/{vid}/playback?format=webm").headers["content-type"] == "video/webm"
    assert client.get(f"/api/videos/{vid}/playback?format=avi").status_code == 422
    assert set(client.get(f"/api/videos/{vid}").json()["playback_formats"]) == {"mp4", "webm"}
    f = client.get(f"/api/videos/{vid}/frame?t=3&w=400")
    img = cv2.imdecode(np.frombuffer(f.content, np.uint8), cv2.IMREAD_COLOR)
    assert f.status_code == 200 and img.shape[1] == 400
    assert client.get(f"/api/videos/{vid}/frame?t=9999").status_code == 404


def test_table_tennis_ball_tracking_against_ground_truth(client, tt):
    vid, st = tt
    gt = {round(b["t"], 2): b for b in truth("table-tennis-composite")["ball"]}
    pts = client.get(f"/api/videos/{vid}/observations").json()["ball_points"]
    err, matched = [], 0
    for p in pts:
        g = gt.get(round(p["t"], 2))
        if g and np.hypot(g["x_px"] - p["x"], g["y_px"] - p["y"]) < 12:
            matched += 1
            err.append(np.hypot(g["x_px"] - p["x"], g["y_px"] - p["y"]))
    recall, precision = matched / len(gt), matched / len(pts)
    assert recall >= 0.75, f"recall {recall:.2f}"
    assert precision >= 0.80, f"precision {precision:.2f}"
    assert float(np.median(err)) < 5
    assert st["summary"]["tracks"] <= 4  # two people stay as few tracks (ByteTrack, no appearance model)


def test_table_tennis_calibration_segments_and_honest_limits(client, tt):
    vid, _ = tt
    t = truth("table-tennis-composite")
    corners = t["table_corners_px_left_near_right_near_right_far_left_far"]
    r = client.post(f"/api/videos/{vid}/analyze/tabletennis", json={"corners": corners, "gap_s": 0.5, "min_len_s": 1.0}).json()
    assert r["calibration"]["rms_error_m"] < 0.01 and "warning" not in r["calibration"]
    truth_r = t["rallies"]
    assert len(r["segments"]) >= 2
    for s in r["segments"]:  # every detected segment lies inside a true rally (no segment is invented in the pauses between rallies)
        assert any(tr["start_t"] - 0.6 <= s["start_t"] and s["end_t"] <= tr["end_t"] + 0.6 for tr in truth_r), s
        assert s["label"].startswith("Ball-visible segment") and "experimental" in s["label"]
    assert 40 <= r["ball"]["visibility_pct"] <= 100 and "gaps, not estimates" in r["ball"]["note"]
    # table-plane position of a detected ball matches the truth for balls near the table surface
    gt = {round(b["t"], 2): b for b in t["ball"]}
    near = [(p, gt[round(p["t"], 2)]) for p in r["table_plane_points"] if round(p["t"], 2) in gt and gt[round(p["t"], 2)]["height_m"] < 0.03]
    assert near and np.median([np.hypot(p["x_m"] - g["table_x_m"], p["y_m"] - g["table_y_m"]) for p, g in near]) < 0.1
    # a mis-ordered click sequence is flagged
    bad = client.post(f"/api/videos/{vid}/analyze/tabletennis", json={"corners": [corners[0], corners[2], corners[1], corners[3]]})
    assert bad.status_code == 422 and "order" in bad.json()["detail"]  # two corners swapped: four points always fit exactly, so the fold is what gives it away
    assert client.post(f"/api/videos/{vid}/analyze/tabletennis", json={"corners": corners[:3]}).status_code == 400
    assert client.post(f"/api/videos/{vid}/analyze/tabletennis", json={"corners": [[1, 1]] * 4}).status_code == 422


def test_basketball_ball_tracking_court_mapping_and_possession(client, bb):
    vid, _ = bb
    t = truth("basketball-composite")
    gt = {round(b["t"], 2): b for b in t["ball"]}
    pts = client.get(f"/api/videos/{vid}/observations").json()["ball_points"]
    ok = [p for p in pts if (g := gt.get(round(p["t"], 2)) or gt.get(round(p["t"] + 0.01, 2)) or gt.get(round(p["t"] - 0.01, 2))) and np.hypot(g["x_px"] - p["x"], g["y_px"] - p["y"]) < 10]
    assert len(ok) / len(pts) >= 0.9 and len(pts) >= 200
    corners = t["court_corners_px_in_world_order_(0,0)_(28,0)_(28,15)_(0,15)"]
    refs = [{"image": c, "world": w} for c, w in zip(corners, [[0, 0], [28, 0], [28, 15], [0, 15]])]
    # the camera sees only the right half-court; add two more exactly known points to the four corners: the halfway line ends
    r = client.post(f"/api/videos/{vid}/analyze/basketball", json={"references": refs, "cell_m": 1.0, "min_possession_s": 0.5}).json()
    assert r["calibration"]["rms_error_m"] < 0.05
    assert r["heatmap"]["cols"] == 28 and r["heatmap"]["rows"] == 15
    hm = np.array(r["heatmap"]["seconds"])
    assert hm.sum() > 20 and hm[:, :14].sum() < 0.05 * hm.sum()  # players only play in the right half in this clip
    assert r["possession"] and all(p["label"] == "Potential Possession Event" for p in r["possession"])
    assert "not a rules-aware" in r["possession_note"] or "geometric rule" in r["possession_note"]
    # possession intervals overlap the true holding intervals (the ball is held 0.5-4, 4.7-9, 9.7-14, 14.7-19.5 s)
    held = [(0.5, 4.0), (4.7, 9.0), (9.7, 14.0), (14.7, 19.5)]
    covered = sum(1 for p in r["possession"] if any(a - 0.5 <= p["start_t"] and p["end_t"] <= b + 0.5 for a, b in held))
    assert covered >= max(1, int(0.7 * len(r["possession"])))
    assert client.post(f"/api/videos/{vid}/analyze/basketball", json={"references": refs[:3]}).status_code == 400
    bad = client.post(f"/api/videos/{vid}/analyze/basketball", json={"references": [{"image": [1, 1], "world": [0, 0]}] * 4})
    assert bad.status_code == 422
    sel = client.post(f"/api/videos/{vid}/analyze/basketball", json={"references": refs, "track_ids": [987654]}).json()
    assert sel["players"] == [] and np.array(sel["heatmap"]["seconds"]).sum() == 0


def test_pdf_report_is_a_valid_pdf(client):
    r = client.post("/api/report/pdf", json={"title": "Area presence report", "subtitle": "Demo data", "sections": [{"heading": "Summary", "text": "3 events", "lines": ["a", "b"], "rows": [["Track", "Entry"], ["1", "2.0 s"]]}], "footer": "Fictional"})
    assert r.status_code == 200 and r.content[:5] == b"%PDF-" and len(r.content) > 1500
    assert client.post("/api/report/pdf", json={"title": "x", "sections": []}).status_code == 400
    assert client.post("/api/report/pdf", json={"title": "x", "sections": [{"text": "no heading"}]}).status_code == 400


def test_rate_limit(tmp_path):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import create_app
    with TestClient(create_app(Settings(work_dir=tmp_path, samples_dir=SAMPLES, rate_per_minute=3))) as c:
        codes = [c.get("/api/health").status_code for _ in range(5)]
    assert codes[:3] == [200] * 3 and codes[3:] == [429, 429]
