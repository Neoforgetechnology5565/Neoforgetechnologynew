import math

import numpy as np
import pytest

from app import analytics as A
from tests.conftest import box_at, make_analysis

SQUARE = [[100, 100], [300, 100], [300, 300], [100, 300]]


def walk(tid_points):
    return [(t, box_at(x, y)) for t, x, y in tid_points]


def test_entry_exit_and_duration_are_exact_for_a_complete_visit():
    # outside -> inside from t=2 to t=8 -> outside (5 fps, 0.2 s steps)
    pts = [(round(i * 0.2, 1), 50 if (i * 0.2 < 2 or i * 0.2 > 8) else 200, 200) for i in range(0, 51)]
    an = make_analysis({1: walk(pts)})
    r = A.presence_events(an, SQUARE, min_stay_s=5, merge_gap_s=1, min_obs=3)
    (e,) = r["events"]
    assert (e["entry_t"], e["exit_t"], e["duration_s"]) == (2.0, 8.0, 6.0)
    assert e["complete"] and e["entry_observed"] and e["exit_observed"]
    assert e["flag"] == "Potential Extended Area Presence" and r["summary"]["flagged"] == 1


def test_below_threshold_is_not_flagged_and_wording_is_neutral():
    pts = [(round(i * 0.2, 1), 200 if 10 <= i <= 20 else 50, 200) for i in range(0, 40)]
    r = A.presence_events(make_analysis({1: walk(pts)}), SQUARE, min_stay_s=10, merge_gap_s=1, min_obs=3)
    assert r["events"][0]["flag"] is None
    blob = str(r).lower()
    assert "break" not in blob and "idle" not in blob and "slack" not in blob and "violation" not in blob


def test_track_that_starts_or_ends_inside_is_an_incomplete_observation():
    start_inside = [(round(i * 0.2, 1), 200, 200) for i in range(0, 10)] + [(round(i * 0.2, 1), 50, 200) for i in range(10, 20)]
    end_inside = [(round(i * 0.2, 1), 50, 200) for i in range(0, 10)] + [(round(i * 0.2, 1), 200, 200) for i in range(10, 20)]
    a = A.presence_events(make_analysis({1: walk(start_inside)}), SQUARE, 1, 1, 3)["events"][0]
    b = A.presence_events(make_analysis({1: walk(end_inside)}), SQUARE, 1, 1, 3)["events"][0]
    assert not a["entry_observed"] and a["exit_observed"] and "entry not observed" in a["status"]
    assert b["entry_observed"] and not b["exit_observed"] and "exit not observed" in b["status"]
    assert "at least" in A.presence_events(make_analysis({1: walk(end_inside)}), SQUARE, 1, 1, 3)["events"][0]["flag_note"]


def test_short_excursion_is_merged_but_a_long_one_splits_the_event():
    def track(out_steps):
        pts = []
        for i in range(0, 60):
            inside = not (20 <= i < 20 + out_steps)
            pts.append((round(i * 0.2, 1), 200 if inside else 50, 200))
        pts = [(t, x, y) for t, x, y in pts]
        return make_analysis({1: walk([(0.0, 50, 200)] + pts[1:])})
    assert len(A.presence_events(track(3), SQUARE, 1, merge_gap_s=2.0, min_obs=3)["events"]) == 1
    assert len(A.presence_events(track(15), SQUARE, 1, merge_gap_s=2.0, min_obs=3)["events"]) == 2


def test_missing_observations_end_the_event_and_tiny_blips_are_ignored():
    pts = [(round(i * 0.2, 1), 200, 200) for i in range(0, 10)] + [(round(i * 0.2, 1), 200, 200) for i in range(40, 50)]
    r = A.presence_events(make_analysis({1: walk(pts)}), SQUARE, 1, merge_gap_s=1.0, min_obs=3)
    assert len(r["events"]) == 2  # a 6 s observation gap is not assumed to be continuous presence
    blip = A.presence_events(make_analysis({1: walk([(0.0, 50, 200), (0.2, 200, 200), (0.4, 50, 200), (0.6, 50, 200)])}), SQUARE, 1, 1, min_obs=3)
    assert blip["events"] == [] and blip["ignored_short_events"] == 1


