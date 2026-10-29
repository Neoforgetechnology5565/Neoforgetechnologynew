# API (service port 8090; the browser calls it through `ACTIVITY_API_URL`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | models and licences, limits, the standing notice |
| GET | `/api/samples`, `/api/samples/{id}/video` | bundled samples with source and licence |
| POST | `/api/videos/upload` | multipart `file` **or** `sample_id`; validates by content, returns the video record (id, size, fps, duration) |
| POST | `/api/videos/{id}/process` | JSON `{sample_fps, start_s, end_s, det_threshold, pose, fall:{…}, aggression:{…}}`; 202 |
| GET | `/api/videos/{id}/status` | stage, progress, preview state, alert count |
| POST | `/api/videos/{id}/cancel`, DELETE `/api/videos/{id}` | stop / remove |
| GET | `/api/videos/{id}/video?format=mp4\|webm` | browser preview (Range supported) |
| GET | `/api/videos/{id}/summary` | real counts, timing, tracks, parameters used, models, limitations, warnings |
| GET | `/api/videos/{id}/alerts[?status=]` | alerts with evidence, notes, status |
| GET | `/api/videos/{id}/frames` | per-frame boxes, track ids, keypoints |
| POST | `/api/videos/{id}/reanalyse` | new thresholds on stored detections; 409 if reviews would be lost unless `discard_reviews` |
| POST/PATCH | `/api/alerts/{alert_id}/review` | `{status: pending\|confirmed\|dismissed\|uncertain, note}` |
| GET | `/api/videos/{id}/annotated[?alert=&pad=&overlay=]` | annotated MP4, rendered on demand |
| GET | `/api/videos/{id}/export?kind=alerts.json\|alerts.csv` | downloads |

Errors: 400 invalid parameters, 404 unknown/expired id, 409 results not ready, 413 too large, 415 unsupported type, 422 unreadable or out-of-limit video, 425 preview not ready, 503 busy, 500 generic.
