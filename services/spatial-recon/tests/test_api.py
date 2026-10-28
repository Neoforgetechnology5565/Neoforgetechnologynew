"""API tests. Reconstruction tests that run the real pipeline use the real sample video (marked slow: several minutes on CPU)."""
import io
import time

import cv2
import numpy as np
import pytest
import trimesh

from app import cloud as pc
from conftest import VIDEO, make_client, wait_job


def ply_bytes(tmp_path, n=800):
    r = np.random.default_rng(1)
    c = pc.Cloud(r.normal(0, 1, (n, 3)).astype(np.float32), r.integers(0, 255, (n, 3)).astype(np.uint8))
    pc.write_ply(tmp_path / "t.ply", c)
    return (tmp_path / "t.ply").read_bytes()


def noise_images(n=5):
    r = np.random.default_rng(0)
    return [("files", (f"n{i}.jpg", cv2.imencode(".jpg", r.integers(0, 255, (240, 320, 3), dtype=np.uint8))[1].tobytes(), "image/jpeg")) for i in range(n)]


def test_health_reports_what_is_and_is_not_available(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["pycolmap"] and h["dense_multi_view_stereo"] is False and h["cuda"] is False
    assert set(h["formats"]["point_clouds"]) == {"ply", "pcd"} and set(h["formats"]["meshes"]) == {"obj", "glb", "stl"}


# ---- import / view / process ------------------------------------------------------------------------------------------------
def test_import_ply_then_process_and_download(client, tmp_path):
    r = client.post("/api/spatial/import", files={"file": ("cloud.ply", ply_bytes(tmp_path), "application/octet-stream")})
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["kind"] == "import" and j["status"] == "completed" and j["scale"]["metric"] is False and "does not state its scale" in j["scale"]["note"]
    arts = client.get(j["artifacts_url"]).json()["artifacts"]
    a = next(x for x in arts if x["kind"] == "point_cloud")
    assert a["status"] == "available" and a["points"] == 800 and a["url"]
    assert pc.read_ply(client.get(a["url"]).content, 10_000).points.shape == (800, 3)
    p = client.post(f"/api/spatial/jobs/{j['job_id']}/process", json={"source": a["name"], "op": "voxel_downsample", "params": {"voxel_size": 1.0}}).json()
    assert p["points_after"] < p["points_before"] == 800
    out = client.get(p["artifact"]["url"]).content
    assert len(pc.read_ply(out, 10_000).points) == p["points_after"]
    n = client.post(f"/api/spatial/jobs/{j['job_id']}/process", json={"source": a["name"], "op": "estimate_normals", "params": {"neighbors": 12}}).json()
    assert pc.read_ply(client.get(n["artifact"]["url"]).content, 10_000).normals is not None
    bad = client.post(f"/api/spatial/jobs/{j['job_id']}/process", json={"source": a["name"], "op": "voxel_downsample", "params": {"voxel_size": -1}})
    assert bad.status_code == 400
    assert client.post(f"/api/spatial/jobs/{j['job_id']}/process", json={"source": "../../etc/passwd", "op": "crop", "params": {}}).status_code == 404
    assert client.post(f"/api/spatial/jobs/{j['job_id']}/process", json={"source": a["name"], "op": "rm -rf", "params": {}}).status_code == 400


@pytest.mark.parametrize("fmt", ["obj", "stl", "glb", "ply"])
def test_import_mesh_formats_keep_their_geometry(client, tmp_path, fmt):
    m = trimesh.creation.icosphere(subdivisions=2)  # 162 vertices, 320 faces
    data = m.export(file_type=fmt)
    data = data if isinstance(data, bytes) else data.encode()
    r = client.post("/api/spatial/import", files={"file": (f"m.{fmt}", data, "application/octet-stream")})
    assert r.status_code == 201, r.text
    a = next(x for x in client.get(r.json()["artifacts_url"]).json()["artifacts"] if x["kind"] == "mesh")
    assert a["status"] == "available" and a["faces"] == 320
    assert fmt in ("obj", "stl") or a["vertices"] == 162  # STL stores each triangle separately, so vertex counts differ there
    g = trimesh.load(io.BytesIO(client.get(a["url"]).content), file_type="glb", force="mesh")
    assert len(g.faces) == 320 and abs(g.area - m.area) < 1e-3  # surface preserved


def test_unsupported_and_corrupt_files_get_clear_errors(client, tmp_path):
    def imp(name, data):
        return client.post("/api/spatial/import", files={"file": (name, data, "application/octet-stream")})
    assert imp("a.ply", b"").status_code == 400
    assert imp("a.xyz", b"1 2 3\n4 5 6\n").status_code == 415
    assert imp("a.ply", b"ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nend_header\n1\n2\n3\n").status_code == 422
    r = imp("a.glb", b"glTF" + b"\x00" * 40)
    assert r.status_code == 422 and "could not be parsed" in r.json()["detail"]
    assert imp("evil.ply", b"#!/bin/sh\nrm -rf /\n").status_code == 415  # never executed, never accepted
    r = client.post("/api/spatial/reconstruct", files=[("files", ("a.ply", ply_bytes(tmp_path), "application/octet-stream"))] * 3)
    assert r.status_code == 415 and "Point clouds and meshes can be imported" in r.json()["detail"]


def test_artifact_names_cannot_escape_and_ids_are_not_paths(client, tmp_path):
    j = client.post("/api/spatial/import", files={"file": ("c.ply", ply_bytes(tmp_path), "application/octet-stream")}).json()
    for bad in ["..%2f..%2fetc%2fpasswd", "../x", "report.json", "mesh.glb"]:
        assert client.get(f"/api/spatial/jobs/{j['job_id']}/artifacts/{bad}").status_code == 404
    for bad in ["../etc/passwd", "a" * 32, "x"]:
        r = client.get(f"/api/spatial/jobs/{bad}")
        assert r.status_code == 404 and "/tmp" not in r.text and "Traceback" not in r.text


# ---- reconstruction: failure paths are honest ----------------------------------------------------------------------------------
def test_unreconstructable_images_fail_honestly_without_fake_outputs(client):
    r = client.post("/api/spatial/reconstruct", files=noise_images(6), data={"params": '{"depth": false}'})
    assert r.status_code == 202, r.text
    j = wait_job(client, r.json()["job_id"], 300)
    assert j["status"] == "failed" and ("overlap" in j["error"] or "could be built" in j["error"] or "Only" in j["error"])
    arts = client.get(j["artifacts_url"]).json()["artifacts"]
    assert not [a for a in arts if a["kind"] in ("point_cloud", "mesh", "depth_map") and a["status"] == "available"]  # nothing invented
    assert j["stages"]["mapping"]["state"] in ("failed", "pending")


def test_too_few_images_and_mixed_input_are_rejected(client):
    assert client.post("/api/spatial/reconstruct", files=noise_images(2)).status_code == 422
    vid = ("files", ("v.mp4", VIDEO.read_bytes(), "video/mp4"))
    assert client.post("/api/spatial/reconstruct", files=[vid] + noise_images(2)).status_code == 400
    assert client.post("/api/spatial/reconstruct").status_code == 400
    assert client.post("/api/spatial/reconstruct", files=noise_images(3), data={"params": '{"max_frames": 5}'}).status_code == 400
    assert client.post("/api/spatial/reconstruct", files=noise_images(3), data={"params": "nope"}).status_code == 400
    assert client.post("/api/spatial/reconstruct", data={"sample_id": "../../x"}).status_code == 404


def test_limits_size_duration_count_and_concurrency(tmp_path):
    with make_client(tmp_path / "a", max_upload_mb=1, max_total_mb=1, max_images=3, max_video_seconds=5) as c:
        big = ("files", ("big.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 1_200_000, "video/mp4"))
        assert c.post("/api/spatial/reconstruct", files=[big]).status_code == 413
        assert c.post("/api/spatial/reconstruct", files=noise_images(4)).status_code == 400  # more than max_images
        vid = ("files", ("v.mp4", VIDEO.read_bytes()[:900_000], "video/mp4"))
        r = c.post("/api/spatial/reconstruct", files=[vid])
        assert r.status_code in (413, 422)  # truncated sample or over the duration limit: refused, not processed
    with make_client(tmp_path / "b", max_concurrent_jobs=1, max_queued_jobs=0) as c:
        r1 = c.post("/api/spatial/reconstruct", files=noise_images(5), data={"params": '{"depth": false}'})
        assert r1.status_code == 202
        r2 = c.post("/api/spatial/reconstruct", files=noise_images(5))
        assert r2.status_code == 503 and "busy" in r2.json()["detail"]
        c.post(f"/api/spatial/jobs/{r1.json()['job_id']}/cancel")
        wait_job(c, r1.json()["job_id"], 120)


def test_cancel_stops_a_running_job_and_marks_outputs_not_produced(client):
    r = client.post("/api/spatial/reconstruct", files=[("files", ("v.mp4", VIDEO.read_bytes(), "video/mp4"))], data={"params": '{"max_frames": 60}'})
    assert r.status_code == 202
    jid = r.json()["job_id"]
    t0 = time.time()
    while client.get(f"/api/spatial/jobs/{jid}").json()["stage"] == "queued" and time.time() - t0 < 30:
        time.sleep(0.2)
    time.sleep(1.0)
    assert client.post(f"/api/spatial/jobs/{jid}/cancel").status_code == 200
    j = wait_job(client, jid, 120)
    assert j["status"] == "cancelled"
    assert not [a for a in client.get(j["artifacts_url"]).json()["artifacts"] if a["status"] == "available" and a["kind"] in ("point_cloud", "mesh")]
    assert client.delete(f"/api/spatial/jobs/{jid}").status_code == 200
    assert client.get(f"/api/spatial/jobs/{jid}").status_code == 404


# ---- the real pipeline on the real sample video -------------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def recon(client):
    r = client.post("/api/spatial/reconstruct", files=[("files", ("highway.mp4", VIDEO.read_bytes(), "video/mp4"))], data={"params": '{"max_frames": 100, "image_size": 800}'})
    assert r.status_code == 202, r.text
    j = wait_job(client, r.json()["job_id"], 1200)
    return client, j, client.get(j["artifacts_url"]).json()["artifacts"]


@pytest.mark.slow
def test_real_reconstruction_registers_most_frames_with_low_error(recon):
    c, j, arts = recon
    assert j["status"] == "completed", j.get("error")
    rep = c.get(f"/api/spatial/jobs/{j['job_id']}/results").json()["report"]
    q = rep["quality"]
    assert q["images_registered"] >= 0.9 * q["images_total"] >= 40 and q["points3d"] > 1000 and q["mean_reprojection_error_px"] < 1.5
    assert rep["scale"]["metric"] is False and rep["scale"]["status"] == "relative"
    assert j["stages"]["mapping"]["state"] == "done"


@pytest.mark.slow
def test_real_outputs_are_consistent_and_openable(recon):
    c, j, arts = recon
    by = {a["name"]: a for a in arts}
    cams = c.get(by["cameras.json"]["url"]).json()
    assert len(cams["registered"]) >= 40
    R = np.array(cams["registered"][0]["rotation_cam_from_world"])
    assert np.allclose(R @ R.T, np.eye(3), atol=1e-6) and abs(np.linalg.det(R) - 1) < 1e-6  # a proper rotation
    traj = c.get(by["trajectory.json"]["url"]).json()["positions"]
    assert len(traj) == len(cams["registered"])
    sparse = pc.read_ply(c.get(by["points_sparse.ply"]["url"]).content, 1_000_000)
    assert len(sparse.points) == by["points_sparse.ply"]["points"] > 1000 and sparse.colors is not None and np.isfinite(sparse.points).all()
    # the camera path lies inside/near the reconstructed scene extent, not at an unrelated scale
    cc = np.array([t["center"] for t in traj])
    ext = sparse.points.max(0) - sparse.points.min(0)
    assert np.ptp(cc, 0).max() < 3 * ext.max()
    dense = by["points_dense.ply"]
    assert dense["status"] == "available" and dense["approximate"] is True and "NOT multi-view stereo" in dense["provenance"]
    assert len(pc.read_ply(c.get(dense["url"]).content, 6_000_000).points) == dense["points"]
    mesh = by["mesh.glb"]
    assert mesh["status"] == "available" and mesh["approximate"] is True
    m = trimesh.load(io.BytesIO(c.get(mesh["url"]).content), file_type="glb", force="mesh")
    assert len(m.vertices) == mesh["vertices"] and len(m.faces) == mesh["faces"] > 1000
    depth = [a for a in arts if a["kind"] == "depth_map" and a["status"] == "available"]
    assert depth and "NOT metric" in depth[0]["description"]
    img = cv2.imdecode(np.frombuffer(c.get(depth[0]["url"]).content, np.uint8), cv2.IMREAD_COLOR)
    assert img is not None and img.std() > 10  # a real depth colour map, not a flat image
    for m_ in [a for a in arts if a["kind"] == "matches"]:
        assert m_["status"] == "available" and m_["pair"] and cv2.imdecode(np.frombuffer(c.get(m_["url"]).content, np.uint8), 1).shape[1] > 800


@pytest.mark.slow
def test_real_tracking_data_and_frame_links(recon):
    c, j, arts = recon
    by = {a["name"]: a for a in arts}
    tr = c.get(by["tracking.json"]["url"]).json()
    inl = [p["inliers"] for p in tr["consecutive_pair_inliers"]]
    assert len(inl) >= 40 and np.median(inl) > 30  # neighbouring keyframes are genuinely well matched
    f0 = tr["features"][0]
    assert f0["triangulated"] > 20 and any(p[2] == 1 for p in f0["points"]) and any(p[2] == 0 for p in f0["points"])
    frames = [a for a in arts if a["kind"] == "image" and a["name"].startswith("frame_")]
    assert frames and all(a["registered"] in (True, False) for a in frames)


@pytest.mark.slow
def test_processing_a_reconstructed_cloud(recon):
    c, j, arts = recon
    r = c.post(f"/api/spatial/jobs/{j['job_id']}/process", json={"source": "points_dense.ply", "op": "statistical_outlier_removal", "params": {"neighbors": 16, "std_ratio": 1.5}}).json()
    assert 0 < r["points_after"] < r["points_before"]
    assert r["artifact"]["relative_scale"] is True  # processing never turns relative scale into metric
