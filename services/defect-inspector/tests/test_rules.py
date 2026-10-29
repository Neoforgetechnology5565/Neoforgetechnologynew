import pytest

from app.rules import FAIL, PASS, REVIEW, RuleError, Rules, decide

REF = {"images": 200, "validated": True}


def reg(i, ratio, area=0.5, status=None, sev="not configured"):
    return {"id": i, "score_ratio": ratio, "area_pct": area, "status": status or ("flagged" if ratio >= 1.0 else "borderline"), "severity": sev}


def test_clean_part_passes():
    d = decide([], 0.5, Rules(), REF, [])
    assert d["recommendation"] == PASS and any("below the review band" in r for r in d["reasons"])


def test_flagged_region_over_limit_fails_and_limit_is_configurable():
    assert decide([reg(1, 1.4)], 1.4, Rules(), REF, [])["recommendation"] == FAIL
    d = decide([reg(1, 1.4)], 1.4, Rules(max_defects=1), REF, [])
    assert d["recommendation"] == REVIEW and "within the allowed 1" in d["reasons"][0]  # tolerated defects still need a human
    assert decide([reg(1, 1.4), reg(2, 1.2)], 1.4, Rules(max_defects=1), REF, [])["recommendation"] == FAIL


def test_near_threshold_goes_to_review_not_pass():
    assert decide([], 0.9, Rules(), REF, [])["recommendation"] == REVIEW
    assert decide([reg(1, 0.9)], 0.9, Rules(), REF, [])["recommendation"] == REVIEW
    assert decide([], 0.9, Rules(review_band=0.95), REF, [])["recommendation"] == PASS  # the band is configurable


def test_unvalidated_or_small_reference_never_auto_passes():
    assert decide([], 0.3, Rules(), {"images": 12}, [])["recommendation"] == REVIEW  # default needs 30 good images
    assert decide([], 0.3, Rules(min_reference_images=10), {"images": 12, "validated": True}, [])["recommendation"] == PASS
    assert decide([], 0.3, Rules(), {"images": 200, "validated": True}, [])["recommendation"] == PASS


def test_condition_checks_and_wrong_part_force_review():
    chk = [{"level": "review", "code": "brightness", "text": "much darker than the reference"}]
    d = decide([], 0.3, Rules(), REF, chk)
    assert d["recommendation"] == REVIEW and "darker" in d["reasons"][0]
    d = decide([reg(1, 4.0)], 4.0, Rules(), REF, [])
    assert d["recommendation"] == REVIEW and "different part" in d["reasons"][0]  # extreme score is more likely the wrong reference than a defect


def test_severity_rule_is_optional_and_explicit():
    major, minor = reg(1, 1.5, 3.0, sev="major"), reg(2, 1.5, 0.1, sev="minor")
    r = Rules(max_defects=0, major_area_pct=1.0, fail_on_major_only=True)
    assert decide([minor], 1.5, r, REF, [])["recommendation"] == REVIEW  # minor flagged regions are not counted but are not ignored either
    assert decide([major, minor], 1.5, r, REF, [])["recommendation"] == FAIL


def test_trace_is_always_explained():
    for regs, ratio in (([], 0.2), ([reg(1, 1.5)], 1.5), ([], 0.9)):
        d = decide(regs, ratio, Rules(), REF, [])
        assert d["trace"] and d["reasons"] and d["trace"][0].startswith("image score ratio")


@pytest.mark.parametrize("bad", [{"max_defects": -1}, {"max_defects": "x"}, {"min_score_ratio": 0.0}, {"review_band": 2.0, "min_score_ratio": 1.0}, {"nonsense": 1}, {"major_area_pct": 200}, [1]])
def test_rule_validation(bad):
    with pytest.raises(RuleError):
        Rules.parse(bad)


def test_rules_parse_defaults_and_none():
    assert Rules.parse(None) == Rules() and Rules.parse({"major_area_pct": None}).major_area_pct is None
