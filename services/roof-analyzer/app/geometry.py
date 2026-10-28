"""Mask -> roof regions -> outline polygons and candidate interior edges.

Every output carries its provenance so the interface can distinguish what a model predicted (the mask), what is derived from it by
deterministic geometry (polygon outline, rectangle fit) and what is only inferred from image evidence (candidate interior edges).
"""
from __future__ import annotations

import math

import cv2
import numpy as np

UNAVAILABLE = {
    "ridge": "Needs 3D information or a trained line classifier. Interior edges are listed as unclassified candidates.",
    "hip": "Same as ridge.",
    "valley": "Same as ridge.",
    "eave": "A nadir image cannot tell eaves from rakes. Outline edges are listed without that classification.",
    "rake": "Same as eave.",
    "facet": "Splitting a roof into planes needs height or slope information that one image does not contain.",
}


def roof_regions(prob: np.ndarray, thr: float, min_area_px: int, simplify: float = 0.012) -> tuple[list[dict], np.ndarray]:
    """Connected roof regions from the probability map. Returns (regions, labelled mask)."""
    h, w = prob.shape
    mask = (prob > thr).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    lo, hi = (prob > max(0.05, thr - 0.1)), (prob > min(0.95, thr + 0.1))
    regions = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area_px:
            continue
        x, y, bw, bh = (int(stats[i, k]) for k in (cv2.CC_STAT_LEFT, cv2.CC_STAT_TOP, cv2.CC_STAT_WIDTH, cv2.CC_STAT_HEIGHT))
        comp = (labels[y:y + bh, x:x + bw] == i).astype(np.uint8)
        cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        if not cnts:
            continue
        c = max(cnts, key=cv2.contourArea)
        eps = simplify * cv2.arcLength(c, True)
        poly = cv2.approxPolyDP(c, eps, True).reshape(-1, 2).astype(np.float64) + [x, y]
        if len(poly) < 3:
            continue
        pm = prob[y:y + bh, x:x + bw][comp > 0]
        pad = 5  # the threshold-sensitivity window extends a little beyond the region's bounding box
        y0, y1, x0, x1 = max(0, y - pad), min(h, y + bh + pad), max(0, x - pad), min(w, x + bw + pad)
        full = (labels[y0:y1, x0:x1] == i).astype(np.uint8)
        near = cv2.dilate(full, np.ones((9, 9), np.uint8)) > 0  # how much the area moves when the threshold moves by ±0.1
        a_lo = int((lo[y0:y1, x0:x1] & near).sum()); a_hi = int((hi[y0:y1, x0:x1] & near).sum())
        rect = cv2.minAreaRect(poly.astype(np.float32))
        hull = cv2.convexHull(poly.astype(np.float32))
        pa = max(cv2.contourArea(poly.astype(np.float32)), 1.0)
        regions.append({
            "id": len(regions) + 1, "bbox": [x, y, x + bw, y + bh], "mask_area_px": area, "polygon": [[round(float(a), 2), round(float(b), 2)] for a, b in poly],
            "confidence": {"mean_probability": round(float(pm.mean()), 4), "p10_probability": round(float(np.percentile(pm, 10)), 4), "meaning": "Mean model output inside the region. A network score, not a calibrated probability of being a roof."},
            "area_px_range_for_threshold_pm_0_1": [min(a_hi, area), max(a_lo, area)],
            "rectangle_fit": {"center": [round(rect[0][0], 1), round(rect[0][1], 1)], "size_px": [round(max(rect[1]), 1), round(min(rect[1]), 1)], "angle_deg": round(rect[2], 1), "provenance": "derived"},
            "solidity": round(float(pa / max(cv2.contourArea(hull), 1.0)), 3),
            "touches_image_border": bool(x == 0 or y == 0 or x + bw >= w or y + bh >= h),
            "provenance": {"mask": "model", "outline_polygon": "derived (contour simplified from the mask)"},
        })
    return regions, mask


def outline_edges(poly: list[list[float]]) -> list[dict]:
    p = np.asarray(poly, np.float64)
    out = []
    for i in range(len(p)):
        a, b = p[i], p[(i + 1) % len(p)]
        d = b - a
        out.append({"p1": [round(float(a[0]), 1), round(float(a[1]), 1)], "p2": [round(float(b[0]), 1), round(float(b[1]), 1)], "length_px": round(float(np.hypot(*d)), 2), "angle_deg": round(math.degrees(math.atan2(d[1], d[0])) % 180, 1),
                    "kind": "outline_edge", "provenance": "derived", "classification": "not determined (eave or rake cannot be told apart in a nadir image)"})
    return out


def interior_candidates(gray: np.ndarray, region_mask: np.ndarray, rect_angle: float, min_len: float, limit: int = 40) -> list[dict]:
    """Straight edges inside a roof region (LSD). They are candidates for ridge/hip/valley lines but are NOT classified: shading, tiles, chimneys and shadows also create edges."""
    inner = cv2.erode(region_mask, np.ones((7, 7), np.uint8))
    if inner.sum() < 100:
        return []
    try:
        lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
        lines = lsd.detect(gray)[0]
    except (cv2.error, AttributeError):
        lines = None
    segs: list[tuple[float, float, float, float]] = []
    if lines is not None:
        segs = [tuple(map(float, l)) for l in np.asarray(lines).reshape(-1, 4)]
    else:  # OpenCV build without LSD
        edges = cv2.Canny(gray, 60, 150)
        hl = cv2.HoughLinesP(edges, 1, np.pi / 180, 30, minLineLength=int(min_len), maxLineGap=4)
        segs = [tuple(map(float, l)) for l in np.asarray(hl).reshape(-1, 4)] if hl is not None else []
    out = []
    for x1, y1, x2, y2 in segs:
        L = math.hypot(x2 - x1, y2 - y1)
        if L < min_len:
            continue
        # keep segments that lie (at least 90 % of their length) inside the eroded roof region
        n = max(3, int(L // 3)); xs = np.linspace(x1, x2, n).round().astype(int); ys = np.linspace(y1, y2, n).round().astype(int)
        ok = (xs >= 0) & (xs < inner.shape[1]) & (ys >= 0) & (ys < inner.shape[0])
        if ok.mean() < 1 or inner[ys[ok], xs[ok]].mean() < 0.9:
            continue
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180
        rel = abs(((ang - rect_angle) + 90) % 180 - 90)
        out.append({"p1": [round(x1, 1), round(y1, 1)], "p2": [round(x2, 1), round(y2, 1)], "length_px": round(L, 1), "angle_deg": round(ang, 1),
                    "relation_to_outline": "parallel" if rel < 12 else "perpendicular" if abs(rel - 90) < 12 else "oblique",
                    "kind": "interior_edge_candidate", "provenance": "inferred (line-segment detector on image intensity; not classified as ridge, hip or valley)"})
    out.sort(key=lambda s: -s["length_px"])
    return out[:limit]
