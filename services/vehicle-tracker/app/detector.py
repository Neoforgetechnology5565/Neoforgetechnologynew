"""YOLOX ONNX vehicle detector (Apache-2.0 model and code, COCO classes). Pure NumPy/OpenCV post-processing."""
from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

# COCO class ids (0-based, 80-class YOLOX ordering) that are road vehicles.
VEHICLE_CLASSES: dict[int, str] = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
VEHICLE_IDS = np.array(sorted(VEHICLE_CLASSES), dtype=np.int64)
CLASS_NAMES = ["car", "motorcycle", "bus", "truck"]


@dataclass
class Detection:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float
    cls: str  # "car" | "motorcycle" | "bus" | "truck"


def _grids(size: int) -> tuple[np.ndarray, np.ndarray]:
    grids, strides = [], []
    for s in (8, 16, 32):
        n = size // s
        xv, yv = np.meshgrid(np.arange(n), np.arange(n))
        g = np.stack((xv, yv), 2).reshape(1, -1, 2)
        grids.append(g)
        strides.append(np.full((1, g.shape[1], 1), s))
    return np.concatenate(grids, 1).astype(np.float32), np.concatenate(strides, 1).astype(np.float32)


def nms(boxes: np.ndarray, scores: np.ndarray, thr: float) -> list[int]:
    """Greedy non-maximum suppression on xyxy boxes."""
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
        order = order[1:][iou <= thr]
    return keep


class YoloxDetector:
    def __init__(self, model_path: Path, input_size: int = 416, intra_threads: int = 0):
        if not Path(model_path).is_file():
            raise FileNotFoundError("Detection model file is missing. Run `python scripts/fetch_model.py`.")
        opts = ort.SessionOptions()
        if intra_threads > 0:
            opts.intra_op_num_threads = intra_threads
        self.session = ort.InferenceSession(str(model_path), sess_options=opts, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.size = input_size
        self.model_name = Path(model_path).stem
        self._grids, self._strides = _grids(input_size)
        self._lock = threading.Lock()  # one inference at a time keeps memory and CPU use predictable

    def detect(self, frame_bgr: np.ndarray, conf: float = 0.3, nms_thr: float = 0.45) -> list[Detection]:
        h, w = frame_bgr.shape[:2]
        r = min(self.size / h, self.size / w)
        nh, nw = int(round(h * r)), int(round(w * r))
        padded = np.full((self.size, self.size, 3), 114, dtype=np.uint8)
        padded[:nh, :nw] = cv2.resize(frame_bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        blob = np.ascontiguousarray(padded.transpose(2, 0, 1)[None], dtype=np.float32)  # BGR, 0-255, no normalisation (YOLOX convention)
        with self._lock:
            out = self.session.run(None, {self.input_name: blob})[0][0].copy()
        out[:, :2] = (out[:, :2] + self._grids[0]) * self._strides[0]
        out[:, 2:4] = np.exp(out[:, 2:4]) * self._strides[0]
        cx, cy, bw, bh = out[:, 0], out[:, 1], out[:, 2], out[:, 3]
        boxes = np.stack([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], 1) / r
        cls_scores = out[:, 5:][:, VEHICLE_IDS] * out[:, 4:5]
        best = cls_scores.argmax(1)
        score = cls_scores[np.arange(len(best)), best]
        sel = score >= conf
        boxes, score, best = boxes[sel], score[sel], best[sel]
        dets: list[Detection] = []
        for c in range(len(VEHICLE_IDS)):  # class-aware NMS
            m = np.where(best == c)[0]
            for k in nms(boxes[m], score[m], nms_thr):
                b = boxes[m][k]
                x1, y1 = max(0.0, float(b[0])), max(0.0, float(b[1]))
                x2, y2 = min(float(w), float(b[2])), min(float(h), float(b[3]))
                if x2 - x1 >= 4 and y2 - y1 >= 4:
                    dets.append(Detection(x1, y1, x2, y2, float(score[m][k]), CLASS_NAMES[c]))
        dets.sort(key=lambda d: -d.score)
        return dets
