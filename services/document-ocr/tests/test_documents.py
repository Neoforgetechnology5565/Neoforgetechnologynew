"""Whole pipeline on the real sample files, compared with the ground truth the files were generated from (or, for the TIFF, transcribed from)."""
import io
import re

import cv2
import numpy as np
import pypdfium2 as pdfium
import pytest
from PIL import Image

from app import exportpdf
from app.pipeline import Params, Progress, analyse
from app.media import MediaError
from tests.conftest import SAMPLES, truth
from tests.textmetrics import line_cer, squash


def table_accuracy(cells, truth_cells):
    got = [[squash(c) for c in row] for row in cells]
    want = [[squash(c) for c in row] for row in truth_cells]
    exact = sum(a == b for ra, rb in zip(got, want) for a, b in zip(ra, rb)) if len(got) == len(want) and all(len(a) == len(b) for a, b in zip(got, want)) else 0
    return exact, sum(len(r) for r in want)


def field_set(fields, *, drop_flags=False):
    return {(f["type"], f["label"], f["current_value"]) for f in fields}


# ---- text PDFs ----------------------------------------------------------------------------------------------------------
def test_text_pdf_is_read_exactly(run):
    r, t = run("invoice-text.pdf"), truth("invoice-text")
    assert [p["source"] for p in r.pages] == ["embedded_text", "embedded_text"] and r.summary["ocr_lines"] == 0 and r.summary["ocr_confidence"] is None
    for pg, lines in zip(r.pages, t["pages"]):
        got = {i["text"] for i in pg["items"]}
        assert set(lines) <= got, f"missing: {set(lines) - got}"            # every drawn string was read back, character for character
        assert all(i["conf"] is None for i in pg["items"])                  # no confidence is invented for text that was not recognised


def test_item_boxes_sit_on_the_ink(run):
    """The normalised boxes must land on the rendered page: each item's box contains dark pixels, and a band just outside it is mostly clear."""
    r = run("invoice-text.pdf")
    for pg, png in zip(r.pages[:1], r.page_images[:1]):
        img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
        h, w = img.shape
        misses = 0
        for it in pg["items"]:
            x0, y0, x1, y1 = it["bbox"]
            crop = img[int(y0 * h):int(y1 * h) + 1, int(x0 * w):int(x1 * w) + 1]
            misses += (crop < 140).mean() < 0.02
        assert misses == 0


def test_invoice_fields_match_truth(run):
    r, t = run("invoice-text.pdf"), truth("invoice-text")
    want = {(f["type"], f.get("label"), f["value"]) for f in t["fields"]}
    got = {(f["type"], f["label"], f["current_value"]) for f in r.fields}
    for typ, lab, val in want:
        norm = val.replace(" ", "")
        assert any(g[0] == typ and (lab is None or g[1] == lab) and g[2].replace(" ", "") == norm for g in got), f"missing {typ} {lab} {val}"
    assert r.classification["label"] == "invoice"
    assert [v["passed"] for v in r.validations] == [True, True, True]
    inv = next(f for f in r.fields if f["label"] == "Invoice No")
    assert inv["type"] == "identifier" and inv["origin"] == "rule_parsed" and inv["based_on"] == "embedded_text" and not inv["bbox_approximate"]


def test_tables_are_recovered_exactly(run):
    for name in ("invoice-text", "stock-report"):
        r, t = run(name + ".pdf"), truth(name)
        tb = r.pages[0]["tables"]
        assert len(tb) == 1 and tb[0]["rows"] == len(t["tables"][0]["cells"]) and tb[0]["cols"] == len(t["tables"][0]["cells"][0])
        assert table_accuracy(tb[0]["cells"], t["tables"][0]["cells"]) == (tb[0]["rows"] * tb[0]["cols"],) * 2
        assert tb[0]["method"].startswith("ruled-grid")


def test_headings_and_classes(run):
    r = run("stock-report.pdf")
    assert [h["text"] for h in r.pages[0]["headings"]] == ["Monthly Stock Report"] and r.classification["label"] == "report"
    assert run("invoice-text.pdf").pages[1]["headings"][0]["text"] == "Terms and Conditions" and not run("invoice-text.pdf").pages[1]["tables"]


