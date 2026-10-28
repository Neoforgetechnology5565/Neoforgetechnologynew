# Testing — what was run and what it proves

Everything below used the **real model and real footage** (the bundled 20 s highway clip, frames extracted from it, and files crafted to be invalid). The only stand-in is a deterministic *stub detector* in the pipeline-logic tests, used so counts and line crossings can be checked against exactly known motion; those tests make no claim about model accuracy.

| Suite | Command | Result (final run) |
|---|---|---|
| Tracker behaviour on synthetic motion with known identities (ID persistence, short occlusion, gap longer than the buffer, low-score boxes, new vehicles, crossing paths) | `cd services/vehicle-tracker && pytest tests/test_tracker.py` | 5 passed |
| API + pipeline with the real model and sample video (health, samples, job completion, per-frame count consistency, tracking IDs persist ≥ 20 processed frames, processed video decodes at 1280×720 with the same frame count, JSON/CSV exports, image detection on a real frame, stop/cancel with partial results, virtual line, invalid and hostile uploads, size/duration limits, busy-service 503, path-traversal ids) | `pytest tests/test_api.py` | 13 passed |
| Pipeline logic with the stub detector (instances vs unique, flicker does not create a vehicle, line crossings counted once, stride, overlay pixels present, expiry/delete removes files) | `pytest tests/test_pipeline_logic.py` | 6 passed |
| Memory stays flat on a 2000-frame video (< 120 MB growth) | `pytest -m slow` | 1 passed |
| TypeScript ByteTracker reproduces the Python tracker's track ids on the same 893 detections, and the unique-track count | `npm run test:vehicle` | 3 passed |
| Browser end-to-end (Playwright, production build, service running): landing and licence credit, live progress and counts during a server run, results (500 frames, measured FPS), overlay pixels present/absent with toggles, statistics follow the playhead, transport controls, comparison views, downloads (video, JSON, CSV with rows = detection instances), counting line + stride, stop, invalid uploads, image detection, the in-browser engine end to end, no console errors | `node scripts/test-vehicle-ui.mjs` | 15 passed |

## Measured processing speed (single runs, this development container, not benchmarks)
Server engine, 1280×720, 500 frames: 8.9–15.6 frames/s end to end (model 30–98 ms/frame depending on concurrent load). Browser engine, 40 sampled frames at 2/s: 19.6 s (about 320 ms per frame, single-threaded WebAssembly). Every figure in the UI is measured on the run it describes.

## Sample outcome (for orientation only)
On the bundled clip the server engine reports 3 unique tracks (all cars) and 893 detection instances over 500 frames, with at most 3 vehicles visible at once. Distant cars are not always detected; no ground-truth counts exist for this clip, so no accuracy is claimed.

## Not tested
Other browsers (the Playwright run uses Chromium without H.264, so the WebM sample/output path is what was exercised; the MP4 path was verified by decoding the MP4 with OpenCV/ffmpeg), real fixed-camera traffic footage, very long or very large files beyond the limits, load/concurrency beyond one active job, the Docker image (not built here), deployment.
