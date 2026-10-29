"""Annotated video rendering from stored observations (boxes, track ids, pose skeletons). The overlay of the nearest earlier analysed frame is held until the next one."""
from __future__ import annotations

import bisect
import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np

from .pipeline import Analysis
from .pose import BONES

PALETTE = [(60, 180, 75), (230, 25, 75), (255, 225, 25), (0, 130, 200), (245, 130, 48), (145, 30, 180), (70, 240, 240), (240, 50, 230), (210, 245, 60), (250, 190, 212)]


def draw(frame: np.ndarray, persons: list[dict], flagged: set[int], skeleton: bool = True, boxes: bool = True) -> None:
    for p in persons:
        c = PALETTE[p["id"] % len(PALETTE)]
        x1, y1, x2, y2 = (int(v) for v in p["box"])
        if boxes:
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255) if p["id"] in flagged else c, 3 if p["id"] in flagged else 2)
            cv2.putText(frame, f"#{p['id']}", (x1, max(14, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, c, 1, cv2.LINE_AA)
        kp = p["kp"]
        if skeleton and kp is not None:
            for a, b in BONES:
                if kp[a, 2] >= 0.4 and kp[b, 2] >= 0.4:
                    cv2.line(frame, (int(kp[a, 0]), int(kp[a, 1])), (int(kp[b, 0]), int(kp[b, 1])), c, 2, cv2.LINE_AA)


def render(an: Analysis, src: Path, dst: Path, fps: float, t0: float, t1: float, flagged: set[int], width: int = 960, boxes: bool = True, skeleton: bool = True) -> None:
    ff = shutil.which("ffmpeg")
    if not ff:
        raise RuntimeError("ffmpeg is not available on this server")
    cap = cv2.VideoCapture(str(src))
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t0 * fps))
    ok, fr = cap.read()
    if not ok:
        raise RuntimeError("could not decode the start of the clip")
    h0, w0 = fr.shape[:2]
    w = min(width, w0) // 2 * 2
    h = int(round(h0 * w / w0)) // 2 * 2
    proc = subprocess.Popen([ff, "-nostdin", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps:.3f}", "-i", "-",
                             "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)], stdin=subprocess.PIPE)
    try:
        f = int(t0 * fps)
        while ok and f / fps <= t1:
            i = bisect.bisect_right(an.times, f / fps + 1e-6) - 1
            if i >= 0 and f / fps - an.times[i] <= 1.0:
                draw(fr, an.frames[i], flagged, skeleton, boxes)
            if (w, h) != (w0, h0):
                fr = cv2.resize(fr, (w, h), interpolation=cv2.INTER_AREA)
            proc.stdin.write(np.ascontiguousarray(fr).tobytes())
            ok, fr = cap.read()
            f += 1
    finally:
        cap.release()
        proc.stdin.close()
        rc = proc.wait(timeout=600)
    if rc != 0:
        dst.unlink(missing_ok=True)
        raise RuntimeError("encoding failed")
