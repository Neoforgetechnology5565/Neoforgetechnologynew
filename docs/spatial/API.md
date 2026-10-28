# Service API (`services/spatial-recon`)

Interactive docs at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | versions, limits, supported formats, whether a depth model is installed, `dense_multi_view_stereo: false` |
| GET | `/api/samples`, `/api/samples/{id}/media` | bundled sample media |
| POST | `/api/spatial/reconstruct` (multipart `files` = one video or 3+ JPG/PNG; or `sample_id`; `params` JSON: `max_frames` 8-120, `image_size` 320-1600, `keyframes` 1-12, `depth`, `densify`, `mesh`) | start a job → `202` |
| POST | `/api/spatial/import` (multipart `file`: PLY, PCD, OBJ, GLB, STL) | parse for viewing; creates a completed job with artifacts |
| GET | `/api/spatial/jobs/{id}` | status, per-stage state, progress, scale status, warnings |
| GET | `/api/spatial/jobs/{id}/results` | status + report (quality statistics, stages, limitations) + artifacts |
| GET | `/api/spatial/jobs/{id}/artifacts` · `/artifacts/{name}` | list with status · download (only registered names resolve) |
| POST | `/api/spatial/jobs/{id}/process` `{source, op, params}` | `voxel_downsample`, `statistical_outlier_removal`, `radius_outlier_removal`, `estimate_normals`, `crop` on an available point-cloud artifact → new artifact |
| POST | `/api/spatial/jobs/{id}/cancel` · DELETE `/api/spatial/jobs/{id}` | cancel · delete |

Errors: 400 invalid parameters or mixed input · 404 unknown job/artifact/sample · 409 job running · 413 too large · 415 unsupported type (decided by magic bytes) · 422 unreadable/too long/too few images/corrupt file · 429 too many processed clouds · 503 busy.

## Artifact (shape)
```json
{"name": "points_sparse.ply", "kind": "point_cloud", "format": "ply", "status": "available", "points": 4503, "relative_scale": true,
 "description": "…", "provenance": "triangulated by COLMAP from matched features of the uploaded frames", "detail": "", "size_bytes": 71398, "url": "/api/spatial/jobs/<id>/artifacts/points_sparse.ply"}
```
`kind`: `point_cloud`, `mesh`, `camera_data`, `depth_map`, `matches`, `features`, `report`, `image`. `approximate: true` marks the densified cloud and the mesh.
