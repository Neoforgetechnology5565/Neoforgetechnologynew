"""In-memory job registry with bounded concurrency, cancellation and expiry. Job state is temporary by design; no database."""
from __future__ import annotations

import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import pycolmap

from .config import Settings
from .depth import DepthModel
from .media import VideoInfo
from .pipeline import STAGES, Artifact, Cancelled, Params, run_reconstruction
from .sfm import ReconstructionFailed


class QueueFull(RuntimeError):
    pass


@dataclass
class Job:
    id: str
    dir: Path
    kind: str  # reconstruct | import
    status: str = "queued"  # queued | running | completed | cancelled | failed
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    error: str | None = None
    params: Params = field(default_factory=Params)
    inputs: dict = field(default_factory=dict)
    input_files: list[Path] = field(default_factory=list)
    is_video: bool = False
    video_info: VideoInfo | None = None
    stages: dict[str, dict] = field(default_factory=lambda: {n: {"state": "pending", "detail": ""} for n, _ in STAGES})
    current: str = "queued"
    artifacts: dict[str, Artifact] = field(default_factory=dict)
    report: dict | None = None
    warnings: list[str] = field(default_factory=list)
    cancel: threading.Event = field(default_factory=threading.Event)
    token: "pycolmap.CancellationToken" = field(default_factory=pycolmap.CancellationToken)
    op_count: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def progress(self) -> float:
        total = sum(w for _, w in STAGES)
        done = sum(w for n, w in STAGES if self.stages[n]["state"] in ("done", "skipped", "unsupported", "failed"))
        return 1.0 if self.status == "completed" else min(0.99, done / total)


class JobManager:
    def __init__(self, settings: Settings, depth: DepthModel | None):
        self.s, self.depth = settings, depth
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrent_jobs), thread_name_prefix="spatial-job")
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        for p in settings.work_dir.iterdir():
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self._stop = threading.Event()
        threading.Thread(target=self._reaper, name="spatial-reaper", daemon=True).start()

    def new_dir(self) -> tuple[str, Path]:
        jid = uuid.uuid4().hex
        d = self.s.work_dir / jid
        d.mkdir(parents=True, exist_ok=False)
        return jid, d

    def register(self, job: Job) -> Job:
        with self.lock:
            self.jobs[job.id] = job
        return job

    def submit(self, job: Job) -> Job:
        with self.lock:
            active = sum(1 for j in self.jobs.values() if j.status in ("queued", "running") and j.kind == "reconstruct")
            if active >= self.s.max_concurrent_jobs + self.s.max_queued_jobs:
                shutil.rmtree(job.dir, ignore_errors=True)
                raise QueueFull("The demonstration is busy reconstructing other scenes. Please try again in a few minutes.")
            self.jobs[job.id] = job
        self.pool.submit(self._run, job)
        return job

    def get(self, jid: str) -> Job | None:
        return self.jobs.get(jid) if len(jid) == 32 and all(c in "0123456789abcdef" for c in jid) else None

    def cancel(self, job: Job) -> None:
        job.cancel.set()
        job.token.cancel()

    def delete(self, job: Job) -> None:
        self.cancel(job)
        with self.lock:
            self.jobs.pop(job.id, None)
        shutil.rmtree(job.dir, ignore_errors=True)

    def _status(self, job: Job):
        def cb(name: str, state: str, detail: str = ""):
            job.stages[name] = {**job.stages.get(name, {}), "state": state, "detail": detail}
            if state == "running":
                job.current = name
        return cb

    def _run(self, job: Job) -> None:
        if job.cancel.is_set():
            job.status, job.finished = "cancelled", time.time()
            return
        job.status, job.started = "running", time.time()
        try:
            job.report = run_reconstruction(job.dir, job.input_files, job.is_video, job.video_info, job.params, self.s, self.depth, job.token, self._status(job), job.artifacts, job.cancel.is_set)
            job.warnings = job.report["warnings"]
            job.status = "cancelled" if job.cancel.is_set() else "completed"
        except Cancelled:
            job.status = "cancelled"
        except ReconstructionFailed as e:
            job.status, job.error = "failed", str(e)
        except InterruptedError:
            job.status = "cancelled"
        except Exception as e:  # noqa: BLE001 - the job fails, the service keeps running
            job.status, job.error = "failed", f"Processing failed ({type(e).__name__}). The input may be unsuitable for reconstruction."
        finally:
            job.finished = time.time()
            if job.status != "completed":
                for a in job.artifacts.values():
                    if a.status in ("pending", "processing"):
                        a.status, a.detail = ("failed" if job.status == "failed" else "not_requested"), ("The job failed before this output was produced." if job.status == "failed" else "The job was cancelled.")
                for n, st in job.stages.items():
                    if st["state"] == "running":
                        job.stages[n] = {**st, "state": "failed" if job.status == "failed" else "cancelled"}
            # raw uploads are not needed after processing
            for f in job.input_files:
                f.unlink(missing_ok=True)

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
            self.cancel(j)
        self.pool.shutdown(wait=False, cancel_futures=True)
