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
    backbone_path: Path = field(default_factory=lambda: Path(os.environ.get("INSPECT_BACKBONE_PATH", ROOT / "models" / "resnet50_l23.onnx")))
    references_dir: Path = field(default_factory=lambda: Path(os.environ.get("INSPECT_REFERENCES_DIR", ROOT / "models" / "references")))
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("INSPECT_WORK_DIR", Path(tempfile.gettempdir()) / "neoforge-inspect")))
    samples_dir: Path = field(default_factory=lambda: Path(os.environ.get("INSPECT_SAMPLES_DIR", ROOT.parent.parent / "public" / "defects" / "samples")))
    max_image_mb: int = field(default_factory=lambda: _int("INSPECT_MAX_IMAGE_MB", 20))
    max_pixels: int = field(default_factory=lambda: _int("INSPECT_MAX_PIXELS", 36_000_000))
    max_ref_images: int = field(default_factory=lambda: _int("INSPECT_MAX_REF_IMAGES", 60))
    min_ref_images: int = field(default_factory=lambda: _int("INSPECT_MIN_REF_IMAGES", 10))
    max_concurrent: int = field(default_factory=lambda: _int("INSPECT_MAX_CONCURRENT", 2))
    ttl_seconds: int = field(default_factory=lambda: _int("INSPECT_TTL_SECONDS", 86400))
    max_inspections: int = field(default_factory=lambda: _int("INSPECT_MAX_INSPECTIONS", 300))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("INSPECT_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
    intra_threads: int = field(default_factory=lambda: _int("INSPECT_INTRA_THREADS", 0))
