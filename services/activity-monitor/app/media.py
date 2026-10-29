"""Upload validation: the bytes decide the type (never the filename), sizes are bounded before decoding."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2

VIDEO_EXT = {"mp4", "mov", "m4v", "webm", "mkv", "avi"}


class MediaError(ValueError):
    """A problem with the uploaded media that is safe to show to the user."""


def sniff(head: bytes) -> str | None:
    """Return the container format from magic bytes, or None. Images are recognised only to give a helpful error."""
    if head[:3] == b"\xff\xd8\xff":
        return "jpg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"AVI ":
        return "avi"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"  # Matroska / WebM (EBML)
    if head[4:8] in (b"ftyp", b"moov", b"mdat", b"free", b"wide", b"skip"):
        return "mp4"  # ISO base media (MP4 / MOV / M4V)
    return None


@dataclass
class VideoInfo:
    width: int
    height: int
    fps: float
    frames: int  # estimate from the container (may be 0 for some streams)
    duration: float
    fps_assumed: bool = False


def probe_video(path: Path, max_pixels: int, max_seconds: int) -> VideoInfo:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise MediaError("The video could not be opened. The file may be damaged or use an unsupported codec (H.264 MP4/MOV or WebM are the safest choices).")
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        ok, first = cap.read()
        if not ok or first is None:
            raise MediaError("No frame could be decoded from this video. The codec may be unsupported.")
        h, w = first.shape[:2]  # trust the decoded frame over container metadata
        if w * h > max_pixels:
            raise MediaError(f"The video resolution ({w}×{h}) is too large for this demonstration (limit {max_pixels / 1e6:.0f} megapixels per frame).")
        assumed = not (1 <= fps <= 240)
        if assumed:
            fps = 25.0  # the container did not report a usable frame rate; the summary says that 25 fps was assumed
        duration = n / fps if n > 0 else 0.0
        if duration > max_seconds:
            raise MediaError(f"The video is {duration:.0f} s long. This service accepts up to {max_seconds} s per job; use the start/end fields to analyse a part of it, or trim the video.")
        return VideoInfo(w, h, fps, n, duration, assumed)
    finally:
        cap.release()
