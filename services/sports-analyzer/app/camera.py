"""Camera-motion estimation between analysed frames, so tracks and pitch positions stay valid when the camera pans or zooms.

For each analysed frame a homography H_ref<-frame is estimated by tracking background corners (player boxes masked out) with pyramidal
Lucas-Kanade flow from the previous analysed frame and fitting a homography with RANSAC; these are chained back to the first frame of the
current *segment*. A new segment starts (and chaining resets) when the fit is unreliable, for example at a broadcast cut. Pitch positions
are only produced for frames in the segment the user calibrated, and each frame carries the inlier count that supports its transform.
A fixed camera produces transforms that are numerically close to the identity; those are snapped to the identity so that noise does not
drift the reference frame.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

MIN_INLIERS = 25
MIN_INLIER_RATIO = 0.4
WORK_WIDTH = 640


@dataclass
class MotionState:
    segment: int = 0
    H: np.ndarray = field(default_factory=lambda: np.eye(3))  # reference <- current frame (full-resolution pixels)
    inliers: int = 0
    reliable: bool = True


class CameraMotion:
    def __init__(self, width: int, height: int):
        self.scale = min(1.0, WORK_WIDTH / width)
        self.size = (int(round(width * self.scale)), int(round(height * self.scale)))
        self.prev: np.ndarray | None = None
        self.state = MotionState()
        self.S = np.diag([self.scale, self.scale, 1.0])
        self.Sinv = np.linalg.inv(self.S)
        self.max_shift = 0.0
        self.max_center_shift = 0.0  # largest displacement of the frame centre in the reference frame, full-resolution pixels
        self._center = np.array([width / 2.0, height / 2.0, 1.0])

    def _gray(self, frame: np.ndarray) -> np.ndarray:
        return cv2.cvtColor(cv2.resize(frame, self.size, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)

    def update(self, frame: np.ndarray, boxes: list[tuple[float, float, float, float]]) -> MotionState:
        """Return the state for this frame. `boxes` are player/ball boxes (full-res pixels) excluded from the background."""
        g = self._gray(frame)
        if self.prev is None:
            self.prev = g
            self.state = MotionState(0, np.eye(3), 0, True)
            return self.state
        mask = np.full(g.shape, 255, np.uint8)
        for x1, y1, x2, y2 in boxes:
            cv2.rectangle(mask, (int(x1 * self.scale) - 4, int(y1 * self.scale) - 4), (int(x2 * self.scale) + 4, int(y2 * self.scale) + 4), 0, -1)
        pts = cv2.goodFeaturesToTrack(self.prev, 400, 0.01, 8, mask=mask)
        ok = False
        Hrel = np.eye(3)
        n_in = 0
        if pts is not None and len(pts) >= 20:
            nxt, st, _ = cv2.calcOpticalFlowPyrLK(self.prev, g, pts, None, winSize=(21, 21), maxLevel=3)
            good = st.ravel() == 1
            a, b = pts[good].reshape(-1, 2), nxt[good].reshape(-1, 2)
            if len(a) >= 15:
                H, inl = cv2.findHomography(b, a, cv2.RANSAC, 2.0)  # maps current -> previous
                if H is not None and inl is not None:
                    n_in = int(inl.sum())
                    ok = n_in >= MIN_INLIERS and n_in / len(a) >= MIN_INLIER_RATIO and np.isfinite(H).all() and abs(np.linalg.det(H[:2, :2])) > 0.5 and abs(np.linalg.det(H[:2, :2])) < 2.0
                    Hrel = H
        self.prev = g
        if not ok:
            # unreliable: start a new segment. Positions from here on cannot be related to earlier frames.
            self.state = MotionState(self.state.segment + 1, np.eye(3), n_in, False)
            return self.state
        # snap near-identity motion (fixed camera) to exactly identity
        corners = np.array([[0, 0], [self.size[0], 0], [self.size[0], self.size[1]], [0, self.size[1]]], np.float64)
        moved = np.abs(cv2.perspectiveTransform(corners[None], Hrel)[0] - corners).max()
        if moved < 0.35:
            Hrel = np.eye(3)
        Hfull = self.Sinv @ Hrel @ self.S  # full-res current -> full-res previous
        self.state = MotionState(self.state.segment, self.state.H @ Hfull, n_in, True)
        self.max_shift = max(self.max_shift, float(moved))
        c = self.state.H @ self._center
        self.max_center_shift = max(self.max_center_shift, float(np.hypot(c[0] / c[2] - self._center[0], c[1] / c[2] - self._center[1])))
        return self.state


def warp_box(H: np.ndarray, b: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = b
    c = np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], np.float64)
    w = cv2.perspectiveTransform(c[None], H)[0]
    return float(w[:, 0].min()), float(w[:, 1].min()), float(w[:, 0].max()), float(w[:, 1].max())
