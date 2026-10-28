import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

SAMPLES = ROOT.parent.parent / "public" / "roof" / "samples"


def make_client(tmp_path: Path, **kw) -> TestClient:
    return TestClient(create_app(Settings(work_dir=tmp_path / "work", **kw)))


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    with make_client(tmp_path_factory.mktemp("roof")) as c:
        yield c


def wait_job(c: TestClient, job_id: str, timeout: float = 240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = c.get(f"/api/roof/jobs/{job_id}").json()
        if j["status"] in ("completed", "failed", "cancelled"):
            return j
        time.sleep(0.25)
    raise TimeoutError("job did not finish")
