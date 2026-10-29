# Architecture

```
Browser (Next.js)                       services/lidar-wires (FastAPI, port 8070)
 LidarApp ── LidarViewer (Three.js) ──▶ main.py  endpoints
   src/lib/lidar/api.ts                 cloud.py     readers/writers, Units
                                        ops.py       voxel, SOR, ROR, crop, normals
                                        classify.py  provided labels, ground model, eigenfeatures
                                        wires.py     candidates → clusters → RANSAC/MSAC → spans
                                        measure.py   distance types + unit handling
                                        store.py     in-memory clouds/versions, TTL
```
* **Precision**: server coordinates are float64. The viewer receives a local-origin float32 binary (origin subtracted) so large UTM values do not jitter. Display is decimated to a cap; the UI says "showing N of M points (display only)". Computation always uses all points.
* **Versions**: each preprocess creates a version; classification and wires attach to a version.
* **Bounds**: upload size, point count, concurrent jobs and TTL are set in `config.py`. Ids are 32 hex characters. Errors are generic; no file-system paths reach the client.
* **Wire detection**: candidates = points with height above ground ≥ 3 (cloud units scaled to metres when known), linearity ≥ 0.9 and |axis_z| ≤ 0.5 → single-linkage clusters (link 5 m) → sequential RANSAC: a line in plan, then a parabola z(s) over it, scored with MSAC → split by gaps (max 15 m) and long spans. Vertical structures (poles) are rejected by axis_z.
