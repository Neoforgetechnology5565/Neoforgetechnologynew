# Models, libraries and licences

| Component | Used for | Licence |
|---|---|---|
| **YOLOX-tiny** ONNX (Megvii-BaseDetection/YOLOX release 0.1.1rc0), COCO 80 classes, 416×416, 20.2 MB, SHA-256 `427cc366…b70b0f7` | detection | Apache-2.0 |
| ByteTrack algorithm (Zhang et al., ECCV 2022), re-implemented in Python and TypeScript | tracking | MIT (reference implementation) |
| ONNX Runtime (Python) / ONNX Runtime Web | inference | MIT |
| FastAPI, Starlette, Uvicorn, python-multipart | API | MIT / BSD |
| OpenCV (opencv-python-headless) | decode, drawing | Apache-2.0 (wheel bundles an LGPL FFmpeg) |
| NumPy, SciPy | numerics, assignment | BSD-3-Clause |
| ffmpeg (system binary, optional, called as a separate process) | H.264 / VP8 output | LGPL/GPL depending on build |
| Sample video `highway-dashcam` | demo footage | MIT, © 2017-2018 Udacity, Inc., from `udacity/CarND-Vehicle-Detection` (`project_video.mp4`), trimmed and re-encoded; licence text in `public/vehicle/samples/LICENSE-udacity-carnd.txt`. We rely on the repository's licence for this footage. |

## Why YOLOX and not Ultralytics YOLO
Ultralytics YOLO (code and weights) is AGPL-3.0 (or a paid licence). Serving it from a public website would put the combined work under AGPL obligations. YOLOX has the same single-stage design with an Apache-2.0 licence. RT-DETR (Apache-2.0) was considered; its transformer decoder is heavier on CPU. YOLOX-s (more accurate, ~3× slower) works with the same code: `python scripts/fetch_model.py yolox_s`, then `VEHICLE_MODEL_PATH=models/yolox_s.onnx VEHICLE_INPUT_SIZE=640`.

## Why ByteTrack
It needs no appearance network (cheap on CPU), uses low-confidence boxes to survive partial occlusion, and is well documented. BoT-SORT adds camera-motion compensation and re-identification (better for moving cameras, heavier); DeepSORT needs a re-ID model. ByteTrack was chosen for the CPU budget; the trade-off is stated in LIMITATIONS.

No accuracy figures are claimed for this deployment: the published COCO AP of YOLOX-tiny does not describe performance on your footage.
