import csv
import io
import json
import struct

import numpy as np
import pytest

from app.cloud import read_ply
from conftest import flat_scene, las_bytes


def up(client, data, name="c.laz", units=None):
    return client.post("/api/pointcloud/upload", files={"file": (name, data, "application/octet-stream")}, data={"units": units} if units else {})


@pytest.fixture()
def loaded(client, corridor):
    r = up(client, corridor[0])
    assert r.status_code == 201, r.text
    return client, r.json()


def test_health_lists_real_capabilities(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["formats"]["laz"] is True and h["formats"]["ply"] and "not a trained model" in h["classification"] and h["limits"]["max_points"] == 400_000


def test_upload_validation(client):
    assert up(client, b"").status_code == 400
    assert up(client, b"PK\x03\x04" + b"0" * 200, "a.ply").status_code == 422
    assert up(client, b"not a point cloud\x00\x01\x02" * 10, "a.xyz").status_code == 422
    assert up(client, b"x" * (3 * 1_000_000 + 10), "big.xyz").status_code == 413
    from fastapi.testclient import TestClient
    from app.config import Settings
    from app.main import create_app
    with TestClient(create_app(Settings(max_points=50, samples_dir=client.app.state.__dict__.get("x") or __import__("pathlib").Path("/nonexistent")))) as small:
        r = up(small, las_bytes(flat_scene(100)), "many.laz")
        assert r.status_code == 422 and "limit is 50" in r.json()["detail"]  # beyond max_points: a clear message, not a crash
    assert up(client, las_bytes(flat_scene(100)), "x.laz", units="parsec").status_code == 400
    r = up(client, las_bytes(flat_scene(100)), "../../etc/passwd<x>.laz")
    assert r.status_code == 201 and "/" not in r.json()["name"] and "<" not in r.json()["name"]


def test_units_are_read_from_the_file_or_unknown_and_can_be_declared(client):
    r = up(client, las_bytes(flat_scene(200), 9002, 9002)).json()
    assert r["units"]["horizontal"] == "foot" and r["units"]["known"] and r["defaults"]["length_unit"] == "ft" and abs(r["defaults"]["classify"]["cell"] - 2 / 0.3048) < 1e-3
    u = up(client, las_bytes(flat_scene(200))).json()
    assert not u["units"]["known"] and u["warnings"] and "not stated" in u["warnings"][0] and u["defaults"]["assumed"] and "metre-scale" in u["defaults"]["note"]
    d = client.post(f"/api/pointcloud/{u['id']}/units", json={"units": "metre"}).json()
    assert d["units"]["known"] and d["units"]["source"] == "set by user" and not d["warnings"]
    assert client.post(f"/api/pointcloud/{u['id']}/units", json={"units": "furlong"}).status_code == 400
    back = client.post(f"/api/pointcloud/{u['id']}/units", json={"units": "unknown"}).json()
    assert not back["units"]["known"]


def test_preprocess_creates_versions_with_before_after_counts(loaded):
    c, s = loaded
    cid = s["id"]
    n0 = s["versions"][0]["points"]
    r = c.post(f"/api/pointcloud/{cid}/preprocess", json={"ops": [{"op": "voxel_downsample", "voxel": 0.5}, {"op": "statistical_outlier_removal", "k": 12, "std_ratio": 2.0}]})
    assert r.status_code == 201
    j = r.json()
    assert j["version"]["id"] == "v1" and j["steps"][0]["before"] == n0 and j["steps"][0]["after"] < n0 and j["steps"][1]["after"] <= j["steps"][0]["after"] and j["version"]["points"] == j["steps"][1]["after"]
    assert c.get(f"/api/pointcloud/{cid}/summary").json()["versions"][0]["points"] == n0  # the original is untouched
    for bad, code in (({"ops": []}, 400), ({"ops": [{"op": "nope"}]}, 422), ({"ops": [{"op": "crop", "min": [5, 5, 5], "max": [1, 1, 1]}]}, 422), ({"ops": ["x"]}, 400), ({"ops": [{"op": "voxel_downsample", "voxel": -1}]}, 422)):
        assert c.post(f"/api/pointcloud/{cid}/preprocess", json=bad).status_code == code
    for _ in range(2):
        assert c.post(f"/api/pointcloud/{cid}/preprocess", json={"ops": [{"op": "voxel_downsample", "voxel": 1.0}]}).status_code == 201
    assert c.post(f"/api/pointcloud/{cid}/preprocess", json={"ops": [{"op": "voxel_downsample", "voxel": 1.0}]}).status_code == 409  # version cap
    assert c.delete(f"/api/pointcloud/{cid}/versions/v1").status_code == 200 and c.delete(f"/api/pointcloud/{cid}/versions/v0").status_code == 400


def test_wire_detection_needs_classification_first(loaded):
    c, s = loaded
    r = c.post(f"/api/pointcloud/{s['id']}/detect-wires", json={})
    assert r.status_code == 409 and "Classify" in r.json()["detail"]
    assert c.post(f"/api/pointcloud/{s['id']}/classify", json={"method": "provided"}).status_code == 409  # this file has no labels
    assert c.post(f"/api/pointcloud/{s['id']}/classify", json={"method": "nonsense"}).status_code == 400
    assert c.post(f"/api/pointcloud/{s['id']}/classify", json={"cell": -1}).status_code == 400


def test_full_workflow_classify_detect_measure_export(loaded):
    c, s = loaded
    cid = s["id"]
    cl = c.post(f"/api/pointcloud/{cid}/classify", json={}).json()["classification"]
    assert cl["source"] == "heuristic" and cl["counts"]["ground-like"] > 90000 and "not a trained" in cl["kind"]
    det = c.post(f"/api/pointcloud/{cid}/detect-wires", json={}).json()
    assert len(det["wires"]) == 9 and det["diagnostics"]["wires_found"] == 9 and "not verified" in det["version"]["wires"]["honesty"]
    w0 = det["wires"][0]
    assert {"id", "support_points", "endpoints", "length", "rms_residual", "quality", "method", "limitations", "curve_model"} <= set(w0)
    counts = c.get(f"/api/pointcloud/{cid}/summary").json()["versions"][0]["classification"]["counts"]
    assert counts["wire-candidate"] == sum(w["support_points"] for w in det["wires"])
    # measurements
    ids = [w["id"] for w in det["wires"]]
    ww = c.post(f"/api/pointcloud/{cid}/measure", json={"a": {"kind": "wire", "id": ids[0]}, "b": {"kind": "wire", "id": ids[1]}, "label": "phase to phase"}).json()
    assert ww["id"] == "M1" and ww["type"] == "wire_wire" and ww["unit"] == "m" and ww["value"] > 0 and ww["label"] == "phase to phase"
    gr = c.post(f"/api/pointcloud/{cid}/measure", json={"a": {"kind": "wire", "id": ids[0]}, "b": {"kind": "ground"}, "threshold": {"value": 8, "unit": "m"}}).json()
    assert gr["type"] == "wire_ground" and 15 < gr["value"] < 30 and gr["threshold_check"]["status"] == "meets" and "not a regulatory" in gr["threshold_check"]["note"]
    tree = c.post(f"/api/pointcloud/{cid}/measure", json={"a": {"kind": "wire", "id": ids[0]}, "b": {"kind": "object", "label": 2, "near": [60, 50.5, 20], "radius": 12}}).json()
    assert tree["type"] == "wire_object" and tree["value"] > 0 and "nearest_support_point_distance" in tree["components"]
    pp = c.post(f"/api/pointcloud/{cid}/measure", json={"a": {"kind": "point", "xyz": [0, 0, 0]}, "b": {"kind": "point", "xyz": [3, 4, 12]}}).json()
    assert pp["value"] == pytest.approx(13.0)
    assert c.post(f"/api/pointcloud/{cid}/measure", json={"a": {"kind": "wire", "id": "W99"}, "b": {"kind": "ground"}}).status_code == 422
    assert c.post(f"/api/pointcloud/{cid}/measure", json={"a": "x", "b": 1}).status_code == 400
    assert len(c.get(f"/api/pointcloud/{cid}/measurements").json()["measurements"]) == 4
    # exports carry the real values
    js = c.get(f"/api/pointcloud/{cid}/export?kind=measurements.json").json()
    assert js["units"]["label"] == "m" and [m["id"] for m in js["measurements"]] == ["M1", "M2", "M3", "M4"] and js["measurements"][0]["value"] == ww["value"]
    rows = list(csv.DictReader(io.StringIO(c.get(f"/api/pointcloud/{cid}/export?kind=measurements.csv").text)))
    assert len(rows) == 4 and rows[0]["type"] == "wire_wire" and float(rows[0]["value"]) == pytest.approx(round(ww["value"], 4)) and rows[1]["threshold_status"] == "meets" and rows[0]["unit"] == "m"
    wj = c.get(f"/api/pointcloud/{cid}/export?kind=wires.json").json()
    assert len(wj["wires"]) == 9 and wj["wires"][0]["endpoints"] == w0["endpoints"]
    ply = c.get(f"/api/pointcloud/{cid}/export?kind=ply")
    back = read_ply(ply.content, 1_000_000)
    assert len(back) == 134040 and np.isfinite(back.xyz).all()
    assert b"coordinate units: m" in ply.content[:300] and b"property uchar label" in ply.content[:400]
    assert c.get(f"/api/pointcloud/{cid}/export?kind=bogus").status_code == 422
    assert c.delete(f"/api/pointcloud/{cid}/measurements/M2").status_code == 200 and c.delete(f"/api/pointcloud/{cid}/measurements/M2").status_code == 404


def test_measurement_in_unknown_units_is_flagged_until_units_are_set(client):
    xyz = flat_scene(500, 1, 20.0)
    s = up(client, las_bytes(xyz)).json()
    m = client.post(f"/api/pointcloud/{s['id']}/measure", json={"a": {"kind": "point", "xyz": [0, 0, 0]}, "b": {"kind": "point", "xyz": [3, 4, 0]}}).json()
    assert m["status"] == "units_unknown" and m["unit"] == "coordinate units" and "value_m" not in m
    client.post(f"/api/pointcloud/{s['id']}/units", json={"units": "foot"})
    m2 = client.post(f"/api/pointcloud/{s['id']}/measure", json={"a": {"kind": "point", "xyz": [0, 0, 0]}, "b": {"kind": "point", "xyz": [3, 4, 0]}}).json()
    assert m2["unit"] == "ft" and m2["value_m"] == pytest.approx(5 * 0.3048)


def test_points_are_served_in_local_coordinates_without_losing_precision(client):
    xyz = flat_scene(1000, 2, 50.0) + [544_000.0, 4_178_000.0, 90.0]
    s = up(client, las_bytes(xyz, 9001, 9001)).json()
    cid = s["id"]
    meta = client.get(f"/api/pointcloud/{cid}/points/meta").json()
    raw = client.get(f"/api/pointcloud/{cid}/points/data").content
    n = meta["n"]
    assert n == 1000 and meta["has_intensity"] and not meta["has_rgb"] and not meta["has_hag"] and len(raw) == n * 12 + n + n * 4  # xyz float32 + label byte + intensity float32
    loc = np.frombuffer(raw[: n * 12], "<f4").reshape(-1, 3).astype(np.float64)
    world = loc + np.array(meta["origin"])
    # every served point is an original point, to float32 precision of the LOCAL coordinates (millimetres), not of the UTM values
    tree = __import__("scipy.spatial", fromlist=["cKDTree"]).cKDTree(xyz)
    assert tree.query(world)[0].max() < 0.003
    small = client.get(f"/api/pointcloud/{cid}/points/meta?max_points=100").json()
    assert small["n"] == 100 and small["decimated"] and small["total"] == 1000
    client.post(f"/api/pointcloud/{cid}/classify", json={})
    meta2 = client.get(f"/api/pointcloud/{cid}/points/meta").json()
    assert meta2["has_labels"] and meta2["has_hag"] and len(client.get(f"/api/pointcloud/{cid}/points/data").content) == n * 12 + n + n * 4 + n * 4


def test_ids_expiry_and_delete(client):
    for bad in ("0" * 32, "../x", "zz"):
        assert client.get(f"/api/pointcloud/{bad}/summary").status_code == 404
    s = up(client, las_bytes(flat_scene(100))).json()
    assert client.delete(f"/api/pointcloud/{s['id']}").json() == {"deleted": True} and client.get(f"/api/pointcloud/{s['id']}/summary").status_code == 404


def test_samples_endpoints(client, tmp_path):
    assert client.get("/api/samples").json() == {"samples": []}
    assert client.post("/api/pointcloud/from-sample", json={"sample_id": "../x"}).status_code == 404
