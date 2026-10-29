"""Create the bundled sample documents and their ground truth. Everything here is fictional and created for this project.

  python scripts/make_samples.py [output_dir]     (needs reportlab, pypdfium2, pillow, numpy)

Outputs (default ../../public/documents/samples):
  invoice-text.pdf        two-page text PDF: an invoice with a ruled table (page 1) and terms (page 2)
  invoice-scanned.pdf     page 1 of the invoice rasterised and degraded (skew, noise, blur, uneven light, JPEG): an image-only PDF, NO text layer
  stock-report.pdf        one-page text PDF with a ruled table
  *.truth.json            the exact text lines, fields and table cells that were drawn, for tests
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageFilter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent.parent.parent / "public" / "documents" / "samples"
W, H = A4


def table(c: canvas.Canvas, x: float, y_top: float, col_w: list[float], rows: list[list[str]], row_h: float = 22, right_cols: tuple[int, ...] = ()) -> list[list[str]]:
    """Ruled grid with text in each cell. Returns the cell text grid."""
    total = sum(col_w)
    n = len(rows)
    c.setLineWidth(1)
    for i in range(n + 1):
        c.line(x, y_top - i * row_h, x + total, y_top - i * row_h)
    xs = [x]
    for w in col_w:
        xs.append(xs[-1] + w)
    for xv in xs:
        c.line(xv, y_top, xv, y_top - n * row_h)
    for i, row in enumerate(rows):
        c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 11)
        for j, cell in enumerate(row):
            ty = y_top - i * row_h - row_h + 7
            if j in right_cols and i > 0:
                c.drawRightString(xs[j + 1] - 6, ty, cell)
            else:
                c.drawString(xs[j] + 6, ty, cell)
    return rows


def invoice(path: Path) -> dict:
    truth: dict = {"pages": [[], []], "fields": [], "tables": []}
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=0)
    c.setTitle("Sample invoice (fictional)")
    lines: list[str] = truth["pages"][0]

    def text(x, y, s, font="Helvetica", size=11, page=0):
        c.setFont(font, size)
        c.drawString(x, y, s)
        truth["pages"][page].append(s)

    text(50, H - 70, "INVOICE", "Helvetica-Bold", 28)
    text(50, H - 100, "Harbour Lane Supplies Ltd", "Helvetica-Bold", 13)
    text(50, H - 116, "12 Example Street, Sampletown AB1 2CD")
    text(50, H - 132, "Email: billing@example.com")
    text(50, H - 148, "Phone: +44 20 7946 0123")
    text(330, H - 100, "Invoice No: INV-2024-0173")
    text(330, H - 116, "Invoice Date: 14 March 2024")
    text(330, H - 132, "Due Date: 13 April 2024")
    text(50, H - 190, "Bill To: Fictional Customer Co.")
    rows = [["Item", "Qty", "Unit price", "Amount"], ["Cable ties (100 pack)", "4", "3.50", "14.00"], ["Safety gloves (pair)", "12", "2.25", "27.00"],
            ["Label printer tape", "6", "8.90", "53.40"], ["Packing tape (6 rolls)", "3", "7.10", "21.30"]]
    grid = table(c, 50, H - 215, [230, 60, 100, 100], rows, right_cols=(1, 2, 3))
    for r in grid:
        truth["pages"][0].extend(r)
    truth["tables"].append({"page": 1, "cells": grid})
    ty = H - 215 - 5 * 22 - 30
    text(330, ty, "Subtotal: £115.70")
    text(330, ty - 18, "VAT (20%): £23.14")
    text(330, ty - 36, "Total: £138.84", "Helvetica-Bold", 13)
    text(50, ty - 80, "Payment terms: 30 days net. Thank you for your business.")
    c.showPage()
    text(50, H - 70, "Terms and Conditions", "Helvetica-Bold", 20, page=1)
    for i, s in enumerate(["1. Goods remain the property of the supplier until paid in full.", "2. Queries about this invoice must be raised within 14 days.",
                           "3. These terms are effective 1 January 2024 and replace earlier versions.", "4. Contact: accounts@example.com or +44 20 7946 0456."]):
        text(50, H - 110 - i * 20, s, page=1)
    c.save()
    truth["fields"] = [
        {"type": "identifier", "label": "Invoice No", "value": "INV-2024-0173"}, {"type": "date", "label": "Invoice Date", "value": "2024-03-14"}, {"type": "date", "label": "Due Date", "value": "2024-04-13"},
        {"type": "amount", "label": "Subtotal", "value": "115.70"}, {"type": "amount", "label": "VAT (20%)", "value": "23.14"}, {"type": "amount", "label": "Total", "value": "138.84"},
        {"type": "email", "value": "billing@example.com"}, {"type": "phone", "value": "+44 20 7946 0123"}, {"type": "date", "value": "2024-01-01"}, {"type": "email", "value": "accounts@example.com"}]
    truth["class"] = "invoice"
    return truth


def scan(src_pdf: Path, dst_pdf: Path, angle: float = 1.4) -> dict:
    """Rasterise page 1 and degrade it like a poor flatbed scan. Deterministic."""
    rng = np.random.default_rng(7)
    img = pdfium.PdfDocument(str(src_pdf))[0].render(scale=150 / 72).to_pil().convert("L")
    img = img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=250).filter(ImageFilter.GaussianBlur(0.7))
    a = np.asarray(img, np.float32)
    h, w = a.shape
    a *= (0.88 + 0.12 * (np.linspace(0, 1, w)[None, :] * 0.6 + np.linspace(0, 1, h)[:, None] * 0.4))  # uneven illumination
    a += rng.normal(0, 7, a.shape)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=62)
    Image.open(io.BytesIO(buf.getvalue())).save(dst_pdf, "PDF", resolution=150)
    return {"skew_degrees_counter_clockwise": angle, "dpi": 150}


def stock(path: Path) -> dict:
    truth: dict = {"pages": [[]], "fields": [], "tables": []}
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=0)
    c.setTitle("Sample stock report (fictional)")

    def text(x, y, s, font="Helvetica", size=11):
        c.setFont(font, size)
        c.drawString(x, y, s)
        truth["pages"][0].append(s)

    text(50, H - 70, "Monthly Stock Report", "Helvetica-Bold", 24)
    text(50, H - 92, "Period: April 2024", "Helvetica", 12)
    text(50, H - 108, "Prepared by: Warehouse Office")
    rows = [["Code", "Description", "On hand", "Reorder level", "Status"], ["A-100", "Cable ties (100 pack)", "42", "20", "OK"], ["A-205", "Safety gloves (pair)", "8", "15", "Reorder"], ["B-310", "Label printer tape", "17", "10", "OK"],
            ["B-318", "Packing tape (6 rolls)", "3", "12", "Reorder"], ["C-402", "Bubble wrap (50 m)", "26", "10", "OK"], ["C-455", "Archive boxes", "0", "25", "Out of stock"], ["D-501", "Marker pens (box of 12)", "31", "12", "OK"]]
    grid = table(c, 50, H - 140, [60, 180, 70, 100, 85], rows, right_cols=(2, 3))
    for r in grid:
        truth["pages"][0].extend(r)
    truth["tables"].append({"page": 1, "cells": grid})
    text(50, H - 140 - 8 * 22 - 28, "Items below reorder level: 3")
    c.save()
    truth["fields"] = [{"type": "date", "value": None}]
    truth["class"] = "report"
    return truth


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    t = invoice(OUT / "invoice-text.pdf")
    (OUT / "invoice-text.truth.json").write_text(json.dumps(t, indent=1, ensure_ascii=False))
    s = scan(OUT / "invoice-text.pdf", OUT / "invoice-scanned.pdf")
    t2 = {"pages": [t["pages"][0]], "fields": [f for f in t["fields"] if f["value"] not in ("2024-01-01", "accounts@example.com", "+44 20 7946 0456")], "tables": t["tables"], "class": "invoice", "degradation": s}
    (OUT / "invoice-scanned.truth.json").write_text(json.dumps(t2, indent=1, ensure_ascii=False))
    r = stock(OUT / "stock-report.pdf")
    (OUT / "stock-report.truth.json").write_text(json.dumps(r, indent=1, ensure_ascii=False))
    print("wrote", sorted(p.name for p in OUT.iterdir()))
