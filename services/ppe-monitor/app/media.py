"""Upload validation: the bytes decide the type (never the filename), sizes are bounded before decoding."""
from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

VIDEO_EXT = {"mp4", "mov", "m4v", "webm", "mkv", "avi"}
IMAGE_EXT = {"jpg", "png", "webp"}


class MediaError(ValueError):
    """A problem with the uploaded media that is safe to show to the user."""


def sniff(head: bytes) -> str | None:
    """Return the container/format from magic bytes, or None."""
    if head[:3] == b"\xff\xd8\xff":
        return "jpg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[:4] == b"RIFF" and head[8:12] == b"AVI ":
        return "avi"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"  # Matroska / WebM (EBML)
    if head[4:8] in (b"ftyp", b"moov", b"mdat", b"free", b"wide", b"skip"):
        return "mp4"  # ISO base media (MP4 / MOV / M4V)
    return None


def image_dimensions(data: bytes, fmt: str) -> tuple[int, int]:
    """Read width/height from the header without decoding pixels (guards against decompression bombs)."""
    try:
        if fmt == "png":
            w, h = struct.unpack(">II", data[16:24])
            return w, h
        if fmt == "jpg":
            i = 2
            while i + 9 < len(data):
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                length = struct.unpack(">H", data[i + 2:i + 4])[0]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return w, h
                i += 2 + length
        if fmt == "webp":
            if data[12:16] == b"VP8X":
                return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
            if data[12:16] == b"VP8 ":
                w, h = struct.unpack("<HH", data[26:30])
                return w & 0x3FFF, h & 0x3FFF
            if data[12:16] == b"VP8L":
                b = int.from_bytes(data[21:25], "little")
                return (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
    except (struct.error, IndexError):
        pass
    raise MediaError("The image header could not be read. The file may be damaged.")


def decode_image(data: bytes, max_pixels: int) -> np.ndarray:
    fmt = sniff(data[:16])
    if fmt not in IMAGE_EXT:
        raise MediaError("Unsupported image type. Upload a JPEG, PNG or WebP image.")
    w, h = image_dimensions(data, fmt)
    if w * h > max_pixels:
        raise MediaError(f"The image is too large ({w}×{h}). The limit is {max_pixels // 1_000_000} megapixels.")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise MediaError("The image could not be decoded. The file may be damaged.")
    return img


@dataclass
class VideoInfo:
    width: int
    height: int
    fps: float
    frames: int  # estimate from the container (may be 0 for some streams)
    duration: float


def probe_video(path: Path, max_pixels: int, max_seconds: int, max_frames: int) -> VideoInfo:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise MediaError("The video could not be opened. The file may be damaged or use an unsupported codec (H.264 MP4/MOV or WebM are the safest choices).")
        w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        ok, first = cap.read()
        if not ok or first is None:
            raise MediaError("No frame could be decoded from this video. The codec may be unsupported.")
        h, w = first.shape[:2]  # trust the decoded frame over container metadata
        if w * h > max_pixels:
            raise MediaError(f"The video resolution ({w}×{h}) is too large for this demonstration.")
        if not (1 <= fps <= 240):
            fps = 25.0  # container did not report a usable frame rate; assume 25 and say so in the job summary
        duration = n / fps if n > 0 else 0.0
        if duration > max_seconds:
            raise MediaError(f"The video is {duration:.0f} s long. This demonstration processes clips up to {max_seconds} s; please trim it.")
        if n > max_frames:
            raise MediaError(f"The video has {n} frames. The limit is {max_frames}; please trim it or lower the frame rate.")
        return VideoInfo(w, h, fps, n, duration)
    finally:
        cap.release()
