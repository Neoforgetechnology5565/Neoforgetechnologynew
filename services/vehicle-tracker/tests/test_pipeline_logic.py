"""Counting, line-crossing, cleanup and memory behaviour with a DETERMINISTIC stub detector.

These tests check the pipeline logic (not model accuracy): the stub returns known boxes for a synthetic video, so the right counts are known exactly.
"""
import os
import time
from pathlib import Path

import cv2
import numpy as np
import psutil
import pytest

from app.config import Settings
from app.detector import Detection
from app.jobs import JobManager
from app.media import probe_video
from app.pipeline import JobParams, Progress, run_pipeline

W, H, FPS = 320, 240, 20


class StubDetector:
    """Two 'cars' cross the frame left-to-right at different times; a 'bus' sits still; one detection flickers off for 3 frames."""
    model_name = "stub"

    def __init__(self, n_frames):
        self.n, self.i = n_frames, -1

    def detect(self, frame, conf=0.3, nms_thr=0.45):
        self.i += 1
        f, out = self.i, []
        out.append(Detection(10 + 6 * f, 60, 50 + 6 * f, 90, 0.9, "car"))                       # car A crosses a vertical line at x=160
        if f >= 20:
            out.append(Detection(10 + 6 * (f - 20), 150, 50 + 6 * (f - 20), 180, 0.85, "truck"))  # truck B starts later
        if not 30 <= f < 33:
            out.append(Detection(250, 190, 300, 225, 0.8, "bus"))                               # static bus, flickers off for 3 frames
        return out


def make_video(path: Path, n=60):
    w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    for i in range(n):
        w.write(np.full((H, W, 3), 90, np.uint8))
    w.release()


def run(tmp_path, params, n=60):
    v = tmp_path / "v.mp4"
    make_video(v, n)
    info = probe_video(v, 10**8, 100, 1000)
    prog = Progress()
    out = run_pipeline(v, tmp_path, info, params, StubDetector(n), prog, lambda: False, 1000)
    frames = [__import__("json").loads(l) for l in out.jsonl.read_text().splitlines()]
    return out, frames


def test_instances_vs_unique_and_class_counts(tmp_path):
    out, fr = run(tmp_path, JobParams(write_video=False))
    s = out.summary
    assert s["frames_processed"] == 60
    expected_instances = 60 + 40 + (60 - 3)                       # car every frame, truck from frame 20, bus except 3 flicker frames
    assert s["detection_instances_processed"] == expected_instances
    assert s["unique_tracks_observed"] == 3 and s["unique_by_class"] == {"car": 1, "motorcycle": 0, "bus": 1, "truck": 1}
    assert s["instances_by_class"] == {"car": 60, "motorcycle": 0, "bus": 57, "truck": 40}
    assert fr[25]["vehicles_visible"] == 3 and fr[31]["vehicles_visible"] == 2
    assert fr[-1]["detection_instances_processed"] == expected_instances > s["unique_tracks_observed"]


def test_flicker_does_not_create_a_new_vehicle(tmp_path):
    _, fr = run(tmp_path, JobParams(write_video=False))
    bus_ids = {d["track_id"] for f in fr for d in f["detections"] if d["class"] == "bus" and d["track_id"] is not None}
    assert len(bus_ids) == 1


def test_virtual_line_counts_each_crossing_once(tmp_path):
    # vertical line at x = 160 px (0.5): car A crosses at frame ~25; truck B (starts frame 20) crosses at frame ~45 -> exactly 2 crossings, same direction
    out, fr = run(tmp_path, JobParams(write_video=False, line=(0.5, 0.0, 0.5, 1.0)))
    lc = out.summary["line_crossings"]
    assert lc["total"] == 2 and (lc["a_to_b"], lc["b_to_a"]) in ((2, 0), (0, 2))
    assert fr[-1]["line_crossings"]["total"] == 2
    assert out.summary["unique_tracks_observed"] == 3  # line crossings never replace the unique-track count


def test_stride_processes_every_nth_frame(tmp_path):
    out, fr = run(tmp_path, JobParams(write_video=False, stride=3))
    assert out.summary["frames_processed"] == 20 and [f["frame_index"] for f in fr[:4]] == [0, 3, 6, 9]


def test_processed_video_has_overlay_pixels(tmp_path):
    out, _ = run(tmp_path, JobParams())
    p = out.video_mp4 or out.video_webm
    assert p and p.is_file()
    cap = cv2.VideoCapture(str(p))
    ok, frame = cap.read()
    assert ok and frame.std() > 5, "boxes/labels were drawn on the otherwise flat frame"


def test_expired_and_deleted_jobs_are_removed_from_disk(tmp_path):
    s = Settings(work_dir=tmp_path / "w", job_ttl_seconds=0)
    jm = JobManager(s, StubDetector(10))  # type: ignore[arg-type]
    jid, d = jm.new_dir()
    (d / "x").write_text("data")
    v = d / "input.mp4"
    make_video(v, 10)
    job = jm.submit(jid, d, v, probe_video(v, 10**8, 100, 1000), JobParams(write_video=False), "upload")
    t0 = time.time()
    while job.status not in ("completed", "failed") and time.time() - t0 < 20:
        time.sleep(0.05)
    assert job.status == "completed"
    jm.delete(job)
    assert not d.exists() and jm.get(jid) is None
    jm.shutdown()


@pytest.mark.slow
def test_long_video_memory_stays_flat(tmp_path):
    """A ~2000-frame video must not grow memory with its length: frames are streamed and results are written to disk."""
    n = 2000
    v = tmp_path / "long.mp4"
    w = cv2.VideoWriter(str(v), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    for _ in range(n):
        w.write(np.full((H, W, 3), 90, np.uint8))
    w.release()
    info = probe_video(v, 10**8, 1000, 6000)
    proc = psutil.Process(os.getpid())
    base = proc.memory_info().rss
    peak = {"v": base}

    def watch():
        peak["v"] = max(peak["v"], proc.memory_info().rss)
        return False

    prog = Progress()
    run_pipeline(v, tmp_path, info, JobParams(write_video=False), StubDetector(n), prog, watch, 6000)
    assert prog.frames_processed == n
    assert (peak["v"] - base) / 1e6 < 120, f"memory grew by {(peak['v'] - base) / 1e6:.0f} MB"
