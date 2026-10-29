# Sports Video Intelligence (Computer Vision demo no. 6)

Upload a football match video; the Python service detects and tracks players and the ball, estimates camera motion, and — after you calibrate the pitch by pairing visible landmarks — maps players onto a standard pitch to produce positions, trajectories, heatmaps and statistics. Frontend `src/components/sports/*`, `src/lib/sports/*`; backend `services/sports-analyzer/` (FastAPI + ONNX Runtime). Route `/ai-demos/sports-video-intelligence/app`. No database, accounts, teams or billing: job state is temporary.

## What is real
| Output | Source |
|---|---|
| Player boxes, confidence | FootAndBall network on every analysed frame (ONNX Runtime, CPU) |
| Track IDs, active/ended tracks | ByteTrack in a camera-motion-stabilised frame (temporary IDs; no identity) |
| Ball observations | FootAndBall ball map, chosen over the clip by a Viterbi search with a plausibility limit; **estimated** = linear interpolation across gaps ≤ 1 s, labelled; everything else is **missing** |
| Camera motion | Lucas-Kanade background flow + RANSAC homography, chained within segments |
| Team grouping | Two-means clustering of torso colour per track; `uncertain` / `other` outcomes; optional user colours |
| Pitch positions | Homography from **your** landmark pairs; only for frames in the calibrated camera segment; feet assumed on the ground |
| Distance / speed / zone time | Estimates from smoothed pitch paths (method in `ARCHITECTURE.md`); `n/a` without calibration |
| Heatmaps | Time-weighted 2-D histogram of mapped positions, Gaussian-smoothed, max-normalised; computed in the browser (TypeScript twin of the Python function, checked by shared fixtures) |
| Event candidates | Possession candidates only (ball observed near exactly one tracked player); no passes, shots, goals, fouls |

## What is not
* **Automatic pitch calibration** is not implemented (no validated, reachable landmark model). The manual workflow is the supported one.
* **No bundled sample match.** Football footage is rarely redistributable and no clip with a verifiable open licence was reachable from the build environment (see `SAMPLE_DATA.md`). The sample picker is wired to a manifest and `scripts/add_sample.py`.
* No accuracy figure is claimed: the pipeline was sanity-checked on one real long-shot clip, not benchmarked.

## Using it
1. Start the service (`DEPLOYMENT.md`), set `SPORTS_API_URL`, start the site.
2. Choose a video (optionally a part: From/To seconds), adjust sampling and confidences, **Analyse video**.
3. Inspect boxes and IDs on the video, the timeline, statistics. Click **Calibrate pitch** at a frame where pitch lines are visible, pair 6+ landmarks, **Fit and apply**.
4. Use the pitch tabs (positions, trajectories, heatmap with 1–2 players or a team, zones), the time range and match periods, and export CSV/JSON.

See `ARCHITECTURE.md`, `API.md`, `MODEL_AND_LICENSES.md`, `SAMPLE_DATA.md`, `LIMITATIONS.md`, `TESTING.md`, `DEPLOYMENT.md`.
