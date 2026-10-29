import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
SAMPLE = ROOT.parent.parent / "public" / "activity" / "samples" / "pedestrians-opencv-vtest.mp4"

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


def synthetic_video(path: Path, seconds: float = 2.0, fps: int = 10, size=(320, 240)) -> Path:
    """A decodable MP4 with no people in it (coloured background and a moving rectangle). Used for validation tests; tests that need people use the real sample clip."""
    w, h = size
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    base = np.full((h, w, 3), (90, 110, 80), np.uint8)
    for i in range(int(seconds * fps)):
        f = base.copy()
        cv2.rectangle(f, (20 + 6 * i, 100), (50 + 6 * i, 130), (40, 40, 200), -1)
        vw.write(f)
    vw.release()
    return path


@pytest.fixture(scope="session")
def video(tmp_path_factory):
    return synthetic_video(tmp_path_factory.mktemp("vid") / "empty.mp4")


@pytest.fixture(scope="session")
def sample_frame():
    cap = cv2.VideoCapture(str(SAMPLE))
    cap.set(cv2.CAP_PROP_POS_FRAMES, 300)
    ok, f = cap.read()
    cap.release()
    assert ok
    return f


@pytest.fixture(scope="session")
def models():
    from app.detector import PersonDetector
    from app.pose import PoseEstimator
    s = Settings()
    return PersonDetector(s.detector_path), PoseEstimator(s.pose_path)


@pytest.fixture()
def client(tmp_path):
    from fastapi.testclient import TestClient
    s = Settings(work_dir=tmp_path / "work", samples_dir=SAMPLE.parent, max_video_mb=20, max_video_seconds=120, max_samples=600, job_ttl_seconds=60)
    with TestClient(create_app(s)) as c:
        yield c
