import io
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


def good_part(seed: int, size: int = 256) -> np.ndarray:
    """A synthetic 'manufactured part': a regular fine pattern on a grey plate with small position and brightness variation."""
    rng = np.random.default_rng(seed)
    img = np.full((size, size, 3), 150, np.uint8)
    yy, xx = np.mgrid[0:size, 0:size]
    ox, oy = rng.integers(0, 6, 2)
    pat = (np.sin((xx + ox) / 5.0) * np.sin((yy + oy) / 5.0) > 0).astype(np.float32)
    img = (img * (0.8 + 0.2 * pat[..., None]) * rng.uniform(0.95, 1.05)).astype(np.uint8)
    cv2.circle(img, (size // 2, size // 2), size // 6, (110, 110, 120), -1)
    return np.clip(img + rng.integers(-3, 4, img.shape), 0, 255).astype(np.uint8)


def defective(seed: int) -> np.ndarray:
    img = good_part(seed)
    cv2.ellipse(img, (190, 70), (22, 12), 30, 0, 360, (30, 40, 200), -1)  # a clearly different blotch
    return img


def encode(img: np.ndarray, ext: str = ".png") -> bytes:
    ok, buf = cv2.imencode(ext, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    assert ok
    return buf.tobytes()


@pytest.fixture()
def client(tmp_path):
    from fastapi.testclient import TestClient
    s = Settings(work_dir=tmp_path / "work", samples_dir=tmp_path / "samples", max_image_mb=2, ttl_seconds=3600)
    with TestClient(create_app(s)) as c:
        yield c


def build_custom_ref(client, n: int = 14, name: str = "Synthetic plate") -> str:
    files = [("files", (f"g{i}.png", encode(good_part(i)), "image/png")) for i in range(n)]
    r = client.post("/api/references", files=files, data={"name": name})
    assert r.status_code == 202, r.text
    rid = r.json()["id"]
    for _ in range(1500):
        j = client.get(f"/api/references/{rid}").json()
        if j["status"] != "building":
            break
        time.sleep(0.2)
    assert j["status"] == "ready", j
    return rid


@pytest.fixture(scope="session")
def session_client(tmp_path_factory):
    from fastapi.testclient import TestClient
    d = tmp_path_factory.mktemp("sess")
    with TestClient(create_app(Settings(work_dir=d / "w", samples_dir=d / "s", max_image_mb=2))) as c:
        c.rid = build_custom_ref(c, 16)
        yield c
