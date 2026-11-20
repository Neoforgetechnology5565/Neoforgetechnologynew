"""Module B: point-cloud cleaning. Every operation deletes or averages real points; none invents points. Each returns the new cloud and honest statistics."""
from __future__ import annotations

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from .common import Progress, bbox, feature_mask, spacing, surface_variation
from .model import Cloud


def inspect(c: Cloud) -> dict:
    mn, mx, size = bbox(c.points); tree = cKDTree(c.points); sp = spacing(c.points, tree=tree)
    dup = len(c) - len(np.unique(np.round(c.points / max(sp * 1e-3, 1e-12)).astype(np.int64), axis=0)) if len(c) < 3_000_000 else None
    return {"count": len(c), "bbox_min": mn.tolist(), "bbox_max": mx.tolist(), "size": size.tolist(), "diagonal": float(np.linalg.norm(size)), "center": ((mn + mx) / 2).tolist(),
            "has_colors": c.colors is not None, "has_normals": c.normals is not None, "spacing": sp, "duplicates": dup}


def remove_invalid(c: Cloud, **_):
    ok = np.isfinite(c.points).all(1)
    return c.select(ok), {"removed": int((~ok).sum())}


def remove_duplicates(c: Cloud, tolerance: float = 0.0, **_):
    """Merge points that fall in the same cell of size `tolerance` (0 = automatic: 1/1000 of the typical spacing). Keeps the first point of each cell."""
    tol = tolerance if tolerance > 0 else max(spacing(c.points) * 1e-3, 1e-12)
    key = np.round(c.points / tol).astype(np.int64); _, first = np.unique(key, axis=0, return_index=True); first.sort()
    return c.select(first), {"removed": len(c) - len(first), "tolerance": tol}


def statistical_outlier(c: Cloud, neighbors: int = 20, std_ratio: float = 2.0, **_):
    """Remove points whose mean distance to their k neighbours is more than std_ratio standard deviations above the average."""
    k = min(neighbors + 1, len(c)); d, _ = cKDTree(c.points).query(c.points, k=k, workers=-1); m = d[:, 1:].mean(1)
    thr = m.mean() + std_ratio * m.std(); keep = m <= thr
    return c.select(keep), {"removed": int((~keep).sum()), "threshold": float(thr)}


def radius_outlier(c: Cloud, radius: float = 0.0, min_points: int = 6, spacing_factor: float = 4.0, **_):
    """Remove points with fewer than min_points neighbours within `radius` (0 = spacing_factor x typical spacing)."""
    sp = spacing(c.points); r = radius if radius > 0 else sp * spacing_factor
    cnt = cKDTree(c.points).query_ball_point(c.points, r, workers=-1, return_length=True) - 1; keep = cnt >= min_points
    return c.select(keep), {"removed": int((~keep).sum()), "radius": float(r)}


def _components(points: np.ndarray, radius: float):
    pairs = cKDTree(points).query_pairs(radius, output_type="ndarray")
    n = len(points); g = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n)); nc, lab = connected_components(g, directed=False)
    return nc, lab


def isolated_points(c: Cloud, radius_factor: float = 4.0, min_cluster: int = 20, **_):
    """Detect tiny clusters (including single points) that are not connected to anything else at `radius_factor` x spacing and remove them."""
    sp = spacing(c.points); nc, lab = _components(c.points, sp * radius_factor); sizes = np.bincount(lab); keep = sizes[lab] >= min_cluster
    return c.select(keep), {"removed": int((~keep).sum()), "clusters": int(nc), "radius": sp * radius_factor}


def floating_artifacts(c: Cloud, radius_factor: float = 6.0, min_fraction: float = 0.02, **_):
    """Remove floating blobs: connected components (at radius_factor x spacing) with fewer than min_fraction of the largest component's points."""
    sp = spacing(c.points); nc, lab = _components(c.points, sp * radius_factor); sizes = np.bincount(lab); keepc = sizes >= max(1, min_fraction * sizes.max()); keep = keepc[lab]
    return c.select(keep), {"removed": int((~keep).sum()), "components_kept": int(keepc.sum()), "components_removed": int((~keepc).sum())}


def density_filter(c: Cloud, neighbors: int = 12, min_density_ratio: float = 0.2, **_):
    """Remove points in regions whose local density is below min_density_ratio x the median density (density ~ 1 / kNN-radius^2)."""
    k = min(neighbors + 1, len(c)); d, _ = cKDTree(c.points).query(c.points, k=k, workers=-1); r = d[:, -1] + 1e-15; dens = 1.0 / (r * r); keep = dens >= min_density_ratio * np.median(dens)
    return c.select(keep), {"removed": int((~keep).sum())}


def denoise(c: Cloud, neighbors: int = 16, strength: float = 0.6, feature_threshold: float = 0.0, **_):
    """Surface-noise filtering: points on locally flat areas are pulled toward their local best-fit plane by `strength` (0-1). Points on edges and corners (surface variation above
    feature_threshold; auto = the most curved 15%) are left untouched, so sharp features and the object's size are preserved."""
    sv, nor = surface_variation(c.points, neighbors, want_normals=True); t = cKDTree(c.points); _, nb = t.query(c.points, k=min(neighbors, len(c)), workers=-1)
    out = c.points.copy(); feat = feature_mask(sv, feature_threshold); moved = np.where(~feat)[0]
    for s in range(0, len(moved), 100000):
        i = moved[s:s + 100000]; cen = c.points[nb[i]].mean(1); out[i] = c.points[i] - strength * ((c.points[i] - cen) * nor[i]).sum(1, keepdims=True) * nor[i]
    d = np.linalg.norm(out - c.points, axis=1)
    r = Cloud(out, c.colors, None, dict(c.meta)); return r, {"moved": int((d > 0).sum()), "kept_as_features": int(feat.sum()), "mean_move": float(d[d > 0].mean()) if (d > 0).any() else 0.0, "max_move": float(d.max())}


