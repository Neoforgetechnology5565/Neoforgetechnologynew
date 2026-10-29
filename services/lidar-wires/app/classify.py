"""Transparent classification: provided labels when the file has them, otherwise geometric HEURISTICS (not a trained semantic model).

Label ids (stored per point):  0 unclassified, 1 ground-like, 2 vegetation-like, 3 structure-like, 4 wire-candidate.
Heuristic ground model: a progressive morphological filter on a minimum-elevation grid (Zhang et al. 2003 style) followed by a height tolerance
to the interpolated ground surface. Non-ground points are then split by local geometry (eigenvalue features of the neighbourhood):
    scattered / volumetric neighbourhoods (high sphericity)         -> vegetation-like (or "green" when RGB shows it)
    flat neighbourhoods (high planarity) well above the ground      -> structure-like (roofs, walls, vehicles)
    everything else                                                  -> unclassified
Wire candidates come only from the wire-detection step. Distances/heights are in the cloud's coordinate units; metre defaults are scaled by `upm`
(coordinate units per metre) when the units are known, and used as coordinate units otherwise (the API says so).
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage
from scipy.interpolate import griddata
from scipy.spatial import cKDTree

from .cloud import ASPRS, PointCloud

UNCLASSIFIED, GROUND, VEGETATION, STRUCTURE, WIRE = 0, 1, 2, 3, 4
NAMES = {UNCLASSIFIED: "unclassified", GROUND: "ground-like", VEGETATION: "vegetation-like", STRUCTURE: "structure-like", WIRE: "wire-candidate"}
PROVIDED_MAP = {2: GROUND, 3: VEGETATION, 4: VEGETATION, 5: VEGETATION, 6: STRUCTURE, 15: STRUCTURE, 16: STRUCTURE, 13: WIRE, 14: WIRE}


def from_provided(pc: PointCloud) -> tuple[np.ndarray, dict]:
    c = pc.classification
    lab = np.zeros(len(pc), np.uint8)
    for code, to in PROVIDED_MAP.items():
        lab[c == code] = to
    present = {int(k): int((c == k).sum()) for k in np.unique(c)}
    return lab, {"source": "provided", "kind": "labels read from the file (ASPRS classification codes)", "codes_present": {f"{k} {ASPRS.get(k, 'other')}": v for k, v in present.items()}, "mapping": {f"{k} {ASPRS.get(k)}": NAMES[v] for k, v in PROVIDED_MAP.items() if k in present}}


class GroundModel:
    """Bilinear-interpolated ground surface on a regular grid."""

    def __init__(self, x0: float, y0: float, cell: float, z: np.ndarray):
        self.x0, self.y0, self.cell, self.z = x0, y0, cell, z

    def height_at(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        gx = (np.asarray(x) - self.x0) / self.cell - 0.5
        gy = (np.asarray(y) - self.y0) / self.cell - 0.5
        return ndimage.map_coordinates(self.z, [gy, gx], order=1, mode="nearest")


def ground_model(xyz: np.ndarray, cell: float, max_window_cells: int = 33, slope: float = 0.3, dh0: float = 0.15, dh_max: float = 2.5) -> tuple[GroundModel, np.ndarray]:
    """Returns (surface, boolean mask of points considered ground).  `slope` is rise/run of the terrain the filter tolerates; dh0, dh_max in coordinate units."""
    lo = xyz[:, :2].min(0)
    ij = np.floor((xyz[:, :2] - lo) / cell).astype(np.int64)
    ny, nx = ij[:, 1].max() + 1, ij[:, 0].max() + 1
    if nx * ny > 40_000_000:
        raise ValueError("The cloud is too large for this ground cell size.")
    zmin = np.full(ny * nx, np.inf)
    np.minimum.at(zmin, ij[:, 1] * nx + ij[:, 0], xyz[:, 2])
    g = zmin.reshape(ny, nx)
    empty = ~np.isfinite(g)
    if empty.all():
        raise ValueError("No ground cells.")
    if empty.any():  # fill empty cells by nearest valid for the morphological step only
        idx = ndimage.distance_transform_edt(empty, return_distances=False, return_indices=True)
        g = g[tuple(idx)]
    surf = g.copy()
    keep = np.ones_like(g, bool)  # cells still believed to be ground
    w_prev, k = 1, 1
    while True:
        w = 2 * k + 1
        if w > max_window_cells:
            break
        opened = ndimage.grey_opening(surf, size=(w, w))
        dh = min(dh_max, dh0 + slope * (w - w_prev) * cell)
        nonground = (surf - opened) > dh
        keep &= ~nonground
        surf = opened
        w_prev, k = w, k * 2
    # ground cell heights: the opened surface where cells were not rejected, interpolated elsewhere
    ys, xs = np.nonzero(keep & ~empty)
    if len(ys) < 3:
        raise ValueError("Too few ground cells were found.")
    zs = g[ys, xs]
    gy, gx = np.mgrid[0:ny, 0:nx]
    full = griddata((ys, xs), zs, (gy, gx), method="linear")
    nn = griddata((ys, xs), zs, (gy, gx), method="nearest")
    full = np.where(np.isfinite(full), full, nn)
    full = ndimage.uniform_filter(full, size=3, mode="nearest")
    gm = GroundModel(lo[0], lo[1], cell, full)
    h = xyz[:, 2] - gm.height_at(xyz[:, 0], xyz[:, 1])
    return gm, h


def local_features(xyz: np.ndarray, radius: float, min_nb: int = 5, max_nb: int = 32, chunk: int = 60_000) -> dict:
    """PCA eigenvalue features per point (neighbours within `radius`, at most `max_nb`): linearity, planarity, sphericity, |normal z|, neighbour count.
    Features follow Weinmann et al.: with eigenvalues l1>=l2>=l3 of the neighbourhood covariance and s_i = sqrt(l_i): linearity=(s1-s2)/s1, planarity=(s2-s3)/s1, sphericity=s3/s1."""
    ctr = xyz.mean(0)
    p = xyz - ctr
    tree = cKDTree(p)
    n = len(p)
    out = {k: np.zeros(n) for k in ("linearity", "planarity", "sphericity", "normal_z", "axis_z")}
    cnt_all = np.zeros(n, np.int32)
    for s0 in range(0, n, chunk):
        q = p[s0:s0 + chunk]
        d, idx = tree.query(q, k=min(max_nb, n), distance_upper_bound=radius)
        valid = np.isfinite(d)
        cnt = valid.sum(1)
        idx = np.where(valid, idx, 0)
        nb = p[idx]
        w = valid[..., None].astype(np.float64)
        mean = (nb * w).sum(1) / np.maximum(w.sum(1), 1)
        c = (nb - mean[:, None]) * w
        cov = np.einsum("nki,nkj->nij", c, c) / np.maximum(cnt - 1, 1)[:, None, None]
        ev, vec = np.linalg.eigh(cov)
        s1, s2, s3 = (np.sqrt(np.maximum(ev[:, 2], 1e-12)), np.sqrt(np.maximum(ev[:, 1], 0)), np.sqrt(np.maximum(ev[:, 0], 0)))
        ok = cnt >= min_nb
        sl = slice(s0, s0 + len(q))
        out["linearity"][sl] = np.where(ok, (s1 - s2) / s1, 0)
        out["planarity"][sl] = np.where(ok, (s2 - s3) / s1, 0)
        out["sphericity"][sl] = np.where(ok, s3 / s1, 0)
        out["normal_z"][sl] = np.abs(vec[:, 2, 0])
        out["axis_z"][sl] = np.abs(vec[:, 2, 2])  # |z component| of the principal direction: ~1 for a vertical pole or leg, ~0 for a horizontal wire
        cnt_all[sl] = cnt
    out["count"] = cnt_all
    out["ok"] = cnt_all >= min_nb
    return out


def heuristic(pc: PointCloud, upm: float, cell: float, tol: float, rad: float) -> tuple[np.ndarray, dict, GroundModel, np.ndarray]:
    """cell, tol and rad are in the cloud's coordinate units; `upm` (coordinate units per metre, 1.0 if unknown) scales the fixed metre-scale constants of the filter."""
    gm, hag = ground_model(pc.xyz, cell, slope=0.3, dh0=0.15 * upm, dh_max=2.5 * upm)
    lab = np.zeros(len(pc), np.uint8)
    ground = np.abs(hag) <= tol
    lab[ground] = GROUND
    ng = np.nonzero(~ground & (hag > tol))[0]
    notes: list[str] = []
    if len(ng):
        sub = pc.xyz[ng]
        f = local_features(sub, rad)
        veg = ((f["sphericity"] > 0.10) & (f["planarity"] < 0.55) & f["ok"])
        if pc.rgb is not None:
            r, g, b = (pc.rgb[ng].astype(np.float32) / 255.0).T
            exg = 2 * g - r - b
            veg |= (exg > 0.12) & (f["planarity"] < 0.7)
            notes.append("RGB was used: a strongly green point in a non-planar neighbourhood counts as vegetation-like.")
        struct = f["ok"] & (f["planarity"] >= 0.55) & (hag[ng] > 0.5 * upm) & ~veg
        lab[ng[veg]] = VEGETATION
        lab[ng[struct]] = STRUCTURE
    info = {"source": "heuristic", "kind": "geometric heuristics, not a trained semantic model", "ground_cell": cell, "ground_tolerance": tol, "feature_radius": rad, "parameters_in": "the cloud's length unit", "notes": notes,
            "rules": {"ground-like": "within the height tolerance of a progressive-morphological-filter ground surface", "vegetation-like": "non-ground with scattered (high sphericity, low planarity) neighbourhood, or green with RGB",
                      "structure-like": "non-ground with planar neighbourhood (planarity >= 0.55) more than 0.5 m (metre-scale constant) above ground", "unclassified": "everything else"}}
    return lab, info, gm, hag


