import json
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
SAMPLES = ROOT.parent.parent / "public" / "vi" / "samples"
FIXTURES = ROOT.parent.parent / "test-fixtures" / "vi"  # rendered composite clips with known truth: test data only, not shipped as site samples

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.pipeline import Analysis, JobParams  # noqa: E402


def make_analysis(tracks: dict[int, list[tuple[float, list[float]]]], fps: float = 5.0, ball=None, params: JobParams | None = None, t_end: float | None = None) -> Analysis:
    """Build an Analysis from hand-written tracks: {id: [(t, box), ...]} so analytics can be tested against exactly known answers."""
    an = Analysis(params=params or JobParams(ball=bool(ball)), effective_fps=fps, width=960, height=540)
    times = sorted({t for s in tracks.values() for t, _ in s} | {p["t"] for p in (ball or [])} | ({t_end} if t_end else set()))
    for t in times:
        an.times.append(t)
        an.frames.append({"t": t, "f": int(t * 30), "persons": [{"id": i, "box": b, "score": 0.9} for i, s in tracks.items() for tt, b in s if tt == t], "ball": next((p for p in (ball or []) if p["t"] == t), None)})
    for i, s in tracks.items():
        an.tracks[i] = [{"t": t, "box": b, "score": 0.9} for t, b in s]
    an.ball_points = list(ball or [])
    an.start_s, an.end_s = (times[0], times[-1]) if times else (0.0, 0.0)
    return an


def box_at(x: float, y: float, w: float = 40, h: float = 100) -> list[float]:
    """A person box whose feet (bottom centre) are at (x, y)."""
    return [x - w / 2, y - h, x + w / 2, y]


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    from fastapi.testclient import TestClient
    s = Settings(work_dir=tmp_path_factory.mktemp("vi"), samples_dir=SAMPLES, max_video_mb=20, max_videos=6, rate_per_minute=100000)
    with TestClient(create_app(s)) as c:
        yield c


def wait_done(c, vid, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = c.get(f"/api/videos/{vid}").json()
        if r["status"] in ("completed", "failed", "cancelled"):
            return r
        time.sleep(0.5)
    raise AssertionError("job did not finish")


def run_sample(c, sample, **params):
    r = c.post("/api/videos", data={"sample_id": sample})
    assert r.status_code == 201, r.text
    vid = r.json()["video_id"]
    r = c.post(f"/api/videos/{vid}/jobs", json=params)
    assert r.status_code == 202, r.text
    st = wait_done(c, vid)
    assert st["status"] == "completed", st
    return vid, st


def run_file(c, path, **params):
    r = c.post("/api/videos", files={"file": (path.name, path.read_bytes(), "video/mp4")})
    assert r.status_code == 201, r.text
    vid = r.json()["video_id"]
    assert c.post(f"/api/videos/{vid}/jobs", json=params).status_code == 202
    st = wait_done(c, vid)
    assert st["status"] == "completed", st
    return vid, st


def truth(name):
    return json.loads((FIXTURES / f"{name}.truth.json").read_text())


def up(name, data: bytes, mime="application/octet-stream"):
    return {"file": (name, data, mime)}
