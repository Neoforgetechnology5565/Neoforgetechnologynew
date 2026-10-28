"""The measurement engine against known geometry. Real-world values must exist only when a defensible scale exists."""
import math

import cv2
import numpy as np
import pytest

from app.measure import ScaleError, measure_polygon, pitch_from, resolve_scale
from app.media import Georef

RECT = [[100, 100], [300, 100], [300, 200], [100, 200]]  # 200 x 100 px


def test_no_scale_means_pixels_only_and_says_why():
    m = measure_polygon(RECT, None, None)
    assert m["pixels"]["area_px"] == 20000 and m["pixels"]["perimeter_px"] == 600
    assert m["metric"]["available"] is False and "No scale" in m["metric"]["reason"]
    assert m["surface"]["available"] is False and m["pitch"]["status"] == "not_measurable"


def test_gsd_scale_gives_exact_plan_area_and_perimeter():
    m = measure_polygon(RECT, resolve_scale({"type": "gsd", "gsd_m": 0.05}, None), None)
    assert math.isclose(m["metric"]["area_m2"], 20000 * 0.05 ** 2) and math.isclose(m["metric"]["perimeter_m"], 600 * 0.05)
    assert math.isclose(m["metric"]["bounding_rectangle_m"]["length"], 10) and math.isclose(m["metric"]["bounding_rectangle_m"]["width"], 5)
    assert "Plan-view" in m["metric"]["meaning"] and m["surface"]["available"] is False  # no pitch: no sloped area


def test_anisotropic_geo_scale_uses_each_axis():
    g = Georef(0.25, 0.30, "EPSG:4326", "t")
    m = measure_polygon(RECT, resolve_scale(None, g), None)
    assert math.isclose(m["metric"]["area_m2"], 20000 * 0.25 * 0.30) and math.isclose(m["metric"]["edge_lengths_m"][0], 200 * 0.25) and math.isclose(m["metric"]["edge_lengths_m"][1], 100 * 0.30)


def test_reference_length_scale():
    s = resolve_scale({"type": "reference", "p1": [0, 0], "p2": [300, 400], "length_m": 25}, None)  # 500 px = 25 m -> 0.05 m/px
    assert math.isclose(s.gsd_x, 0.05) and s.kind == "reference"


def test_pitch_conventions_and_sloped_area():
    p = pitch_from({"rise_per_12": 12})
    assert math.isclose(p["degrees"], 45) and math.isclose(pitch_from({"degrees": 45})["rise_per_12"], 12)
    m = measure_polygon(RECT, resolve_scale({"type": "gsd", "gsd_m": 0.1}, None), p)
    assert math.isclose(m["surface"]["area_m2"], m["metric"]["area_m2"] / math.cos(math.radians(45))) and m["pitch"]["source"] == "user" and "uniform" in m["surface"]["assumption"]
    assert pitch_from(None) is None
    with pytest.raises(ScaleError):
        pitch_from({"degrees": 95})
    with pytest.raises(ScaleError):
        pitch_from({"rise_per_12": "steep"})


def test_plane_calibration_recovers_true_area_under_perspective():
    """A 10 m x 6 m roof plane is rendered through a real perspective warp; a 4 m x 3 m rectangle drawn on it calibrates the plane; a 5 m x 2 m patch must measure 10 m²."""
    H = np.array([[60, 12, 40], [-8, 48, 30], [0.0006, 0.0011, 1]], np.float64)  # plane metres -> pixels

    def px(pts):
        q = np.hstack([np.array(pts, float), np.ones((len(pts), 1))]) @ H.T
        return (q[:, :2] / q[:, 2:3]).tolist()

    quad = px([[1, 1], [5, 1], [5, 4], [1, 4]])
    patch = px([[2, 2], [7, 2], [7, 4], [2, 4]])
    s = resolve_scale({"type": "plane_quad", "quad": quad, "width_m": 4, "height_m": 3}, None)
    m = measure_polygon(patch, s, None)
    assert math.isclose(m["metric"]["area_m2"], 10.0, rel_tol=1e-6) and m["surface"]["available"] and "no pitch assumption" in m["surface"]["basis"]
    assert math.isclose(m["metric"]["bounding_rectangle_m"]["length"], 5.0, rel_tol=1e-5)
    plan = measure_polygon(patch, resolve_scale({"type": "gsd", "gsd_m": 0.05}, None), None)  # the naive plan-view reading of the same pixels is clearly different
    assert abs(plan["metric"]["area_m2"] - 10.0) > 1.0


@pytest.mark.parametrize("spec,msg", [({"type": "gsd", "gsd_m": -1}, "out of range"), ({"type": "gsd", "gsd_m": "x"}, "number"), ({"type": "reference", "p1": [0, 0], "p2": [1, 1], "length_m": 5}, "too close"),
                                      ({"type": "plane_quad", "quad": [[0, 0], [10, 0]], "width_m": 1, "height_m": 1}, "four"), ({"type": "plane_quad", "quad": [[0, 0], [100, 0], [20, 20], [0, 100]], "width_m": 1, "height_m": 1}, "convex"),
                                      ({"type": "geo"}, "georeferencing"), ({"type": "magic"}, "Unknown")])
def test_invalid_scales_are_rejected_not_guessed(spec, msg):
    with pytest.raises(ScaleError, match=msg):
        resolve_scale(spec, None)


def test_degenerate_polygon_is_rejected():
    with pytest.raises(ScaleError):
        measure_polygon([[0, 0], [1, 1]], None, None)
