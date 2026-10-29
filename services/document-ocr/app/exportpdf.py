"""Searchable PDF: each page image with an invisible text layer placed at the line boxes (render mode 3).
The layer is generated for real and can be searched and copied, but its characters are positioned per line, not per glyph, and it uses a standard
Latin font, so characters outside Windows-1252 are replaced by '?' (the count is reported)."""
from __future__ import annotations

import io

import cv2
import numpy as np
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


def build(pages: list[dict], images: list[bytes], sizes_pt: list[tuple[float, float]], title: str) -> tuple[bytes, int]:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pageCompression=1)
    c.setTitle(title[:120])
    c.setCreator("Neo Forge document intelligence demo")
    replaced = 0
    for pg, png, (W, H) in zip(pages, images, sizes_pt):
        c.setPageSize((W, H))
        img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
        ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(io.BytesIO(jpg.tobytes())), 0, 0, width=W, height=H)
        for it in pg["items"]:
            x0, y0, x1, y1 = it["bbox"]
            raw = it["text"]
            text = raw.encode("cp1252", "replace").decode("cp1252")
            replaced += sum(1 for a, b in zip(raw, text) if a != b)
            bh, bw = (y1 - y0) * H, (x1 - x0) * W
            fs = max(2.0, bh * 0.8)
            w = stringWidth(text, "Helvetica", fs)
            if w <= 0 or bw <= 0:
                continue
            t = c.beginText()
            t.setTextRenderMode(3)  # invisible
            t.setFont("Helvetica", fs)
            t.setHorizScale(max(10.0, min(400.0, bw / w * 100)))
            t.setTextOrigin(x0 * W, H - y1 * H + bh * 0.2)
            t.textOut(text)
            c.drawText(t)
        c.showPage()
    c.save()
    return buf.getvalue(), replaced
