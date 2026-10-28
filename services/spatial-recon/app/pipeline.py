"""Reconstruction job: frames -> features -> matching -> SfM -> (depth -> depth-densified cloud -> Poisson mesh) -> exports.

Every output is produced from the uploaded data by the stages below. Stages that are switched off or cannot run are reported with their status
and the reason: nothing is substituted, nothing is simulated.
"""
from __future__ import annotations

import json
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import pycolmap

from . import cloud as pc
from .config import Settings
from .depth import DepthModel, colorize
from .frames import extract_frames, prepare_images
from .media import VideoInfo
from .sfm import ReconstructionFailed, SfmResult, run_sfm

STAGES = [("ingest", 5), ("features", 20), ("matching", 15), ("mapping", 35), ("depth", 10), ("densify", 5), ("mesh", 5), ("export", 5)]
SCALE = {"status": "relative", "metric": False, "note": "Structure from motion recovers shape only up to an unknown scale. All coordinates are in arbitrary 'model units'. Distances are NOT metres or feet. Enter a known real distance in the viewer to calibrate a scale for measurements."}


@dataclass
class Params:
    max_frames: int = 90
    image_size: int = 800
    depth: bool = True
    densify: bool = True
    mesh: bool = True
    keyframes: int = 10


@dataclass
class Artifact:
    name: str
    kind: str  # point_cloud | mesh | camera_data | depth_map | image | report | features | matches
    description: str
    provenance: str
    status: str = "pending"  # available | processing | failed | unsupported | not_requested | pending
    path: Path | None = None
    fmt: str = ""
    detail: str = ""
    extra: dict = field(default_factory=dict)

    def public(self, base: str) -> dict:
        size = self.path.stat().st_size if self.path and self.path.is_file() else None
        return {"name": self.name, "kind": self.kind, "format": self.fmt, "description": self.description, "provenance": self.provenance, "status": self.status if (self.status != "available" or size) else "failed",
                "detail": self.detail, "size_bytes": size, "url": f"{base}/{self.name}" if self.status == "available" and size else None, **self.extra}


class Cancelled(Exception):
    pass


def _camera_records(rec, names_meta: dict[str, dict]) -> tuple[list[dict], list[dict], np.ndarray]:
    regs, unregs, downs = [], [], []
    seen = set()
    for im in sorted(rec.images.values(), key=lambda i: i.name):
        if not im.has_pose:
            continue
        seen.add(im.name)
        T = im.cam_from_world()
        R = T.rotation.matrix()
        c = np.asarray(im.projection_center())
        downs.append(R.T @ np.array([0.0, 1.0, 0.0]))  # camera "down" axis in world coordinates
        meta = names_meta.get(im.name, {})
        cam = rec.cameras[im.camera_id]
        regs.append({"name": im.name, "frame_index": meta.get("frame_index"), "time_s": meta.get("time_s"), "center": [float(v) for v in c], "rotation_cam_from_world": [[float(v) for v in r] for r in R],
                     "translation": [float(v) for v in T.translation], "viewing_direction": [float(v) for v in R.T @ np.array([0.0, 0.0, 1.0])], "points3d_observed": int(im.num_points3D),
                     "camera": {"model": cam.model.name, "width": int(cam.width), "height": int(cam.height), "params": [float(v) for v in cam.params], "focal_px": float(cam.mean_focal_length())}})
    for n, m in names_meta.items():
        if n not in seen:
            unregs.append({"name": n, "frame_index": m.get("frame_index"), "time_s": m.get("time_s")})
    down = np.mean(downs, 0) if downs else np.array([0, 1.0, 0])
    nrm = np.linalg.norm(down)
    up = -down / nrm if nrm > 1e-9 else np.array([0, -1.0, 0])
    return regs, unregs, up


