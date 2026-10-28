# Architecture

```
Browser (Next.js)                         services/roof-analyzer (FastAPI)
 RoofApp.tsx  ── upload / sample ids ──▶  /api/roof/analyze ─▶ JobManager (bounded queue, cancel Event, TTL reaper)
 RoofViewer.tsx  (zoom/pan/layers)                               └ pipeline.analyse_image
 measure.ts  (client-side re-measure)                               media.decode_image  (magic bytes, GeoTIFF tags)
                                                                    model.RoofSegmenter (ONNX Runtime, tiles 768, feathered)
                                                                    geometry.roof_regions / outline_edges / interior_candidates
                                                                    measure.resolve_scale / measure_polygon / pitch_from
 ◀── results.json, images, CSV, PDF ───  /jobs/{id}/results, /images/{i}/{kind}, results.csv, report.pdf
```

* **Jobs** are in-memory records plus a temp directory each. At most `ROOF_MAX_CONCURRENT_JOBS` run; beyond `ROOF_MAX_QUEUED_JOBS` the API answers 503. Jobs are cancelled cooperatively between tiles/images and deleted after `ROOF_JOB_TTL_SECONDS`.
* **Stateless measurement**: `POST /api/roof/measure` measures a polygon the user drew, with no job.
* **Frontend without a service**: the site shows the stored result of a real run on the bundled samples, clearly badged "precomputed", and explains that uploads need the service (`ROOF_API_URL`, read server-side).
* **Edge provenance**: each region and edge carries one of `model-detected`, `derived`, `inferred`, `undeterminable`; the UI shows it.
