"""PPE detection and per-worker assessment.

Detector: Intel's `worker_safety_mobilenet` (MobileNet-SSD, Caffe, BSD-3-Clause, from intel-iot-devkit/safety-gear-detector-python).
It is applied to a crop around each detected person (that is how its authors use it), at 224x224, raw BGR 0-255 input. Its five output
classes are not documented by Intel. Reading the authors' reference application and probing the model on real frames gives:

    1  fires on nearly every person crop with a body-sized box. Not PPE; ignored.
    2  safety vest      (used as "vest" by the reference application)
    3  not used by the reference application and not understood: ignored. Nothing here depends on it.
    4  hard hat         (used as "hard hat" by the reference application)

Only classes 2 and 4 are used. Everything else in this file is project code: spatial association rules, reliability gating and temporal
smoothing. A missing detection is NOT treated as proof that PPE is absent: only frames with a good view of the worker count as evidence of
absence, so a "potential PPE violation" needs consistent evidence from good views. Such a conclusion is kept through a brief poor view
(and the reasons say so) rather than flickering back to "uncertain".
"""
from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

HAT, VEST = "hard_hat", "safety_vest"
CLASS_OF = {2: VEST, 4: HAT}  # SSD class id -> PPE kind. See module docstring.
KINDS = (HAT, VEST)

# Spatial association: where, relative to the worker box (0 = top, 1 = bottom), the centre of each PPE box may lie.
HAT_Y = (-0.12, 0.40)
VEST_Y = (0.18, 0.92)
VEST_MIN_W, VEST_MIN_H = 0.30, 0.12  # minimum vest box size as a fraction of the worker box
HAT_MAX_W, HAT_MAX_H = 0.80, 0.50


@dataclass
class PPEBox:
    kind: str
    score: float
    x1: float
    y1: float
    x2: float
    y2: float
    worker: int  # index into this frame's person list


class SafetyGearModel:
    def __init__(self, prototxt: Path, weights: Path, pad: float = 0.08):
        for p in (prototxt, weights):
            if not Path(p).is_file():
                raise FileNotFoundError("The PPE model files are missing (services/ppe-monitor/models/worker-safety-mobilenet).")
        if not hasattr(cv2.dnn, "readNetFromCaffe"):
            raise RuntimeError("This OpenCV build has no Caffe importer. Install opencv-python-headless>=4.9,<5.")
        self.net = cv2.dnn.readNetFromCaffe(str(prototxt), str(weights))
        self.pad = pad
        self.model_name = "worker_safety_mobilenet"
        self._lock = threading.Lock()

    def detect(self, frame: np.ndarray, persons: list[tuple[float, float, float, float]], min_score: float = 0.3) -> list[PPEBox]:
        h, w = frame.shape[:2]
        out: list[PPEBox] = []
        for wi, (px1, py1, px2, py2) in enumerate(persons):
            bw, bh = px2 - px1, py2 - py1
            cx1, cy1 = int(max(0, px1 - self.pad * bw)), int(max(0, py1 - self.pad * bh))
            cx2, cy2 = int(min(w, px2 + self.pad * bw)), int(min(h, py2 + self.pad * bh))
            if cx2 - cx1 < 16 or cy2 - cy1 < 32:
                continue
            blob = cv2.dnn.blobFromImage(frame[cy1:cy2, cx1:cx2], 1.0, (224, 224), (0, 0, 0), swapRB=False)
            with self._lock:
                self.net.setInput(blob)
                res = self.net.forward()[0, 0]
            cw, ch = cx2 - cx1, cy2 - cy1
            for r in res:
                kind = CLASS_OF.get(int(r[1]))
                if kind is None or r[2] < min_score:
                    continue
                x1, y1 = cx1 + max(0.0, float(r[3])) * cw, cy1 + max(0.0, float(r[4])) * ch
                x2, y2 = cx1 + min(1.0, float(r[5])) * cw, cy1 + min(1.0, float(r[6])) * ch
                if x2 - x1 > 2 and y2 - y1 > 2:
                    out.append(PPEBox(kind, float(r[2]), x1, y1, x2, y2, wi))
        return out


def _iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9)


