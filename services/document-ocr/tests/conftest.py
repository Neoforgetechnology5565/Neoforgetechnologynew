import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
SAMPLES = ROOT.parent.parent / "public" / "documents" / "samples"

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


def truth(name: str) -> dict:
    return json.loads((SAMPLES / f"{name}.truth.json").read_text())


@pytest.fixture(scope="session")
def settings(tmp_path_factory):
    return Settings(work_dir=tmp_path_factory.mktemp("work"), samples_dir=SAMPLES)


@pytest.fixture(scope="session")
def ocr():
    from app.ocr import Ocr
    return Ocr()


@pytest.fixture(scope="session")
def run(ocr, settings):
    from app.pipeline import Params, Progress, analyse

    cache: dict = {}

    def go(name: str, fmt: str | None = None, **kw):
        key = (name, tuple(sorted(kw.items())))
        if key not in cache:
            path = SAMPLES / name
            cache[key] = analyse(path, fmt or path.suffix[1:].lower().replace("tif", "tiff"), Params(**kw), ocr, Progress(), lambda: False, settings)
        return cache[key]
    return go


@pytest.fixture()
def client(tmp_path):
    from fastapi.testclient import TestClient
    s = Settings(work_dir=tmp_path / "work", samples_dir=SAMPLES, max_file_mb=5, max_pages=30, ttl_seconds=60)
    with TestClient(create_app(s)) as c:
        yield c
