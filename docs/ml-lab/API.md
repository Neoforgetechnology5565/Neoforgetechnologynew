# API (ml-lab, port 8110; set `ML_API_URL`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health`, `/api/samples[?kind=]`, `/api/samples/{id}/file` | models and licences, availability, limits; sample manifest |
| POST | `/api/classify` | `file` or `sample_id`, `top_k` 1–10 |
| POST | `/api/detect/image`, `/api/detect/video` | `threshold` 0.05–0.95; video also `analysed_fps` 1–10 → `{job_id}` |
| POST | `/api/segment` | `opacity` 0–1; returns RGBA mask, overlay, class shares |
| POST | `/api/ocr` | `file` or `sample_id`, `force_ocr`; PDF ≤ 10 pages |
| POST | `/api/pose/image`, `/api/pose/video` | like detection; keypoints, joint angles |
| GET | `/api/jobs/{id}`, POST `/api/jobs/{id}/cancel`, GET `/api/jobs/{id}/output` | video job status, result, annotated MP4 |
| POST | `/api/tabular/inspect` | CSV → columns, date and numeric candidates, preview |
| POST | `/api/forecast` | `date_column`, `value_column`, `horizon` 1–365, `method` auto\|naive\|seasonal_naive\|holt\|holt_winters, `season` |
| POST | `/api/sensors` | `sensor_columns`, `time_column`, `label_column`, `method` zscore\|baseline\|iforest\|all, `window`, `z_threshold`, `contamination`, `baseline_fraction` |
| GET/POST/DELETE | `/api/search/documents[...]`, POST `/api/search/reset`, `/api/search/query` | `session` (16–32 hex) on every call; `mode` semantic\|keyword\|hybrid, `k`, `alpha` |
| GET | `/api/products`, `/api/products/{id}/image`, `/api/products/{id}/similar?k=&image_weight=` | catalogue and similarity |

Errors: 400 invalid parameters, 404 unknown id/sample, 413 too large, 415 wrong type, 422 unreadable or out-of-limit data, 503 busy or model missing, 500 generic.
