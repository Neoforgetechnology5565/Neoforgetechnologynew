import numpy as np
import pytest

from app.pitch import CalibrationError, apply_h, fit_homography, landmarks, zone_of


def synth_pairs(ids, H_pitch_to_img, noise=0.0, seed=0):
    lm = landmarks()
    rng = np.random.default_rng(seed)
    out = []
    for k in ids:
        x, y = lm[k]["x"], lm[k]["y"]
        v = H_pitch_to_img @ np.array([x, y, 1.0])
        out.append((v[0] / v[2] + rng.normal(0, noise), v[1] / v[2] + rng.normal(0, noise), x, y))
    return out


HP = np.array([[9.0, 2.0, 120.0], [0.5, 7.0, 80.0], [1e-4, 4e-4, 1.0]])  # a plausible pitch->image perspective
IDS = ["corner_tl", "corner_br", "centre_spot", "pen_l_top", "pen_r_bottom", "spot_r", "circle_left"]


def test_landmark_catalogue_matches_laws_of_the_game():
    lm = landmarks(105, 68)
    assert lm["centre_spot"]["x"] == 52.5 and lm["centre_spot"]["y"] == 34
    assert lm["pen_l_top"]["x"] == 16.5 and abs(lm["pen_l_top"]["y"] - (34 - 20.16)) < 1e-6
    assert lm["spot_r"]["x"] == 105 - 11
    assert lm["goalarea_l_bottom"]["x"] == 5.5 and abs(lm["goalarea_l_bottom"]["y"] - (34 + 9.16)) < 1e-6
    assert abs(lm["arc_l_top"]["x"] - 16.5) < 1e-9 and 26 < lm["arc_l_top"]["y"] < 27.5
    assert len({(v["x"], v["y"]) for v in lm.values()}) == len(lm)  # no two landmarks coincide


def test_exact_perspective_is_recovered():
    cal = fit_homography(synth_pairs(IDS, HP), 105, 68)
    assert cal.residual_m < 1e-4 and all(cal.inliers) and cal.quality == "good"
    img = np.array([[300.0, 400.0]])
    expected = np.linalg.inv(HP) @ np.array([300.0, 400.0, 1.0])
    got = apply_h(cal.H, img)[0]
    assert np.allclose(got, expected[:2] / expected[2], atol=1e-6)


def test_clicking_noise_is_reported_not_hidden():
    cal = fit_homography(synth_pairs(IDS, HP, noise=1.5), 105, 68)
    assert 0.0 < cal.residual_m < 3.0


def test_a_wrong_landmark_is_rejected_as_outlier():
    pairs = synth_pairs(IDS, HP)
    x, y, px, py = pairs[2]
    pairs[2] = (x, y, px + 25, py + 12)  # centre spot paired with a wrong pitch position
    cal = fit_homography(pairs, 105, 68)
    assert cal.inliers[2] is False and sum(cal.inliers) == len(IDS) - 1
    assert any("disagreed" in w for w in cal.warnings)


def test_four_points_warn_that_error_is_not_a_measure():
    cal = fit_homography(synth_pairs(["corner_tl", "corner_br", "pen_l_top", "pen_r_bottom"], HP), 105, 68)
    assert any("4" in w and "perfectly" in w for w in cal.warnings)


@pytest.mark.parametrize("n", [0, 1, 3])
def test_too_few_points(n):
    with pytest.raises(CalibrationError, match="At least 4"):
        fit_homography(synth_pairs(IDS[:n], HP), 105, 68)


def test_collinear_points_rejected():
    lm = landmarks()
    ids = ["corner_tl", "half_top", "corner_tr"]  # all on the top touchline
    pairs = [(10 * i + 5.0, 3.0 * i + 2, lm[k]["x"], lm[k]["y"]) for i, k in enumerate(ids)]
    pairs.append((100.0, 9.0, 80.0, 0.0))
    with pytest.raises(CalibrationError, match="straight line"):
        fit_homography(pairs, 105, 68)


def test_duplicate_pitch_landmark_and_nan_rejected():
    p = synth_pairs(IDS, HP)
    with pytest.raises(CalibrationError, match="only once"):
        fit_homography(p + [p[0]], 105, 68)
    p[0] = (float("nan"), 1.0, p[0][2], p[0][3])
    with pytest.raises(CalibrationError, match="finite"):
        fit_homography(p, 105, 68)


def test_zones():
    assert zone_of(1, 1, 105, 68) == 0 and zone_of(104, 67, 105, 68) == 8 and zone_of(52, 34, 105, 68) == 4
    assert zone_of(-1, 10, 105, 68) is None
