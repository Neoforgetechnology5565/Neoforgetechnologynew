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
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("DOCS_WORK_DIR", Path(tempfile.gettempdir()) / "neoforge-documents")))
    samples_dir: Path = field(default_factory=lambda: Path(os.environ.get("DOCS_SAMPLES_DIR", ROOT.parent.parent / "public" / "documents" / "samples")))
    max_file_mb: int = field(default_factory=lambda: _int("DOCS_MAX_FILE_MB", 40))
    max_pages: int = field(default_factory=lambda: _int("DOCS_MAX_PAGES", 30))
    max_pixels: int = field(default_factory=lambda: _int("DOCS_MAX_PIXELS", 50_000_000))  # per uploaded image page (decoded)
    render_dpi: int = field(default_factory=lambda: _int("DOCS_RENDER_DPI", 200))
    max_side_px: int = field(default_factory=lambda: _int("DOCS_MAX_SIDE_PX", 2600))   # working image size; larger pages are scaled down
    max_concurrent_jobs: int = field(default_factory=lambda: _int("DOCS_MAX_CONCURRENT_JOBS", 1))
    max_queued_jobs: int = field(default_factory=lambda: _int("DOCS_MAX_QUEUED_JOBS", 3))
    max_documents: int = field(default_factory=lambda: _int("DOCS_MAX_DOCUMENTS", 8))
    ttl_seconds: int = field(default_factory=lambda: _int("DOCS_TTL_SECONDS", 3600))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("DOCS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
    intra_threads: int = field(default_factory=lambda: _int("DOCS_INTRA_THREADS", 0))
