"""Image upload validation: the bytes decide the type (never the filename), sizes are bounded before pixels are decoded."""
from __future__ import annotations

import struct

import cv2
import numpy as np

MAX_SIDE = 2400  # stored/processed copy is bounded; the original upload is not kept


class MediaError(ValueError):
    """A problem with the uploaded image that is safe to show to the user."""


def sniff(head: bytes) -> str | None:
    if head[:3] == b"\xff\xd8\xff":
        return "jpg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def header_size(data: bytes, fmt: str) -> tuple[int, int]:
    """Width/height from the header without decoding pixels (guards against decompression bombs)."""
    try:
        if fmt == "png":
            return struct.unpack(">II", data[16:24])
        if fmt == "jpg":
            i = 2
            while i + 9 < len(data):
                if data[i] != 0xFF:
                    i += 1
                    continue
                m = data[i + 1]
                if m in (0xD8, 0x01) or 0xD0 <= m <= 0xD7:
                    i += 2
                    continue
                n = struct.unpack(">H", data[i + 2:i + 4])[0]
                if m in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return w, h
                i += 2 + n
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


def decode(data: bytes, max_pixels: int) -> tuple[np.ndarray, float]:
    """Returns (RGB uint8 image no larger than MAX_SIDE on its long side, scale factor applied to the upload)."""
    fmt = sniff(data[:16])
    if fmt is None:
        raise MediaError("Unsupported image type. Upload a JPEG, PNG or WebP image.")
    w, h = header_size(data, fmt)
    if w < 64 or h < 64:
        raise MediaError(f"The image is too small ({w}x{h}). At least 64x64 pixels are needed.")
    if w * h > max_pixels:
        raise MediaError(f"The image is too large ({w}x{h}); the limit is {max_pixels // 1_000_000} megapixels.")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise MediaError("The image could not be decoded. The file may be damaged.")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    s = min(1.0, MAX_SIDE / max(img.shape[:2]))
    if s < 1.0:
        img = cv2.resize(img, (int(img.shape[1] * s), int(img.shape[0] * s)), interpolation=cv2.INTER_AREA)
    return img, s
