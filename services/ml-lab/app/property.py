"""PropertyVision AI (demo 25): property type, visible condition indicators and an explainable 0-100 condition score for one photograph.

What is real here, and what is not (this text is also shown in the interface):
* Real: a pretrained MobileNetV2 (ImageNet-1000) produces the class evidence from the image; every indicator below is computed from the pixels of
  the uploaded image with OpenCV; the heat-map overlay shows exactly the pixels that produced each indicator.
* Experimental, NOT trained on property data: nobody has published weights or an accessible dataset for the three reference projects that
  could run here (PropertyClassification uses private assessor imagery and ships no weights; the earthquake-damage repository ships architecture
  code only and its dataset is on Mendeley Data; the anomaly project ships weights trained on the industrial MVTec AD set). So the five property
  types come from a documented, hand-weighted rule set over ImageNet evidence and image statistics, the condition indicators are classical image
  analysis, and the score is a transparent weighted sum. None of it is a validated valuation, inspection or distress model.

The algorithm is mirrored in TypeScript (src/lib/ml/browser/property.ts) so the demo also runs without this service; both read the same constants.
"""
from __future__ import annotations

import math
import time

import cv2
import numpy as np

WORK = 512  # long side of the working image
CLASSES = ["residential_house", "commercial_building", "vacant_land", "mobile_home", "self_storage"]
CLASS_LABEL = {"residential_house": "Residential house", "commercial_building": "Commercial building", "vacant_land": "Vacant land", "mobile_home": "Mobile home", "self_storage": "Self-storage facility"}
# ImageNet-1000 class indices whose probability counts as evidence for a property type (documented in docs/property-vision/METHODS.md)
GROUPS = {
    "residential_house": [716, 637, 706, 858, 853, 449, 698],
    "commercial_building": [415, 424, 454, 467, 509, 582, 762, 788, 860, 865, 790, 791, 498, 624, 727],
    "vacant_land": [979, 970, 975, 978, 977, 972, 976, 980, 912],
    "mobile_home": [660],
    "self_storage": [695, 507, 771, 565],
}
# (key, label, what it looks for, weight in the score (max points removed))
INDICATORS = [
    ("cracks", "Crack-like lines", "Thin, dark, elongated lines that can indicate cracking in walls, paving or roofing.", 30),
    ("stains", "Dark stains or discolouration", "Large dark patches against their surroundings: possible moisture, mould, soot or roof discolouration.", 22),
    ("rust", "Rust-coloured surfaces", "Saturated orange-brown areas: possible corrosion or weathering.", 14),
    ("atypical", "Atypical regions", "Areas that look unlike the rest of this photograph (texture, colour); possible damage, debris or repairs.", 20),
    ("vegetation", "Heavy vegetation cover", "Green vegetation covering a large part of a property photograph: possible overgrowth.", 14),
]
BANDS = [(80, "Good visible condition"), (60, "Fair: some visible concerns"), (40, "Poor: several visible concerns"), (0, "Distressed: many visible concerns")]


