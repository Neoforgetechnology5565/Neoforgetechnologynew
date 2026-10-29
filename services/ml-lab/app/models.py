"""Model wrappers (ONNX Runtime, CPU). Each wrapper says what it is, where the weights came from and under which licence."""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

COCO = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
        "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon",
        "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave",
        "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"]
VOC = ["background", "aeroplane", "bicycle", "bird", "boat", "bottle", "bus", "car", "cat", "chair", "cow", "dining table", "dog", "horse", "motorbike", "person", "potted plant", "sheep", "sofa", "train", "tv monitor"]
INFO = {
    "classifier": {"name": "MobileNetV2 (ImageNet, 1000 classes)", "source": "Keras Applications weights (Google), converted to ONNX with tf2onnx", "licence": "Apache-2.0"},
    "detector": {"name": "YOLOX-S (COCO, 80 classes)", "source": "Megvii YOLOX 0.1.1rc0 release, unmodified ONNX", "licence": "Apache-2.0"},
    "segmenter": {"name": "DeepLabV3 MobileNetV2 (PASCAL VOC, 21 classes, 257x257 input)", "source": "Google MediaPipe image_segmenter deeplab_v3 TFLite, converted to ONNX with tf2onnx", "licence": "Apache-2.0"},
    "pose": {"name": "BlazePose full (33 keypoints) on YOLOX person boxes", "source": "MediaPipe pose_landmark_full.tflite (mediapipe 0.10.14 wheel), converted to ONNX", "licence": "Apache-2.0"},
}


def _sess(path: Path) -> ort.InferenceSession:
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


class Classifier:
    def __init__(self, d: Path):
        self.s = _sess(d / "mobilenet_v2.onnx")
        self.inp = self.s.get_inputs()[0].name
        idx = json.loads((d / "imagenet_class_index.json").read_text())
        self.names = [idx[str(i)][1].replace("_", " ") for i in range(1000)]
        self.feat = _sess(d / "mobilenet_v2_features.onnx")

    @staticmethod
    def prep(bgr: np.ndarray) -> np.ndarray:
        h, w = bgr.shape[:2]
        s = 256 / min(h, w)
        r = cv2.resize(bgr, (max(224, round(w * s)), max(224, round(h * s))), interpolation=cv2.INTER_AREA)
        y, x = (r.shape[0] - 224) // 2, (r.shape[1] - 224) // 2
        c = r[y:y + 224, x:x + 224, ::-1].astype(np.float32) / 127.5 - 1.0
        return c[None]

    def __call__(self, bgr: np.ndarray, k: int = 5) -> list[dict]:
        p = self.s.run(None, {self.inp: self.prep(bgr)})[0][0]
        return [{"label": self.names[i], "class_index": int(i), "probability": float(p[i])} for i in p.argsort()[::-1][:k]]

    def embed(self, bgr: np.ndarray) -> np.ndarray:
        v = self.feat.run(None, {self.feat.get_inputs()[0].name: self.prep(bgr)})[0][0]
        return v / (np.linalg.norm(v) + 1e-9)


class Detector:
    SIZE, STRIDES = 640, (8, 16, 32)

    def __init__(self, path: Path):
        self.s = _sess(path)
        self.inp = self.s.get_inputs()[0].name
        g, st = [], []
        for s in self.STRIDES:
            n = self.SIZE // s
            xv, yv = np.meshgrid(np.arange(n), np.arange(n))
            g.append(np.stack((xv, yv), 2).reshape(-1, 2)); st.append(np.full((n * n, 1), s))
        self.grid, self.stride = np.concatenate(g).astype(np.float32), np.concatenate(st).astype(np.float32)

    def __call__(self, bgr: np.ndarray, thr: float = 0.3, nms: float = 0.45, only_person: bool = False) -> list[dict]:
        h, w = bgr.shape[:2]
        r = min(self.SIZE / h, self.SIZE / w)
        nh, nw = int(round(h * r)), int(round(w * r))
        pad = np.full((self.SIZE, self.SIZE, 3), 114, np.uint8)
        pad[:nh, :nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        out = self.s.run(None, {self.inp: pad.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
        cls = out[:, 5:]
        cid = cls.argmax(1) if not only_person else np.zeros(len(out), int)
        score = out[:, 4] * (cls[np.arange(len(out)), cid])
        keep = score >= thr
        if not keep.any():
            return []
        xy, wh = (out[keep, :2] + self.grid[keep]) * self.stride[keep], np.exp(out[keep, 2:4]) * self.stride[keep]
        b, sc, ci = np.c_[xy - wh / 2, xy + wh / 2] / r, score[keep], cid[keep]
        b[:, [0, 2]] = b[:, [0, 2]].clip(0, w); b[:, [1, 3]] = b[:, [1, 3]].clip(0, h)
        off = ci[:, None] * 10000.0  # class-wise NMS
        idx = cv2.dnn.NMSBoxes(np.c_[b[:, :2] + off, b[:, 2:] - b[:, :2]].tolist(), sc.tolist(), 0.0, nms)
        return [{"box": [round(float(v), 1) for v in b[i]], "label": COCO[ci[i]], "class_index": int(ci[i]), "score": float(sc[i])} for i in np.array(idx).reshape(-1)]


class Segmenter:
    def __init__(self, d: Path):
        self.s = _sess(d / "deeplab_v3.onnx")
        self.inp = self.s.get_inputs()[0].name

    def __call__(self, bgr: np.ndarray) -> np.ndarray:
        """Class-index mask at the image's own size (nearest-neighbour upsampling of the 257x257 logits' argmax after bilinear resize of the logits)."""
        h, w = bgr.shape[:2]
        x = (cv2.resize(bgr, (257, 257), interpolation=cv2.INTER_AREA)[:, :, ::-1].astype(np.float32) - 127.5) / 127.5
        lg = self.s.run(None, {self.inp: x[None]})[0][0]
        lg = cv2.resize(lg, (w, h), interpolation=cv2.INTER_LINEAR)
        return lg.argmax(-1).astype(np.uint8)


class Pose:
    N = 33
    BONES = [(11, 12), (11, 23), (12, 24), (23, 24), (11, 13), (13, 15), (12, 14), (14, 16), (23, 25), (25, 27), (24, 26), (26, 28), (0, 11), (0, 12)]
    NAMES = ["nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer", "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
             "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel", "left_foot_index", "right_foot_index"]

    def __init__(self, path: Path):
        self.s = _sess(path)
        self.inp = self.s.get_inputs()[0].name

    def __call__(self, bgr: np.ndarray, box: list[float], expand: float = 1.25) -> tuple[np.ndarray, float]:
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        side = max(box[2] - box[0], box[3] - box[1]) * expand
        x0, y0 = cx - side / 2, cy - side / 2
        m = np.array([[256 / side, 0, -x0 * 256 / side], [0, 256 / side, -y0 * 256 / side]], np.float32)
        crop = cv2.warpAffine(bgr, m, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        res = self.s.run(None, {self.inp: (crop[:, :, ::-1].astype(np.float32) / 255.0)[None]})
        lm = res[0].reshape(-1, 5)[:self.N]
        out = np.zeros((self.N, 3), np.float32)
        out[:, 0], out[:, 1] = lm[:, 0] * side / 256 + x0, lm[:, 1] * side / 256 + y0
        out[:, 2] = 1 / (1 + np.exp(-lm[:, 3]))
        return out, float(res[1].reshape(-1)[0])
