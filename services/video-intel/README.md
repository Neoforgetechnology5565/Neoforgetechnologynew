# Video intelligence service (samples 22, 23, 24)

One FastAPI service behind three demonstrations:

| Demo | Route | What is real | What is a rule / manual |
|---|---|---|---|
| 22 Restaurant area-presence review | `/restaurant-employee-monitoring-demo/` | person detection (YOLOX-S), ByteTrack identities (temporary), polygon area events, real evidence clips, CSV/PDF | the "Potential Extended Area Presence" threshold; the attendance comparison uses a fictional schedule and **manual** track-to-person links |
| 23 Table tennis | `/table-tennis-intelligence-demo/` | player tracking, ball tracking (experimental), four-corner table calibration, ball-visible segments, bounce / net-side candidates | rally marks and scoring are **Manual Annotation** |
| 24 Basketball | `/basketball-intelligence-demo/` | player tracking, orange-ball tracking (experimental), court mapping from clicked landmarks, heat map and distance from real tracks | Potential Possession Events (geometric rule); shots, assists and scoring are **Manual Annotation** |

No face recognition, identification or biometric processing exists anywhere in the service. Track numbers are temporary labels for one video.

## Pipeline
`pipeline.py` runs once per video: YOLOX-S (COCO person + sports-ball) → ByteTrack, and, if enabled, a colour/motion ball finder with a gated constant-velocity tracker (`ball.py`).
Everything that depends on settings (areas, calibration, thresholds) is computed afterwards from the stored observations by `analytics.py`, so settings change instantly without reprocessing.
Frames where the ball was not found are gaps, never interpolated.

## Run
```
pip install -r requirements-dev.txt          # needs ffmpeg on PATH for playback copies and evidence clips
uvicorn app.main:app --port 8130
pytest -q                                    # unit tests (fast) + end-to-end tests on the real clips (~3 min on CPU)
```
Set `VI_API_URL=http://localhost:8130` for the Next.js app. Docker: `docker build -f services/video-intel/Dockerfile -t neoforge-vi .` from the repository root.
Config: `VI_DETECTOR_PATH, VI_SAMPLES_DIR, VI_WORK_DIR, VI_MAX_VIDEO_MB, VI_MAX_VIDEO_SECONDS, VI_MAX_SAMPLES, VI_MAX_CONCURRENT_JOBS, VI_MAX_QUEUED_JOBS, VI_JOB_TTL_SECONDS, VI_RATE_PER_MINUTE, VI_ALLOWED_ORIGINS`.

## Sample clips (see `public/vi/samples/manifest.json` for licences)
* `pedestrians-opencv-vtest.mp4` – real pedestrians (OpenCV sample clip). It is **not** a restaurant.
* `table-tennis-composite.mp4`, `basketball-composite.mp4` – a rendered table / court and ball with a known camera and real-pixel person cut-outs, built by `scripts/make_samples.py`.
  Ground truth (ball path, rallies, possession intervals, calibration points) is in the `*.truth.json` files and the tests measure the tracker against it:
  table tennis ball recall ≈ 92% with ≈ 2% false points; basketball ball recall ≈ 99% with no false points (median error 2–3 px). These numbers describe the composite clips only.
* No legal restaurant, table tennis or basketball footage could be bundled, so accuracy on real video is **not** claimed.

Covers (`public/covers/cv-22..24.jpg`) are produced by `scripts/make_covers.py` from the real pipeline output on these clips; cover 22 uses an illustrative rendered dining room.

## Limits
Tracks split after occlusion; the ball finder depends on colour and motion (a white blob on a player's body is not allowed to start a ball track; a yellow-orange object near the ball colour can mislead the basketball finder); the calibration maps one flat plane, so airborne balls are projections; CPU analysis of a 15 s, 30 fps clip takes about a minute.
