"""Single-person pose from a person crop: MediaPipe BlazePose 'full' landmark model (Apache-2.0), converted from TFLite to ONNX.

Top-down use: the tracker's person box is expanded to a square crop, resized to 256x256, and the 33 body landmarks are mapped back.
Unlike MediaPipe's own pipeline there is no body-axis rotation of the crop, so strongly tilted or horizontal bodies are less
reliable; every keypoint carries the model's visibility value and the per-person 'pose presence' score is stored.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

N = 33
NAMES = ["nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer", "left_ear", "right_ear",
         "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
         "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb", "left_hip", "right_hip",
         "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel", "left_foot_index", "right_foot_index"]
LS, RS, LH, RH, LW, RW, LA, RA, LK, RK = 11, 12, 23, 24, 15, 16, 27, 28, 25, 26
# skeleton drawn in the UI (body only; face/hand/foot points are stored but not connected)
BONES = [(LS, RS), (LS, LH), (RS, RH), (LH, RH), (LS, 13), (13, LW), (RS, 14), (14, RW), (LH, LK), (LK, LA), (RH, RK), (RK, RA)]


class PoseEstimator:
    name = "BlazePose full (MediaPipe, ONNX)"

    def __init__(self, path: Path, threads: int = 0):
        opt = ort.SessionOptions()
        if threads:
            opt.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(path), opt, providers=["CPUExecutionProvider"])
        self.inp = self.sess.get_inputs()[0].name

    def __call__(self, bgr: np.ndarray, box: np.ndarray, expand: float = 1.25) -> tuple[np.ndarray, float]:
        """Returns (33x4 array of x, y in image pixels, visibility, presence-of-person-in-crop) and the pose-presence score."""
        h, w = bgr.shape[:2]
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        side = max(box[2] - box[0], box[3] - box[1]) * expand
        x0, y0 = cx - side / 2, cy - side / 2
        m = np.array([[256 / side, 0, -x0 * 256 / side], [0, 256 / side, -y0 * 256 / side]], np.float32)
        crop = cv2.warpAffine(bgr, m, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
        x = (crop[:, :, ::-1].astype(np.float32) / 255.0)[None]
        res = self.sess.run(None, {self.inp: x})
        lm = res[0].reshape(-1, 5)[:N]  # x, y, z in crop pixels (256), visibility and presence logits
        presence = float(res[1].reshape(-1)[0])  # already a probability in the converted model
        out = np.zeros((N, 4), np.float32)
        out[:, 0] = lm[:, 0] * side / 256 + x0
        out[:, 1] = lm[:, 1] * side / 256 + y0
        out[:, 2] = 1 / (1 + np.exp(-lm[:, 3]))
        out[:, 3] = 1 / (1 + np.exp(-lm[:, 4]))
        return out, presence
