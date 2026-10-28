"""Frame-by-frame detection → tracking → counting → annotated video. Streams frames: memory use does not grow with video length."""
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
from .tracker import ByteTracker

COLORS = {"car": (255, 160, 40), "motorcycle": (60, 220, 255), "bus": (90, 210, 90), "truck": (80, 90, 255)}  # BGR


@dataclass
class JobParams:
    conf: float = 0.3
    stride: int = 1
    min_hits: int = 3
    line: tuple[float, float, float, float] | None = None  # normalised x1,y1,x2,y2 (0..1) of the virtual counting line
    write_video: bool = True


@dataclass
class Progress:
    frames_processed: int = 0  # frames that went through the detector
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


def _side(line: tuple[float, float, float, float], p: tuple[float, float]) -> float:
    x1, y1, x2, y2 = line
    return (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1)


def _crosses(line, a, b) -> bool:
    """True if segment a→b properly intersects the counting line segment."""
    def ccw(p, q, r):
        return (r[1] - p[1]) * (q[0] - p[0]) - (q[1] - p[1]) * (r[0] - p[0])
    p1, p2 = (line[0], line[1]), (line[2], line[3])
    d1, d2, d3, d4 = ccw(a, b, p1), ccw(a, b, p2), ccw(p1, p2, a), ccw(p1, p2, b)
    return d1 * d2 < 0 and d3 * d4 < 0