def _align_depth(rec, im, depth: np.ndarray):
    """Fit 1/z = a*d + b between the model's relative inverse depth d and the SfM depths z of this image's triangulated points.
    The fit is judged on ALL triangulated points of the image, in depth (not in inverse depth): returns (a, b, n_points, fraction_within_25_percent, z_max, z_min) or None when the image has too few points or the fit is not credible."""
    T = im.cam_from_world()
    R, t = T.rotation.matrix(), np.asarray(T.translation)
    xs, zs = [], []
    for p2 in im.points2D:
        if p2.has_point3D():
            z = float((R @ rec.points3D[p2.point3D_id].xyz + t)[2])
            if z > 1e-6:
                xs.append(p2.xy)
                zs.append(z)
    if len(xs) < 40:
        return None
    xs, zs = np.array(xs), np.array(zs)
    h, w = depth.shape
    d = depth[np.clip(xs[:, 1].astype(int), 0, h - 1), np.clip(xs[:, 0].astype(int), 0, w - 1)]
    inv = 1.0 / zs

    def rel_err(a, b):
        den = a * d + b
        pred = np.where(den > 1e-9, 1.0 / np.maximum(den, 1e-9), np.inf)
        return np.abs(pred - zs) / zs

    rng = np.random.default_rng(0)
    best = None
    for _ in range(400):
        i, j = rng.choice(len(d), 2, replace=False)
        if abs(d[i] - d[j]) < 1e-6:
            continue
        a = (inv[i] - inv[j]) / (d[i] - d[j])
        b = inv[i] - a * d[i]
        if a <= 0 or b < -1e-3:
            continue
        inl = rel_err(a, b) < 0.2
        if best is None or inl.sum() > best[0].sum():
            best = (inl, a, b)
    if best is None or best[0].sum() < 15:
        return None
    inl = best[0]
    for _ in range(3):  # refit on the inliers, then recompute them
        A = np.stack([d[inl], np.ones(inl.sum())], 1)
        (a, b), *_ = np.linalg.lstsq(A * zs[inl][:, None], np.ones(int(inl.sum())), rcond=None)  # minimise z*(a*d+b) - 1: the RELATIVE depth error, not the inverse-depth error
        if a <= 0:
            return None
        inl = rel_err(a, b) < 0.2
        if inl.sum() < 15:
            return None
    frac = float((rel_err(a, b) < 0.25).mean())
    return float(a), float(b), int(len(zs)), frac, float(zs.max()), float(zs.min())


def _backproject(rec, im, depth: np.ndarray, a: float, b: float, zmax: float, zmin: float, bgr: np.ndarray, stride: int) -> pc.Cloud | None:
    cam = rec.cameras[im.camera_id]
    h, w = depth.shape
    ys, xs = np.mgrid[stride // 2:h:stride, stride // 2:w:stride]
    uv = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1).astype(np.float64)
    inv = a * depth[ys.ravel(), xs.ravel()] + b
    ok = (inv > 1.0 / (3.0 * zmax)) & (inv < 1.0 / (0.5 * zmin))  # keep depths between half the nearest and three times the farthest SfM point of this image
    uv, inv = uv[ok], inv[ok]
    z = 1.0 / inv
    ray = np.asarray(cam.cam_from_img(uv))  # normalised image coordinates (x/z, y/z), distortion removed
    Xc = np.concatenate([ray * z[:, None], z[:, None]], 1)
    T = im.cam_from_world()
    Xw = (Xc - T.translation) @ T.rotation.matrix()  # R^T (Xc - t)
    col = bgr[np.clip(uv[:, 1].astype(int), 0, h - 1), np.clip(uv[:, 0].astype(int), 0, w - 1)][:, ::-1]
    good = np.isfinite(Xw).all(1)
    return pc.Cloud(Xw[good].astype(np.float32), col[good].astype(np.uint8))


