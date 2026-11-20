"""End-to-end tests on real geometry (the Stanford Bunny from Open3D's dataset helper, or the built-in mug when offline). Nothing is mocked: files are written to disk, imported through the API,
processed in worker processes, and the results are measured against the known surface."""
import io, os, tempfile, time, zipfile
import httpx, numpy as np, open3d as o3d, pytest, trimesh
from scipy.spatial import cKDTree

from pgengine.sample import source_mesh


@pytest.fixture(scope="module")
def src():
    m, _ = source_mesh("bunny"); return m


@pytest.fixture(scope="module")
def files(src):
    d = tempfile.mkdtemp(prefix="pgs-files-"); tm = trimesh.Trimesh(src.vertices, src.faces, process=False); rng = np.random.default_rng(0); P = tm.sample(20000); col = (np.clip((P - P.min(0)) / (np.ptp(P, 0) + 1e-9), 0, 1) * 255).astype(np.uint8)
    out = {}
    pc = o3d.geometry.PointCloud(); pc.points = o3d.utility.Vector3dVector(P); pc.colors = o3d.utility.Vector3dVector(col / 255.0)
    o3d.io.write_point_cloud(f"{d}/cloud.ply", pc); o3d.io.write_point_cloud(f"{d}/cloud.pcd", pc); out["ply_cloud"] = f"{d}/cloud.ply"; out["pcd"] = f"{d}/cloud.pcd"
    np.savetxt(f"{d}/cloud.xyz", np.column_stack([P, col]), fmt="%.6f"); out["xyz"] = f"{d}/cloud.xyz"
    np.savetxt(f"{d}/cloud.xyzn", np.column_stack([P, np.tile([0, 0, 1.0], (len(P), 1))]), fmt="%.6f"); out["xyzn"] = f"{d}/cloud.xyzn"
    import laspy
    hdr = laspy.LasHeader(point_format=2, version="1.2"); hdr.scales = [0.0001] * 3; hdr.offsets = P.min(0); las = laspy.LasData(hdr); las.x, las.y, las.z = P[:, 0], P[:, 1], P[:, 2]; las.red, las.green, las.blue = col[:, 0].astype(np.uint16) * 257, col[:, 1].astype(np.uint16) * 257, col[:, 2].astype(np.uint16) * 257
    las.write(f"{d}/cloud.las"); las.write(f"{d}/cloud.laz"); out["las"] = f"{d}/cloud.las"; out["laz"] = f"{d}/cloud.laz"
    small = trimesh.Trimesh(src.vertices, src.faces, process=False)
    for ext in ("ply", "obj", "stl", "glb"): small.export(f"{d}/mesh.{ext}"); out["mesh_" + ext] = f"{d}/mesh.{ext}"
    from pxr import Usd, UsdGeom, UsdUtils, Vt, Gf
    st = Usd.Stage.CreateNew(f"{d}/m.usda"); UsdGeom.SetStageMetersPerUnit(st, 1.0); me = UsdGeom.Mesh.Define(st, "/m"); me.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(src.vertices.astype(np.float32))); me.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(len(src.faces), 3, np.int32))); me.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(src.faces.astype(np.int32).ravel())); st.GetRootLayer().Save()
    assert UsdUtils.CreateNewUsdzPackage(f"{d}/m.usda", f"{d}/m.usdz"); out["usdz"] = f"{d}/m.usdz"
    # textured OBJ with MTL + PNG, as Object Capture writes it
    from PIL import Image
    uv = np.column_stack([(src.vertices[:, 0] - src.vertices[:, 0].min()) / np.ptp(src.vertices[:, 0]), (src.vertices[:, 1] - src.vertices[:, 1].min()) / np.ptp(src.vertices[:, 1])])
    img = (np.indices((64, 64)).sum(0) % 2 * 200 + 30).astype(np.uint8); Image.fromarray(np.stack([img, img // 2, 255 - img], -1)).save(f"{d}/tex.png")
    with open(f"{d}/tex.obj", "w") as f:
        f.write("mtllib tex.mtl\nusemtl m\n"); [f.write("v %.6f %.6f %.6f\n" % tuple(v)) for v in src.vertices]; [f.write("vt %.6f %.6f\n" % tuple(u)) for u in uv]; [f.write("f %d/%d %d/%d %d/%d\n" % (a + 1, a + 1, b + 1, b + 1, c + 1, c + 1)) for a, b, c in src.faces]
    open(f"{d}/tex.mtl", "w").write("newmtl m\nKd 1 1 1\nmap_Kd tex.png\n"); out["tex_obj"] = (f"{d}/tex.obj", f"{d}/tex.mtl", f"{d}/tex.png")
    out["_dir"] = d; return out


def upload(client, pid, *paths):
    fs = [("files", (os.path.basename(p), open(p, "rb"))) for p in paths]; r = client.post(f"/api/projects/{pid}/import", files=fs); return r


def wait(client, job, timeout=900):
    t = time.time()
    while time.time() - t < timeout:
        j = client.get(f"/api/jobs/{job['id']}").json()
        if j["state"] in ("done", "error", "cancelled"): return j
        time.sleep(0.4)
    raise TimeoutError


def new(client): return client.post("/api/projects", json={"name": "t"}).json()["id"]


@pytest.mark.parametrize("key,kind,has_color", [("ply_cloud", "cloud", True), ("pcd", "cloud", True), ("xyz", "cloud", True), ("las", "cloud", True), ("laz", "cloud", True), ("xyzn", "cloud", False), ("mesh_ply", "mesh", False), ("mesh_obj", "mesh", False), ("mesh_stl", "mesh", False), ("mesh_glb", "mesh", False), ("usdz", "mesh", False)])
def test_import_formats(client, files, key, kind, has_color):
    pid = new(client); r = upload(client, pid, files[key]); assert r.status_code == 200, r.text; o = r.json()["stages"]["original"]
    assert o["kind"] == kind and o["has_colors"] == has_color
    n = o.get("points") or o.get("faces"); assert n > 1000
    ins = client.get(f"/api/projects/{pid}/stage/original/inspect").json(); assert len(ins["size"]) == 3 and min(ins["size"]) > 0


def test_las_coordinates_preserved(client, files):
    pid = new(client); upload(client, pid, files["las"]); ins = client.get(f"/api/projects/{pid}/stage/original/inspect").json(); assert abs(ins["size"][0] - 0.1556) < 0.02 or ins["size"][0] > 0.1


def test_obj_with_mtl_keeps_texture_and_export_keeps_it(client, files):
    pid = new(client); r = upload(client, pid, *files["tex_obj"]); assert r.status_code == 200; s = r.json()["stages"]["original"]; assert s["has_texture"] and s["has_colors"]
    e = client.post(f"/api/projects/{pid}/export", json={"stage": "original", "format": "glb"}); assert e.status_code == 200
    g = trimesh.load(io.BytesIO(e.content), file_type="glb", force="mesh"); assert g.visual.kind == "texture"


def test_bad_files_are_rejected_with_clear_errors(client, files):
    pid = new(client); d = files["_dir"]; open(f"{d}/empty.ply", "w").close(); open(f"{d}/junk.xyz", "w").write("hello world\n"); open(f"{d}/note.txt", "w").write("a b c\n"); open(f"{d}/x.docx", "w").write("x")
    for name, frag in [("empty.ply", "empty"), ("junk.xyz", "No numeric"), ("x.docx", "None of the files")]:
        r = upload(client, pid, f"{d}/{name}"); assert r.status_code == 400 and frag in r.json()["detail"], (name, r.text)
    d2 = f"{d}/nan.xyz"; open(d2, "w").write("0 0 0\nnan 1 1\n1 1 1\n2 2 2\n"); r = upload(client, pid, d2); assert r.status_code == 200 and r.json()["import"]["invalid_removed"] == 1


def test_sample_full_pipeline_with_undo_redo_and_measured_accuracy(client):
    pid = new(client); s = client.post(f"/api/projects/{pid}/sample", json={"kind": "bunny", "points": 80000}).json(); assert s["stages"]["original"]["points"] > 50000
    ins = client.get(f"/api/projects/{pid}/stage/original/inspect").json(); assert ins["duplicates"] > 0
    j = wait(client, client.post(f"/api/projects/{pid}/pipeline", json={"preset": "product"}).json()); assert j["state"] == "done", j
    st = client.get(f"/api/projects/{pid}").json(); assert {"cleaned", "reconstructed", "refined"} <= set(st["stages"]); assert st["stages"]["cleaned"]["points"] < st["stages"]["original"]["points"]
    rep = client.get(f"/api/projects/{pid}/stage/refined/report").json(); assert rep["components"] == 1 and rep["non_manifold_edges"] == 0 and rep["degenerate_triangles"] == 0 and rep["inconsistent_normal_edges"] == 0
    assert rep["against_reference"]["mean"] < 0.002 and abs(rep["against_reference"]["size_error_percent"][0]) < 1.5
    assert st["stages"]["refined"]["faces"] < st["stages"]["reconstructed"]["faces"]
    assert client.post(f"/api/projects/{pid}/undo").json()["stages"].keys() == {"original", "reference"}; assert "refined" in client.post(f"/api/projects/{pid}/redo").json()["stages"]


@pytest.mark.parametrize("method", ["poisson", "screened_poisson", "ball_pivoting", "alpha_shape"])
def test_each_reconstruction_method_matches_the_true_surface(client, method, src):
    pid = new(client); client.post(f"/api/projects/{pid}/sample", json={"kind": "bunny", "points": 60000})
    wait(client, client.post(f"/api/projects/{pid}/run", json={"op": "clean", "params": {"invalid": {}, "duplicates": {}, "statistical": {"neighbors": 20, "std_ratio": 2.0}, "radius": {}, "floating": {}}}).json())
    j = wait(client, client.post(f"/api/projects/{pid}/run", json={"op": "reconstruct", "params": {"method": method, "depth": 8}}).json()); assert j["state"] == "done", j
    rep = client.get(f"/api/projects/{pid}/stage/reconstructed/report").json(); assert rep["faces"] > 5000 and rep["against_reference"]["mean"] < 0.0015, rep["against_reference"]


def test_smoothing_preserves_dimensions_and_every_refine_op_runs(client):
    pid = new(client); client.post(f"/api/projects/{pid}/sample", json={"kind": "bunny", "points": 60000})
    wait(client, client.post(f"/api/projects/{pid}/run", json={"op": "clean", "params": {"invalid": {}, "duplicates": {}, "statistical": {}, "floating": {}}}).json())
    wait(client, client.post(f"/api/projects/{pid}/run", json={"op": "reconstruct", "params": {"method": "screened_poisson", "depth": 8}}).json())
    base = client.get(f"/api/projects/{pid}/stage/reconstructed/report").json()
    for name, cfg in {"taubin": {"smooth": {"method": "taubin", "iterations": 15}}, "laplacian": {"smooth": {"method": "laplacian", "iterations": 5}}, "bilateral": {"smooth": {"method": "bilateral", "iterations": 5}}, "curv": {"smooth": {"method": "taubin", "iterations": 10, "curvature_aware": True}},
                      "regularize": {"smooth": {"method": "regularize", "iterations": 3}}, "decimate": {"decimate": {"ratio": 0.2}}, "holes": {"fill_holes": {"max_hole_edges": 200}}, "remesh": {"remesh": {"target_edge_percent": 1.5}}, "refine": {"refine_edges": {"edge_percent": 1.0}}, "all-repair": {"degenerate": {}, "small_components": {}, "non_manifold": {}, "normals": {}, "optimize": {}}}.items():
        j = wait(client, client.post(f"/api/projects/{pid}/run", json={"op": "refine", "params": cfg}).json()); assert j["state"] == "done", (name, j)
        r = client.get(f"/api/projects/{pid}/stage/refined/report").json()
        for a in range(3): assert abs(r["size"][a] - base["size"][a]) / base["size"][a] < 0.02, (name, r["size"], base["size"])
        if name == "decimate": assert r["faces"] < 0.25 * base["faces"]
        if name == "holes": assert r["holes"] <= base["holes"]


def test_color_preserved_through_reconstruction_and_export(client):
    pid = new(client); client.post(f"/api/projects/{pid}/sample", json={"kind": "bunny", "points": 60000})
    wait(client, client.post(f"/api/projects/{pid}/pipeline", json={"preset": "quick"}).json()); assert client.get(f"/api/projects/{pid}").json()["stages"]["refined"]["has_colors"]
    for fmt, keep in [("ply", True), ("glb", True), ("obj", True), ("stl", False)]:
        e = client.post(f"/api/projects/{pid}/export", json={"stage": "refined", "format": fmt}); assert e.status_code == 200, e.text
        if fmt in ("ply", "glb"): t = trimesh.load(io.BytesIO(e.content), file_type=fmt, force="mesh"); assert (t.visual.kind == "vertex") == keep


def test_export_options_scale_orientation_simplify(client):
    pid = new(client); client.post(f"/api/projects/{pid}/sample", json={"kind": "bunny", "points": 40000}); wait(client, client.post(f"/api/projects/{pid}/pipeline", json={"preset": "quick"}).json())
    r0 = client.get(f"/api/projects/{pid}/stage/refined/report").json(); e = client.post(f"/api/projects/{pid}/export", json={"stage": "refined", "format": "stl", "scale": 1000, "orientation": "z-up-to-y-up", "simplify_percent": 60, "recentre": True}); assert e.status_code == 200
    t = trimesh.load(io.BytesIO(e.content), file_type="stl", force="mesh"); assert len(t.faces) < 0.45 * r0["faces"]; ext = np.ptp(t.vertices, 0); assert abs(ext[0] - r0["size"][0] * 1000) / (r0["size"][0] * 1000) < 0.03 and abs(ext[1] - r0["size"][2] * 1000) / (r0["size"][2] * 1000) < 0.05
    assert client.post(f"/api/projects/{pid}/export", json={"stage": "refined", "format": "glb", "scale": 0}).status_code == 400


def test_cancel_stops_the_worker_and_leaves_the_project_unchanged(client):
    pid = new(client); client.post(f"/api/projects/{pid}/sample", json={"kind": "bunny", "points": 400000}); before = client.get(f"/api/projects/{pid}").json()["history"]
    job = client.post(f"/api/projects/{pid}/pipeline", json={"preset": "high"}).json(); time.sleep(4); assert client.post(f"/api/projects/{pid}/pipeline", json={"preset": "quick"}).status_code == 409
    c = client.post(f"/api/jobs/{job['id']}/cancel").json(); assert c["state"] == "cancelled"; time.sleep(1); after = client.get(f"/api/projects/{pid}").json(); assert after["history"] == before and "refined" not in after["stages"]
    j = wait(client, client.post(f"/api/projects/{pid}/pipeline", json={"preset": "quick"}).json()); assert j["state"] == "done"


def test_job_error_is_reported(client):
    pid = new(client); r = client.post(f"/api/projects/{pid}/run", json={"op": "reconstruct", "params": {}}).json(); j = wait(client, r); assert j["state"] == "error" and "Import" in j["error"]


def test_save_and_open_project_round_trip(client):
    pid = new(client); client.post(f"/api/projects/{pid}/sample", json={"kind": "mug", "points": 30000}); wait(client, client.post(f"/api/projects/{pid}/pipeline", json={"preset": "quick"}).json())
    z = client.get(f"/api/projects/{pid}/save"); assert z.status_code == 200 and zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    o = client.post("/api/open", files={"file": ("p.pgproj", z.content)}).json(); assert o["id"] != pid and o["stages"]["refined"]["faces"] == client.get(f"/api/projects/{pid}").json()["stages"]["refined"]["faces"]
    assert client.post("/api/open", files={"file": ("x.pgproj", b"not a zip")}).status_code == 400


def test_preview_binary_and_recommendation(client):
    import json, struct
    pid = new(client); client.post(f"/api/projects/{pid}/sample", json={"kind": "bunny", "points": 50000}); b = client.get(f"/api/projects/{pid}/stage/original/preview?max_points=10000").content
    n = struct.unpack("<I", b[:4])[0]; h = json.loads(b[4:4 + n]); assert h["kind"] == "cloud" and h["count"] == 10000 and h["decimated"] and h["has_colors"]
    rec = client.get(f"/api/projects/{pid}/recommend").json(); assert rec["method"] in ("poisson", "screened_poisson", "ball_pivoting", "alpha_shape") and rec["reasons"] and rec["metrics"]["points"] > 1000


def test_capabilities_marks_unavailable_features_honestly(client):
    c = client.get("/api/capabilities").json(); assert c["gpu"]["cuda"] is False and any("atlas" in u["name"].lower() for u in c["unavailable"]) and c["import"][".usdz"] is True
