# AI Document Intelligence & OCR (Computer Vision demo no. 10)

Read PDFs and scans, see exactly where each piece of text sits on the page, get tables and rule-parsed fields, correct them and record a review. Frontend `src/components/documents/*`, `src/lib/documents/*`; backend `services/document-ocr/` (FastAPI, pypdfium2, RapidOCR on ONNX Runtime, OpenCV). Route `/ai-demos/ai-document-intelligence-ocr/app`. No database, no ERP/CRM integration: documents and corrections live in a temporary directory that expires.

## Workflow
1. **Document**: upload PDF, PNG, JPEG or TIFF (multi-page TIFF too), or open a sample. The bytes decide the type, not the file name.
2. **Read**: *Automatic* uses a PDF's own text layer when it has one and OCR otherwise; *OCR every page* ignores any text layer; *Text layer only* never runs OCR. OCR pages are deskewed (up to 8°) and can be contrast-enhanced first.
3. **Look**: the page image with boxes for every text line (colour = source, red = OCR confidence below 0.85), tables, and fields (dashed = box position estimated). Zoom, pan, layer toggles, page list.
4. **Use**: *Fields* (edit, confirm, reject, notes), *Text* (search across the document, click to jump), *Tables* (cell grids), *Summary* (document type with matched keywords, counts, arithmetic checks, per-page preprocessing, warnings, limitations).
5. **Review**: approve / needs rework / reject the document with a note; per-field statuses.
6. **Export**: TXT, JSON, fields CSV, tables CSV, and a **searchable PDF** (page image plus an invisible text layer) that is generated for real and tested by searching it.

## Four kinds of value, never mixed
| Label | Meaning |
|---|---|
| **PDF text layer** | text read from the PDF's own text layer, with exact character positions; no recognition, no confidence |
| **OCR** | text recognised from the page image by the PP-OCR model; has the engine's per-line confidence |
| **Rule-parsed** | a value derived from that text by an explicit rule (the rule is shown) |
| **Typed by you** | a value you changed; the original stays next to it |

There is no language-model or learned entity extraction, so nothing is labelled "model-inferred" beyond the OCR text itself.

See also `ARCHITECTURE.md`, `API.md`, `METHODS.md`, `SAMPLE_DATA.md`, `LIMITATIONS.md`, `TESTING.md`, `DEPLOYMENT.md`.
