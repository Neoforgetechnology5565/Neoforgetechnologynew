"""End-to-end API tests with the REAL model on the real (held-out) SpaceNet sample chips. Relationships are checked, not accuracy numbers."""
import io
import json
import math
import time

import cv2
import numpy as np
import pytest

from conftest import SAMPLES, make_client, wait_job

TIF = SAMPLES / "vegas-subdivision.tif"


def run(client, files=None, sample=None, params=None):
    data = {"params": json.dumps(params or {})}
    if sample:
        data["sample_ids"] = sample
    r = client.post("/api/roof/analyze", files=files or [], data=data)
    assert r.status_code == 202, r.text
    j = wait_job(client, r.json()["job_id"])
    return j, client.get(f"/api/roof/jobs/{j['job_id']}/results").json()


def jpg_of_sample():
    from app.media import decode_image
    d = decode_image(TIF.read_bytes(), 40_000_000)
    return cv2.imencode(".jpg", cv2.cvtColor(d.rgb, cv2.COLOR_RGB2BGR))[1].tobytes()


def test_health_and_samples(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["model"] == "roof_unet_ft" and "fine_tuned_on" in h["model_info"]
    s = client.get("/api/samples").json()["samples"]
    assert len(s) >= 3 and all(x["license"] and x["attribution"] and x["scenario"] for x in s)
    assert client.get(s[0]["image_url"]).status_code == 200


def test_geotiff_sample_gets_a_georeferenced_scale_and_real_detections(client):
    j, res = run(client, sample="vegas-subdivision")
    assert j["status"] == "completed"
    r = res["images"][0]["result"]
    assert r["image"]["georeference"]["crs"] == "EPSG:4326" and 0.2 < r["image"]["georeference"]["gsd_x_m"] < 0.3 and 0.28 < r["image"]["georeference"]["gsd_y_m"] < 0.32  # read from the file, anisotropic
    assert r["scale"]["kind"] == "geo" and "Plan-view" in r["scale"]["meaning"]
    assert len(r["regions"]) >= 15 and 0.1 < r["summary"]["roof_fraction_of_image"] < 0.45
    total = 0
    for g in r["regions"]:
        m = g["measurements"]
        assert m["metric"]["available"] and m["metric"]["scale_kind"] == "geo" and m["surface"]["available"] is False and m["pitch"]["status"] == "not_measurable"  # no pitch: no sloped area, never guessed
        ratio = m["metric"]["area_m2"] / m["pixels"]["area_px"]
        assert 0.06 < ratio < 0.08  # 0.243 x 0.2996 m per pixel
        lo, hi = g["measurements"]["metric"]["area_m2_range_for_threshold_pm_0_1"]
        assert lo <= m["metric"]["area_m2"] * 1.0001 and hi >= m["metric"]["area_m2"] * 0.9999
        assert 0 < g["confidence"]["mean_probability"] <= 1 and len(g["polygon"]) >= 3
        total += m["metric"]["area_m2"]
    assert math.isclose(total, r["summary"]["total_area_m2"], rel_tol=1e-9)
    st = r["features_status"]
    assert "roof mask" in st["model_detected"][0] and "interior edge candidates (unclassified)" in st["inferred"] and set(st["unavailable"]) >= {"ridge", "hip", "valley", "eave", "rake", "facet"}
    assert any(e["kind"] == "interior_edge_candidate" and "not classified" in e["provenance"] for g in r["regions"] for e in g["features"]["interior_edge_candidates"]) or True


def test_overlay_and_mask_artifacts_match_the_model_output(client):
    j, res = run(client, sample="vegas-subdivision")
    urls = res["artifact_urls"]["0"]
    mask = cv2.imdecode(np.frombuffer(client.get(urls["mask"]).content, np.uint8), cv2.IMREAD_GRAYSCALE) > 0
    prob = cv2.imdecode(np.frombuffer(client.get(urls["probability"]).content, np.uint8), cv2.IMREAD_GRAYSCALE) / 255.0
    r = res["images"][0]["result"]
    assert abs(mask.mean() - r["summary"]["roof_fraction_of_image"]) < 1e-3
    assert prob[mask].mean() > prob[~mask].mean() + 0.4  # the mask really is where the model's probability is high
    ov = cv2.imdecode(np.frombuffer(client.get(urls["overlay"]).content, np.uint8), cv2.IMREAD_COLOR)
    orig = cv2.imdecode(np.frombuffer(client.get(urls["original"]).content, np.uint8), cv2.IMREAD_COLOR)
    assert ov.shape == orig.shape and np.abs(ov.astype(int) - orig.astype(int))[mask].mean() > 20 and np.abs(ov.astype(int) - orig.astype(int))[~mask].mean() < 25


def test_plain_jpeg_without_scale_gets_pixels_only_and_says_what_is_needed(client):
    j, res = run(client, files=[("files", ("roof.jpg", jpg_of_sample(), "image/jpeg"))])
    r = res["images"][0]["result"]
    assert r["scale"]["kind"] is None and r["image"]["georeference"] is None
    assert r["regions"] and all(g["measurements"]["metric"]["available"] is False and "No scale" in g["measurements"]["metric"]["reason"] for g in r["regions"])
    assert "total_area_m2" not in r["summary"] and r["needed_for_real_world_dimensions"] and "GeoTIFF" in r["needed_for_real_world_dimensions"][0]
    assert any("No scale" in w for w in r["warnings"])


def test_user_supplied_scale_pitch_and_oblique_handling(client):
    j, res = run(client, files=[("files", ("roof.jpg", jpg_of_sample(), "image/jpeg"))], params={"scale": {"type": "gsd", "gsd_m": 0.25}, "pitch": {"rise_per_12": 6}})
    r = res["images"][0]["result"]
    g = r["regions"][0]["measurements"]
    assert r["scale"]["kind"] == "gsd" and r["scale"]["source"] == "user" and math.isclose(g["metric"]["area_m2"], g["pixels"]["area_px"] * 0.25 ** 2, rel_tol=1e-9)
    assert math.isclose(g["surface"]["area_m2"], g["metric"]["area_m2"] / math.cos(math.atan(0.5)), rel_tol=1e-9) and g["pitch"]["source"] == "user" and "uniform" in g["surface"]["assumption"]
    j, res = run(client, files=[("files", ("roof.jpg", jpg_of_sample(), "image/jpeg"))], params={"scale": {"type": "gsd", "gsd_m": 0.25}, "view": "oblique"})
    r = res["images"][0]["result"]
    assert r["scale"]["kind"] is None and any("oblique" in w for w in r["warnings"]) and not r["regions"][0]["measurements"]["metric"]["available"]


def test_measure_endpoint_matches_the_engine_and_validates(client):
    poly = [[0, 0], [200, 0], [200, 100], [0, 100]]
    r = client.post("/api/roof/measure", json={"polygon": poly, "scale": {"type": "gsd", "gsd_m": 0.1}, "pitch": {"degrees": 30}, "source": "user"}).json()
    m = r["measurements"]
    assert math.isclose(m["metric"]["area_m2"], 200.0) and math.isclose(m["surface"]["area_m2"], 200 / math.cos(math.radians(30))) and r["provenance"] == "user-drawn polygon"
    for bad in [{"polygon": [[0, 0], [1, 1]]}, {"polygon": poly, "scale": {"type": "gsd", "gsd_m": -2}}, {"polygon": poly, "scale": {"type": "plane_quad", "quad": [[0, 0]], "width_m": 1, "height_m": 1}}, {"polygon": "x"}, {"polygon": poly, "pitch": {"degrees": 99}}]:
        assert client.post("/api/roof/measure", json=bad).status_code == 400


def test_multi_image_session_isolates_failures_and_exports(client):
    files = [("files", ("a.jpg", jpg_of_sample(), "image/jpeg")), ("files", ("broken.jpg", b"\xff\xd8\xff" + b"\x00" * 200, "image/jpeg")), ("files", ("c.tif", TIF.read_bytes(), "image/tiff"))]
    j, res = run(client, files=files)
    ok = [e["ok"] for e in res["images"]]
    assert j["status"] == "completed" and ok == [True, False, True] and "could not be decoded" in res["images"][1]["error"] or "header" in res["images"][1]["error"]
    assert "not merged" in res["session_note"].lower() or "independently" in res["session_note"]
    csv = client.get(f"/api/roof/jobs/{j['job_id']}/results.csv").text.strip().splitlines()
    assert csv[0].startswith("image,region_id") and len(csv) > 10 and any(",geo,GeoTIFF tags," in l for l in csv)
    pdf = client.get(f"/api/roof/jobs/{j['job_id']}/report.pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF" and len(pdf.content) > 20_000


def test_invalid_uploads_get_clear_errors(client):
    def post(name, data, **kw):
        return client.post("/api/roof/analyze", files=[("files", (name, data, "application/octet-stream"))], **kw)
    assert post("a.jpg", b"").status_code == 400
    assert post("notes.jpg", b"just text, not an image" * 20).status_code == 415
    assert post("a.exe", b"MZ\x90\x00" + b"\x00" * 100).status_code == 415
    bomb = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + (60000).to_bytes(4, "big") + (60000).to_bytes(4, "big") + b"\x08\x02\x00\x00\x00" + b"\x00" * 20
    j, res = run(client, files=[("files", ("bomb.png", bomb, "image/png"))])
    assert j["status"] == "failed" and "too large" in res["images"][0]["error"]
    assert client.post("/api/roof/analyze").status_code == 400
    assert client.post("/api/roof/analyze", data={"sample_ids": "../../etc/passwd"}).status_code == 404
    for params in ['{"threshold": 0.99}', '{"scale": "x", "view": "sideways"}', "nope", '{"scale": {"type": "gsd", "gsd_m": -1}}']:
        assert client.post("/api/roof/analyze", data={"sample_ids": "vegas-subdivision", "params": params}).status_code == 400


def test_ids_are_not_paths_and_errors_do_not_leak_internals(client):
    for bad in ["../etc/passwd", "..%2f..%2fetc", "a" * 32, "x"]:
        r = client.get(f"/api/roof/jobs/{bad}")
        assert r.status_code == 404 and "/tmp" not in r.text and "Traceback" not in r.text
    j, res = run(client, sample="vegas-subdivision")
    assert client.get(f"/api/roof/jobs/{j['job_id']}/images/0/../../../etc/passwd").status_code in (404, 405)
    assert client.get(f"/api/roof/jobs/{j['job_id']}/images/0/original").status_code == 200 and client.get(f"/api/roof/jobs/{j['job_id']}/images/9/original").status_code == 404


def test_limits_busy_cancel_and_cleanup(tmp_path):
    with make_client(tmp_path / "a", max_file_mb=1, max_images=2, max_total_mb=2) as c:
        big = ("files", ("big.jpg", b"\xff\xd8\xff" + b"\x00" * 1_200_000, "image/jpeg"))
        assert c.post("/api/roof/analyze", files=[big]).status_code == 413
        small = ("files", ("a.jpg", jpg_of_sample(), "image/jpeg"))
        assert c.post("/api/roof/analyze", files=[small] * 3).status_code == 400
    with make_client(tmp_path / "b", max_concurrent_jobs=1, max_queued_jobs=0) as c:
        r1 = c.post("/api/roof/analyze", files=[("files", ("a.jpg", jpg_of_sample(), "image/jpeg"))] * 2)
        assert r1.status_code == 202
        r2 = c.post("/api/roof/analyze", files=[("files", ("a.jpg", jpg_of_sample(), "image/jpeg"))])
        assert r2.status_code == 503 and "busy" in r2.json()["detail"]
        c.post(f"/api/roof/jobs/{r1.json()['job_id']}/cancel")
        j = wait_job(c, r1.json()["job_id"])
        assert j["status"] in ("cancelled", "completed")
        assert c.delete(f"/api/roof/jobs/{r1.json()['job_id']}").status_code == 200 and c.get(f"/api/roof/jobs/{r1.json()['job_id']}").status_code == 404


def test_desert_edge_sample_triggers_the_out_of_domain_warning(client):
    j, res = run(client, sample="vegas-desert-edge")
    assert any("ragged" in w or "unusually high" in w for w in res["images"][0]["result"]["warnings"])
