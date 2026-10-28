"""Monocular depth with Depth Anything V2 Small (ONNX, Apache-2.0). The output is RELATIVE inverse depth (larger = nearer): it has no metric scale."""
from __future__ import annotations

import threading
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

SIZE = 518
MEAN, STD = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)


class DepthModel:
    def __init__(self, path: Path, threads: int = 0):
        if not Path(path).is_file():
            raise FileNotFoundError("The depth model is missing. Run `python scripts/fetch_models.py`.")
        o = ort.SessionOptions()
        if threads > 0:
            o.intra_op_num_threads = threads
        self.s = ort.InferenceSession(str(path), sess_options=o, providers=["CPUExecutionProvider"])
        self.inp = self.s.get_inputs()[0].name
        self.lock = threading.Lock()
        self.name = "depth_anything_v2_vits"

    def predict(self, bgr: np.ndarray) -> np.ndarray:
        """Relative inverse depth, float32, same size as the input image."""
        h, w = bgr.shape[:2]
        k = SIZE / max(h, w)
        nh, nw = max(1, round(h * k)), max(1, round(w * k))
        rgb = cv2.cvtColor(cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC), cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        pad = cv2.copyMakeBorder(rgb, 0, SIZE - nh, 0, SIZE - nw, cv2.BORDER_REPLICATE)
        x = ((pad - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
        with self.lock:
            out = self.s.run(None, {self.inp: x})[0][0]
        return cv2.resize(out[:nh, :nw], (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)


def colorize(d: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(d, (1, 99))
    n = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
    return cv2.applyColorMap((n * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
