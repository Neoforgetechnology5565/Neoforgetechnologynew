# API (`services/roof-analyzer`, default port 8040)

| Method & path | Purpose |
|---|---|
| `GET /api/health` | model loaded, limits, versions |
| `GET /api/samples`, `GET /api/samples/{id}/image` | bundled sample list / image |
| `POST /api/roof/measure` | stateless: `{polygon:[[x,y]…], scale?, pitch?, georeference?}` → measurements |
| `POST /api/roof/analyze` | multipart `files[]` (≤ `ROOF_MAX_IMAGES`) and/or `sample_ids`, plus `params` JSON (`threshold`, `min_area_px`, `scale`, `pitch`, `view`, …) → `202 {job_id}` |
| `GET /api/roof/jobs/{id}` | status, stage, images done, error |
| `POST /api/roof/jobs/{id}/cancel`, `DELETE /api/roof/jobs/{id}` | cancel / remove |
| `GET /api/roof/jobs/{id}/results` | regions, measurements, warnings, model info |
| `GET /api/roof/jobs/{id}/images/{i}/{original\|overlay\|mask\|probability}` | rendered images |
| `GET /api/roof/jobs/{id}/results.csv`, `…/report.pdf` | exports |

Errors are JSON `{detail}` with 400 (invalid input / scale), 404, 413 (size), 415 (unsupported type), 422, 503 (queue full). Job IDs are 32 hex characters; files are served only by registered kind; client file names are never used as paths.
