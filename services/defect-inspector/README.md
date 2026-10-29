# Visual inspection service

FastAPI service behind the **AI Visual Inspection & Defect Detection** demo: PatchCore-style anomaly detection (ONNX Runtime, CPU), configurable quality rules and human review. Documentation: `docs/defects/`.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8060      # then set DEFECT_API_URL=http://localhost:8060 for the Next.js site
pytest                               # service tests (no dataset needed)
```
Models are committed: `models/resnet50_l23.onnx` (ImageNet ResNet-50 up to layer 3, converted from the Keras applications weights; see `scripts/convert_backbone.py`) and `models/references/*.npz` (VisA references with their evaluation). State is temporary.
