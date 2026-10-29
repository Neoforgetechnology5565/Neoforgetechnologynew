import numpy as np
import pytest

from app import classify as cl
from app.cloud import read_las
from app.wires import WireParams, detect, split_spans
from conftest import flat_scene


@pytest.fixture(scope="module")
def scene(corridor):
    pc = read_las(corridor[0], 5_000_000)
    lab, info, gm, hag = cl.heuristic(pc, 1.0, 2.0, 0.3, 1.5)
    return pc, lab, info, gm, hag, corridor[1]


def truth_dist(P, w):
    p0, p1 = np.array(w["p0"]), np.array(w["p1"])
    d = p1 - p0
    t = np.clip(((P[:, :2] - p0[:2]) @ d[:2]) / (d[:2] ** 2).sum(), 0, 1)
    z = p0[2] + t * d[2] - 4 * w["sag"] * t * (1 - t)
    return np.sqrt(((P[:, :2] - (p0[:2] + t[:, None] * d[:2])) ** 2).sum(1) + (P[:, 2] - z) ** 2)


def test_heuristic_ground_matches_the_known_terrain(scene):
    pc, lab, info, gm, hag, truth = scene
    x, y = pc.xyz[:, 0], pc.xyz[:, 1]
    tz = 3.0 + 0.012 * x + 0.008 * y + 1.6 * np.sin(x / 31.0) * np.cos(y / 23.0)
    g = lab == cl.GROUND
    assert np.sqrt(np.mean((pc.xyz[g, 2] - tz[g]) ** 2)) < 0.06  # ground-labelled points lie on the true terrain
    assert g.sum() > 0.95 * 96000  # and nearly all true ground points were found
    elevated = pc.xyz[:, 2] - tz > 3
    assert np.sqrt(np.mean((hag - (pc.xyz[:, 2] - tz))[~elevated & (pc.xyz[:, 2] - tz < 1)] ** 2)) < 0.1
    assert info["source"] == "heuristic" and "not a trained" in info["kind"] and set(info["rules"]) >= {"ground-like", "vegetation-like", "structure-like"}


def test_heuristic_classes_are_plausible_for_known_objects(scene):
    pc, lab, _, _, hag, truth = scene
    xyz = pc.xyz
    for b in truth["buildings"]:
        roof = (xyz[:, 0] > b["x"][0]) & (xyz[:, 0] < b["x"][1]) & (xyz[:, 1] > b["y"][0]) & (xyz[:, 1] < b["y"][1]) & (np.abs(xyz[:, 2] - b["roof_z"]) < 0.1)
        assert (lab[roof] == cl.STRUCTURE).mean() > 0.8  # flat roofs are structure-like (roof points at the edges, next to walls, can read as scattered)
    t = truth["trees"][-1]  # the tall tree
    crown = (np.hypot(xyz[:, 0] - t["centre"][0], xyz[:, 1] - t["centre"][1]) < t["radius"]) & (hag > 3)
    assert (lab[crown] == cl.VEGETATION).mean() > 0.7  # a crown is scattered, not planar
    assert (lab == cl.WIRE).sum() == 0  # wire candidates exist only after wire detection


def test_all_wires_are_found_with_correct_geometry_and_nothing_else(scene):
    pc, lab, _, gm, hag, truth = scene
    wires, diag = detect(pc.xyz, hag, lab, WireParams.metres(1.0))
    assert len(wires) == len(truth["wires"]) == 9
    used = set()
    for w in wires:
        P = pc.xyz[w.support]
        d = np.stack([truth_dist(P, t) for t in truth["wires"]], 1)
        best = int(np.bincount(d.argmin(1)).argmax())
        assert (d[:, best] < 0.25).mean() > 0.98, w.id  # every supporting point lies on ONE true wire
        assert best not in used
        used.add(best)
        t = truth["wires"][best]
        ends = np.array([w.point(w.s0), w.point(w.s1)])
        te = np.array([t["p0"], t["p1"]])
        # endpoints within ten metres of the towers (the first/last returns lie inside the span), and the fitted curve within 10 cm of the truth
        cs = w.samples(1.0)
        a, b = np.array(t["p0"])[:2], np.array(t["p1"])[:2]
        tt = ((cs[:, :2] - a) @ (b - a)) / ((b - a) @ (b - a))
        inside = cs[(tt >= 0) & (tt <= 1)]  # a fitted span may overhang the tower by a metre or two (the neighbouring span's first returns); compare inside the true span
        assert len(inside) > 0.9 * len(cs) - 3 and truth_dist(inside, t).max() < 0.15, w.id
        assert min(np.linalg.norm(ends[0] - te[0]), np.linalg.norm(ends[0] - te[1])) < 10 and min(np.linalg.norm(ends[1] - te[0]), np.linalg.norm(ends[1] - te[1])) < 10
        L_true = float(np.hypot(*(np.array(t["p1"]) - np.array(t["p0"]))[:2]))
        expected = t["sag"] * ((w.s1 - w.s0) / L_true) ** 2  # the detected span ends at the first/last return, a little inside the towers; sag over a sub-span of a parabola scales with length squared
        assert abs(w.sag() - expected) < 0.12 * t["sag"] + 0.05, (w.id, w.sag(), expected)
        assert w.rms < 0.08 and w.quality in ("strong", "moderate")
    assert len(used) == 9
    assert diag["wires_found"] == 9


