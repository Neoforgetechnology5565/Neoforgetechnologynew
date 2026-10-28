"""Measurement engine. Pure functions: pixel geometry in, metric geometry out, and ONLY when a defensible scale exists.

Scale sources (see docs/roof/MEASUREMENT.md):
  geo         ground sample distance read from GeoTIFF tags            -> plan-view measurements, valid for near-nadir imagery
  gsd         ground sample distance typed in by the user              -> same, user-supplied (not verified)
  reference   one known length between two image points (user)         -> isotropic scale, plan-view, assumes the reference lies in the roof's plane and the view is nadir
  plane_quad  four image points forming a rectangle of known size on the roof plane (user) -> homography: true measurements IN THAT PLANE under perspective
Without any of these, nothing is converted to metres.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np


class ScaleError(ValueError):
    pass


@dataclass
class Scale:
    kind: str  # geo | gsd | reference | plane_quad
    source: str  # "GeoTIFF tags" | "user"
    meaning: str  # what the metric values mean
    gsd_x: float | None = None
    gsd_y: float | None = None
    H: np.ndarray | None = None  # homography pixel -> plane metres (plane_quad)
    note: str = ""

    def to_metric(self, pts: np.ndarray) -> np.ndarray:
        pts = np.asarray(pts, np.float64).reshape(-1, 2)
        if self.H is not None:
            q = np.hstack([pts, np.ones((len(pts), 1))]) @ self.H.T
            return q[:, :2] / q[:, 2:3]
        return pts * np.array([self.gsd_x, self.gsd_y])

    def describe(self) -> dict:
        d = {"kind": self.kind, "source": self.source, "meaning": self.meaning, "note": self.note}
        if self.H is None:
            d.update(gsd_x_m=self.gsd_x, gsd_y_m=self.gsd_y)
        return d


def _num(v, name, lo=0.0, hi=1e6) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise ScaleError(f"{name} must be a number.") from None
    if not (math.isfinite(x) and lo < x < hi):
        raise ScaleError(f"{name} is out of range.")
    return x


def _pt(p, name) -> np.ndarray:
    try:
        a = np.array([float(p[0]), float(p[1])], np.float64)
    except (TypeError, ValueError, IndexError, KeyError):
        raise ScaleError(f"{name} must be [x, y] in image pixels.") from None
    if not np.isfinite(a).all():
        raise ScaleError(f"{name} must be finite.")
    return a


def resolve_scale(spec: dict | None, georef) -> Scale | None:
    """Return a Scale or None (= no defensible scale: real-world dimensions unavailable). Raises ScaleError for invalid input."""
    if not spec or spec.get("type") in (None, "none"):
        if georef is not None:
            return Scale("geo", "GeoTIFF tags", "Plan-view (horizontal projection) measurements; valid for near-nadir imagery", georef.gsd_x_m, georef.gsd_y_m, note=f"{georef.note}. Pixels are not exactly square on the ground: x {georef.gsd_x_m:.4f} m, y {georef.gsd_y_m:.4f} m.")
        return None
    t = spec["type"]
    if t == "geo":
        if georef is None:
            raise ScaleError("This image has no georeferencing metadata.")
        return resolve_scale(None, georef)
    if t == "gsd":
        g = _num(spec.get("gsd_m"), "Ground sample distance", 1e-4, 100)
        return Scale("gsd", "user", "Plan-view measurements using the ground sample distance you entered (not verified); valid for near-nadir imagery", g, g, note="User-supplied ground sample distance.")
    if t == "reference":
        a, b = _pt(spec.get("p1"), "p1"), _pt(spec.get("p2"), "p2")
        d = float(np.linalg.norm(a - b))
        if d < 4:
            raise ScaleError("The two reference points are too close together to define a scale.")
        g = _num(spec.get("length_m"), "Reference length", 1e-3, 1e5) / d
        return Scale("reference", "user", "Plan-view measurements from one reference length. Assumes the reference lies in the same plane as what you measure and the view is straight down", g, g, note=f"Reference {d:.1f} px = {float(spec['length_m']):g} m. One reference length cannot correct perspective.")
    if t == "plane_quad":
        q = spec.get("quad")
        if not isinstance(q, list) or len(q) != 4:
            raise ScaleError("plane_quad needs exactly four corner points (clockwise or counter-clockwise).")
        src = np.array([_pt(p, "corner") for p in q], np.float32)
        w, h = _num(spec.get("width_m"), "Width", 1e-3, 1e5), _num(spec.get("height_m"), "Height", 1e-3, 1e5)
        if cv2.contourArea(src) < 100 or not cv2.isContourConvex(src.reshape(-1, 1, 2)):
            raise ScaleError("The four corners must form a convex quadrilateral with a visible area, in order around the rectangle.")
        dst = np.array([[0, 0], [w, 0], [w, h], [0, h]], np.float32)
        H = cv2.getPerspectiveTransform(src, dst)
        return Scale("plane_quad", "user", "True lengths and areas inside the plane of the rectangle you marked, with perspective corrected. Valid only for points that lie in that plane", H=H.astype(np.float64), note=f"Rectangle {w:g} m × {h:g} m, corners in order top-left, top-right, bottom-right, bottom-left of the rectangle.")
    raise ScaleError(f"Unknown scale type {t!r}.")


def shoelace(p: np.ndarray) -> float:
    x, y = p[:, 0], p[:, 1]
    return float(abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2)


def pitch_from(spec: dict | None) -> dict | None:
    """Normalise a user-supplied pitch to degrees and rise-per-12. Returns None when none was supplied."""
    if not spec:
        return None
    try:
        if spec.get("rise_per_12") not in (None, ""):
            r = float(spec["rise_per_12"])
            deg = math.degrees(math.atan(r / 12))
        elif spec.get("degrees") not in (None, ""):
            deg = float(spec["degrees"])
            r = 12 * math.tan(math.radians(deg))
        else:
            return None
    except (TypeError, ValueError):
        raise ScaleError("Pitch must be a number.") from None
    if not (math.isfinite(deg) and 0 <= deg <= 80):
        raise ScaleError("Pitch must be between 0 and 80 degrees (0 to about 68 rise per 12).")
    return {"degrees": deg, "rise_per_12": r, "source": "user", "note": "User-supplied. Not measured from the image."}


def measure_polygon(poly_px, scale: Scale | None, pitch: dict | None = None) -> dict:
    """Measurements for one closed polygon (image pixels). Every real-world value states what it means; unavailable ones say why."""
    p = np.asarray(poly_px, np.float64).reshape(-1, 2)
    if len(p) < 3:
        raise ScaleError("A polygon needs at least three points.")
    edges_px = np.linalg.norm(np.roll(p, -1, 0) - p, axis=1)
    out: dict = {"pixels": {"area_px": shoelace(p), "perimeter_px": float(edges_px.sum()), "edge_lengths_px": [float(e) for e in edges_px]}}
    if scale is None:
        out["metric"] = {"available": False, "reason": "No scale: pixel measurements cannot be converted to metres. Provide a GeoTIFF, a ground sample distance, a known reference length, or a rectangle of known size on the roof plane."}
        out["surface"] = {"available": False, "reason": "Needs a scale and a pitch."}
        out["pitch"] = {"status": "supplied" if pitch else "not_measurable", **(pitch or {"reason": "Pitch cannot be measured from a single image without camera or height information."})}
        return out
    m = scale.to_metric(p)
    edges_m = np.linalg.norm(np.roll(m, -1, 0) - m, axis=1)
    rect = cv2.minAreaRect(m.astype(np.float32))
    length, width = max(rect[1]), min(rect[1])
    area = shoelace(m)
    out["metric"] = {"available": True, "area_m2": area, "perimeter_m": float(edges_m.sum()), "edge_lengths_m": [float(e) for e in edges_m],
                     "bounding_rectangle_m": {"length": float(length), "width": float(width)}, "meaning": scale.meaning, "scale_kind": scale.kind, "scale_source": scale.source}
    if scale.kind == "plane_quad":
        out["surface"] = {"available": True, "area_m2": area, "basis": "true area inside the calibrated plane (perspective corrected); no pitch assumption"}
        out["pitch"] = {"status": "supplied" if pitch else "not_measurable", **(pitch or {"reason": "The calibrated plane is metric, but its inclination relative to the horizontal is unknown without camera or gravity information."})}
    elif pitch:
        c = math.cos(math.radians(pitch["degrees"]))
        out["surface"] = {"available": True, "area_m2": area / c, "basis": f"plan-view area ÷ cos(slope), using the pitch you supplied ({pitch['rise_per_12']:.2f}:12 = {pitch['degrees']:.1f}°) and assuming one uniform slope", "assumption": "uniform user-supplied pitch"}
        out["pitch"] = {"status": "supplied", **pitch}
    else:
        out["surface"] = {"available": False, "reason": "Plan-view area is a horizontal projection. The sloped surface area needs the pitch, which an image alone cannot give; enter it if you know it."}
        out["pitch"] = {"status": "not_measurable", "reason": "Pitch cannot be measured from a single nadir image; enter it if you know it."}
    return out
