"""Inspection: anomaly map -> regions -> rules -> rendered images."""
from __future__ import annotations

import cv2
import numpy as np

from .patchcore import Backbone, Reference
from .rules import Rules, decide, severity

MAX_REGIONS = 25


def condition_checks(rgb: np.ndarray, ref: Reference) -> list[dict]:
    """Compare simple image conditions with the good images the reference was built from. Large differences make the score less trustworthy."""
    st = ref.meta.get("reference_stats") or {}
    out: list[dict] = []
    h, w = rgb.shape[:2]
    if st.get("aspect"):
        ratio = (w / h) / st["aspect"]
        if abs(np.log(ratio)) > 0.25:
            out.append({"level": "review", "code": "aspect", "text": f"The image proportions ({w / h:.2f}) differ from the reference images ({st['aspect']:.2f}); it may be cropped or a different part."})
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    if st.get("brightness"):
        b = float(g.mean())
        if abs(b - st["brightness"]) / max(st["brightness"], 1.0) > 0.4:
            out.append({"level": "review", "code": "brightness", "text": f"The image brightness ({b:.0f}) differs strongly from the reference images ({st['brightness']:.0f}); lighting changes can look like defects."})
    if st.get("sharpness"):
        s = float(cv2.Laplacian(cv2.resize(g, (512, int(512 * h / w))), cv2.CV_64F).var())
        if s < 0.3 * st["sharpness"]:
            out.append({"level": "review", "code": "sharpness", "text": "The image is much blurrier than the reference images; small defects may be missed."})
    return out


def regions_from_map(full: np.ndarray, tau: float, rules: Rules) -> list[dict]:
    h, w = full.shape
    thr = rules.review_band * tau
    mask = (full >= thr).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(mask, connectivity=8)
    regs = []
    for i in range(1, n):
        x, y, bw, bh, area = (int(v) for v in st[i])
        pct = 100.0 * area / (h * w)
        if pct < rules.min_region_area_pct:
            continue
        sel = lab == i
        vals = full[sel]
        peak = float(vals.max())
        ratio = peak / tau
        sub = (sel[y:y + bh, x:x + bw]).astype(np.uint8)
        cs, _ = cv2.findContours(sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        poly = []
        if cs:
            c = max(cs, key=cv2.contourArea)
            c = cv2.approxPolyDP(c, 0.01 * cv2.arcLength(c, True), True)
            poly = [[int(p[0][0]) + x, int(p[0][1]) + y] for p in c][:60]
        status = "flagged" if ratio >= rules.min_score_ratio else "borderline"
        regs.append({"bbox": [x, y, bw, bh], "centroid": [round(float(cen[i][0]), 1), round(float(cen[i][1]), 1)], "area_px": area, "area_pct": round(pct, 3), "peak_score": round(peak, 3), "score_ratio": round(ratio, 3),
                     "mean_score_ratio": round(float(vals.mean()) / tau, 3), "status": status, "severity": severity(pct, rules) if status == "flagged" else "n/a", "polygon": poly,
                     "category": "unusual region (unclassified)", "category_note": "This model detects where the part differs from good examples; it does not name defect types."})
    regs.sort(key=lambda r: -r["score_ratio"])
    regs = regs[:MAX_REGIONS]
    for k, r in enumerate(regs, 1):
        r["id"] = k
    return regs


def render_heat(full: np.ndarray, tau: float) -> np.ndarray:
    """RGBA image: transparent below 0.6 x threshold, blue -> yellow -> red up to 1.6 x threshold."""
    r = np.clip((full / tau - 0.6) / 1.0, 0, 1)
    u8 = (r * 255).astype(np.uint8)
    col = cv2.applyColorMap(u8, cv2.COLORMAP_TURBO)
    a = (np.clip(r * 1.6, 0, 1) * 200).astype(np.uint8)
    a[r <= 0.02] = 0
    return np.dstack([col[..., 2], col[..., 1], col[..., 0], a])


def render_annotated(rgb: np.ndarray, heat_rgba: np.ndarray, regions: list[dict], show_heat: bool = True) -> np.ndarray:
    out = rgb.copy()
    if show_heat:
        a = heat_rgba[..., 3:4].astype(np.float32) / 255.0 * 0.65
        out = (out * (1 - a) + heat_rgba[..., :3] * a).astype(np.uint8)
    th = max(2, int(round(max(out.shape[:2]) / 400)))
    for r in regions:
        x, y, w, h = r["bbox"]
        col = (239, 68, 68) if r["status"] == "flagged" else (245, 158, 11)
        cv2.rectangle(out, (x, y), (x + w, y + h), col, th)
        txt = f"#{r['id']} {r['score_ratio']:.2f}x"
        fs = max(0.5, max(out.shape[:2]) / 1600)
        (tw, tht), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, fs, 1)
        ty = max(tht + 4, y)
        cv2.rectangle(out, (x, ty - tht - 4), (x + tw + 6, ty + 2), col, -1)
        cv2.putText(out, txt, (x + 3, ty - 2), cv2.FONT_HERSHEY_SIMPLEX, fs, (255, 255, 255), 1, cv2.LINE_AA)
    return out


def evaluate(full: np.ndarray, tau: float, rules: Rules, ref_info: dict, checks: list[dict], score: float | None = None) -> tuple[dict, dict]:
    """Regions and the recommendation from an anomaly map at image size. Used at inspection time and again when the rules are changed."""
    h, w = full.shape
    score = float(full.max()) if score is None else float(score)  # the model's own image score; a re-evaluation passes the stored one
    ratio = score / tau
    regions = regions_from_map(full, tau, rules)
    dec = decide(regions, ratio, rules, ref_info, checks)
    mo = {"anomaly_score": round(score, 3), "reference_threshold": round(tau, 3), "score_ratio": round(ratio, 3),
          "score_meaning": "L2 distance in feature space to the nearest good-part patch (largest over the image). Not a probability. score_ratio 1.0 = the threshold estimated from good parts for this reference.",
          "regions": regions, "image": {"width": w, "height": h}, "condition_checks": checks}
    rec = {"decision": dec["recommendation"], "reasons": dec["reasons"], "rule_trace": dec["trace"], "rules": rules.to_json(), "disclaimer": "Automated recommendation from the configured rules; not certified quality assurance."}
    return mo, rec


def inspect(rgb: np.ndarray, ref: Reference, bb: Backbone, rules: Rules, ref_info: dict) -> tuple[dict, np.ndarray, np.ndarray]:
    """Returns (result dict, heat RGBA at image size, anomaly map at model resolution)."""
    h, w = rgb.shape[:2]
    m, score = ref.score(bb, rgb)
    full = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)
    mo, rec = evaluate(full, ref.tau, rules, ref_info, condition_checks(rgb, ref), score)
    return {"model_output": mo, "recommendation": rec}, render_heat(full, ref.tau), m
