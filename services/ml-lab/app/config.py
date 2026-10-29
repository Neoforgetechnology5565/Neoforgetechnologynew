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
    models: Path = field(default_factory=lambda: Path(os.environ.get("ML_MODELS_DIR", ROOT / "models")))
    shared_models: Path = field(default_factory=lambda: Path(os.environ.get("ML_SHARED_MODELS_DIR", REPO / "services" / "activity-monitor" / "models")))  # YOLOX-S and BlazePose live with the activity service
    samples: Path = field(default_factory=lambda: Path(os.environ.get("ML_SAMPLES_DIR", REPO / "public" / "ml" / "samples")))
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("ML_WORK_DIR", Path(tempfile.gettempdir()) / "neoforge-ml")))
    max_image_mb: int = field(default_factory=lambda: _int("ML_MAX_IMAGE_MB", 15))
    max_pixels: int = field(default_factory=lambda: _int("ML_MAX_PIXELS", 25_000_000))
    max_video_mb: int = field(default_factory=lambda: _int("ML_MAX_VIDEO_MB", 80))
    max_video_seconds: int = field(default_factory=lambda: _int("ML_MAX_VIDEO_SECONDS", 60))
    max_frames: int = field(default_factory=lambda: _int("ML_MAX_FRAMES", 300))
    max_csv_mb: int = field(default_factory=lambda: _int("ML_MAX_CSV_MB", 5))
    max_csv_rows: int = field(default_factory=lambda: _int("ML_MAX_CSV_ROWS", 50_000))
    max_doc_mb: int = field(default_factory=lambda: _int("ML_MAX_DOC_MB", 15))
    max_pdf_pages: int = field(default_factory=lambda: _int("ML_MAX_PDF_PAGES", 10))
    max_search_docs: int = field(default_factory=lambda: _int("ML_MAX_SEARCH_DOCS", 30))
    job_ttl_seconds: int = field(default_factory=lambda: _int("ML_JOB_TTL_SECONDS", 1800))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("ML_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
