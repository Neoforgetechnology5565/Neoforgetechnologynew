"""Person detection with YOLOX-S (Megvii, Apache-2.0, COCO-trained). Only the COCO 'person' class is kept."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

SIZE = 640
STRIDES = (8, 16, 32)


def _grids(size: int = SIZE) -> tuple[np.ndarray, np.ndarray]:
    gs, ss = [], []
    for s in STRIDES:
        n = size // s
        xv, yv = np.meshgrid(np.arange(n), np.arange(n))
        gs.append(np.stack((xv, yv), 2).reshape(-1, 2))
        ss.append(np.full((n * n, 1), s))
    return np.concatenate(gs).astype(np.float32), np.concatenate(ss).astype(np.float32)


_GRID, _STRIDE = _grids()


def nms(boxes: np.ndarray, scores: np.ndarray, thr: float) -> list[int]:
    idx = cv2.dnn.NMSBoxes(np.c_[boxes[:, :2], boxes[:, 2:] - boxes[:, :2]].tolist(), scores.tolist(), 0.0, thr)
    return [int(i) for i in np.array(idx).reshape(-1)]


class PersonDetector:
    name = "YOLOX-S (COCO, person class)"

    def __init__(self, path: Path, threads: int = 0):
        opt = ort.SessionOptions()
        if threads:
            opt.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(path), opt, providers=["CPUExecutionProvider"])
        self.inp = self.sess.get_inputs()[0].name

    def __call__(self, bgr: np.ndarray, score_thr: float = 0.25, nms_thr: float = 0.45) -> tuple[np.ndarray, np.ndarray]:
        """Returns (boxes xyxy in image pixels, scores) for persons. Score = objectness x class probability as defined by YOLOX."""
        h, w = bgr.shape[:2]
        r = min(SIZE / h, SIZE / w)
        nh, nw = int(round(h * r)), int(round(w * r))
        pad = np.full((SIZE, SIZE, 3), 114, np.uint8)
        pad[:nh, :nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        x = pad.transpose(2, 0, 1)[None].astype(np.float32)  # BGR, 0-255 (YOLOX convention)
        out = self.sess.run(None, {self.inp: x})[0][0]
        xy = (out[:, :2] + _GRID) * _STRIDE
        wh = np.exp(out[:, 2:4]) * _STRIDE
        score = out[:, 4] * out[:, 5]  # class 0 = person
        keep = score >= score_thr
        if not keep.any():
            return np.zeros((0, 4), np.float32), np.zeros(0, np.float32)
        xy, wh, score = xy[keep], wh[keep], score[keep]
        b = np.c_[xy - wh / 2, xy + wh / 2] / r
        b[:, [0, 2]] = b[:, [0, 2]].clip(0, w)
        b[:, [1, 3]] = b[:, [1, 3]].clip(0, h)
        k = nms(b, score, nms_thr)
        return b[k].astype(np.float32), score[k].astype(np.float32)
