"""Frame-by-frame worker detection -> tracking -> PPE detection -> assessment -> annotated video. Streams frames: memory does not grow with video length."""
from __future__ import annotations

import json
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .detector import YoloxDetector
from .media import VideoInfo
from .ppe import HAT, KINDS, VEST, Assessor, SafetyGearModel, associate
from .tracker import ByteTracker

# BGR. Worker boxes are coloured by assessment; PPE boxes have their own colours so the three kinds are never confused.
STATUS_COLOR = {"compliant": (90, 200, 90), "potential_violation": (60, 70, 235), "uncertain": (40, 190, 245), "unassessed": (180, 180, 180)}
PPE_COLOR = {HAT: (255, 170, 60), VEST: (230, 120, 255)}
STATUS_LABEL = {"compliant": "Compliant", "potential_violation": "Potential PPE violation", "uncertain": "Uncertain"}
PPE_LABEL = {HAT: "hard hat", VEST: "safety vest"}


@dataclass
class JobParams:
    conf: float = 0.4  # worker (person) detection threshold
    ppe_conf: float = 0.4  # PPE detection threshold: below this an item counts as weak evidence, not as detected
    stride: int = 1
    min_hits: int = 3
    require_hat: bool = True
    require_vest: bool = True
    zone: tuple[float, float, float, float] | None = None  # normalised x1,y1,x2,y2 (0..1) rectangle; a worker is inside when their feet are
    write_video: bool = True

    @property
    def required(self) -> tuple[str, ...]:
        return tuple(k for k, on in ((HAT, self.require_hat), (VEST, self.require_vest)) if on)


@dataclass
class Progress:
    frames_processed: int = 0
    frames_read: int = 0
    total_frames_estimate: int = 0
    instances: int = 0
    elapsed: float = 0.0
    latest: dict | None = None
    unique: int = 0
    offsets: list[int] = field(default_factory=list)  # byte offset of each flushed frame line in frames.jsonl


@dataclass
class Outputs:
    jsonl: Path
    video_webm: Path | None = None
    video_mp4: Path | None = None
    summary: dict = field(default_factory=dict)


@dataclass
class Models:
    person: YoloxDetector
    safety: SafetyGearModel


def zone_px(zone, w: int, h: int):
    return None if not zone else (zone[0] * w, zone[1] * h, zone[2] * w, zone[3] * h)


