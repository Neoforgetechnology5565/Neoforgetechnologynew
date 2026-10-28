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
    model_path: Path = field(default_factory=lambda: Path(os.environ.get("ROOF_MODEL_PATH", ROOT / "models" / "roof_unet_ft.onnx")))
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("ROOF_WORK_DIR", Path(tempfile.gettempdir()) / "neoforge-roof")))
    samples_dir: Path = field(default_factory=lambda: Path(os.environ.get("ROOF_SAMPLES_DIR", ROOT.parent.parent / "public" / "roof" / "samples")))
    max_file_mb: int = field(default_factory=lambda: _int("ROOF_MAX_FILE_MB", 40))
    max_images: int = field(default_factory=lambda: _int("ROOF_MAX_IMAGES", 8))
    max_total_mb: int = field(default_factory=lambda: _int("ROOF_MAX_TOTAL_MB", 120))
    max_pixels: int = field(default_factory=lambda: _int("ROOF_MAX_PIXELS", 36_000_000))
    max_concurrent_jobs: int = field(default_factory=lambda: _int("ROOF_MAX_CONCURRENT_JOBS", 1))
    max_queued_jobs: int = field(default_factory=lambda: _int("ROOF_MAX_QUEUED_JOBS", 3))
    job_ttl_seconds: int = field(default_factory=lambda: _int("ROOF_JOB_TTL_SECONDS", 3600))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("ROOF_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
    intra_threads: int = field(default_factory=lambda: _int("ROOF_INTRA_THREADS", 0))
