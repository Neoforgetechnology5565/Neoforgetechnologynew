import io
import json
import time
from pathlib import Path

import pytest

from conftest import build_custom_ref, defective, encode, good_part


def inspect(c, img, rid=None, rules=None, name="part.png", fmt=".png"):
    data = {"reference_id": rid or c.rid}
    if rules is not None:
        data["rules"] = json.dumps(rules)
    return c.post("/api/inspect", files={"file": (name, encode(img, fmt), "image/png")}, data=data)


def test_health_and_listing(client):
    h = client.get("/api/health").json()
    assert h["ok"] and "ResNet-50" in h["backbone"] and h["limitations"] and h["limits"]["max_image_mb"] == 2
    assert client.get("/api/references").status_code == 200
    assert client.get("/api/sample-images").json()["samples"] == []
    assert client.get("/api/inspections").json() == {"inspections": []}


def test_validation_errors(session_client):
    c = session_client
    assert c.post("/api/inspect", data={"reference_id": c.rid}).status_code == 400  # neither file nor sample
    assert c.post("/api/inspect", files={"file": ("a.png", b"", "image/png")}, data={"reference_id": c.rid}).status_code == 400
    assert c.post("/api/inspect", files={"file": ("a.png", b"not an image " * 20, "image/png")}, data={"reference_id": c.rid}).status_code == 415
    assert c.post("/api/inspect", files={"file": ("a.png", b"\x89PNG\r\n\x1a\n" + b"\0" * 64, "image/png")}, data={"reference_id": c.rid}).status_code in (415, 422)  # damaged PNG
    assert c.post("/api/inspect", files={"file": ("a.png", encode(good_part(1)), "image/png")}, data={"reference_id": "nope"}).status_code == 404
    assert c.post("/api/inspect", files={"file": ("a.png", encode(good_part(1)), "image/png")}).status_code == 422  # reference is required
    big = b"\x89PNG\r\n\x1a\n" + b"\0" * (3 * 1_000_000)
    assert c.post("/api/inspect", files={"file": ("big.png", big, "image/png")}, data={"reference_id": c.rid}).status_code == 413
    tiny = encode(good_part(1)[:30, :30])
    assert c.post("/api/inspect", files={"file": ("t.png", tiny, "image/png")}, data={"reference_id": c.rid}).status_code == 422
    for bad in ("{not json", json.dumps({"max_defects": -1}), json.dumps({"bogus": 1})):
        assert c.post("/api/inspect", files={"file": ("a.png", encode(good_part(1)), "image/png")}, data={"reference_id": c.rid, "rules": bad}).status_code == 400
    assert c.post("/api/inspect", data={"reference_id": c.rid, "sample_id": "../x"}).status_code == 404


def test_custom_reference_requires_enough_images(client):
    files = [("files", (f"g{i}.png", encode(good_part(i)), "image/png")) for i in range(3)]
    r = client.post("/api/references", files=files, data={"name": "x"})
    assert r.status_code == 400 and "At least 10" in r.json()["detail"]
    assert client.post("/api/references", files=[("files", ("a.png", b"junk" * 20, "image/png"))] * 12).status_code == 415
    assert client.delete("/api/references/pcb1").status_code == 404  # built-in references cannot be deleted


def test_good_part_vs_defective_part_end_to_end(session_client):
    c = session_client
    g = inspect(c, good_part(500)).json()
    d = inspect(c, defective(501)).json()
    assert g["model_output"]["score_ratio"] < d["model_output"]["score_ratio"]
    assert d["model_output"]["score_ratio"] > 1.0 and d["recommendation"]["decision"] in ("FAIL", "MANUAL_REVIEW")
    reg = d["model_output"]["regions"][0]
    x, y, w, h = reg["bbox"]
    assert x - 30 < 190 < x + w + 30 and y - 30 < 70 < y + h + 30, reg  # mapping of the detection onto the displayed image
    assert reg["category"].startswith("unusual region") and "does not name" in reg["category_note"]
    assert d["model_output"]["image"] == {"width": 256, "height": 256} and d["reference"]["kind"] == "custom" and d["reference"]["validated"] is False
    assert g["recommendation"]["decision"] != "PASS"  # a reference of 16 images can never auto-PASS
    assert any("only 16 good image" in r for r in g["recommendation"]["reasons"]) or g["recommendation"]["decision"] == "MANUAL_REVIEW"
    assert g["review"] == {"history": [], "current": None}


def test_rules_change_the_recommendation_and_reevaluate_does_not_rerun_the_model(session_client):
    c = session_client
    d = inspect(c, defective(502)).json()
    iid = d["id"]
    strict = c.post(f"/api/inspections/{iid}/reevaluate", json={"rules": {"max_defects": 0, "min_reference_images": 5}}).json()
    lenient = c.post(f"/api/inspections/{iid}/reevaluate", json={"rules": {"max_defects": 50, "min_score_ratio": 5.0, "review_band": 4.0, "min_reference_images": 5, "wrong_part_ratio": 50}}).json()
    assert strict["model_output"]["anomaly_score"] == lenient["model_output"]["anomaly_score"] == d["model_output"]["anomaly_score"]
    assert strict["recommendation"]["decision"] == "FAIL" and lenient["recommendation"]["decision"] == "PASS"
    assert lenient["rules_revision"] == 2 and lenient["recommendation"]["rules"]["max_defects"] == 50
    assert c.post(f"/api/inspections/{iid}/reevaluate", json={"rules": {"max_defects": -4}}).status_code == 400


