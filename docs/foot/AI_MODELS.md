# AI models, reconstruction options and research

## What actually runs
**No machine-learning model is used.** Measurement is classical computer vision written for this project (thresholding, connected components, homography, PCA). This is deliberate: it is inspectable, deterministic, runs in the browser for live guidance and on the server for measurement, and needs no GPU or model downloads. Camera guidance and results are therefore *not* "AI-predicted" and carry no model confidence score.

## Options researched (2026-10-27)
Verified by web lookup at the time of writing; re-check licences before adopting any of them.

| Option | Finding | Decision |
|---|---|---|
| **MiniDraco / "footscan" GitHub repo** | A web search found **no repository** under that name (only unrelated patents and papers). Could not verify existence, licence or limits. | **Not used.** No code was taken or assumed. |
| **COLMAP** | BSD-licensed Structure-from-Motion + Multi-View Stereo ([github.com/colmap/colmap](https://github.com/colmap/colmap)); CUDA wheels exist (`pycolmap-cuda12`), AMD via ROCm when built from source; dependencies carry their own licences. Needs many overlapping photos and a compute worker; produces unscaled geometry unless a known-size reference is used. | **Not integrated** (needs a background GPU/CPU worker and a scale step). Recommended future path for true 3D. |
| **Polycam Content API** | Per [poly.cam/tools/api](https://poly.cam/tools/api): **Enterprise-only add-on at extra cost**, price on request. Described as *read/export* access to a customer's own Polycam library (list captures, metadata, export OBJ/GLTF/LAS); nothing found describing capture upload. | **Not used; not free.** A Polycam export could be loaded through the OBJ import. |
| OpenCV / NumPy / SciPy / PyTorch | Standard, permissively licensed, but would require a Python service. | Not needed; equivalent steps are implemented in TypeScript. |
| Three.js | MIT; already in the project. | **Used** for the viewer. |
| Single-image / single-video foot reconstruction research | e.g. [Best Foot Forward (arXiv 2502.20511)](https://arxiv.org/html/2502.20511v2), [IBV single-image reconstruction](https://proc.3dbody.tech/abstracts/2024/2413.html). Research results with their own datasets/licences. | Not used; candidates for a later ML upgrade. |

## Later upgrade path (not built)
1. Multi-view photogrammetry (COLMAP or similar) in a queued worker, scaled by the printed/paper reference, producing a mesh feeding the existing OBJ pipeline.
2. Phone depth/LiDAR (native SDK) for girth and instep.
3. A learned foot-shape prior to estimate heights from a single image.
Each requires new hardware/compute and its own validation; none is claimed today.