def test_occupancy_counts_people_in_area():
    an = make_analysis({1: walk([(t / 5, 200, 200) for t in range(0, 20)]), 2: walk([(t / 5, 200, 150) for t in range(0, 20)])})
    occ = A.occupancy(an, SQUARE, bin_s=2.0)
    assert max(o["max_people_in_area"] for o in occ) == 2


def test_polygon_validation():
    with pytest.raises(A.CalibrationError):
        A.valid_polygon([[0, 0], [1, 1]])
    with pytest.raises(A.CalibrationError):
        A.valid_polygon([[0, 0], [10, 0], [20, 0]])
    with pytest.raises(A.CalibrationError):
        A.valid_polygon("nope")
    assert A.valid_polygon(SQUARE) == [[100.0, 100.0], [300.0, 100.0], [300.0, 300.0], [100.0, 300.0]]


EMP = [{"id": "e1", "name": "Alex Demo", "role": "Server", "shift_start": "12:00", "shift_end": "14:00"},
       {"id": "e2", "name": "Sam Demo", "role": "Cook", "shift_start": "12:00", "shift_end": "14:00"},
       {"id": "e3", "name": "Kim Demo", "role": "Host", "shift_start": "18:00", "shift_end": "20:00"},
       {"id": "e4", "name": "Lee Demo", "role": "Host", "shift_start": "12:00", "shift_end": "14:00"}]


def ev(tid, t0, t1, complete=True):
    return {"track_id": tid, "entry_t": t0, "exit_t": t1, "complete": complete}


def test_attendance_statuses_use_insufficient_data_when_the_video_cannot_show_it():
    events = [ev(1, 600, 900), ev(2, 100, 400), ev(5, 100, 200, complete=False)]
    r = A.attendance(events, EMP, {"1": "e1", "2": "e2", "5": "e4"}, "12:00:00", 0, 1800)
    s = {x["employee_id"]: x for x in r["rows"]}
    assert s["e1"]["status"] == "Consistent with the schedule"
    assert s["e2"]["status"] == "Consistent with the schedule"
    assert s["e3"]["status"] == "Insufficient Data" and "No track" in s["e3"]["explanation"]
    r2 = A.attendance([ev(7, 10, 20)], EMP[2:3], {"7": "e3"}, "12:00:00", 0, 1800)  # linked, but the video (12:00-12:30) does not cover the 18:00 shift
    assert r2["rows"][0]["status"] == "Insufficient Data" and "does not overlap" in r2["rows"][0]["explanation"]
    assert s["e4"]["status"] == "Insufficient Data" and "incomplete" in s["e4"]["explanation"]
    assert r["unlinked_tracks"] == []
    assert "simulated" in r["note"].lower() and "does not recognise" in r["note"]


def test_attendance_discrepancy_and_not_observed_wording():
    r = A.attendance([ev(1, 7600, 7900)], EMP[:1], {"1": "e1"}, "12:00:00", 0, 9000)  # 12:00 + 7600 s = 14:06:40, outside 12:00-14:00 +/- 10 min? inside tolerance
    assert r["rows"][0]["status"] == "Consistent with the schedule"
    r = A.attendance([ev(1, 9000, 9300)], EMP[:1], {"1": "e1"}, "12:00:00", 0, 9400)  # 14:30
    assert r["rows"][0]["status"].startswith("Discrepancy")
    r = A.attendance([], EMP[:1], {"9": "e1"}, "12:00:00", 0, 3600)
    assert r["rows"][0]["status"] == "Not observed in the monitored area" and "cannot show where" in r["rows"][0]["explanation"]
    with pytest.raises(A.CalibrationError):
        A.attendance([], EMP, {}, "noon", 0, 10)


