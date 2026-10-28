"""Counting, zone, assessment, cleanup and memory behaviour with DETERMINISTIC stub models.

These tests check the pipeline logic (not model accuracy): the stubs return known boxes for a synthetic video, so the right answers are known exactly.
"""
import json
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
from app.pipeline import JobParams, Models, Progress, run_pipeline
from app.ppe import HAT, VEST, PPEBox

W, H, FPS, N = 480, 360, 20, 60


class StubPerson:
    """A: full PPE, walks left to right. B: hat but no vest, stands still. C: too small to judge, stands still. B flickers off for 3 frames."""
    model_name = "stub-person"

    def __init__(self):
        self.i = -1

    def detect(self, frame, conf=0.4, nms_thr=0.45):
        self.i += 1
        f = self.i
        out = [Detection(20 + 4 * f, 100, 70 + 4 * f, 250, 0.9)]
        if not 30 <= f < 33:
            out.append(Detection(300, 90, 360, 250, 0.88))
        out.append(Detection(200, 200, 225, 250, 0.8))
        return out


class StubSafety:
    """Boxes where a real item would be, for A (full PPE), B (hat only); C gets full PPE evidence but is too small for any conclusion to be drawn from its absence."""
    model_name = "stub-safety"

    def detect(self, frame, persons, min_score=0.3):
        out = []
        for wi, (x1, y1, x2, y2) in enumerate(persons):
            w, h = x2 - x1, y2 - y1
            is_b = abs(x1 - 300) < 1
            out.append(PPEBox(HAT, 0.9, x1 + 0.25 * w, y1, x2 - 0.25 * w, y1 + 0.2 * h, wi))
            if not is_b:
                out.append(PPEBox(VEST, 0.9, x1 + 0.1 * w, y1 + 0.25 * h, x2 - 0.1 * w, y1 + 0.65 * h, wi))
        return out


def make_video(path: Path, n=N):
    w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    for _ in range(n):
        w.write(np.full((H, W, 3), 90, np.uint8))
    w.release()


def run(tmp_path, params, n=N):
    v = tmp_path / "v.mp4"
    make_video(v, n)
    info = probe_video(v, 10**8, 100, 1000)
    out = run_pipeline(v, tmp_path, info, params, Models(StubPerson(), StubSafety()), Progress(), lambda: False, 1000)  # type: ignore[arg-type]
    return out, [json.loads(line) for line in out.jsonl.read_text().splitlines()]


def by_role(fr):
    """Map the three stub workers to their track ids using position in the first frames."""
    ids = {}
    for f in fr[10:12]:
        for d in f["detections"]:
            if d["class"] == "worker" and d["track_id"] is not None:
                x1 = d["bbox"]["x1"]
                ids["B" if abs(x1 - 300) < 1 else "C" if d["bbox"]["y2"] - d["bbox"]["y1"] < 60 else "A"] = d["track_id"]
    return ids


def test_instances_vs_unique_and_per_frame_counts(tmp_path):
    out, fr = run(tmp_path, JobParams(write_video=False))
    s = out.summary
    workers_total = N + (N - 3) + N
    assert s["frames_processed"] == N
    # every worker frame also carries a hat box; A and C carry a vest box too (all above the 0.4 PPE confidence)
    expected = workers_total + workers_total + (N + N)
    assert s["detection_instances_processed"] == expected
    assert s["unique_worker_tracks"] == 3 and s["detection_instances_processed"] > s["unique_worker_tracks"]
    assert fr[25]["workers_visible"] == 3 and fr[31]["workers_visible"] == 2
    assert fr[25]["hard_hats_detected"] == 3 and fr[25]["safety_vests_detected"] == 2
    assert fr[-1]["detection_instances_processed"] == expected


def test_flicker_does_not_create_a_new_worker(tmp_path):
    _, fr = run(tmp_path, JobParams(write_video=False))
    ids = {d["track_id"] for f in fr for d in f["detections"] if d["class"] == "worker" and abs(d["bbox"]["x1"] - 300) < 1 and d["track_id"] is not None}
    assert len(ids) == 1


