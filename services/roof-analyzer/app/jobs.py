"""In-memory job registry with bounded concurrency, cancellation and expiry. Job state is temporary by design; no database."""
from __future__ import annotations

import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from .config import Settings
from .media import MediaError, decode_image
from .model import RoofSegmenter
from .pipeline import Params, analyse_image


class QueueFull(RuntimeError):
    pass


@dataclass
class Job:
    id: str
    dir: Path
    files: list[tuple[str, Path]]  # (display name, stored path)
    params: Params
    status: str = "queued"  # queued | running | completed | cancelled | failed
    created: float = field(default_factory=time.time)
    finished: float | None = None
    error: str | None = None
    stage: str = "queued"
    images_done: int = 0
    results: list[dict] = field(default_factory=list)  # one per image: {"index", "ok", "result"|"error"}
    artifacts: dict[int, dict[str, Path]] = field(default_factory=dict)
    cancel: threading.Event = field(default_factory=threading.Event)
    started: float | None = None


class JobManager:
    def __init__(self, settings: Settings, model: RoofSegmenter):
        self.s, self.model = settings, model
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrent_jobs), thread_name_prefix="roof-job")
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        for p in settings.work_dir.iterdir():
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self._stop = threading.Event()
        threading.Thread(target=self._reaper, name="roof-reaper", daemon=True).start()

    def new_dir(self) -> tuple[str, Path]:
        jid = uuid.uuid4().hex
        d = self.s.work_dir / jid
        d.mkdir(parents=True, exist_ok=False)
        return jid, d

    def submit(self, jid: str, d: Path, files: list[tuple[str, Path]], params: Params) -> Job:
        with self.lock:
            active = sum(1 for j in self.jobs.values() if j.status in ("queued", "running"))
            if active >= self.s.max_concurrent_jobs + self.s.max_queued_jobs:
                shutil.rmtree(d, ignore_errors=True)
                raise QueueFull("The demonstration is busy analysing other images. Please try again in a minute.")
            job = Job(jid, d, files, params)
            self.jobs[jid] = job
        self.pool.submit(self._run, job)
        return job

    def get(self, jid: str) -> Job | None:
        return self.jobs.get(jid) if len(jid) == 32 and all(c in "0123456789abcdef" for c in jid) else None

    def delete(self, job: Job) -> None:
        job.cancel.set()
        with self.lock:
            self.jobs.pop(job.id, None)
        shutil.rmtree(job.dir, ignore_errors=True)

    def _run(self, job: Job) -> None:
        if job.cancel.is_set():
            job.status, job.finished = "cancelled", time.time()
            return
        job.status, job.started = "running", time.time()
        try:
            for i, (name, path) in enumerate(job.files):
                if job.cancel.is_set():
                    break
                job.stage = f"image {i + 1} of {len(job.files)}: reading"
                try:
                    dec = decode_image(path.read_bytes(), self.s.max_pixels)
                    job.stage = f"image {i + 1} of {len(job.files)}: segmenting roofs"
                    out = analyse_image(dec, name, job.params, self.model, job.dir / f"img{i}", job.cancel.is_set)
                    job.results.append({"index": i, "ok": True, "result": out.result})
                    job.artifacts[i] = out.files
                except InterruptedError:
                    break
                except MediaError as e:
                    job.results.append({"index": i, "ok": False, "name": name, "error": str(e)})
                except Exception as e:  # noqa: BLE001 - one bad image does not fail the session
                    job.results.append({"index": i, "ok": False, "name": name, "error": f"Analysis failed ({type(e).__name__})."})
                job.images_done = i + 1
            job.status = "cancelled" if job.cancel.is_set() else ("failed" if job.results and not any(r["ok"] for r in job.results) else "completed")
            if job.status == "failed":
                job.error = "None of the images could be analysed."
        except Exception as e:  # noqa: BLE001
            job.status, job.error = "failed", f"Processing failed ({type(e).__name__})."
        finally:
            job.finished, job.stage = time.time(), job.status

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
