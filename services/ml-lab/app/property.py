"""PropertyVision AI (demo 25): three small modules on one photograph.

1. Property image classification: pretrained OpenAI CLIP ViT-B/32 (zero-shot). The image embedding is compared with embeddings of text
   descriptions of four categories (residential house, commercial building, vacant land, mobile home). Nothing is trained here.
2. Property visual object detection: the pretrained YOLOX-S detector that the ML lab already ships (COCO, 80 classes). COCO has no "tree",
   "fence", "roof" or "crack" class, so those are NOT detected; the interface says so.
3. Property condition scoring (this file): a small, readable rule set that turns the real outputs of modules 1 and 2, plus three OpenCV
   measurements, into an EXPERIMENTAL 0-100 score. Every factor is labelled either "observed" (measured in the image) or "assumption" (our
   interpretation of what the observation might mean). Generic object detection cannot prove that a property is distressed, and this score does
   not claim to.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

CLASSES = ["residential_house", "commercial_building", "vacant_land", "mobile_home"]
CLASS_LABEL = {"residential_house": "Residential house", "commercial_building": "Commercial building", "vacant_land": "Vacant land", "mobile_home": "Mobile home"}
CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)
LOGIT_SCALE = 100.0  # CLIP's learned temperature


class ClipClassifier:
    """Zero-shot CLIP: softmax over 100 x cosine(image embedding, class text embedding)."""

    def __init__(self, models: Path):
        self.s = ort.InferenceSession(str(models / "clip_vit_b32_visual.onnx"), providers=["CPUExecutionProvider"])
        self.inp = self.s.get_inputs()[0].name
        z = np.load(models / "clip_property_prompts.npz")
        self.classes = [str(c) for c in z["classes"]]
        self.text = z["embeddings"].astype(np.float32)

    @staticmethod
    def prep(bgr: np.ndarray) -> np.ndarray:
        """CLIP preprocessing: shorter side to 224 (bicubic), centre crop, scale to 0-1, normalise."""
        h, w = bgr.shape[:2]
        s = 224 / min(h, w)
        r = cv2.resize(bgr, (max(224, round(w * s)), max(224, round(h * s))), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
        y, x = (r.shape[0] - 224) // 2, (r.shape[1] - 224) // 2
        c = r[y:y + 224, x:x + 224, ::-1].astype(np.float32) / 255.0
        return ((c - CLIP_MEAN) / CLIP_STD).transpose(2, 0, 1)[None].astype(np.float32)

    def __call__(self, bgr: np.ndarray) -> dict:
        e = self.s.run(None, {self.inp: self.prep(bgr)})[0][0].astype(np.float32)
        e /= np.linalg.norm(e) + 1e-9
        cos = self.text @ e
        z = LOGIT_SCALE * cos
        p = np.exp(z - z.max()); p /= p.sum()
        order = np.argsort(-p)
        scores = [{"key": self.classes[i], "label": CLASS_LABEL[self.classes[i]], "probability": float(p[i]), "cosine": float(cos[i])} for i in order]
        return {"label": scores[0]["key"], "label_text": scores[0]["label"], "probability": scores[0]["probability"], "margin": scores[0]["probability"] - scores[1]["probability"], "scores": scores}


# ---------- OpenCV measurements -----------------------------------------------------------------------------------------------
def measurements(bgr: np.ndarray) -> dict:
    """Three plain image measurements. They describe the photograph, not the property."""
    small = bgr if max(bgr.shape[:2]) <= 640 else cv2.resize(bgr, None, fx=640 / max(bgr.shape[:2]), fy=640 / max(bgr.shape[:2]), interpolation=cv2.INTER_AREA)
    rgb = small[..., ::-1].astype(np.float32)
    t = rgb.sum(2) + 1e-6
    exg = 2 * rgb[..., 1] / t - rgb[..., 0] / t - rgb[..., 2] / t  # excess-green vegetation index
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    return {"green_percent": float((exg > 0.05).mean() * 100), "sharpness": float(cv2.Laplacian(gray, cv2.CV_64F).var()), "brightness": float(gray.mean())}


# ---------- Module 3: condition scoring engine ---------------------------------------------------------------------------------
BASELINE = 60  # neutral starting point: "no evidence either way". It is not an average property and not a market statistic.
VEHICLES = {"car", "truck", "bus", "motorcycle"}
PEOPLE = {"person"}
TIDY = {"potted plant", "bench"}
HOUSEHOLD = {"couch", "chair", "bed", "tv", "refrigerator", "toilet", "sink", "microwave", "oven", "suitcase", "dining table"}
BANDS = [(75, "Looks well kept, from what a photo can show"), (55, "Neutral: little or conflicting evidence"), (35, "Some visible concerns (check in person)"), (0, "Several visible concerns (check in person)")]
CANNOT_SEE = ["Cracks, roof damage, rot, mould, damp or structural problems", "Anything inside the building or out of frame", "Ownership, legal, tax or market information", "Whether objects such as furniture are discarded or simply stored"]


def _factor(key: str, label: str, kind: str, points: float, observed: str, meaning: str) -> dict:
    return {"key": key, "label": label, "kind": kind, "points": round(points, 1), "observed": observed, "meaning": meaning}


def score_property(cls: dict, dets: list[dict], m: dict) -> dict:
    """Experimental 0-100 score from the real outputs of the classifier, the detector and the OpenCV measurements."""
    kind = cls["label"]
    built = kind != "vacant_land"
    counts: dict[str, int] = {}
    for d in dets:
        counts[d["label"]] = counts.get(d["label"], 0) + 1
    n = lambda names: sum(v for k, v in counts.items() if k in names)  # noqa: E731
    f: list[dict] = []

    nv = n(VEHICLES)
    if nv and built:
        f.append(_factor("vehicles", "Vehicles present", "assumption", min(9, 3 * nv), f"{nv} vehicle(s) detected", "Assumption: vehicles on the site suggest it is in active use. A vehicle can also be abandoned, so this is a weak signal."))
    elif nv:
        f.append(_factor("vehicles", "Vehicles on vacant land", "assumption", 0, f"{nv} vehicle(s) detected", "Not scored: we cannot tell parking from dumping or access from a photo."))
    npeople = n(PEOPLE)
    if npeople:
        f.append(_factor("people", "People present", "assumption", min(4, 2 * npeople), f"{npeople} person(s) detected", "Assumption: people in the photo suggest the place is occupied or in use."))
    ntidy = n(TIDY)
    if ntidy:
        f.append(_factor("tidy", "Planters or benches", "assumption", min(4, 2 * ntidy), f"{ntidy} potted plant/bench object(s) detected", "Assumption: deliberate outdoor furnishings can indicate upkeep. They can also be left behind."))
    # a negative factor needs a confident detection: generic detectors often hallucinate household objects in aerial or cluttered scenes
    firm = [d for d in dets if d["score"] >= 0.5]
    nh = sum(1 for d in firm if d["label"] in HOUSEHOLD)
    if nh and built:
        f.append(_factor("household", "Household items outdoors", "assumption", -min(12, 4 * nh), f"{nh} household item(s) detected ({', '.join(sorted({d['label'] for d in firm if d['label'] in HOUSEHOLD}))}) at 50% confidence or more", "Assumption: furniture or appliances in an exterior photo might be discarded items. They might equally be stored, delivered or inside a window view. Detection alone cannot tell."))
    g = m["green_percent"]
    if built and g > 55:
        f.append(_factor("green", "Very high vegetation cover", "assumption", -6, f"{g:.0f}% of the image is green", "Assumption: this could be overgrowth. It could just as well be a garden, trees or a green backdrop."))
    elif built:
        f.append(_factor("green", "Vegetation cover", "observed", 0, f"{g:.0f}% of the image is green", "Observed only; not high enough to count as a concern."))
    else:
        f.append(_factor("green", "Vegetation cover", "observed", 0, f"{g:.0f}% of the image is green", "Observed only: vegetation is normal on vacant land, so it is not scored."))

    raw = BASELINE + sum(x["points"] for x in f)
    value = int(round(max(0, min(100, raw))))
    band = next(t for lo, t in BANDS if value >= lo)

    # How much the evidence can be trusted (separate from the score itself)
    why, strength = [], 2
    if cls["probability"] < 0.5 or cls["margin"] < 0.15:
        strength -= 1; why.append(f"the property type is uncertain ({cls['probability'] * 100:.0f}% for the top category)")
    if m["sharpness"] < 60:
        strength -= 1; why.append("the photo is blurry")
    if m["brightness"] < 45 or m["brightness"] > 215:
        strength -= 1; why.append("the photo is very dark or very bright")
    if not dets:
        strength -= 1; why.append("no objects were detected")
    strength = max(0, strength)
    evidence = ["Low", "Medium", "High"][strength if strength < 3 else 2]
    notes = []
    adjusting = [x for x in f if x["points"] != 0]
    if adjusting:
        for x in sorted(adjusting, key=lambda x: -abs(x["points"])):
            notes.append(f"{x['label']} ({x['points']:+.0f}): {x['meaning']}")
    else:
        notes.append("No detected object or measurement moved the score away from the neutral starting point, so the score says very little about this property.")
    return {"value": value, "band": band, "baseline": BASELINE, "factors": f, "explanation": notes, "evidence_strength": evidence, "evidence_notes": why, "cannot_see": CANNOT_SEE,
            "disclaimer": "Experimental. Built from a hand-written rule set on generic classifier and detector outputs; not validated against real inspections or valuations. It does not prove that a property is distressed or in good condition."}


# ---------- full analysis ------------------------------------------------------------------------------------------------------
def draw(img: np.ndarray, dets: list[dict]) -> np.ndarray:
    out = img.copy()
    thick = max(2, img.shape[1] // 400)
    palette = [(75, 180, 60), (75, 25, 230), (25, 225, 255), (200, 130, 0), (48, 130, 245), (180, 30, 145), (240, 240, 70), (230, 50, 240)]
    for d in dets:
        c = palette[d["class_index"] % len(palette)]
        x1, y1, x2, y2 = (int(v) for v in d["box"])
        cv2.rectangle(out, (x1, y1), (x2, y2), c, thick)
        t = f"{d['label']} {d['score']:.2f}"
        (tw, th), _ = cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(out, (x1, max(0, y1 - th - 6)), (x1 + tw + 4, y1), c, -1)
        cv2.putText(out, t, (x1 + 2, max(th, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)
    return out


def info(has_detector: bool) -> dict:
    return {
        "classification": {"name": "OpenAI CLIP ViT-B/32 (zero-shot)", "source": "OpenAI CLIP weights, ONNX export by Jina AI clip-as-service", "licence": "MIT (CLIP), Apache-2.0 (export)"},
        "detection": {"name": "YOLOX-S (COCO, 80 classes)", "source": "Megvii YOLOX 0.1.1rc0 release, unmodified ONNX", "licence": "Apache-2.0"} if has_detector else None,
        "scoring": {"name": "Neo Forge rule-based scoring engine (experimental)", "source": "services/ml-lab/app/property.py", "licence": "Original code"},
    }
