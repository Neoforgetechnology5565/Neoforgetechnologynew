"""In-memory job registry with bounded concurrency, cancellation and expiry. Job state is temporary by design; no database."""
from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from .config import Settings
from .detector import YoloxDetector
from .media import VideoInfo
from .pipeline import JobParams, Outputs, Progress, run_pipeline


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
    outputs: Outputs | None = None
    cancel: threading.Event = field(default_factory=threading.Event)
    _lock: threading.Lock = field(default_factory=threading.Lock)


class JobManager:
    def __init__(self, settings: Settings, detector: YoloxDetector):
        self.s, self.detector = settings, detector
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrent_jobs), thread_name_prefix="vehicle-job")
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        for p in settings.work_dir.iterdir():  # leftovers from a previous run are never served
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self._stop = threading.Event()
        threading.Thread(target=self._reaper, name="vehicle-reaper", daemon=True).start()

    # ---- creation -------------------------------------------------------------------------------------------------
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
                raise QueueFull("The demonstration is busy processing other videos. Please try again in a minute.")
            job = Job(jid, d, input_path, info, params, source)
            self.jobs[jid] = job
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

    # ---- execution ------------------------------------------------------------------------------------------------
    def _run(self, job: Job) -> None:
        if job.cancel.is_set():
            job.status, job.finished = "cancelled", time.time()
            return
        job.status, job.started = "running", time.time()
        try:
            job.outputs = run_pipeline(job.input_path, job.dir, job.info, job.params, self.detector, job.progress, job.cancel.is_set, self.s.max_frames)
            job.status = "cancelled" if job.cancel.is_set() else "completed"
        except Exception as e:  # noqa: BLE001 - the job fails, the service keeps running
            job.status = "failed"
            job.error = f"Processing failed: {type(e).__name__}"  # no internal paths or stack traces are exposed
            job.error_detail = str(e)[:200] if isinstance(e, (RuntimeError, ValueError)) else None
        finally:
            job.finished = time.time()

    # ---- reading results ------------------------------------------------------------------------------------------
    def frames(self, job: Job, start: int, limit: int) -> list[dict]:
        """Frame records [start, start+limit) that have been fully written so far."""
        path = job.dir / "frames.jsonl"
        n = len(job.progress.offsets)
        if start >= n or not path.is_file():
            return []
        res: list[dict] = []
        with open(path, "rb") as f:
            f.seek(job.progress.offsets[start])
            for _ in range(min(limit, n - start)):
                line = f.readline()
                if not line.endswith(b"\n"):
                    break
                res.append(json.loads(line))
        return res

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