def prepare(bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    s = WORK / max(h, w)
    return cv2.resize(bgr, (max(16, round(w * s)), max(16, round(h * s))), interpolation=cv2.INTER_AREA) if s < 1 else bgr.copy()


def _ex_g(rgb: np.ndarray) -> np.ndarray:
    t = rgb.sum(2) + 1e-6
    r, g, b = rgb[..., 0] / t, rgb[..., 1] / t, rgb[..., 2] / t
    return 2 * g - r - b


def features(bgr: np.ndarray) -> dict:
    """Image statistics shared by classification and the indicators (all 0..1 fractions unless noted)."""
    rgb = bgr[..., ::-1].astype(np.float32)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx, gy = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.sqrt(gx * gx + gy * gy)
    strong = mag > 80
    edge = float(strong.mean())
    # how much of the strong-edge energy lies along two perpendicular directions (straight, man-made structure)
    ang = (np.degrees(np.arctan2(gy, gx)) % 90.0)[strong]
    wgt = mag[strong]
    if ang.size > 50:
        hist, _ = np.histogram(ang, bins=18, range=(0, 90), weights=wgt)
        hist = hist / (hist.sum() + 1e-9)
        k = int(hist.argmax()); near = hist[k] + hist[(k - 1) % 18] + hist[(k + 1) % 18]
        orth = float(max(0.0, (near - 3 / 18) / (1 - 3 / 18)))
    else:
        orth = 0.0
    exg = _ex_g(rgb)
    veg = float((exg > 0.05).mean())
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / (mx + 1e-6)
    bare = float(((sat < 0.35) & (mx > 90) & (mx < 235) & (mag < 40) & (exg <= 0.05)).mean())
    # repeated structure: strong periodicity of the column-wise edge profile (rows of similar doors, bays or units)
    prof = (mag * strong).sum(0); prof = prof - prof.mean()
    ac = np.correlate(prof, prof, "full")[len(prof) - 1:]
    period = 0.0
    if ac[0] > 1e-6 and len(ac) > 40:
        a = ac[8:len(ac) // 2] / ac[0]; period = float(max(0.0, a.max()))
    return {"edge": edge, "orth": orth, "orth_edge": min(1.0, edge * 6) * orth, "veg": veg, "bare": bare, "period": period, "mag": mag, "gray": gray, "rgb": rgb, "exg": exg, "sat": sat}


def classify_from(f: dict, imagenet: np.ndarray | None) -> dict:
    ev = {c: float(sum(imagenet[i] for i in GROUPS[c])) if imagenet is not None else 0.0 for c in CLASSES}
    cover = min(1.0, f["veg"] + f["bare"])
    logit = {
        "residential_house": 0.6 + 4.0 * ev["residential_house"] + 1.2 * f["orth_edge"] + 0.8 * min(f["veg"], 0.5) - 0.8 * f["period"],
        "commercial_building": 0.3 + 4.0 * ev["commercial_building"] + 1.6 * f["orth_edge"] - 0.8 * f["veg"],
        "vacant_land": -0.2 + 4.0 * ev["vacant_land"] + 2.4 * cover - 3.0 * f["orth_edge"] - 2.0 * f["edge"],
        "mobile_home": -0.6 + 6.0 * ev["mobile_home"] + 0.4 * f["orth_edge"],
        "self_storage": -0.9 + 4.0 * ev["self_storage"] + 1.8 * f["period"] * f["orth"],
    }
    z = np.array([logit[c] for c in CLASSES]); p = np.exp(z - z.max()); p /= p.sum()
    scores = {c: float(p[i]) for i, c in enumerate(CLASSES)}
    evidence = []
    for c in CLASSES:
        if ev[c] > 0.02: evidence.append(f"ImageNet model: {ev[c] * 100:.0f}% of its probability falls on classes linked to {CLASS_LABEL[c].lower()}")
    evidence += [f"Vegetation covers {f['veg'] * 100:.0f}% and bare ground {f['bare'] * 100:.0f}% of the image",
                 f"Straight, perpendicular edge structure (man-made look): {f['orth_edge'] * 100:.0f}/100",
                 f"Repeating unit pattern: {f['period'] * 100:.0f}/100"]
    best = max(scores, key=scores.get)
    return {"label": best, "label_text": CLASS_LABEL[best], "scores": [{"key": c, "label": CLASS_LABEL[c], "score": scores[c]} for c in sorted(CLASSES, key=lambda c: -scores[c])], "evidence": evidence}


def _box(a: np.ndarray, k: int) -> np.ndarray:
    return cv2.blur(a, (k, k), borderType=cv2.BORDER_REFLECT)


def indicators(f: dict, shape: tuple[int, int]) -> dict:
    gray, rgb, mag = f["gray"], f["rgb"], f["mag"]
    h, w = shape
    masks: dict[str, np.ndarray] = {}
    # 1 cracks: thin dark structures = black-hat minus blobs
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, k)
    thin = bh > 28
    blobs = cv2.morphologyEx(thin.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (4, 4))) > 0
    crack = thin & ~blobs
    n, lab, stats, _ = cv2.connectedComponentsWithStats(crack.astype(np.uint8), connectivity=8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        x, y, bw, bh_, a = stats[i]
        if max(bw, bh_) >= 14 and a <= 0.55 * bw * bh_ + 25: keep[i] = True  # elongated, not a filled blob
    crack = keep[lab]
    masks["cracks"] = crack
    cracks_v = float(crack.mean())
    # 2 stains: much darker than the local surroundings, over a large smooth area
    local = _box(gray, 61)
    dark = (gray < local - 38) & (mag < 60)
    dark = cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))) > 0
    masks["stains"] = dark
    stains_v = float(dark.mean())
    # 3 rust: saturated orange-brown
    hsv = cv2.cvtColor(np.clip(rgb[..., ::-1], 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
    hh, ss, vv = hsv[..., 0].astype(np.float32), hsv[..., 1].astype(np.float32) / 255, hsv[..., 2].astype(np.float32) / 255
    rust = (hh >= 5) & (hh <= 18) & (ss > 0.5) & (vv > 0.25) & (vv < 0.75)
    rust = cv2.morphologyEx(rust.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))) > 0
    masks["rust"] = rust
    rust_v = float(rust.mean())
    # 4 atypical regions: 16 px patches whose colour/texture are far from this image's own median (robust z-score)
    P = 16
    ph, pw = h // P, w // P
    if ph >= 2 and pw >= 2:
        g = gray[:ph * P, :pw * P].reshape(ph, P, pw, P)
        feat = [rgb[:ph * P, :pw * P, c].reshape(ph, P, pw, P).mean((1, 3)) for c in range(3)] + [g.std((1, 3)), mag[:ph * P, :pw * P].reshape(ph, P, pw, P).mean((1, 3))]
        z = np.zeros((ph, pw), np.float32)
        for a in feat:
            med = np.median(a); mad = np.median(np.abs(a - med)) * 1.4826 + 1e-3 * (1 + abs(med))
            z = np.maximum(z, np.abs(a - med) / mad)
        grid = np.zeros((h, w), np.float32)
        grid[:ph * P, :pw * P] = cv2.resize(z, (pw * P, ph * P), interpolation=cv2.INTER_NEAREST)
        atyp = grid > 4.0
        top = float(np.percentile(z, 95))
    else:
        grid = np.zeros((h, w), np.float32); atyp = grid > 1; top = 0.0
    masks["atypical"] = atyp
    atyp_v = float(atyp.mean())
    veg_v = f["veg"]
    values = {"cracks": cracks_v, "stains": stains_v, "rust": rust_v, "atypical": atyp_v, "vegetation": veg_v}
    # severity 0..1 per indicator (scale constants chosen so a typical clean photograph scores near 0 and obvious defects reach 1)
    scale = {"cracks": 0.035, "stains": 0.12, "rust": 0.10, "atypical": 0.30, "vegetation": 0.60}
    floor = {"cracks": 0.002, "stains": 0.01, "rust": 0.004, "atypical": 0.04, "vegetation": 0.30}
    sev = {k: float(np.clip((values[k] - floor[k]) / (scale[k] - floor[k]), 0, 1)) for k in values}
    return {"values": values, "severity": sev, "masks": masks, "patch_z95": top}


