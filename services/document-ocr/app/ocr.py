"""Optical character recognition (RapidOCR: PP-OCR detection, direction classifier and recognition models run with ONNX Runtime; Apache-2.0)
plus the OpenCV pre-processing used before it: skew estimation/correction and optional contrast enhancement."""
from __future__ import annotations

import threading
import time

import cv2
import numpy as np

ENGINE_INFO = {"name": "RapidOCR (PP-OCR v3 detection + recognition, ONNX Runtime)", "licence": "Apache-2.0", "languages": "English and Chinese character sets; the demonstration is tuned for Latin text",
               "note": "Gives a confidence for every recognised line; it is the engine's own score, not the probability that the text is right."}


def estimate_skew(gray: np.ndarray, max_angle: float = 8.0) -> tuple[float, float]:
    """Projection-profile skew estimate: the correction angle in degrees in OpenCV's convention (positive rotates the image counter-clockwise;
    a scan whose text runs 1.4 degrees counter-clockwise gives about -1.4). Returns (correction angle, sharpness gain). The gain compares the profile variance at the best angle with that at 0 degrees; ~1 means no evidence."""
    h, w = gray.shape
    s = 800 / max(h, w)
    small = cv2.resize(gray, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else gray
    bw = cv2.adaptiveThreshold(small, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 15)
    bw = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((1, 1), np.uint8))
    hh, ww = bw.shape
    c = (ww / 2, hh / 2)

    def score(a: float) -> float:
        m = cv2.getRotationMatrix2D(c, a, 1.0)
        r = cv2.warpAffine(bw, m, (ww, hh), flags=cv2.INTER_NEAREST)
        p = r.sum(axis=1).astype(np.float64)
        return float(np.var(np.diff(p)))

    coarse = np.arange(-max_angle, max_angle + 0.01, 0.5)
    sc = [score(a) for a in coarse]
    best = float(coarse[int(np.argmax(sc))])
    fine = np.arange(best - 0.5, best + 0.51, 0.1)
    fs = [score(a) for a in fine]
    angle = float(fine[int(np.argmax(fs))])
    base = score(0.0)
    return angle, (max(fs) / base if base > 0 else 1.0)


def rotate(img: np.ndarray, angle: float) -> np.ndarray:
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))


def enhance(img: np.ndarray) -> np.ndarray:
    """Local contrast (CLAHE on lightness) and mild denoising."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    lab[:, :, 0] = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(lab[:, :, 0])
    return cv2.fastNlMeansDenoisingColored(cv2.cvtColor(lab, cv2.COLOR_LAB2BGR), None, 3, 3, 7, 21)


class Ocr:
    def __init__(self, threads: int = 0):
        from rapidocr_onnxruntime import RapidOCR
        kw = {"intra_op_num_threads": threads} if threads else {}
        self.engine = RapidOCR(**kw)
        self.lock = threading.Lock()  # one recognition at a time per engine instance

    # engine defaults are box 0.5 / score 0.5 / unclip 1.6. "high" lets in smaller and fainter text (single digits in table cells were missed at the defaults on the simulated scan)
    SENSITIVITY = {"standard": {}, "high": {"box_thresh": 0.3, "text_score": 0.3, "unclip_ratio": 2.0}}

    def __call__(self, bgr: np.ndarray, sensitivity: str = "high") -> tuple[list[dict], float]:
        """Returns (items, seconds). Items are in normalised page coordinates with the engine's own confidence per line."""
        h, w = bgr.shape[:2]
        t = time.perf_counter()
        with self.lock:
            res, _ = self.engine(bgr, **self.SENSITIVITY[sensitivity])
        dt = time.perf_counter() - t
        items = []
        for box, text, conf in (res or []):
            pts = np.array(box, float)
            text = str(text).strip()
            if not text:
                continue
            items.append({"text": text, "bbox": [round(float(pts[:, 0].min()) / w, 5), round(float(pts[:, 1].min()) / h, 5), round(float(pts[:, 0].max()) / w, 5), round(float(pts[:, 1].max()) / h, 5)],
                          "conf": round(float(conf), 3), "poly": [[round(float(x) / w, 5), round(float(y) / h, 5)] for x, y in pts]})
        return items, dt
