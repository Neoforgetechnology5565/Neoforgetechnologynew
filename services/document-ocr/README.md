# Document intelligence service

FastAPI service behind the **AI Document Intelligence & OCR** demo: reads PDFs (their text layer) and scans (OCR with RapidOCR / PP-OCR on ONNX Runtime), finds ruled tables (OpenCV), extracts fields by explicit rules, runs arithmetic checks and a keyword classifier, and stores human corrections. Documentation: `docs/documents/`.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8100       # then set DOCS_API_URL=http://localhost:8100 for the Next.js site
pytest                                 # 45 tests on the real sample files (about 35 s)
python scripts/make_samples.py         # regenerate the fictional sample documents and their ground truth
```
No model download is needed: the OCR models are inside the `rapidocr-onnxruntime` wheel. PDF handling uses pypdfium2 (Apache-2.0/BSD-3, not PyMuPDF, which is AGPL).