COLORS_BGR = {"cracks": (0, 0, 255), "stains": (255, 0, 160), "rust": (0, 140, 255), "atypical": (0, 215, 255), "vegetation": (60, 200, 60)}


def overlay(bgr: np.ndarray, masks: dict[str, np.ndarray], show: set[str]) -> np.ndarray:
    out = bgr.copy().astype(np.float32)
    for k in ("vegetation", "atypical", "stains", "rust", "cracks"):
        if k not in show or k not in masks: continue
        m = masks[k]
        if k == "cracks": m = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        c = np.array(COLORS_BGR[k], np.float32)
        out[m] = out[m] * 0.4 + c * 0.6
    return out.clip(0, 255).astype(np.uint8)


def score_from(ind: dict, cls_label: str) -> dict:
    contrib, total = [], 0.0
    for key, label, desc, weight in INDICATORS:
        sev = ind["severity"][key]
        if key == "vegetation" and cls_label == "vacant_land": sev = 0.0  # vegetation is normal on land
        pts = round(weight * sev, 1); total += pts
        contrib.append({"key": key, "label": label, "value": ind["values"][key], "severity": sev, "points_removed": pts, "max_points": weight, "description": desc})
    value = int(round(max(0.0, min(100.0, 100 - total))))
    band = next(t for lo, t in BANDS if value >= lo)
    notes = [f"{c['label']}: removes {c['points_removed']:.0f} of up to {c['max_points']} points" for c in sorted(contrib, key=lambda c: -c["points_removed"]) if c["points_removed"] >= 0.5]
    if not notes: notes = ["No visible indicator crossed its threshold."]
    return {"value": value, "band": band, "contributions": contrib, "explanation": notes}


