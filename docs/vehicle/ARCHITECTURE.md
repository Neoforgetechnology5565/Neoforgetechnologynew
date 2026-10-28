# Architecture

```
Browser (Next.js page)                                   FastAPI service (services/vehicle-tracker)
  VehicleApp ── upload / sample_id ──────────────────▶  POST /api/detect/video  → validate → job (thread pool, bounded)
     │  poll job + frames (live)  ◀──────────────────   GET  /api/jobs/{id} , /frames?start=
     │  original + overlay canvas / processed video      per frame: decode (OpenCV) → YOLOX (ONNX Runtime) → ByteTrack → counts
     └─ or: browser engine (ONNX Runtime Web + TS ByteTrack)   → JSONL on disk + annotated frame → ffmpeg (H.264) [+ WebM]
```

## Service modules
| File | Responsibility |
|---|---|
| `app/detector.py` | YOLOX ONNX inference: letterbox 416², BGR 0–255, grid/stride decode, class-aware NMS, restrict to car/motorcycle/bus/truck |
| `app/tracker.py` | ByteTrack: Kalman filter (xyah), IoU + score fusion, second pass with low-score boxes, lost-track buffer |
| `app/pipeline.py` | Streaming loop: counts, virtual-line crossings, annotated video writer (ffmpeg pipe, or OpenCV VP8 fallback) |
| `app/jobs.py` | Temporary job registry: bounded concurrency + queue, cancel flag, TTL cleanup, results appended to disk |
| `app/media.py` | Magic-byte sniffing, header-only image size checks, video probing (duration, frames, resolution) |
| `app/main.py` | HTTP API, validation, CORS, generic error handler (no internals leaked) |

## Memory and resources
Frames are decoded and processed one at a time; the annotated frame is piped to the encoder; per-frame results are appended to `frames.jsonl` (and only byte offsets are kept in memory). A test processes a 2000-frame video and asserts memory growth stays under 120 MB (see TESTING). Limits (env): upload size, duration, frame count, pixels per frame, concurrent jobs (default 1, queue 3 → HTTP 503 when busy), job TTL (default 1 h, then files are deleted).

## What is stored
Only temporary job directories under `VEHICLE_WORK_DIR` (default the system temp dir): the upload (renamed `input.<detected-ext>`), `frames.jsonl`, processed video. No database, no accounts. Leftovers are wiped at start-up.

## Front end
`src/components/vehicle/*` (VehicleApp, OverlayPlayer, StatsPanel) and `src/lib/vehicle/*` (API client, browser detector, TypeScript ByteTrack, frame processor). The statistics panel shows the values stored in the per-frame record at the playhead — it never recomputes counts separately. The TypeScript tracker is checked against the Python tracker's output on the same detections (see TESTING).

Style: Georgia, the site's existing logo and header (`DemoShell`), dark application chrome, responsive grid.
