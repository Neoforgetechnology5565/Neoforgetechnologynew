"""Image upload validation: the bytes decide the type (never the filename), sizes are bounded before decoding.
GeoTIFF is accepted as well as JPEG/PNG/WebP because it is the only common format that can carry a verified ground sample distance."""
from __future__ import annotations

import io
import math
import struct
from dataclasses import dataclass

import cv2
import numpy as np

IMAGE_EXT = {"jpg", "png", "webp", "tif"}


class MediaError(ValueError):
    """A problem with the uploaded media that is safe to show to the user."""


def sniff(head: bytes) -> str | None:
    if head[:3] == b"\xff\xd8\xff":
        return "jpg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return "tif"
    return None


def header_dimensions(data: bytes, fmt: str) -> tuple[int, int]:
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
        if fmt == "tif":
            import tifffile
            with tifffile.TiffFile(io.BytesIO(data)) as t:
                p = t.pages[0]
                return int(p.imagewidth), int(p.imagelength)
    except (struct.error, IndexError, ValueError, OSError):
        pass
    except Exception:  # noqa: BLE001 - tifffile raises several types on damaged files
        pass
    raise MediaError("The image header could not be read. The file may be damaged.")


@dataclass
class Georef:
    """Ground sample distance read from GeoTIFF tags (never guessed)."""
    gsd_x_m: float
    gsd_y_m: float
    crs: str
    note: str


@dataclass
class Decoded:
    rgb: np.ndarray  # uint8 RGB
    georef: Georef | None
    fmt: str


def _geotiff_georef(page) -> Georef | None:
    tags = {t.code: t.value for t in page.tags.values()}
    scale = tags.get(33550)  # ModelPixelScaleTag
    keys = tags.get(34735)  # GeoKeyDirectoryTag
    if not scale or not keys or len(scale) < 2:
        return None
    entries = {keys[i]: keys[i + 3] for i in range(4, len(keys) - 3, 4)}
    model_type, epsg_geo, epsg_proj = entries.get(1024), entries.get(2048), entries.get(3072)
    sx, sy = abs(float(scale[0])), abs(float(scale[1]))
    if model_type == 2 and epsg_geo in (4326, 4269, 4258):  # geographic: degrees -> metres at the tie-point latitude
        tie = tags.get(33922)
        lat = float(tie[4]) if tie and len(tie) >= 6 else None
        if lat is None:
            return None
        m_per_deg_lat = 111_132.92 - 559.82 * math.cos(2 * math.radians(lat)) + 1.175 * math.cos(4 * math.radians(lat))
        m_per_deg_lon = 111_412.84 * math.cos(math.radians(lat)) - 93.5 * math.cos(3 * math.radians(lat))
        return Georef(sx * m_per_deg_lon, sy * m_per_deg_lat, f"EPSG:{epsg_geo}", f"Pixel size {sx:.3g}°×{sy:.3g}° converted to metres at latitude {lat:.3f}° (spherical-earth approximation, error well below 1 %)")
    if model_type == 1 and entries.get(3076, 9001) == 9001:  # projected, linear unit metre
        return Georef(sx, sy, f"EPSG:{epsg_proj}" if epsg_proj else "projected", "Pixel size read from the GeoTIFF as metres")
    return None


def decode_image(data: bytes, max_pixels: int) -> Decoded:
    fmt = sniff(data[:16])
    if fmt not in IMAGE_EXT:
        raise MediaError("Unsupported image type. Upload a JPEG, PNG, WebP or GeoTIFF image.")
    w, h = header_dimensions(data, fmt)
    if w * h > max_pixels:
        raise MediaError(f"The image is too large ({w}×{h}). The limit is {max_pixels // 1_000_000} megapixels.")
    if fmt == "tif":
        import tifffile
        try:
            with tifffile.TiffFile(io.BytesIO(data)) as t:
                page = t.pages[0]
                arr = page.asarray()
                geo = _geotiff_georef(page)
        except Exception:  # noqa: BLE001
            raise MediaError("The TIFF could not be decoded. Only 1-4 band 8/16-bit TIFF and GeoTIFF are supported.") from None
        if arr.ndim == 2:
            arr = np.stack([arr] * 3, -1)
        if arr.ndim != 3 or arr.shape[2] < 3:
            raise MediaError("The TIFF must have at least three bands (RGB).")
        arr = arr[..., :3]
        if arr.dtype != np.uint8:  # per-channel 1-99 % stretch (documented): 16-bit satellite data is not display-ready
            out = np.zeros(arr.shape, np.uint8)
            for c in range(3):
                ch = arr[..., c].astype(np.float32)
                v = ch[ch > 0] if (ch > 0).any() else ch.ravel()
                lo, hi = np.percentile(v, (1, 99))
                out[..., c] = (np.clip((ch - lo) / max(hi - lo, 1e-6), 0, 1) ** 0.8 * 255).astype(np.uint8)
            arr = out
        return Decoded(np.ascontiguousarray(arr), geo, fmt)
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise MediaError("The image could not be decoded. The file may be damaged.")
    return Decoded(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), None, fmt)
