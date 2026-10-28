"""Roof segmentation model: a U-Net (7.8 M parameters) run with ONNX Runtime on CPU. See docs/roof/MODEL_AND_LICENSES.md for provenance and limits."""
from __future__ import annotations

import threading
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

TILE, OVERLAP = 768, 96


class RoofSegmenter:
    def __init__(self, model_path: Path, intra_threads: int = 0):
        if not Path(model_path).is_file():
            raise FileNotFoundError("The roof model file is missing. Run `python scripts/fetch_model.py`.")
        opts = ort.SessionOptions()
        if intra_threads > 0:
            opts.intra_op_num_threads = intra_threads
        self.session = ort.InferenceSession(str(model_path), sess_options=opts, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.model_name = Path(model_path).stem
        self._lock = threading.Lock()

    def _run(self, bgr: np.ndarray) -> np.ndarray:
        h, w = bgr.shape[:2]
        H, W = (h + 15) // 16 * 16, (w + 15) // 16 * 16  # the network pools three times: pad to a multiple of 8 (16 for safety)
        pad = cv2.copyMakeBorder(bgr, 0, H - h, 0, W - w, cv2.BORDER_REFLECT) if (H, W) != (h, w) else bgr
        x = np.ascontiguousarray(pad[None].astype(np.float32) / 255.0)  # BGR, 0..1: the channel order the network was trained with
        with self._lock:
            out = self.session.run(None, {self.input_name: x})[0]
        return out[0, :h, :w, 0]

    def predict(self, rgb: np.ndarray, model_scale: float = 1.0, cancelled=lambda: False) -> np.ndarray:
        """Per-pixel roof probability (float32, same size as the input). Large images are processed in overlapping tiles with feathered blending."""
        h, w = rgb.shape[:2]
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        if model_scale != 1.0:
            bgr = cv2.resize(bgr, None, fx=model_scale, fy=model_scale, interpolation=cv2.INTER_CUBIC if model_scale > 1 else cv2.INTER_AREA)
        sh, sw = bgr.shape[:2]
        if sh <= TILE + OVERLAP and sw <= TILE + OVERLAP:
            prob = self._run(bgr)
        else:
            prob, wsum = np.zeros((sh, sw), np.float32), np.zeros((sh, sw), np.float32)
            step = TILE - OVERLAP
            ramp = np.minimum(1.0, np.arange(1, OVERLAP + 1, dtype=np.float32) / OVERLAP)
            for y0 in range(0, max(1, sh - OVERLAP), step):
                for x0 in range(0, max(1, sw - OVERLAP), step):
                    if cancelled():
                        raise InterruptedError
                    y1, x1 = min(sh, y0 + TILE), min(sw, x0 + TILE)
                    y0b, x0b = max(0, y1 - TILE), max(0, x1 - TILE)
                    p = self._run(bgr[y0b:y1, x0b:x1])
                    wy = np.ones(y1 - y0b, np.float32); wx = np.ones(x1 - x0b, np.float32)
                    if y0b > 0: wy[:OVERLAP] = ramp[:len(wy)]
                    if y1 < sh: wy[-OVERLAP:] = ramp[::-1][-len(wy):]
                    if x0b > 0: wx[:OVERLAP] = ramp[:len(wx)]
                    if x1 < sw: wx[-OVERLAP:] = ramp[::-1][-len(wx):]
                    wgt = wy[:, None] * wx[None, :]
                    prob[y0b:y1, x0b:x1] += p * wgt
                    wsum[y0b:y1, x0b:x1] += wgt
            prob /= np.maximum(wsum, 1e-6)
        if (sh, sw) != (h, w):
            prob = cv2.resize(prob, (w, h), interpolation=cv2.INTER_LINEAR)
        return prob.astype(np.float32)
