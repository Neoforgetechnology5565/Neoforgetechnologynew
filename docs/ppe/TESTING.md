# Testing

```bash
cd services/ppe-monitor && pip install -r requirements-dev.txt && python scripts/fetch_model.py
pytest                      # service: rules, pipeline logic with stub models, API with the REAL models and the real sample (a few minutes)
pytest -m slow              # + 2000-frame memory test
npm run test:ppe:ui         # Playwright against a running site (see scripts/test-ppe-ui.mjs)
```
* `test_ppe_rules.py` – association positions, duplicates, poor-view reasons, smoothing, "weak detection is not absence".
* `test_pipeline_logic.py` – deterministic stub models on a synthetic video: exact instance/unique counts, flicker does not create a worker, full-PPE → compliant, hat-only → potential violation after enough evidence (never in the first frames), tiny worker never flagged, required-item switch, zone, stride, annotated video has drawn pixels, cleanup, flat memory.
* `test_api.py` – real YOLOX + Intel model on the sample: per-frame count consistency, compliant and flagged workers both found, IDs persist, PPE boxes lie where the item would sit, playable annotated video, JSON/CSV, a real frame as image, empty scene → 0 workers, stop/cancel, zone, limits (413/422/503), invalid uploads, path-like ids.
* `scripts/test-ppe-ui.mjs` – page, stored-result flow, overlay and statistics linked to the playhead, toggles, tabs, downloads, error states.
No test asserts a model accuracy figure. Assertions about the sample (e.g. at least one flagged and one compliant worker) are relationships verified by eye on the footage when it was chosen.
