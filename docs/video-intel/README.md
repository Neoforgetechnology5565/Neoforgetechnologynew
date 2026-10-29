# Samples 22, 23, 24 — video intelligence

Routes: `/restaurant-employee-monitoring-demo/`, `/table-tennis-intelligence-demo/`, `/basketball-intelligence-demo/` (redirect to `/ai-demos/<slug>/app`).
Service: `services/video-intel` (FastAPI, port 8130, env `VI_API_URL` for Next.js). See `services/video-intel/README.md`.

## Models and methods
YOLOX-S (Apache-2.0, COCO person + sports ball) → ByteTrack (temporary ids, no face/appearance model) → optional colour/motion ball finder with a gated tracker.
Settings (area, calibration, thresholds) are applied afterwards to stored observations (`analytics.py`).

## Feature status
| Feature | Status |
|---|---|
| Person detection/tracking, area events, evidence clips, CSV/PDF | Working |
| Attendance comparison (fictional schedule, manual track links) | Working; Insufficient Data when not provable |
| Ball tracking (TT white, basketball orange) | Working but Experimental; gaps never interpolated |
| Table calibration / court mapping (homography, error shown, mis-ordered points refused) | Working |
| Ball-visible segments, bounce/net candidates, heat map, distance | Working / Experimental |
| Potential Possession Events | Experimental geometric rule |
| Rally marks, scoring, shots, assists | Manual Annotation |
| Stroke/spin/shot-arc detection, team assignment, auto scoring, player metres in TT | Coming Soon |
| Live CCTV / broadcast streams | Requires External Integration / Compatible Hardware |
| Face recognition / automatic employee identification | Deliberately not provided |

## Test data (honest)
No legal restaurant, table tennis or basketball footage was reachable. Sample clips: the real OpenCV pedestrian clip (restaurant demo mechanics; **not a restaurant**) and two composites (rendered table/court + ball with a known camera, real-pixel person cut-outs) with ground truth. Accuracy on real footage is **not** claimed.
Measured on the composites: TT ball recall ≈ 92 %, ≈ 2 % false points, median error ≈ 3 px; basketball ball recall ≈ 99 %, no false points, court mapping error 0.002 m (exact synthetic landmarks).

## Tests
`services/video-intel`: `pytest` — 21 unit tests (events, incomplete observations, attendance, homography, segments, heat map, possession) + end-to-end API tests on the real clips.
`npm run test:vi` (annotation and CSV helpers), `scripts/test-vi-ui.mjs` (Playwright, MODE=static|server).

## Deployment limits
Needs a Python host with ffmpeg; CPU analysis ≈ 1 min per 15 s of 30 fps video; one job at a time by default. A static front-end host cannot run the service: without `VI_API_URL` the pages show "service not connected" and no result.
