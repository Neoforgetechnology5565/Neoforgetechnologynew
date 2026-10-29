"""In-memory video and job registry with bounded concurrency, a bounded queue and expiry. State is temporary by design: nothing is kept after the TTL."""
from __future__ import annotations

import hashlib
import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .config import Settings
from .detector import Detector
from .media import VideoInfo
from .pipeline import Analysis, Cancelled, JobParams, Progress, analyse


class QueueFull(RuntimeError):
    pass


@dataclass
class Video:
    id: str
    dir: Path
    input_path: Path
    info: VideoInfo
    source: str
    playback: Path | None = None
    playback_webm: Path | None = None
    playback_state: str = "pending"   # pending | ready | unavailable
    params: JobParams | None = None
    status: str = "uploaded"          # uploaded | queued | running | completed | cancelled | failed
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    error: str | None = None
    progress: Progress = field(default_factory=Progress)
    analysis: Analysis | None = None
    clips: dict[str, tuple[Path, Path | None]] = field(default_factory=dict)
    cancel: threading.Event = field(default_factory=threading.Event)
    clip_lock: threading.Lock = field(default_factory=threading.Lock)


def ffmpeg_ok() -> bool:
    return shutil.which("ffmpeg") is not None


def encode(src: Path, dst: Path, kind: str = "mp4", width: int = 960, timeout: int = 240) -> bool:
    """Re-encode to a browser-playable file without audio: H.264 MP4 (Safari, Chrome, Edge) or VP9 WebM (Chrome, Firefox, Edge, and Chromium builds without H.264).
    Returns False if ffmpeg is missing or fails; callers then say so."""
    if not ffmpeg_ok():
        return False
    codec = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart"] if kind == "mp4" else ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "36", "-b:v", "0", "-g", "30", "-pix_fmt", "yuv420p"]
    try:
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", f"scale='min({width},iw)':-2", *codec, "-an", str(dst)], capture_output=True, timeout=timeout)
        return r.returncode == 0 and dst.is_file() and dst.stat().st_size > 0
    except (subprocess.TimeoutExpired, OSError):
        return False


