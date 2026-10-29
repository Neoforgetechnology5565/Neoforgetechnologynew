# Testing

* `cd services/lidar-wires && pip install -r requirements-dev.txt && pytest` (45 tests): readers and writers per format, truncated LAS, units, voxel/SOR/ROR/crop, ground and heuristic classification, wire recovery against generated truth, measurement values against analytic distances, API validation (bad formats, ids, limits).
* `npm run test:lidar:ui` (Playwright, software WebGL): loads samples, runs the pipeline, checks the canvas is drawn, measurement table, exports. `MODE=static|server` and `BASE_URL` select the target (server mode needs a Next.js server started with `LIDAR_API_URL`).
