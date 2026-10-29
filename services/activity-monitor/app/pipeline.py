"""Video -> person detections -> tracks -> pose -> observations. Candidate events are derived from the stored observations (activity.py),
so thresholds can be changed without reprocessing the video."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .activity import AggressionParams, Candidate, FallParams, Sample, Track, detect_aggression, detect_falls
from .detector import PersonDetector
from .media import VideoInfo
from .pose import PoseEstimator
from .tracker import ByteTracker

MODEL_INFO = {
    "detector": {"name": "YOLOX-S", "licence": "Apache-2.0 (Megvii)", "trained_on": "COCO (person class used)", "input": 640},
    "tracker": {"name": "ByteTrack", "licence": "MIT (reference implementation; re-implemented here)", "note": "no appearance model: identities can switch after occlusion or crossing"},
    "pose": {"name": "BlazePose full (33 body keypoints)", "licence": "Apache-2.0 (Google MediaPipe)", "note": "run per tracked person on a square crop, no body-axis rotation of the crop"},
}


class Cancelled(Exception):
    pass


@dataclass
class JobParams:
    sample_fps: float = 5.0
    start_s: float = 0.0
    end_s: float | None = None
    det_threshold: float = 0.35
    pose: bool = True
    min_pose_px: int = 48          # persons whose box is shorter than this get no pose
    max_pose_persons: int = 12
    fall: FallParams = field(default_factory=FallParams)
    aggression: AggressionParams = field(default_factory=AggressionParams)


@dataclass
class Progress:
    stage: str = "queued"
    done: int = 0
    total: int = 0
    seconds: float = 0.0
    stage_seconds: dict[str, float] = field(default_factory=dict)


@dataclass
class Analysis:
    times: list[float] = field(default_factory=list)       # analysed frame times (s)
    frame_index: list[int] = field(default_factory=list)   # source frame numbers
    frames: list[list[dict]] = field(default_factory=list)  # per analysed frame: [{id, box, score, kp|None}]
    tracks: dict[int, Track] = field(default_factory=dict)
    timing: dict[str, float] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)
    candidates: list[Candidate] = field(default_factory=list)
    effective_fps: float = 0.0


def derive(an: Analysis, params: JobParams, video_end: float) -> list[Candidate]:
    c = detect_falls(an.tracks, params.fall, video_end) + detect_aggression(an.tracks, params.aggression)
    return sorted(c, key=lambda x: x.t_peak)


def analyse(path: Path, info: VideoInfo, params: JobParams, det: PersonDetector, pose: PoseEstimator, progress: Progress, cancelled, max_samples: int) -> Analysis:
    an = Analysis()
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError("video could not be reopened")
    fps = info.fps
    step = max(1, int(round(fps / max(params.sample_fps, 0.5))))
    an.effective_fps = fps / step
    start_f = int(params.start_s * fps)
    end_f = int(params.end_s * fps) if params.end_s else (info.frames or 10**9)
    total = min((min(end_f, info.frames or end_f) - start_f) // step + 1, max_samples)
    if total > max_samples or total <= 0:
        raise ValueError("The selected range produces no frames or too many frames for this service.")
    progress.total, progress.stage = int(total), "analysing"
    if start_f:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_f)
    # the tracker's buffer is expressed in seconds (3 s) so behaviour does not depend on the sampling rate
    tracker = ByteTracker(high_thresh=params.det_threshold, low_thresh=0.1, buffer_frames=max(5, int(round(3 * an.effective_fps))))
    t_det = t_pose = 0.0
    n_pose = n_persons = 0
    fi, t0 = start_f, time.perf_counter()
    while len(an.times) < total and fi < end_f:
        if cancelled():
            raise Cancelled()
        ok, frame = cap.read()
        if not ok:
            break
        if (fi - start_f) % step:
            fi += 1
            continue
        t = fi / fps
        a = time.perf_counter()
        boxes, scores = det(frame, score_thr=0.1)
        t_det += time.perf_counter() - a
        tr = tracker.update(boxes, scores, ["person"] * len(scores))
        persons = []
        order = sorted(tr, key=lambda s: -(s.tlbr[3] - s.tlbr[1]))
        for rank, st in enumerate(order):
            box = st.tlbr.astype(float)
            box[[0, 2]] = box[[0, 2]].clip(0, info.width)
            box[[1, 3]] = box[[1, 3]].clip(0, info.height)
            kp = None
            if params.pose and rank < params.max_pose_persons and box[3] - box[1] >= params.min_pose_px:
                a = time.perf_counter()
                kp, _ = pose(frame, box)
                t_pose += time.perf_counter() - a
                n_pose += 1
            sc = float(st.score)
            persons.append({"id": int(st.track_id), "box": [round(float(v), 1) for v in box], "score": round(sc, 3), "kp": kp})
            an.tracks.setdefault(int(st.track_id), []).append(Sample(t, tuple(float(v) for v in box), sc, kp))
            n_persons += 1
        an.times.append(round(t, 3))
        an.frame_index.append(fi)
        an.frames.append(persons)
        progress.done = len(an.times)
        progress.seconds = time.perf_counter() - t0
        fi += 1
    cap.release()
    an.timing = {"detect": round(t_det, 2), "pose": round(t_pose, 2), "total": round(time.perf_counter() - t0, 2)}
    an.counts = {"analysed_frames": len(an.times), "person_observations": n_persons, "pose_runs": n_pose, "tracks": len(an.tracks)}
    progress.stage = "deriving"
    an.candidates = derive(an, params, an.times[-1] if an.times else 0.0)
    return an


def frames_json(an: Analysis, lo: int = 0, hi: int | None = None) -> list[dict]:
    out = []
    for i in range(lo, min(hi if hi is not None else len(an.times), len(an.times))):
        ps = []
        for p in an.frames[i]:
            kp = p["kp"]
            ps.append({"id": p["id"], "box": p["box"], "score": p["score"],
                       "kp": None if kp is None else [[round(float(x), 1), round(float(y), 1), round(float(v), 2)] for x, y, v, _ in kp]})
        out.append({"t": an.times[i], "f": an.frame_index[i], "persons": ps})
    return out
