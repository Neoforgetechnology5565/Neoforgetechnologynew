"""Quality-control rules and the pass / fail / manual-review recommendation.

Three layers are kept apart everywhere (storage, API, UI, report):
  1. model output       - anomaly score, anomaly map, regions
  2. automated advice   - the recommendation produced by these rules
  3. human decision     - what a reviewer confirmed or overrode
The recommendation never leaves "manual review" when the evidence cannot support a decision, and it is not a certified quality assurance result.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

PASS, FAIL, REVIEW = "PASS", "FAIL", "MANUAL_REVIEW"


class RuleError(ValueError):
    pass


@dataclass
class Rules:
    max_defects: int = 0  # flagged regions allowed before the part FAILS
    min_score_ratio: float = 1.0  # a region is flagged when its peak score / reference threshold >= this
    review_band: float = 0.85  # an image or region between band and flag threshold -> MANUAL REVIEW
    min_region_area_pct: float = 0.01  # regions smaller than this share of the image (percent) are ignored as noise
    major_area_pct: float | None = None  # optional severity rule: flagged regions at least this large (percent of image) are "major"; None = severity not configured
    fail_on_major_only: bool = False  # when severity is configured: only major regions count towards max_defects (minor ones go to review)
    min_reference_images: int = 30  # references built from fewer good images can never auto-PASS (30 is also where the UI stops calling a custom reference unvalidated)
    wrong_part_ratio: float = 3.0  # image score this many times the threshold suggests a different part/reference: MANUAL REVIEW

    @staticmethod
    def parse(d: dict | None) -> "Rules":
        d = d or {}
        if not isinstance(d, dict):
            raise RuleError("rules must be a JSON object.")
        r = Rules()
        spec = {"max_defects": (int, 0, 100), "min_score_ratio": (float, 0.3, 5.0), "review_band": (float, 0.3, 5.0), "min_region_area_pct": (float, 0.0, 50.0), "major_area_pct": (float, 0.0, 100.0),
                "min_reference_images": (int, 1, 1000), "wrong_part_ratio": (float, 1.0, 50.0)}
        for k, v in d.items():
            if k == "fail_on_major_only":
                r.fail_on_major_only = bool(v)
            elif k in spec:
                typ, lo, hi = spec[k]
                if v is None and k == "major_area_pct":
                    r.major_area_pct = None
                    continue
                try:
                    x = typ(v)
                except (TypeError, ValueError):
                    raise RuleError(f"{k} must be a number.") from None
                if not (lo <= x <= hi):
                    raise RuleError(f"{k} must be between {lo} and {hi}.")
                setattr(r, k, x)
            else:
                raise RuleError(f"Unknown rule '{str(k)[:40]}'.")
        if r.review_band > r.min_score_ratio:
            raise RuleError("review_band must not exceed min_score_ratio.")
        return r

    def to_json(self) -> dict:
        return asdict(self)


def severity(area_pct: float, rules: Rules) -> str:
    if rules.major_area_pct is None:
        return "not configured"
    return "major" if area_pct >= rules.major_area_pct else "minor"


def decide(regions: list[dict], image_ratio: float, rules: Rules, ref: dict, checks: list[dict]) -> dict:
    """Returns {recommendation, reasons, trace}. `ref` needs `images` (good images used). `checks` are image-condition warnings."""
    trace: list[str] = []
    flagged = [r for r in regions if r["status"] == "flagged"]
    counted = [r for r in flagged if (rules.major_area_pct is None or not rules.fail_on_major_only or r["severity"] == "major")]
    border = [r for r in regions if r["status"] == "borderline"]
    trace.append(f"image score ratio {image_ratio:.2f} (1.00 = reference flag threshold)")
    trace.append(f"{len(flagged)} flagged region(s) (score ratio >= {rules.min_score_ratio:g}); {len(counted)} counted towards the limit of {rules.max_defects}; {len(border)} borderline")
    reasons: list[str] = []
    if image_ratio >= rules.wrong_part_ratio:
        reasons.append(f"The image score is {image_ratio:.1f}x the reference threshold: this may be a different part, a wrong reference, or a very different image setup rather than a defect.")
        return {"recommendation": REVIEW, "reasons": reasons, "trace": trace + ["rule: score >= wrong_part_ratio -> MANUAL REVIEW"]}
    bad = [c for c in checks if c["level"] == "review"]
    if len(counted) > rules.max_defects:
        reasons.append(f"{len(counted)} flagged region(s) exceed the allowed {rules.max_defects}.")
        return {"recommendation": FAIL, "reasons": reasons, "trace": trace + ["rule: flagged regions > max_defects -> FAIL"]}
    if bad:
        reasons += [c["text"] for c in bad]
        return {"recommendation": REVIEW, "reasons": reasons, "trace": trace + ["rule: image conditions differ from the reference -> MANUAL REVIEW"]}
    if flagged and rules.fail_on_major_only:
        reasons.append(f"{len(flagged)} flagged region(s) are below the configured 'major' size; they are within the limit but need a human look.")
        return {"recommendation": REVIEW, "reasons": reasons, "trace": trace + ["rule: minor flagged regions with fail_on_major_only -> MANUAL REVIEW"]}
    if flagged:
        reasons.append(f"{len(flagged)} flagged region(s) are within the allowed {rules.max_defects}; a person should confirm.")
        return {"recommendation": REVIEW, "reasons": reasons, "trace": trace + ["rule: flagged but within max_defects -> MANUAL REVIEW"]}
    if border or image_ratio >= rules.review_band:
        reasons.append(f"The part is close to the flag threshold (score ratio {image_ratio:.2f}, review band starts at {rules.review_band:g}).")
        return {"recommendation": REVIEW, "reasons": reasons, "trace": trace + ["rule: within review band -> MANUAL REVIEW"]}
    if ref.get("images", 0) < rules.min_reference_images:
        reasons.append(f"The reference was built from only {ref.get('images', 0)} good image(s) (rule: at least {rules.min_reference_images}); a clean score cannot be trusted enough to auto-PASS.")
        return {"recommendation": REVIEW, "reasons": reasons, "trace": trace + ["rule: reference too small for auto-PASS -> MANUAL REVIEW"]}
    reasons.append("No region reached the flag threshold and the score is below the review band.")
    return {"recommendation": PASS, "reasons": reasons, "trace": trace + ["rule: no flagged or borderline regions -> PASS"]}
