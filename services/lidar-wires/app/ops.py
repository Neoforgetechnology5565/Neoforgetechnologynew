"""Preprocessing operations. Each returns a new PointCloud and keeps attributes aligned; parameters are in the cloud's coordinate units."""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

from .cloud import CloudError, PointCloud


def voxel_downsample(pc: PointCloud, voxel: float) -> PointCloud:
    """Keeps, per occupied voxel, the original point closest to the voxel's centroid (so attributes stay real measurements, not averages)."""
    if not voxel > 0:
        raise CloudError("The voxel size must be positive.")
    lo = pc.xyz.min(0)
    key = np.floor((pc.xyz - lo) / voxel).astype(np.int64)
    if key.max() > 2_000_000:
        raise CloudError("The voxel size is too small for this cloud's extent.")
    lin = (key[:, 0] * 2_000_003 + key[:, 1]) * 2_000_003 + key[:, 2]
    uniq, inv = np.unique(lin, return_inverse=True)
    cen = np.stack([np.bincount(inv, pc.xyz[:, i] - lo[i]) for i in range(3)], 1) / np.bincount(inv)[:, None] + lo
    d = np.linalg.norm(pc.xyz - cen[inv], axis=1)
    order = np.lexsort((d, inv))
    first = order[np.r_[0, np.nonzero(np.diff(inv[order]))[0] + 1]]
    return pc.take(np.sort(first))


def statistical_outlier_removal(pc: PointCloud, k: int = 16, std_ratio: float = 2.0) -> PointCloud:
    if len(pc) <= k + 1:
        raise CloudError("Too few points for this neighbourhood size.")
    if not (1 <= k <= 200) or not (0.1 <= std_ratio <= 10):
        raise CloudError("k must be 1-200 and the standard-deviation ratio 0.1-10.")
    d, _ = cKDTree(pc.xyz).query(pc.xyz, k=k + 1)
    m = d[:, 1:].mean(1)
    return pc.take(np.nonzero(m <= m.mean() + std_ratio * m.std())[0])


def radius_outlier_removal(pc: PointCloud, radius: float, min_neighbors: int = 4) -> PointCloud:
    if not radius > 0:
        raise CloudError("The radius must be positive.")
    cnt = cKDTree(pc.xyz).query_ball_point(pc.xyz, radius, return_length=True)
    return pc.take(np.nonzero(cnt - 1 >= min_neighbors)[0])


def crop(pc: PointCloud, lo, hi) -> PointCloud:
    lo, hi = np.asarray(lo, np.float64), np.asarray(hi, np.float64)
    if lo.shape != (3,) or hi.shape != (3,) or not np.isfinite(lo).all() or not np.isfinite(hi).all() or (lo >= hi).any():
        raise CloudError("The crop box must have min < max on all three axes.")
    keep = np.nonzero(((pc.xyz >= lo) & (pc.xyz <= hi)).all(1))[0]
    if len(keep) == 0:
        raise CloudError("The crop box contains no points.")
    return pc.take(keep)


def estimate_normals(pc: PointCloud, k: int = 20) -> PointCloud:
    if not (3 <= k <= 100):
        raise CloudError("k must be 3-100.")
    if len(pc) <= k:
        raise CloudError("Too few points for this neighbourhood size.")
    ctr = pc.xyz.mean(0)
    x = pc.xyz - ctr
    _, idx = cKDTree(x).query(x, k=k)
    nb = x[idx] - x[idx].mean(1, keepdims=True)
    cov = np.einsum("nki,nkj->nij", nb, nb) / k
    _, vec = np.linalg.eigh(cov)
    n = vec[:, :, 0].astype(np.float32)
    n[n[:, 2] < 0] *= -1  # orient upwards (airborne data); a documented convention, not a measurement
    out = pc.take(np.arange(len(pc)))
    out.normals = n
    return out


def apply(pc: PointCloud, op: dict, units_per_metre: float) -> tuple[PointCloud, str]:
    """Run one operation dict {op, ...}. Returns (new cloud, human-readable description)."""
    name = op.get("op")
    try:
        if name == "voxel_downsample":
            v = float(op["voxel"])
            return voxel_downsample(pc, v), f"voxel downsample {v:g}"
        if name == "statistical_outlier_removal":
            k, s = int(op.get("k", 16)), float(op.get("std_ratio", 2.0))
            return statistical_outlier_removal(pc, k, s), f"statistical outlier removal (k={k}, std={s:g})"
        if name == "radius_outlier_removal":
            r, m = float(op["radius"]), int(op.get("min_neighbors", 4))
            return radius_outlier_removal(pc, r, m), f"radius outlier removal (r={r:g}, min neighbours={m})"
        if name == "crop":
            return crop(pc, op["min"], op["max"]), "crop to box"
        if name == "estimate_normals":
            k = int(op.get("k", 20))
            return estimate_normals(pc, k), f"normal estimation (k={k})"
    except (KeyError, TypeError, ValueError) as e:
        if isinstance(e, CloudError):
            raise
        raise CloudError(f"Invalid parameters for '{str(name)[:40]}'.") from None
    raise CloudError(f"Unknown operation '{str(name)[:40]}'.")
