"""Text that is already in a PDF (its text layer), with exact character positions. No recognition is involved: this is what the file says.

Characters come from pdfium; lines are rebuilt from their positions and split into segments at wide gaps so table columns are separate items."""
from __future__ import annotations

import numpy as np
import pypdfium2 as pdfium


def extract(page: "pdfium.PdfPage") -> list[dict]:
    """Items in normalised page coordinates (x right, y down, 0..1). Each item: text, bbox, char_x (per-character [x0, x1])."""
    bx0, by0, bx1, by1 = page.get_bbox()  # the rendered area (crop box); character boxes are in page space
    W, H = bx1 - bx0, by1 - by0
    tp = page.get_textpage()
    try:
        n = tp.count_chars()
        if n == 0:
            return []
        s = tp.get_text_range(0, n)
        per_char = len(s) != n
        chars = []
        for i in range(n):
            ch = tp.get_text_range(i, 1) if per_char else s[i]
            if not ch or ch in "\r\n\x00￾￿":
                continue
            l, b, r, t = tp.get_charbox(i, loose=True)
            if r - l <= 0.01 and ch != " " or t - b <= 0.01:
                continue
            chars.append((ch, l - bx0, b - by0, r - bx0, t - by0))
    finally:
        tp.close()
    if not chars:
        return []
    hs = np.array([c[4] - c[2] for c in chars])
    med_h = float(np.median(hs))
    chars.sort(key=lambda c: -(c[2] + c[4]) / 2)  # top of page first (pdf y grows upwards)
    lines: list[list[tuple]] = []
    for c in chars:
        cy = (c[2] + c[4]) / 2
        if lines and abs(cy - np.mean([(x[2] + x[4]) / 2 for x in lines[-1]])) <= 0.5 * max(c[4] - c[2], med_h * 0.6):
            lines[-1].append(c)
        else:
            lines.append([c])
    items: list[dict] = []
    for ln in lines:
        ln.sort(key=lambda c: c[1])
        lh = float(np.median([c[4] - c[2] for c in ln]))
        seg: list[tuple] = [ln[0]]
        segs = [seg]
        for prev, cur in zip(ln, ln[1:]):
            gap = cur[1] - prev[3]
            # a wide gap starts a new item (e.g. the next table column); so does a smaller gap with no space character in it, since separately placed text has none
            if gap > 1.0 * lh or (gap > 0.3 * lh and prev[0] != " " and cur[0] != " "):
                seg = [cur]
                segs.append(seg)
            else:
                seg.append(cur)
        for sg in segs:
            while sg and sg[0][0] == " ":
                sg = sg[1:]
            while sg and sg[-1][0] == " ":
                sg = sg[:-1]
            if not sg:
                continue
            text = "".join(c[0] for c in sg)
            x0, x1 = min(c[1] for c in sg), max(c[3] for c in sg)
            y0, y1 = min(c[2] for c in sg), max(c[4] for c in sg)
            items.append({"text": text, "bbox": [round(x0 / W, 5), round(1 - y1 / H, 5), round(x1 / W, 5), round(1 - y0 / H, 5)],
                          "char_x": [[round(c[1] / W, 5), round(c[3] / W, 5)] for c in sg]})
    return items
