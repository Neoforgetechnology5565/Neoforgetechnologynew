# HTTP API (`services/vehicle-tracker`, default port 8010)

All coordinates are **pixels relative to the original frame/image, origin top-left**. Errors are `{ "detail": "<message>" }` with a meaningful status (400, 404, 409, 413, 415, 422, 503).

| Method & path | Purpose |
|---|---|
| `GET /api/health` | model name, runtime, ffmpeg availability, active jobs, limits |
| `GET /api/samples` / `GET /api/samples/{id}/video` | bundled sample list (with licence and attribution) / stream a sample |
| `POST /api/detect/image` (multipart `file`, `conf`) | detect vehicles in one JPEG/PNG/WebP; `track_id` is null (no tracking on one image) |
| `POST /api/detect/video` (multipart `file` **or** `sample_id`; `conf` 0.05–0.95, `stride` 1–10, `min_hits` 1–20, `line` "x1,y1,x2,y2" normalised, `write_video`) → 202 | start a job |
| `GET /api/jobs/{id}` | status (`queued` / `running` / `completed` / `cancelled` / `failed`), measured progress and live FPS, latest counts, summary when finished, output URLs |
| `GET /api/jobs/{id}/frames?start=&limit=` | frame records processed so far (live viewing) |
| `POST /api/jobs/{id}/stop` | request cancellation; partial results stay available |
| `GET /api/jobs/{id}/result[?include_frames=true]` , `/result.csv` | final summary (+ every frame) / CSV of every detection |
| `GET /api/jobs/{id}/original` , `/video?format=mp4\|webm` | original upload / processed video (Range requests supported) |
| `DELETE /api/jobs/{id}` | delete the job's files now |

Job ids are 32-hex random strings; anything else returns 404 (no path is ever built from user input; upload names are discarded).

## Frame record
```json
{ "frame_number": 126, "frame_index": 125, "timestamp_seconds": 5.0, "vehicles_visible": 3, "tracked_visible": 2,
  "unique_tracks_observed": 2, "detection_instances_processed": 214,
  "detections": [ { "track_id": 2, "class": "car", "detected_class": "car", "confidence": 0.9, "confirmed": true, "bbox": { "x1": 820.1, "y1": 520.4, "x2": 960.0, "y2": 640.9 } } ],
  "class_counts": { "car": 3, "motorcycle": 0, "bus": 0, "truck": 0 }, "unique_by_class": { "car": 2, "motorcycle": 0, "bus": 0, "truck": 0 },
  "line_crossings": null }
```
`class` is the track's class vote (stable); `detected_class` is the raw per-frame class. `confirmed` = the track has been matched in at least `min_hits` frames; only confirmed tracks count towards unique tracks and line crossings. `vehicles_visible` counts every detection above the confidence threshold in that frame.

The values above are an illustration of the schema; real values come from inference.
