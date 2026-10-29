# Sample 08 — Animal Detection & Monitoring for Smart Farming

Route: `/ai-demos/ai-animal-detection-smart-farming` (app at `/app`). Replaces the former LiDAR demo. Runs entirely in the page.

## Model and what it can name
YOLOX-tiny (Apache-2.0, trained on COCO) through ONNX Runtime Web (WebAssembly, CPU; `public/models/vehicle/yolox_tiny.onnx`, shared with the vehicle demo). Only ten COCO animal classes are read from its 80-class output: **bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe**. Sheep, cow and horse are the livestock classes. There is no goat, pig, chicken, deer or other farm-animal class: such animals are missed or named as the nearest class (a goat as a sheep or dog). The UI lists these classes and says so.

## Features
- Image upload (JPEG, PNG, WebP) and video upload (MP4, WebM, MOV; up to 120 s). Boxes and labels with the model's own confidence; adjustable threshold.
- Counts by class. Images: detections per class. Video: distinct animals per class from **ByteTrack** track IDs (a track counts after 3 matched frames) plus the peak number in view. Track IDs are temporary and can switch or split.
- Crop-protection zone: click corners on the picture (3 or more). An animal is inside when the bottom-centre of its box (its ground point) is inside the polygon. For videos, timestamped **enter / exit events** per tracked animal, listed and exportable.
- Downloads: annotated image / current frame (PNG), JSON summary (model, thresholds, sampling, zone, counts, events), zone-events CSV.
- Heavy video work yields to the page every few frames, shows progress and can be stopped. No live camera: nothing is faked as a live feed.

## What it does not do
No crop-damage, disease, health or behaviour detection; not a security system; no species beyond the list; events between sampled frames can be missed.

## Samples
No licensed farm photographs or farm video could be fetched for this site. The only bundled sample is a CC0 cat photograph (`public/ml/samples/chelsea.jpg`, from scikit-image data), clearly labelled as not a farm scene. Tests use the YOLO project's "horses" test photograph and a 6 s clip made from it by panning a crop window (`scripts/make-farm-fixtures.sh`; test-only, not shipped, licence not stated).

## Tests
`node scripts/test-farm-ui.mjs` — 8 Playwright checks: honest scope, refused / empty / broken files, real cat detection with downloads, horses image (≥ 3 horses, livestock label, zone flags animals inside it, stale results cleared when the zone changes), video with tracking and timestamped zone-entry events (none at t = 0, CSV and JSON verified), video without a zone, phone and tablet width, no console errors.
