"""Ball candidates and a gated tracker. Honest by construction: only positions that were actually detected become track points. A frame where the ball
was not found is a gap (never interpolated), and a candidate that is not confirmed by a plausible previous position is never reported.

Candidate sources: the YOLOX 'sports ball' class (weak for small or blurred balls) and a colour blob finder (orange for basketball; white and moving for table tennis)."""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

KINDS = {"orange": "orange (basketball)", "white": "white and moving (table tennis)"}


@dataclass
class Cand:
    x: float
    y: float
    r: float
    src: str   # yolox | colour
    conf: float


def colour_candidates(bgr: np.ndarray, kind: str, prev_gray: np.ndarray | None, min_r: float, max_r: float) -> list[Cand]:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    if kind == "orange":
        mask = cv2.inRange(hsv, (8, 150, 90), (20, 255, 255))
    else:
        mask = cv2.inRange(hsv, (0, 0, 190), (180, 60, 255))
        if prev_gray is not None:
            diff = cv2.absdiff(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), prev_gray)
            mov = cv2.dilate((diff > 22).astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
            mask = cv2.bitwise_and(mask, mov)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in cnts:
        a = cv2.contourArea(c)
        if a < 3:
            continue
        r = math.sqrt(a / math.pi)
        if not (min_r <= r <= max_r):
            continue
        per = cv2.arcLength(c, True)
        circ = 4 * math.pi * a / (per * per) if per > 0 else 0.0
        if circ < 0.5:
            continue
        (x, y), _ = cv2.minEnclosingCircle(c)
        out.append(Cand(float(x), float(y), r, "colour", round(min(1.0, circ), 3)))
    return out


class BallTracker:
    """Constant-velocity gate. Needs two consecutive plausible candidates to start; ends after `max_miss` consecutive frames without one."""

    def __init__(self, dt: float, max_speed: float, gate: float, max_miss: int = 4):
        self.dt, self.max_speed, self.gate, self.max_miss = dt, max_speed, gate, max_miss
        self.pos: np.ndarray | None = None
        self.vel = np.zeros(2)
        self.miss = 0
        self.chains: list[list[Cand]] = []

    def update(self, t: float, cands: list[Cand], seeds: list[Cand] | None = None) -> dict | None:
        """`seeds` (default: all candidates) are the only ones allowed to START a track; a running track may continue through any candidate."""
        if self.pos is None:
            cands = cands if seeds is None else seeds
            # acquisition: a chain of candidates in three consecutive frames, each within reach of the previous one, is needed before anything is reported
            nxt: list[list[Cand]] = []
            used: set[int] = set()
            for ch in self.chains:
                best, bd = None, 1e18
                for k, c in enumerate(cands):
                    d = math.hypot(c.x - ch[-1].x, c.y - ch[-1].y)
                    if d <= self.max_speed * self.dt and d < bd and k not in used:
                        best, bd = k, d
                if best is not None:
                    used.add(best)
                    nxt.append(ch + [cands[best]])
            nxt += [[c] for k, c in enumerate(cands) if k not in used]
            self.chains = [c for c in nxt if len(c) <= 3][:12]
            ok = [c for c in nxt if len(c) >= 3]
            if not ok:
                return None
            ch = max(ok, key=lambda c: sum(x.conf for x in c))
            self.chains = []
            a, b = ch[-2], ch[-1]
            self.pos = np.array([b.x, b.y])
            self.vel = np.array([b.x - a.x, b.y - a.y]) / self.dt
            self.miss = 0
            return self._pt(t, b)
        pred = self.pos + self.vel * self.dt * (self.miss + 1)
        gate = self.gate * (1 + 0.5 * self.miss)
        best, bd = None, 1e18
        for c in cands:
            d = math.hypot(c.x - pred[0], c.y - pred[1]) - (3 if c.src == "yolox" else 0)
            if d < gate and d < bd:
                best, bd = c, d
        if best is None:
            # a strike or bounce reverses the motion, so the constant-velocity prediction points the wrong way: accept the nearest candidate close to the last position
            near = [(math.hypot(c.x - self.pos[0], c.y - self.pos[1]), c) for c in cands]
            near = [x for x in near if x[0] <= self.gate * 2.5 * (1 + 0.25 * self.miss)]
            if near:
                best = min(near, key=lambda x: x[0])[1]
                self.vel = np.zeros(2)
        if best is None:
            self.miss += 1
            if self.miss > self.max_miss:
                self.pos, self.chains = None, []
            return None
        new = np.array([best.x, best.y])
        v = (new - self.pos) / (self.dt * (self.miss + 1))
        self.vel = v if not self.vel.any() else 0.6 * v + 0.4 * self.vel
        self.pos, self.miss = new, 0
        return self._pt(t, best)

    @staticmethod
    def _pt(t: float, c: Cand) -> dict:
        return {"t": round(t, 3), "x": round(c.x, 1), "y": round(c.y, 1), "src": c.src, "conf": c.conf}
