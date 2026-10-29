"""ByteTrack multi-object tracker (Zhang et al., ECCV 2022; reference implementation MIT-licensed), re-implemented for this project
(same implementation as the PPE, vehicle and sports demos; track ids are per tracker instance).

Two-stage association: high-score detections are matched to existing tracks by IoU (fused with the detection score), then
low-score detections are used to keep tracks alive through partial occlusion. Constant-velocity Kalman filter in (x, y, a, h) space.
There is no appearance model and no camera-motion compensation, so a moving camera and long occlusions cause identity switches.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import scipy.linalg
from scipy.optimize import linear_sum_assignment

NEW, TRACKED, LOST, REMOVED = 0, 1, 2, 3


class KalmanFilter:
    def __init__(self):
        ndim, dt = 4, 1.0
        self._motion = np.eye(2 * ndim)
        for i in range(ndim):
            self._motion[i, ndim + i] = dt
        self._update = np.eye(ndim, 2 * ndim)
        self._wp, self._wv = 1.0 / 20, 1.0 / 160

    def initiate(self, m):
        mean = np.r_[m, np.zeros_like(m)]
        std = [2 * self._wp * m[3], 2 * self._wp * m[3], 1e-2, 2 * self._wp * m[3], 10 * self._wv * m[3], 10 * self._wv * m[3], 1e-5, 10 * self._wv * m[3]]
        return mean, np.diag(np.square(std))

    def predict(self, mean, cov):
        sp = [self._wp * mean[3], self._wp * mean[3], 1e-2, self._wp * mean[3]]
        sv = [self._wv * mean[3], self._wv * mean[3], 1e-5, self._wv * mean[3]]
        q = np.diag(np.square(np.r_[sp, sv]))
        return self._motion @ mean, self._motion @ cov @ self._motion.T + q

    def project(self, mean, cov):
        std = [self._wp * mean[3], self._wp * mean[3], 1e-1, self._wp * mean[3]]
        return self._update @ mean, self._update @ cov @ self._update.T + np.diag(np.square(std))

    def update(self, mean, cov, m):
        pm, pc = self.project(mean, cov)
        chol = scipy.linalg.cho_factor(pc, lower=True, check_finite=False)
        gain = scipy.linalg.cho_solve(chol, (cov @ self._update.T).T, check_finite=False).T
        return mean + (m - pm) @ gain.T, cov - gain @ pc @ gain.T


_KF = KalmanFilter()


class STrack:
    def __init__(self, tlwh: np.ndarray, score: float, cls: str, det_index: int):
        self._tlwh = np.asarray(tlwh, dtype=float)
        self.mean = self.cov = None
        self.is_activated = False
        self.score = score
        self.state = NEW
        self.track_id = 0
        self.start_frame = self.frame_id = self.tracklet_len = 0
        self.hits = 1  # number of frames in which this track was matched to a detection (including creation)
        self.det_index = det_index
        self.votes: Counter[str] = Counter({cls: score})

    @property
    def tlwh(self) -> np.ndarray:
        if self.mean is None:
            return self._tlwh.copy()
        r = self.mean[:4].copy()
        r[2] *= r[3]
        r[:2] -= r[2:] / 2
        return r

    @property
    def tlbr(self) -> np.ndarray:
        r = self.tlwh.copy()
        r[2:] += r[:2]
        return r

    @staticmethod
    def to_xyah(tlwh: np.ndarray) -> np.ndarray:
        r = np.asarray(tlwh, dtype=float).copy()
        r[:2] += r[2:] / 2
        r[2] /= max(r[3], 1e-6)
        return r

    @property
    def cls(self) -> str:
        return self.votes.most_common(1)[0][0]

    def vote(self, cls: str, score: float) -> None:
        self.votes[cls] += score

    def activate(self, frame_id: int, track_id: int) -> None:
        self.track_id = track_id
        self.mean, self.cov = _KF.initiate(self.to_xyah(self._tlwh))
        self.tracklet_len = 0
        self.state = TRACKED
        self.is_activated = frame_id == 1  # tracks created on the first frame are confirmed immediately (ByteTrack convention)
        self.frame_id = self.start_frame = frame_id

    def re_activate(self, new: "STrack", frame_id: int) -> None:
        self.mean, self.cov = _KF.update(self.mean, self.cov, self.to_xyah(new.tlwh))
        self.tracklet_len = 0
        self.state, self.is_activated, self.frame_id = TRACKED, True, frame_id
        self.score, self.det_index = new.score, new.det_index
        self.hits += 1

    def update(self, new: "STrack", frame_id: int) -> None:
        self.frame_id = frame_id
        self.tracklet_len += 1
        self.mean, self.cov = _KF.update(self.mean, self.cov, self.to_xyah(new.tlwh))
        self.state, self.is_activated = TRACKED, True
        self.score, self.det_index = new.score, new.det_index
        self.hits += 1

    def predict(self) -> None:
        mean = self.mean.copy()
        if self.state != TRACKED:
            mean[7] = 0
        self.mean, self.cov = _KF.predict(mean, self.cov)


def _iou(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if len(a) == 0 or len(b) == 0:
        return np.zeros((len(a), len(b)))
    x1 = np.maximum(a[:, None, 0], b[None, :, 0])
    y1 = np.maximum(a[:, None, 1], b[None, :, 1])
    x2 = np.minimum(a[:, None, 2], b[None, :, 2])
    y2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    aa = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    bb = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    return inter / (aa[:, None] + bb[None, :] - inter + 1e-9)


def _iou_distance(tracks: list[STrack], dets: list[STrack]) -> np.ndarray:
    return 1.0 - _iou(np.array([t.tlbr for t in tracks]).reshape(-1, 4), np.array([d.tlbr for d in dets]).reshape(-1, 4))


def _fuse_score(cost: np.ndarray, dets: list[STrack]) -> np.ndarray:
    if cost.size == 0:
        return cost
    return 1.0 - (1.0 - cost) * np.array([d.score for d in dets])[None, :]


def _assign(cost: np.ndarray, thresh: float):
    if cost.size == 0:
        return [], list(range(cost.shape[0])), list(range(cost.shape[1]))
    rows, cols = linear_sum_assignment(cost)
    matches = [(int(r), int(c)) for r, c in zip(rows, cols) if cost[r, c] <= thresh]
    mr, mc = {m[0] for m in matches}, {m[1] for m in matches}
    return matches, [i for i in range(cost.shape[0]) if i not in mr], [j for j in range(cost.shape[1]) if j not in mc]


class ByteTracker:
    def __init__(self, high_thresh: float = 0.5, low_thresh: float = 0.1, match_thresh: float = 0.8, buffer_frames: int = 30, new_track_margin: float = 0.1):
        self.high, self.low, self.match_thresh = high_thresh, low_thresh, match_thresh
        self.new_thresh = high_thresh + new_track_margin
        self.max_time_lost = buffer_frames
        self.frame_id = 0
        self._next_id = 0  # ids are per tracker, so concurrent jobs never share a counter
        self.tracked: list[STrack] = []
        self.lost: list[STrack] = []

    def update(self, boxes: np.ndarray, scores: np.ndarray, classes: list[str]) -> list[STrack]:
        """boxes: (N,4) xyxy. Returns the activated tracks for this frame; each carries `det_index` (index into the input arrays)."""
        self.frame_id += 1
        fid = self.frame_id
        n = len(scores)
        tlwh = np.c_[boxes[:, :2], boxes[:, 2:] - boxes[:, :2]] if n else np.zeros((0, 4))
        hi = [i for i in range(n) if scores[i] >= self.high]
        lo = [i for i in range(n) if self.low < scores[i] < self.high]
        mk = lambda idx: [STrack(tlwh[i], float(scores[i]), classes[i], i) for i in idx]  # noqa: E731
        dets, dets_low = mk(hi), mk(lo)

        unconfirmed = [t for t in self.tracked if not t.is_activated]
        tracked = [t for t in self.tracked if t.is_activated]
        pool = tracked + [t for t in self.lost if t not in tracked]
        for t in pool:
            t.predict()
        activated, refound, lost_now, removed = [], [], [], []

        m, u_track, u_det = _assign(_fuse_score(_iou_distance(pool, dets), dets), self.match_thresh)
        for ti, di in m:
            t, d = pool[ti], dets[di]
            t.vote(classes[d.det_index], d.score)
            if t.state == TRACKED:
                t.update(d, fid); activated.append(t)
            else:
                t.re_activate(d, fid); refound.append(t)

        rem = [pool[i] for i in u_track if pool[i].state == TRACKED]
        m2, u_track2, _ = _assign(_iou_distance(rem, dets_low), 0.5)
        for ti, di in m2:
            t, d = rem[ti], dets_low[di]
            t.vote(classes[d.det_index], d.score)
            if t.state == TRACKED:
                t.update(d, fid); activated.append(t)
            else:
                t.re_activate(d, fid); refound.append(t)
        for i in u_track2:
            t = rem[i]
            if t.state != LOST:
                t.state = LOST; lost_now.append(t)

        left = [dets[i] for i in u_det]
        m3, u_unconf, u_det3 = _assign(_fuse_score(_iou_distance(unconfirmed, left), left), 0.7)
        for ti, di in m3:
            t, d = unconfirmed[ti], left[di]
            t.vote(classes[d.det_index], d.score)
            t.update(d, fid); activated.append(t)
        for i in u_unconf:
            unconfirmed[i].state = REMOVED; removed.append(unconfirmed[i])

        for i in u_det3:
            d = left[i]
            if d.score < self.new_thresh:
                continue
            self._next_id += 1; d.activate(fid, self._next_id); activated.append(d)

        for t in self.lost:
            if fid - t.frame_id > self.max_time_lost:
                t.state = REMOVED; removed.append(t)

        self.tracked = [t for t in self.tracked if t.state == TRACKED]
        self.tracked = _join(self.tracked, activated)
        self.tracked = _join(self.tracked, refound)
        self.lost = [t for t in _sub(_join(self.lost, lost_now), self.tracked) if t.state != REMOVED]
        self.lost = _sub(self.lost, removed)
        return [t for t in self.tracked if t.is_activated and t.frame_id == fid]


def _join(a: list[STrack], b: list[STrack]) -> list[STrack]:
    seen = {t.track_id for t in a}
    return a + [t for t in b if t.track_id not in seen]


def _sub(a: list[STrack], b: list[STrack]) -> list[STrack]:
    ids = {t.track_id for t in b}
    return [t for t in a if t.track_id not in ids]
