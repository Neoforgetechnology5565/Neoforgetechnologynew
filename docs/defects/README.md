# AI Visual Inspection & Defect Detection (Computer Vision demo no. 7)

Inspect images of manufactured parts with real anomaly detection, review annotated results, apply configurable quality rules, and record human decisions. Frontend `src/components/defects/*`, `src/lib/defects/*`; backend `services/defect-inspector/` (FastAPI + ONNX Runtime). Route `/ai-demos/ai-visual-inspection/app`. No ERP/MES/CRM modules, no database: history is a temporary directory that expires.

## What it does
1. **Pick a part type** (a *reference* of good parts): 12 built-in references built from the VisA dataset, or **build your own** from 10–60 good photos.
2. **Inspect**: upload JPEG/PNG/WebP images or open a sample. The model (PatchCore-style: frozen ImageNet ResNet-50 features compared with a memory of good-part patches) returns an anomaly score, an anomaly map and unusual regions.
3. **Review**: original/annotated views with zoom and pan, an anomaly heat overlay, per-region boxes (show, hide, focus), per-region review marks.
4. **Decide**: rules you configure (max flagged regions, score ratio to flag, review band, minimum region size, optional severity) produce a PASS / FAIL / MANUAL REVIEW *recommendation* with a rule trace; a person confirms or overrides it with notes. Reports as PDF and JSON; history with CSV export.

## Three layers, never mixed
| Layer | Where | Meaning |
|---|---|---|
| Model output | anomaly score, map, regions | where the part differs from good examples; **not** a probability, **not** a defect class |
| Automated recommendation | rules → PASS / FAIL / MANUAL REVIEW | explicit and configurable; not certified quality assurance |
| Human decision | confirm / override + notes + region marks | what the reviewer decided; stored beside, never over, the recommendation |

## What it does not do
* It does not **classify** defects (scratch, dent, crack, missing component…). The annotated regions are labelled *unusual region (unclassified)*. Supervised defect detectors need labelled defect images, which a general demo does not have.
* It cannot find defects that look like normal variation, and it flags harmless variation the good images lacked (lighting, dust, position).
* A reference is only valid for the part and imaging setup it was built from.

## Measured accuracy (VisA held-out test images)
See `MODEL_AND_LICENSES.md` for the per-object table (image AUROC, pixel AUROC, and hit / false-alarm rates at the calibrated threshold). These are the numbers shown in the UI next to each reference.

See also `ARCHITECTURE.md`, `API.md`, `SAMPLE_DATA.md`, `LIMITATIONS.md`, `TESTING.md`, `DEPLOYMENT.md`.
