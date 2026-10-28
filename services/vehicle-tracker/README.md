# Vehicle detection, tracking and counting service

FastAPI + ONNX Runtime (YOLOX) + OpenCV + ByteTrack. Detects, tracks and counts vehicles. Nothing else.
See `docs/vehicle/` at the repository root for architecture, API, licences, limitations, testing and deployment.

```bash
pip install -r requirements-dev.txt
python scripts/fetch_model.py
uvicorn app.main:app --port 8010
pytest                       # add `-m slow` for the memory test
```
