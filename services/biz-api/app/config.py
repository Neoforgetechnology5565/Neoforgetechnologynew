"""Runtime configuration from environment variables. No secrets are used or required."""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    db_path: Path = field(default_factory=lambda: Path(os.environ.get("BIZ_DB_PATH", Path(tempfile.gettempdir()) / "neoforge-biz" / "biz.db")))
    max_body_kb: int = field(default_factory=lambda: _int("BIZ_MAX_BODY_KB", 4096))
    max_records_per_ws: int = field(default_factory=lambda: _int("BIZ_MAX_RECORDS", 30000))
    max_workspaces: int = field(default_factory=lambda: _int("BIZ_MAX_WORKSPACES", 500))
    ws_ttl_days: int = field(default_factory=lambda: _int("BIZ_WS_TTL_DAYS", 14))
    max_csv_mb: int = field(default_factory=lambda: _int("BIZ_MAX_CSV_MB", 5))
    max_csv_rows: int = field(default_factory=lambda: _int("BIZ_MAX_CSV_ROWS", 20000))
    rate_per_minute: int = field(default_factory=lambda: _int("BIZ_RATE_PER_MINUTE", 600))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in os.environ.get("BIZ_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))
