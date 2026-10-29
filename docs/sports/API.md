# API (`services/sports-analyzer`, default port 8050)

| Method & path | Purpose |
|---|---|
| `GET /api/health` | model info, ffmpeg availability, limits |
| `GET /api/sports/samples`, `GET /api/sports/samples/{id}/video` | bundled samples (manifest) |
| `GET /api/sports/pitch?length=&width=` | landmark catalogue for the calibration UI |
| `POST /api/sports/analyze` | multipart `file` **or** `sample_id`, plus `params` JSON → `202` job |
| `GET /api/sports/jobs/{id}` | status, stage, progress (`samples_done/total`, live fps, detections), latest frame facts, preview formats |
| `POST /api/sports/jobs/{id}/cancel`, `DELETE /api/sports/jobs/{id}` | cancel / remove |
| `GET /api/sports/jobs/{id}/results` | full results (below); `409` until completed |
| `POST /api/sports/jobs/{id}/calibrate` | `{time, points:[{id,x,y}], pitch_length, pitch_width}` or `{clear:true}`; re-derives positions/statistics/events |
| `GET /api/sports/jobs/{id}/frame?time=` | the decoded source frame (JPEG) nearest to an analysed frame; calibration clicks refer to it |
| `GET /api/sports/jobs/{id}/video?format=mp4|webm[&original=true]` | browser preview (Range supported) or the uploaded file |
| `GET /api/sports/jobs/{id}/heatmap?track=&team=&t0=&t1=&cell_m=&sigma=` | server-side heatmap grid; `409` without a pitch mapping |
| `GET /api/sports/jobs/{id}/export.csv?kind=stats\|tracks\|ball\|events` | CSV exports |

`params`: `sport` (football), `sample_fps` 1–12 (5), `start_s`, `end_s`, `player_conf` (0.5), `ball_conf` (0.3), `detect_scale` (auto), `min_hits` (5), `analyse_ball`, `team_mode` auto|off|colors (+`team_colors`), `pitch_length`/`pitch_width`, `match_label`, `declared_duration_s`.

Results: `summary` (counts and timings), `pitch_mapping` (`status`, `reason`, `calibration`), `teams`, `frames[]`, `tracks[]`, `events[]`, `ball_intervals[]`, `warnings[]`, `methodology`, `limitations`. A frame is `{i, t, seg, p: [[id,x1,y1,x2,y2,conf,team,pitch_x|null,pitch_y|null]], b: [x,y,conf|null,"observed"|"estimated",pitch_x|null,pitch_y|null] | null}` (image coordinates are source-video pixels; `i` is the source frame index, `t` seconds). Errors are JSON `{detail}`: 400 invalid params, 404, 409, 413, 415, 422 (undecodable video, window too long), 503 (queue full).
