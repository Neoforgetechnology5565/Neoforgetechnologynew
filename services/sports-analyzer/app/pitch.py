"""Standard football pitch model, landmark catalogue and image→pitch homography from user-identified landmarks.

Pitch coordinates are metres: origin at the top-left corner of the diagram, x along the touchline (0..length), y across (0..width).
Landmark positions follow the IFAB Laws of the Game (penalty area 16.5 m deep and 40.32 m wide, goal area 5.5 m x 18.32 m,
penalty mark 11 m, centre circle and penalty arc radius 9.15 m, goal 7.32 m). Lengths and widths vary between real pitches, so the
caller passes the actual pitch size when it is known; positions on a pitch of a different size than assumed are scaled, not exact.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

PEN_D, PEN_W, GOAL_D, GOAL_W, SPOT, R, GOAL = 16.5, 40.32, 5.5, 18.32, 11.0, 9.15, 7.32


def landmarks(length: float = 105.0, width: float = 68.0) -> dict[str, dict]:
    """Named landmarks that can be recognised in an image, with pitch coordinates in metres. `side` is "L"/"R" for the two ends."""
    L, W, cy = length, width, width / 2
    out: dict[str, tuple[float, float, str]] = {}

    def add(key, x, y, label):
        out[key] = (x, y, label)

    add("corner_tl", 0, 0, "Corner, top-left")
    add("corner_bl", 0, W, "Corner, bottom-left")
    add("corner_tr", L, 0, "Corner, top-right")
    add("corner_br", L, W, "Corner, bottom-right")
    add("half_top", L / 2, 0, "Halfway line meets top touchline")
    add("half_bottom", L / 2, W, "Halfway line meets bottom touchline")
    add("centre_spot", L / 2, cy, "Centre spot")
    add("circle_top", L / 2, cy - R, "Centre circle, top of the circle on the halfway line")
    add("circle_bottom", L / 2, cy + R, "Centre circle, bottom of the circle on the halfway line")
    add("circle_left", L / 2 - R, cy, "Centre circle, leftmost point")
    add("circle_right", L / 2 + R, cy, "Centre circle, rightmost point")
    for s, x0, sgn in (("l", 0.0, 1), ("r", L, -1)):
        S = s.upper()
        add(f"pen_{s}_top_goalline", x0, cy - PEN_W / 2, f"Left penalty area, top corner on goal line" if s == "l" else "Right penalty area, top corner on goal line")
        add(f"pen_{s}_bottom_goalline", x0, cy + PEN_W / 2, f"Left penalty area, bottom corner on goal line" if s == "l" else "Right penalty area, bottom corner on goal line")
        add(f"pen_{s}_top", x0 + sgn * PEN_D, cy - PEN_W / 2, "Left penalty area, top front corner" if s == "l" else "Right penalty area, top front corner")
        add(f"pen_{s}_bottom", x0 + sgn * PEN_D, cy + PEN_W / 2, "Left penalty area, bottom front corner" if s == "l" else "Right penalty area, bottom front corner")
        add(f"goalarea_{s}_top_goalline", x0, cy - GOAL_W / 2, "Left goal area, top corner on goal line" if s == "l" else "Right goal area, top corner on goal line")
        add(f"goalarea_{s}_bottom_goalline", x0, cy + GOAL_W / 2, "Left goal area, bottom corner on goal line" if s == "l" else "Right goal area, bottom corner on goal line")
        add(f"goalarea_{s}_top", x0 + sgn * GOAL_D, cy - GOAL_W / 2, "Left goal area, top front corner" if s == "l" else "Right goal area, top front corner")
        add(f"goalarea_{s}_bottom", x0 + sgn * GOAL_D, cy + GOAL_W / 2, "Left goal area, bottom front corner" if s == "l" else "Right goal area, bottom front corner")
        add(f"spot_{s}", x0 + sgn * SPOT, cy, "Left penalty mark" if s == "l" else "Right penalty mark")
        add(f"post_{s}_top", x0, cy - GOAL / 2, "Left goal, top post base" if s == "l" else "Right goal, top post base")
        add(f"post_{s}_bottom", x0, cy + GOAL / 2, "Left goal, bottom post base" if s == "l" else "Right goal, bottom post base")
        # where the penalty arc meets the front line of the penalty area
        dx = PEN_D - SPOT
        dy = math.sqrt(max(R * R - dx * dx, 0.0))
        add(f"arc_{s}_top", x0 + sgn * PEN_D, cy - dy, "Left penalty arc meets penalty area line (top)" if s == "l" else "Right penalty arc meets penalty area line (top)")
        add(f"arc_{s}_bottom", x0 + sgn * PEN_D, cy + dy, "Left penalty arc meets penalty area line (bottom)" if s == "l" else "Right penalty arc meets penalty area line (bottom)")
    return {k: {"id": k, "x": round(x, 3), "y": round(y, 3), "label": lab} for k, (x, y, lab) in out.items()}


@dataclass
class Calibration:
    H: np.ndarray  # 3x3, reference-frame pixels -> pitch metres
    length: float
    width: float
    residual_m: float  # RMS landmark error after the fit, metres
    max_residual_m: float
    n_points: int
    inliers: list[bool]
    per_point_m: list[float]
    warnings: list[str]
    quality: str  # "good" | "approximate" | "poor"

    def to_json(self) -> dict:
        return {"points_used": self.n_points, "rms_error_m": round(self.residual_m, 3), "max_error_m": round(self.max_residual_m, 3), "per_point_error_m": [round(x, 3) for x in self.per_point_m],
                "inliers": self.inliers, "quality": self.quality, "warnings": self.warnings, "pitch_m": [self.length, self.width]}


class CalibrationError(ValueError):
    """The supplied landmarks cannot define a pitch mapping. The message is safe to show to the user."""


def fit_homography(pairs: list[tuple[float, float, float, float]], length: float, width: float, ref_to_pixel: np.ndarray | None = None) -> Calibration:
    """pairs: (image_x, image_y, pitch_x, pitch_y). Image points are in the *reference* frame pixel space (identity for a fixed camera)."""
    if len(pairs) < 4:
        raise CalibrationError("At least 4 landmarks are needed to calibrate the pitch.")
    img = np.array([[p[0], p[1]] for p in pairs], np.float64)
    pit = np.array([[p[2], p[3]] for p in pairs], np.float64)
    if not np.isfinite(img).all() or not np.isfinite(pit).all():
        raise CalibrationError("Landmark coordinates must be finite numbers.")
    if len({tuple(np.round(p, 3)) for p in pit}) < len(pit):
        raise CalibrationError("Each pitch landmark can be used only once.")
    # collinearity: the 2D spread of the pitch points must be genuinely two-dimensional, and so must the image points
    for name, pts in (("pitch", pit), ("image", img)):
        s = np.linalg.svd(pts - pts.mean(0), compute_uv=False)
        if s[1] < 0.02 * max(s[0], 1e-9):
            raise CalibrationError(f"The {name} points lie almost on a straight line. Choose landmarks that are spread across the pitch, not along one line.")
    warns: list[str] = []
    if len(pairs) == 4:
        H = cv2.getPerspectiveTransform(img.astype(np.float32), pit.astype(np.float32)).astype(np.float64)
        inl = [True] * 4
    else:
        H, mask = cv2.findHomography(img, pit, cv2.RANSAC, 1.5)  # 1.5 m tolerance in pitch space separates blunders from honest clicking error
        if H is None:
            raise CalibrationError("No consistent mapping could be found from these landmarks. Check that each image point is paired with the right pitch landmark.")
        inl = [bool(x) for x in mask.ravel()]
        if sum(inl) < 4:
            raise CalibrationError("Fewer than 4 landmarks agree with each other. Check the pairings.")
        H, _ = cv2.findHomography(img[np.array(inl)], pit[np.array(inl)], 0)  # refit on the consistent points
    proj = cv2.perspectiveTransform(img[None], H)[0]
    err = np.linalg.norm(proj - pit, axis=1)
    used = np.array(inl)
    rms = float(np.sqrt(np.mean(err[used] ** 2)))
    if not np.isfinite(H).all() or abs(np.linalg.det(H[:2, :2])) < 1e-12:
        raise CalibrationError("The landmarks give a degenerate mapping. Choose landmarks that are not clustered together.")
    if not all(inl):
        warns.append(f"{len(inl) - sum(inl)} landmark(s) disagreed with the others and were ignored.")
    if sum(inl) == 4:
        warns.append("Exactly 4 consistent landmarks fit any 4 points perfectly, so the error shown does not measure accuracy. Use 6 or more landmarks to see a real error estimate.")
    # coverage: fraction of the pitch rectangle spanned by the pitch landmarks; extrapolating far outside it is unreliable
    hull = cv2.convexHull(pit.astype(np.float32))
    cover = cv2.contourArea(hull) / (length * width)
    if cover < 0.08:
        warns.append("The landmarks cover only a small part of the pitch; positions far from them are extrapolated and may be inaccurate.")
    quality = "good" if (rms <= 1.0 and sum(inl) >= 6 and cover >= 0.12) else "approximate" if rms <= 2.5 else "poor"
    if quality == "poor":
        warns.append("The landmarks fit with a large error: the pitch mapping is poor.")
    return Calibration(H, length, width, rms, float(err[used].max()), len(pairs), inl, [float(x) for x in err], warns, quality)


def apply_h(H: np.ndarray, pts: np.ndarray) -> np.ndarray:
    pts = np.asarray(pts, np.float64).reshape(-1, 2)
    if len(pts) == 0:
        return pts
    return cv2.perspectiveTransform(pts[None], H)[0]


def zone_of(x: float, y: float, length: float, width: float) -> int | None:
    """3x3 grid index 0..8 (row-major by lane then third) for a point on the pitch, None if it is off the pitch."""
    if not (0 <= x <= length and 0 <= y <= width):
        return None
    col = min(2, int(3 * x / length))
    row = min(2, int(3 * y / width))
    return row * 3 + col
