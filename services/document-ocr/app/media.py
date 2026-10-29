"""Upload validation: the bytes decide the type (never the filename), sizes are bounded before decoding."""
from __future__ import annotations


class MediaError(ValueError):
    """A problem with the uploaded document that is safe to show to the user."""


def sniff(head: bytes) -> str | None:
    if head[:5] == b"%PDF-":
        return "pdf"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:3] == b"\xff\xd8\xff":
        return "jpg"
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return "tiff"
    return None


KNOWN_OTHER = {b"GIF8": "GIF", b"BM": "BMP", b"PK\x03\x04": "ZIP/Office", b"\xd0\xcf\x11\xe0": "legacy Office"}


def describe_unsupported(head: bytes) -> str:
    for k, v in KNOWN_OTHER.items():
        if head.startswith(k):
            return f"{v} files are not supported. "
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "WebP files are not supported. "
    return ""