def crop(c: Cloud, bounds_min=None, bounds_max=None, invert: bool = False, **_):
    """Keep points inside the axis-aligned box [bounds_min, bounds_max] (or outside it with invert=True). Missing bounds are open."""
    lo = np.full(3, -np.inf) if bounds_min is None else np.array([-np.inf if v is None else v for v in bounds_min], float)
    hi = np.full(3, np.inf) if bounds_max is None else np.array([np.inf if v is None else v for v in bounds_max], float)
    inside = ((c.points >= lo) & (c.points <= hi)).all(1); keep = ~inside if invert else inside
    if not keep.any(): raise ValueError("The crop box would remove every point.")
    return c.select(keep), {"removed": int((~keep).sum())}


def downsample(c: Cloud, method: str = "voxel", voxel: float = 0.0, ratio: float = 0.5, target: int = 0, preserve_features: bool = True, feature_threshold: float = 0.0, **_):
    """Reduce the point count. voxel: one averaged point per cell; random: random subset; uniform: every n-th point.
    With preserve_features, points on edges/corners use a cell three times smaller so detail survives."""
    n = len(c)
    if method == "random":
        m = target or max(1, int(n * ratio)); idx = np.sort(np.random.default_rng(0).choice(n, min(m, n), replace=False)); return c.select(idx), {"removed": n - len(idx)}
    if method == "uniform":
        step = max(1, int(round(n / target)) if target else int(round(1 / max(ratio, 1e-6)))); return c.select(np.arange(0, n, step)), {"removed": n - len(range(0, n, step))}
    sp = spacing(c.points); sv = surface_variation(c.points, 16) if (preserve_features and n > 100) else None; feat = feature_mask(sv, feature_threshold) if sv is not None else None

    def count_at(size):  # number of points the voxel filter would keep at this cell size (features use a cell three times smaller)
        cells = lambda idx, sz: len(np.unique(np.floor(c.points[idx] / sz).astype(np.int64), axis=0)) if len(idx) else 0  # noqa: E731
        return cells(np.where(~feat)[0], size) + cells(np.where(feat)[0], size / 3.0) if feat is not None else cells(np.arange(n), size)
    if voxel <= 0:
        voxel = sp * 2.0
        if target:  # bisection on the cell size so the result lands near `target` points
            lo, hi = sp * 0.25, float(bbox(c.points)[2].max())
            for _ in range(16):
                mid = (lo * hi) ** 0.5; lo, hi = (mid, hi) if count_at(mid) > target else (lo, mid)
            voxel = hi

    def vox(idx, size):
        key = np.floor(c.points[idx] / size).astype(np.int64); _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel(); cnt = np.bincount(inv).astype(float)
        pts = np.stack([np.bincount(inv, c.points[idx][:, a]) for a in range(3)], 1) / cnt[:, None]
        col = None if c.colors is None else np.stack([np.bincount(inv, c.colors[idx][:, a]) for a in range(3)], 1) / cnt[:, None]
        nor = None
        if c.normals is not None:
            nor = np.stack([np.bincount(inv, c.normals[idx][:, a]) for a in range(3)], 1); nor /= np.linalg.norm(nor, axis=1, keepdims=True) + 1e-12
        return pts, col, nor
    if feat is not None:
        parts = [vox(np.where(~feat)[0], voxel)] + ([vox(np.where(feat)[0], voxel / 3.0)] if feat.any() else [])
        pts = np.vstack([p[0] for p in parts]); col = None if c.colors is None else np.vstack([p[1] for p in parts]); nor = None if c.normals is None else np.vstack([p[2] for p in parts])
    else:
        pts, col, nor = vox(np.arange(n), voxel)
    return Cloud(pts, None if col is None else col.astype(np.float32), nor, dict(c.meta)), {"removed": n - len(pts), "voxel": float(voxel)}


STEPS = [("invalid", "Remove invalid points", remove_invalid), ("duplicates", "Remove duplicate points", remove_duplicates), ("statistical", "Statistical outlier removal", statistical_outlier),
         ("radius", "Radius outlier removal", radius_outlier), ("isolated", "Isolated point detection", isolated_points), ("density", "Density filtering", density_filter),
         ("floating", "Floating artifact removal", floating_artifacts), ("denoise", "Noise filtering (feature-preserving)", denoise), ("downsample", "Downsampling", downsample)]


def run_cleaning(c: Cloud, p: dict, prog: Progress) -> tuple[Cloud, list[dict]]:
    """Runs the enabled steps in a fixed, sensible order. p = {"crop": {...}|None, "invalid": {...}|None, ...}. A step runs when its entry is a dict (parameters) and not None/False."""
    report = []; cur = c; steps = ([("crop", "Crop", crop)] if p.get("crop") is not None and p.get("crop") is not False else []) + STEPS; todo = [(k, n, f) for k, n, f in steps if p.get(k) is not None and p.get(k) is not False]
    for i, (key, name, fn) in enumerate(todo):
        prog.step(name, i / max(1, len(todo))); params = p[key] if isinstance(p[key], dict) else {}; before = len(cur)
        cur, st = fn(cur, **params); st.update({"step": key, "name": name, "before": before, "after": len(cur)}); report.append(st)
        prog.log(f"{name}: {before:,} -> {len(cur):,} points" + (f" (removed {st['removed']:,})" if "removed" in st else ""))
    prog.step("Cleaning finished", 1.0); return cur, report
