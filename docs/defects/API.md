# API (`services/defect-inspector`, default port 8060)

| Method & path | Purpose |
|---|---|
| `GET /api/health` | backbone, method, limits, limitations |
| `GET /api/references`, `GET /api/references/{id}` | built-in and custom references with their held-out evaluation |
| `POST /api/references` | multipart `name`, `files[]` (10–60 good images) → `202`; builds in the background, poll `GET /api/references/{id}` (`status` building/ready/failed) |
| `DELETE /api/references/{id}` | delete a custom reference (built-in ones cannot be deleted) |
| `GET /api/sample-images`, `GET /api/sample-images/{id}/image` | bundled VisA samples (manifest) |
| `POST /api/inspect` | multipart `file` **or** `sample_id`, `reference_id` (required), `rules` JSON → `201` inspection |
| `GET /api/inspections`, `GET /api/inspections/{id}` | history summaries / one inspection |
| `POST /api/inspections/{id}/reevaluate` | `{rules}`: new regions + recommendation from the stored model output |
| `POST /api/inspections/{id}/review` | `{action: "confirm"\|"override", decision?, notes, reviewer, region_reviews}`; `confirm` is refused when the recommendation is MANUAL_REVIEW |
| `GET /api/inspections/{id}/images/{original\|annotated\|heatmap\|thumb\|dataset_annotation}` | images (`heatmap` is RGBA; `dataset_annotation` exists only for samples) |
| `GET /api/inspections/{id}/report.pdf`, `…/report.json` | reports |
| `DELETE /api/inspections/{id}` | delete |

Inspection JSON: `model_output {anomaly_score, reference_threshold, score_ratio, score_meaning, regions[], image{width,height}, condition_checks[]}`, `recommendation {decision, reasons[], rule_trace[], rules{}, disclaimer}`, `review {history[], current}`, `reference {…}`, `dataset_annotation` (samples only: the VisA label, marked as not model output), `inference_ms`, `limitations`. Region: `id, bbox [x,y,w,h] (image pixels), polygon, area_px, area_pct, peak_score, score_ratio, mean_score_ratio, status flagged|borderline, severity, category "unusual region (unclassified)"`. Errors are JSON `{detail}`: 400 invalid rules/review, 404, 409, 413, 415, 422 (undecodable/too small/too large image), 503 (busy).
