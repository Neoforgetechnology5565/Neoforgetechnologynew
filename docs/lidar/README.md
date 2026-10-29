# LiDAR Point Cloud & Wire Measurement (Computer Vision demo no. 8)

Load a point cloud, preprocess it, classify it, find wire-like structures and measure distances, all in the cloud's own coordinates. Frontend `src/components/lidar/*`, `src/lib/lidar/*` (Three.js viewport); backend `services/lidar-wires/` (FastAPI + NumPy/SciPy/laspy). Route `/ai-demos/lidar-point-cloud-wire-measurement/app`. No database: clouds live in memory with a TTL.

## Workflow
1. **Load**: upload PLY / PCD / LAS / LAZ / XYZ (format detected from content, not file name) or open a sample.
2. **Units**: read from the LAS header when present. Otherwise *unknown* until you declare them. Distances are never reported as metres on an assumption.
3. **Preprocess** (creates a new version, the original is kept): voxel downsample (keeps real points), statistical and radius outlier removal, crop box, normals; before/after counts shown.
4. **Classify**: use provided labels (LAS classes, PLY/PCD label fields) or a **heuristic** (ground model + local eigenfeatures: ground / vegetation / structure / wire-like / unclassified). Heuristic results are labelled as such.
5. **Detect wire candidates**: height above ground, linearity, near-horizontal axis, clustering, RANSAC line + catenary-like parabola fit. Each candidate lists id, support points, fit, residual, endpoints, method and limits. Sparse data gives "could not identify".
6. **Measure**: pick points or wires/objects in the viewport. Types: point-point, point-wire, wire-wire, wire-ground, wire-object, point-object, point-ground. Each result has value, unit, type, ids, method and validity notes.
7. **Export**: PLY (double precision), measurements CSV/JSON, wires JSON.

## What it does not do
* It does not decide compliance. A threshold is applied only if you type one, and the result is labelled "your criterion".
* Heuristic classes and wire candidates are not ground truth. Wires are *candidates* until a person checks them.
* Real-tile result: the bundled USGS tile has no wires labelled by the provider, so the demo makes no claim of verified wires on it.

See `ARCHITECTURE.md`, `API.md`, `MEASUREMENT.md`, `SAMPLE_DATA.md`, `LIMITATIONS.md`, `TESTING.md`, `DEPLOYMENT.md`.
