"""Shared helpers: progress/cancel callback, spacing and neighbourhood statistics."""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

from .model import Cloud


class Progress:
    """Progress reporter. `step(name, fraction)` is forwarded to the job runner; cancellation happens by terminating the worker process."""
    def __init__(self, send=None):
        self.send = send or (lambda *_: None)

    def log(self, msg: str, level: str = "info") -> None:
        self.send("log", {"level": level, "message": msg})

    def step(self, name: str, fraction: float) -> None:
        self.send("progress", {"stage": name, "fraction": float(max(0, min(1, fraction)))})


def spacing(points: np.ndarray, sample: int = 50000, tree: cKDTree | None = None) -> float:
    """Median distance to the nearest neighbour (robust to outliers)."""
    n = len(points)
    if n < 2: return 0.0
    idx = np.random.default_rng(0).choice(n, min(n, sample), replace=False) if n > sample else np.arange(n)
    t = tree or cKDTree(points); d, _ = t.query(points[idx], k=2, workers=-1)
    return float(np.median(d[:, 1]))


def bbox(points: np.ndarray):
    mn = points.min(0); mx = points.max(0); return mn, mx, mx - mn


def surface_variation(points: np.ndarray, k: int = 16, tree: cKDTree | None = None, chunk: int = 100000, want_normals: bool = False):
    """PCA surface variation lambda0 / (lambda0+lambda1+lambda2) per point: ~0 on flat areas, large on edges and corners. Also returns normals when asked."""
    n = len(points); k = min(k, n); t = tree or cKDTree(points); sv = np.zeros(n); nor = np.zeros((n, 3)) if want_normals else None
    for s in range(0, n, chunk):
        _, nb = t.query(points[s:s + chunk], k=k, workers=-1); P = points[nb]; P = P - P.mean(1, keepdims=True)
        C = np.einsum("nki,nkj->nij", P, P) / k; w, v = np.linalg.eigh(C); tot = w.sum(1) + 1e-30
        sv[s:s + chunk] = w[:, 0] / tot
        if want_normals: nor[s:s + chunk] = v[:, :, 0]
    return (sv, nor) if want_normals else sv


def feature_mask(sv: np.ndarray, threshold: float = 0.0, top_fraction: float = 0.15) -> np.ndarray:
    """Points on edges, corners and strongly curved regions. threshold > 0 is an absolute surface-variation limit; 0 = automatic (the most curved `top_fraction` of the points)."""
    if threshold and threshold > 0: return sv >= threshold
    return sv >= np.quantile(sv, 1.0 - top_fraction)
