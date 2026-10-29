"""Rule logic on generated skeletons (see skeleton.py) and on keypoints from the real pose model."""
import numpy as np

from app.activity import AggressionParams, FallParams, Sample, arm_speeds, detect_aggression, detect_falls, torso
from tests.skeleton import H, fall_track, skeleton


def test_torso_tilt_geometry():
    kp, _ = skeleton(100, 400, 0)
    tilt, length, hip = torso(kp)
    assert abs(tilt) < 1 and abs(length - 0.3 * H) < 1 and abs(hip[1] - (400 - 0.5 * H)) < 1
    assert abs(torso(skeleton(100, 400, 90)[0])[0] - 90) < 1
    assert abs(torso(skeleton(100, 400, -90)[0])[0] - 90) < 1       # tilt is unsigned
    assert abs(torso(skeleton(100, 400, 150)[0])[0] - 150) < 1      # shoulders below hips


def test_fall_is_found_once_with_evidence():
    c = detect_falls({1: fall_track()}, FallParams(), video_end=10)
    assert len(c) == 1
    f = c[0]
    assert f.kind == "fall" and f.tracks == [1]
    assert 1.8 <= f.t_start <= 2.4 and 2.4 <= f.t_peak <= 3.2   # standing until 2.0 s, lying from about 2.4 s
    ev = {e.name: e for e in f.evidence}
    assert all(e.met for e in f.evidence if e.threshold is not None)
    assert "hips 1." in ev["Drop (hip descent or box height)"].value
    assert any("No return" in n for n in f.notes)


def test_recovery_is_reported():
    c = detect_falls({1: fall_track(recover=True)}, FallParams(), video_end=10)
    assert len(c) == 1 and not any("No return" in n for n in c[0].notes)


def test_standing_and_walking_give_nothing():
    stand = [Sample(i / 5, skeleton(200, 400, 2.0)[1], 0.9, skeleton(200, 400, 2.0)[0]) for i in range(40)]
    walk = [Sample(i / 5, skeleton(100 + 8 * i, 400, 4 * np.sin(i))[1], 0.9, skeleton(100 + 8 * i, 400, 4 * np.sin(i))[0]) for i in range(40)]
    assert detect_falls({1: stand, 2: walk}, FallParams(), 8) == []


def test_never_upright_lying_person_is_not_a_fall():
    lying = [Sample(i / 5, skeleton(200, 400, 90)[1], 0.9, skeleton(200, 400, 90)[0]) for i in range(40)]
    assert detect_falls({1: lying}, FallParams(), 8) == []


def test_slow_lie_down_exceeds_window():
    assert detect_falls({1: fall_track(fall_s=6.0, lie_s=3.0)}, FallParams(), 12) == []


def test_brief_drop_that_recovers_is_not_a_fall():
    assert detect_falls({1: fall_track(lie_s=0.4, recover=True)}, FallParams(), 12) == []  # shorter than min_lying_s


def test_bending_over_is_not_lying():
    track = []
    for i in range(40):
        tilt = 3 if i < 15 else 50  # bends to 50 degrees and stays: below the lying threshold, box not wide
        kp, box = skeleton(200, 400, tilt)
        track.append(Sample(i / 5, box, 0.9, kp))
    assert detect_falls({1: track}, FallParams(), 8) == []


def test_video_ending_while_lying_is_flagged_as_such():
    c = detect_falls({1: fall_track(lie_s=0.8)}, FallParams(), video_end=3.4)
    assert len(c) == 1 and any("video ended" in str(e.value) for e in c[0].evidence)


def test_rule_thresholds_change_the_outcome():
    assert detect_falls({1: fall_track(lie_s=0.8)}, FallParams(min_lying_s=2.0), video_end=60) == []


def pair(speed_amp: float, gap_px: float, seconds: float = 3.0, fps: float = 5.0):
    a, b = [], []
    for i in range(int(seconds * fps)):
        t = i / fps
        ph = t * 2 * np.pi * 1.2 * 2  # arm swing; the sampling at 5 fps limits what can be seen
        ka, ba = skeleton(200, 400, 0, ph, speed_amp)
        kb, bb = skeleton(200 + gap_px, 400, 0, None, 0)
        a.append(Sample(t, ba, 0.9, ka)); b.append(Sample(t, bb, 0.9, kb))
    return {1: a, 2: b}


def test_arm_speed_is_relative_to_own_hips():
    tr = pair(0.30, 120)[1]
    v = list(arm_speeds(tr, 0.5).values())
    assert v and max(v) > 3
    still = list(arm_speeds(pair(0.0, 120)[1], 0.5).values())
    assert max(still) < 0.01
    moving = [Sample(i / 5, skeleton(100 + 40 * i, 400, 0)[1], 0.9, skeleton(100 + 40 * i, 400, 0)[0]) for i in range(10)]  # walking fast with rigid arms
    assert max(arm_speeds(moving, 0.5).values()) < 0.01


def test_close_pair_with_fast_arms_is_a_candidate():
    c = detect_aggression(pair(0.30, 120), AggressionParams(min_arm_speed=3))
    assert len(c) == 1 and c[0].kind == "aggression" and c[0].tracks == [1, 2]
    assert any("dancing" in n.lower() for n in c[0].notes)


def test_far_pair_or_slow_arms_give_nothing():
    assert detect_aggression(pair(0.30, 900), AggressionParams(min_arm_speed=3)) == []
    assert detect_aggression(pair(0.02, 120), AggressionParams(min_arm_speed=3)) == []
    assert detect_aggression(pair(0.30, 120, seconds=0.6), AggressionParams(min_arm_speed=3)) == []  # shorter than min duration


def test_pose_less_tracks_never_alert():
    tr = pair(0.30, 120)
    for t in tr.values():
        for s in t:
            s.kp = None
    assert detect_aggression(tr, AggressionParams(min_arm_speed=3)) == []
    box_only = detect_falls({1: [Sample(s.t, s.box, 0.9, None) for s in fall_track()]}, FallParams(), 10)
    assert len(box_only) == 1 and any("box shape" in n for n in box_only[0].notes)  # documented fallback, and it says so
