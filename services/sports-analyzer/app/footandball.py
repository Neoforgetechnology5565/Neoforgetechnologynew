"""FootAndBall player and ball detector (Komorowski, Kurzejamski, Sarwas, VISAPP 2020; MIT code) running on ONNX Runtime.

The network is trained for high-resolution, long-shot recordings of football matches (ISSIA-CNR cameras and the SoccerPlayerDetection
set). It produces a stride-16 player map with box regression and a stride-4 ball map. This module is the post-processing: the same
3x3 non-maximum suppression and cell-to-pixel decoding as the authors' `detect_from_map`, written in NumPy.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from scipy.ndimage import maximum_filter

MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
BALL_BOX = 40.0  # the network detects the ball centre only; the authors draw a fixed-size box


@dataclass
class Det:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float


def _peaks(prob: np.ndarray, thr: float, k: int) -> list[tuple[int, int, float]]:
    """3x3 non-maximum suppression of a confidence map, strongest first (ties are kept out by the strict inequality, as in the reference)."""
    pad = np.pad(prob, 1, mode="edge")
    nb = np.stack([pad[dy:dy + prob.shape[0], dx:dx + prob.shape[1]] for dy in range(3) for dx in range(3) if not (dy == 1 and dx == 1)]).max(0)
    keep = (prob > nb) & (prob >= thr)
    ys, xs = np.nonzero(keep)
    order = np.argsort(-prob[ys, xs])[:k]
    return [(int(ys[i]), int(xs[i]), float(prob[ys[i], xs[i]])) for i in order]


class FootAndBall:
    model_name = "footandball"

    def __init__(self, path: Path, intra_threads: int = 0):
        if not Path(path).is_file():
            raise FileNotFoundError("The FootAndBall model file is missing. Run `python scripts/fetch_models.py`.")
        o = ort.SessionOptions()
        if intra_threads > 0:
            o.intra_op_num_threads = intra_threads
        self.session = ort.InferenceSession(str(path), sess_options=o, providers=["CPUExecutionProvider"])
        self._lock = threading.Lock()

    def infer(self, frame_bgr: np.ndarray, scale: float = 1.0):
        """Run the network. Returns (ball_prob, player_prob, player_box, effective_scale) for the padded, scaled frame."""
        h, w = frame_bgr.shape[:2]
        if scale != 1.0:
            frame_bgr = cv2.resize(frame_bgr, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA)
        sh, sw = frame_bgr.shape[:2]
        ph, pw = (-sh) % 32, (-sw) % 32
        if ph or pw:
            frame_bgr = cv2.copyMakeBorder(frame_bgr, 0, ph, 0, pw, cv2.BORDER_REPLICATE)
        x = (cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0 - MEAN) / STD
        x = np.ascontiguousarray(x.transpose(2, 0, 1)[None])
        with self._lock:
            ball, player, box = self.session.run(None, {"input": x})
        return ball[0, 1], player[0, 1], box[0], (sw / w, sh / h)

    def detect(self, frame_bgr: np.ndarray, player_thr: float = 0.5, ball_thr: float = 0.2, scale: float = 1.0, max_players: int = 60, max_ball: int = 5) -> tuple[list[Det], list[Det]]:
        h, w = frame_bgr.shape[:2]
        ball, player, box, (sx, sy) = self.infer(frame_bgr, scale)
        ph, pw = player.shape
        players: list[Det] = []
        for cy, cx, sc in _peaks(player, player_thr, max_players):
            # box map is (dx, dy, w, h) in fractions of the (padded) image, relative to the cell centre
            fw, fh = pw * 16, ph * 16
            ccx, ccy = cx * 16 + 7.5, cy * 16 + 7.5
            bx, by = ccx + box[0, cy, cx] * fw, ccy + box[1, cy, cx] * fh
            bw, bh = box[2, cy, cx] * fw, box[3, cy, cx] * fh
            if bw < 2 or bh < 2:
                continue
            x1, y1, x2, y2 = (bx - bw / 2) / sx, (by - bh / 2) / sy, (bx + bw / 2) / sx, (by + bh / 2) / sy
            players.append(Det(float(np.clip(x1, 0, w)), float(np.clip(y1, 0, h)), float(np.clip(x2, 0, w)), float(np.clip(y2, 0, h)), sc))
        balls: list[Det] = []
        for cy, cx, sc in _peaks(ball, ball_thr, max_ball):
            bx, by = (cx * 4 + 1.5) / sx, (cy * 4 + 1.5) / sy
            balls.append(Det(bx - BALL_BOX / 2, by - BALL_BOX / 2, bx + BALL_BOX / 2, by + BALL_BOX / 2, sc))
        return players, balls
