# Roof analysis service

FastAPI service behind the **AI Roof Measurement & Estimation** demo. It runs a real roof-segmentation network (ONNX Runtime, CPU),
turns the mask into roof regions, and measures them under an explicit, user-supplied scale. Full documentation: `docs/roof/`.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8040          # then set ROOF_API_URL=http://localhost:8040 for the Next.js site
pytest                                   # service tests (real model, real SpaceNet chips)
```

State is temporary job directories only (TTL reaper); there is no database. Configuration is by `ROOF_*` environment variables
(see `app/config.py`). The model file `models/roof_unet_ft.onnx` is committed (30 MB).
