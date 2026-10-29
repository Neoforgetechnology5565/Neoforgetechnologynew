"""Ball tracking from per-frame candidate peaks.

The ball detector proposes up to a few candidate positions per analysed frame. A Viterbi search chooses, over the whole clip, the sequence
of candidates (or "no ball") that maximises detection confidence while penalising physically implausible jumps. Isolated weak candidates are
discarded. Output positions are *observed* (a detector peak was selected) or *estimated* (linear interpolation across a short gap between two
observations); everywhere else the ball is *missing*: no trajectory is invented across long gaps.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

MISS_P = 0.30  # prior "score" of the no-ball hypothesis; a candidate must beat this to be chosen on its own merits
HIGH_CONF = 0.55


@dataclass
class BallObs:
    x: float
    y: float
    conf: float | None
    kind: str  # "observed" | "estimated"


def link(candidates: list[list[tuple[float, float, float]]], times: list[float], width: int, max_speed_frac: float = 0.6, min_conf: float = 0.2) -> list[tuple[float, float, float] | None]:
    """candidates[i] = [(x, y, conf), ...] in a space where distances are comparable (reference-frame pixels). Returns the chosen candidate or None per sample."""
    n = len(candidates)
    if n == 0:
        return []
    cand = [[c for c in cs if c[2] >= min_conf] for cs in candidates]
    NEG = -1e18
    score: list[list[float]] = []
    back: list[list[int]] = []
    for i in range(n):
        k = len(cand[i]) + 1  # last state = missing
        sc, bk = [NEG] * k, [-1] * k
        emis = [math.log(max(c[2], 1e-3) / MISS_P) for c in cand[i]] + [0.0]
        if i == 0:
            sc = emis[:]
            bk = [-1] * k
        else:
            dt = max(times[i] - times[i - 1], 1e-3)
            vmax = max_speed_frac * width * dt
            for s in range(k):
                best, arg = NEG, -1
                for p in range(len(score[i - 1])):
                    prev = score[i - 1][p]
                    if prev <= NEG / 2:
                        continue
                    if s < len(cand[i]) and p < len(cand[i - 1]):
                        d = math.hypot(cand[i][s][0] - cand[i - 1][p][0], cand[i][s][1] - cand[i - 1][p][1])
                        if d > vmax:
                            continue  # not physically plausible between consecutive analysed frames
                        trans = -1.5 * d / vmax  # prefer smooth motion
                    else:
                        trans = -0.3 if (s == len(cand[i])) != (p == len(cand[i - 1])) else 0.0  # entering/leaving the no-ball state costs a little
                    if prev + trans > best:
                        best, arg = prev + trans, p
                if arg >= 0:
                    sc[s], bk[s] = best + emis[s], arg
        score.append(sc)
        back.append(bk)
    state = int(np.argmax(score[-1]))
    path = [None] * n
    for i in range(n - 1, -1, -1):
        path[i] = cand[i][state] if state < len(cand[i]) else None
        state = back[i][state]
        if state < 0 and i > 0:
            state = len(cand[i - 1])  # chain broken: treat the remainder as missing
    # drop isolated, weak observations (a single frame with confidence below HIGH_CONF is not trusted)
    out = list(path)
    for i in range(n):
        if out[i] is None:
            continue
        nb = (i > 0 and path[i - 1] is not None) or (i + 1 < n and path[i + 1] is not None)
        if not nb and out[i][2] < HIGH_CONF:
            out[i] = None
    return out


def fill_estimates(chosen: list[tuple[float, float, float] | None], times: list[float], width: int, max_gap_s: float = 1.0, max_speed_frac: float = 0.6) -> list[BallObs | None]:
    """Observed samples stay observed; short gaps between two observations are linearly interpolated and marked estimated."""
    n = len(chosen)
    res: list[BallObs | None] = [BallObs(c[0], c[1], c[2], "observed") if c else None for c in chosen]
    last = None
    for i in range(n):
        if chosen[i] is None:
            continue
        if last is not None and i - last > 1:
            gap = times[i] - times[last]
            a, b = chosen[last], chosen[i]
            if gap <= max_gap_s and math.hypot(b[0] - a[0], b[1] - a[1]) <= max_speed_frac * width * gap:
                for j in range(last + 1, i):
                    f = (times[j] - times[last]) / gap
                    res[j] = BallObs(a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), None, "estimated")
        last = i
    return res