def test_assessment_rules(tmp_path):
    _, fr = run(tmp_path, JobParams(write_video=False))
    ids = by_role(fr)
    last = {d["track_id"]: d for d in fr[-1]["detections"] if d["class"] == "worker"}
    a, b = last[ids["A"]]["ppe_assessment"], last[ids["B"]]["ppe_assessment"]
    assert a["status"] == "compliant" and a["items"][HAT]["state"] == "detected" and a["items"][VEST]["state"] == "detected"
    assert b["status"] == "potential_violation" and b["items"][VEST]["state"] == "not_detected" and b["reasons"] == ["safety vest not detected"]
    # the first frames of any track are "uncertain": not enough consistent evidence yet, never an instant violation
    first_b = next(d for f in fr for d in f["detections"] if d["class"] == "worker" and abs(d["bbox"]["x1"] - 300) < 1)
    assert first_b["ppe_assessment"]["status"] == "uncertain"
    # a worker too small in the frame is never flagged: absence of evidence from such a view is not evidence of absence
    small = [d for f in fr for d in f["detections"] if d["class"] == "worker" and d["bbox"]["y2"] - d["bbox"]["y1"] < 60]
    assert small and all(d["ppe_assessment"]["status"] != "potential_violation" and not d["ppe_assessment"]["reliable_view"] for d in small)
    assert "worker too small in the frame" in small[0]["ppe_assessment"]["reasons"]


def test_only_required_items_decide_the_status(tmp_path):
    _, fr = run(tmp_path, JobParams(write_video=False, require_vest=False))
    ids = by_role(fr)
    last = {d["track_id"]: d for d in fr[-1]["detections"] if d["class"] == "worker"}
    assert last[ids["B"]]["ppe_assessment"]["status"] == "compliant"      # hat is enough when the vest is not required
    assert last[ids["B"]]["ppe_assessment"]["items"][VEST]["state"] == "not_detected"  # but the evidence is still reported


def test_summary_counts_flagged_tracks_once(tmp_path):
    out, fr = run(tmp_path, JobParams(write_video=False))
    assert out.summary["unique_tracks_with_potential_violation"] == 1 and fr[-1]["unique_tracks_with_potential_violation"] == 1
    assert out.summary["peak_potential_violations"] == 1
    assert out.summary["required_ppe"] == ["hard_hat", "safety_vest"]


def test_zone_counts_feet_inside_the_rectangle(tmp_path):
    # zone x 240..432 px, y 180..342 px: B's feet (330,250) are inside; A enters when its centre passes x=240 (frame ~49); C (centre x 212) never does
    out, fr = run(tmp_path, JobParams(write_video=False, zone=(0.5, 0.5, 0.9, 0.95)))
    assert fr[20]["zone"]["workers_inside"] == 1 and fr[-1]["zone"]["workers_inside"] == 2
    assert out.summary["zone"]["peak_workers_inside"] == 2


def test_no_zone_means_no_zone_numbers(tmp_path):
    out, fr = run(tmp_path, JobParams(write_video=False))
    assert out.summary["zone"] is None and fr[0]["zone"] is None


def test_stride_processes_every_nth_frame(tmp_path):
    out, fr = run(tmp_path, JobParams(write_video=False, stride=3))
    assert out.summary["frames_processed"] == 20 and [f["frame_index"] for f in fr[:4]] == [0, 3, 6, 9]


def test_processed_video_has_overlay_pixels(tmp_path):
    out, _ = run(tmp_path, JobParams())
    p = out.video_mp4 or out.video_webm
    assert p and p.is_file()
    ok, frame = cv2.VideoCapture(str(p)).read()
    assert ok and frame.std() > 5, "boxes/labels were drawn on the otherwise flat frame"


def test_expired_and_deleted_jobs_are_removed_from_disk(tmp_path):
    s = Settings(work_dir=tmp_path / "w", job_ttl_seconds=0)
    jm = JobManager(s, Models(StubPerson(), StubSafety()))  # type: ignore[arg-type]
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
    run_pipeline(v, tmp_path, info, JobParams(write_video=False), Models(StubPerson(), StubSafety()), prog, watch, 6000)  # type: ignore[arg-type]
    assert prog.frames_processed == n
    assert (peak["v"] - base) / 1e6 < 120, f"memory grew by {(peak['v'] - base) / 1e6:.0f} MB"
