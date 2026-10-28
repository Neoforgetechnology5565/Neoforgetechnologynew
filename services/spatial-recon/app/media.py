"""Upload validation: the bytes decide the type (never the filename), sizes are bounded before decoding. Uploaded files are never executed."""
from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

import cv2


class MediaError(ValueError):
    """A problem with the uploaded media that is safe to show to the user."""


IMAGE_FMT = {"jpg", "png"}
VIDEO_FMT = {"mp4", "webm", "mkv", "avi"}
CLOUD_FMT = {"ply", "pcd"}
MESH_FMT = {"obj", "glb", "stl"}


def sniff(head: bytes) -> str | None:
    if head[:3] == b"\xff\xd8\xff":
        return "jpg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    if head[:4] == b"RIFF" and head[8:12] == b"AVI ":
        return "avi"
    if head[4:8] in (b"ftyp", b"moov", b"mdat", b"free", b"wide", b"skip"):
        return "mp4"  # ISO base media: MP4 / MOV
    if head[:4] == b"glTF":
        return "glb"
    if head[:3] == b"ply":
        return "ply"
    if head[:5] in (b"# .PC", b"VERSI") or head[:6] == b"# .PCD":
        return "pcd"
    s = head[:6].lower()
    if s.startswith(b"solid"):
        return "stl"  # ASCII STL (binary STL has no magic: decided by the extension check below)
    return None


def sniff_with_name(head: bytes, name: str) -> str | None:
    f = sniff(head)
    if f:
        return f
    ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    try:
        text = head.decode("ascii")
    except UnicodeDecodeError:
        text = ""
    if ext == "obj" and text and all(c.isprintable() or c in "\r\n\t" for c in text):
        return "obj"
    if ext == "stl" and len(head) >= 84:
        return "stl"  # binary STL: 80-byte header + count; validated when parsed
    return None


def image_size(data: bytes, fmt: str) -> tuple[int, int]:
    try:
        if fmt == "png":
            return struct.unpack(">II", data[16:24])
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            m = data[i + 1]
            if m in (0xD8, 0x01) or 0xD0 <= m <= 0xD7:
                i += 2
                continue
            ln = struct.unpack(">H", data[i + 2:i + 4])[0]
            if m in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + ln
    except (struct.error, IndexError):
        pass
    raise MediaError("The image header could not be read. The file may be damaged.")


@dataclass
class VideoInfo:
    width: int
    height: int
    fps: float
    frames: int
    duration: float


def probe_video(path: Path, max_pixels: int, max_seconds: int) -> VideoInfo:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise MediaError("The video could not be opened. The file may be damaged or use an unsupported codec (H.264 MP4/MOV or WebM are the safest choices).")
        n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        ok, first = cap.read()
        if not ok or first is None:
            raise MediaError("No frame could be decoded from this video. The codec may be unsupported.")
        h, w = first.shape[:2]
        if w * h > max_pixels:
            raise MediaError(f"The video resolution ({w}×{h}) is too large for this demonstration.")
        if not (1 <= fps <= 240):
            fps = 25.0
        dur = n / fps if n > 0 else 0.0
        if dur > max_seconds:
            raise MediaError(f"The video is {dur:.0f} s long. The limit is {max_seconds} s; please trim it.")
        return VideoInfo(w, h, fps, n, dur)
    finally:
        cap.release()
