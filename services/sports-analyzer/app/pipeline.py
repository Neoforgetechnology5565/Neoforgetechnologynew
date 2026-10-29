"""Video analysis pipeline: decode -> detect players and ball -> estimate camera motion -> track -> teams -> ball linking -> (calibration) -> statistics.

Everything reported comes from this processing; nothing is simulated. Frames are decoded sequentially and analysed one at a time, so memory use is
independent of the video length: what is kept per analysed frame is a few dozen numbers, not pixels.
"""
from __future__ import annotations

import math
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from . import ball as ballmod
from . import teams as teammod
from .camera import CameraMotion, warp_box
from .footandball import FootAndBall
from .media import VideoInfo
from .pitch import CalibrationError, apply_h, fit_homography, landmarks
from .stats import CELL_M, SIGMA_CELLS, in_pitch, possession_candidates, track_stats
from .tracker import ByteTracker

MODEL_INFO = {
    "name": "FootAndBall (Komorowski, Kurzejamski, Sarwas, VISAPP 2020)",
    "task": "player and ball detection for high-resolution long-shot football video",
    "code_licence": "MIT",
    "trained_on": "ISSIA-CNR Soccer cameras 1-4 and SoccerPlayerDetection set 1 (fixed long-shot cameras)",
    "runtime": "ONNX Runtime, CPU",
}


@dataclass
class JobParams:
    sport: str = "football"
    sample_fps: float = 5.0
    start_s: float = 0.0
    end_s: float | None = None
    player_conf: float = 0.5
    ball_conf: float = 0.3
    detect_scale: float | None = None  # None = automatic: full resolution up to 2000 px wide, scaled down above that
    min_hits: int = 5
    analyse_ball: bool = True
    team_mode: str = "auto"  # auto | off | colors
    team_colors: list[str] | None = None
    pitch_length: float = 105.0
    pitch_width: float = 68.0
    match_label: str | None = None
    declared_duration_s: float | None = None
    calibration: dict | None = None


@dataclass
class Progress:
    stage: str = "queued"
    samples_done: int = 0
    samples_total: int = 0
    frames_decoded: int = 0
    elapsed: float = 0.0
    latest: dict | None = None
    detections: int = 0
    stage_seconds: dict = field(default_factory=dict)


class Cancelled(Exception):
    pass


@dataclass
class Analysis:
    """Raw per-sample observations kept in memory so the pitch calibration can be (re)applied without reprocessing the video."""
    params: JobParams
    info: VideoInfo
    sample_dt: float
    step: int
    samples: list[dict] = field(default_factory=list)  # {i, t, seg, H, n_in, ids:[track ids], boxes:[(x1,y1,x2,y2)], confs, ball_cands:[(x,y,conf)]}
    colours: dict[int, list] = field(default_factory=dict)
    track_hits: dict[int, int] = field(default_factory=dict)
    timings: dict = field(default_factory=dict)
    motion: dict = field(default_factory=dict)
    scale: float = 1.0
    detections_total: int = 0
    results: dict | None = None


def _foot(b) -> tuple[float, float]:
    return ((b[0] + b[2]) / 2.0, b[3])


