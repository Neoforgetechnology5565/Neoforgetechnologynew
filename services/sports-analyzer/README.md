# Sports analysis service

FastAPI service behind the **Sports Video Intelligence** demo: FootAndBall player/ball detection (ONNX Runtime), ByteTrack tracking, camera-motion estimation, manual pitch calibration and statistics. Documentation: `docs/sports/`.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8050     # ffmpeg on PATH enables browser previews
pytest                               # service tests (synthetic decodable video; SPORTS_TEST_VIDEO + -m slow for real footage)
```
The detector model `models/footandball.onnx` (0.8 MB) is committed; `python scripts/fetch_models.py --rebuild` regenerates it from the published weights. State is temporary job directories only.