def test_vertical_poles_tower_legs_and_crossarms_are_not_reported_as_wires(scene):
    pc, lab, _, gm, hag, truth = scene
    wires, _ = detect(pc.xyz, hag, lab, WireParams.metres(1.0))
    for tw in truth["towers"]:
        near = [w for w in wires if min(np.linalg.norm(w.point(w.s0)[:2] - [tw["x"], tw["y"]]), np.linalg.norm(w.point(w.s1)[:2] - [tw["x"], tw["y"]])) < 1.0 and w.length() < 12]
        assert not near, "a tower element was reported as a wire"
    assert all(w.length() >= 10 for w in wires)


def test_no_wires_in_a_scene_without_any_and_the_reason_is_given():
    rng = np.random.default_rng(3)
    ground = flat_scene(30000, 1, 80.0)
    tree = np.c_[rng.normal(40, 2.0, (3000, 1)), rng.normal(40, 2.0, (3000, 1)), 8 + rng.normal(0, 1.5, (3000, 1))]
    from app.cloud import PointCloud
    pc = PointCloud(np.vstack([ground, tree]))
    lab, _, gm, hag = cl.heuristic(pc, 1.0, 2.0, 0.3, 1.5)
    wires, diag = detect(pc.xyz, hag, lab, WireParams.metres(1.0))
    assert wires == [] and "reason" in diag and ("could not" in diag["reason"] or "No line-like" in diag["reason"] or "Only" in diag["reason"])


def test_sparse_data_is_reported_as_too_sparse_instead_of_guessing(scene):
    pc, lab, _, gm, hag, truth = scene
    keep = np.random.default_rng(0).random(len(pc)) < 0.03  # 3% of the points: wire returns about 1 per 15 m
    wires, diag = detect(pc.xyz[keep], hag[keep], lab[keep], WireParams.metres(1.0))
    assert len(wires) == 0 and "reason" in diag


def test_noisy_wires_degrade_gracefully_and_never_produce_chimeras(corridor, tmp_path):
    """Add 15 cm of noise to every elevated point: fewer wires may be found, but those that are found must still be real."""
    pc = read_las(corridor[0], 5_000_000)
    lab, _, gm, hag = cl.heuristic(pc, 1.0, 2.0, 0.3, 1.5)
    truth = corridor[1]
    rng = np.random.default_rng(5)
    xyz = pc.xyz.copy()
    hi = hag > 3
    xyz[hi] += rng.normal(0, 0.15, (hi.sum(), 3))
    wires, _ = detect(xyz, hag, lab, WireParams.metres(1.0))
    for w in wires:
        P = pc.xyz[w.support]
        d = np.stack([truth_dist(P, t) for t in truth["wires"]], 1)
        assert (d.min(1) < 0.6).mean() > 0.9, "a reported wire does not follow any true wire"


def test_split_spans_separates_two_consecutive_parabolas():
    s = np.linspace(0, 160, 300)
    z = np.where(s < 80, 25 - 4 * 2 * (s / 80) * (1 - s / 80) * 2.0, 25 - 4 * 2 * ((s - 80) / 80) * (1 - (s - 80) / 80) * 2.0)
    parts = split_spans(s, z + np.random.default_rng(0).normal(0, 0.03, len(s)), 0.25)
    assert len(parts) == 2 and abs(s[parts[0]].max() - 80) < 8
    one = np.linspace(0, 80, 200)
    assert len(split_spans(one, 25 - 8 * (one / 80) * (1 - one / 80), 0.25)) == 1


def test_provided_labels_are_used_and_mapped_transparently(corridor):
    from app.cloud import PointCloud
    rng = np.random.default_rng(0)
    xyz = flat_scene(5000, 0, 40.0)
    cls = rng.choice([2, 3, 5, 6, 14, 18], 5000).astype(np.uint8)
    pc = PointCloud(xyz, classification=cls)
    lab, info = cl.from_provided(pc)
    assert info["source"] == "provided" and (lab[cls == 2] == cl.GROUND).all() and (lab[cls == 14] == cl.WIRE).all() and (lab[cls == 18] == cl.UNCLASSIFIED).all() and (lab[cls == 5] == cl.VEGETATION).all()
    gm, hag = cl.ground_from_labels(xyz, lab == cl.GROUND, 4.0)
    assert np.abs(hag[cls == 2]).max() < 0.2
