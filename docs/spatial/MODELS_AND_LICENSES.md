# Models, libraries and licences

| Component | Used for | Licence |
|---|---|---|
| **COLMAP** via **pycolmap** 4.2 (PyPI wheel, CPU) | features, matching, SfM, bundle adjustment, Poisson meshing | BSD-3-Clause |
| **Depth Anything V2 Small**, ONNX export from `fabio-sim/Depth-Anything-ONNX` release v2.0.0 (`depth_anything_v2_vits.onnx`, 99.4 MB, input 518×518) | relative depth | Apache-2.0 (Small only; the Base/Large/Giant checkpoints are CC-BY-NC-4.0 and are not used) |
| ONNX Runtime, FastAPI, NumPy, SciPy, OpenCV (headless), trimesh | inference, API, geometry, I/O | MIT / BSD / Apache-2.0 (OpenCV wheel bundles an LGPL FFmpeg) |
| Three.js (viewer, loaders) | 3D view | MIT |
| Sample video | demonstration footage | MIT, © 2017-2018 Udacity, Inc., `udacity/CarND-Vehicle-Detection` (`project_video.mp4`), trimmed, re-encoded; also used by the vehicle demo |

## Why these
* **COLMAP/pycolmap** is the reference open-source SfM; the wheel runs on CPU without CUDA. Its dense multi-view stereo needs CUDA and is therefore not available here.
* **Open3D** (400 MB wheel) was evaluated and not needed: the point cloud operations used here are a few lines of NumPy/SciPy, and Poisson meshing comes with pycolmap.
* **Depth Anything V2 Small** was the only depth model reachable and licensable here; its output is *relative inverse depth* (larger = nearer) with no metric scale. The model file is not committed (99 MB): `python scripts/fetch_models.py` downloads it (the Dockerfile does this at build time).

## Sample data provenance
Only `highway-dashcam.mp4` (MIT) is bundled. A walk-through-a-room video under a usable licence could not be sourced; the sample is forward motion along a road, which reconstructs but is not an indoor scene, and the moving vehicles in it violate the static-scene assumption. The "sample point cloud" and "sample mesh" offered in the import tab are exports of the precomputed reconstruction, labelled as such.
