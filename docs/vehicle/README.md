# Vehicle Detection, Tracking & Counting (Computer Vision demo #03)

Interactive demonstration in the Neo Forge Technology portfolio: upload a video or image (or open the bundled sample), run **real** vehicle detection and **real** multi-object tracking, and watch per-frame counts update.

- **App:** `/ai-demos/vehicle-detection-tracking-counting/app`
- **Service:** `services/vehicle-tracker` (FastAPI, ONNX Runtime, OpenCV, ByteTrack) — the only backend, and it only detects, tracks and counts vehicles.
- **Not included, by design:** number-plate recognition / ANPR, parking, tolling, payments, customer records, databases, accounts.

## What it does
| Capability | How |
|---|---|
| Detection | YOLOX-tiny (Apache-2.0, COCO) via ONNX Runtime: car, motorcycle, bus, truck. Vans appear as car/truck (COCO has no van class). |
| Tracking | ByteTrack (two-stage IoU association, Kalman filter): a temporary ID per vehicle track. |
| Counting | Per frame: **vehicles visible**, **unique tracks** (confirmed IDs so far), **detection instances** (summed across frames, kept separate), **per-class** counts. Optional **virtual line** with its own crossing count. |
| Viewer | Original with overlay, server-rendered processed video, or side by side; play/pause, seek, speed, frame step; toggles for boxes, class, confidence and IDs; live statistics linked to the playhead. |
| Engines | **Server** (FastAPI, streams frames, live progress, processed MP4/WebM) or **in the browser** (ONNX Runtime Web + a TypeScript port of the same tracker; no processed-video file). |
| Output | Processed video (server engine), JSON and CSV of every detection, measured duration / frames / FPS. |

## Honest limits (also shown in the UI)
Small model, no accuracy benchmark; distant/small/occluded vehicles are missed; IDs can switch or split (no appearance model, no camera-motion compensation — the bundled dashcam clip is the hard case); unique tracks ≈ vehicles, not exactly. See [LIMITATIONS.md](LIMITATIONS.md).

## Run locally
```bash
# 1. the service
cd services/vehicle-tracker
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python scripts/fetch_model.py            # downloads yolox_tiny.onnx (20 MB) and verifies its SHA-256
uvicorn app.main:app --port 8010         # ffmpeg on PATH is optional but recommended (H.264 + WebM output)

# 2. the site
echo 'VEHICLE_API_URL=http://localhost:8010' >> .env.local
npm install && npm run dev               # open /ai-demos/vehicle-detection-tracking-counting/app
```
Without `VEHICLE_API_URL` the page works with the in-browser engine only (it says so).

Docs: [ARCHITECTURE](ARCHITECTURE.md) · [API](API.md) · [MODEL_AND_LICENSES](MODEL_AND_LICENSES.md) · [LIMITATIONS](LIMITATIONS.md) · [TESTING](TESTING.md) · [DEPLOYMENT](DEPLOYMENT.md)
