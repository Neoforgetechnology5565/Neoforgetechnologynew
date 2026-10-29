"""PatchCore-style anomaly detection (Roth et al., CVPR 2022) with a frozen ImageNet ResNet-50 backbone running in ONNX Runtime.

Training needs only defect-free ("good") images of ONE kind of part. Every image is turned into a grid of patch descriptors (mid-level ResNet
features of layers 2 and 3, locally averaged, channel-reduced). A memory bank of descriptors from good images is reduced with greedy k-centre
coreset sampling. At inspection time each patch of a new image is compared with its nearest neighbour in the bank: a patch far from every good
patch is "unusual". The image score is the largest patch distance; the anomaly map is the smoothed patch-distance grid.

What the numbers mean
  * They are L2 distances in feature space. They are NOT probabilities and are not comparable between different references.
  * Each reference stores a flag threshold tau estimated from held-out good images (mean + 3 standard deviations of their image scores).
    `ratio = score / tau`; ratio >= 1 means "at least as unusual as the most unusual good parts seen in calibration".
  * The model can say where the part looks unusual compared with good parts. It cannot say what the defect is, and it also flags harmless variation
    (lighting, dust, positioning) that the good images did not contain.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from scipy.ndimage import gaussian_filter, uniform_filter

MEAN_BGR = np.array([103.939, 116.779, 123.68], np.float32)  # Keras ResNet50 ("caffe") preprocessing
DEFAULT_SIZE = 384
FEATURE_DIM = 512


class Backbone:
    """ResNet-50 up to layer 3 (conv3_block4_out stride 8, conv4_block6_out stride 16); ImageNet weights from the Keras applications release."""

    def __init__(self, path: Path, intra_threads: int = 0):
        if not Path(path).is_file():
            raise FileNotFoundError("The backbone model file is missing (services/defect-inspector/models/resnet50_l23.onnx).")
        o = ort.SessionOptions()
        if intra_threads > 0:
            o.intra_op_num_threads = intra_threads
        self.session = ort.InferenceSession(str(path), sess_options=o, providers=["CPUExecutionProvider"])
        self._lock = threading.Lock()

    def features(self, rgb: np.ndarray, size: int = DEFAULT_SIZE) -> np.ndarray:
        """rgb: HxWx3 uint8. Returns (size/8, size/8, 512) float32 patch descriptors."""
        x = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_AREA if min(rgb.shape[:2]) > size else cv2.INTER_LINEAR)
        x = (x[..., ::-1].astype(np.float32) - MEAN_BGR)[None]  # BGR minus mean
        with self._lock:
            l2, l3 = self.session.run(None, {"input": np.ascontiguousarray(x)})
        l2, l3 = l2[0], l3[0]
        l2 = uniform_filter(l2, size=(3, 3, 1), mode="nearest")  # local neighbourhood aggregation
        l3 = uniform_filter(l3, size=(3, 3, 1), mode="nearest")
        l2 = l2.reshape(*l2.shape[:2], 256, 2).mean(-1)
        l3 = l3.reshape(*l3.shape[:2], 256, 4).mean(-1)
        l3 = np.concatenate([cv2.resize(np.ascontiguousarray(l3[..., i:i + 4]), (l2.shape[1], l2.shape[0]), interpolation=cv2.INTER_LINEAR).reshape(l2.shape[0], l2.shape[1], -1) for i in range(0, l3.shape[-1], 4)], axis=-1)  # bilinear, 4 channels at a time (OpenCV limit)
        return np.concatenate([l2, l3], axis=-1).astype(np.float32)


def greedy_coreset(x: np.ndarray, n: int, seed: int = 0, proj_dim: int = 128) -> np.ndarray:
    """Greedy k-centre selection (indices) on a random projection of x, as in PatchCore. x: (N, D)."""
    N = len(x)
    if n >= N:
        return np.arange(N)
    rng = np.random.default_rng(seed)
    p = x @ rng.normal(0, 1.0 / np.sqrt(proj_dim), (x.shape[1], proj_dim)).astype(np.float32)
    sq = (p * p).sum(1)
    sel = [int(rng.integers(N))]
    d = np.full(N, np.inf, np.float32)
    for _ in range(n - 1):
        c = p[sel[-1]]
        d = np.minimum(d, sq + (c @ c) - 2.0 * (p @ c))
        sel.append(int(np.argmax(d)))
    return np.array(sel)


def nn_distance(feat: np.ndarray, bank: np.ndarray, chunk: int = 1024) -> np.ndarray:
    """Distance from every patch descriptor of feat (h, w, D) to its nearest neighbour in bank (M, D): returns (h, w)."""
    h, w, D = feat.shape
    f = feat.reshape(-1, D).astype(np.float32)
    b = bank.astype(np.float32)
    bn = (b * b).sum(1)
    out = np.empty(len(f), np.float32)
    for i in range(0, len(f), chunk):
        q = f[i:i + chunk]
        d2 = (q * q).sum(1)[:, None] + bn[None] - 2.0 * (q @ b.T)
        out[i:i + chunk] = np.sqrt(np.maximum(d2.min(1), 0.0))
    return out.reshape(h, w)


def anomaly_map(dist: np.ndarray, size: int = DEFAULT_SIZE, sigma: float = 4.0) -> np.ndarray:
    """Patch-distance grid -> smoothed map at the model input resolution (size x size)."""
    m = cv2.resize(dist, (size, size), interpolation=cv2.INTER_LINEAR)
    return gaussian_filter(m, sigma)


@dataclass
class Reference:
    id: str
    name: str
    bank: np.ndarray  # (M, 512) float16
    tau: float  # flag threshold on the image score (see module docstring)
    mu: float
    sigma: float
    size: int
    meta: dict

    def score(self, bb: Backbone, rgb: np.ndarray) -> tuple[np.ndarray, float]:
        """Returns (anomaly map at model resolution, image score)."""
        d = nn_distance(bb.features(rgb, self.size), self.bank)
        m = anomaly_map(d, self.size)
        return m, float(m.max())


def build_bank(feats: list[np.ndarray], budget: int, seed: int = 0) -> np.ndarray:
    x = np.concatenate([f.reshape(-1, f.shape[-1]) for f in feats]).astype(np.float32)
    idx = greedy_coreset(x, budget, seed)
    return x[idx].astype(np.float16)


def auroc(scores: np.ndarray, labels: np.ndarray) -> float:
    """Area under the ROC curve by rank statistics (ties handled by average ranks). labels: 1 = anomalous."""
    scores, labels = np.asarray(scores, np.float64).ravel(), np.asarray(labels).ravel().astype(bool)
    n1, n0 = labels.sum(), (~labels).sum()
    if n1 == 0 or n0 == 0:
        return float("nan")
    order = np.argsort(scores, kind="mergesort")
    s = scores[order]
    ranks = np.empty(len(s))
    i = 0
    while i < len(s):
        j = i
        while j + 1 < len(s) and s[j + 1] == s[i]:
            j += 1
        ranks[i:j + 1] = (i + j) / 2 + 1
        i = j + 1
    r = np.empty(len(s)); r[order] = ranks
    return float((r[labels].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))
