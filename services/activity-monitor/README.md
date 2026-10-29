# Activity review service

FastAPI service behind the **AI Human Activity, Fall & Aggression Review** demo: person detection (YOLOX-S), tracking (ByteTrack), pose (BlazePose), and fall / rapid-close-contact **candidate** rules for human review. Documentation: `docs/activity/`. **Not a safety system; no identification of people.**

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8090      # then set ACTIVITY_API_URL=http://localhost:8090 for the Next.js site
pytest                                # fast tests (models run on a real frame); pytest -m slow runs the whole bundled clip
```
Requires `ffmpeg` on the PATH for browser previews and annotated clips.

## Models
| File | Origin | Licence |
|---|---|---|
| `models/yolox_s.onnx` | https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0 (`yolox_s.onnx`), unmodified | Apache-2.0 |
| `models/blazepose_full.onnx` | `pose_landmark_full.tflite` from the `mediapipe==0.10.14` wheel, converted by `scripts/convert_pose.py` | Apache-2.0 |
