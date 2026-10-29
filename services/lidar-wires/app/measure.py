"""Geometric measurements on real 3D coordinates (float64, the file's coordinate system).

Every result states its TYPE precisely, because different distances answer different questions:
  point_point            straight-line 3D distance between two picked points (plus horizontal and vertical components)
  point_wire             shortest distance from a point to the FITTED wire curve (perpendicular to the curve, not to a point sample)
  wire_wire              shortest distance between two fitted curves (nearest approach), with the vertical separation at that location
  wire_ground            vertical clearance of a wire above the ground model (minimum along the span); NOT a 3D distance
  wire_object            shortest distance from a wire curve to the selected object points; also the nearest SUPPORT-point distance, which is a different, data-bound number
  point_object           shortest distance from a point to the selected object points (nearest-point distance)
  point_ground           height of a point above the ground model
A value is in the cloud's coordinate units. When the units are not known it is NOT converted to metres and the result says so; a threshold
comparison is made only when the caller supplies a threshold, and it is labelled as the caller's criterion (never a regulatory determination).
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize
from scipy.spatial import cKDTree

from .classify import GroundModel
from .cloud import Units
from .wires import Wire


class MeasureError(ValueError):
    pass


def _xyz(v) -> np.ndarray:
    try:
        a = np.asarray(v, np.float64)
    except (TypeError, ValueError):
        raise MeasureError("A point must be three numbers [x, y, z].") from None
    if a.shape != (3,) or not np.isfinite(a).all():
        raise MeasureError("A point must be three finite numbers [x, y, z].")
    return a


def _curve_samples(w: Wire, n: int = 4000) -> tuple[np.ndarray, np.ndarray]:
    s = np.linspace(w.s0, w.s1, n)
    return s, w.point(s)


def closest_on_wire(w: Wire, p: np.ndarray) -> tuple[float, np.ndarray, float]:
    """Nearest point on the fitted curve to p: dense sampling then a local 1-D refinement. Returns (s, point, distance)."""
    s, pts = _curve_samples(w)
    d = np.linalg.norm(pts - p, axis=1)
    i = int(d.argmin())
    lo, hi = s[max(i - 1, 0)], s[min(i + 1, len(s) - 1)]
    r = minimize(lambda t: float(np.linalg.norm(w.point(t[0]) - p)), [s[i]], bounds=[(lo, hi)], method="L-BFGS-B")
    si = float(r.x[0])
    q = w.point(si)
    return si, q, float(np.linalg.norm(q - p))


def wires_nearest(a: Wire, b: Wire) -> tuple[float, np.ndarray, np.ndarray, float, float]:
    sa, pa = _curve_samples(a, 3000)
    sb, pb = _curve_samples(b, 3000)
    d, j = cKDTree(pb).query(pa)
    i = int(d.argmin())
    x0 = [sa[i], sb[j[i]]]
    f = lambda t: float(np.linalg.norm(a.point(t[0]) - b.point(t[1])))  # noqa: E731
    r = minimize(f, x0, bounds=[(a.s0, a.s1), (b.s0, b.s1)], method="L-BFGS-B")
    if r.fun > d[i]:
        r.x, r.fun = np.array(x0), d[i]
    return float(r.fun), a.point(r.x[0]), b.point(r.x[1]), float(r.x[0]), float(r.x[1])


def _result(kind: str, value: float, units: Units, **kw) -> dict:
    out = {"type": kind, "value": float(value), "unit": units.label(), "units_known": units.known}
    if units.known:
        out["value_m"] = float(value) * (1.0 / units.per_metre())
    else:
        out["status"] = "units_unknown"
        out["notes"] = ["The coordinate units are not stated in the file, so this value is in coordinate units and has not been converted to metres. Set the units to get metres."]
    out.update(kw)
    out.setdefault("status", "ok")
    out.setdefault("notes", [])
    return out


def measure(kind: str, a: dict, b: dict | None, units: Units, wires: dict[str, Wire], xyz: np.ndarray, labels: np.ndarray | None, ground: GroundModel | None, ground_source: str | None, threshold: dict | None = None) -> dict:
    """Dispatch by the selector kinds of a and b. Selectors: {"kind":"point","xyz":[..]}, {"kind":"wire","id":"W1"}, {"kind":"ground"}, {"kind":"object","label":int,"near":[..],"radius":r | "box":[min,max]}."""
    ka, kb = a.get("kind"), (b or {}).get("kind")

    def wire(sel):
        w = wires.get(str(sel.get("id")))
        if w is None:
            raise MeasureError(f"Unknown wire '{str(sel.get('id'))[:20]}'. Run wire detection first.")
        return w

    def obj_idx(sel) -> np.ndarray:
        mask = np.ones(len(xyz), bool)
        if "label" in sel:
            if labels is None:
                raise MeasureError("Classify the cloud first to select an object by class.")
            mask &= labels == int(sel["label"])
        if "box" in sel:
            lo, hi = _xyz(sel["box"][0]), _xyz(sel["box"][1])
            mask &= ((xyz >= lo) & (xyz <= hi)).all(1)
        if "near" in sel:
            c = _xyz(sel["near"])
            r = float(sel.get("radius", 5.0))
            if not r > 0:
                raise MeasureError("The selection radius must be positive.")
            mask &= np.linalg.norm(xyz - c, axis=1) <= r
        idx = np.nonzero(mask)[0]
        if len(idx) == 0:
            raise MeasureError("The object selection contains no points.")
        return idx

    pair = {ka, kb}
    notes: list[str] = []
    if ka == "point" and kb == "point":
        p, q = _xyz(a["xyz"]), _xyz(b["xyz"])
        d = q - p
        res = _result("point_point", np.linalg.norm(d), units, geometry=["point A", "point B"], components={"horizontal": float(np.hypot(d[0], d[1])), "vertical": float(abs(d[2]))}, closest_points=[p.tolist(), q.tolist()],
                      method="Euclidean distance between the two picked points")
    elif pair == {"point", "wire"}:
        p = _xyz((a if ka == "point" else b)["xyz"])
        w = wire(a if ka == "wire" else b)
        s, q, d = closest_on_wire(w, p)
        sup = xyz[w.support]
        ns = float(np.linalg.norm(sup - p, axis=1).min())
        res = _result("point_wire", d, units, geometry=["point", w.id], components={"horizontal": float(np.hypot(*(q - p)[:2])), "vertical": float(abs((q - p)[2])), "nearest_support_point_distance": ns}, closest_points=[p.tolist(), q.tolist()],
                      method="shortest distance from the point to the fitted wire curve (perpendicular to the curve); nearest_support_point_distance is the distance to the closest measured wire point and is a different quantity")
        if not (w.s0 < s < w.s1):
            notes.append("The closest point is at the end of the fitted span: the perpendicular foot would lie beyond the detected wire.")
    elif ka == "wire" and kb == "wire":
        w1, w2 = wire(a), wire(b)
        if w1.id == w2.id:
            raise MeasureError("Choose two different wires.")
        d, p1, p2, _, _ = wires_nearest(w1, w2)
        res = _result("wire_wire", d, units, geometry=[w1.id, w2.id], components={"horizontal": float(np.hypot(*(p2 - p1)[:2])), "vertical": float(abs((p2 - p1)[2]))}, closest_points=[p1.tolist(), p2.tolist()],
                      method="minimum distance between the two fitted curves (nearest approach, numerically refined)")
    elif pair == {"wire", "ground"}:
        w = wire(a if ka == "wire" else b)
        if ground is None:
            raise MeasureError("No ground model: classify the cloud first (ground comes from the provided or heuristic classification).")
        s, pts = _curve_samples(w, 3000)
        gz = ground.height_at(pts[:, 0], pts[:, 1])
        h = pts[:, 2] - gz
        i = int(h.argmin())
        res = _result("wire_ground", h[i], units, geometry=[w.id, "ground"], components={"mean_clearance": float(h.mean()), "maximum_clearance": float(h.max())}, closest_points=[pts[i].tolist(), [float(pts[i, 0]), float(pts[i, 1]), float(gz[i])]],
                      method=f"minimum vertical distance between the fitted wire and the ground model ({ground_source or 'unknown source'}) along the span; vertical clearance, not a 3D distance")
        notes.append("The ground model is interpolated; under dense vegetation or buildings it may be inaccurate.")
    elif pair == {"wire", "object"}:
        w = wire(a if ka == "wire" else b)
        idx = obj_idx(a if ka == "object" else b)
        P = xyz[idx]
        s, cs = _curve_samples(w, 4000)
        d, j = cKDTree(cs).query(P)
        i = int(d.argmin())
        si, q, dd = closest_on_wire(w, P[i])
        ns = float(cKDTree(P).query(xyz[w.support])[0].min())
        res = _result("wire_object", dd, units, geometry=[w.id, f"object ({len(idx)} points)"], components={"horizontal": float(np.hypot(*(q - P[i])[:2])), "vertical_wire_minus_object": float(q[2] - P[i][2]), "nearest_support_point_distance": ns},
                      closest_points=[q.tolist(), P[i].tolist()], method="shortest distance from the fitted wire curve to any selected object point; nearest_support_point_distance is measured between raw wire points and object points")
        notes.append("Object points are sampled by the scanner: the true surface may be closer than the nearest measured point.")
    elif pair == {"point", "object"}:
        p = _xyz((a if ka == "point" else b)["xyz"])
        idx = obj_idx(a if ka == "object" else b)
        P = xyz[idx]
        d, i = cKDTree(P).query(p)
        res = _result("point_object", d, units, geometry=["point", f"object ({len(idx)} points)"], components={"horizontal": float(np.hypot(*(P[i] - p)[:2])), "vertical": float(abs(P[i][2] - p[2]))}, closest_points=[p.tolist(), P[i].tolist()],
                      method="nearest-point distance from the point to the selected object points")
    elif pair == {"point", "ground"}:
        p = _xyz((a if ka == "point" else b)["xyz"])
        if ground is None:
            raise MeasureError("No ground model: classify the cloud first.")
        gz = float(ground.height_at(np.array([p[0]]), np.array([p[1]]))[0])
        res = _result("point_ground", p[2] - gz, units, geometry=["point", "ground"], components={}, closest_points=[p.tolist(), [float(p[0]), float(p[1]), gz]], method=f"height above the ground model ({ground_source or 'unknown source'})")
    else:
        raise MeasureError("Unsupported combination. Choose two of: point, wire, ground, object (for example point + point, wire + wire, wire + ground, wire + object).")
    res["notes"] = list(res.get("notes", [])) + notes
    if threshold:
        try:
            tv, tu = float(threshold["value"]), str(threshold.get("unit", "coordinate"))
        except (KeyError, TypeError, ValueError):
            raise MeasureError("threshold needs a numeric value and a unit (m, ft or coordinate).") from None
        if tu in ("m", "metre", "ft", "foot") and not units.known:
            res["threshold_check"] = {"status": "not_evaluated", "note": "The threshold is in physical units but the cloud's units are unknown. Set the units, or give the threshold in coordinate units."}
        else:
            val = res["value"]
            if tu in ("m", "metre"):
                val = res["value_m"]
            elif tu in ("ft", "foot"):
                val = res["value_m"] / 0.3048
            res["threshold_check"] = {"status": "meets" if val >= tv else "below", "threshold": tv, "unit": tu, "compared_value": val,
                                      "note": "Compared with the threshold you supplied (a minimum). This is not a regulatory or safety determination: clearance rules depend on voltage, conditions and jurisdiction."}
    return res
