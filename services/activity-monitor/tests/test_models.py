"""Models on real footage: the bundled OpenCV pedestrian clip."""
import numpy as np

from app.activity import FallParams, Sample, detect_falls, pose_ok, torso
from app.pose import BONES, LH, LS, RH, RS
from tests.skeleton import skeleton


def test_detector_finds_the_pedestrians(models, sample_frame):
    det, _ = models
    boxes, scores = det(sample_frame, score_thr=0.4)
    assert 4 <= len(boxes) <= 9 and (scores >= 0.4).all()
    h = boxes[:, 3] - boxes[:, 1]
    assert (h > 40).all() and (h < 200).all()       # pedestrians are 60-130 px tall in this frame


def test_pose_lands_on_the_people(models, sample_frame):
    det, pose = models
    boxes, _ = det(sample_frame, score_thr=0.5)
    n_ok = 0
    for b in boxes:
        kp, presence = pose(sample_frame, b)
        core = kp[[LS, RS, LH, RH]]
        inside = ((core[:, 0] > b[0] - 10) & (core[:, 0] < b[2] + 10) & (core[:, 1] > b[1] - 10) & (core[:, 1] < b[3] + 10)).all()
        tilt, length, _ = torso(kp)
        n_ok += bool(inside and tilt < 25 and pose_ok(kp, 0.5) and 0.15 * (b[3] - b[1]) < length < 0.5 * (b[3] - b[1]))  # walking people are upright
    assert len(boxes) >= 4 and n_ok >= len(boxes) - 1


def test_real_keypoints_rotated_into_a_fall_are_found(models, sample_frame):
    """Real pose noise, synthetic motion: one detected person's keypoints are rotated about the ankles from upright to lying."""
    det, pose = models
    b = max(det(sample_frame, score_thr=0.5)[0], key=lambda x: x[3] - x[1])
    kp0, _ = pose(sample_frame, b)
    ank = (kp0[27, :2] + kp0[28, :2]) / 2
    samples = []
    for i in range(14):
        t = i / 5
        ang = 0 if t < 1.0 else min(90, 90 * (t - 1.0) / 0.6)
        r = np.radians(ang)
        R = np.array([[np.cos(r), -np.sin(r)], [np.sin(r), np.cos(r)]])
        kp = kp0.copy()
        kp[:, :2] = (kp0[:, :2] - ank) @ R.T + ank
        xs, ys = kp[:, 0], kp[:, 1]
        samples.append(Sample(t, (float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())), 0.9, kp))
    c = detect_falls({7: samples}, FallParams(min_upright_s=0.5), 3)
    assert len(c) == 1 and c[0].tracks == [7]
