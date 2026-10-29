"""Video -> person detections -> ByteTrack identities (temporary, no appearance or face model) -> optional ball track. Everything that depends on user settings
(areas, calibration, thresholds) is derived afterwards from these stored observations (analytics.py), so settings can change without reprocessing."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .ball import BallTracker, Cand, colour_candidates
from .detector import Detector
from .media import VideoInfo
from .tracker import ByteTracker

MODEL_INFO = {
    "detector": {"name": "YOLOX-S", "licence": "Apache-2.0 (Megvii)", "trained_on": "COCO (person and sports-ball classes)", "input": 640},
    "tracker": {"name": "ByteTrack", "licence": "MIT (reference implementation; re-implemented here)", "note": "identities are temporary track numbers: there is no appearance or face model, so an identity can switch after occlusion or crossing"},
    "ball": {"name": "YOLOX sports-ball class + colour blob finder + constant-velocity gate", "note": "only detected positions are reported; a missed ball is a gap, never interpolated"},
}


class Cancelled(Exception):
    pass


@dataclass
class JobParams:
    mode: str = "restaurant"          # restaurant | tabletennis | basketball
    sample_fps: float = 5.0
    start_s: float = 0.0
    end_s: float | None = None
    det_threshold: float = 0.35
    ball: bool = False
    ball_kind: str = "white"          # orange | white
    ball_max_speed_frac: float = 1.5  # frame widths per second the ball may travel


@dataclass
class Progress:
    stage: str = "queued"
    done: int = 0
    total: int = 0
    seconds: float = 0.0


@dataclass
class Analysis:
    params: JobParams = field(default_factory=JobParams)
    times: list[float] = field(default_factory=list)
    frame_index: list[int] = field(default_factory=list)
    frames: list[dict] = field(default_factory=list)       # {t, f, persons:[{id, box, score}], ball:{...}|None}
    ball_points: list[dict] = field(default_factory=list)
    tracks: dict[int, list[dict]] = field(default_factory=dict)  # id -> [{t, box, score}]
    timing: dict[str, float] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)
    effective_fps: float = 0.0
    width: int = 0
    height: int = 0
    start_s: float = 0.0
    end_s: float = 0.0


def analyse(path: Path, info: VideoInfo, params: JobParams, det: Detector, progress: Progress, cancelled, max_samples: int) -> Analysis:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError("video could not be reopened")
    an = Analysis(params=params, width=info.width, height=info.height)
    fps = info.fps
    step = max(1, int(round(fps / max(params.sample_fps, 0.5))))
    an.effective_fps = fps / step
    start_f = int(params.start_s * fps)
    end_f = int(params.end_s * fps) if params.end_s else (info.frames or 10**9)
    total = (min(end_f, info.frames or end_f) - start_f) // step + 1
    if total <= 0:
        raise ValueError("The selected range contains no frames.")
    if total > max_samples:
        raise ValueError(f"The selected range would need {total} analysed frames; this service allows {max_samples}. Lower the sampling rate or choose a shorter range.")
    progress.total, progress.stage = int(total), "analysing"
    if start_f:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_f)
    tracker = ByteTracker(high_thresh=params.det_threshold, low_thresh=0.1, buffer_frames=max(5, int(round(3 * an.effective_fps))))
    dt = step / fps
    bt = BallTracker(dt, params.ball_max_speed_frac * info.width, gate=max(12.0, 0.04 * info.width)) if params.ball else None
    min_r, max_r = max(1.5, 0.003 * info.height), 0.035 * info.height
    prev_gray = None
    fi, t0, t_det = start_f, time.perf_counter(), 0.0
    n_persons = 0
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
        d = det(frame, person_thr=0.1, ball_thr=0.15)
        t_det += time.perf_counter() - a
        pb, ps = d["person"]
        tr = tracker.update(pb, ps, ["person"] * len(ps))
        persons = []
        for st in sorted(tr, key=lambda s: int(s.track_id)):
            box = st.tlbr.astype(float)
            box[[0, 2]] = box[[0, 2]].clip(0, info.width)
            box[[1, 3]] = box[[1, 3]].clip(0, info.height)
            p = {"id": int(st.track_id), "box": [round(float(v), 1) for v in box], "score": round(float(st.score), 3)}
            persons.append(p)
            an.tracks.setdefault(p["id"], []).append({"t": round(t, 3), "box": p["box"], "score": p["score"]})
            n_persons += 1
        ball = None
        if bt is not None:
            cands = [Cand(float((b[0] + b[2]) / 2), float((b[1] + b[3]) / 2), float(max(b[2] - b[0], b[3] - b[1]) / 2), "yolox", round(float(s), 3)) for b, s in zip(*d["ball"])]
            cands += colour_candidates(frame, params.ball_kind, prev_gray, min_r, max_r)
            seeds = None
            if params.ball_kind == "white":  # white moving blobs on a player's body (clothing, shoes) are not where a new ball track should start
                seeds = [c for c in cands if c.src == "yolox" or not any(b[0] - 0.05 * (b[2] - b[0]) <= c.x <= b[2] + 0.05 * (b[2] - b[0]) and b[1] <= c.y <= b[3] for b in (p["box"] for p in persons))]
            ball = bt.update(t, cands, seeds)
            if ball:
                an.ball_points.append(ball)
            prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        an.times.append(round(t, 3))
        an.frame_index.append(fi)
        an.frames.append({"t": round(t, 3), "f": fi, "persons": persons, "ball": ball})
        progress.done = len(an.times)
        progress.seconds = time.perf_counter() - t0
        fi += 1
    cap.release()
    an.start_s, an.end_s = (an.times[0], an.times[-1]) if an.times else (0.0, 0.0)
    an.timing = {"detect": round(t_det, 2), "total": round(time.perf_counter() - t0, 2)}
    an.counts = {"analysed_frames": len(an.times), "person_observations": n_persons, "tracks": len(an.tracks), "ball_points": len(an.ball_points)}
    progress.stage = "done"
    return an
