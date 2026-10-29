import numpy as np

from app.stats import grid_shape, heatmap, in_pitch, possession_candidates, track_stats

DT = 0.2


def line(speed, n=50, jitter=0.0, seed=0):
    t = np.arange(n) * DT
    rng = np.random.default_rng(seed)
    xy = np.c_[10 + speed * t, np.full(n, 30.0)] + rng.normal(0, jitter, (n, 2))
    return t, xy


def test_constant_speed_distance_and_speeds():
    t, xy = line(4.0)
    st = track_stats(t, xy * 10, xy, DT, 105, 68)
    p = st["pitch"]
    assert p["status"] == "ok"
    # the 1 s smoothing window truncates at the track ends, so distance is slightly underestimated (about speed x 0.4 s per end)
    assert 4.0 * (t[-1] - t[0]) - 3.0 < p["distance_m"] <= 4.0 * (t[-1] - t[0]) + 0.1
    assert abs(p["avg_speed_ms"] - 4.0) < 0.3 and abs(p["max_speed_ms"] - 4.0) < 0.3
    assert st["image_distance_px"] > 0 and st["observed_seconds"] == round(50 * DT, 2)


def test_jitter_does_not_inflate_distance_for_a_standing_player():
    t, xy = line(0.0, n=120, jitter=0.4)
    p = track_stats(t, xy, xy, DT, 105, 68)["pitch"]
    raw = float(np.hypot(*np.diff(xy, axis=0).T).sum())
    assert p["distance_m"] < 0.35 * raw  # smoothing removes most of the jitter distance
    assert p["max_speed_ms"] is None or p["max_speed_ms"] < 3.0


def test_implausible_jumps_are_excluded_and_counted():
    t, xy = line(1.0, n=30)
    xy[15:] += [40.0, 0.0]  # a tracking identity swap: a 40 m jump in one step
    p = track_stats(t, xy, xy, DT, 105, 68)["pitch"]
    assert p["excluded_segments"] >= 1 and p["distance_m"] < 12


def test_gaps_are_not_bridged():
    t, xy = line(2.0, n=40)
    keep = np.r_[0:10, 30:40]  # 4 s without observations
    p = track_stats(t[keep], xy[keep], xy[keep], DT, 105, 68)["pitch"]
    assert p["distance_m"] < 2.0 * (t[9] - t[0] + t[39] - t[30]) + 1.0


def test_unmapped_or_off_pitch_gives_no_pitch_numbers():
    t, xy = line(1.0, n=20)
    nanxy = np.full_like(xy, np.nan)
    assert track_stats(t, xy, nanxy, DT, 105, 68)["pitch"]["status"] == "insufficient"
    assert track_stats(t, xy, None, DT, 105, 68)["pitch"] is None
    assert not in_pitch(-5, 10, 105, 68) and in_pitch(-2, 10, 105, 68)


def test_zone_seconds_sum_to_observed_time():
    t, xy = line(1.0, n=100)
    st = track_stats(t, xy, xy, DT, 105, 68)
    assert abs(sum(st["zone_seconds"]) - 100 * DT) < 0.5


def test_heatmap_is_normalised_and_located():
    pts = np.array([[20.0, 10.0]] * 40 + [[80.0, 50.0]] * 10)
    g = heatmap(pts, None, 105, 68)
    assert g.shape == grid_shape(105, 68) and abs(g.max() - 1.0) < 1e-12
    iy, ix = np.unravel_index(g.argmax(), g.shape)
    assert abs((ix + 0.5) * 2 - 20) <= 2 and abs((iy + 0.5) * 2 - 10) <= 2
    assert g[25, 40] > 0.1 and g[25, 40] < g.max()  # the smaller cluster is visible but weaker
    assert g[0, -1] < 1e-3 and g.min() >= 0
    assert heatmap(np.zeros((0, 2)), None, 105, 68).max() == 0.0  # no data -> no map


def frame(t, players, ball):
    return {"t": t, "p": players, "b": ball}


def test_possession_candidate_requires_observed_ball_and_clear_nearest_player():
    ply = lambda i, x: [i, x - 20, 100, x + 20, 200, 0.9, "team_a", None, None]  # 100 px tall person, foot at y=200
    fr = [frame(i * DT, [ply(1, 300), ply(2, 700)], [300, 190, 0.8, "observed", None, None]) for i in range(5)]
    ev = possession_candidates(fr, DT)
    assert len(ev) == 1 and ev[0]["track_id"] == 1 and ev[0]["kind"] == "possession_candidate" and "not validated" in ev[0]["basis"]
    est = [frame(i * DT, [ply(1, 300)], [300, 190, None, "estimated", None, None]) for i in range(5)]
    assert possession_candidates(est, DT) == []  # estimated positions never create candidates
    far = [frame(i * DT, [ply(1, 300)], [600, 190, 0.8, "observed", None, None]) for i in range(5)]
    assert possession_candidates(far, DT) == []
    ambiguous = [frame(i * DT, [ply(1, 290), ply(2, 330)], [310, 190, 0.8, "observed", None, None]) for i in range(5)]
    assert possession_candidates(ambiguous, DT) == []  # two players equally close: no candidate
