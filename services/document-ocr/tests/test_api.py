import io
import time

import pypdfium2 as pdfium
import pytest
from PIL import Image
from reportlab.pdfgen import canvas

from tests.conftest import SAMPLES


def up(client, data: bytes, name="d.pdf"):
    return client.post("/api/documents/upload", files={"file": (name, io.BytesIO(data), "application/octet-stream")})


def wait(client, did, timeout=120):
    t = time.time()
    while time.time() - t < timeout:
        st = client.get(f"/api/documents/{did}/status").json()
        if st["status"] in ("completed", "failed", "cancelled"):
            return st
        time.sleep(0.3)
    raise AssertionError("timeout")


def sample(client, sid="invoice-text", **proc):
    d = client.post("/api/documents/upload", data={"sample_id": sid}).json()
    assert client.post(f"/api/documents/{d['document_id']}/process", json=proc).status_code == 202
    assert wait(client, d["document_id"])["status"] == "completed"
    return d["document_id"]


def test_health_and_samples(client):
    h = client.get("/api/health").json()
    assert h["ok"] and "can be wrong" in h["notice"] and h["ocr"]["licence"] == "Apache-2.0" and len(h["limitations"]) >= 6
    s = client.get("/api/samples").json()["samples"]
    assert [x["id"] for x in s] == ["invoice-text", "invoice-scanned", "stock-report", "scan-tesseract-phototest"] and all(x["provenance"] and x["licence"] and x["does_not_demonstrate"] for x in s)


@pytest.mark.parametrize("data,code", [(b"", 400), (b"plain text, not a document", 415), (b"GIF89a" + b"0" * 40, 415), (b"PK\x03\x04" + b"0" * 40, 415), (b"RIFF\x00\x00\x00\x00WEBP" + b"0" * 40, 415)])
def test_upload_type_validation(client, data, code):
    assert up(client, data).status_code == code


def test_upload_validation_by_content_not_name(client):
    assert up(client, (SAMPLES / "invoice-text.pdf").read_bytes(), "invoice.png").json()["format"] == "pdf"        # the bytes win over the extension
    assert up(client, b"%PDF-1.4 this is not a real pdf", "x.pdf").status_code == 422
    assert up(client, (SAMPLES / "invoice-text.pdf").read_bytes()[:400], "x.pdf").status_code == 422
    assert up(client, b"\x89PNG\r\n\x1a\n" + b"\x00" * 30, "x.png").status_code == 422


def test_oversize_and_page_limits(client, tmp_path):
    assert up(client, b"%PDF-1.4" + b"0" * (6 * 1_000_000)).status_code == 413
    p = tmp_path / "many.pdf"
    c = canvas.Canvas(str(p))
    for i in range(31):
        c.drawString(100, 100, f"page {i}"); c.showPage()
    c.save()
    r = up(client, p.read_bytes())
    assert r.status_code == 422 and "31 pages" in r.json()["detail"] and str(tmp_path) not in r.text
    big = io.BytesIO()
    Image.new("1", (9000, 9000)).save(big, "PNG")      # 81 megapixels, tiny file
    assert up(client, big.getvalue()).status_code == 422


def test_filenames_are_sanitised(client):
    r = up(client, (SAMPLES / "invoice-text.pdf").read_bytes(), "../../etc/pass<wd>.pdf").json()
    assert "/" not in r["filename"] and "<" not in r["filename"]


def test_source_rules_and_ids(client):
    assert client.post("/api/documents/upload").status_code == 400
    assert client.post("/api/documents/upload", data={"sample_id": "nope"}).status_code == 404
    assert client.post("/api/documents/upload", data={"sample_id": "../../etc/passwd"}).status_code == 404
    for p in ("abc", "0" * 32, "..%2F..%2Fx"):
        assert client.get(f"/api/documents/{p}/status").status_code == 404


def test_gating_and_parameter_validation(client):
    d = client.post("/api/documents/upload", data={"sample_id": "invoice-text"}).json()["document_id"]
    for ep in ("results", "pages", "export"):
        assert client.get(f"/api/documents/{d}/{ep}").status_code == 409
    assert client.get(f"/api/documents/{d}/pages/1/image").status_code == 409
    assert client.patch(f"/api/documents/{d}/fields/f1-1", json={"note": "x"}).status_code == 409
    for body in ({"ocr_mode": "x"}, {"sensitivity": "extreme"}, {"pages": [0, 1]}, {"pages": [3, 1]}, {"pages": "all"}, {"deskew": "yes"}, {"enhance": 1}):
        assert client.post(f"/api/documents/{d}/process", json=body).status_code == 400, body
    assert client.post(f"/api/documents/{d}/process", json=[1]).status_code in (400, 422)
    png = io.BytesIO()
    Image.new("L", (50, 50)).save(png, "PNG")
    pid = up(client, png.getvalue(), "i.png").json()["document_id"]
    assert client.post(f"/api/documents/{pid}/process", json={"ocr_mode": "embedded"}).status_code == 400   # an image has no text layer
    assert client.post(f"/api/documents/{d}/process", json={"pages": [5, 6]}).status_code == 202           # accepted, fails at run time
    assert wait(client, d)["status"] == "failed" and "outside the document" in wait(client, d)["error"]


