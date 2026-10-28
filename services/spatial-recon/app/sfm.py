"""Structure from motion with COLMAP (pycolmap, BSD-3-Clause): SIFT features, matching, incremental mapping with bundle adjustment.
CPU only. Nothing is simulated: if the images do not overlap enough, the reconstruction fails and says so."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pycolmap

pycolmap.logging.minloglevel = 3


class ReconstructionFailed(RuntimeError):
    """Reconstruction was not possible; the message explains why and what to change."""


@dataclass
class SfmResult:
    rec: "pycolmap.Reconstruction"
    db: Path
    stats: dict
    warnings: list[str] = field(default_factory=list)
    stage_seconds: dict[str, float] = field(default_factory=dict)


def run_sfm(images: Path, work: Path, names: list[str], sequential: bool, threads: int, max_runtime: int, token, stage_cb=lambda s, p=None: None) -> SfmResult:
    t0 = time.perf_counter()
    db = work / "db.db"
    db.unlink(missing_ok=True)
    warnings: list[str] = []
    secs: dict[str, float] = {}
    th = threads if threads > 0 else 4

    stage_cb("features")
    ro = pycolmap.ImageReaderOptions()
    ro.camera_model = "SIMPLE_RADIAL"
    eo = pycolmap.FeatureExtractionOptions()
    eo.num_threads = th
    eo.sift.max_num_features = 4096
    t = time.perf_counter()
    pycolmap.extract_features(str(db), str(images), image_names=names, camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro, extraction_options=eo, device=pycolmap.Device.cpu, cancellation_token=token)
    secs["features"] = time.perf_counter() - t
    if token.is_cancelled:
        raise InterruptedError

    d = pycolmap.Database.open(str(db)) if hasattr(pycolmap.Database, "open") else pycolmap.Database(str(db))
    try:
        imgs = {i.name: i.image_id for i in d.read_all_images()}
        nfeat = {n: d.read_keypoints(i).shape[0] for n, i in imgs.items()}
    finally:
        d.close()
    low = [n for n, c in nfeat.items() if c < 150]
    if low:
        warnings.append(f"{len(low)} of {len(names)} frames have very few distinct features (under 150): blank walls, glare or heavy blur. They will probably not register.")

    stage_cb("matching")
    t = time.perf_counter()
    if sequential:
        po = pycolmap.SequentialPairingOptions()
        po.overlap = 8
        po.quadratic_overlap = True
        pycolmap.match_sequential(str(db), pairing_options=po, device=pycolmap.Device.cpu, cancellation_token=token)
    else:
        pycolmap.match_exhaustive(str(db), device=pycolmap.Device.cpu, cancellation_token=token)
    secs["matching"] = time.perf_counter() - t
    if token.is_cancelled:
        raise InterruptedError

    stage_cb("mapping")
    t = time.perf_counter()
    opts = pycolmap.IncrementalPipelineOptions()
    opts.num_threads = th
    opts.min_model_size = 6  # COLMAP may start a second, tiny model after a failed initial pair; the largest model is kept
    opts.max_runtime_seconds = max(30, int(max_runtime - (time.perf_counter() - t0)))
    out = work / "sparse"
    out.mkdir(exist_ok=True)
    maps = pycolmap.incremental_mapping(str(db), str(images), str(out), opts, cancellation_token=token)
    secs["mapping"] = time.perf_counter() - t
    if token.is_cancelled:
        raise InterruptedError
    if not maps:
        raise ReconstructionFailed(f"No 3D model could be built from these {len(names)} images. They probably do not overlap enough, or the scene has too little texture. "
                                   "Capture a slower, smoother path in which each frame shares most of its view with the next one, avoid blank walls and glare, and avoid fast turns.")
    rec = max(maps.values(), key=lambda r: r.num_reg_images())
    reg = rec.num_reg_images()
    if reg < 3 or rec.num_points3D() < 30:
        raise ReconstructionFailed(f"Only {reg} of {len(names)} images could be placed in a common 3D model ({rec.num_points3D()} points). That is not a reconstruction. "
                                   "The images do not overlap enough: capture a slower, smoother path with at least 60 % overlap between consecutive frames.")
    if reg < 0.6 * len(names):
        warnings.append(f"Only {reg} of {len(names)} images were registered. The camera path covers part of the footage; the rest had too little overlap or texture.")
    tl = rec.compute_mean_track_length()
    err = rec.compute_mean_reprojection_error()
    if err > 1.5:
        warnings.append(f"The mean reprojection error is {err:.2f} px, which is high: the geometry is less reliable than usual (moving objects, rolling shutter or poor calibration are common causes).")
    stats = {"images_total": len(names), "images_registered": reg, "registered_fraction": round(reg / len(names), 3), "points3d": rec.num_points3D(), "mean_reprojection_error_px": round(float(err), 3),
             "mean_track_length": round(float(tl), 2), "mean_observations_per_image": round(float(rec.compute_mean_observations_per_reg_image()), 1),
             "matching": "sequential (neighbouring frames)" if sequential else "exhaustive (all pairs)", "features_per_image_median": int(np.median(list(nfeat.values()))), "low_feature_images": len(low)}
    return SfmResult(rec, db, stats, warnings, secs)
