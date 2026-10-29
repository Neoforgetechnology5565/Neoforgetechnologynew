# Deployment

```bash
docker build -f services/document-ocr/Dockerfile -t neoforge-documents .      # from the repository root
docker run -p 8100:8100 neoforge-documents
```
Set `DOCS_API_URL` (for example `http://localhost:8100`) for the Next.js site. Without it the page says the service is not connected and reads nothing. CPU only; the OCR models are inside the `rapidocr-onnxruntime` wheel, so nothing is downloaded at run time. Allow about 1 GB RAM and roughly 2–4 s per scanned page (measured 3.4 s for the simulated scan on 4 vCPUs); text PDFs take well under a second.

Environment variables (defaults): `DOCS_MAX_FILE_MB` (40), `DOCS_MAX_PAGES` (30), `DOCS_MAX_PIXELS` (50 000 000 per image page), `DOCS_RENDER_DPI` (200), `DOCS_MAX_SIDE_PX` (2600), `DOCS_MAX_CONCURRENT_JOBS` (1), `DOCS_MAX_QUEUED_JOBS` (3), `DOCS_MAX_DOCUMENTS` (8), `DOCS_TTL_SECONDS` (3600), `DOCS_ALLOWED_ORIGINS`, `DOCS_INTRA_THREADS`, `DOCS_WORK_DIR`, `DOCS_SAMPLES_DIR`.

Licences: RapidOCR and the PP-OCR models Apache-2.0; pypdfium2 Apache-2.0 / BSD-3-Clause (PDFium); ReportLab BSD; OpenCV Apache-2.0. PyMuPDF was deliberately not used because it is AGPL-3.0.