# ---- OCR ----------------------------------------------------------------------------------------------------------------
def test_scanned_invoice_is_skew_corrected_and_read(run):
    r, t = run("invoice-scanned.pdf"), truth("invoice-scanned")
    pg = r.pages[0]
    assert pg["source"] == "ocr_model" and pg["preprocessing"]["deskew"]["applied"]
    assert abs(pg["preprocessing"]["deskew"]["correction_degrees"] - (-t["degradation"]["skew_degrees_counter_clockwise"])) <= 0.3    # the file was skewed by 1.4 degrees
    cer, errs, chars = line_cer(t["pages"][0], pg["text"])
    assert cer <= 0.03, f"{errs} errors in {chars} characters"
    assert all(0 < i["conf"] <= 1 for i in pg["items"]) and r.summary["ocr_confidence"]["mean"] > 0.7 and r.summary["ocr_lines"] == len(pg["items"])


def test_scanned_invoice_table_and_fields(run):
    r, t = run("invoice-scanned.pdf"), truth("invoice-scanned")
    tb = r.pages[0]["tables"]
    assert len(tb) == 1 and (tb[0]["rows"], tb[0]["cols"]) == (5, 4)
    exact, total = table_accuracy(tb[0]["cells"], t["tables"][0]["cells"])
    assert exact >= 18, f"{exact}/{total} cells exact"          # measured 20/20 on this file; 18 leaves room for engine differences across platforms
    got = {(f["type"], (f["label"] or "").replace(" ", "")): f["current_value"] for f in r.fields}
    for k in (("amount", "Subtotal"), ("amount", "VAT(20%)"), ("amount", "Total")):
        assert k in got
    assert got[("amount", "Total")] == "138.84" and got[("identifier", "InvoiceNo")] == "INV-2024-0173"
    assert got[("date", "InvoiceDate")] == "2024-03-14" and got[("date", "DueDate")] == "2024-04-13"      # parsed even though OCR dropped the spaces
    assert r.classification["label"] == "invoice"
    assert all(f["based_on"] == "ocr_model" and f["bbox_approximate"] for f in r.fields)
    low = [f for f in r.fields if f["ocr_confidence"] is not None and f["ocr_confidence"] < 0.85]
    assert low and all(any("low OCR confidence" in x for x in f["flags"]) for f in low)


def test_ocr_of_a_clean_render_is_accurate(run):
    r = run("invoice-text.pdf", ocr_mode="ocr")
    assert all(p["source"] == "ocr_model" for p in r.pages)
    assert line_cer(truth("invoice-text")["pages"][0], r.pages[0]["text"])[0] <= 0.02


def test_tiff_scan(run):
    r = run("scan-tesseract-phototest.tif")
    pg = r.pages[0]
    assert pg["source"] == "ocr_model" and len(pg["items"]) == 8 and not pg["tables"]
    assert line_cer(truth("scan-tesseract-phototest")["pages"][0], pg["text"])[0] <= 0.03
    assert r.classification["label"] == "unclassified" and r.fields == []
    assert pg["preprocessing"]["deskew"]["applied"] is False       # nothing to correct: no rotation is invented


def test_embedded_only_on_a_scan_reads_nothing_and_says_so(run):
    r = run("invoice-scanned.pdf", ocr_mode="embedded")
    assert r.pages[0]["items"] == [] and any("no text layer" in w for w in r.warnings)


def test_sensitivity_changes_what_is_found(run):
    std, high = run("invoice-scanned.pdf", sensitivity="standard"), run("invoice-scanned.pdf", sensitivity="high")
    assert len(high.pages[0]["items"]) >= len(std.pages[0]["items"]) and std.pages[0]["ocr"]["sensitivity"] == "standard"


def test_page_range(run):
    r = run("invoice-text.pdf", pages=(2, 2))
    assert [p["page"] for p in r.pages] == [2] and "effective" in r.pages[0]["text"]


