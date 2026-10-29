"""In-memory job registry with bounded concurrency, cancellation and expiry. Job state is temporary by design; no database."""
from __future__ import annotations

import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from .config import Settings
from .footandball import FootAndBall
from .media import VideoInfo
from .pipeline import Analysis, Cancelled, JobParams, Progress, analyse, build_results


class QueueFull(RuntimeError):
    pass


@dataclass
class Job:
    id: str
    dir: Path
    input_path: Path
    info: VideoInfo
    params: JobParams
    source: str  # "upload" | "sample:<id>"
    status: str = "queued"  # queued | running | completed | cancelled | failed
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    error: str | None = None
    error_detail: str | None = None
    progress: Progress = field(default_factory=Progress)
    analysis: Analysis | None = None
    preview: Path | None = None  # H.264 proxy for browsers, when ffmpeg is available
    preview_webm: Path | None = None  # VP9 proxy for browsers without H.264 (open-source Chromium builds)
    preview_state: str = "pending"  # pending | ready | unavailable
    cancel: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)


class JobManager:
    def __init__(self, settings: Settings, detector: FootAndBall):
        self.s, self.det = settings, detector
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrent_jobs), thread_name_prefix="sports-job")
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        for p in settings.work_dir.iterdir():  # leftovers from a previous run are never served
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self._stop = threading.Event()
        threading.Thread(target=self._reaper, name="sports-reaper", daemon=True).start()

    def new_dir(self) -> tuple[str, Path]:
        jid = uuid.uuid4().hex
        d = self.s.work_dir / jid
        d.mkdir(parents=True, exist_ok=False)
        return jid, d

    def submit(self, jid: str, d: Path, input_path: Path, info: VideoInfo, params: JobParams, source: str) -> Job:
        with self.lock:
            active = sum(1 for j in self.jobs.values() if j.status in ("queued", "running"))
            if active >= self.s.max_concurrent_jobs + self.s.max_queued_jobs:
                shutil.rmtree(d, ignore_errors=True)
                raise QueueFull("The service is busy analysing other videos. Please try again in a few minutes.")
            job = Job(jid, d, input_path, info, params, source)
            self.jobs[jid] = job
        threading.Thread(target=self._make_preview, args=(job,), name="sports-preview", daemon=True).start()
        self.pool.submit(self._run, job)
        return job

    def get(self, jid: str) -> Job | None:
        return self.jobs.get(jid) if len(jid) == 32 and all(c in "0123456789abcdef" for c in jid) else None

    def cancel(self, job: Job) -> None:
        job.cancel.set()

    def delete(self, job: Job) -> None:
        job.cancel.set()
        with self.lock:
            self.jobs.pop(job.id, None)
        shutil.rmtree(job.dir, ignore_errors=True)

    # ---- execution --------------------------------------------------------------------------------------------------
    def _make_preview(self, job: Job) -> None:
        """Browser-playable proxies (H.264 MP4, then VP9 WebM). Overlay coordinates stay in source pixels; the player scales them by the video's natural size."""
        ff = shutil.which("ffmpeg")
        if not ff:
            job.preview_state = "unavailable"
            return
        w = min(self.s.preview_width, job.info.width)
        w -= w % 2
        base = [ff, "-nostdin", "-y", "-loglevel", "error", "-i", str(job.input_path), "-an", "-vf", f"scale={w}:-2"]

        def run(args: list[str], out: Path) -> bool:
            try:
                r = subprocess.run(base + args + [str(out)], capture_output=True, timeout=1800)
                return r.returncode == 0 and out.is_file() and out.stat().st_size > 0 and not job.cancel.is_set()
            except (subprocess.SubprocessError, OSError):
                return False

        mp4, webm = job.dir / "preview.mp4", job.dir / "preview.webm"
        remaining = [2]
        lock = threading.Lock()

        def finish(kind: str, ok: bool, out: Path) -> None:
            with lock:
                if ok:
                    setattr(job, "preview" if kind == "mp4" else "preview_webm", out)
                    job.preview_state = "ready"  # as soon as either format exists; /video?format= says which
                remaining[0] -= 1
                if remaining[0] == 0 and job.preview_state != "ready":
                    job.preview_state = "unavailable"

        def one(kind: str, args: list[str], out: Path) -> None:
            finish(kind, run(args, out), out)

        t = threading.Thread(target=one, args=("webm", ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "35", "-b:v", "0", "-g", "25"], webm), daemon=True)
        t.start()
        one("mp4", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-g", "25", "-movflags", "+faststart"], mp4)
        t.join()

    def _run(self, job: Job) -> None:
        if job.cancel.is_set():
            job.status, job.finished = "cancelled", time.time()
            return
        job.status, job.started = "running", time.time()
        try:
            an = analyse(job.input_path, job.info, job.params, self.det, job.progress, job.cancel.is_set, self.s.max_samples)
            job.progress.stage = "deriving"
            t = time.perf_counter()
            an.results = build_results(an, job.params.calibration)
            job.progress.stage_seconds["derive"] = round(time.perf_counter() - t, 2)
            job.analysis = an
            job.status = "completed"
            job.progress.stage = "done"
        except Cancelled:
            job.status = "cancelled"
        except Exception as e:  # noqa: BLE001 - the job fails, the service keeps running
            job.status = "failed"
            job.error = f"Processing failed: {type(e).__name__}"  # no internal paths or stack traces are exposed
            job.error_detail = str(e)[:240] if isinstance(e, (RuntimeError, ValueError)) else None
        finally:
            job.finished = time.time()

    def calibrate(self, job: Job, calibration: dict | None) -> dict:
        """Re-derive pitch positions, statistics and events from the stored observations. The video is not reprocessed."""
        with job.lock:
            if not job.analysis:
                raise RuntimeError("not ready")
            job.params.calibration = calibration
            job.analysis.results = build_results(job.analysis, calibration)
            return job.analysis.results

    def _reaper(self) -> None:
        while not self._stop.wait(30):
            now = time.time()
            with self.lock:
                dead = [j for j in self.jobs.values() if j.status in ("completed", "failed", "cancelled") and (j.finished or now) + self.s.job_ttl_seconds < now]
            for j in dead:
                self.delete(j)

    def shutdown(self) -> None:
        self._stop.set()
        for j in list(self.jobs.values()):
            j.cancel.set()
        self.pool.shutdown(wait=False, cancel_futures=True)
