"""PropertyVision AI (demo 25): the real CLIP and YOLOX models on real sample photographs, through the real HTTP API."""
import base64

import numpy as np
import pytest

from app import property as P
from conftest import post, up, SAMPLES

pytestmark = pytest.mark.skipif(not (SAMPLES.parent.parent.parent / "services/ml-lab/models/clip_vit_b32_visual.onnx").is_file(), reason="CLIP weights not downloaded: run scripts/fetch_clip.py")
KEY = {"commercial": "commercial_building", "house": "residential_house", "land": "vacant_land", "mobile": "mobile_home"}


def test_health_reports_clip(client):
    h = client.get("/api/health").json()
    assert h["available"]["property_clip"] is True and h["available"]["detector"] is True


def test_samples_are_listed_with_licences(client):
    items = client.get("/api/samples?kind=property").json()["samples"]
    assert len(items) >= 5 and all(i["licence"] and i["provenance"] for i in items)


@pytest.mark.parametrize("sample,expected", [("opencv-building", "commercial_building"), ("spacenet-vegas-subdivision", "residential_house"), ("spacenet-vegas-waterfront", "residential_house")])
def test_clip_classifies_real_photos(client, sample, expected):
    r = post(client, "/api/property/classify", sample=sample)
    assert r.status_code == 200, r.text
    c = r.json()["classification"]
    assert c["label"] == expected, c["scores"]
    assert abs(sum(s["probability"] for s in c["scores"]) - 1) < 1e-4 and len(c["scores"]) == 4 and c["probability"] > 0.5


def test_clip_scores_depend_on_the_image(client):
    a = post(client, "/api/property/classify", sample="opencv-building").json()["classification"]["scores"]
    b = post(client, "/api/property/classify", sample="spacenet-vegas-desert-edge").json()["classification"]["scores"]
    assert [x["probability"] for x in a] != [x["probability"] for x in b]


def test_yolo_detects_objects_with_boxes_and_scores(client):
    r = post(client, "/api/property/detect", sample="opencv-building", threshold=0.35).json()
    labels = {d["label"] for d in r["detections"]}
    assert "car" in labels and "potted plant" in labels, labels
    for d in r["detections"]:
        x1, y1, x2, y2 = d["box"]; assert 0 <= x1 < x2 <= r["width"] + 1 and 0 <= y1 < y2 <= r["height"] + 1 and 0.35 <= d["score"] <= 1
    img = base64.b64decode(r["annotated"].split(",", 1)[1]); assert img[:2] == b"\xff\xd8" and len(img) > 5000
    assert "tree" not in labels and "trees" not in r["note"].lower().replace("no trees", "")  # COCO has no tree class and the note says so


def test_threshold_changes_detections(client):
    lo = post(client, "/api/property/detect", sample="spacenet-vegas-waterfront", threshold=0.1).json()["detections"]
    hi = post(client, "/api/property/detect", sample="spacenet-vegas-waterfront", threshold=0.8).json()["detections"]
    assert len(lo) > len(hi)
    assert post(client, "/api/property/detect", sample="opencv-building", threshold=0.01).status_code == 400


def test_analyze_runs_all_three_modules_and_the_score_uses_their_outputs(client):
    r = post(client, "/api/property/analyze", sample="opencv-building").json()
    assert r["classification"]["label"] == "commercial_building" and r["detection"]["detections"] and 0 <= r["score"]["value"] <= 100
    kinds = {f["key"]: f for f in r["score"]["factors"]}
    n_veh = sum(1 for d in r["detection"]["detections"] if d["label"] in P.VEHICLES)
    assert ("vehicles" in kinds) == bool(n_veh)
    assert kinds["vehicles"]["observed"].startswith(f"{n_veh} vehicle") and kinds["vehicles"]["kind"] == "assumption"
    assert set(r["seconds"]) == {"classification", "detection", "scoring", "total"} and r["seconds"]["total"] > 0
    assert "does not prove" in r["score"]["disclaimer"] and r["score"]["cannot_see"]


def test_upload_works_and_bad_input_is_rejected(client):
    data = (SAMPLES / "property" / "opencv-building.jpg").read_bytes()
    r = post(client, "/api/property/analyze", files=up("mine.jpg", data, "image/jpeg"))
    assert r.status_code == 200 and r.json()["filename"] == "mine.jpg"
    assert post(client, "/api/property/analyze", files=up("x.jpg", b"not an image")).status_code in (400, 415, 422)
    assert post(client, "/api/property/analyze").status_code == 400
    assert post(client, "/api/property/analyze", sample="nope").status_code == 404


# ---- scoring engine on its own: every rule, with controlled inputs -----------------------------------------------------------
def cls(label="residential_house", p=0.9, margin=0.8):
    return {"label": label, "probability": p, "margin": margin, "scores": []}


def det(label, score=0.9, idx=2):
    return {"label": label, "score": score, "class_index": idx, "box": [0, 0, 10, 10]}


M = {"green_percent": 20.0, "sharpness": 300.0, "brightness": 120.0}


def test_neutral_when_nothing_is_found():
    s = P.score_property(cls(), [], M)
    assert s["value"] == P.BASELINE and "very little" in s["explanation"][0] and s["evidence_strength"] == "Medium"


def test_vehicles_raise_with_a_cap_and_are_labelled_assumption():
    s = P.score_property(cls(), [det("car")] * 2, M); assert s["value"] == 66
    assert P.score_property(cls(), [det("car")] * 9, M)["value"] == 69
    assert next(f for f in s["factors"] if f["key"] == "vehicles")["kind"] == "assumption"


def test_vacant_land_ignores_vehicles_and_vegetation():
    s = P.score_property(cls("vacant_land"), [det("car")], {**M, "green_percent": 90.0})
    assert s["value"] == P.BASELINE and all(f["points"] == 0 for f in s["factors"])


def test_household_items_need_confidence_and_are_assumptions():
    assert P.score_property(cls(), [det("couch", 0.4)], M)["value"] == P.BASELINE
    s = P.score_property(cls(), [det("couch", 0.8), det("tv", 0.7)], M); assert s["value"] == 52
    f = next(f for f in s["factors"] if f["key"] == "household"); assert f["kind"] == "assumption" and "cannot tell" in f["meaning"]


def test_green_cover_is_observed_unless_extreme():
    assert next(f for f in P.score_property(cls(), [], M)["factors"] if f["key"] == "green")["kind"] == "observed"
    s = P.score_property(cls(), [], {**M, "green_percent": 80.0}); assert s["value"] == 54 and next(f for f in s["factors"] if f["key"] == "green")["kind"] == "assumption"


def test_evidence_strength_drops_with_poor_input_and_the_score_is_bounded():
    s = P.score_property(cls(p=0.3, margin=0.05), [], {**M, "sharpness": 10.0, "brightness": 20.0})
    assert s["evidence_strength"] == "Low" and len(s["evidence_notes"]) >= 3
    big = P.score_property(cls(), [det("couch", 0.9)] * 20, M); assert 0 <= big["value"] <= 100


def test_measurements_react_to_the_pixels():
    import cv2
    green = np.zeros((200, 200, 3), np.uint8); green[..., 1] = 180
    grey = np.full((200, 200, 3), 128, np.uint8)
    assert P.measurements(green)["green_percent"] > 95 and P.measurements(grey)["green_percent"] < 1
    noisy = (np.random.default_rng(0).random((200, 200, 3)) * 255).astype(np.uint8)
    assert P.measurements(noisy)["sharpness"] > P.measurements(cv2.GaussianBlur(noisy, (0, 0), 6))["sharpness"] * 10
