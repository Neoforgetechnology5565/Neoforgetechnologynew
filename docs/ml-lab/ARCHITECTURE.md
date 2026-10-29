# Architecture

```
Browser (Next.js, src/components/ml/*) ──fetch──▶ services/ml-lab (FastAPI :8110)
  common.tsx   shell, notice, status chips,           main.py       endpoints, validation, background jobs
               preview cards, line chart, CSV intake  models.py     MobileNetV2, YOLOX, DeepLabV3, BlazePose (ONNX Runtime, CPU)
  lib/ml/api.ts  one client, service error messages   forecast.py / sensors.py / tabular.py   pandas, statsmodels, scikit-learn
                                                      search.py     chunking, word-vector embeddings, BM25, per-session index
  AnomalyApp ──▶ services/defect-inspector (:8060)    recommend.py  image + TF-IDF similarity
                                                      video.py      bounded job runner, ffmpeg writer
```
* **No database.** Uploads are decoded in memory; video jobs write to an expiring temp directory (30 min TTL, wiped at start-up); search indexes live in memory per browser session id (max 50 sessions, 30 documents each, expire after 30 min of inactivity).
* **Validation:** magic bytes decide the type; size, pixel, row, page, duration and frame limits are in `config.py`; ids are hex; errors are generic and carry no paths.
* **Models are optional per endpoint:** a missing model file gives a 503 that names the problem; the health endpoint reports what is available.
* **Why one service:** the ten demos share model loading, upload handling and limits; each still has its own page, route and notice. The anomaly demo reuses the existing inspection service rather than duplicating its 34 MB backbone.