def associate(persons: list[tuple[float, float, float, float]], boxes: list[PPEBox], thr: float) -> list[PPEBox]:
    """Keep PPE boxes that sit where that item would sit on that worker, drop duplicates, and give each box to exactly one worker."""
    kept: list[PPEBox] = []
    for b in sorted(boxes, key=lambda x: -x.score):
        if b.score < thr:
            continue
        px1, py1, px2, py2 = persons[b.worker]
        pw, ph = px2 - px1, py2 - py1
        cx, cy = (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2
        rel_y, rel_x = (cy - py1) / ph, (cx - px1) / pw
        bw, bh = (b.x2 - b.x1) / pw, (b.y2 - b.y1) / ph
        if not (-0.1 <= rel_x <= 1.1):
            continue
        if b.kind == HAT and not (HAT_Y[0] <= rel_y <= HAT_Y[1] and bw <= HAT_MAX_W and bh <= HAT_MAX_H):
            continue
        if b.kind == VEST and not (VEST_Y[0] <= rel_y <= VEST_Y[1] and bw >= VEST_MIN_W and bh >= VEST_MIN_H):
            continue
        # one item of each kind per worker; the same physical item seen from two neighbouring crops is kept once
        if any(k.kind == b.kind and (k.worker == b.worker or _iou((k.x1, k.y1, k.x2, k.y2), (b.x1, b.y1, b.x2, b.y2)) > 0.4) for k in kept):
            continue
        kept.append(b)
    return kept


@dataclass
class Evidence:
    """Per-track history of reliable observations, used to smooth the flicker of a per-frame detector."""
    window: dict[str, deque] = field(default_factory=lambda: {k: deque(maxlen=30) for k in KINDS})


class Assessor:
    DETECTED_FRACTION = 0.5
    MISSING_FRACTION = 0.12
    MIN_OBSERVATIONS = 5

    def __init__(self, required: tuple[str, ...], min_person_score: float = 0.5, min_height_px: int = 96, smooth: bool = True):
        self.required = tuple(k for k in KINDS if k in required)
        self.min_person_score = min_person_score
        self.min_height = min_height_px
        self.smooth = smooth
        self.history: dict[int, Evidence] = {}

    def prune(self, alive: set[int]) -> None:
        for tid in list(self.history):
            if tid not in alive and len(self.history) > 400:
                del self.history[tid]

    def reliability(self, i: int, persons, scores, frame_w: int, frame_h: int) -> list[str]:
        """Reasons the view of worker i is too poor to conclude that PPE is absent. Empty list = reliable view."""
        x1, y1, x2, y2 = persons[i]
        why = []
        if scores[i] < self.min_person_score:
            why.append("low worker-detection confidence")
        if y2 - y1 < self.min_height:
            why.append("worker too small in the frame")
        if y1 <= 2:
            why.append("head cut off by the frame edge")
        if any(j != i and _iou(persons[i], persons[j]) > 0.3 for j in range(len(persons))):
            why.append("worker partly hidden by another worker")
        return why

    def assess(self, i: int, track_id: int | None, ppe: list[PPEBox], bad_view: list[str], high_conf: float, confirmed: bool) -> dict:
        items: dict[str, dict] = {}
        for kind in KINDS:
            found = next((b for b in ppe if b.worker == i and b.kind == kind), None)
            seen = found is not None and found.score >= high_conf
            if self.smooth and track_id is not None:
                win = self.history.setdefault(track_id, Evidence()).window[kind]
                if not bad_view or found is not None:  # a detection is evidence even from a poor view; absence is evidence only from a good view
                    win.append(1.0 if seen else 0.5 if found is not None else 0.0)  # a weak detection is half a vote and never counts as absence
                n = len(win)
                frac = sum(win) / n if n else 0.0
                if n >= self.MIN_OBSERVATIONS and frac >= self.DETECTED_FRACTION:
                    state = "detected"
                elif n >= self.MIN_OBSERVATIONS and frac <= self.MISSING_FRACTION:
                    state = "not_detected"
                else:
                    state = "uncertain"
            else:
                if seen:
                    state = "detected"
                elif bad_view or found is not None:  # a weak detection (below the high-confidence line) is not "absent" either
                    state = "uncertain"
                else:
                    state = "not_detected"
            items[kind] = {"state": state, "confidence": round(found.score, 4) if found else None}
        states = [items[k]["state"] for k in self.required]
        reasons = list(bad_view)
        if not states:
            status = "uncertain"
            reasons.append("no PPE item is required")
        elif any(s == "not_detected" for s in states):
            status = "potential_violation"
        elif any(s == "uncertain" for s in states):
            status = "uncertain"
        else:
            status = "compliant"
        if status == "uncertain" and not reasons:
            reasons.append("not enough consistent evidence yet" if track_id is not None else "weak or missing evidence in this view")
        if status == "potential_violation":
            reasons = [f"{k.replace('_', ' ')} not detected" for k in self.required if items[k]["state"] == "not_detected"]
            if bad_view:  # the conclusion rests on earlier good-view frames and is kept through a brief poor view; say so
                reasons.append("current view is poor (" + ", ".join(bad_view) + "); conclusion is from earlier frames")
        return {"status": status, "items": items, "reasons": reasons, "reliable_view": not bad_view, "confirmed": confirmed}