def draw(frame: np.ndarray, dets: list[dict], line_px, counts: dict, frame_no: int, t: float) -> np.ndarray:
    out = frame.copy()
    h, w = out.shape[:2]
    scale = max(0.7, min(w, h) / 560)
    for d in dets:
        b = d["bbox"]
        p1, p2 = (int(b["x1"]), int(b["y1"])), (int(b["x2"]), int(b["y2"]))
        color = COLORS.get(d["class"], (200, 200, 200))
        thick = max(1, int(round(2 * scale))) if d["track_id"] is not None else 1
        cv2.rectangle(out, p1, p2, color, thick)
        label = f'{d["class"]} {d["confidence"]:.2f}' + (f' #{d["track_id"]}' if d["track_id"] is not None else "")
        (tw, th), base = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5 * scale, 1)
        y0 = max(th + 4, p1[1])
        cv2.rectangle(out, (p1[0], y0 - th - 4), (p1[0] + tw + 4, y0 + base - 2), color, -1)
        cv2.putText(out, label, (p1[0] + 2, y0 - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.5 * scale, (10, 10, 10), 1, cv2.LINE_AA)
    if line_px:
        cv2.line(out, line_px[0], line_px[1], (0, 255, 255), max(2, int(2 * scale)))
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


def run_pipeline(input_path: Path, out_dir: Path, info: VideoInfo, params: JobParams, detector: YoloxDetector, progress: Progress, cancelled, max_frames: int) -> Outputs:
    outs = Outputs(jsonl=out_dir / "frames.jsonl")
    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError("The video could not be re-opened for processing.")
    fps = info.fps
    out_fps = fps / params.stride
    tracker = ByteTracker(high_thresh=max(0.5, params.conf + 0.1), low_thresh=min(0.1, params.conf), buffer_frames=max(5, int(round(1.0 * out_fps))))
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
    line_px = None
    if params.line:
        x1, y1, x2, y2 = params.line
        line_px = ((int(x1 * info.width), int(y1 * info.height)), (int(x2 * info.width), int(y2 * info.height)))
    line_abs = (params.line[0] * info.width, params.line[1] * info.height, params.line[2] * info.width, params.line[3] * info.height) if params.line else None

    confirmed: dict[int, str] = {}  # track_id -> current voted class, for tracks that reached min_hits
    last_centre: dict[int, tuple[float, float]] = {}
    last_cross: dict[int, int] = {}
    crossings = {"a_to_b": 0, "b_to_a": 0}
    detection_total = 0
    visible_peak = 0
    class_instances = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
    infer_time = 0.0
    t_start = time.perf_counter()
    idx = -1
    progress.total_frames_estimate = info.frames // params.stride if info.frames else 0
    written = 0
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
                t0 = time.perf_counter()
                dets = detector.detect(frame, conf=params.conf)
                infer_time += time.perf_counter() - t0
                boxes = np.array([[d.x1, d.y1, d.x2, d.y2] for d in dets], dtype=float).reshape(-1, 4)
                scores = np.array([d.score for d in dets], dtype=float)
                tracks = tracker.update(boxes, scores, [d.cls for d in dets])
                by_det = {t.det_index: t for t in tracks}
                records, visible = [], {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
                for i, d in enumerate(dets):
                    t = by_det.get(i)
                    cls = t.cls if t else d.cls
                    visible[cls] += 1
                    class_instances[cls] += 1
                    is_confirmed = bool(t and t.hits >= params.min_hits)
                    if t and is_confirmed:
                        confirmed[t.track_id] = t.cls
                    records.append({"track_id": t.track_id if t else None, "class": cls, "detected_class": d.cls, "confidence": round(d.score, 4), "confirmed": is_confirmed,
                                    "bbox": {"x1": round(d.x1, 1), "y1": round(d.y1, 1), "x2": round(d.x2, 1), "y2": round(d.y2, 1)}})
                    if t and is_confirmed and line_abs:
                        c = ((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2)
                        prev = last_centre.get(t.track_id)
                        if prev and _crosses(line_abs, prev, c) and idx - last_cross.get(t.track_id, -10**9) > max(2, int(fps / 2)):
                            crossings["a_to_b" if _side(line_abs, prev) < 0 else "b_to_a"] += 1
                            last_cross[t.track_id] = idx
                        last_centre[t.track_id] = c
                detection_total += len(dets)
                visible_peak = max(visible_peak, len(dets))
                unique_by_class = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
                for cls in confirmed.values():
                    unique_by_class[cls] += 1
                rec = {"frame_number": idx + 1, "frame_index": idx, "timestamp_seconds": round(idx / fps, 3), "vehicles_visible": len(dets), "tracked_visible": len(tracks),
                       "unique_tracks_observed": len(confirmed), "detection_instances_processed": detection_total, "detections": records, "class_counts": visible,
                       "unique_by_class": unique_by_class,
                       "line_crossings": {"a_to_b": crossings["a_to_b"], "b_to_a": crossings["b_to_a"], "total": crossings["a_to_b"] + crossings["b_to_a"]} if params.line else None}
                progress.offsets.append(jf.tell())
                jf.write((json.dumps(rec, separators=(",", ":")) + "\n").encode())
                jf.flush()
                if writer is not None:
                    writer.write(draw(frame, records, line_px, visible, idx + 1, idx / fps))
                written += 1
                progress.frames_processed = written
                progress.instances = detection_total
                progress.unique = len(confirmed)
                progress.elapsed = time.perf_counter() - t_start
                progress.latest = {k: rec[k] for k in ("frame_number", "timestamp_seconds", "vehicles_visible", "unique_tracks_observed", "detection_instances_processed", "class_counts", "unique_by_class", "line_crossings")}
    finally:
        cap.release()
        if writer is not None:
            writer.release()
    elapsed = time.perf_counter() - t_start
    unique_by_class = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
    for cls in confirmed.values():
        unique_by_class[cls] += 1
    outs.summary = {"frames_processed": written, "frames_read": progress.frames_read, "processing_seconds": round(elapsed, 3), "average_fps": round(written / elapsed, 2) if elapsed > 0 and written else 0.0,
                    "inference_ms_per_frame": round(1000 * infer_time / written, 1) if written else 0.0, "unique_tracks_observed": len(confirmed), "unique_by_class": unique_by_class,
                    "detection_instances_processed": detection_total, "instances_by_class": class_instances, "peak_vehicles_visible": visible_peak,
                    "line_crossings": {"a_to_b": crossings["a_to_b"], "b_to_a": crossings["b_to_a"], "total": crossings["a_to_b"] + crossings["b_to_a"]} if params.line else None}
    if outs.video_mp4 and not (written and outs.video_mp4.is_file() and outs.video_mp4.stat().st_size > 0):
        outs.video_mp4 = None
    if outs.video_mp4 and not outs.video_webm:
        webm = out_dir / "processed.webm"
        if transcode_webm(outs.video_mp4, webm):
            outs.video_webm = webm
    if outs.video_webm and not (written and outs.video_webm.is_file()):
        outs.video_webm = None
    return outs
