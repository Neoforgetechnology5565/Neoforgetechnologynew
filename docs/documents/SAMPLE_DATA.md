# Sample data

Four documents in `public/documents/samples/` with provenance in `manifest.json` (shown in the UI):

| Sample | What it is | Licence |
|---|---|---|
| `invoice-text.pdf` | Two-page text PDF: fictional invoice with a ruled table, terms on page 2 | created for this project |
| `invoice-scanned.pdf` | Page 1 of that invoice rasterised and degraded (1.4° skew, blur, uneven light, noise, JPEG) as an **image-only PDF** — a simulation, not a photograph | created for this project |
| `stock-report.pdf` | One-page fictional report with an 8 × 5 ruled table | created for this project |
| `scan-tesseract-phototest.tif` | The Tesseract project's 640 × 480 black-and-white test image of eight lines of text, unmodified | Apache-2.0 (github.com/tesseract-ocr/test) |

The generated files have `*.truth.json` (exact lines, fields and table cells drawn) which the tests compare against; `scripts/make_samples.py` regenerates them deterministically. All names, addresses, e-mail addresses (example.com) and telephone numbers are fictional. **No real-world scanned business document is bundled**: none with a clear redistribution licence was reachable, so behaviour on genuine scans, stamps, handwriting and photographs of paper is untested. Use your own documents for that.
