import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


def synthetic_video(path: Path, seconds: float = 3.0, fps: int = 25, size=(640, 360)) -> Path:
    """A real, decodable MP4 (grass-coloured field with moving blobs). It contains no football players: tests that need real detections use SPORTS_TEST_VIDEO."""
    w, h = size
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    rng = np.random.default_rng(1)
    base = np.full((h, w, 3), (60, 110, 50), np.uint8)
    base = np.clip(base + rng.integers(-8, 8, base.shape), 0, 255).astype(np.uint8)
    cv2.line(base, (w // 2, 0), (w // 2, h), (230, 230, 230), 3)
    for i in range(int(seconds * fps)):
        f = base.copy()
        cv2.rectangle(f, (50 + 4 * i, 200), (62 + 4 * i, 240), (200, 40, 40), -1)
        vw.write(f)
    vw.release()
    return path


@pytest.fixture(scope="session")
def video(tmp_path_factory):
    return synthetic_video(tmp_path_factory.mktemp("vid") / "synthetic.mp4")


@pytest.fixture()
def client(tmp_path):
    from fastapi.testclient import TestClient
    s = Settings(work_dir=tmp_path / "work", samples_dir=tmp_path / "samples", max_video_mb=20, max_video_seconds=30, max_samples=400, job_ttl_seconds=60)
    with TestClient(create_app(s)) as c:
        yield c
