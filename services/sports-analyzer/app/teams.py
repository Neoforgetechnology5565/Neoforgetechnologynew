"""Team grouping from jersey colour. Unsupervised two-means on each track's median torso colour, with explicit "uncertain" and "other" outcomes.

Torso pixels are taken from the upper-middle part of the person box, pixels that look like grass are removed, and the median CIE-Lab-like
colour of the rest is the track's colour. Tracks are then clustered (k=2). Goalkeepers and officials usually wear a third colour; a track
far from both centroids is labelled "other" instead of being forced into a team. If the two clusters are not clearly separated (similar kits,
very small players, strong shadows) every track is labelled "uncertain": jersey colour alone is not team identity, and the page says so.
The user can instead supply the two team colours.
"""
from __future__ import annotations

import cv2
import numpy as np
from scipy.cluster.vq import kmeans2

TEAM_A, TEAM_B, OTHER, UNCERTAIN = "team_a", "team_b", "other", "uncertain"
MIN_SEPARATION = 1.8


def torso_colour(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray | None:
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    if w < 6 or h < 14:
        return None
    ix1, ix2 = int(x1 + 0.22 * w), int(x2 - 0.22 * w)
    iy1, iy2 = int(y1 + 0.16 * h), int(y1 + 0.52 * h)
    H, W = frame.shape[:2]
    ix1, iy1, ix2, iy2 = max(0, ix1), max(0, iy1), min(W, ix2), min(H, iy2)
    if ix2 - ix1 < 2 or iy2 - iy1 < 2:
        return None
    crop = frame[iy1:iy2, ix1:ix2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV).reshape(-1, 3)
    grass = (hsv[:, 0] >= 30) & (hsv[:, 0] <= 90) & (hsv[:, 1] > 45) & (hsv[:, 2] > 30)
    keep = ~grass
    if keep.sum() < max(6, 0.2 * len(keep)):
        return None
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).reshape(-1, 3)[keep].astype(np.float32)
    med = np.median(lab, axis=0)
    return np.array([med[0] * 100.0 / 255.0, med[1] - 128.0, med[2] - 128.0], np.float32)


def lab_to_hex(lab: np.ndarray) -> str:
    px = np.array([[[lab[0] * 255.0 / 100.0, lab[1] + 128.0, lab[2] + 128.0]]], np.float32)
    bgr = cv2.cvtColor(np.clip(px, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)[0, 0]
    return "#%02x%02x%02x" % (int(bgr[2]), int(bgr[1]), int(bgr[0]))


def hex_to_lab(h: str) -> np.ndarray:
    h = h.lstrip("#")
    rgb = np.array([[[int(h[i:i + 2], 16) for i in (0, 2, 4)]]], np.uint8)
    lab = cv2.cvtColor(rgb[:, :, ::-1].copy(), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
    return np.array([lab[0] * 100.0 / 255.0, lab[1] - 128.0, lab[2] - 128.0], np.float32)


def classify(track_colours: dict[int, np.ndarray], mode: str = "auto", user_colours: list[str] | None = None) -> tuple[dict[int, str], dict]:
    """track_colours: track id -> median Lab colour. Returns (labels, info)."""
    ids = list(track_colours)
    info: dict = {"method": mode, "status": "unavailable", "tracks_with_colour": len(ids)}
    if mode == "off" or not ids:
        info["status"] = "off" if mode == "off" else "unavailable"
        info["reason"] = "Team classification was switched off." if mode == "off" else "No track had enough non-grass jersey pixels to measure a colour."
        return {i: UNCERTAIN for i in ids}, info
    X = np.stack([track_colours[i] for i in ids]).astype(np.float64)
    if mode == "colors" and user_colours and len(user_colours) == 2:
        cents = np.stack([hex_to_lab(c) for c in user_colours]).astype(np.float64)
        d = np.linalg.norm(X[:, None] - cents[None], axis=2)
        labels = {}
        for k, i in enumerate(ids):
            j = int(d[k].argmin())
            labels[i] = (TEAM_A, TEAM_B)[j] if d[k, j] <= 30.0 else OTHER
        info.update(status="user_colours", centroids_hex=list(user_colours), reason="Teams were assigned by the nearest of the two colours you supplied (Lab distance up to 30); further colours are 'other'.")
        return labels, info
    if len(ids) < 4:
        info.update(status="uncertain", reason="Fewer than 4 tracks have a measurable jersey colour, which is too few to separate two teams.")
        return {i: UNCERTAIN for i in ids}, info
    rng = np.random.default_rng(0)
    seed = X[[int(X[:, 0].argmin()), int(X[:, 0].argmax())]] if np.ptp(X[:, 0]) > 5 else X[rng.choice(len(X), 2, replace=False)]
    cents, assign = kmeans2(X, seed, minit="matrix", iter=30)
    if len(set(assign.tolist())) < 2:
        info.update(status="uncertain", reason="All tracks have similar colours; no second team was found.")
        return {i: UNCERTAIN for i in ids}, info
    dist = np.linalg.norm(X - cents[assign], axis=1)
    spread = float(np.sqrt(np.mean(dist ** 2))) + 1e-6
    sep = float(np.linalg.norm(cents[0] - cents[1]) / spread)
    info["separation"] = round(sep, 2)
    sizes = [int((assign == j).sum()) for j in (0, 1)]
    if sep < MIN_SEPARATION or min(sizes) < 2:
        info.update(status="uncertain", reason=f"The two colour groups are not clearly separated (separation {sep:.2f}, need at least {MIN_SEPARATION}). Jersey colour alone does not tell the teams apart in this footage.")
        return {i: UNCERTAIN for i in ids}, info
    med = float(np.median(dist))
    cut = max(18.0, 2.5 * med)
    order = [0, 1] if sizes[0] >= sizes[1] else [1, 0]  # team_a is the larger colour group (arbitrary but stable)
    names = {order[0]: TEAM_A, order[1]: TEAM_B}
    labels = {i: (names[int(assign[k])] if dist[k] <= cut else OTHER) for k, i in enumerate(ids)}
    info.update(status="clustered", centroids_hex=[lab_to_hex(cents[order[0]]), lab_to_hex(cents[order[1]])], other_cutoff=round(cut, 1),
                counts={TEAM_A: sum(v == TEAM_A for v in labels.values()), TEAM_B: sum(v == TEAM_B for v in labels.values()), OTHER: sum(v == OTHER for v in labels.values())},
                reason="Two-means clustering of torso colour per track; tracks far from both centroids are 'other' (goalkeepers, officials or noise). Colour grouping is not identity and can be wrong.")
    return labels, info
