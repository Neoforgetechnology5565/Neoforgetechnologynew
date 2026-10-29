"""In-memory document registry with bounded concurrency and expiry. State is temporary by design; no database."""
from __future__ import annotations

import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from .config import Settings
from .media import MediaError
from .ocr import Ocr
from .pipeline import Cancelled, Params, Progress, Result, analyse

FIELD_STATUSES = ("unreviewed", "confirmed", "corrected", "rejected")
DOC_STATUSES = ("unreviewed", "approved", "needs_rework", "rejected")


class QueueFull(RuntimeError):
    pass


@dataclass
class Document:
    id: str
    dir: Path
    path: Path
    fmt: str
    filename: str
    source: str  # "upload" | "sample:<id>"
    size: int
    params: Params | None = None
    status: str = "uploaded"  # uploaded | queued | running | completed | cancelled | failed
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    error: str | None = None
    progress: Progress = field(default_factory=Progress)
    result: Result | None = None
    review: dict = field(default_factory=lambda: {"status": "unreviewed", "note": "", "reviewed_at": None})
    cancel: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)


class JobManager:
    def __init__(self, settings: Settings, ocr: Ocr):
        self.s, self.ocr = settings, ocr
        self.docs: dict[str, Document] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrent_jobs), thread_name_prefix="docs-job")
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        for p in settings.work_dir.iterdir():  # leftovers from a previous run are never served
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self._stop = threading.Event()
        threading.Thread(target=self._reaper, name="docs-reaper", daemon=True).start()

    def new_dir(self) -> tuple[str, Path]:
        with self.lock:
            if len(self.docs) >= self.s.max_documents:
                raise QueueFull("Too many documents are stored right now. Delete one or wait for old ones to expire.")
        did = uuid.uuid4().hex
        d = self.s.work_dir / did
        d.mkdir(parents=True, exist_ok=False)
        return did, d

    def add(self, did: str, d: Path, path: Path, fmt: str, filename: str, source: str, size: int) -> Document:
        doc = Document(did, d, path, fmt, filename, source, size)
        with self.lock:
            self.docs[did] = doc
        return doc

    def get(self, did: str) -> Document | None:
        return self.docs.get(did) if len(did) == 32 and all(c in "0123456789abcdef" for c in did) else None

    def delete(self, doc: Document) -> None:
        doc.cancel.set()
        with self.lock:
            self.docs.pop(doc.id, None)
        shutil.rmtree(doc.dir, ignore_errors=True)

    def submit(self, doc: Document, params: Params) -> None:
        with self.lock:
            active = sum(1 for x in self.docs.values() if x.status in ("queued", "running"))
            if doc.status in ("queued", "running"):
                raise QueueFull("This document is already being processed.")
            if active >= self.s.max_concurrent_jobs + self.s.max_queued_jobs:
                raise QueueFull("The service is busy processing other documents. Please try again in a few minutes.")
            doc.params, doc.status, doc.error = params, "queued", None
            doc.progress, doc.result = Progress(), None
            doc.review = {"status": "unreviewed", "note": "", "reviewed_at": None}
            doc.cancel = threading.Event()
        self.pool.submit(self._run, doc)

    def _run(self, doc: Document) -> None:
        if doc.cancel.is_set():
            doc.status, doc.finished = "cancelled", time.time()
            return
        doc.status, doc.started = "running", time.time()
        try:
            doc.result = analyse(doc.path, doc.fmt, doc.params, self.ocr, doc.progress, doc.cancel.is_set, self.s)
            doc.finished = time.time()
            doc.status = "completed"
        except Cancelled:
            doc.finished, doc.status = time.time(), "cancelled"
        except MediaError as e:
            doc.finished, doc.status, doc.error = time.time(), "failed", str(e)
        except Exception as e:  # noqa: BLE001 - the job fails, the service keeps running
            doc.finished, doc.status = time.time(), "failed"
            doc.error = f"Processing failed: {type(e).__name__}"  # no internal paths or stack traces are exposed

    def _reaper(self) -> None:
        while not self._stop.wait(30):
            now = time.time()
            with self.lock:
                dead = []
                for x in self.docs.values():
                    if x.status in ("queued", "running"):
                        continue
                    base = x.created if x.status == "uploaded" else x.finished
                    if base is not None and base + self.s.ttl_seconds < now:
                        dead.append(x)
            for x in dead:
                self.delete(x)

    def shutdown(self) -> None:
        self._stop.set()
        for x in list(self.docs.values()):
            x.cancel.set()
        self.pool.shutdown(wait=False, cancel_futures=True)
