"""Runtime configuration, read once from environment variables. No secrets are used or required."""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    detector_path: Path = field(default_factory=lambda: Path(os.environ.get("ACTIVITY_DETECTOR_PATH", ROOT / "models" / "yolox_s.onnx")))
    pose_path: Path = field(default_factory=lambda: Path(os.environ.get("ACTIVITY_POSE_PATH", ROOT / "models" / "blazepose_full.onnx")))
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("ACTIVITY_WORK_DIR", Path(tempfile.gettempdir()) / "neoforge-activity")))
    samples_dir: Path = field(default_factory=lambda: Path(os.environ.get("ACTIVITY_SAMPLES_DIR", ROOT.parent.parent / "public" / "activity" / "samples")))
    max_video_mb: int = field(default_factory=lambda: _int("ACTIVITY_MAX_VIDEO_MB", 300))
    max_video_seconds: int = field(default_factory=lambda: _int("ACTIVITY_MAX_VIDEO_SECONDS", 600))
    max_samples: int = field(default_factory=lambda: _int("ACTIVITY_MAX_SAMPLES", 4000))  # analysed frames per job
    max_pixels: int = field(default_factory=lambda: _int("ACTIVITY_MAX_PIXELS", 9_000_000))
    max_concurrent_jobs: int = field(default_factory=lambda: _int("ACTIVITY_MAX_CONCURRENT_JOBS", 1))
    max_queued_jobs: int = field(default_factory=lambda: _int("ACTIVITY_MAX_QUEUED_JOBS", 2))
    max_videos: int = field(default_factory=lambda: _int("ACTIVITY_MAX_VIDEOS", 6))  # stored uploads at once
    job_ttl_seconds: int = field(default_factory=lambda: _int("ACTIVITY_JOB_TTL_SECONDS", 3600))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("ACTIVITY_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
    intra_threads: int = field(default_factory=lambda: _int("ACTIVITY_INTRA_THREADS", 0))
    preview_width: int = field(default_factory=lambda: _int("ACTIVITY_PREVIEW_WIDTH", 960))
