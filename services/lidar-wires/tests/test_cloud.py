import io

import numpy as np
import pytest

from app.cloud import CloudError, PointCloud, Units, bounds, read_any, read_las, read_pcd, read_ply, read_text, write_ply
from conftest import flat_scene, las_bytes

LIMIT = 1_000_000


def test_ply_roundtrip_keeps_double_precision_and_attributes():
    xyz = flat_scene(500) + [544_000.123456, 4_178_000.654321, 90.5]  # UTM-scale coordinates: float32 would lose centimetres
    pc = PointCloud(xyz, np.random.default_rng(0).integers(0, 255, (500, 3), dtype=np.uint8), np.arange(500, dtype=np.float32), np.full(500, 2, np.uint8))
    out = read_any(write_ply(pc, np.full(500, 3, np.uint8)), "a.ply", LIMIT)
    assert np.array_equal(out.xyz, xyz) and np.array_equal(out.rgb, pc.rgb) and np.array_equal(out.classification, pc.classification) and out.intensity[10] == 10
    assert out.units.known is False


def test_ply_ascii_and_defects():
    txt = "ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n1 2 3 10 20 30\n4 5 6 1 2 3\n7 8 9 0 0 0\n"
    pc = read_ply(txt.encode(), LIMIT)
    assert pc.xyz.tolist() == [[1, 2, 3], [4, 5, 6], [7, 8, 9]] and pc.rgb[0].tolist() == [10, 20, 30]
    with pytest.raises(CloudError, match="empty"):
        read_ply(b"ply\nformat ascii 1.0\nelement vertex 0\nproperty float x\nproperty float y\nproperty float z\nend_header\n", LIMIT)
    with pytest.raises(CloudError, match="truncated"):
        read_ply(write_ply(PointCloud(flat_scene(100)))[:-50], LIMIT)
    with pytest.raises(CloudError, match="no x, y, z"):
        read_ply(b"ply\nformat ascii 1.0\nelement vertex 1\nproperty float a\nend_header\n1\n", LIMIT)
    with pytest.raises(CloudError, match="limit"):
        read_ply(write_ply(PointCloud(flat_scene(100))), 50)
    with pytest.raises(CloudError, match="numbers"):
        read_ply(b"ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 two 3\n", LIMIT)


def test_non_finite_points_are_dropped_and_reported():
    xyz = flat_scene(10)
    xyz[3, 1] = np.nan
    xyz[7, 2] = np.inf
    pc = read_ply(write_ply(PointCloud(xyz)), LIMIT)
    assert len(pc) == 8 and pc.info["dropped_non_finite"] == 2
    allbad = np.full((4, 3), np.nan)
    with pytest.raises(CloudError, match="no valid points"):
        read_ply(write_ply(PointCloud(allbad)), LIMIT)


def test_pcd_ascii_and_binary():
    asc = "# .PCD v0.7\nVERSION 0.7\nFIELDS x y z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH 2\nHEIGHT 1\nPOINTS 2\nDATA ascii\n1 2 3 0.5\n4 5 6 0.7\n"
    pc = read_any(asc.encode(), "x.pcd", LIMIT)
    assert pc.xyz.tolist() == [[1, 2, 3], [4, 5, 6]] and np.allclose(pc.intensity, [0.5, 0.7])
    head = "VERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 2\nHEIGHT 1\nPOINTS 2\nDATA binary\n".encode()
    body = np.array([[1, 2, 3], [4, 5, 6]], "<f4").tobytes()
    assert read_pcd(head + body, LIMIT).xyz.tolist() == [[1, 2, 3], [4, 5, 6]]
    with pytest.raises(CloudError, match="truncated"):
        read_pcd(head + body[:-3], LIMIT)
    with pytest.raises(CloudError, match="binary_compressed|Only ASCII"):
        read_pcd(head.replace(b"DATA binary", b"DATA binary_compressed") + body, LIMIT)


