# Architecture

```
Browser                                   services/sports-analyzer
 SportsApp ── upload / sample id ───────▶ POST /api/sports/analyze ─▶ JobManager (bounded queue, cancel Event, TTL reaper)
  SportsPlayer (video + canvas overlay)                                 ├ analyse(): sequential decode (grab/retrieve), one frame at a time
  Timeline, StatsTable, PitchDiagram                                    │   FootAndBall.detect → players, ball candidates
  CalibrationModal ── landmark pairs ──▶ POST …/calibrate               │   CameraMotion.update → H(reference←frame), segment id
  heatmap.ts (TS twin)                                                  │   ByteTracker.update (reference-frame boxes) → ids
                                                                        │   torso colours per track (teams)
 ◀── status/results/frames/exports ───── GET …/jobs/{id}, results, …     └ build_results(): kept tracks, teams, ball Viterbi + gap fill,
                                                                            calibration → pitch positions, stats, events, warnings
                                                                          ffmpeg thread: H.264 + VP9 browser previews
```

* **Streaming:** frames are decoded sequentially and dropped after analysis. What is kept per analysed frame: boxes, confidences, track ids, ball candidates and a 3x3 motion matrix. Memory does not grow with video length (limit: `SPORTS_MAX_SAMPLES` analysed frames per job).
* **Calibration is separate from processing:** `build_results` re-derives pitch positions, statistics and events from the stored observations, so calibrating (or recalibrating, or clearing) never reprocesses the video.
* **Camera motion:** feature tracking on a 640 px copy with player/ball boxes masked; homography with RANSAC (2 px); chained to the first frame of the *segment*. Fit failures (too few inliers, implausible determinant) start a new segment: tracks are not carried across, and pitch mapping applies only to the segment containing the calibration frame. Near-identity motion is snapped to identity.
* **Tracking:** ByteTrack (the same implementation as the PPE and vehicle demos; per-instance ids) on boxes warped into the reference frame. A track needs `min_hits` (5) observations to be kept. “Active at end” = seen in the last ≈2 s, otherwise “ended”.
* **Ball:** up to 5 candidates per frame (3x3 non-maximum suppression of the ball map, ≥ 0.15). Viterbi over the clip with emission `log(p / 0.3)`, a 0.6-frame-widths/s speed limit, smoothness penalty; isolated candidates below 0.55 confidence are dropped; the user's ball confidence is the floor.
* **Pitch:** standard pitch of the stated size (IFAB landmark catalogue in `pitch.py`; the UI loads it from `/api/sports/pitch`). With 4 points an exact perspective transform; with more, RANSAC (1.5 m) then a refit. Rejections: <4 points, duplicates, collinear points, non-finite values, degenerate transforms, unknown landmarks, points outside the frame. Quality: *good* (RMS ≤ 1 m, ≥ 6 consistent landmarks, ≥ 12 % pitch coverage), *approximate* (RMS ≤ 2.5 m), else *poor*.
* **Statistics:** foot point = bottom centre of the box → reference frame → pitch. Per track the pitch path is smoothed with a ~1 s centred moving average (≥ 3 samples), distance sums segments between samples ≤ 1.5 sampling intervals apart (and ≤ 2 s); segments faster than 12 m/s are excluded and counted; average speed = distance / counted time; maximum speed = largest displacement over a ~1 s window. The smoothing slightly under-estimates distance at track ends (about speed × 0.4 s per end). Zone time = observed seconds in a 3x3 grid.
* **Heatmap:** `grid = gaussian(histogram2d(points, 2 m cells), sigma = 1.5 cells, zero padding)` scaled to max 1; `stats.heatmap` (Python) and `heatmap.ts` (TypeScript) agree to 1e-6 on shared fixtures.
* **Possession candidates:** for frames with an *observed* ball, the nearest tracked person by ball-to-feet distance in person-heights; a candidate needs ≤ 0.45 heights and a runner-up ≥ 1.4× further; consecutive matches merge (≥ 2 observations). “Medium” needs ≥ 4 observations at ≤ 0.3 heights.