def _match_figures(sfm: SfmResult, work: Path, out: Path, n_pairs: int = 3) -> tuple[list[dict], list[dict]]:
    """Inlier counts between neighbouring registered frames (tracking quality) and side-by-side match images for a few pairs."""
    d = pycolmap.Database.open(str(sfm.db)) if hasattr(pycolmap.Database, "open") else pycolmap.Database(str(sfm.db))
    pairs, figs = [], []
    try:
        regs = sorted([i for i in sfm.rec.images.values() if i.has_pose], key=lambda i: i.name)
        ids = {i.name: d.read_image_with_name(i.name).image_id for i in regs}
        for a, b in zip(regs[:-1], regs[1:]):
            try:
                n = int(len(d.read_two_view_geometry(ids[a.name], ids[b.name]).inlier_matches))
            except Exception:  # noqa: BLE001
                n = 0
            pairs.append({"a": a.name, "b": b.name, "inliers": n})
        if pairs:
            order = np.argsort([-p["inliers"] for p in pairs])
            picks = sorted(set([int(order[0]), int(order[len(order) // 2]), int(order[-1])]))[:n_pairs]
            for k in picks:
                pa, pb = pairs[k]["a"], pairs[k]["b"]
                tg = d.read_two_view_geometry(ids[pa], ids[pb])
                m = np.asarray(tg.inlier_matches)
                ka, kb = d.read_keypoints(ids[pa]), d.read_keypoints(ids[pb])
                ia, ib = cv2.imread(str(work / "images" / pa)), cv2.imread(str(work / "images" / pb))
                H = max(ia.shape[0], ib.shape[0])
                canvas = np.zeros((H, ia.shape[1] + ib.shape[1], 3), np.uint8)
                canvas[:ia.shape[0], :ia.shape[1]] = ia
                canvas[:ib.shape[0], ia.shape[1]:] = ib
                step = max(1, len(m) // 80)
                for (i1, i2) in m[::step]:
                    p1 = (int(ka[i1][0]), int(ka[i1][1])); p2 = (int(kb[i2][0] + ia.shape[1]), int(kb[i2][1]))
                    hue = int(np.hypot(p2[0] - p1[0], p2[1] - p1[1])) % 180
                    col = tuple(int(c) for c in cv2.cvtColor(np.array([[[hue, 220, 255]]], np.uint8), cv2.COLOR_HSV2BGR)[0, 0])
                    cv2.line(canvas, p1, p2, col, 1, cv2.LINE_AA)
                    cv2.circle(canvas, p1, 2, (0, 255, 255), -1); cv2.circle(canvas, p2, 2, (0, 255, 255), -1)
                name = f"matches_{pa[:-4]}_{pb[:-4]}.jpg"
                cv2.imwrite(str(out / name), canvas, [cv2.IMWRITE_JPEG_QUALITY, 88])
                figs.append({"name": name, "a": pa, "b": pb, "inlier_matches": int(len(m)), "drawn": int(len(m[::step]))})
    finally:
        d.close()
    return pairs, figs


def feature_points(sfm: SfmResult, limit_frames: int = 12, per_frame: int = 400) -> list[dict]:
    regs = sorted([i for i in sfm.rec.images.values() if i.has_pose], key=lambda i: i.name)
    pick = regs[:: max(1, len(regs) // limit_frames)][:limit_frames]
    out = []
    for im in pick:
        pts = [(p.xy, p.has_point3D()) for p in im.points2D]
        tracked = [p for p in pts if p[1]]
        rest = [p for p in pts if not p[1]]
        sel = (tracked + rest[: max(0, per_frame - len(tracked))])[:per_frame]
        out.append({"image": im.name, "points": [[round(float(p[0][0]), 1), round(float(p[0][1]), 1), 1 if p[1] else 0] for p in sel], "keypoints_total": len(pts), "triangulated": len(tracked)})
    return out


def run_reconstruction(work: Path, input_files: list[Path], is_video: bool, video_info: VideoInfo | None, params: Params, s: Settings, depth_model: DepthModel | None, token, status_cb, artifacts: dict[str, Artifact], cancelled) -> dict:
    """status_cb(stage, state, detail) reports stage transitions; returns the report dict."""
    t_all = time.perf_counter()
    out = work / "out"
    out.mkdir(exist_ok=True)
    images = work / "images"
    stage_info: dict[str, dict] = {}

    def stage(name, state, detail="", secs=None):
        stage_info[name] = {"state": state, "detail": detail, **({"seconds": round(secs, 2)} if secs is not None else {})}
        status_cb(name, state, detail)

    def reg(a: Artifact) -> Artifact:
        artifacts[a.name] = a
        return a

    # ---- ingest -----------------------------------------------------------------------------------------------------
    stage("ingest", "running", "extracting frames" if is_video else "reading images")
    t = time.perf_counter()
    try:
        if is_video:
            meta, sel_info = extract_frames(input_files[0], images, min(params.max_frames, s.max_frames), params.image_size, cancelled)
        else:
            meta = prepare_images(input_files, images, params.image_size)
    except InterruptedError:
        raise Cancelled from None
    except ValueError as e:
        stage("ingest", "failed", str(e))
        raise ReconstructionFailed(str(e)) from None
    if len(meta) < 3:
        stage("ingest", "failed", "fewer than three usable images")
        raise ReconstructionFailed("Fewer than three usable images were found. Structure from motion needs at least three overlapping views.")
    names_meta = {m["name"]: m for m in meta}
    stage("ingest", "done", f"{len(meta)} keyframes chosen from {sel_info['candidates']} candidate frames by feature tracking" if is_video else f"{len(meta)} images read", time.perf_counter() - t)
    # frame thumbnails for the source-media strip
    for m in meta:
        im = cv2.imread(str(images / m["name"]))
        h, w = im.shape[:2]
        cv2.imwrite(str(out / f"thumb_{m['name']}"), cv2.resize(im, (240, round(240 * h / w))), [cv2.IMWRITE_JPEG_QUALITY, 80])
    warnings: list[str] = []
    if is_video and video_info and video_info.fps and len(meta) >= 2:
        warnings.append("Keyframes were chosen by tracking features through the video, so consecutive keyframes overlap strongly whatever the camera speed." + (f" The video produced more keyframes than the limit; {sel_info['subsampled_to']} were kept, evenly spread, which may reduce overlap." if "subsampled_to" in sel_info else ""))

    # ---- SfM --------------------------------------------------------------------------------------------------------
    sequential = is_video or len(meta) > 40

    def sfm_stage(name, p=None):
        stage(name, "running")
    for n in ("features", "matching", "mapping"):
        stage_info[n] = {"state": "pending", "detail": ""}
    t = time.perf_counter()
    try:
        sfm = run_sfm(images, work, [m["name"] for m in meta], sequential, s.threads, s.max_runtime_seconds, token, sfm_stage)
    except InterruptedError:
        raise Cancelled from None
    except ReconstructionFailed as e:
        for n in ("features", "matching", "mapping"):
            if stage_info[n]["state"] == "running":
                stage(n, "failed", str(e))
        raise
    for n in ("features", "matching", "mapping"):
        stage(n, "done", sfm.stats["matching"] if n == "matching" else "", sfm.stage_seconds.get(n))
    warnings += sfm.warnings
    rec = sfm.rec

    # ---- camera data, sparse cloud, quality ---------------------------------------------------------------------------
    stage("export", "running", "writing sparse results")
    regs, unregs, up = _camera_records(rec, names_meta)
    centers = np.array([r["center"] for r in regs])
    order = sorted(range(len(regs)), key=lambda i: (regs[i]["frame_index"] if regs[i]["frame_index"] is not None else i))
    path_len = float(sum(np.linalg.norm(centers[order[k + 1]] - centers[order[k]]) for k in range(len(order) - 1))) if len(order) > 1 else 0.0
    cams_json = {"coordinate_system": {"world": "COLMAP world frame: arbitrary origin, orientation and scale (up to a similarity)", "camera": "x right, y down, z forward (OpenCV convention)", "pose": "rotation_cam_from_world and translation map a world point X to the camera frame: Xc = R·X + t",
                                       "up_vector_estimate": [float(v) for v in up], "up_note": "Estimated from the average camera 'down' axis; not gravity-calibrated."}, "scale": SCALE, "registered": regs, "not_registered": unregs}
    (out / "cameras.json").write_text(json.dumps(cams_json))
    reg(Artifact("cameras.json", "camera_data", "Estimated camera poses and intrinsics for every registered frame (relative scale)", "estimated by COLMAP incremental SfM from the uploaded frames", "available", out / "cameras.json", "json"))
    traj = {"scale": SCALE, "units": "model units (arbitrary)", "path_length_model_units": path_len, "positions": [{"name": regs[i]["name"], "time_s": regs[i]["time_s"], "center": regs[i]["center"]} for i in order]}
    (out / "trajectory.json").write_text(json.dumps(traj))
    reg(Artifact("trajectory.json", "camera_data", "Camera trajectory (ordered camera centres), relative scale", "estimated by COLMAP incremental SfM", "available", out / "trajectory.json", "json"))

    P = [(p.xyz, p.color, p.error, p.track.length()) for p in rec.points3D.values()]
    keep = [x for x in P if x[3] >= 3 and x[2] <= 2.5]
    if len(keep) < 30:
        keep = P
    sparse = pc.Cloud(np.array([k[0] for k in keep], np.float32), np.array([k[1] for k in keep], np.uint8))
    pc.write_ply(out / "points_sparse.ply", sparse)
    reg(Artifact("points_sparse.ply", "point_cloud", f"Sparse point cloud: {len(keep):,} triangulated points seen in at least 3 frames with reprojection error ≤ 2.5 px (of {len(P):,})", "triangulated by COLMAP from matched features of the uploaded frames", "available", out / "points_sparse.ply", "ply", extra={"points": len(keep), "relative_scale": True}))

    pairs, figs = _match_figures(sfm, work, out)
    (out / "tracking.json").write_text(json.dumps({"consecutive_pair_inliers": pairs, "features": feature_points(sfm)}))
    reg(Artifact("tracking.json", "features", "Feature points per frame (triangulated or not) and the number of verified matches between neighbouring frames", "SIFT features and geometric verification by COLMAP", "available", out / "tracking.json", "json"))
    for f in figs:
        reg(Artifact(f["name"], "matches", f"Verified feature matches between {f['a']} and {f['b']} ({f['inlier_matches']} inliers; {f['drawn']} drawn)", "SIFT matches verified by COLMAP two-view geometry", "available", out / f["name"], "jpg", extra={"pair": [f["a"], f["b"]]}))
    weak = [p for p in pairs if p["inliers"] < 30]
    if weak:
        warnings.append(f"{len(weak)} of {len(pairs)} neighbouring frame pairs share fewer than 30 verified matches: the track is weak there (little overlap, blur or lighting change).")
    stage("export", "running", "sparse results written")

    # ---- depth -------------------------------------------------------------------------------------------------------------
    keyframes = [i for i in regs[:: max(1, len(regs) // params.keyframes)]][: params.keyframes]
    depth_for: dict[str, np.ndarray] = {}
    for kf in keyframes:
        reg(Artifact(f"depth_{kf['name'][:-4]}.jpg", "depth_map", f"Relative depth of {kf['name']} (colour = nearer to farther; NOT metric)", "predicted by Depth Anything V2 Small from this frame (learned relative depth)", "pending", out / f"depth_{kf['name'][:-4]}.jpg", "jpg", extra={"depth_type": "relative inverse depth from a learned model", "frame": kf["name"]}))
    if not params.depth:
        stage("depth", "skipped", "not requested")
        for a in artifacts.values():
            if a.kind == "depth_map":
                a.status, a.detail = "not_requested", "Depth estimation was not requested."
    elif depth_model is None:
        stage("depth", "unsupported", "The depth model file is not installed on this server")
        for a in artifacts.values():
            if a.kind == "depth_map":
                a.status, a.detail = "unsupported", "The depth model is not installed on this server."
        warnings.append("Depth estimation is unavailable on this server (model file missing).")
    else:
        stage("depth", "running", f"{len(keyframes)} keyframes")
        t = time.perf_counter()
        for kf in keyframes:
            if cancelled():
                raise Cancelled
            try:
                bgr = cv2.imread(str(images / kf["name"]))
                d = depth_model.predict(bgr)
                depth_for[kf["name"]] = d
                cv2.imwrite(str(out / f"depth_{kf['name'][:-4]}.jpg"), colorize(d), [cv2.IMWRITE_JPEG_QUALITY, 90])
                artifacts[f"depth_{kf['name'][:-4]}.jpg"].status = "available"
            except Exception as e:  # noqa: BLE001
                artifacts[f"depth_{kf['name'][:-4]}.jpg"].status, artifacts[f"depth_{kf['name'][:-4]}.jpg"].detail = "failed", f"Depth model failed ({type(e).__name__})."
        stage("depth", "done", f"{len(depth_for)} depth maps", time.perf_counter() - t)

    # ---- depth-densified cloud + mesh ------------------------------------------------------------------------------------
    dense = None
    dense_art = reg(Artifact("points_dense.ply", "point_cloud", "Densified point cloud (approximate): learned relative depth, aligned to the SfM points of each keyframe and back-projected", "depth-model densification aligned to COLMAP geometry. NOT multi-view stereo: surfaces between the sparse points are estimated by a neural network, one surface per keyframe, and the surfaces of different keyframes are not reconciled, so seams and slab-like layers are visible", "pending", out / "points_dense.ply", "ply", extra={"relative_scale": True, "approximate": True}))
    mesh_art = reg(Artifact("mesh.glb", "mesh", "Surface mesh (approximate) from the densified cloud by Poisson surface reconstruction", "Poisson reconstruction (COLMAP) of the depth-densified points: smooth, may close gaps and contain invented surface where data is missing", "pending", out / "mesh.glb", "glb", extra={"relative_scale": True, "approximate": True}))
    mesh_ply = reg(Artifact("mesh.ply", "mesh", "Same mesh as PLY with vertex colours", "as mesh.glb", "pending", out / "mesh.ply", "ply", extra={"relative_scale": True, "approximate": True}))
    if not params.densify or not depth_for:
        why = "not requested" if not params.densify else "needs depth maps, which are unavailable"
        stage("densify", "skipped" if not params.densify else "unsupported", why)
        for a in (dense_art, mesh_art, mesh_ply):
            a.status, a.detail = ("not_requested" if not params.densify else "unsupported"), f"Densification {why}."
        stage("mesh", "skipped", why)
    else:
        stage("densify", "running")
        t = time.perf_counter()
        chunks, used, skipped = [], 0, []
        by_name = {i.name: i for i in rec.images.values() if i.has_pose}
        for nm, d in depth_for.items():
            if cancelled():
                raise Cancelled
            im = by_name[nm]
            fit = _align_depth(rec, im, d)
            if fit is None or fit[3] < 0.5:
                skipped.append(nm)
                continue
            a, b, npts, frac_ok, zmax, zmin = fit
            bgr = cv2.imread(str(images / nm))
            c = _backproject(rec, im, d, a, b, zmax, zmin, bgr, stride=max(2, round(max(d.shape) / 400)))
            if c is not None and len(c.points):
                chunks.append(c)
                used += 1
        if skipped:
            warnings.append(f"The depth of {len(skipped)} keyframe(s) did not agree with the SfM geometry well enough (fewer than half of that frame's triangulated points within 25 % of the depth model's prediction), so they were left out of the densified cloud.")
        if not chunks:
            stage("densify", "failed", "no keyframe could be aligned")
            for a in (dense_art, mesh_art, mesh_ply):
                a.status, a.detail = "failed", "No keyframe depth could be aligned to the SfM geometry."
            stage("mesh", "skipped", "no densified cloud")
        else:
            allc = pc.Cloud(np.concatenate([c.points for c in chunks]), np.concatenate([c.colors for c in chunks]))
            ext = np.linalg.norm(allc.points.max(0) - allc.points.min(0))
            allc = pc.voxel_downsample(allc, ext / 700)
            try:
                allc = pc.statistical_outlier_removal(allc, 16, 2.0)
            except pc.CloudError:
                pass
            dense = allc
            pc.write_ply(out / "points_dense.ply", allc)
            dense_art.status, dense_art.extra["points"] = "available", int(len(allc.points))
            dense_art.detail = f"{len(allc.points):,} points from {used} keyframes"
            stage("densify", "done", dense_art.detail, time.perf_counter() - t)

            stage("mesh", "running")
            t = time.perf_counter()
            try:
                import trimesh
                nrm = pc.estimate_normals(allc, 24, centers)
                pc.write_ply(work / "dense_normals.ply", nrm)
                opts = pycolmap.PoissonMeshingOptions()
                opts.depth = 8
                opts.trim = 8.0
                opts.num_threads = s.threads if s.threads > 0 else 4
                pycolmap.poisson_meshing(str(work / "dense_normals.ply"), str(out / "mesh.ply"), opts)
                m = trimesh.load(str(out / "mesh.ply"), process=False)
                if len(m.faces) == 0:
                    raise RuntimeError("empty mesh")
                if len(m.vertices) > 800_000:
                    raise RuntimeError("mesh too large")
                m.export(str(out / "mesh.glb"))
                mesh_art.status = mesh_ply.status = "available"
                mesh_art.extra.update(vertices=int(len(m.vertices)), faces=int(len(m.faces)))
                mesh_ply.extra.update(vertices=int(len(m.vertices)), faces=int(len(m.faces)))
                mesh_art.detail = mesh_ply.detail = f"{len(m.vertices):,} vertices, {len(m.faces):,} faces"
                stage("mesh", "done", mesh_art.detail, time.perf_counter() - t)
            except Exception as e:  # noqa: BLE001
                for a in (mesh_art, mesh_ply):
                    a.status, a.detail = "failed", f"Mesh reconstruction failed ({type(e).__name__}). The point clouds are still available."
                stage("mesh", "failed", f"{type(e).__name__}")
                warnings.append("Mesh reconstruction failed for this cloud; the point clouds are unaffected.")
    if not params.mesh and mesh_art.status != "available":
        pass

    # ---- frames for the source viewer + report ----------------------------------------------------------------------------------
    for m in meta:
        reg(Artifact(f"frame_{m['name']}", "image", f"Source frame {m['name']}" + (f" (t = {m['time_s']} s)" if m["time_s"] is not None else ""), "extracted from the uploaded video" if is_video else "uploaded image, resized", "available", images / m["name"], "jpg",
                     extra={"frame": m["name"], "thumb": f"thumb_{m['name']}", "registered": m["name"] in {r["name"] for r in regs}}))
        reg(Artifact(f"thumb_{m['name']}", "image", f"Thumbnail of {m['name']}", "derived from the frame", "available", out / f"thumb_{m['name']}", "jpg"))
    report = {"scale": SCALE, "quality": sfm.stats, "frames": meta, "registered": [r["name"] for r in regs], "not_registered": [u["name"] for u in unregs], "path_length_model_units": path_len, "up_vector_estimate": [float(v) for v in up],
              "bounding_box_sparse": pc.stats(sparse.points), "stages": stage_info, "warnings": warnings, "total_seconds": round(time.perf_counter() - t_all, 1),
              "limitations": ["Relative scale: no distance is metric until you calibrate one with a known reference.", "The densified cloud and the mesh are approximations built on learned depth, not multi-view stereo: each keyframe contributes its own surface and they are not reconciled, so seams and slab-like layers appear.", "Moving objects in the scene (cars, people) corrupt the geometry where they appear."]}
    (out / "report.json").write_text(json.dumps(report))
    reg(Artifact("report.json", "report", "Reconstruction report: quality statistics, stage timings, warnings and limitations", "computed by this service", "available", out / "report.json", "json"))
    stage("export", "done", "", None)
    return report
