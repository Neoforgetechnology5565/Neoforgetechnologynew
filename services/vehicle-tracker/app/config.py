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
    model_path: Path = field(default_factory=lambda: Path(os.environ.get("VEHICLE_MODEL_PATH", ROOT / "models" / "yolox_tiny.onnx")))
    input_size: int = field(default_factory=lambda: _int("VEHICLE_INPUT_SIZE", 416))  # 416 for yolox_tiny/nano, 640 for yolox_s/m/l
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("VEHICLE_WORK_DIR", Path(tempfile.gettempdir()) / "neoforge-vehicle")))
    samples_dir: Path = field(default_factory=lambda: Path(os.environ.get("VEHICLE_SAMPLES_DIR", ROOT.parent.parent / "public" / "vehicle" / "samples")))
    max_video_mb: int = field(default_factory=lambda: _int("VEHICLE_MAX_VIDEO_MB", 100))
    max_image_mb: int = field(default_factory=lambda: _int("VEHICLE_MAX_IMAGE_MB", 15))
    max_video_seconds: int = field(default_factory=lambda: _int("VEHICLE_MAX_VIDEO_SECONDS", 180))
    max_frames: int = field(default_factory=lambda: _int("VEHICLE_MAX_FRAMES", 6000))
    max_pixels: int = field(default_factory=lambda: _int("VEHICLE_MAX_PIXELS", 40_000_000))  # per frame / image
    max_concurrent_jobs: int = field(default_factory=lambda: _int("VEHICLE_MAX_CONCURRENT_JOBS", 1))
    max_queued_jobs: int = field(default_factory=lambda: _int("VEHICLE_MAX_QUEUED_JOBS", 3))
    job_ttl_seconds: int = field(default_factory=lambda: _int("VEHICLE_JOB_TTL_SECONDS", 3600))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("VEHICLE_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
    intra_threads: int = field(default_factory=lambda: _int("VEHICLE_INTRA_THREADS", 0))  # 0 = onnxruntime default