def analyse(path: Path, info: VideoInfo, params: JobParams, det: FootAndBall, prog: Progress, cancelled: Callable[[], bool], max_samples: int) -> Analysis:
    step = max(1, int(round(info.fps / max(params.sample_fps, 0.5))))
    sample_dt = step / info.fps
    start_f = int(round(params.start_s * info.fps))
    end_f = int(math.floor(params.end_s * info.fps)) if params.end_s is not None else (info.frames if info.frames > 0 else 10 ** 9)
    total = max(1, (min(end_f, info.frames if info.frames > 0 else end_f) - start_f) // step)
    if total > max_samples:
        raise ValueError(f"This would need {total} analysed frames; the limit is {max_samples}. Lower the sampling rate or analyse a shorter part.")
    an = Analysis(params, info, sample_dt, step)
    an.scale = params.detect_scale if params.detect_scale is not None else min(1.0, 2000.0 / info.width)
    prog.samples_total, prog.stage = total, "detecting"
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError("The video could not be opened.")
    cam = CameraMotion(info.width, info.height)
    tracker = ByteTracker(high_thresh=params.player_conf, low_thresh=max(0.1, params.player_conf - 0.3), match_thresh=0.8, buffer_frames=max(3, int(round(3.0 / sample_dt))), new_track_margin=0.1)
    seg_seen = 0
    t0 = time.perf_counter()
    t_det = t_cam = t_trk = 0.0
    idx = -1
    try:
        while True:
            if cancelled():
                raise Cancelled()
            ok = cap.grab()
            idx += 1
            if not ok or idx >= end_f:
                break
            if idx < start_f or (idx - start_f) % step:
                continue
            ok, frame = cap.retrieve()
            if not ok:
                continue
            prog.frames_decoded = idx + 1
            a = time.perf_counter()
            players, balls = det.detect(frame, params.player_conf, min(0.15, params.ball_conf) if params.analyse_ball else 1.1, an.scale, 60, 5)
            b = time.perf_counter(); t_det += b - a
            boxes = [(d.x1, d.y1, d.x2, d.y2) for d in players]
            ms = cam.update(frame, boxes + [(d.x1, d.y1, d.x2, d.y2) for d in balls])
            c = time.perf_counter(); t_cam += c - b
            if ms.segment != seg_seen:  # camera cut / unreliable motion: tracks cannot be carried across it
                seg_seen = ms.segment
                nid = tracker._next_id
                tracker = ByteTracker(high_thresh=params.player_conf, low_thresh=max(0.1, params.player_conf - 0.3), match_thresh=0.8, buffer_frames=max(3, int(round(3.0 / sample_dt))), new_track_margin=0.1)
                tracker._next_id = nid
            H = ms.H
            ref_boxes = np.array([warp_box(H, bx) for bx in boxes], float).reshape(-1, 4)
            scores = np.array([d.score for d in players], float)
            tracks = tracker.update(ref_boxes, scores, ["player"] * len(players)) if len(players) or tracker.tracked or tracker.lost else []
            ids, bxs, cfs = [], [], []
            for tr in tracks:
                d = players[tr.det_index]
                ids.append(tr.track_id); bxs.append((d.x1, d.y1, d.x2, d.y2)); cfs.append(d.score)
                an.track_hits[tr.track_id] = an.track_hits.get(tr.track_id, 0) + 1
                cl = an.colours.setdefault(tr.track_id, [])
                if len(cl) < 14 and an.track_hits[tr.track_id] % 3 == 1:
                    col = teammod.torso_colour(frame, (d.x1, d.y1, d.x2, d.y2))
                    if col is not None:
                        cl.append(col)
            d3 = time.perf_counter(); t_trk += d3 - c
            an.samples.append({"i": idx, "t": idx / info.fps, "seg": ms.segment, "H": H.copy(), "n_in": ms.inliers, "ids": ids, "boxes": bxs, "confs": cfs,
                               "ball": [((q.x1 + q.x2) / 2, (q.y1 + q.y2) / 2, q.score) for q in balls]})
            an.detections_total += len(players)
            prog.samples_done, prog.detections = len(an.samples), an.detections_total
            prog.elapsed = time.perf_counter() - t0
            prog.latest = {"time_s": round(idx / info.fps, 2), "players_in_frame": len(ids), "ball_candidate_confidence": round(balls[0].score, 2) if balls else None, "tracks_so_far": len(an.track_hits)}
    finally:
        cap.release()
    an.timings = {"detect_s": round(t_det, 2), "camera_motion_s": round(t_cam, 2), "tracking_s": round(t_trk, 2), "total_loop_s": round(time.perf_counter() - t0, 2)}
    an.motion = {"max_step_corner_shift_px": round(cam.max_shift / cam.scale, 1), "max_centre_shift_px": round(cam.max_center_shift, 1), "segments": (seg_seen + 1)}
    if not an.samples:
        raise ValueError("No frames could be analysed in the selected range.")
    return an


# ---------------------------------------------------------------------------------------------------------------------------------------
def build_results(an: Analysis, calibration: dict | None, prog: Progress | None = None) -> dict:
    """Derive tracks, teams, ball path, pitch positions, statistics and events from the stored observations."""
    p, info, dt = an.params, an.info, an.sample_dt
    L, W = p.pitch_length, p.pitch_width
    kept = {tid for tid, n in an.track_hits.items() if n >= p.min_hits}
    S = an.samples
    times = [s["t"] for s in S]
    # ---- teams
    col = {tid: np.median(np.stack(v), 0) for tid, v in an.colours.items() if tid in kept and len(v) >= 2}
    team_of, team_info = teammod.classify(col, p.team_mode, p.team_colors)
    for tid in kept:
        team_of.setdefault(tid, teammod.UNCERTAIN)
    # ---- ball (linked in the stabilised reference space so a panning camera does not break plausibility)
    ref_cands = []
    for s in S:
        c = [(*_apply(s["H"], x, y), q) for x, y, q in s["ball"]]
        ref_cands.append(c)
    if p.analyse_ball:
        chosen_ref = ballmod.link(ref_cands, times, info.width, 0.6, min_conf=p.ball_conf)
        obs = ballmod.fill_estimates(chosen_ref, times, info.width, 1.0, 0.6)
    else:
        obs = [None] * len(S)
    # ---- calibration
    cal_json, cal, cal_seg, mapping = None, None, None, {"status": "unavailable", "reason": "Pitch calibration has not been established. Identify at least 4 pitch landmarks to map positions onto the pitch."}
    if calibration:
        try:
            cal, cal_seg = _calibrate(an, calibration)
            cal_json = cal.to_json()
            mapping = {"status": "available" if cal.quality != "poor" else "poor", "reason": None, "calibration": cal_json, "segment": cal_seg, "calibration_time_s": calibration.get("time")}
            if cal.quality == "poor":
                mapping["reason"] = "The calibration fits poorly; mapped positions are shown but are unreliable."
        except CalibrationError as e:
            mapping = {"status": "unavailable", "reason": str(e)}
    # ---- frames
    frames: list[dict] = []
    per_track: dict[int, dict[str, list]] = defaultdict(lambda: {"t": [], "ref": [], "pitch": []})
    ball_pitch_n = 0
    for k, s in enumerate(S):
        H = s["H"]
        rows = []
        for tid, bx, cf in zip(s["ids"], s["boxes"], s["confs"]):
            if tid not in kept:
                continue
            fx, fy = _foot(bx)
            rx, ry = _apply(H, fx, fy)
            px = py = None
            if cal is not None and s["seg"] == cal_seg:
                q = apply_h(cal.H, np.array([[rx, ry]]))[0]
                if np.isfinite(q).all():
                    px, py = round(float(q[0]), 2), round(float(q[1]), 2)
            tm = team_of.get(tid, teammod.UNCERTAIN)
            rows.append([tid, round(bx[0], 1), round(bx[1], 1), round(bx[2], 1), round(bx[3], 1), round(cf, 2), tm, px, py])
            pt = per_track[tid]
            pt["t"].append(s["t"]); pt["ref"].append((rx, ry)); pt["pitch"].append((px, py) if px is not None else (float("nan"), float("nan")))
        rec = {"i": s["i"], "t": round(s["t"], 3), "seg": s["seg"], "p": rows, "b": None}
        o = obs[k]
        if o is not None:
            # ball position back in image coordinates
            Hi = np.linalg.inv(H)
            ix, iy = _apply(Hi, o.x, o.y)
            bpx = bpy = None
            if cal is not None and s["seg"] == cal_seg:
                q = apply_h(cal.H, np.array([[o.x, o.y]]))[0]
                if np.isfinite(q).all() and in_pitch(float(q[0]), float(q[1]), L, W):
                    bpx, bpy = round(float(q[0]), 2), round(float(q[1]), 2); ball_pitch_n += 1
            rec["b"] = [round(ix, 1), round(iy, 1), round(o.conf, 2) if o.conf is not None else None, o.kind, bpx, bpy]
        frames.append(rec)
    # ---- track statistics
    track_rows = []
    last_t = times[-1]
    for tid in sorted(per_track):
        pt = per_track[tid]
        t = np.array(pt["t"]); ref = np.array(pt["ref"]); pitch = np.array(pt["pitch"]) if cal is not None else None
        st = track_stats(t, ref, pitch, dt, L, W)
        state = "active_at_end" if last_t - st["last_seen_s"] <= max(2.0, 2 * dt) else "ended"
        track_rows.append({"track_id": tid, "team": team_of.get(tid, teammod.UNCERTAIN), "state": state, **st})
    # ---- events and ball intervals
    events = possession_candidates(frames, dt) if p.analyse_ball else []
    ball_intervals = _intervals([(o.kind if o else "missing") for o in obs], times, dt)
    n_obs = sum(1 for o in obs if o and o.kind == "observed")
    n_est = sum(1 for o in obs if o and o.kind == "estimated")
    # ---- summary and warnings
    counts = [len(f["p"]) for f in frames]
    heights = [r[4] - r[2] for f in frames for r in f["p"]]
    wall = an.timings.get("total_loop_s", 0.0)
    summary = {"samples_analysed": len(S), "sampling_fps": round(1.0 / dt, 2), "source_fps": round(info.fps, 3), "source_frames_decoded": S[-1]["i"] + 1, "analysed_seconds": round(S[-1]["t"] - S[0]["t"] + dt, 2),
               "processing_seconds": round(wall, 2), "processing_fps": round(len(S) / wall, 2) if wall > 0 else None, "realtime_factor": round((len(S) * dt) / wall, 2) if wall > 0 else None,
               "timings": an.timings, "player_detections": an.detections_total, "tracks_found": len(an.track_hits), "tracks_kept": len(kept), "tracks_dropped_short": len(an.track_hits) - len(kept),
               "tracks_active_at_end": sum(1 for r in track_rows if r["state"] == "active_at_end"), "tracks_ended": sum(1 for r in track_rows if r["state"] == "ended"),
               "players_per_sample": {"mean": round(float(np.mean(counts)), 1), "max": int(max(counts)), "min": int(min(counts))},
               "ball": {"enabled": p.analyse_ball, "observed": n_obs, "estimated": n_est, "missing": len(S) - n_obs - n_est, "observed_rate": round(n_obs / len(S), 3), "mapped_to_pitch": ball_pitch_n},
               "motion": {**an.motion, "camera": "fixed" if an.motion.get("max_centre_shift_px", 0) < 0.01 * info.width else "moving"},
               "detector_scale": round(an.scale, 3), "median_player_height_px": round(float(np.median(heights)), 1) if heights else None, "fps_assumed": info.fps_assumed}
    warnings = _warnings(an, summary, team_info, mapping)
    return {"summary": summary, "pitch_mapping": mapping, "teams": team_info, "frames": frames, "tracks": track_rows, "events": events, "ball_intervals": ball_intervals,
            "pitch": {"length_m": L, "width_m": W, "heatmap": {"cell_m": CELL_M, "sigma_cells": SIGMA_CELLS, "method": "time-weighted 2-D histogram of mapped foot positions, Gaussian-smoothed, normalised to max 1"}, "zones": "3x3 grid, index = row*3+col (row from the top touchline, column from the left goal line)"},
            "warnings": warnings}


def _apply(H: np.ndarray, x: float, y: float) -> tuple[float, float]:
    v = H @ np.array([x, y, 1.0])
    return float(v[0] / v[2]), float(v[1] / v[2])


def _intervals(kinds: list[str], times: list[float], dt: float) -> list[list]:
    out: list[list] = []
    for k, t in zip(kinds, times):
        if out and out[-1][2] == k and t - out[-1][1] <= 1.6 * dt:
            out[-1][1] = round(t + dt, 3)
        else:
            out.append([round(t, 3), round(t + dt, 3), k])
    return out


def _calibrate(an: Analysis, c: dict):
    """Fit the image->pitch homography from landmark clicks made on the frame nearest to c['time'] (seconds in the source video)."""
    if not isinstance(c, dict) or not isinstance(c.get("points"), list):
        raise CalibrationError("The calibration needs a time and a list of points.")
    try:
        t = float(c["time"])
    except (KeyError, TypeError, ValueError):
        raise CalibrationError("The calibration needs the video time of the frame the points were marked on.") from None
    L, W = float(c.get("pitch_length", an.params.pitch_length)), float(c.get("pitch_width", an.params.pitch_width))
    if not (40 <= L <= 130 and 30 <= W <= 100):
        raise CalibrationError("Pitch length must be 40-130 m and width 30-100 m.")
    times = np.array([s["t"] for s in an.samples])
    k = int(np.abs(times - t).argmin())
    if abs(times[k] - t) > 2 * an.sample_dt + 0.05:
        raise CalibrationError("The calibration frame is outside the analysed part of the video.")
    s = an.samples[k]
    lm = landmarks(L, W)
    pairs = []
    for pt in c["points"][:60]:
        try:
            lid, x, y = str(pt["id"]), float(pt["x"]), float(pt["y"])
        except (KeyError, TypeError, ValueError):
            raise CalibrationError("Each calibration point needs id, x and y.") from None
        if lid not in lm:
            raise CalibrationError(f"Unknown pitch landmark '{lid[:40]}'.")
        if not (0 <= x <= an.info.width and 0 <= y <= an.info.height):
            raise CalibrationError("A calibration point lies outside the video frame.")
        rx, ry = _apply(s["H"], x, y)
        pairs.append((rx, ry, lm[lid]["x"], lm[lid]["y"]))
    an.params.pitch_length, an.params.pitch_width = L, W
    return fit_homography(pairs, L, W), s["seg"]


def _warnings(an: Analysis, summary: dict, team_info: dict, mapping: dict) -> list[dict]:
    """Plain-language caveats derived from this run's own measurements (never boilerplate that does not apply)."""
    w: list[dict] = []

    def add(level, text):
        w.append({"level": level, "text": text})

    if summary["fps_assumed"]:
        add("warning", "The video did not report a usable frame rate; 25 fps was assumed, so all timestamps may be off.")
    d = an.params.declared_duration_s
    if d and an.info.duration and abs(d - an.info.duration) > max(5.0, 0.1 * an.info.duration):
        add("info", f"You entered a match duration of {d:.0f} s but the video is {an.info.duration:.0f} s long; all times shown are video times.")
    mh = summary["median_player_height_px"]
    if mh is not None and mh < 28:
        add("warning", f"Players are small in the frame (median box height {mh:.0f} px); the detector is likely to miss players and boxes are imprecise.")
    pp = summary["players_per_sample"]
    if pp["mean"] < 3:
        add("warning", f"Only {pp['mean']} players were detected per analysed frame on average. This footage may be outside the detector's training domain (fixed long-shot football footage).")
    elif pp["mean"] > 30:
        add("warning", "More than 30 detections per frame: the footage may include crowds or non-players.")
    b = summary["ball"]
    if b["enabled"]:
        if b["observed_rate"] < 0.1:
            add("warning", f"The ball was observed in only {b['observed_rate'] * 100:.0f}% of analysed frames. Ball trajectory and possession candidates are not reliable for this footage.")
        elif b["observed_rate"] < 0.5:
            add("info", f"The ball was observed in {b['observed_rate'] * 100:.0f}% of analysed frames; the rest are missing or short interpolated gaps.")
    if summary["motion"]["segments"] > 1:
        add("warning", f"The camera view was lost or cut {summary['motion']['segments'] - 1} time(s). Tracks are not carried across cuts, and pitch mapping applies only to the segment containing the calibration frame.")
    if team_info.get("status") in ("uncertain", "unavailable"):
        add("info", "Team classification is uncertain: " + team_info.get("reason", ""))
    if summary["tracks_kept"] > 40:
        add("warning", f"{summary['tracks_kept']} tracks were kept for a match with about 22 players: identity switches and fragmented tracks are likely. Track ids are temporary.")
    if mapping["status"] == "poor":
        add("warning", mapping.get("reason") or "The pitch calibration is poor.")
    elif mapping["status"] == "unavailable":
        add("info", mapping.get("reason") or "Pitch mapping is unavailable.")
    if summary["timings"].get("detect_s", 0) > 0 and summary["realtime_factor"] is not None and summary["realtime_factor"] < 1:
        add("info", f"Processing ran at {summary['realtime_factor']:.2f}x real time on this machine (CPU).")
    return w
