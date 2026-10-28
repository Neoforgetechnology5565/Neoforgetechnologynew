"""Unit tests of the association and assessment rules: where PPE boxes may sit, and when 'not detected' may be concluded."""
from app.ppe import HAT, VEST, Assessor, PPEBox, associate

P = [(100.0, 100.0, 200.0, 300.0)]  # one worker, 100 x 200 px


def box(kind, x1, y1, x2, y2, score=0.9, worker=0):
    return PPEBox(kind, score, x1, y1, x2, y2, worker)


def test_hat_must_be_at_the_head_and_vest_on_the_torso():
    ok = [box(HAT, 125, 98, 175, 140), box(VEST, 110, 150, 190, 230)]
    assert len(associate(P, ok, 0.3)) == 2
    assert associate(P, [box(HAT, 125, 200, 175, 240)], 0.3) == []             # a "hat" at the waist is rejected
    assert associate(P, [box(VEST, 125, 98, 175, 120)], 0.3) == []             # a "vest" at the head is rejected
    assert associate(P, [box(VEST, 130, 160, 150, 180)], 0.3) == []            # a tiny "vest" is rejected
    assert associate(P, [box(HAT, 400, 100, 450, 140)], 0.3) == []             # outside the worker box


def test_one_item_of_each_kind_per_worker_and_shared_boxes_are_kept_once():
    two = [box(HAT, 125, 98, 175, 140, 0.9), box(HAT, 120, 100, 170, 142, 0.6)]
    assert [b.score for b in associate(P, two, 0.3)] == [0.9]
    persons = [(100.0, 100.0, 200.0, 300.0), (150.0, 100.0, 250.0, 300.0)]  # overlapping neighbours see the same hat
    same = [box(HAT, 160, 98, 190, 140, 0.9, 0), box(HAT, 161, 99, 191, 141, 0.7, 1)]
    assert len(associate(persons, same, 0.3)) == 1


def test_low_scores_are_dropped():
    assert associate(P, [box(HAT, 125, 98, 175, 140, 0.2)], 0.3) == []


def test_single_image_absence_is_a_potential_violation_only_with_a_good_view():
    a = Assessor(("hard_hat", "safety_vest"), smooth=False)
    hat_only = [box(HAT, 125, 98, 175, 140)]
    good = a.reliability(0, P, [0.9], 640, 480)
    assert good == []
    r = a.assess(0, None, hat_only, good, 0.4, True)
    assert r["status"] == "potential_violation" and r["reasons"] == ["safety vest not detected"]
    bad = a.reliability(0, P, [0.3], 640, 480)               # low worker-detection confidence
    r = a.assess(0, None, hat_only, bad, 0.4, True)
    assert r["status"] == "uncertain" and "low worker-detection confidence" in r["reasons"]
    weak = [box(HAT, 125, 98, 175, 140), box(VEST, 110, 150, 190, 230, 0.35)]
    r = a.assess(0, None, weak, good, 0.4, True)              # a weak vest detection is not "absent"
    assert r["status"] == "uncertain"


def test_poor_views_are_named():
    a = Assessor(("hard_hat", "safety_vest"))
    assert "worker too small in the frame" in a.reliability(0, [(0.0, 50.0, 30.0, 100.0)], [0.9], 640, 480)
    assert "head cut off by the frame edge" in a.reliability(0, [(10.0, 0.0, 110.0, 200.0)], [0.9], 640, 480)
    crowd = [(100.0, 100.0, 200.0, 300.0), (120.0, 100.0, 220.0, 300.0)]
    assert "worker partly hidden by another worker" in a.reliability(0, crowd, [0.9, 0.9], 640, 480)


def test_smoothing_needs_consistent_evidence_before_concluding():
    a = Assessor(("hard_hat", "safety_vest"))
    full = [box(HAT, 125, 98, 175, 140), box(VEST, 110, 150, 190, 230)]
    states = [a.assess(0, 7, full, [], 0.4, True)["status"] for _ in range(8)]
    assert states[0] == "uncertain" and states[-1] == "compliant"
    # a single missed frame does not flip a long-compliant worker
    assert a.assess(0, 7, [], [], 0.4, True)["status"] == "compliant"
    # a worker whose vest is absent for many consecutive good-view frames is flagged, but only after enough observations
    b = Assessor(("hard_hat", "safety_vest"))
    hat = [box(HAT, 125, 98, 175, 140)]
    seq = [b.assess(0, 9, hat, [], 0.4, True)["status"] for _ in range(8)]
    assert seq[0] == "uncertain" and seq[-1] == "potential_violation" and "potential_violation" not in seq[:4]


def test_nothing_required_is_reported_as_uncertain_not_compliant():
    a = Assessor((), smooth=False)
    assert a.assess(0, None, [], [], 0.4, True)["status"] == "uncertain"