def counts(lab: np.ndarray) -> dict:
    return {NAMES[k]: int((lab == k).sum()) for k in NAMES}


def ground_from_labels(xyz: np.ndarray, ground_mask: np.ndarray, cell: float) -> tuple[GroundModel, np.ndarray]:
    """Ground surface interpolated from points labelled ground in the file (median height per cell)."""
    g = xyz[ground_mask]
    if len(g) < 10:
        raise ValueError("Too few ground points in the provided classification to build a ground model.")
    lo = xyz[:, :2].min(0)
    ij = np.floor((g[:, :2] - lo) / cell).astype(np.int64)
    ny = int(np.floor((xyz[:, 1].max() - lo[1]) / cell)) + 1
    nx = int(np.floor((xyz[:, 0].max() - lo[0]) / cell)) + 1
    if nx * ny > 40_000_000:
        raise ValueError("The cloud is too large for this ground cell size.")
    key = ij[:, 1] * nx + ij[:, 0]
    order = np.argsort(key)
    ks, zs = key[order], g[order, 2]
    uk, start = np.unique(ks, return_index=True)
    med = np.array([np.median(c) for c in np.split(zs, start[1:])])
    yy, xx = uk // nx, uk % nx
    gy, gx = np.mgrid[0:ny, 0:nx]
    full = griddata((yy, xx), med, (gy, gx), method="linear") if len(uk) >= 4 else np.full((ny, nx), np.nan)
    nn = griddata((yy, xx), med, (gy, gx), method="nearest")
    full = np.where(np.isfinite(full), full, nn)
    gm = GroundModel(lo[0], lo[1], cell, ndimage.uniform_filter(full, size=3, mode="nearest"))
    return gm, xyz[:, 2] - gm.height_at(xyz[:, 0], xyz[:, 1])
