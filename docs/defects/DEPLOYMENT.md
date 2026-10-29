# Deployment

```bash
cd services/defect-inspector
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --port 8060
# site:  DEFECT_API_URL=http://localhost:8060 npm run dev
```
Docker: `docker build -f services/defect-inspector/Dockerfile -t neoforge-defects .` (port 8060, runs as `nobody`).

Environment (optional): `INSPECT_MAX_IMAGE_MB` (20), `INSPECT_MAX_PIXELS` (36 M), `INSPECT_MAX_REF_IMAGES` (60), `INSPECT_MIN_REF_IMAGES` (10), `INSPECT_MAX_CONCURRENT` (2), `INSPECT_TTL_SECONDS` (86400), `INSPECT_MAX_INSPECTIONS` (300), `INSPECT_ALLOWED_ORIGINS`, `INSPECT_INTRA_THREADS`, `INSPECT_WORK_DIR`.

CPU only; 2 cores and 2 GB RAM are enough for single-user use. Use a container platform, not serverless functions. Models are in the repository (`models/resnet50_l23.onnx` 34 MB, `models/references/*.npz`). Rebuilding references needs the VisA dataset: `python scripts/build_references.py /path/to/VisA`. Nothing is deployed by this repository and no hosting/DNS setting is changed.
