# Architecture

```
Browser (Next.js)                          services/document-ocr (FastAPI, port 8100)
 DocumentApp ── PageViewer (img + SVG) ──▶ main.py      endpoints, validation, exports
   src/lib/documents/api.ts                  pipeline.py  pages → items → layout → fields → checks → class
                                             embedded.py  PDF text layer (pypdfium2): characters → items with exact boxes
                                             ocr.py       RapidOCR (PP-OCR det+cls+rec, ONNX) + skew estimate/rotate + enhance
                                             layout.py    reading rows, headings, ruled-table grids (OpenCV)
                                             extract.py   field rules, arithmetic checks, keyword classifier
                                             exportpdf.py searchable PDF (reportlab, invisible text)
                                             jobs.py      in-memory documents, bounded queue, expiry, review state
```
* **One coordinate system**: every box is normalised to the page image (x right, y down, 0..1), so the viewer draws them without knowing the source. PDF text boxes come from the PDF's crop box; OCR boxes from the detector's polygons (axis-aligned hull).
* **Working image**: PDFs are rendered at 200 dpi (long side capped at 2600 px); images are scaled down if larger. For OCR pages the image shown is the **deskewed** one, so boxes always sit on what the user sees.
* **Items → structure**: items are grouped into rows by vertical overlap; ruled grids (found on the image) own the items whose centres fall in their cells; the remaining items feed the heading and field rules.
* **Bounds**: file size, page count, pixels per image page, stored documents, queue and TTL limits in `config.py`; ids are 32 hex characters; field ids `f<page>-<n>`; generic error messages; no file-system paths reach the client; file names are sanitised; temp files are removed on expiry and at start-up.
