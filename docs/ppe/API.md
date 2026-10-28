# Service API (`services/ppe-monitor`)

Interactive docs at `/docs` (OpenAPI). Coordinates are pixels in the original frame (origin top-left).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | models, runtime, limits, classes |
| GET | `/api/samples`, `/api/samples/{id}/video` | bundled sample |
| POST | `/api/detect/image` (multipart `file`, `conf`, `ppe_conf`, `require_hat`, `require_vest`) | one image, no tracking, no smoothing |
| POST | `/api/detect/video` (`file` or `sample_id`, `conf`, `ppe_conf`, `stride`, `min_hits`, `require_hat`, `require_vest`, `zone` = `x1,y1,x2,y2` in 0–1, `write_video`) | start a job → `202` + job |
| GET | `/api/jobs/{id}` | status, progress, measured speed, summary when finished |
| GET | `/api/jobs/{id}/frames?start=&limit=` | frame records as they are produced |
| POST | `/api/jobs/{id}/stop` · DELETE `/api/jobs/{id}` | stop (keeps partial results) · delete |
| GET | `/api/jobs/{id}/result[?include_frames=true]` · `/result.csv` · `/video?format=mp4|webm` · `/original` | downloads |

Errors: 400 invalid parameters · 404 unknown id/sample · 409 job still running · 413 too large · 415 unsupported type (decided by magic bytes) · 422 undecodable / too long / too big · 503 busy.

## Frame record (values come from inference; this only shows the shape)
```json
{"frame_number": 651, "timestamp_seconds": 21.7, "workers_visible": 2, "hard_hats_detected": 2, "safety_vests_detected": 1,
 "compliant_workers": 1, "potential_ppe_violations": 1, "uncertain_classifications": 0,
 "unique_worker_tracks": 3, "unique_tracks_with_potential_violation": 1, "detection_instances_processed": 1234, "zone": null,
 "detections": [
  {"class": "worker", "track_id": 2, "confidence": 0.92, "confirmed": true, "bbox": {"x1": 0, "y1": 0, "x2": 0, "y2": 0},
   "ppe_assessment": {"status": "potential_violation", "reasons": ["safety vest not detected"], "reliable_view": true,
     "items": {"hard_hat": {"state": "detected", "confidence": 0.9}, "safety_vest": {"state": "not_detected", "confidence": null}}}},
  {"class": "hard_hat", "worker_track_id": 2, "track_id": null, "confidence": 0.9, "bbox": {"x1": 0, "y1": 0, "x2": 0, "y2": 0}}]}
```
`track_id` is `null` for a detection that is not (yet) part of a confirmed track and always `null` in image mode. Weak PPE detections (between 0.3 and `ppe_conf`) are not listed or counted; they only make an item "uncertain".
