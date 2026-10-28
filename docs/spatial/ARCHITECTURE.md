# Architecture

```
browser (Next.js)  ── HTTPS ──>  FastAPI (services/spatial-recon)
  upload / sample / import         POST /api/spatial/reconstruct → job (thread pool, 1 at a time)
  poll stage status  <─────────    ingest → features → matching → mapping → depth → densify → mesh → export
  Three.js viewport                each stage: pending | running | done | failed | skipped | unsupported
  linked source frames             outputs registered as artifacts, each with status + provenance
```
* **Stages and outputs are separate.** Every output (`points_sparse.ply`, `points_dense.ply`, `mesh.glb`, `depth_*.jpg`, `cameras.json`, …) is an *artifact* with a status (`available`, `failed`, `unsupported`, `not_requested`), a description and a provenance sentence. Only `available` artifacts have a URL; a failed job marks the rest as not produced.
* **Cancellation** is cooperative: COLMAP stages receive a cancellation token; between stages the job checks an event. Uploads are deleted when the job ends; job directories are deleted after a TTL, on delete and at service start.
* **Resource limits**: one reconstruction at a time (503 when the queue is full), upload size, video duration, frames, images, pixels and points are all bounded and configurable (`SPATIAL_*`).
* **Coordinates.** COLMAP's world frame has arbitrary origin, orientation and scale; cameras use x right, y down, z forward. The viewer rotates the scene so that the *estimated up vector* (average camera "down" axis, negated) points up; this is not gravity-calibrated. Picks and distances are computed in model coordinates.
* **Scale.** Always reported as relative for reconstructions and unknown for imports. A user calibration is a single multiplier kept in the page (`scale = known distance / model distance of two picked points`) and is labelled as user-calibrated in the inspector, the measurements and the exported report.
* **Densification.** For each keyframe the model's relative inverse depth `d` is fitted to the SfM depths `z` of that frame's triangulated points as `1/z = a·d + b` (RANSAC, then least squares on the relative depth error), and accepted only if at least half of *all* the frame's points are predicted within 25 %. Accepted frames are back-projected (distortion removed by COLMAP's camera model), merged, voxel-downsampled and cleaned. Meshing runs Poisson (COLMAP) on the cloud with normals oriented toward the cameras.
* **Imports** are viewed in the browser with Three.js loaders (PLY, PCD, OBJ, GLB, STL). If the service is connected the file is also parsed server-side (stats, GLB conversion, and the processing operations).
