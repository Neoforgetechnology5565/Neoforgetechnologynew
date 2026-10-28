import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

SAMPLE = ROOT.parent.parent / "public" / "vehicle" / "samples" / "highway-dashcam.mp4"


def make_client(tmp_path: Path, **kw) -> TestClient:
    s = Settings(work_dir=tmp_path / "work", **kw)
    return TestClient(create_app(s))


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    with make_client(tmp_path_factory.mktemp("vt")) as c:
        yield c


@pytest.fixture()
def small_client(tmp_path):
    """A service with tiny limits, for testing rejection behaviour."""
    with make_client(tmp_path, max_video_mb=1, max_image_mb=1, max_video_seconds=5, max_frames=100, max_concurrent_jobs=1, max_queued_jobs=0) as c:
        yield c


def wait_job(c: TestClient, job_id: str, timeout: float = 240):
    import time
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = c.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("completed", "failed", "cancelled"):
            return j
        time.sleep(0.25)
    raise TimeoutError("job did not finish")