def test_text_pdf_flow_and_results(client):
    d = sample(client)
    r = client.get(f"/api/documents/{d}/results").json()
    assert r["classification"]["label"] == "invoice" and r["summary"]["pages"] == 2 and r["summary"]["items_by_source"] == {"embedded_text": r["summary"]["text_items"]}
    assert r["legend"]["rule_parsed"] and any("text layer" in w for w in r["warnings"]) and r["params"]["ocr_mode"] == "auto"
    assert r["pages"][0]["image_url"] == f"/api/documents/{d}/pages/1/image" and r["pages"][0]["source_label"] == "PDF text layer"
    assert len(client.get(f"/api/documents/{d}/pages").json()["pages"]) == 2
    img = client.get(f"/api/documents/{d}/pages/1/image")
    assert img.status_code == 200 and img.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert client.get(f"/api/documents/{d}/pages/9/image").status_code == 404
    assert client.get(f"/api/documents/{d}/pages/x/image").status_code == 422


def test_scanned_flow_reports_confidence(client):
    d = sample(client, "invoice-scanned")
    r = client.get(f"/api/documents/{d}/results").json()
    assert r["summary"]["ocr_confidence"]["mean"] > 0.7 and r["pages"][0]["preprocessing"]["deskew"]["applied"] and r["pages"][0]["ocr"]["engine"].startswith("RapidOCR")
    assert any(f["ocr_confidence"] is not None for f in r["fields"])


def test_field_correction_and_review(client):
    d = sample(client)
    fields = client.get(f"/api/documents/{d}/results").json()["fields"]
    f = next(x for x in fields if x["label"] == "Total")
    assert f["status"] == "unreviewed" and f["original_value"] == f["current_value"] == "138.84"
    r = client.patch(f"/api/documents/{d}/fields/{f['id']}", json={"value": " 138.48 ", "note": "typo in total"})
    assert r.status_code == 200 and r.json()["current_value"] == "138.48" and r.json()["original_value"] == "138.84" and r.json()["status"] == "corrected" and r.json()["origin"] == "manual" and r.json()["note"] == "typo in total"
    assert client.patch(f"/api/documents/{d}/fields/{f['id']}", json={"status": "confirmed"}).json()["status"] == "confirmed"
    assert client.patch(f"/api/documents/{d}/fields/{f['id']}", json={"value": "138.84"}).json()["origin"] == "rule_parsed"     # back to the parsed value
    assert client.patch(f"/api/documents/{d}/fields/{f['id']}", json={"status": "corrected"}).status_code == 400                # nothing was corrected
    for bad in ({}, {"status": "bogus"}, {"value": 5}, {"value": "x" * 501}, {"note": 5}, {"other": 1}):
        assert client.patch(f"/api/documents/{d}/fields/{f['id']}", json=bad).status_code == 400, bad
    assert client.patch(f"/api/documents/{d}/fields/f1-999", json={"status": "confirmed"}).status_code == 404
    assert client.patch(f"/api/documents/{d}/fields/..%2Fx", json={"status": "confirmed"}).status_code == 404
    client.patch(f"/api/documents/{d}/fields/{f['id']}", json={"value": "138.48"})
    rv = client.post(f"/api/documents/{d}/review", json={"status": "needs_rework", "note": "  check totals "})
    assert rv.json()["status"] == "needs_rework" and rv.json()["note"] == "check totals" and rv.json()["reviewed_at"]
    assert client.post(f"/api/documents/{d}/review", json={"status": "fine"}).status_code == 400
    assert client.post(f"/api/documents/{d}/review", json={"status": "approved", "note": 3}).status_code == 400
    assert client.get(f"/api/documents/{d}/status").json()["review"]["status"] == "needs_rework"


def test_exports(client):
    d = sample(client, "invoice-scanned")
    client.patch(f"/api/documents/{d}/fields/f1-1", json={"value": "CHANGED", "note": "n"})
    txt = client.get(f"/api/documents/{d}/export?kind=txt")
    assert "Page 1 (OCR)" in txt.text and "can be wrong" in txt.text and "attachment" in txt.headers["content-disposition"]
    js = client.get(f"/api/documents/{d}/export?kind=json").json()
    assert js["fields"][0]["current_value"] == "CHANGED" and js["fields"][0]["original_value"] != "CHANGED" and js["fields"][0]["status"] == "corrected"
    csv_ = client.get(f"/api/documents/{d}/export?kind=csv").text.splitlines()
    assert csv_[0].startswith("field_id,page,type") and "CHANGED" in csv_[1] and "manual" in csv_[1]
    tcsv = client.get(f"/api/documents/{d}/export?kind=tables.csv").text.splitlines()
    assert tcsv[0] == "table_id,page,row,col,text" and len(tcsv) == 1 + 20
    pdf = client.get(f"/api/documents/{d}/export?kind=pdf")
    assert pdf.headers["content-type"] == "application/pdf" and pdf.headers["x-replaced-characters"] == "0"
    assert "138.84" in pdfium.PdfDocument(pdf.content)[0].get_textpage().get_text_range()
    assert client.get(f"/api/documents/{d}/export?kind=xlsx").status_code == 422


def test_delete_and_cancel(client):
    d = client.post("/api/documents/upload", data={"sample_id": "invoice-scanned"}).json()["document_id"]
    client.post(f"/api/documents/{d}/process", json={})
    client.post(f"/api/documents/{d}/cancel")
    assert wait(client, d)["status"] in ("cancelled", "completed")
    assert client.delete(f"/api/documents/{d}").json()["deleted"]
    assert client.get(f"/api/documents/{d}/status").status_code == 404


def test_store_limit(client):
    ids = []
    for _ in range(8):
        r = client.post("/api/documents/upload", data={"sample_id": "invoice-text"})
        assert r.status_code == 201
        ids.append(r.json()["document_id"])
    assert client.post("/api/documents/upload", data={"sample_id": "invoice-text"}).status_code == 503
    client.delete(f"/api/documents/{ids[0]}")
    assert client.post("/api/documents/upload", data={"sample_id": "invoice-text"}).status_code == 201
