import numpy as np
import pytest

from app.classify import GroundModel
from app.cloud import Units
from app.measure import MeasureError, measure
from app.wires import Wire

M = Units("metre", "metre", None, "test")
U = Units()  # unknown


def wire(wid, p0, p1, sag=0.0):
    p0, p1 = np.array(p0, float), np.array(p1, float)
    d = p1[:2] - p0[:2]
    L = float(np.linalg.norm(d))
    u = d / L
    # z(s) = z0 + (z1-z0) s/L - 4 sag (s/L)(1 - s/L)  ->  quadratic in s
    c2 = 4 * sag / L ** 2
    c1 = (p1[2] - p0[2]) / L - 4 * sag / L
    return Wire(wid, np.array([p0[0], p0[1], 0.0]), u, 0.0, L, np.array([p0[2], c1, c2]), np.arange(10), 0.02, 0.05, 1.0, "strong", "parabola" if sag else "line")


def run(kind, a, b, units=M, wires=None, xyz=None, labels=None, ground=None, thr=None):
    return measure(kind, a, b, units, wires or {}, xyz if xyz is not None else np.zeros((1, 3)), labels, ground, "test ground", thr)


def pt(x, y, z):
    return {"kind": "point", "xyz": [x, y, z]}


def test_point_point_exact_with_components():
    r = run("auto", pt(0, 0, 0), pt(3, 4, 12))
    assert r["type"] == "point_point" and r["value"] == pytest.approx(13.0) and r["components"] == {"horizontal": pytest.approx(5.0), "vertical": pytest.approx(12.0)}
    assert r["unit"] == "m" and r["value_m"] == pytest.approx(13.0) and r["status"] == "ok"


def test_perpendicular_to_the_curve_is_not_the_nearest_support_point():
    w = wire("W1", [0, 0, 20], [100, 0, 20])
    xyz = np.zeros((20, 3))
    xyz[w.support] = np.array([[5 + i * 10, 0, 20] for i in range(10)])  # support points every 10 m
    r = run("auto", pt(50, 3, 24), {"kind": "wire", "id": "W1"}, wires={"W1": w}, xyz=np.vstack([xyz, np.zeros((10, 3))]))
    assert r["type"] == "point_wire" and r["value"] == pytest.approx(5.0, abs=1e-3)  # 3 horizontal, 4 vertical -> 5 to the fitted line
    assert r["components"]["nearest_support_point_distance"] == pytest.approx(np.hypot(5, 5), abs=1e-6)  # to the nearest measured point: a different, larger number
    assert r["closest_points"][1] == pytest.approx([50, 0, 20], abs=1e-3)


def test_wire_wire_nearest_approach_for_parallel_and_crossing_wires():
    a, b = wire("W1", [0, 0, 20], [100, 0, 20]), wire("W2", [0, 4, 23], [100, 4, 23])
    r = run("auto", {"kind": "wire", "id": "W1"}, {"kind": "wire", "id": "W2"}, wires={"W1": a, "W2": b})
    assert r["type"] == "wire_wire" and r["value"] == pytest.approx(5.0, abs=1e-3) and r["components"]["vertical"] == pytest.approx(3.0, abs=1e-3)
    c = wire("W3", [50, -20, 26], [50, 20, 26])  # passes 6 m above W1
    r2 = run("auto", {"kind": "wire", "id": "W1"}, {"kind": "wire", "id": "W3"}, wires={"W1": a, "W3": c})
    assert r2["value"] == pytest.approx(6.0, abs=1e-3)
    with pytest.raises(MeasureError, match="two different"):
        run("auto", {"kind": "wire", "id": "W1"}, {"kind": "wire", "id": "W1"}, wires={"W1": a})


def test_wire_ground_is_a_vertical_clearance_at_the_minimum():
    flat = GroundModel(0.0, 0.0, 1.0, np.full((100, 120), 2.0))
    w = wire("W1", [0, 50, 20], [100, 50, 20], sag=4.0)  # lowest point 16 m at mid-span
    r = run("auto", {"kind": "wire", "id": "W1"}, {"kind": "ground"}, wires={"W1": w}, ground=flat)
    assert r["type"] == "wire_ground" and r["value"] == pytest.approx(16.0 - 2.0, abs=0.02) and "vertical" in r["method"] and "not a 3D distance" in r["method"]
    assert r["closest_points"][0][0] == pytest.approx(50, abs=0.2)
    with pytest.raises(MeasureError, match="No ground model"):
        run("auto", {"kind": "wire", "id": "W1"}, {"kind": "ground"}, wires={"W1": w})
    assert run("auto", pt(10, 10, 9), {"kind": "ground"}, ground=flat)["value"] == pytest.approx(7.0)