def analyze(bgr: np.ndarray, classifier=None, show: set[str] | None = None) -> dict:
    t0 = time.time()
    work = prepare(bgr)
    f = features(work)
    probs = None
    if classifier is not None:
        probs = classifier.s.run(None, {classifier.inp: classifier.prep(work)})[0][0]
    top5 = [] if probs is None else [{"label": classifier.names[i], "probability": float(probs[i])} for i in probs.argsort()[::-1][:5]]
    cls = classify_from(f, probs)
    ind = indicators(f, work.shape[:2])
    sc = score_from(ind, cls["label"])
    shown = show if show is not None else {"cracks", "stains", "rust", "atypical"}
    ov = overlay(work, ind["masks"], shown)
    ok, jpg = cv2.imencode(".jpg", ov, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return {
        "width": int(bgr.shape[1]), "height": int(bgr.shape[0]), "work_width": int(work.shape[1]), "work_height": int(work.shape[0]),
        "classification": {**cls, "imagenet_top5": top5},
        "condition": {"indicators": [{"key": k, "label": l, "description": d, "value": ind["values"][k], "severity": ind["severity"][k], "area_percent": ind["values"][k] * 100} for k, l, d, _ in INDICATORS], "patch_atypicality_p95": ind["patch_z95"]},
        "score": sc,
        "overlay_jpeg": bytes(jpg),
        "seconds": round(time.time() - t0, 3),
    }


def synthetic_defects(bgr: np.ndarray, seed: int = 3, cracks: int = 0, stain: int = 0, rust: int = 0) -> np.ndarray:
    """Draws known defects onto a copy of a clean image (used by tests to check each indicator reacts to what it claims to detect)."""
    rng = np.random.default_rng(seed)
    out = bgr.copy(); h, w = out.shape[:2]
    for _ in range(cracks):
        x, y = int(rng.integers(w // 8, w - w // 8)), int(rng.integers(h // 8, h - h // 8))
        pts = [(x, y)]
        for _ in range(7):
            x += int(rng.integers(-12, 13)); y += int(rng.integers(8, 22)); pts.append((x, y))
        cv2.polylines(out, [np.array(pts, np.int32)], False, (25, 25, 25), 2, cv2.LINE_AA)
    for _ in range(stain):
        cx, cy = int(rng.integers(w // 6, w - w // 6)), int(rng.integers(h // 6, h - h // 6))
        ov = out.copy(); cv2.ellipse(ov, (cx, cy), (int(rng.integers(25, 60)), int(rng.integers(20, 45))), int(rng.integers(0, 180)), 0, 360, (45, 50, 55), -1)
        out = cv2.addWeighted(ov, 0.8, out, 0.2, 0)
    for _ in range(rust):
        x, y = int(rng.integers(0, w - 60)), int(rng.integers(0, h - 40))
        cv2.rectangle(out, (x, y), (x + int(rng.integers(30, 60)), y + int(rng.integers(15, 40))), (30, 80, 170), -1)
    return out


def clean_facade(w: int = 640, h: int = 480) -> np.ndarray:
    """A plain synthetic building facade (flat wall, windows, door, roof) used as the 'no defect' baseline in tests. Not a photograph."""
    img = np.full((h, w, 3), (196, 190, 182), np.uint8)
    cv2.rectangle(img, (0, 0), (w, int(h * 0.18)), (150, 150, 160), -1)
    for r in range(2):
        for c in range(4):
            x, y = 60 + c * 140, 110 + r * 150
            cv2.rectangle(img, (x, y), (x + 80, y + 90), (110, 100, 90), -1); cv2.rectangle(img, (x + 6, y + 6), (x + 74, y + 84), (205, 190, 150), -1)
    cv2.rectangle(img, (w // 2 - 35, h - 150), (w // 2 + 35, h), (70, 80, 110), -1)
    img = cv2.add(img, np.random.default_rng(1).integers(0, 6, img.shape, dtype=np.uint8))
    return img


def info() -> dict:
    return {"name": "PropertyVision AI (experimental scoring on ImageNet evidence and OpenCV image analysis)", "source": "MobileNetV2 ImageNet weights (Apache-2.0) plus original Neo Forge rules; see docs/property-vision", "licence": "Apache-2.0 weights; original code"}


_ = math
