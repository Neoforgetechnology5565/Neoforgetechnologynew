"""Point cloud I/O and geometry operations, checked against known answers."""
import numpy as np
import pytest

from app import cloud as pc


def plane(n=4000, noise=0.0, seed=0):
    r = np.random.default_rng(seed)
    p = np.c_[r.uniform(0, 10, n), r.uniform(0, 10, n), r.normal(0, noise, n)].astype(np.float32)
    return pc.Cloud(p, r.integers(0, 255, (n, 3)).astype(np.uint8))


def test_ply_binary_roundtrip(tmp_path):
    c = plane(500)
    c.normals = np.tile(np.array([0, 0, 1], np.float32), (500, 1))
    pc.write_ply(tmp_path / "a.ply", c)
    back = pc.read_ply((tmp_path / "a.ply").read_bytes(), 10_000)
    assert np.allclose(back.points, c.points) and (back.colors == c.colors).all() and np.allclose(back.normals, c.normals)


def test_ply_ascii_and_mesh_faces(tmp_path):
    txt = "ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n"
    c = pc.read_ply(txt.encode(), 100)
    assert c.points.shape == (3, 3) and c.faces.tolist() == [[0, 1, 2]]


def test_ply_with_faces_binary_roundtrip(tmp_path):
    c = pc.Cloud(np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], np.float32), faces=np.array([[0, 1, 2], [1, 3, 2]], np.int32))
    pc.write_ply(tmp_path / "m.ply", c)
    back = pc.read_ply((tmp_path / "m.ply").read_bytes(), 100)
    assert back.faces.tolist() == [[0, 1, 2], [1, 3, 2]]


@pytest.mark.parametrize("data,msg", [(b"not a ply", "valid PLY"), (b"ply\nformat ascii 1.0\nelement vertex 0\nend_header\n", "no vertices"), (b"ply\nformat binary_little_endian 1.0\nelement vertex 100\nproperty float x\nproperty float y\nproperty float z\nend_header\n\x00\x00", "truncated")])
def test_bad_ply_is_rejected_clearly(data, msg):
    with pytest.raises(pc.CloudError, match=msg):
        pc.read_ply(data, 1000)


def test_point_limit_is_enforced():
    with pytest.raises(pc.CloudError, match="limit"):
        pc.read_ply(b"ply\nformat ascii 1.0\nelement vertex 99999999\nproperty float x\nproperty float y\nproperty float z\nend_header\n", 1000)


def test_pcd_ascii_and_binary():
    asc = b"# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 2\nHEIGHT 1\nPOINTS 2\nDATA ascii\n1 2 3\n4 5 6\n"
    assert pc.read_pcd(asc, 100).points.tolist() == [[1, 2, 3], [4, 5, 6]]
    head = b"# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 2\nHEIGHT 1\nPOINTS 2\nDATA binary\n"
    assert pc.read_pcd(head + np.array([[1, 2, 3], [4, 5, 6]], "<f4").tobytes(), 100).points.tolist() == [[1, 2, 3], [4, 5, 6]]
    with pytest.raises(pc.CloudError, match="compressed"):
        pc.read_pcd(head.replace(b"binary", b"binary_compressed"), 100)


def test_voxel_downsample_reduces_and_averages():
    c = pc.Cloud(np.array([[0.1, 0.1, 0.1], [0.3, 0.3, 0.3], [5.1, 5.1, 5.1]], np.float32), np.array([[10, 10, 10], [30, 30, 30], [200, 0, 0]], np.uint8))
    out = pc.voxel_downsample(c, 1.0)
    assert len(out.points) == 2
    first = out.points[np.argmin(out.points[:, 0])]
    assert np.allclose(first, [0.2, 0.2, 0.2], atol=1e-5)
    assert out.colors[np.argmin(out.points[:, 0])].tolist() == [20, 20, 20]
    with pytest.raises(pc.CloudError):
        pc.voxel_downsample(c, 0)


def test_outlier_removal_removes_injected_outliers_and_keeps_the_surface():
    c = plane(3000, noise=0.01)
    far = np.array([[5, 5, 40], [2, 8, -30], [9, 1, 25]], np.float32)
    dirty = pc.Cloud(np.vstack([c.points, far]), np.vstack([c.colors, np.zeros((3, 3), np.uint8)]))
    sor = pc.statistical_outlier_removal(dirty, 16, 2.0)
    assert not (np.abs(sor.points[:, 2]) > 5).any() and len(sor.points) > 2500
    ror = pc.radius_outlier_removal(dirty, 1.0, 4)
    assert not (np.abs(ror.points[:, 2]) > 5).any() and len(ror.points) > 2900


def test_normals_of_a_plane_point_along_z_and_toward_the_viewpoint():
    c = plane(2000, noise=0.001)
    up = pc.estimate_normals(c, 20, np.array([[5, 5, 10.0]]))
    assert (up.normals[:, 2] > 0.99).all()
    down = pc.estimate_normals(c, 20, np.array([[5, 5, -10.0]]))
    assert (down.normals[:, 2] < -0.99).all()


def test_crop_and_stats():
    c = plane(2000)
    out = pc.crop(c, [0, 0, -1], [5, 10, 1])
    assert 0 < len(out.points) < 2000 and out.points[:, 0].max() <= 5
    st = pc.stats(c.points)
    assert st["count"] == 2000 and abs(st["extent"][0] - 10) < 0.1 and abs(st["diagonal"] - np.linalg.norm(st["extent"])) < 1e-6
    with pytest.raises(pc.CloudError):
        pc.crop(c, [1, 1, 1], [0, 0, 0])
