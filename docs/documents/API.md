# API (service port 8100; the browser calls it through `DOCS_API_URL`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | OCR engine and licence, limits, the standing notice and limitations |
| GET | `/api/samples` | bundled samples with provenance, licence, what they do and do not demonstrate |
| POST | `/api/documents/upload` | multipart `file` **or** `sample_id`; validates by content, opens the document, counts pages |
| POST | `/api/documents/{id}/process` | JSON `{ocr_mode: auto\|ocr\|embedded, deskew, enhance, sensitivity: standard\|high, pages:[first,last]}`; 202 |
| GET | `/api/documents/{id}/status` | stage, progress, review status |
| POST | `/api/documents/{id}/cancel`, DELETE `/api/documents/{id}` | stop / remove |
| GET | `/api/documents/{id}/results` | pages (items, tables, headings, preprocessing), fields, validations, classification, summary, warnings, legend, limitations |
| GET | `/api/documents/{id}/pages`, `/pages/{n}/image` | page list; the page image (PNG) the boxes refer to |
| PATCH | `/api/documents/{id}/fields/{field_id}` | `{value?, status?: unreviewed\|confirmed\|corrected\|rejected, note?}`; changing the value marks it corrected and `origin: manual`, the original is kept |
| POST | `/api/documents/{id}/review` | `{status: unreviewed\|approved\|needs_rework\|rejected, note}` |
| GET | `/api/documents/{id}/export?kind=txt\|json\|csv\|tables.csv\|pdf` | downloads (`X-Replaced-Characters` on the PDF reports characters it could not encode) |

Errors: 400 invalid parameters, 404 unknown/expired id, 409 results not ready, 413 too large, 415 unsupported type, 422 unreadable or out-of-limit document, 503 busy, 500 generic.