def test_review_flow_keeps_three_layers_apart(session_client):
    c = session_client
    d = inspect(c, defective(503), rules={"min_reference_images": 5, "wrong_part_ratio": 50}).json()
    iid, rec = d["id"], d["recommendation"]["decision"]
    assert rec == "FAIL"
    assert c.post(f"/api/inspections/{iid}/review", json={"action": "override", "decision": "MAYBE"}).status_code == 400
    assert c.post(f"/api/inspections/{iid}/review", json={"action": "zzz"}).status_code == 400
    assert c.post(f"/api/inspections/{iid}/review", json={"action": "override", "decision": "FAIL", "region_reviews": {"999": "confirmed"}}).status_code == 400
    r1 = c.post(f"/api/inspections/{iid}/review", json={"action": "confirm", "notes": "scratch visible", "reviewer": "A. Smith", "region_reviews": {"1": "confirmed"}}).json()
    cur = r1["review"]["current"]
    assert cur["decision"] == "FAIL" and cur["agrees_with_recommendation"] and cur["notes"] == "scratch visible" and cur["region_reviews"] == {"1": "confirmed"} and r1["recommendation"]["decision"] == "FAIL"
    r2 = c.post(f"/api/inspections/{iid}/review", json={"action": "override", "decision": "PASS", "notes": "cosmetic only"}).json()
    assert r2["review"]["current"]["decision"] == "PASS" and not r2["review"]["current"]["agrees_with_recommendation"] and len(r2["review"]["history"]) == 2
    assert r2["recommendation"]["decision"] == "FAIL"  # the automated recommendation is untouched by the human decision
    listing = c.get("/api/inspections").json()["inspections"]
    mine = next(x for x in listing if x["id"] == iid)
    assert mine["recommendation"] == "FAIL" and mine["human_decision"] == "PASS"


def test_confirm_is_refused_when_the_recommendation_is_manual_review(session_client):
    c = session_client
    d = inspect(c, good_part(504)).json()  # a 16-image reference: MANUAL_REVIEW by rule
    assert d["recommendation"]["decision"] == "MANUAL_REVIEW"
    r = c.post(f"/api/inspections/{d['id']}/review", json={"action": "confirm"})
    assert r.status_code == 400 and "choose PASS or FAIL" in r.json()["detail"]
    assert c.post(f"/api/inspections/{d['id']}/review", json={"action": "override", "decision": "PASS", "notes": "n" * 5000}).json()["review"]["current"]["notes"].__len__() == 2000


def test_images_report_and_history(session_client):
    c = session_client
    d = inspect(c, defective(505), name="../../etc/passwd<script>.png").json()
    assert "/" not in d["filename"] and "<" not in d["filename"]
    iid = d["id"]
    for kind, ct in (("original", "image/jpeg"), ("annotated", "image/jpeg"), ("heatmap", "image/png"), ("thumb", "image/jpeg")):
        r = c.get(f"/api/inspections/{iid}/images/{kind}")
        assert r.status_code == 200 and r.headers["content-type"] == ct and len(r.content) > 100, kind
    assert c.get(f"/api/inspections/{iid}/images/dataset_annotation").status_code == 404  # only samples have one
    assert c.get(f"/api/inspections/{iid}/images/..%2Fmeta.json").status_code in (404, 422)
    pdf = c.get(f"/api/inspections/{iid}/report.pdf")
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-" and len(pdf.content) > 4000
    assert c.get(f"/api/inspections/{iid}/report.json").json()["id"] == iid
    assert c.get("/api/inspections/" + "0" * 32).status_code == 404 and c.get("/api/inspections/../x").status_code in (404, 422)
    assert c.delete(f"/api/inspections/{iid}").json() == {"deleted": True} and c.get(f"/api/inspections/{iid}").status_code == 404


def test_unusual_part_triggers_condition_review(session_client):
    import cv2
    import numpy as np
    c = session_client
    dark = (good_part(600) * 0.3).astype(np.uint8)
    d = inspect(c, dark, rules={"min_reference_images": 5, "wrong_part_ratio": 50, "max_defects": 100}).json()
    assert any(k["code"] == "brightness" for k in d["model_output"]["condition_checks"]) and d["recommendation"]["decision"] == "MANUAL_REVIEW"
    wide = cv2.resize(good_part(601), (512, 128))
    d2 = inspect(c, wide, rules={"min_reference_images": 5, "wrong_part_ratio": 50, "max_defects": 100}).json()
    assert any(k["code"] == "aspect" for k in d2["model_output"]["condition_checks"])


def test_builtin_references_and_samples_when_present(client):
    refs = client.get("/api/references").json()["references"]
    b = [r for r in refs if r["kind"] == "builtin"]
    if not b:
        pytest.skip("built-in references have not been built (scripts/build_references.py)")
    assert all(r["evaluation"] and 0.5 < r["evaluation"]["image_auroc"] <= 1 for r in b if r["evaluation"])
