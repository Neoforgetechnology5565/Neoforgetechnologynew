# Smart Glasses Spatial Mapping & 3D Reconstruction (Computer Vision demo no. 5)

An interactive spatial-computing demonstration: upload a moving-camera video or an image sequence, and the service estimates the **camera path** and a **sparse 3D map** with structure from motion, adds **learned relative depth** and an **approximate densified cloud and mesh**, and the page lets you inspect, filter, measure and export the result. Frontend `src/components/spatial/*`; backend `services/spatial-recon/` (FastAPI). No database, no accounts, no business features.

Route: `/ai-demos/smart-glasses-spatial-mapping/app`.

## Three different things the page can show (and it always says which)
| Badge | Meaning |
|---|---|
| **processed from your upload** | the pipeline ran on your files on the server just now |
| **precomputed sample result** | a stored result of the same pipeline on the bundled sample video, computed earlier; not a new upload |
| **imported file (viewing only)** | a PLY, PCD, OBJ, GLB or STL you opened; nothing is reconstructed |

## What is real
| Part | How |
|---|---|
| Frame selection | keyframes chosen by tracking features through the video (Lucas-Kanade): a frame is taken when most tracked features are lost, moved far, or 0.2 s passed |
| Features, matching, camera poses, sparse points | COLMAP (pycolmap): SIFT, sequential or exhaustive matching with geometric verification, incremental mapping with bundle adjustment, CPU |
| Tracking quality | verified matches between neighbouring keyframes, feature points per frame (triangulated or not), match images |
| Relative depth | Depth Anything V2 Small (ONNX, Apache-2.0) on up to 12 keyframes; shown as colour maps, never as metres |
| Densified cloud, mesh | per-keyframe depth aligned to that frame's SfM depths (robust fit, checked on all points) and back-projected; Poisson surface reconstruction. **Approximate.** Keyframes whose depth disagrees with the SfM geometry are left out and reported |
| Point cloud operations | voxel downsampling, statistical and radius outlier removal, normal estimation, cropping (NumPy/SciPy) |
| Measurements | distance and angle picked on the cloud or mesh; scale relative until you calibrate with a known distance |

## What it does not do
No metric scale from video alone. No dense multi-view stereo (needs CUDA). No real-time tracking, no loop closure, no IMU or sensor fusion, no handling of moving objects. See `LIMITATIONS.md`.

Documents: `ARCHITECTURE.md`, `API.md`, `MODELS_AND_LICENSES.md`, `LIMITATIONS.md`, `TESTING.md`, `DEPLOYMENT.md`.