def draw(frame: np.ndarray, dets: list[dict], zone) -> np.ndarray:
    out = frame.copy()
    h, w = out.shape[:2]
    scale = max(0.7, min(w, h) / 560)
    if zone:
        z = zone_px(zone, w, h)
        cv2.rectangle(out, (int(z[0]), int(z[1])), (int(z[2]), int(z[3])), (255, 255, 0), max(2, int(2 * scale)))
    for d in dets:
        b = d["bbox"]
        p1, p2 = (int(b["x1"]), int(b["y1"])), (int(b["x2"]), int(b["y2"]))
        if d["class"] == "worker":
            st = d["ppe_assessment"]["status"]
            color, label = STATUS_COLOR[st], f'#{d["track_id"]} {STATUS_LABEL[st]} {d["confidence"]:.2f}' if d["track_id"] is not None else f'{STATUS_LABEL[st]} {d["confidence"]:.2f}'
            thick = max(2, int(round(2.5 * scale)))
        else:
            color, label, thick = PPE_COLOR[d["class"]], f'{PPE_LABEL[d["class"]]} {d["confidence"]:.2f}', max(1, int(round(1.5 * scale)))
        cv2.rectangle(out, p1, p2, color, thick)
        (tw, th), base = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5 * scale, 1)
        y0 = max(th + 4, p1[1])
        cv2.rectangle(out, (p1[0], y0 - th - 4), (p1[0] + tw + 4, y0 + base - 2), color, -1)
        cv2.putText(out, label, (p1[0] + 2, y0 - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.5 * scale, (10, 10, 10), 1, cv2.LINE_AA)
    return out


class FfmpegWriter:
    """Pipes raw BGR frames to ffmpeg (libx264). Much faster than OpenCV's software VP8 writer and plays in every browser."""

    def __init__(self, path: Path, width: int, height: int, fps: float):
        ff = shutil.which("ffmpeg")
        if not ff:
            raise FileNotFoundError("ffmpeg")
        self.path, self.ok = path, True
        self.proc = subprocess.Popen([ff, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", f"{fps:.4f}", "-i", "-", "-an", "-c:v", "libx264", "-preset", "ultrafast",
                                      "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)], stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def write(self, frame: np.ndarray) -> None:
        if not self.ok:
            return
        try:
            self.proc.stdin.write(frame.tobytes())  # type: ignore[union-attr]
        except (BrokenPipeError, OSError):
            self.ok = False

    def release(self) -> None:
        try:
            if self.proc.stdin:
                self.proc.stdin.close()
            self.proc.wait(timeout=120)
        except (subprocess.SubprocessError, OSError):
            self.proc.kill()


def transcode_webm(src: Path, dst: Path) -> bool:
    """VP8 WebM copy of the processed video for browsers without H.264 support (e.g. open-source Chromium builds)."""
    ff = shutil.which("ffmpeg")
    if not ff:
        return False
    try:
        r = subprocess.run([ff, "-y", "-v", "error", "-i", str(src), "-an", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "2M", "-pix_fmt", "yuv420p", str(dst)], timeout=300, capture_output=True)
        return r.returncode == 0 and dst.is_file() and dst.stat().st_size > 0
    except (subprocess.SubprocessError, OSError):
        return False


def transcode_mp4(src: Path, dst: Path) -> bool:
    """Optional H.264 MP4 copy (broadest browser support) when ffmpeg is installed. Returns True on success."""
    ff = shutil.which("ffmpeg")
    if not ff:
        return False
    try:
        r = subprocess.run([ff, "-y", "-v", "error", "-i", str(src), "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(dst)], timeout=300, capture_output=True)
        return r.returncode == 0 and dst.is_file() and dst.stat().st_size > 0
    except (subprocess.SubprocessError, OSError):
        return False


class FrameAnalyzer:
    """One frame in, one record out. Shared by the image endpoint (no tracking, no smoothing) and the video pipeline."""

    def __init__(self, models: Models, params: JobParams, fps: float, tracked: bool):
        self.m, self.p, self.tracked = models, params, tracked
        out_fps = fps / max(1, params.stride)
        self.tracker = ByteTracker(high_thresh=max(0.5, params.conf + 0.1), low_thresh=min(0.1, params.conf), buffer_frames=max(5, int(round(1.0 * out_fps)))) if tracked else None
        self.assessor = Assessor(params.required, smooth=tracked)
        self.confirmed: set[int] = set()
        self.flagged: set[int] = set()  # tracks that were ever shown as "potential violation"
        self.instances = 0
        self.zone_peak = 0
        self.timing = {"person_ms": 0.0, "ppe_ms": 0.0, "n": 0}

    def run(self, frame: np.ndarray, frame_index: int, fps: float) -> dict:
        h, w = frame.shape[:2]
        t0 = time.perf_counter()
        people = self.m.person.detect(frame, conf=self.p.conf)
        t1 = time.perf_counter()
        boxes = [(d.x1, d.y1, d.x2, d.y2) for d in people]
        scores = [d.score for d in people]
        by_det = {}
        if self.tracker is not None:
            tr = self.tracker.update(np.array(boxes, dtype=float).reshape(-1, 4), np.array(scores, dtype=float), ["worker"] * len(people))
            by_det = {t.det_index: t for t in tr}
        ppe = associate(boxes, self.m.safety.detect(frame, boxes), 0.3)  # keep weak evidence (0.3..ppe_conf) so it can be reported as "uncertain"
        t2 = time.perf_counter()
        self.timing["person_ms"] += (t1 - t0) * 1000
        self.timing["ppe_ms"] += (t2 - t1) * 1000
        self.timing["n"] += 1
        z = zone_px(self.p.zone, w, h)
        dets: list[dict] = []
        counts = {"compliant": 0, "potential_violation": 0, "uncertain": 0}
        in_zone = 0
        alive = set()
        for i, d in enumerate(people):
            t = by_det.get(i)
            tid = t.track_id if t else None
            confirmed = bool(t and t.hits >= self.p.min_hits)
            if tid is not None:
                alive.add(tid)
            if confirmed:
                self.confirmed.add(tid)
            bad = self.assessor.reliability(i, boxes, scores, w, h)
            a = self.assessor.assess(i, tid, ppe, bad, self.p.ppe_conf, confirmed)
            if self.tracked and not confirmed:
                a["status"] = "uncertain" if a["status"] == "potential_violation" else a["status"]
                if a["status"] == "uncertain" and "track not yet confirmed" not in a["reasons"]:
                    a["reasons"] = ["track not yet confirmed"] + [r for r in a["reasons"] if not r.endswith("not detected")]
            counts[a["status"]] += 1
            if a["status"] == "potential_violation" and tid is not None and confirmed:
                self.flagged.add(tid)
            if z and z[0] <= (d.x1 + d.x2) / 2 <= z[2] and z[1] <= d.y2 <= z[3]:
                in_zone += 1
            dets.append({"class": "worker", "track_id": tid, "confidence": round(d.score, 4), "confirmed": confirmed,
                         "bbox": {"x1": round(d.x1, 1), "y1": round(d.y1, 1), "x2": round(d.x2, 1), "y2": round(d.y2, 1)}, "ppe_assessment": a})
        tid_of = {i: (by_det[i].track_id if i in by_det else None) for i in range(len(people))}
        for b in ppe:
            if b.score < self.p.ppe_conf:
                continue  # weak evidence only feeds the assessment; it is not drawn or counted as a detected item
            dets.append({"class": b.kind, "track_id": None, "worker_track_id": tid_of[b.worker], "confidence": round(b.score, 4),
                         "bbox": {"x1": round(b.x1, 1), "y1": round(b.y1, 1), "x2": round(b.x2, 1), "y2": round(b.y2, 1)}})
        if self.tracked:
            self.assessor.prune(alive)
        hats = sum(1 for x in dets if x["class"] == HAT)
        vests = sum(1 for x in dets if x["class"] == VEST)
        self.instances += len(dets)
        self.zone_peak = max(self.zone_peak, in_zone)
        return {"frame_number": frame_index + 1, "frame_index": frame_index, "timestamp_seconds": round(frame_index / fps, 3) if fps else 0.0,
                "workers_visible": len(people), "hard_hats_detected": hats, "safety_vests_detected": vests, "compliant_workers": counts["compliant"],
                "potential_ppe_violations": counts["potential_violation"], "uncertain_classifications": counts["uncertain"],
                "unique_worker_tracks": len(self.confirmed), "unique_tracks_with_potential_violation": len(self.flagged),
                "detection_instances_processed": self.instances, "zone": {"workers_inside": in_zone, "peak_workers_inside": self.zone_peak} if self.p.zone else None,
                "detections": dets}


def run_pipeline(input_path: Path, out_dir: Path, info: VideoInfo, params: JobParams, models: Models, progress: Progress, cancelled, max_frames: int) -> Outputs:
    outs = Outputs(jsonl=out_dir / "frames.jsonl")
    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError("The video could not be re-opened for processing.")
    fps = info.fps
    out_fps = fps / params.stride
    an = FrameAnalyzer(models, params, fps, tracked=True)
    writer = None
    if params.write_video:
        try:
            writer = FfmpegWriter(out_dir / "processed.mp4", info.width, info.height, out_fps)
            outs.video_mp4 = out_dir / "processed.mp4"
        except FileNotFoundError:  # no ffmpeg: OpenCV's software VP8 writer (slower, WebM)
            outs.video_webm = out_dir / "processed.webm"
            writer = cv2.VideoWriter(str(outs.video_webm), cv2.VideoWriter_fourcc(*"VP80"), out_fps, (info.width, info.height))
            if not writer.isOpened():
                writer, outs.video_webm = None, None
    t_start = time.perf_counter()
    idx = -1
    progress.total_frames_estimate = info.frames // params.stride if info.frames else 0
    written = 0
    peak = {"workers": 0, "violations": 0}
    status_frames = {"compliant": 0, "potential_violation": 0, "uncertain": 0}
    try:
        with open(outs.jsonl, "wb") as jf:
            while True:
                if cancelled():
                    break
                ok, frame = cap.read()
                if not ok or frame is None:
                    break
                idx += 1
                progress.frames_read = idx + 1
                if idx % params.stride:
                    continue
                if idx // params.stride >= max_frames:
                    break
                rec = an.run(frame, idx, fps)
                for d in rec["detections"]:
                    if d["class"] == "worker":
                        status_frames[d["ppe_assessment"]["status"]] += 1
                peak["workers"] = max(peak["workers"], rec["workers_visible"])
                peak["violations"] = max(peak["violations"], rec["potential_ppe_violations"])
                progress.offsets.append(jf.tell())
                jf.write((json.dumps(rec, separators=(",", ":")) + "\n").encode())
                jf.flush()
                if writer is not None:
                    writer.write(draw(frame, rec["detections"], params.zone))
                written += 1
                progress.frames_processed = written
                progress.instances = rec["detection_instances_processed"]
                progress.unique = rec["unique_worker_tracks"]
                progress.elapsed = time.perf_counter() - t_start
                progress.latest = {k: rec[k] for k in ("frame_number", "timestamp_seconds", "workers_visible", "hard_hats_detected", "safety_vests_detected", "potential_ppe_violations",
                                                       "uncertain_classifications", "compliant_workers", "unique_worker_tracks", "unique_tracks_with_potential_violation", "detection_instances_processed", "zone")}
    finally:
        cap.release()
        if writer is not None:
            writer.release()
    elapsed = time.perf_counter() - t_start
    n = max(1, an.timing["n"])
    outs.summary = {"frames_processed": written, "frames_read": progress.frames_read, "processing_seconds": round(elapsed, 3), "average_fps": round(written / elapsed, 2) if elapsed > 0 and written else 0.0,
                    "person_detection_ms_per_frame": round(an.timing["person_ms"] / n, 1), "ppe_detection_ms_per_frame": round(an.timing["ppe_ms"] / n, 1),
                    "unique_worker_tracks": len(an.confirmed), "unique_tracks_with_potential_violation": len(an.flagged), "detection_instances_processed": an.instances,
                    "peak_workers_visible": peak["workers"], "peak_potential_violations": peak["violations"], "worker_frame_assessments": status_frames,
                    "required_ppe": list(params.required), "zone": {"peak_workers_inside": an.zone_peak} if params.zone else None}
    if outs.video_mp4 and not (written and outs.video_mp4.is_file() and outs.video_mp4.stat().st_size > 0):
        outs.video_mp4 = None
    if outs.video_mp4 and not outs.video_webm:
        webm = out_dir / "processed.webm"
        if transcode_webm(outs.video_mp4, webm):
            outs.video_webm = webm
    if outs.video_webm and not (written and outs.video_webm.is_file()):
        outs.video_webm = None
    return outs
