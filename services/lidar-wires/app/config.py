"""Runtime configuration from environment variables. No secrets are used or required."""
from __future__ import annotations

import os
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
    samples_dir: Path = field(default_factory=lambda: Path(os.environ.get("LIDAR_SAMPLES_DIR", ROOT.parent.parent / "public" / "lidar" / "samples")))
    max_file_mb: int = field(default_factory=lambda: _int("LIDAR_MAX_FILE_MB", 200))
    max_points: int = field(default_factory=lambda: _int("LIDAR_MAX_POINTS", 6_000_000))
    max_clouds: int = field(default_factory=lambda: _int("LIDAR_MAX_CLOUDS", 4))
    max_versions: int = field(default_factory=lambda: _int("LIDAR_MAX_VERSIONS", 4))
    ttl_seconds: int = field(default_factory=lambda: _int("LIDAR_TTL_SECONDS", 3600))
    view_points: int = field(default_factory=lambda: _int("LIDAR_VIEW_POINTS", 1_500_000))
    max_concurrent: int = field(default_factory=lambda: _int("LIDAR_MAX_CONCURRENT", 2))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("LIDAR_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
