"""Synthetic skeletons for testing the rule logic. These are generated keypoints, NOT model output and NOT a validation of the rules on real falls:
they check that the temporal logic does what its documentation says for clearly defined motions."""
from __future__ import annotations

import numpy as np

from app.activity import Sample

H = 300.0  # body height in px


def skeleton(cx: float, ankle_y: float, tilt_deg: float, arm_phase: float | None = None, arm_amp: float = 0.0, vis: float = 0.95) -> tuple[np.ndarray, tuple]:
    """Rigid body rotated by tilt_deg about the ankles (0 = standing). Wrists optionally swing by arm_amp * H."""
    t = np.radians(tilt_deg)
    u = np.array([np.sin(t), -np.cos(t)])   # ankle -> head direction in image coordinates
    p = np.array([np.cos(t), np.sin(t)])    # left -> right direction
    ankle = np.array([cx, ankle_y])
    kp = np.zeros((33, 4), np.float32)
    kp[:, 2], kp[:, 3] = vis, vis
    for i in range(33):
        kp[i, :2] = ankle + 0.5 * H * u
    def put(i, along, side):
        kp[i, :2] = ankle + along * H * u + side * H * p
    put(11, 0.80, -0.10); put(12, 0.80, 0.10); put(23, 0.50, -0.06); put(24, 0.50, 0.06)
    put(0, 0.92, 0.0); put(25, 0.27, -0.06); put(26, 0.27, 0.06); put(27, 0.02, -0.06); put(28, 0.02, 0.06)
    put(13, 0.62, -0.12); put(14, 0.62, 0.12)
    swing = 0.0 if arm_phase is None else arm_amp * np.sin(arm_phase)
    put(15, 0.45 + swing, -0.14); put(16, 0.45 - swing, 0.14)
    xs, ys = kp[:, 0], kp[:, 1]
    box = (float(xs.min() - 10), float(ys.min() - 10), float(xs.max() + 10), float(ys.max() + 10))
    return kp, box


def fall_track(fps: float = 5.0, stand_s: float = 2.0, fall_s: float = 0.6, lie_s: float = 2.5, recover: bool = False, cx: float = 200.0, ankle_y: float = 400.0) -> list[Sample]:
    out, n = [], int((stand_s + fall_s + lie_s) * fps)
    for i in range(n):
        t = i / fps
        if t < stand_s:
            tilt = 3.0 * np.sin(t * 3)
        elif t < stand_s + fall_s:
            tilt = 90 * (t - stand_s) / fall_s
        else:
            tilt = 90.0
            if recover and t > stand_s + fall_s + lie_s - 0.8:
                tilt = 10.0
        kp, box = skeleton(cx, ankle_y, tilt)
        out.append(Sample(round(t, 3), box, 0.9, kp))
    return out
