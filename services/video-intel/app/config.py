"""Runtime configuration from environment variables. No secrets are used or required."""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    detector_path: Path = field(default_factory=lambda: Path(os.environ.get("VI_DETECTOR_PATH", REPO / "services" / "activity-monitor" / "models" / "yolox_s.onnx")))
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("VI_WORK_DIR", Path(tempfile.gettempdir()) / "neoforge-vi")))
    samples_dir: Path = field(default_factory=lambda: Path(os.environ.get("VI_SAMPLES_DIR", REPO / "public" / "vi" / "samples")))
    max_video_mb: int = field(default_factory=lambda: _int("VI_MAX_VIDEO_MB", 200))
    max_video_seconds: int = field(default_factory=lambda: _int("VI_MAX_VIDEO_SECONDS", 300))
    max_samples: int = field(default_factory=lambda: _int("VI_MAX_SAMPLES", 4000))  # analysed frames per job
    max_pixels: int = field(default_factory=lambda: _int("VI_MAX_PIXELS", 9_000_000))
    max_videos: int = field(default_factory=lambda: _int("VI_MAX_VIDEOS", 8))
    max_concurrent_jobs: int = field(default_factory=lambda: _int("VI_MAX_CONCURRENT_JOBS", 1))
    max_queued_jobs: int = field(default_factory=lambda: _int("VI_MAX_QUEUED_JOBS", 3))
    job_ttl_seconds: int = field(default_factory=lambda: _int("VI_JOB_TTL_SECONDS", 3600))
    rate_per_minute: int = field(default_factory=lambda: _int("VI_RATE_PER_MINUTE", 300))
    intra_threads: int = field(default_factory=lambda: _int("VI_INTRA_THREADS", 0))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("VI_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
