"""Document intelligence API: read text from PDFs (text layer) and scans (OCR), find tables, extract fields by rules, and record human review.
Only these responsibilities: no accounts, ERP/CRM integration, e-mail ingestion or archive."""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response

from . import exportpdf
from .config import Settings
from .extract import LOW_CONF
from .jobs import DOC_STATUSES, FIELD_STATUSES, Document, JobManager, QueueFull
from .media import MediaError, describe_unsupported, sniff
from .ocr import ENGINE_INFO, Ocr
from .pipeline import Params, Source

CHUNK = 1024 * 1024
SAMPLE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
FIELD_ID = re.compile(r"^f\d{1,3}-\d{1,5}$")

NOTICE = ("Text from a PDF text layer is exactly what the file contains. Text from OCR is a model's reading of an image and can be wrong, especially digits, small print and poor scans. "
          "Fields are produced by explicit rules, not by a language model, and are not verified. Review before using any value.")

LIMITS = [
    "OCR is imperfect: letters and digits are confused, spaces are sometimes dropped, small or faint text can be missed. The confidence shown is the engine's score for the line, not the probability that it is correct.",
    "Pages are not rotated automatically by 90 or 180 degrees; skew of up to 8 degrees is corrected. Handwriting, stamps, photographs of curved pages and low-resolution scans are outside what this demonstration handles.",
    "The recognition models cover English and Chinese character sets; the demonstration is built for Latin-script business documents. Right-to-left and other scripts are not supported.",
    "Tables are found only when they are drawn with ruling lines; tables without lines are read as ordinary text. Merged cells and nested tables are not modelled.",
    "Fields come from regular expressions and a short label list. Dates written as 03/04/2024 are ambiguous and are flagged rather than guessed. There is no named-entity recognition (people, companies, addresses) and no language-model interpretation.",
    "The document class is a keyword vote, not a trained classifier; documents that do not match are left unclassified.",
    "A PDF that mixes a text layer with scanned images is read from its text layer only; text inside embedded images is not recognised on such pages unless OCR is forced for all pages.",
    "Arithmetic checks (subtotal + tax = total, quantity x price = amount) run only when the values were found; a failure can come from an OCR error, from the document itself, or from a field that was misread.",
]


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        state["jobs"] = app.state.jobs = JobManager(s, Ocr(s.intra_threads))
        yield
        state["jobs"].shutdown()

    app = FastAPI(title="Neo Forge document intelligence", version="1.0.0", lifespan=lifespan,
                  description="Reads PDFs and images (PDF text layer, or OCR with RapidOCR), finds ruled tables, extracts fields by explicit rules and records human review. " + NOTICE)
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["*"])
    app.add_middleware(GZipMiddleware, minimum_size=2000)

    def jobs() -> JobManager:
        return state["jobs"]

    def need(did: str) -> Document:
        d = jobs().get(did)
        if not d:
            raise HTTPException(404, "Document not found or expired.")
        return d

    def need_done(d: Document) -> None:
        if d.status in ("queued", "running"):
            raise HTTPException(409, "Processing is still running. Poll /api/documents/{id}/status.")
        if d.status != "completed" or not d.result:
            raise HTTPException(409, f"No results: the document is {d.status}.")

    def samples() -> list[dict]:
        m = s.samples_dir / "manifest.json"
        try:
            return json.loads(m.read_text())["samples"] if m.is_file() else []
        except (ValueError, KeyError):
            return []

    async def save_upload(file: UploadFile, dest: Path, max_bytes: int) -> tuple[str, int]:
        size, head = 0, b""
        with open(dest, "wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    out.close(); dest.unlink(missing_ok=True)
                    raise HTTPException(413, f"The file is larger than the {max_bytes // 1_000_000} MB limit.")
                if len(head) < 16:
                    head += chunk[:16 - len(head)]
                out.write(chunk)
        if size == 0:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, "The file is empty.")
        fmt = sniff(head)
        if fmt is None:
            dest.unlink(missing_ok=True)
            raise HTTPException(415, describe_unsupported(head) + "Upload a PDF, PNG, JPEG or TIFF file.")
        return fmt, size

    # ---- meta -------------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"ok": True, "ocr": ENGINE_INFO, "pdf": {"name": "pdfium (pypdfium2)", "licence": "Apache-2.0 / BSD-3-Clause"}, "notice": NOTICE, "limitations": LIMITS,
                "active_jobs": sum(1 for x in jobs().docs.values() if x.status in ("queued", "running")),
                "limits": {"max_file_mb": s.max_file_mb, "max_pages": s.max_pages, "max_megapixels": s.max_pixels / 1e6, "render_dpi": s.render_dpi, "max_concurrent_jobs": s.max_concurrent_jobs}}

    @app.get("/api/samples")
    def list_samples():
        return {"samples": samples()}

    # ---- documents --------------------------------------------------------------------------------------------------
    def doc_json(d: Document) -> dict:
        pr = d.progress
        el = (d.finished or time.time()) - d.started if d.started else 0.0
        return {"document_id": d.id, "filename": d.filename, "format": d.fmt, "size_bytes": d.size, "source": d.source, "status": d.status, "stage": pr.stage, "error": d.error,
                "pages": getattr(d, "n_pages", None), "progress": {"pages_done": pr.done, "pages_total": pr.total, "fraction": 1.0 if d.status == "completed" else (min(0.99, pr.done / pr.total) if pr.total else 0.0), "elapsed_seconds": round(el, 2)},
                "review": d.review, "notice": NOTICE}

    @app.post("/api/documents/upload", status_code=201)
    async def upload(file: UploadFile | None = File(None), sample_id: str | None = Form(None)):
        if (file is None) == (sample_id is None):
            raise HTTPException(400, "Send either a document file or a sample_id.")
        try:
            did, dirp = jobs().new_dir()
        except QueueFull as e:
            raise HTTPException(503, str(e)) from None
        try:
            if sample_id is not None:
                item = next((x for x in samples() if x["id"] == sample_id), None) if SAMPLE_ID.match(sample_id) else None
                if not item:
                    raise HTTPException(404, "Unknown sample.")
                src_file = s.samples_dir / item["file"]
                fmt = sniff(src_file.read_bytes()[:16]) or "pdf"
                path = dirp / f"input.{fmt}"
                shutil.copyfile(src_file, path)
                size, source, name = path.stat().st_size, f"sample:{sample_id}", item["file"]
            else:
                fmt, size = await save_upload(file, dirp / "upload.bin", s.max_file_mb * 1_000_000)
                path = dirp / f"input.{fmt}"
                (dirp / "upload.bin").rename(path)
                source, name = "upload", re.sub(r"[^\w.\- ]", "_", Path(file.filename or "document").name)[:80]
            try:
                n = Source(path, fmt, s.render_dpi, s.max_side_px, s.max_pages, s.max_pixels).n  # validates: opens, page count, pixel limits
            except MediaError as e:
                raise HTTPException(422, str(e)) from None
            d = jobs().add(did, dirp, path, fmt, name, source, size)
            d.n_pages = n
        except HTTPException:
            shutil.rmtree(dirp, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(dirp, ignore_errors=True)
            raise HTTPException(500, "The upload could not be processed.") from None
        return doc_json(d)

    @app.post("/api/documents/{did}/process", status_code=202)
    def process(did: str, body: dict | None = Body(None)):
        d = need(did)
        b = body or {}
        if not isinstance(b, dict):
            raise HTTPException(400, "The request body must be a JSON object.")
        mode, sens = str(b.get("ocr_mode", "auto")), str(b.get("sensitivity", "high"))
        if mode not in ("auto", "ocr", "embedded"):
            raise HTTPException(400, "ocr_mode must be auto, ocr or embedded.")
        if sens not in ("standard", "high"):
            raise HTTPException(400, "sensitivity must be standard or high.")
        pr = b.get("pages")
        pages = None
        if pr is not None:
            try:
                lo, hi = int(pr[0]), int(pr[1])
            except (TypeError, ValueError, IndexError, KeyError):
                raise HTTPException(400, "pages must be [first, last] (1-based).") from None
            if lo < 1 or hi < lo:
                raise HTTPException(400, "pages must satisfy 1 <= first <= last.")
            pages = (lo, hi)
        for k in ("deskew", "enhance"):
            if k in b and not isinstance(b[k], bool):
                raise HTTPException(400, f"{k} must be true or false.")
        if d.fmt != "pdf" and mode == "embedded":
            raise HTTPException(400, "Images have no text layer; use ocr_mode auto or ocr.")
        try:
            jobs().submit(d, Params(ocr_mode=mode, deskew=b.get("deskew", True), enhance=b.get("enhance", False), sensitivity=sens, pages=pages))
        except QueueFull as e:
            raise HTTPException(503, str(e)) from None
        return doc_json(d)

    @app.get("/api/documents/{did}/status")
    def status(did: str):
        return doc_json(need(did))

    @app.post("/api/documents/{did}/cancel")
    def cancel(did: str):
        d = need(did)
        if d.status in ("queued", "running"):
            d.cancel.set()
        return {"document_id": d.id, "status": d.status, "cancel_requested": True}

    @app.delete("/api/documents/{did}")
    def delete(did: str):
        jobs().delete(need(did))
        return {"deleted": True}

    # ---- results ----------------------------------------------------------------------------------------------------
    def results_json(d: Document) -> dict:
        r = d.result
        return {**doc_json(d), "summary": r.summary, "classification": r.classification, "fields": r.fields, "validations": r.validations, "warnings": r.warnings,
                "pages": [{k: v for k, v in p.items() if k != "text"} | {"image_url": f"/api/documents/{d.id}/pages/{p['page']}/image"} for p in r.pages],
                "params": {"ocr_mode": d.params.ocr_mode, "deskew": d.params.deskew, "enhance": d.params.enhance, "sensitivity": d.params.sensitivity, "pages": d.params.pages},
                "ocr_engine": ENGINE_INFO, "limitations": LIMITS, "legend": {"embedded_text": "text read from the PDF's own text layer (exact; no recognition)", "ocr_model": "text recognised from the page image by the OCR model (can be wrong)",
                                                                              "rule_parsed": "a value derived from that text by an explicit rule", "manual": "a value you typed"}}

    @app.get("/api/documents/{did}/results")
    def results(did: str):
        d = need(did)
        need_done(d)
        return results_json(d)

    @app.get("/api/documents/{did}/pages")
    def pages(did: str):
        d = need(did)
        need_done(d)
        return {"pages": [{"page": p["page"], "width_px": p["width_px"], "height_px": p["height_px"], "source": p["source"], "items": len(p["items"]), "tables": len(p["tables"]), "warnings": p["warnings"],
                           "image_url": f"/api/documents/{d.id}/pages/{p['page']}/image"} for p in d.result.pages]}

    @app.get("/api/documents/{did}/pages/{n}/image")
    def page_image(did: str, n: int):
        d = need(did)
        need_done(d)
        i = next((k for k, p in enumerate(d.result.pages) if p["page"] == n), None)
        if i is None:
            raise HTTPException(404, "No such page.")
        return Response(d.result.page_images[i], media_type="image/png", headers={"Cache-Control": "no-store"})

    @app.patch("/api/documents/{did}/fields/{fid}")
    def patch_field(did: str, fid: str, body: dict = Body(...)):
        d = need(did)
        need_done(d)
        if not FIELD_ID.match(fid):
            raise HTTPException(404, "Field not found.")
        with d.lock:
            f = next((x for x in d.result.fields if x["id"] == fid), None)
            if not f:
                raise HTTPException(404, "Field not found.")
            if not isinstance(body, dict) or not body or not set(body) <= {"value", "status", "note"}:
                raise HTTPException(400, "Send value, status and/or note.")
            st = body.get("status")
            if st is not None and st not in FIELD_STATUSES:
                raise HTTPException(400, "status must be one of: " + ", ".join(FIELD_STATUSES))
            if "note" in body:
                if not isinstance(body["note"], str):
                    raise HTTPException(400, "note must be text.")
                f["note"] = body["note"].strip()[:500]
            if "value" in body:
                v = body["value"]
                if not isinstance(v, str) or len(v) > 500:
                    raise HTTPException(400, "value must be text of at most 500 characters.")
                f["current_value"] = v.strip()
                if st is None:
                    st = "corrected" if f["current_value"] != f["original_value"] else "unreviewed"
                f["origin"] = "manual" if f["current_value"] != f["original_value"] else "rule_parsed"
            if st is not None:
                if st == "corrected" and f["current_value"] == f["original_value"]:
                    raise HTTPException(400, "The value has not been changed, so it cannot be marked corrected.")
                f["status"] = st
            return f

    @app.post("/api/documents/{did}/review")
    def review(did: str, body: dict = Body(...)):
        d = need(did)
        need_done(d)
        st = body.get("status") if isinstance(body, dict) else None
        if st not in DOC_STATUSES:
            raise HTTPException(400, "status must be one of: " + ", ".join(DOC_STATUSES))
        note = body.get("note", "")
        if not isinstance(note, str):
            raise HTTPException(400, "note must be text.")
        d.review = {"status": st, "note": note.strip()[:1000], "reviewed_at": None if st == "unreviewed" else time.time()}
        return d.review

    @app.get("/api/documents/{did}/export")
    def export(did: str, kind: str = Query("json", pattern="^(txt|json|csv|tables\\.csv|pdf)$")):
        d = need(did)
        need_done(d)
        r, stem = d.result, re.sub(r"[^\w\-]", "_", Path(d.filename).stem)[:40] or "document"
        if kind == "txt":
            out = [f"{d.filename}\nExtracted {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())} by the Neo Forge document intelligence demo.\n{NOTICE}\n"]
            for p in r.pages:
                out.append(f"\n--- Page {p['page']} ({p['source_label']}) ---\n{p['text']}")
            return Response("\n".join(out), media_type="text/plain; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{stem}.txt"'})
        if kind == "json":
            body = json.dumps(results_json(d), indent=1, ensure_ascii=False)
            return Response(body, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{stem}.json"'})
        buf = io.StringIO()
        w = csv.writer(buf)
        if kind == "csv":
            w.writerow(["field_id", "page", "type", "label", "original_value", "current_value", "status", "origin_of_current_value", "text_source", "rule", "ocr_confidence", "flags", "bbox_x0", "bbox_y0", "bbox_x1", "bbox_y1", "note"])
            for f in r.fields:
                w.writerow([f["id"], f["page"], f["type"], f["label"] or "", f["original_value"], f["current_value"], f["status"], f["origin"], f["based_on"], f["rule"], "" if f["ocr_confidence"] is None else f["ocr_confidence"], "; ".join(f["flags"]), *f["bbox"], f["note"]])
            return Response(buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{stem}-fields.csv"'})
        if kind == "tables.csv":
            w.writerow(["table_id", "page", "row", "col", "text"])
            for p in r.pages:
                for t in p["tables"]:
                    for ri, row in enumerate(t["cells"], 1):
                        for ci, cell in enumerate(row, 1):
                            w.writerow([t["id"], p["page"], ri, ci, cell])
            return Response(buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{stem}-tables.csv"'})
        data, replaced = exportpdf.build(r.pages, r.page_images, r.page_pt, d.filename)
        return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{stem}-searchable.pdf"', "X-Replaced-Characters": str(replaced)})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


app = create_app()