def test_text_formats():
    assert read_text(b"1 2 3\n4 5 6\n", LIMIT).xyz.shape == (2, 3)
    pc = read_text(b"x,y,z,intensity,classification\n1,2,3,100,2\n4,5,6,200,5\n", LIMIT)
    assert pc.intensity.tolist() == [100, 200] and pc.classification.tolist() == [2, 5]
    pc = read_text(b"# comment\n1 2 3 255 0 0\n4 5 6 0 255 0\n", LIMIT)
    assert pc.rgb[0].tolist() == [255, 0, 0] and pc.intensity is None
    pc = read_text(b"1;2;3;0.1;0.2;0.3\n", LIMIT)
    assert pc.rgb[0].tolist() == [25, 51, 76]  # 0-1 colours are scaled
    for bad, msg in ((b"", "empty"), (b"1 2\n3 4\n", "three numeric"), (b"1 2 3\n4 five 6\n", "numeric"), (b"a,b,c\n1,2,3\n", "x, y and z"), (b"x y z\n", "no points"), (b"\xff\xfe\x00\x01" * 8, "not valid UTF-8")):
        with pytest.raises(CloudError, match=msg):
            read_text(bad, LIMIT)


def test_las_units_from_the_header_and_never_assumed():
    xyz = flat_scene(300) + [300000.0, 5000000.0, 100.0]
    m = read_las(las_bytes(xyz, 9001, 9001, crs_code=32610), LIMIT)
    assert m.units.known and m.units.horizontal == "metre" and m.units.crs == "EPSG:32610" and np.allclose(m.xyz, xyz, atol=0.0006)
    f = read_las(las_bytes(xyz, 9002, 9002), LIMIT)
    assert f.units.horizontal == "foot" and f.units.known and abs(f.units.per_metre() - 1 / 0.3048) < 1e-9
    us = read_las(las_bytes(xyz, 9003, 9003), LIMIT)
    assert us.units.horizontal == "us-foot" and abs(1 / us.units.per_metre() - 1200 / 3937) < 1e-12
    none = read_las(las_bytes(xyz), LIMIT)
    assert not none.units.known and none.units.horizontal == "unknown" and none.units.label() == "coordinate units"
    mix = read_las(las_bytes(xyz, 9002, 9001), LIMIT)
    assert not mix.units.known and any("mix units" in n for n in mix.units.notes)
    novert = read_las(las_bytes(xyz, 9001), LIMIT)
    assert not novert.units.known and any("vertical unit is not stated" in n for n in novert.units.notes)
    utm = read_las(las_bytes(xyz, None, None, crs_code=32610), LIMIT)
    assert utm.units.horizontal == "metre" and not utm.units.known  # horizontal known from the zone, vertical still not stated


def test_las_attributes_and_labels():
    xyz = flat_scene(100)
    cls = np.r_[np.full(50, 2), np.full(50, 5)].astype(np.uint8)
    pc = read_las(las_bytes(xyz, rgb=np.full((100, 3), 128, np.uint8), cls=cls, intensity=np.arange(100, dtype=np.uint16)), LIMIT)
    assert pc.classification.tolist() == cls.tolist() and pc.rgb[0].tolist() == [128, 128, 128] and pc.intensity[5] == 5
    assert read_las(las_bytes(xyz, cls=np.zeros(100, np.uint8)), LIMIT).classification is None  # all "never classified" = no labels
    with pytest.raises(CloudError, match="limit"):
        read_las(las_bytes(xyz), 10)
    with pytest.raises(CloudError, match="truncated|could not be read"):
        read_las(las_bytes(xyz)[:300], LIMIT)


def test_the_content_decides_the_format():
    for junk in (b"PK\x03\x04" + b"0" * 100, b"\x7fELF" + b"0" * 100, b"%PDF-1.4" + b"0" * 100, b"\xff\xd8\xff" + b"0" * 100):
        with pytest.raises(CloudError, match="Unsupported file"):
            read_any(junk, "a.ply", LIMIT)
    with pytest.raises(CloudError, match="content is text"):
        read_any(b"1 2 3\n", "points.laz", LIMIT)
    assert read_any(b"1 2 3\n", "points.txt", LIMIT).xyz.shape == (1, 3)


def test_bounds():
    b = bounds(np.array([[0, 1, 2], [4, 5, 9.0]]))
    assert b["min"] == [0, 1, 2] and b["extent"] == [4, 4, 7]
