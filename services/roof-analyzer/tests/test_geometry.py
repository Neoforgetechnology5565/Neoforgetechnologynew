"""Region extraction, outlines and candidate edges on synthetic probability maps with known answers."""
import cv2
import numpy as np

from app.geometry import UNAVAILABLE, interior_candidates, outline_edges, roof_regions


def synthetic():
    p = np.full((300, 400), 0.05, np.float32)
    p[40:140, 40:200] = 0.9      # 100 x 160 roof
    p[180:260, 250:370] = 0.8    # 80 x 120 roof
    p[10:14, 380:384] = 0.9      # 4x4 speck
    return p


def test_regions_are_found_with_correct_areas_and_small_specks_are_dropped():
    regs, mask = roof_regions(synthetic(), 0.5, 150)
    assert len(regs) == 2
    areas = sorted(r["mask_area_px"] for r in regs)
    assert abs(areas[0] - 80 * 120) < 0.05 * 80 * 120 and abs(areas[1] - 100 * 160) < 0.05 * 100 * 160
    assert all(r["provenance"]["mask"] == "model" and "derived" in r["provenance"]["outline_polygon"] for r in regs)


def test_polygon_matches_the_mask_and_rectangle_fit_is_derived():
    regs, _ = roof_regions(synthetic(), 0.5, 150)
    big = max(regs, key=lambda r: r["mask_area_px"])
    area = cv2.contourArea(np.array(big["polygon"], np.float32))
    assert abs(area - 100 * 160) < 0.06 * 100 * 160 and len(big["polygon"]) <= 8
    assert sorted(big["rectangle_fit"]["size_px"], reverse=True)[0] > 150 and big["rectangle_fit"]["provenance"] == "derived"
    assert big["solidity"] > 0.95 and big["touches_image_border"] is False


def test_threshold_sensitivity_range_brackets_the_area():
    p = synthetic()
    p[40:140, 200:230] = 0.45   # a band the model is unsure about
    regs, _ = roof_regions(p, 0.5, 150)
    big = max(regs, key=lambda r: r["mask_area_px"])
    lo, hi = big["area_px_range_for_threshold_pm_0_1"]
    assert lo <= big["mask_area_px"] <= hi and hi > lo


def test_confidence_reflects_the_probabilities():
    regs, _ = roof_regions(synthetic(), 0.5, 150)
    by = sorted(regs, key=lambda r: r["mask_area_px"])
    assert abs(by[0]["confidence"]["mean_probability"] - 0.8) < 0.02 and abs(by[1]["confidence"]["mean_probability"] - 0.9) < 0.02


def test_outline_edges_are_derived_and_unclassified():
    e = outline_edges([[0, 0], [100, 0], [100, 50], [0, 50]])
    assert [x["length_px"] for x in e] == [100.0, 50.0, 100.0, 50.0] and all(x["provenance"] == "derived" and "not determined" in x["classification"] for x in e)


def test_interior_candidates_inside_the_roof_are_kept_and_outside_ones_rejected_and_never_classified():
    img = np.full((300, 400), 120, np.uint8)
    cv2.line(img, (60, 90), (180, 90), 255, 2)      # inside the roof
    cv2.line(img, (60, 220), (180, 220), 255, 2)    # outside any roof
    region = np.zeros((300, 400), np.uint8)
    region[40:140, 40:200] = 1
    c = interior_candidates(img, region, 0.0, 30)
    assert c and all(x["kind"] == "interior_edge_candidate" and "not classified" in x["provenance"] for x in c)
    assert all(40 < x["p1"][1] < 140 for x in c) and not any(200 < x["p1"][1] < 240 for x in c)


def test_unavailable_features_are_declared_with_reasons():
    assert {"ridge", "hip", "valley", "eave", "rake", "facet"} <= set(UNAVAILABLE) and all(UNAVAILABLE.values())
