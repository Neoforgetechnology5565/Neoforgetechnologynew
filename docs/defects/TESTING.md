# Testing

| Suite | Command | Covers |
|---|---|---|
| Rules | `pytest tests/test_rules.py` | every branch of the decision logic (pass, fail, review band, small reference, image conditions, wrong part, severity), rule validation |
| Model | `pytest tests/test_patchcore.py` | AUROC maths, coreset coverage, exact nearest-neighbour distance, backbone shapes/determinism, a real model run on synthetic parts: the defect scores higher than good parts and the anomaly peak lies on the defect |
| API | `pytest tests/test_api.py` | upload validation (empty, junk bytes, damaged PNG, oversize, tiny, wrong reference, bad rules), custom-reference building, defect mapped onto the displayed image, rules and re-evaluation, review flow (confirm refused on MANUAL_REVIEW, override, history, notes cap), unsafe file names, all image kinds, PDF and JSON reports, condition checks |
| Browser | `MODE=server BASE_URL=… node scripts/test-defects-ui.mjs` (static: `MODE=static`) | empty states and honest offline state, real inspection of a sample, viewer zoom/pan/overlays, region show/hide/focus/review, rules and re-evaluation, human review and history, upload errors, custom reference from the browser, reports, phone/tablet widths |

`pytest` needs no dataset: the model tests use synthetic parts and a custom reference. Built-in references and samples are optional for the tests that need them.
