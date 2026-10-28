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
    depth_model_path: Path = field(default_factory=lambda: Path(os.environ.get("SPATIAL_DEPTH_MODEL", ROOT / "models" / "depth_anything_v2_vits.onnx")))
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("SPATIAL_WORK_DIR", Path(tempfile.gettempdir()) / "neoforge-spatial")))
    samples_dir: Path = field(default_factory=lambda: Path(os.environ.get("SPATIAL_SAMPLES_DIR", ROOT.parent.parent / "public" / "spatial" / "samples")))
    max_upload_mb: int = field(default_factory=lambda: _int("SPATIAL_MAX_UPLOAD_MB", 200))
    max_total_mb: int = field(default_factory=lambda: _int("SPATIAL_MAX_TOTAL_MB", 300))
    max_import_mb: int = field(default_factory=lambda: _int("SPATIAL_MAX_IMPORT_MB", 150))
    max_images: int = field(default_factory=lambda: _int("SPATIAL_MAX_IMAGES", 80))
    max_video_seconds: int = field(default_factory=lambda: _int("SPATIAL_MAX_VIDEO_SECONDS", 120))
    max_frames: int = field(default_factory=lambda: _int("SPATIAL_MAX_FRAMES", 120))
    max_pixels: int = field(default_factory=lambda: _int("SPATIAL_MAX_PIXELS", 40_000_000))
    max_points: int = field(default_factory=lambda: _int("SPATIAL_MAX_POINTS", 6_000_000))
    max_concurrent_jobs: int = field(default_factory=lambda: _int("SPATIAL_MAX_CONCURRENT_JOBS", 1))
    max_queued_jobs: int = field(default_factory=lambda: _int("SPATIAL_MAX_QUEUED_JOBS", 2))
    job_ttl_seconds: int = field(default_factory=lambda: _int("SPATIAL_JOB_TTL_SECONDS", 3600))
    max_runtime_seconds: int = field(default_factory=lambda: _int("SPATIAL_MAX_RUNTIME_SECONDS", 900))
    threads: int = field(default_factory=lambda: _int("SPATIAL_THREADS", 0))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("SPATIAL_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