# ---- calibration -----------------------------------------------------------------------------------------------------
def test_homography_recovers_known_mapping_and_reports_error_in_metres():
    H_true = np.array([[0.02, 0.003, -1.0], [0.0005, 0.04, -2.0], [0.0, 0.0004, 1.0]])
    world = [[0, 0], [10, 0], [10, 6], [0, 6], [5, 3]]
    inv = np.linalg.inv(H_true)
    img = A.project(inv, world).tolist()
    H, cal = A.fit_homography(img, world)
    assert cal["rms_error_m"] < 1e-6 and cal["points"] == 5
    assert np.allclose(A.project(H, [img[4]]), [world[4]], atol=1e-6)
    noisy = [[x + (3 if i == 2 else 0), y] for i, (x, y) in enumerate(img)]
    assert A.fit_homography(noisy, world)[1]["rms_error_m"] > 0.001


def test_swapped_or_mismatched_points_are_refused_but_a_mirrored_view_is_accepted():
    img = [[0, 0], [10, 0], [10, 10], [0, 10]]
    world = [[0, 0], [1, 0], [1, 1], [0, 1]]
    A.fit_homography(img, world)
    with pytest.raises(A.CalibrationError, match="order"):
        A.fit_homography([img[0], img[2], img[1], img[3]], world)
    A.fit_homography(img, [[1 - x, y] for x, y in world])  # seen from the other side of the court: mirrored but consistent, so valid
    cal = A.fit_homography(img + [[5, 5]], world + [[0.9, 0.1]])[1]  # a fifth point matched to the wrong place cannot fold the mapping, but the fit error exposes it
    assert cal["rms_error_m"] > 0.05


@pytest.mark.parametrize("img,world,msg", [
    ([[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 0], [1, 1]], "four"),
    ([[0, 0], [10, 0], [20, 0], [30, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]], "straight line"),
    ([[0, 0], [10, 0], [10, 10], [0, 10]], [[0, 0], [1, 1], [2, 2], [3, 3]], "straight line"),
    ([[0, 0], [0, 0], [10, 10], [0, 10]], [[0, 0], [1, 0], [1, 1], [0, 1]], "same image"),
    ([[0, 0], [10, 0], [10, 10], [0, 10]], [[0, 0], [1, 0], [1, 0], [0, 1]], "same real-world"),
])
def test_bad_calibrations_are_refused_with_a_reason(img, world, msg):
    with pytest.raises(A.CalibrationError, match=msg):
        A.fit_homography(img, world)


# ---- table tennis ------------------------------------------------------------------------------------------------------
def test_ball_segments_split_on_gaps_and_short_ones_are_dropped():
    pts = [{"t": round(i / 30, 3), "x": 100 + i, "y": 100, "src": "colour", "conf": 1.0} for i in range(0, 30)]
    pts += [{"t": round(3 + i / 30, 3), "x": 100 + i, "y": 100, "src": "colour", "conf": 1.0} for i in range(0, 30)]
    pts += [{"t": 6.0, "x": 1, "y": 1, "src": "colour", "conf": 1.0}, {"t": 6.03, "x": 2, "y": 1, "src": "colour", "conf": 1.0}]
    s = A.segments(pts, gap_s=0.5, min_len_s=0.8, min_points=4)
    assert len(s) == 2 and all(len(x) == 30 for x in s)


