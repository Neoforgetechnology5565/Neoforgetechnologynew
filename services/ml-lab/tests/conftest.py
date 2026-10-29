import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
SAMPLES = ROOT.parent.parent / "public" / "ml" / "samples"

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    from fastapi.testclient import TestClient
    s = Settings(work_dir=tmp_path_factory.mktemp("w"), max_csv_rows=5000, max_image_mb=5, max_video_mb=20)
    with TestClient(create_app(s)) as c:
        yield c


def post(c, path, sample=None, files=None, **data):
    d = dict(data)
    if sample:
        d["sample_id"] = sample
    return c.post(path, data=d, files=files)


def up(name, data: bytes, mime="application/octet-stream"):
    return {"file": (name, data, mime)}
