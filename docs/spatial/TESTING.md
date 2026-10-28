# Testing

```bash
cd services/spatial-recon && pip install -r requirements-dev.txt && python scripts/fetch_models.py
pytest               # fast tests: cloud I/O and geometry, imports, errors, limits, cancel, failure paths (about a minute)
pytest -m slow       # the real pipeline on the real sample video (4-6 minutes on CPU)
node scripts/test-spatial-ui.mjs   # Playwright (see the header of the script)
```
* `test_cloud.py` – PLY (binary, ASCII, faces) round trips, PCD, malformed and truncated files, point limits, voxel/outlier/normal/crop operations against known answers (planes, injected outliers).
* `test_api.py` (fast) – imports of PLY, OBJ, STL, GLB (surface area and face counts preserved), processing ops, unsupported/corrupt/hostile files, path traversal, limits and busy rejection, cancellation, an honest failure on images that cannot be reconstructed (no point cloud, mesh or depth artifact is `available`).
* `test_api.py` (slow) – the real reconstruction: ≥ 90 % of frames registered, reprojection error < 1.5 px, rotations are proper rotations, the camera path lies at the scale of the scene, point cloud/mesh/depth files open, match images are real, neighbouring keyframes have a median of > 30 verified matches, processing never turns relative scale into metric.
* The UI script checks the three data origins and their badges, layer toggles drawing different pixels, distance/angle/scale calibration, frame–camera linking, downloads (real files), errors for unsupported formats, and (with the service) a live reconstruction and a failing one.
No test asserts a ground-truth accuracy: none exists for this footage.
