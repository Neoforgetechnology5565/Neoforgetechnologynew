"""Upload validation shared by the image demos: bytes decide the type, sizes are bounded before decoding."""
from __future__ import annotations

import io

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None
CHUNK = 1024 * 1024


def sniff(head: bytes) -> str | None:
    if head[:3] == b"\xff\xd8\xff":
        return "jpg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[:5] == b"%PDF-":
        return "pdf"
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return "tiff"
    if head[4:8] == b"ftyp" or head[:4] in (b"\x1a\x45\xdf\xa3",) or (head[:4] == b"RIFF" and head[8:12] == b"AVI "):
        return "video"
    return None


async def read_upload(file: UploadFile, max_bytes: int, allowed: set[str], what: str) -> tuple[bytes, str]:
    data = bytearray()
    while chunk := await file.read(CHUNK):
        data += chunk
        if len(data) > max_bytes:
            raise HTTPException(413, f"The file is larger than the {max_bytes // 1_000_000} MB limit.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    kind = sniff(bytes(data[:16]))
    if kind not in allowed:
        raise HTTPException(415, f"Unsupported file type. Upload {what}.")
    return bytes(data), kind


def decode_image(data: bytes, max_pixels: int) -> np.ndarray:
    """BGR uint8. EXIF orientation applied; palette/alpha flattened onto white."""
    try:
        im = Image.open(io.BytesIO(data))
        if im.size[0] * im.size[1] > max_pixels:
            raise HTTPException(422, f"The image is {im.size[0]}x{im.size[1]} pixels; the limit is {max_pixels / 1e6:.0f} megapixels.")
        im = ImageOps.exif_transpose(im)
        if im.mode in ("RGBA", "LA", "P"):
            rgba = im.convert("RGBA")
            bg = Image.new("RGB", rgba.size, (255, 255, 255))
            bg.paste(rgba, mask=rgba.split()[3])
            im = bg
        return cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2BGR)
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "The image could not be decoded. The file may be damaged.") from None


def png(bgr: np.ndarray) -> bytes:
    ok, b = cv2.imencode(".png", bgr)
    return b.tobytes()


def jpeg(bgr: np.ndarray, q: int = 90) -> bytes:
    ok, b = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, q])
    return b.tobytes()
