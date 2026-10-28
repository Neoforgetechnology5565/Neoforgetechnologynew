"""One image in -> real model run -> regions, outlines, candidate edges, measurements, annotated artifacts."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .geometry import UNAVAILABLE, interior_candidates, outline_edges, roof_regions
from .measure import Scale, measure_polygon, pitch_from, resolve_scale
from .media import Decoded
from .model import RoofSegmenter

MODEL_INFO = {
    "architecture": "U-Net, 3 down/up levels, 7.8 M parameters, sigmoid output (binary roof / not roof)",
    "input": "RGB image, any size; internally BGR 0-1; tiled above ~860 px",
    "base_weights": "dida roof task U-Net by Abhirup Ghosh (MIT), trained on 25 labelled 256×256 satellite images",
    "fine_tuned_on": "SpaceNet 2 Vegas and Paris building footprints (CC BY-SA 4.0): see docs/roof/MODEL_AND_LICENSES.md for the held-out evaluation",
}


@dataclass
class Params:
    threshold: float = 0.5
    min_area_px: int = 150
    model_scale: float = 1.0
    scale: dict | None = None
    pitch: dict | None = None
    view: str = "nadir"  # nadir | oblique | unknown (user statement; used only to decide whether plan-view measurement is meaningful)
    approx_roof_type: str | None = None


@dataclass
class ImageOutputs:
    result: dict = field(default_factory=dict)
    files: dict[str, Path] = field(default_factory=dict)


def draw_overlay(rgb: np.ndarray, regions: list[dict], mask: np.ndarray) -> np.ndarray:
    out = rgb.copy()
    tint = np.zeros_like(out); tint[...] = (255, 80, 40)
    m = mask > 0
    out[m] = (0.62 * out[m] + 0.38 * tint[m]).astype(np.uint8)
    scale = max(1.0, max(rgb.shape[:2]) / 700)
    for r in regions:
        pts = np.round(np.array(r["polygon"])).astype(np.int32)
        cv2.polylines(out, [pts], True, (255, 255, 0), max(1, int(round(1.6 * scale))), cv2.LINE_AA)
        x, y = int(pts[:, 0].mean()), int(pts[:, 1].mean())
        cv2.putText(out, str(r["id"]), (x - 4, y + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.55 * scale, (255, 255, 255), max(1, int(2 * scale)), cv2.LINE_AA)
    return out


def analyse_image(dec: Decoded, name: str, params: Params, model: RoofSegmenter, out_dir: Path, cancelled=lambda: False) -> ImageOutputs:
    rgb = dec.rgb
    h, w = rgb.shape[:2]
    warnings: list[str] = []
    t0 = time.perf_counter()
    scale: Scale | None = resolve_scale(params.scale, dec.georef)
    pitch = pitch_from(params.pitch)
    if scale is not None and scale.kind in ("geo", "gsd", "reference") and params.view == "oblique":
        warnings.append("You marked this image as oblique, but plan-view scale assumes a straight-down view. Plan-view metric values are not valid; use the plane (rectangle) calibration instead.")
        scale = None
    prob = model.predict(rgb, params.model_scale, cancelled)
    infer_s = time.perf_counter() - t0
    regions, mask = roof_regions(prob, params.threshold, params.min_area_px)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    total_area_px = 0.0
    for r in regions:
        poly = r["polygon"]
        r["measurements"] = measure_polygon(poly, scale, pitch)
        total_area_px += r["measurements"]["pixels"]["area_px"]
        comp = np.zeros((h, w), np.uint8)
        cv2.fillPoly(comp, [np.round(np.array(poly)).astype(np.int32)], 1)
        min_len = max(12.0, 0.2 * r["rectangle_fit"]["size_px"][1])
        r["features"] = {"outline_edges": outline_edges(poly), "interior_edge_candidates": interior_candidates(gray, comp, r["rectangle_fit"]["angle_deg"], min_len)}
        if scale is not None and r["measurements"]["metric"].get("available"):
            lo, hi = r["area_px_range_for_threshold_pm_0_1"]
            ratio = r["measurements"]["metric"]["area_m2"] / max(r["mask_area_px"], 1e-9)  # the range is a fraction of the mask area, applied to the polygon's area
            r["measurements"]["metric"]["area_m2_range_for_threshold_pm_0_1"] = [lo * ratio, hi * ratio]
    roof_frac = float((mask > 0).mean())
    if roof_frac > 0.45:
        warnings.append(f"{100 * roof_frac:.0f} % of the image was labelled roof. That is unusually high and usually means non-roof surfaces (roads, bare ground, paved areas) are included: treat the segmentation with suspicion.")
    tot = sum(r["mask_area_px"] for r in regions)
    if tot and sum(r["mask_area_px"] for r in regions if r["solidity"] < 0.8) / tot > 0.4:
        warnings.append("More than 40 % of the detected roof area is in regions with ragged, irregular outlines. That pattern usually means bare ground, vegetation or shadow is being mistaken for roof here (a rough heuristic, not a calibrated test): check the confidence map before trusting the areas.")
    if not regions:
        warnings.append("No roof region was found. The model is trained for top-down (aerial or satellite) views of buildings; it is not expected to work on ordinary ground-level photographs.")
    if len(regions) > 60:
        warnings.append("Very many separate regions were found; the output is probably fragmented. Raise the threshold or minimum area.")
    if dec.georef is None and (scale is None or scale.kind not in ("geo",)):
        pass
    if h < 128 or w < 128:
        warnings.append("The image is very small; results are unreliable.")
    if scale is None:
        warnings.append("No scale: dimensions are pixel measurements only. Real-world values are unavailable (see 'What is needed').")
    summary = {"regions": len(regions), "roof_fraction_of_image": round(roof_frac, 4), "total_area_px": total_area_px}
    if scale is not None:
        summ_area = sum(r["measurements"]["metric"]["area_m2"] for r in regions)
        summary["total_area_m2"] = summ_area
        summary["total_area_meaning"] = scale.meaning
        if pitch and scale.kind != "plane_quad":
            summary["total_surface_area_m2"] = sum(r["measurements"]["surface"]["area_m2"] for r in regions)
    result = {
        "image": {"name": name, "width": w, "height": h, "format": dec.fmt, "georeference": ({"gsd_x_m": dec.georef.gsd_x_m, "gsd_y_m": dec.georef.gsd_y_m, "crs": dec.georef.crs, "note": dec.georef.note} if dec.georef else None)},
        "model": {"name": model.model_name, **MODEL_INFO}, "params": {"threshold": params.threshold, "min_area_px": params.min_area_px, "model_scale": params.model_scale, "view": params.view, "approx_roof_type": params.approx_roof_type},
        "scale": scale.describe() if scale else {"kind": None, "meaning": "No scale"}, "pitch": ({"status": "supplied", **pitch} if pitch else {"status": "not_measurable", "reason": "Not measurable from one image; enter it if you know it."}),
        "regions": regions, "summary": summary, "features_status": {"model_detected": ["roof mask (per-pixel probability)"], "derived": ["outline polygon", "outline edges", "rectangle fit", "areas and lengths when a scale exists"],
                                                                      "inferred": ["interior edge candidates (unclassified)"], "unavailable": UNAVAILABLE},
        "needed_for_real_world_dimensions": ([] if scale is not None else ["A GeoTIFF with georeferencing, OR a ground sample distance (metres per pixel), OR one known length between two points on the roof, OR a rectangle of known size on the roof plane (for oblique photographs)."]),
        "warnings": warnings, "timing": {"model_seconds": round(infer_s, 3), "total_seconds": round(time.perf_counter() - t0, 3)},
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {"original": out_dir / "original.jpg", "overlay": out_dir / "overlay.png", "mask": out_dir / "mask.png", "probability": out_dir / "probability.png"}
    cv2.imwrite(str(files["original"]), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(str(files["overlay"]), cv2.cvtColor(draw_overlay(rgb, regions, mask), cv2.COLOR_RGB2BGR))
    cv2.imwrite(str(files["mask"]), (mask > 0).astype(np.uint8) * 255)
    cv2.imwrite(str(files["probability"]), (np.clip(prob, 0, 1) * 255).astype(np.uint8))
    return ImageOutputs(result, files)
