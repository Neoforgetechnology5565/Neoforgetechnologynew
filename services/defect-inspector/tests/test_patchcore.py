import cv2
import numpy as np

from app.patchcore import Backbone, Reference, anomaly_map, auroc, build_bank, greedy_coreset, nn_distance
from app.config import Settings
from conftest import defective, good_part

BB = Backbone(Settings().backbone_path)


def test_auroc_known_values():
    assert auroc(np.array([1, 2, 3, 4]), np.array([0, 0, 1, 1])) == 1.0
    assert auroc(np.array([4, 3, 2, 1]), np.array([0, 0, 1, 1])) == 0.0
    assert auroc(np.array([1, 1, 1, 1]), np.array([0, 0, 1, 1])) == 0.5
    assert np.isnan(auroc(np.array([1, 2]), np.array([0, 0])))


def test_coreset_covers_the_data_and_nn_distance_is_exact():
    rng = np.random.default_rng(0)
    x = np.concatenate([rng.normal(0, 1, (300, 16)), rng.normal(8, 1, (30, 16))]).astype(np.float32)  # a small distant cluster must survive subsampling
    idx = greedy_coreset(x, 40)
    assert len(set(idx.tolist())) == 40 and (idx >= 300).any()
    q = rng.normal(0, 1, (5, 1, 16)).astype(np.float32)
    d = nn_distance(q, x)
    brute = np.sqrt(((q[:, 0, None, :] - x[None]) ** 2).sum(-1).min(1))
    assert np.allclose(d[:, 0], brute, atol=1e-3)


def test_backbone_feature_shape_and_determinism():
    img = good_part(1)
    f1, f2 = BB.features(img, 256), BB.features(img, 256)
    assert f1.shape == (32, 32, 512) and np.array_equal(f1, f2) and np.isfinite(f1).all()


def test_defect_is_localised_and_scores_higher_than_good_parts():
    feats = [BB.features(good_part(i), 256) for i in range(12)]
    bank = build_bank(feats, 1500)
    def smap(img): return anomaly_map(nn_distance(BB.features(img, 256), bank), 256)
    good = [smap(good_part(100 + i)).max() for i in range(4)]
    m = smap(defective(100))
    assert m.max() > 1.3 * max(good), (m.max(), good)
    y, x = np.unravel_index(m.argmax(), m.shape)
    assert abs(x - 190) < 40 and abs(y - 70) < 40, (x, y)  # the peak lies on the blotch, not elsewhere
    far = m.copy(); cv2.circle(far, (190, 70), 50, 0, -1)
    assert far.max() < 0.8 * m.max()  # the rest of the part stays comparatively quiet
