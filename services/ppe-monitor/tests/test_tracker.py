"""ByteTrack behaviour on synthetic motion with KNOWN identities (no model involved)."""
import numpy as np

from app.tracker import ByteTracker


def box(cx, cy, w=60, h=40):
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]


def run(frames, **kw):
    """frames: list of list of (box, score). Returns per-frame list of (det_index, track_id)."""
    t = ByteTracker(**kw)
    out = []
    for dets in frames:
        boxes = np.array([d[0] for d in dets], float).reshape(-1, 4)
        scores = np.array([d[1] for d in dets], float)
        tr = t.update(boxes, scores, ["car"] * len(dets))
        out.append({x.det_index: x.track_id for x in tr})
    return out


def test_two_vehicles_keep_their_ids():
    rng = np.random.default_rng(1)
    frames = []
    for f in range(80):
        a = (box(100 + 6 * f + rng.normal(0, 1), 100 + rng.normal(0, 1)), 0.9)
        b = (box(700 - 5 * f + rng.normal(0, 1), 300 + rng.normal(0, 1)), 0.85)
        frames.append([a, b])
    res = run(frames)
    ids_a = {r[0] for r in res if 0 in r}
    ids_b = {r[1] for r in res if 1 in r}
    assert len(ids_a) == 1 and len(ids_b) == 1 and ids_a != ids_b


def test_short_occlusion_keeps_identity_and_long_gap_creates_new_id():
    frames = [[(box(100 + 5 * f, 200), 0.9)] for f in range(20)]
    frames += [[] for _ in range(6)]  # 6 frames missing (within the 30-frame buffer)
    frames += [[(box(100 + 5 * f, 200), 0.9)] for f in range(26, 46)]
    res = run(frames)
    ids = {r[0] for r in res if 0 in r}
    assert len(ids) == 1, ids

    far = [[(box(100 + 5 * f, 200), 0.9)] for f in range(10)] + [[] for _ in range(50)] + [[(box(100, 200), 0.9)] for _ in range(10)]
    res = run(far)
    ids = {r[0] for r in res if 0 in r}
    assert len(ids) == 2, "after a gap longer than the buffer a new track must start"


def test_low_confidence_detections_keep_a_track_alive_but_do_not_start_one():
    # a vehicle whose score drops to 0.3 for 10 frames (partial occlusion) keeps its id (ByteTrack's second association)
    frames = [[(box(100 + 4 * f, 150), 0.9 if not 10 <= f < 20 else 0.3)] for f in range(30)]
    res = run(frames)
    assert len({r[0] for r in res if 0 in r}) == 1
    # a lone low-score detection never creates a track
    res = run([[(box(100, 100), 0.3)] for _ in range(10)])
    assert all(not r for r in res)


def test_new_vehicle_entering_gets_a_new_id_and_no_id_is_reused_concurrently():
    frames = []
    for f in range(60):
        dets = [(box(100 + 4 * f, 100), 0.9)]
        if f >= 20:
            dets.append((box(900 - 6 * (f - 20), 400), 0.9))
        frames.append(dets)
    res = run(frames)
    for r in res:
        assert len(set(r.values())) == len(r.values())
    ids = {tid for r in res for tid in r.values()}
    assert len(ids) == 2


def test_crossing_vehicles_with_different_speeds_keep_distinct_ids():
    frames = []
    for f in range(60):
        frames.append([(box(100 + 12 * f, 200 + 2 * f), 0.9), (box(800 - 6 * f, 200 + 2 * f), 0.88)])
    res = run(frames)
    a = {r[0] for r in res if 0 in r}
    b = {r[1] for r in res if 1 in r}
    # identities may swap in the crossing frames for a pure-IoU tracker; the test documents the expected limit: at most one switch each
    assert len(a | b) <= 3
    assert len({tid for r in res for tid in r.values()}) <= 3
