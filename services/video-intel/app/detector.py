"""Person and sports-ball detection with YOLOX-S (Megvii, Apache-2.0, trained on COCO). COCO class 0 = person, class 32 = sports ball.
The ball class is weak for small, fast or blurred balls: the ball tracker (ball.py) treats it as one candidate source among others."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

SIZE = 640
STRIDES = (8, 16, 32)
PERSON, BALL = 0, 32


def _grids() -> tuple[np.ndarray, np.ndarray]:
    gs, ss = [], []
    for s in STRIDES:
        n = SIZE // s
        xv, yv = np.meshgrid(np.arange(n), np.arange(n))
        gs.append(np.stack((xv, yv), 2).reshape(-1, 2))
        ss.append(np.full((n * n, 1), s))
    return np.concatenate(gs).astype(np.float32), np.concatenate(ss).astype(np.float32)


_GRID, _STRIDE = _grids()


def nms(boxes: np.ndarray, scores: np.ndarray, thr: float) -> list[int]:
    idx = cv2.dnn.NMSBoxes(np.c_[boxes[:, :2], boxes[:, 2:] - boxes[:, :2]].tolist(), scores.tolist(), 0.0, thr)
    return [int(i) for i in np.array(idx).reshape(-1)]


class Detector:
    name = "YOLOX-S (COCO: person, sports ball)"

    def __init__(self, path: Path, threads: int = 0):
        opt = ort.SessionOptions()
        if threads:
            opt.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(path), opt, providers=["CPUExecutionProvider"])
        self.inp = self.sess.get_inputs()[0].name

    def __call__(self, bgr: np.ndarray, person_thr: float = 0.1, ball_thr: float = 0.1, nms_thr: float = 0.45) -> dict[str, tuple[np.ndarray, np.ndarray]]:
        h, w = bgr.shape[:2]
        r = min(SIZE / h, SIZE / w)
        nh, nw = int(round(h * r)), int(round(w * r))
        pad = np.full((SIZE, SIZE, 3), 114, np.uint8)
        pad[:nh, :nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        out = self.sess.run(None, {self.inp: pad.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
        xy = (out[:, :2] + _GRID) * _STRIDE
        wh = np.exp(out[:, 2:4]) * _STRIDE
        res = {}
        for name, cls, thr in (("person", PERSON, person_thr), ("ball", BALL, ball_thr)):
            score = out[:, 4] * out[:, 5 + cls]
            keep = score >= thr
            if not keep.any():
                res[name] = (np.zeros((0, 4), np.float32), np.zeros(0, np.float32))
                continue
            b = np.c_[xy[keep] - wh[keep] / 2, xy[keep] + wh[keep] / 2] / r
            b[:, [0, 2]] = b[:, [0, 2]].clip(0, w)
            b[:, [1, 3]] = b[:, [1, 3]].clip(0, h)
            k = nms(b, score[keep], nms_thr)
            res[name] = (b[k].astype(np.float32), score[keep][k].astype(np.float32))
        return res
