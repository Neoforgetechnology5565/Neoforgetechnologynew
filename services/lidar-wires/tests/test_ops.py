import numpy as np
import pytest

from app import ops
from app.cloud import CloudError, PointCloud
from conftest import flat_scene


def cloud(n=5000, seed=0):
    xyz = flat_scene(n, seed, 30.0)
    return PointCloud(xyz, np.random.default_rng(seed).integers(0, 255, (n, 3), dtype=np.uint8), np.arange(n, dtype=np.float32), np.full(n, 2, np.uint8))


def test_voxel_downsample_returns_original_points_with_aligned_attributes():
    pc = cloud()
    out = ops.voxel_downsample(pc, 1.0)
    assert 0 < len(out) < len(pc) and len(out) <= 31 * 31
    idx = out.intensity.astype(int)  # intensity was the original index
    assert np.array_equal(out.xyz, pc.xyz[idx]) and np.array_equal(out.rgb, pc.rgb[idx])  # real measurements, not averages
    key = np.floor((out.xyz - pc.xyz.min(0)) / 1.0).astype(int)
    assert len({tuple(k) for k in key}) == len(out)  # at most one point per voxel
    for bad in (0, -1):
        with pytest.raises(CloudError, match="positive"):
            ops.voxel_downsample(pc, bad)
    with pytest.raises(CloudError, match="too small"):
        ops.voxel_downsample(pc, 1e-9)


def test_statistical_outlier_removal_removes_planted_outliers():
    pc = cloud(3000)
    rng = np.random.default_rng(1)
    out = np.c_[rng.uniform(0, 30, 30), rng.uniform(0, 30, 30), rng.uniform(20, 40, 30)]
    both = PointCloud(np.vstack([pc.xyz, out]))
    res = ops.statistical_outlier_removal(both, 16, 2.0)
    assert (res.xyz[:, 2] > 5).sum() < 3 and len(res) >= 0.9 * len(pc)
    with pytest.raises(CloudError):
        ops.statistical_outlier_removal(PointCloud(flat_scene(5)), 16)


def test_radius_outlier_removal():
    pc = PointCloud(np.vstack([flat_scene(4000, 0, 10.0), [[50, 50, 50], [60, 60, 60]]]))
    res = ops.radius_outlier_removal(pc, 1.0, 4)
    assert not (res.xyz[:, 2] > 40).any() and len(res) > 3800
    with pytest.raises(CloudError):
        ops.radius_outlier_removal(pc, 0)


def test_crop_and_errors():
    pc = cloud()
    res = ops.crop(pc, [0, 0, -1], [10, 10, 1])
    assert len(res) < len(pc) and (res.xyz[:, 0] <= 10).all() and res.rgb.shape[0] == len(res)
    for lo, hi, msg in (([5, 5, 5], [1, 1, 1], "min < max"), ([0, 0], [1, 1], "min < max"), ([0, 0, float("nan")], [1, 1, 1], "min < max"), ([100, 100, 100], [200, 200, 200], "no points")):
        with pytest.raises(CloudError, match=msg):
            ops.crop(pc, lo, hi)


def test_normals_of_a_plane_point_up_and_a_tilted_plane_is_recovered():
    rng = np.random.default_rng(0)
    xy = rng.uniform(0, 20, (3000, 2))
    pc = PointCloud(np.c_[xy, 0.5 * xy[:, 0]])  # plane z = 0.5 x
    n = ops.estimate_normals(pc, 20).normals
    expected = np.array([-0.5, 0, 1]) / np.linalg.norm([-0.5, 0, 1])
    assert np.allclose(n.mean(0), expected, atol=0.02) and (n[:, 2] > 0).all()


def test_apply_reports_unknown_operations_and_bad_parameters():
    pc = cloud()
    out, desc = ops.apply(pc, {"op": "voxel_downsample", "voxel": 2.0}, 1.0)
    assert "voxel" in desc and len(out) < len(pc)
    for bad in ({"op": "frobnicate"}, {"op": "voxel_downsample"}, {"op": "voxel_downsample", "voxel": "x"}, {"op": "crop", "min": [0, 0, 0]}):
        with pytest.raises(CloudError):
            ops.apply(pc, bad, 1.0)