def test_table_tennis_counts_net_crossings_and_bounce_candidates():
    # corners of the table as an axis-aligned image rectangle scaled 200 px per metre
    corners = [[0, 0], [548, 0], [548, 305], [0, 305]]
    ball = []
    # one stroke: x travels 0 -> 2.5 m (500 px) over 0.5 s with a bounce (image y maximum) at the middle
    for i in range(0, 16):
        t = round(i / 30, 3)
        x = 40 + 30 * i
        y = 150 + (50 - abs(i - 8) * 6)
        ball.append({"t": t, "x": x, "y": y, "src": "colour", "conf": 1})
    an = make_analysis({}, fps=30, ball=ball)
    r = A.table_tennis(an, corners, gap_s=0.2, min_len_s=0.3)
    (seg,) = r["segments"]
    assert seg["net_side_crossings"] == 1 and len(seg["bounce_candidates"]) == 1
    assert seg["label"].startswith("Ball-visible segment") and "experimental" in seg["label"]
    assert r["ball"]["detected_points"] == 16 and "gaps" in r["ball"]["note"]
    assert seg["max_table_plane_speed_ms"] > 0


# ---- basketball -------------------------------------------------------------------------------------------------------
def court_img(x, y):
    return [x * 30 + 50, y * 30 + 40]  # an exactly known mapping: 30 px per metre


def test_basketball_heatmap_distance_and_possession_from_exact_tracks():
    refs = [{"image": court_img(x, y), "world": [x, y]} for x, y in [(0, 0), (28, 0), (28, 15), (0, 15), (14, 7.5)]]
    # one player walks 10 m along y=5 at 2 m/s, sampled at 5 fps; the ball sits in the player's box for 1.0 s
    tr, ball = [], []
    for i in range(0, 26):
        t = round(i * 0.2, 1)
        x = 5 + 2 * t
        fx, fy = court_img(x, 5.5)
        tr.append((t, box_at(fx, fy, 30, 60)))
        if 10 <= i <= 14:
            ball.append({"t": t, "x": fx, "y": fy - 30, "src": "colour", "conf": 1})
    an = make_analysis({1: tr}, fps=5, ball=ball)
    r = A.basketball(an, [x["image"] for x in refs], [x["world"] for x in refs], cell_m=1.0, track_ids=None, min_poss_s=0.6, margin_frac=0.08)
    assert r["calibration"]["rms_error_m"] < 1e-6
    (p,) = r["players"]
    assert p["distance_m"] == pytest.approx(10.0, abs=0.01) and p["observations_on_court"] == 26
    hm = np.array(r["heatmap"]["seconds"])
    assert hm.sum() == pytest.approx(26 * 0.2, abs=1e-6) and hm[5].sum() == pytest.approx(26 * 0.2, abs=1e-6)
    (poss,) = r["possession"]
    assert poss["track_id"] == 1 and poss["label"] == "Potential Possession Event" and poss["start_t"] == 2.0 and poss["end_t"] == 2.8 and poss["duration_s"] == pytest.approx(1.0)


def test_basketball_excludes_tracking_jumps_and_off_court_positions():
    refs = [{"image": court_img(x, y), "world": [x, y]} for x, y in [(0, 0), (28, 0), (28, 15), (0, 15)]]
    tr = [(0.0, box_at(*court_img(5, 5))), (0.2, box_at(*court_img(5.4, 5))), (0.4, box_at(*court_img(20, 5))), (0.6, box_at(*court_img(20.4, 5))), (0.8, box_at(*court_img(80, 5)))]
    r = A.basketball(make_analysis({1: tr}, fps=5), [x["image"] for x in refs], [x["world"] for x in refs], 1.0, None, 0.6, 0.08)
    p = r["players"][0]
    assert p["implausible_jumps_excluded"] == 1 and p["distance_m"] == pytest.approx(0.4 + 0.4, abs=0.01)
    assert r["outside_court_observations"] == 1


def test_basketball_requires_a_valid_calibration():
    with pytest.raises(A.CalibrationError):
        A.basketball(make_analysis({}), [[0, 0]] * 4, [[0, 0], [1, 0], [1, 1], [0, 1]], 1.0, None, 0.6, 0.08)
    assert math.isfinite(A.COURT_L)
