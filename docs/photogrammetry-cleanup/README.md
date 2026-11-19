# Demo 26: Photogrammetry clean-up for architectural scans

**What exists:** a proof of concept that runs in the browser (`/ai-demos/ai-photogrammetry-cleanup/app`, short link `/photogrammetry-cleanup-demo`). **What does not exist:** the macOS desktop application, the server-side processing engine, the job API and FBX export described in the brief. Section 3 is the design for those; nothing in it is built.

## 1. What the demo really does
Input: a generated façade scan with known dimensions (noise, outliers, floating blobs, occlusion holes added) or an uploaded PLY/OBJ point cloud or mesh. No real Apple Object Capture scan is bundled (none could be obtained here), and results on real scans are untested.

Pipeline (all in `src/lib/photo/`, run in a Web Worker):
1. **Cleaning** (`clean.ts`): statistical outlier removal and removal of small floating components. Points are only deleted, never moved.
2. **Reconstruction** (`recon.ts`): for façade-like scans, a height field on a robustly fitted wall plane (median depth per cell, small-gap filling, optional flattening within a tolerance). Large holes stay open; nothing is invented.
3. **Smoothing** (`smooth.ts`): Taubin smoothing (no shrinkage), sharp edges locked, hard cap on vertex movement.
4. **Simplification** (`simplify.ts`): quadric edge collapse with a per-collapse error limit and flip checks.
5. **Validation** (`metrics.ts`): oriented extents before and after, deviation of the result from the scan points, change in point-pair distances, two-point measuring on both versions, and a ground-truth check on the generated sample.
6. **Export:** OBJ, PLY, STL, GLB, DXF. World coordinates are kept in Float64; GLB keeps the world position in the node translation, STL reports its offset. FBX is not implemented.

Tests: `npm run test:photo` (unit), `npm run test:photo:ui` (real browser, needs a running server).

## 2. Accuracy preservation
The most important requirement is handled by design: deletion-only cleaning, bounded smoothing, error-limited simplification, and a report that measures the result against the input instead of asserting that it is accurate. Deviations are reported in millimetres on the generated sample. They are not a survey-grade guarantee.

## 3. Design for the full product (not built)
**Desktop app (macOS, Swift/SwiftUI, RealityKit/Object Capture):** import PLY/OBJ from Object Capture, parameter presets, before/after viewer (Metal/SceneKit), measuring tools, export, and a "send to server" button for heavy jobs.
**Processing engine (server):** C++ or Python with Open3D/CGAL/PCL for outlier removal, RANSAC plane/primitive detection, Poisson or ball-pivoting where appropriate, quadric decimation, plane-aware regularisation, and validation reports (Hausdorff, RMS, per-region deviation). Linux container, GPU optional.
**Job API:** `POST /jobs` (upload + parameters), `GET /jobs/{id}` (status, progress), `GET /jobs/{id}/result?format=obj|ply|stl|glb|dxf`, `DELETE /jobs/{id}`. Auth by API key, signed upload URLs, object storage for inputs/outputs, a queue (Redis/SQS) with workers, idempotent retries, retention policy.
**Formats:** OBJ, PLY, STL, GLB via standard writers; FBX needs the Autodesk FBX SDK or an Assimp export (licensing review); DXF/DWG via a CAD library for polylines/faces; IFC only for recognised building elements.
**Milestones (estimate, to be agreed):** M1 pipeline on real Object Capture samples and accuracy targets (2-3 weeks); M2 server engine + API (3-4 weeks); M3 macOS app and viewer (4-6 weeks); M4 exports, hardening, documentation, handover (2-3 weeks).
**Risks:** real scans differ from the synthetic façade (reflective glass, vegetation, scaffolding, partial coverage); non-planar buildings need general reconstruction, which is a separate research effort; scale/units from Object Capture must be verified per capture; FBX licensing; accuracy targets need agreed ground truth (total-station or tape measurements); source-code ownership and licences of third-party libraries (Open3D MIT, CGAL GPL/commercial, PCL BSD) must be reviewed.
**MVP:** façade-focused server engine plus CLI, OBJ/PLY/GLB export, validation report, tested on 5-10 real scans with measured ground truth.