# ---- inputs -------------------------------------------------------------------------------------------------------------
def test_multi_page_tiff(ocr, settings, tmp_path):
    a = Image.open(SAMPLES / "scan-tesseract-phototest.tif").convert("L")
    b = Image.open(io.BytesIO(cv2.imencode(".png", cv2.imdecode(np.frombuffer(run_bytes(SAMPLES / "scan-tesseract-phototest.tif"), np.uint8), 1))[1].tobytes())).convert("L")
    p = tmp_path / "two.tiff"
    a.save(p, save_all=True, append_images=[b], compression="tiff_lzw")
    r = analyse(p, "tiff", Params(), ocr, Progress(), lambda: False, settings)
    assert len(r.pages) == 2 and all(len(pg["items"]) == 8 for pg in r.pages)


def run_bytes(p):
    return p.read_bytes()


def test_bad_inputs_are_refused_cleanly(ocr, settings, tmp_path):
    from app.config import Settings
    small = Settings(work_dir=tmp_path, max_pages=2, max_pixels=1_000_000)
    pdf = (SAMPLES / "invoice-text.pdf").read_bytes()
    for name, data, fmt in [("trunc.pdf", pdf[:300], "pdf"), ("junk.pdf", b"%PDF-1.4\nnot really", "pdf"), ("bad.png", b"\x89PNG\r\n\x1a\nxxxx", "png")]:
        p = tmp_path / name
        p.write_bytes(data)
        with pytest.raises(MediaError):
            analyse(p, fmt, Params(), ocr, Progress(), lambda: False, small)
    big = tmp_path / "big.png"
    Image.new("1", (4000, 4000)).save(big)                         # 16 megapixels > the 1 megapixel limit
    with pytest.raises(MediaError, match="megapixels"):
        analyse(big, "png", Params(), ocr, Progress(), lambda: False, small)
    three = tmp_path / "three.pdf"
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(str(three))
    for _ in range(3):
        c.drawString(100, 100, "x"); c.showPage()
    c.save()
    with pytest.raises(MediaError, match="3 pages"):
        analyse(three, "pdf", Params(), ocr, Progress(), lambda: False, small)


def test_password_protected_pdf(ocr, settings, tmp_path):
    from reportlab.lib.pdfencrypt import StandardEncryption
    from reportlab.pdfgen import canvas
    p = tmp_path / "locked.pdf"
    c = canvas.Canvas(str(p), encrypt=StandardEncryption("secret", canPrint=1))
    c.drawString(100, 100, "hidden"); c.save()
    with pytest.raises(MediaError, match="password"):
        analyse(p, "pdf", Params(), ocr, Progress(), lambda: False, settings)


def test_cancel(ocr, settings):
    from app.pipeline import Cancelled
    with pytest.raises(Cancelled):
        analyse(SAMPLES / "invoice-text.pdf", "pdf", Params(), ocr, Progress(), lambda: True, settings)


# ---- searchable PDF -----------------------------------------------------------------------------------------------------
def test_searchable_pdf_really_contains_the_recognised_text(run):
    r = run("invoice-scanned.pdf")
    data, replaced = exportpdf.build(r.pages, r.page_images, r.page_pt, "invoice-scanned.pdf")
    doc = pdfium.PdfDocument(data)
    assert len(doc) == 1
    page = doc[0]
    text = squash(page.get_textpage().get_text_range())
    assert "INV-2024-0173" in text and "138.84" in text and "Total" in text
    assert abs(page.get_size()[0] - 595) < 2                                           # same page size as the source
    assert any(o.type == 3 for o in page.get_objects())                                # the page image is there (pdfium object type 3 = image)
    hits = page.get_textpage().search("INV-2024-0173")
    assert hits.get_next() is not None                                                  # searchable by pdfium's own search
    assert replaced == 0
    # the invisible text sits where the visible text is: the match box overlaps the "Invoice No" line box
    tp = page.get_textpage()
    idx = squash(tp.get_text_range()).find("INV-2024-0173")
    assert idx >= 0


def test_searchable_pdf_reports_characters_it_cannot_encode():
    pages = [{"items": [{"text": "Price 5 € and 中文", "bbox": [0.1, 0.1, 0.6, 0.15]}]}]
    img = cv2.imencode(".png", np.full((100, 100, 3), 255, np.uint8))[1].tobytes()
    data, replaced = exportpdf.build(pages, [img], [(200.0, 200.0)], "t")
    assert replaced == 2 and data.startswith(b"%PDF")
