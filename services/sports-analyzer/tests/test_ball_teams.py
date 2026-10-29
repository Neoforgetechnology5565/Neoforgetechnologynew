import cv2
import numpy as np

from app.ball import fill_estimates, link
from app.teams import OTHER, TEAM_A, TEAM_B, UNCERTAIN, classify, hex_to_lab, lab_to_hex, torso_colour

W = 1920
T = [i * 0.2 for i in range(20)]


def test_link_follows_smooth_ball_and_rejects_a_far_false_positive():
    cands = [[(100 + 30 * i, 500, 0.8)] for i in range(20)]
    cands[7] = [(100 + 30 * 7, 500, 0.7), (1500, 100, 0.95)]  # a stronger but impossible candidate
    out = link(cands, T, W)
    assert all(o is not None for o in out)
    assert out[7][0] == 310 and out[7][1] == 500


def test_isolated_weak_candidates_are_dropped():
    cands = [[] for _ in range(20)]
    cands[5] = [(400, 300, 0.4)]
    cands[12] = [(900, 200, 0.45)]
    out = link(cands, T, W)
    assert all(o is None for o in out)
    cands[5] = [(400, 300, 0.9)]
    assert link(cands, T, W)[5] is not None  # an isolated *strong* detection is kept


def test_short_gaps_are_estimated_and_marked_long_gaps_are_not():
    chosen = [None] * 20
    chosen[2], chosen[5] = (100, 100, 0.8), (130, 100, 0.8)  # 0.6 s gap
    chosen[10], chosen[18] = (500, 100, 0.8), (560, 100, 0.8)  # 1.6 s gap
    res = fill_estimates(chosen, T, W)
    assert [r.kind for r in res[2:6]] == ["observed", "estimated", "estimated", "observed"]
    assert abs(res[3].x - 110) < 1e-6 and res[3].conf is None
    assert all(r is None for r in res[11:18])  # nothing is invented across the long gap
    assert res[0] is None and res[19] is None


def jersey(bgr):
    f = np.full((300, 200, 3), (40, 120, 40), np.uint8)  # grass
    f[60:200, 50:150] = bgr
    return f


def test_torso_colour_ignores_grass_and_reports_none_for_pure_grass():
    c = torso_colour(jersey((200, 60, 60)), (40, 50, 160, 250))
    assert c is not None and lab_to_hex(c)[1:].lower() != "287828"
    assert torso_colour(np.full((300, 200, 3), (40, 120, 40), np.uint8), (40, 50, 160, 250)) is None


def test_two_clear_kits_are_separated_and_a_third_colour_is_other():
    rng = np.random.default_rng(0)
    cols = {}
    for i in range(8):
        cols[i] = hex_to_lab("#d02020") + rng.normal(0, 3, 3)
    for i in range(8, 16):
        cols[i] = hex_to_lab("#f0f0f0") + rng.normal(0, 3, 3)
    cols[99] = hex_to_lab("#f2d000")  # goalkeeper in yellow
    labels, info = classify(cols)
    assert info["status"] == "clustered" and info["separation"] > 1.8
    assert len({labels[i] for i in range(8)}) == 1 and len({labels[i] for i in range(8, 16)}) == 1
    assert labels[0] != labels[8] and {labels[0], labels[8]} == {TEAM_A, TEAM_B}
    assert labels[99] == OTHER


def test_similar_kits_are_uncertain_not_forced():
    rng = np.random.default_rng(1)
    cols = {i: hex_to_lab("#808080") + rng.normal(0, 6, 3) for i in range(16)}
    labels, info = classify(cols)
    assert info["status"] == "uncertain" and set(labels.values()) == {UNCERTAIN}


def test_user_colours_and_off_mode():
    cols = {1: hex_to_lab("#d02020"), 2: hex_to_lab("#2030d0"), 3: hex_to_lab("#20d020")}
    labels, info = classify(cols, "colors", ["#cc2222", "#2233cc"])
    assert labels[1] == TEAM_A and labels[2] == TEAM_B and labels[3] == OTHER and info["status"] == "user_colours"
    labels, info = classify(cols, "off")
    assert set(labels.values()) == {UNCERTAIN} and info["status"] == "off"
