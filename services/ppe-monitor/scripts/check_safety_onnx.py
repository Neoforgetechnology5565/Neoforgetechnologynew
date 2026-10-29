"""Check the ONNX conversion of worker_safety_mobilenet against OpenCV's Caffe implementation on real image crops: raw outputs, and the final detections after the SSD decoding that the browser engine also implements.
    python scripts/check_safety_onnx.py <onnx dir> <image> [<image> ...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

HERE = Path(__file__).resolve().parent.parent / "models" / "worker-safety-mobilenet"


def decode(loc: np.ndarray, conf: np.ndarray, cfg: dict) -> list[tuple]:
    pri = np.array(cfg["priors"], np.float64)
    v = cfg["variances"]
    pw, ph = pri[:, 2] - pri[:, 0], pri[:, 3] - pri[:, 1]
    pcx, pcy = (pri[:, 0] + pri[:, 2]) / 2, (pri[:, 1] + pri[:, 3]) / 2
    l = loc.reshape(-1, 4).astype(np.float64)
    cx, cy = v[0] * l[:, 0] * pw + pcx, v[1] * l[:, 1] * ph + pcy
    w, h = np.exp(v[2] * l[:, 2]) * pw, np.exp(v[3] * l[:, 3]) * ph
    boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 1)
    sc = conf.reshape(-1, cfg["num_classes"]).astype(np.float64)
    out = []
    for c in range(1, cfg["num_classes"]):
        idx = np.where(sc[:, c] > cfg["confidence_threshold"])[0]
        idx = idx[np.argsort(-sc[idx, c], kind="stable")][: cfg["top_k"]]
        keep: list[int] = []
        for i in idx:
            ok = True
            for k in keep:
                a, b = boxes[i], boxes[k]
                iw, ih = min(a[2], b[2]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[1], b[1])
                inter = max(iw, 0) * max(ih, 0)
                if inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-12) > cfg["nms_threshold"]:
                    ok = False
                    break
            if ok:
                keep.append(int(i))
        out += [(c, float(sc[i, c]), *map(float, boxes[i])) for i in keep]
    out.sort(key=lambda r: -r[1])
    return out[: cfg["keep_top_k"]]


def main(onnx_dir: Path, images: list[str]) -> None:
    cfg = json.loads((onnx_dir / "priors.json").read_text())
    sess = ort.InferenceSession(str(onnx_dir / "worker_safety_mobilenet.onnx"), providers=["CPUExecutionProvider"])
    net = cv2.dnn.readNetFromCaffe(str(HERE / "worker_safety_mobilenet.prototxt"), str(HERE / "worker_safety_mobilenet.caffemodel"))
    worst_raw, worst_box, n_match, n_total = 0.0, 0.0, 0, 0
    rng = np.random.default_rng(0)
    for path in images:
        img = cv2.imread(path)
        H, W = img.shape[:2]
        for _ in range(6):
            cw, ch = int(rng.integers(W // 5, W // 2)), int(rng.integers(H // 3, H * 2 // 3))
            x0, y0 = int(rng.integers(0, W - cw)), int(rng.integers(0, H - ch))
            crop = img[y0:y0 + ch, x0:x0 + cw]
            blob = cv2.dnn.blobFromImage(crop, 1.0, (224, 224), (0, 0, 0), swapRB=False)
            net.setInput(blob)
            loc_c, conf_c, det = net.forward(["mbox_loc", "mbox_conf_flatten", "detection_out"])
            loc_o, conf_o = sess.run(None, {"data": blob})
            worst_raw = max(worst_raw, float(np.abs(loc_c - loc_o).max()), float(np.abs(conf_c - conf_o).max()))
            mine = decode(loc_o, conf_o, cfg)
            ref = [(int(r[1]), float(r[2]), *map(float, r[3:7])) for r in det[0, 0] if r[2] >= cfg["confidence_threshold"]]
            n_total += len(ref)
            for r in ref:
                m = next((q for q in mine if q[0] == r[0] and abs(q[1] - r[1]) < 1e-3), None)
                if m is not None:
                    n_match += 1
                    worst_box = max(worst_box, max(abs(a - b) for a, b in zip(m[2:], r[2:])))
    print(f"raw outputs: max |OpenCV - ONNX| = {worst_raw:.2e}; detections matched {n_match}/{n_total}; worst box coordinate difference {worst_box:.2e} (fractions of the crop)")


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2:])