def test_wire_object_distance_uses_the_selected_points_only():
    w = wire("W1", [0, 0, 20], [100, 0, 20])
    roof = np.c_[np.random.default_rng(0).uniform(40, 60, 500), np.random.default_rng(1).uniform(-5, 5, 500), np.full(500, 14.0)]
    far = np.array([[0, 0, 0.0], [100, 0, 0.0]])
    xyz = np.vstack([np.zeros((10, 3)), roof, far])
    labels = np.r_[np.zeros(10), np.full(500, 3), np.zeros(2)].astype(np.uint8)
    r = run("auto", {"kind": "wire", "id": "W1"}, {"kind": "object", "label": 3}, wires={"W1": w}, xyz=xyz, labels=labels)
    assert r["type"] == "wire_object" and r["value"] == pytest.approx(6.0, abs=0.02) and r["components"]["vertical_wire_minus_object"] == pytest.approx(6.0, abs=0.02)
    r2 = run("auto", {"kind": "wire", "id": "W1"}, {"kind": "object", "label": 3, "near": [41, 0, 14], "radius": 3}, wires={"W1": w}, xyz=xyz, labels=labels)
    assert r2["value"] >= r["value"] - 1e-6 and "sampled by the scanner" in " ".join(r2["notes"])
    with pytest.raises(MeasureError, match="no points"):
        run("auto", {"kind": "wire", "id": "W1"}, {"kind": "object", "label": 9}, wires={"W1": w}, xyz=xyz, labels=labels)
    with pytest.raises(MeasureError, match="Classify"):
        run("auto", {"kind": "wire", "id": "W1"}, {"kind": "object", "label": 3}, wires={"W1": w}, xyz=xyz, labels=None)


def test_unknown_units_are_never_converted_and_the_result_says_so():
    r = run("auto", pt(0, 0, 0), pt(3, 4, 0), units=U)
    assert r["value"] == 5.0 and r["unit"] == "coordinate units" and "value_m" not in r and r["status"] == "units_unknown" and "not been converted to metres" in r["notes"][0]
    ft = Units("foot", "foot", None, "test")
    r = run("auto", pt(0, 0, 0), pt(30, 40, 0), units=ft)
    assert r["value"] == 50.0 and r["unit"] == "ft" and r["value_m"] == pytest.approx(15.24)


def test_thresholds_are_user_criteria_and_never_regulatory():
    r = run("auto", pt(0, 0, 0), pt(0, 0, 5.0), thr={"value": 4.5, "unit": "m"})
    assert r["threshold_check"]["status"] == "meets" and "not a regulatory" in r["threshold_check"]["note"]
    assert run("auto", pt(0, 0, 0), pt(0, 0, 4.0), thr={"value": 4.5, "unit": "m"})["threshold_check"]["status"] == "below"
    assert run("auto", pt(0, 0, 0), pt(0, 0, 5.0), thr={"value": 20, "unit": "ft"})["threshold_check"]["status"] == "below"
    unk = run("auto", pt(0, 0, 0), pt(0, 0, 5.0), units=U, thr={"value": 4.5, "unit": "m"})
    assert unk["threshold_check"]["status"] == "not_evaluated"
    assert run("auto", pt(0, 0, 0), pt(0, 0, 5.0), units=U, thr={"value": 4.0, "unit": "coordinate"})["threshold_check"]["status"] == "meets"
    with pytest.raises(MeasureError, match="numeric"):
        run("auto", pt(0, 0, 0), pt(0, 0, 5.0), thr={"unit": "m"})


@pytest.mark.parametrize("a,b", [({"kind": "point", "xyz": [1, 2]}, {"kind": "point", "xyz": [0, 0, 0]}), ({"kind": "point", "xyz": [float("nan"), 0, 0]}, {"kind": "point", "xyz": [0, 0, 0]}), ({"kind": "ground"}, {"kind": "ground"}), ({"kind": "wire", "id": "Wx"}, {"kind": "point", "xyz": [0, 0, 0]})])
def test_invalid_selectors_are_rejected(a, b):
    with pytest.raises(MeasureError):
        run("auto", a, b)
