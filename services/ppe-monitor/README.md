# Factory workforce detection, tracking and PPE monitoring service

FastAPI + ONNX Runtime (YOLOX person detector) + OpenCV DNN (Intel `worker_safety_mobilenet` hard hat / safety vest detector) + ByteTrack.
Detects workers, tracks them, detects hard hats and safety vests, associates them with workers and reports a cautious per-worker assessment. Nothing else:
no HR, payroll, attendance, user accounts, identity matching or incident workflows. See `docs/ppe/` at the repository root.

```bash
pip install -r requirements-dev.txt
python scripts/fetch_model.py          # downloads the YOLOX-tiny person model; the PPE model is committed in models/
uvicorn app.main:app --port 8020
pytest                                  # add `-m slow` for the memory test
```
