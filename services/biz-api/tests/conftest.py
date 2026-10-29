import json
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

SEEDS = json.loads((Path(__file__).parent / "seeds.json").read_text())


@pytest.fixture()
def dbfile(tmp_path):
    return tmp_path / "biz.db"


@pytest.fixture()
def make(dbfile):
    from fastapi.testclient import TestClient
    opened = []

    def go(**kw):
        c = TestClient(create_app(Settings(db_path=dbfile, **kw)))
        c.__enter__()
        opened.append(c)
        return c
    yield go
    for c in opened:
        c.__exit__(None, None, None)


@pytest.fixture()
def api(make):
    return make()


@pytest.fixture()
def ws():
    return uuid.uuid4().hex


def load(api, ws, *slices):
    for k in slices:
        r = api.put(f"/api/biz/{ws}/{k}", json={"state": {"items": SEEDS[k]} if k == "activity" else SEEDS[k]})
        assert r.status_code == 200, (k, r.text)