class JobManager:
    def __init__(self, settings: Settings, det: Detector):
        self.s, self.det = settings, det
        self.videos: dict[str, Video] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrent_jobs), thread_name_prefix="vi-job")
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        for p in settings.work_dir.iterdir():
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self._stop = threading.Event()
        threading.Thread(target=self._reaper, name="vi-reaper", daemon=True).start()

    def new_dir(self) -> tuple[str, Path]:
        with self.lock:
            if len(self.videos) >= self.s.max_videos:
                raise QueueFull("Too many videos are stored right now. Delete one or wait for old ones to expire.")
        vid = uuid.uuid4().hex
        d = self.s.work_dir / vid
        d.mkdir(parents=True, exist_ok=False)
        return vid, d

    def add(self, vid: str, d: Path, input_path: Path, info: VideoInfo, source: str) -> Video:
        v = Video(vid, d, input_path, info, source)
        with self.lock:
            self.videos[vid] = v
        threading.Thread(target=self._playback, args=(v,), name="vi-playback", daemon=True).start()
        return v

    def get(self, vid: str) -> Video | None:
        return self.videos.get(vid) if len(vid) == 32 and all(c in "0123456789abcdef" for c in vid) else None

    def delete(self, v: Video) -> None:
        v.cancel.set()
        with self.lock:
            self.videos.pop(v.id, None)
        shutil.rmtree(v.dir, ignore_errors=True)

    def submit(self, v: Video, params: JobParams) -> None:
        with self.lock:
            active = sum(1 for x in self.videos.values() if x.status in ("queued", "running"))
            if active >= self.s.max_concurrent_jobs + self.s.max_queued_jobs:
                raise QueueFull("The service is busy analysing other videos. Please try again in a few minutes.")
            if v.status in ("queued", "running"):
                raise QueueFull("This video is already being processed.")
            v.params, v.status, v.error = params, "queued", None
            v.progress, v.analysis = Progress(), None
            v.cancel = threading.Event()
        self.pool.submit(self._run, v)

    def _run(self, v: Video) -> None:
        if v.cancel.is_set():
            v.status, v.finished = "cancelled", time.time()
            return
        v.status, v.started = "running", time.time()
        try:
            v.analysis = analyse(v.input_path, v.info, v.params, self.det, v.progress, v.cancel.is_set, self.s.max_samples)
            v.status, v.progress.stage = "completed", "done"
        except Cancelled:
            v.status = "cancelled"
        except ValueError as e:
            v.status, v.error = "failed", str(e)
        except Exception:  # noqa: BLE001
            v.status, v.error = "failed", "The video could not be analysed. It may be damaged or use an unsupported codec."
        v.finished = time.time()

    def _playback(self, v: Video) -> None:
        mp4, webm = v.dir / "playback.mp4", v.dir / "playback.webm"
        a, b = encode(v.input_path, mp4, "mp4"), encode(v.input_path, webm, "webm")
        v.playback, v.playback_webm = (mp4 if a else None), (webm if b else None)
        v.playback_state = "ready" if (a or b) else "unavailable"

    def clip(self, v: Video, t0: float, t1: float, track_ids: list[int], roi: list[list[float]] | None) -> tuple[str, tuple[Path, Path | None]]:
        """Cut a REAL evidence clip from the source video and draw the tracked boxes of the analysed frames on it. Cached per request."""
        key = hashlib.sha1(f"{t0:.2f}|{t1:.2f}|{sorted(track_ids)}|{roi}".encode()).hexdigest()[:12]
        with v.clip_lock:
            if key in v.clips and v.clips[key][0].is_file():
                return key, v.clips[key]
            an = v.analysis
            if an is None:
                raise ValueError("Analyse the video first.")
            cap = cv2.VideoCapture(str(v.input_path))
            fps = v.info.fps
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, int(t0 * fps)))
            raw = v.dir / f"clip_{key}_raw.mp4"
            w, h = v.info.width, v.info.height
            sc = min(1.0, 960 / w)
            size = (int(w * sc) // 2 * 2, int(h * sc) // 2 * 2)
            vw = cv2.VideoWriter(str(raw), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
            frames = an.frames
            fi = int(t0 * fps)
            end = int(t1 * fps)
            n = 0
            while fi <= end:
                ok, fr = cap.read()
                if not ok:
                    break
                t = fi / fps
                j = min(range(len(frames)), key=lambda i: abs(frames[i]["t"] - t)) if frames else None
                if j is not None and abs(frames[j]["t"] - t) <= 1.5 / max(an.effective_fps, 1):
                    for p in frames[j]["persons"]:
                        hot = p["id"] in track_ids
                        x0, y0, x1, y1 = (int(c) for c in p["box"])
                        col = (74, 131, 22) if hot else (160, 160, 160)
                        cv2.rectangle(fr, (x0, y0), (x1, y1), col, 3 if hot else 1)
                        if hot:
                            cv2.putText(fr, f"track {p['id']}", (x0, max(14, y0 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2, cv2.LINE_AA)
                if roi:
                    cv2.polylines(fr, [np.array(roi, np.int32)], True, (74, 131, 22), 2)
                cv2.putText(fr, f"{t:6.2f}s", (8, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
                vw.write(cv2.resize(fr, size) if sc < 1 else fr)
                n += 1
                fi += 1
            vw.release()
            cap.release()
            if n == 0:
                raw.unlink(missing_ok=True)
                raise ValueError("No frames could be read for this time range.")
            out, web = v.dir / f"clip_{key}.mp4", v.dir / f"clip_{key}.webm"
            a, b = encode(raw, out, "mp4", timeout=120), encode(raw, web, "webm", timeout=120)
            raw.unlink(missing_ok=True)
            if not (a or b):
                raise RuntimeError("clip encoding unavailable")
            v.clips[key] = (out if a else web, web if b else None)
            return key, v.clips[key]

    def _reaper(self) -> None:
        while not self._stop.wait(60):
            now = time.time()
            with self.lock:
                old = [v for v in self.videos.values() if now - (v.finished or v.created) > self.s.job_ttl_seconds and v.status not in ("queued", "running")]
            for v in old:
                self.delete(v)

    def shutdown(self) -> None:
        self._stop.set()
        self.pool.shutdown(wait=False, cancel_futures=True)
