"""Statistics, heatmaps and cautious event candidates computed from observed track positions. Nothing here invents data.

Distance and speed
    Foot-point positions (bottom centre of the person box) are mapped to the pitch plane with the user's calibration. Each track's pitch path is
    smoothed with a centred moving average over about one second (at least 3 samples) because detector jitter would otherwise inflate the
    distance, then distance is the sum of segment lengths between consecutive samples that are no more than 1.5 sampling intervals (and
    never more than 2 s) apart. Segments implying more than 12 m/s are excluded and counted. Average speed is distance over the time
    covered by the counted segments. Maximum speed is the largest displacement over any ~1 s window divided by its duration.
    Positional accuracy is a few tenths of a metre in the best case and far worse for distant players or a poor calibration: treat results as estimates.
Heatmap
    Time-weighted 2-D histogram of mapped positions on a grid of `cell_m` metre cells, smoothed with a Gaussian of `sigma_cells` cells (zero padded),
    normalised so that the maximum is 1. It shows where a track was *observed*, not where it was.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.ndimage import gaussian_filter

from .pitch import zone_of

MAX_SPEED = 12.0
MARGIN = 3.0  # metres outside the touchlines a position may fall and still count as "on the pitch" (players run to the line)
CELL_M = 2.0
SIGMA_CELLS = 1.5


def grid_shape(length: float, width: float, cell_m: float = CELL_M) -> tuple[int, int]:
    return int(math.ceil(width / cell_m)), int(math.ceil(length / cell_m))  # rows (y), cols (x)


def heatmap(points: np.ndarray, weights: np.ndarray | None, length: float, width: float, cell_m: float = CELL_M, sigma_cells: float = SIGMA_CELLS) -> np.ndarray:
    ny, nx = grid_shape(length, width, cell_m)
    g = np.zeros((ny, nx))
    if len(points):
        ix = np.clip((points[:, 0] / cell_m).astype(int), 0, nx - 1)
        iy = np.clip((points[:, 1] / cell_m).astype(int), 0, ny - 1)
        np.add.at(g, (iy, ix), 1.0 if weights is None else weights)
        g = gaussian_filter(g, sigma_cells, mode="constant", truncate=4.0)
        m = g.max()
        if m > 0:
            g = g / m
    return g


def in_pitch(x: float, y: float, length: float, width: float) -> bool:
    return -MARGIN <= x <= length + MARGIN and -MARGIN <= y <= width + MARGIN


def _smooth(xy: np.ndarray, t: np.ndarray, window_s: float = 1.0) -> np.ndarray:
    n = len(xy)
    if n < 3:
        return xy.copy()
    out = np.empty_like(xy)
    for i in range(n):
        m = np.abs(t - t[i]) <= window_s / 2
        if m.sum() < 3:
            lo, hi = max(0, i - 1), min(n, i + 2)
            out[i] = xy[lo:hi].mean(0)
        else:
            out[i] = xy[m].mean(0)
    return out


def track_stats(t: np.ndarray, img_xy: np.ndarray, pitch_xy: np.ndarray | None, sample_dt: float, length: float, width: float) -> dict:
    """t: sample times (s), img_xy: (n,2) stabilised reference-frame foot positions, pitch_xy: (n,2) metres or NaN rows where unmapped."""
    n = len(t)
    img_dist = 0.0
    for i in range(1, n):
        if t[i] - t[i - 1] <= 1.5 * sample_dt + 1e-6 and t[i] - t[i - 1] <= 2.0:
            img_dist += float(np.hypot(*(img_xy[i] - img_xy[i - 1])))
    st = {"observed_seconds": round(n * sample_dt, 2), "observations": n, "first_seen_s": round(float(t[0]), 2), "last_seen_s": round(float(t[-1]), 2),
          "image_distance_px": round(img_dist, 1), "pitch": None, "zone_seconds": None}
    if pitch_xy is None:
        return st
    ok = np.isfinite(pitch_xy).all(1) & np.array([in_pitch(p[0], p[1], length, width) for p in pitch_xy])
    if ok.sum() < 3:
        st["pitch"] = {"status": "insufficient", "mapped_observations": int(ok.sum()), "reason": "Fewer than 3 observations fell on the calibrated pitch."}
        return st
    tt, pp = t[ok], pitch_xy[ok]
    sp = _smooth(pp, tt)
    dist, dtime, excluded, vmax = 0.0, 0.0, 0, 0.0
    for i in range(1, len(tt)):
        dt = tt[i] - tt[i - 1]
        if dt > 1.5 * sample_dt + 1e-6 or dt > 2.0:
            continue
        d = float(np.hypot(*(sp[i] - sp[i - 1])))
        if d / dt > MAX_SPEED:
            excluded += 1
            continue
        dist += d
        dtime += dt
    for i in range(len(tt)):  # ~1 s windows
        j = int(np.searchsorted(tt, tt[i] + 1.0))
        if j < len(tt) and tt[j] - tt[i] <= 1.6 and np.all(np.diff(tt[i:j + 1]) <= 1.5 * sample_dt + 1e-6):
            v = float(np.hypot(*(sp[j] - sp[i]))) / (tt[j] - tt[i])
            if v <= MAX_SPEED:
                vmax = max(vmax, v)
    zs = np.zeros(9)
    for p in pp:
        z = zone_of(float(np.clip(p[0], 0, length)), float(np.clip(p[1], 0, width)), length, width)
        if z is not None:
            zs[z] += sample_dt
    st["pitch"] = {"status": "ok", "mapped_observations": int(ok.sum()), "distance_m": round(float(dist), 1), "avg_speed_ms": round(float(dist / dtime), 2) if dtime > 0 else None,
                   "max_speed_ms": round(float(vmax), 2) if vmax > 0 else None, "excluded_segments": excluded, "counted_seconds": round(float(dtime), 2)}
    st["zone_seconds"] = [round(float(z), 2) for z in zs]
    return st


def possession_candidates(frames: list[dict], sample_dt: float) -> list[dict]:
    """Candidate ball-possession intervals from image-space proximity. Requires an *observed* ball (not an estimate).

    For each analysed frame with an observed ball, the nearest tracked person is found by distance from the ball to that person's foot area,
    measured in person-heights. A candidate needs the nearest person within 0.45 heights and the runner-up at least 1.4 times further away.
    Consecutive frames (gaps up to 2 sampling intervals) with the same nearest person merge into one interval of at least 2 observations.
    These are proximity candidates, not validated possession: tackles, aerial balls and perspective all break the assumption.
    """
    per: list[tuple[int, float, int, str | None, float]] = []
    for k, f in enumerate(frames):
        b = f.get("b")
        if not b or b[3] != "observed" or not f["p"]:
            continue
        bx, by = b[0], b[1]
        ds = []
        for p in f["p"]:
            h = max(p[4] - p[2], 1.0)
            cx, fy = (p[1] + p[3]) / 2, p[4] - 0.10 * h
            ds.append((math.hypot(bx - cx, by - fy) / h, p[0], p[6]))
        ds.sort()
        if ds[0][0] <= 0.45 and (len(ds) == 1 or ds[1][0] >= 1.4 * ds[0][0]):
            per.append((k, f["t"], ds[0][1], ds[0][2], ds[0][0]))
    out: list[dict] = []
    cur: list | None = None
    for item in per:
        if cur and item[2] == cur[-1][2] and item[0] - cur[-1][0] <= 2:
            cur.append(item)
        else:
            if cur and len(cur) >= 2:
                out.append(_cand(cur, sample_dt))
            cur = [item]
    if cur and len(cur) >= 2:
        out.append(_cand(cur, sample_dt))
    return out


def _cand(run: list, dt: float) -> dict:
    d = float(np.mean([r[4] for r in run]))
    return {"kind": "possession_candidate", "t0": round(run[0][1], 2), "t1": round(run[-1][1] + dt, 2), "track_id": run[0][2], "team": run[0][3], "ball_observations": len(run),
            "mean_distance_in_heights": round(d, 2), "confidence": "medium" if len(run) >= 4 and d <= 0.3 else "low",
            "basis": "ball observed near this tracked person's feet in the image; proximity only, not validated possession"}
