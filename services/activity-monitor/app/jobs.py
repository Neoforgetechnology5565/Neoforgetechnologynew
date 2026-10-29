"""In-memory video/job registry with bounded concurrency and expiry. State is temporary by design; no database."""
from __future__ import annotations

import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from .activity import Candidate
from .config import Settings
from .detector import PersonDetector
from .media import VideoInfo
from .pipeline import Analysis, Cancelled, JobParams, Progress, analyse
from .pose import PoseEstimator

STATUSES = ("pending", "confirmed", "dismissed", "uncertain")


class QueueFull(RuntimeError):
    pass


@dataclass
class Alert:
    id: str
    cand: Candidate
    status: str = "pending"
    note: str = ""
    reviewed_at: float | None = None

    def public(self) -> dict:
        d = self.cand.public()
        d.update(id=self.id, status=self.status, note=self.note, reviewed_at=self.reviewed_at,
                 title={"fall": "Possible fall (candidate)", "aggression": "Possible rapid close-contact motion (candidate)"}[self.cand.kind])
        return d


@dataclass
class Video:
    id: str
    dir: Path
    input_path: Path
    info: VideoInfo
    source: str  # "upload" | "sample:<id>"
    params: JobParams | None = None
    status: str = "uploaded"  # uploaded | queued | running | completed | cancelled | failed
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    error: str | None = None
    error_detail: str | None = None
    progress: Progress = field(default_factory=Progress)
    analysis: Analysis | None = None
    alerts: list[Alert] = field(default_factory=list)
    preview: Path | None = None
    preview_webm: Path | None = None
    preview_state: str = "pending"
    preview_done: bool = False  # every preview format has been attempted
    cancel: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)
    render_lock: threading.Lock = field(default_factory=threading.Lock)


def make_alerts(vid: str, cands: list[Candidate]) -> list[Alert]:
    return [Alert(f"{vid}-{i + 1}", c) for i, c in enumerate(cands)]


class JobManager:
    def __init__(self, settings: Settings, det: PersonDetector, pose: PoseEstimator):
        self.s, self.det, self.pose = settings, det, pose
        self.videos: dict[str, Video] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrent_jobs), thread_name_prefix="activity-job")
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        for p in settings.work_dir.iterdir():  # leftovers from a previous run are never served
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self._stop = threading.Event()
        threading.Thread(target=self._reaper, name="activity-reaper", daemon=True).start()

    # ---- registry ---------------------------------------------------------------------------------------------------
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
        threading.Thread(target=self._make_preview, args=(v,), name="activity-preview", daemon=True).start()
        return v

    def get(self, vid: str) -> Video | None:
        return self.videos.get(vid) if len(vid) == 32 and all(c in "0123456789abcdef" for c in vid) else None

    def find_alert(self, alert_id: str) -> tuple[Video, Alert] | None:
        vid, _, n = alert_id.partition("-")
        v = self.get(vid)
        if not v or not n.isdigit():
            return None
        a = next((x for x in v.alerts if x.id == alert_id), None)
        return (v, a) if a else None

    def delete(self, v: Video) -> None:
        v.cancel.set()
        with self.lock:
            self.videos.pop(v.id, None)
        shutil.rmtree(v.dir, ignore_errors=True)

    # ---- processing -------------------------------------------------------------------------------------------------
    def submit(self, v: Video, params: JobParams) -> None:
        with self.lock:
            active = sum(1 for x in self.videos.values() if x.status in ("queued", "running"))
            if active >= self.s.max_concurrent_jobs + self.s.max_queued_jobs:
                raise QueueFull("The service is busy analysing other videos. Please try again in a few minutes.")
            if v.status in ("queued", "running"):
                raise QueueFull("This video is already being processed.")
            v.params, v.status, v.error, v.error_detail = params, "queued", None, None
            v.progress, v.analysis, v.alerts = Progress(), None, []
            v.cancel = threading.Event()
        self.pool.submit(self._run, v)

    def _run(self, v: Video) -> None:
        if v.cancel.is_set():
            v.status, v.finished = "cancelled", time.time()
            return
        v.status, v.started = "running", time.time()
        try:
            an = analyse(v.input_path, v.info, v.params, self.det, self.pose, v.progress, v.cancel.is_set, self.s.max_samples)
            v.analysis, v.alerts = an, make_alerts(v.id, an.candidates)
            v.status, v.progress.stage = "completed", "done"
        except Cancelled:
            v.status = "cancelled"
        except Exception as e:  # noqa: BLE001 - the job fails, the service keeps running
            v.status = "failed"
            v.error = f"Processing failed: {type(e).__name__}"  # no internal paths or stack traces are exposed
            v.error_detail = str(e)[:240] if isinstance(e, (RuntimeError, ValueError)) else None
        finally:
            v.finished = time.time()

    def _make_preview(self, v: Video) -> None:
        """Browser-playable proxies (H.264 MP4 and VP9 WebM). Overlay coordinates stay in source pixels; the player scales them."""
        ff = shutil.which("ffmpeg")
        if not ff:
            v.preview_state, v.preview_done = "unavailable", True
            return
        w = min(self.s.preview_width, v.info.width)
        w -= w % 2
        base = [ff, "-nostdin", "-y", "-loglevel", "error", "-i", str(v.input_path), "-an", "-vf", f"scale={w}:-2"]

        def run(args: list[str], out: Path) -> bool:
            try:
                r = subprocess.run(base + args + [str(out)], capture_output=True, timeout=1800)
                return r.returncode == 0 and out.is_file() and out.stat().st_size > 0 and not v.cancel.is_set()
            except (subprocess.SubprocessError, OSError):
                return False

        mp4, webm = v.dir / "preview.mp4", v.dir / "preview.webm"
        remaining, lock = [2], threading.Lock()

        def one(kind: str, args: list[str], out: Path) -> None:
            ok = run(args, out)
            with lock:
                if ok:
                    setattr(v, "preview" if kind == "mp4" else "preview_webm", out)
                    v.preview_state = "ready"
                remaining[0] -= 1
                if remaining[0] == 0:
                    v.preview_done = True
                    if v.preview_state != "ready":
                        v.preview_state = "unavailable"

        t = threading.Thread(target=one, args=("webm", ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "35", "-b:v", "0", "-g", "25"], webm), daemon=True)
        t.start()
        one("mp4", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-g", "25", "-movflags", "+faststart"], mp4)
        t.join()

    def rederive(self, v: Video, params: JobParams) -> None:
        """Re-evaluate the candidate rules on the stored observations. The video is not reprocessed."""
        from .pipeline import derive
        with v.lock:
            if not v.analysis:
                raise RuntimeError("not ready")
            v.params = params
            v.analysis.candidates = derive(v.analysis, params, v.analysis.times[-1] if v.analysis.times else 0.0)
            v.alerts = make_alerts(v.id, v.analysis.candidates)

    def _reaper(self) -> None:
        while not self._stop.wait(30):
            now = time.time()
            with self.lock:
                # idle videos expire a TTL after upload (not yet processed) or after their job finished; a job that is queued or running never expires
                dead = [x for x in self.videos.values() if x.status not in ("running", "queued") and (x.finished if x.status != "uploaded" else x.created) is not None
                        and (x.finished if x.status != "uploaded" else x.created) + self.s.job_ttl_seconds < now]
            for x in dead:
                self.delete(x)

    def shutdown(self) -> None:
        self._stop.set()
        for x in list(self.videos.values()):
            x.cancel.set()
        self.pool.shutdown(wait=False, cancel_futures=True)
