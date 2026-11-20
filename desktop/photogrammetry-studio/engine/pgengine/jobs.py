"""Background jobs. Every heavy operation runs in its own spawned worker process, so (1) the API and UI stay responsive, (2) Cancel really stops the work (the process is terminated, and the
project on disk is unchanged because a history entry is committed only at the very end), and (3) memory is returned to the OS afterwards."""
from __future__ import annotations

import multiprocessing as mp
import queue
import threading
import time
import traceback
import uuid


def _worker(pid: str, op: str, params: dict, q) -> None:  # runs in the child process
    try:
        from .common import Progress
        from .pipeline import run
        from .project import Project
        prog = Progress(lambda kind, data: q.put((kind, data)))
        e = run(Project.open(pid), op, params, prog); q.put(("done", {"entry": e["id"], "label": e["label"], "seconds": e["seconds"]}))
    except BaseException as ex:  # noqa: BLE001 - the message goes to the user, the traceback to the log
        q.put(("error", {"message": f"{type(ex).__name__}: {ex}" if not isinstance(ex, (ValueError, KeyError)) else str(ex).strip("'\""), "trace": traceback.format_exc()}))


class Job:
    def __init__(self, project: str, op: str, params: dict):
        self.id = uuid.uuid4().hex[:10]; self.project = project; self.op = op; self.params = params; self.state = "queued"; self.stage = ""; self.fraction = 0.0; self.logs: list[dict] = []
        self.result: dict | None = None; self.error: str | None = None; self.started = time.time(); self.finished: float | None = None; self.proc: mp.Process | None = None; self.cancelled = False

    def view(self) -> dict:
        return {"id": self.id, "project": self.project, "op": self.op, "state": self.state, "stage": self.stage, "fraction": self.fraction, "logs": self.logs[-400:], "result": self.result, "error": self.error,
                "elapsed": round((self.finished or time.time()) - self.started, 1)}


class JobManager:
    def __init__(self):
        self.jobs: dict[str, Job] = {}; self.lock = threading.Lock(); self.ctx = mp.get_context("spawn")

    def active(self, project: str) -> Job | None:
        return next((j for j in self.jobs.values() if j.project == project and j.state in ("queued", "running")), None)

    def start(self, project: str, op: str, params: dict) -> Job:
        with self.lock:
            if self.active(project): raise RuntimeError("Another operation is still running for this project. Wait for it or cancel it.")
            job = Job(project, op, params); self.jobs[job.id] = job
        q = self.ctx.Queue(); job.proc = self.ctx.Process(target=_worker, args=(project, op, params, q), daemon=True); job.proc.start(); job.state = "running"
        threading.Thread(target=self._pump, args=(job, q), daemon=True).start(); return job

    def _pump(self, job: Job, q) -> None:
        while True:
            try: kind, data = q.get(timeout=0.3)
            except queue.Empty:
                if job.cancelled: return
                if job.proc and not job.proc.is_alive() and q.empty():
                    if job.state == "running": job.state = "error"; job.error = "The worker process stopped unexpectedly (possibly out of memory). Try downsampling the cloud or a lower reconstruction depth."; job.finished = time.time()
                    return
                continue
            if kind == "progress": job.stage = data["stage"]; job.fraction = data["fraction"]
            elif kind == "log": job.logs.append({"t": round(time.time() - job.started, 1), **data})
            elif kind == "done": job.state = "done"; job.result = data; job.fraction = 1.0; job.finished = time.time(); job.logs.append({"t": round(time.time() - job.started, 1), "level": "info", "message": f"Done: {data['label']}"}); return
            elif kind == "error": job.state = "error"; job.error = data["message"]; job.finished = time.time(); job.logs.append({"t": round(time.time() - job.started, 1), "level": "error", "message": data["message"]}); return

    def cancel(self, jid: str) -> Job:
        job = self.jobs[jid]
        if job.state in ("queued", "running"):
            job.cancelled = True
            if job.proc and job.proc.is_alive(): job.proc.terminate(); job.proc.join(5)
            job.state = "cancelled"; job.finished = time.time(); job.logs.append({"t": round(time.time() - job.started, 1), "level": "warn", "message": "Cancelled by the user. The project was not changed."})
        return job

    def shutdown(self) -> None:
        for j in self.jobs.values():
            if j.proc and j.proc.is_alive(): j.proc.terminate()
