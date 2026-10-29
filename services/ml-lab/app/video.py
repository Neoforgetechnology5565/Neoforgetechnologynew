"""Bounded background jobs for video demos plus a small annotated-MP4 writer."""
from __future__ import annotations

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


@dataclass
class Job:
    id: str
    dir: Path
    kind: str
    status: str = "queued"
    done: int = 0
    total: int = 0
    error: str | None = None
    result: dict | None = None
    created: float = field(default_factory=time.time)
    finished: float | None = None
    cancel: threading.Event = field(default_factory=threading.Event)


class Jobs:
    def __init__(self, work: Path, ttl: int, workers: int = 1, queue: int = 3):
        self.work, self.ttl, self.queue = work, ttl, queue
        self.work.mkdir(parents=True, exist_ok=True)
        for p in self.work.iterdir():
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self.jobs: dict[str, Job] = {}
        self.workers = workers
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="ml-job")
        self._stop = threading.Event()
        threading.Thread(target=self._reap, daemon=True).start()

    def submit(self, kind: str, fn, *args) -> Job:
        with self.lock:
            if sum(1 for j in self.jobs.values() if j.status in ("queued", "running")) >= self.workers + self.queue:
                raise RuntimeError("busy")
            jid = uuid.uuid4().hex
            d = self.work / jid
            d.mkdir(parents=True)
            job = self.jobs[jid] = Job(jid, d, kind)
        self.pool.submit(self._run, job, fn, args)
        return job

    def _run(self, job: Job, fn, args) -> None:
        job.status = "running"
        try:
            job.result = fn(job, *args)
            job.status = "cancelled" if job.cancel.is_set() else "completed"
        except Exception as e:  # noqa: BLE001
            job.status, job.error = "failed", (str(e)[:200] if isinstance(e, (ValueError, RuntimeError)) else f"Processing failed: {type(e).__name__}")
        job.finished = time.time()

    def get(self, jid: str) -> Job | None:
        return self.jobs.get(jid) if len(jid) == 32 and all(c in "0123456789abcdef" for c in jid) else None

    def delete(self, job: Job) -> None:
        job.cancel.set()
        with self.lock:
            self.jobs.pop(job.id, None)
        shutil.rmtree(job.dir, ignore_errors=True)

    def _reap(self) -> None:
        while not self._stop.wait(30):
            now = time.time()
            for j in [j for j in list(self.jobs.values()) if j.status not in ("queued", "running") and j.finished and j.finished + self.ttl < now]:
                self.delete(j)

    def shutdown(self) -> None:
        self._stop.set()
        self.pool.shutdown(wait=False, cancel_futures=True)


def probe(path: Path, max_seconds: int) -> tuple[int, int, float, int]:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise ValueError("The video could not be opened. It may be damaged or use an unsupported codec (H.264 MP4 or WebM are the safest choices).")
        fps, n = float(cap.get(cv2.CAP_PROP_FPS) or 0), int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        ok, f = cap.read()
        if not ok:
            raise ValueError("No frame could be decoded from this video.")
        fps = fps if 1 <= fps <= 240 else 25.0
        if n and n / fps > max_seconds:
            raise ValueError(f"The video is {n / fps:.0f} s long; this demo accepts up to {max_seconds} s.")
        return f.shape[1], f.shape[0], fps, n
    finally:
        cap.release()


class Writer:
    """H.264 MP4 via ffmpeg (raw BGR frames on stdin)."""

    def __init__(self, dst: Path, w: int, h: int, fps: float):
        ff = shutil.which("ffmpeg")
        if not ff:
            raise RuntimeError("ffmpeg is not available on this server, so no annotated video can be written")
        self.w, self.h = w - w % 2, h - h % 2
        self.p = subprocess.Popen([ff, "-nostdin", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{self.w}x{self.h}", "-r", f"{fps:.3f}", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)], stdin=subprocess.PIPE)

    def write(self, f: np.ndarray) -> None:
        if f.shape[1] != self.w or f.shape[0] != self.h:
            f = cv2.resize(f, (self.w, self.h), interpolation=cv2.INTER_AREA)
        self.p.stdin.write(np.ascontiguousarray(f).tobytes())

    def close(self) -> None:
        self.p.stdin.close()
        if self.p.wait(timeout=300) != 0:
            raise RuntimeError("encoding failed")
