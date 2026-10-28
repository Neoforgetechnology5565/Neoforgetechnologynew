# Models, libraries and licences

| Component | Used for | Licence |
|---|---|---|
| **YOLOX-tiny** ONNX (Megvii-BaseDetection/YOLOX release 0.1.1rc0), COCO 80 classes, 416×416, only class 0 ("person") used | worker detection | Apache-2.0 |
| **worker_safety_mobilenet** (MobileNet-SSD, Caffe, 224×224), from `intel-iot-devkit/safety-gear-detector-python`, committed in `services/ppe-monitor/models/worker-safety-mobilenet/` with the licence and checksums | hard hat / safety vest detection | BSD-3-Clause, © 2021 Intel Corporation |
| ByteTrack algorithm, re-implemented | tracking | MIT (reference implementation) |
| ONNX Runtime, FastAPI, Uvicorn, NumPy, SciPy | inference, API, numerics | MIT / BSD |
| OpenCV **4.x** (`opencv-python-headless<5`) incl. DNN module | Caffe model, decode, drawing | Apache-2.0 (wheel bundles an LGPL FFmpeg). Pinned below 5 because OpenCV 5 dropped the Caffe importer |
| ffmpeg (optional system binary, separate process) | H.264 / VP8 output | LGPL/GPL depending on build |
| Sample video `factory-corridor-ppe` | demo footage | BSD-3-Clause, © 2021 Intel Corporation, from the same repository (`resources/Safety_Full_Hat_and_Vest.mp4`), downscaled and re-encoded; licence in `public/ppe/samples/`. We rely on the repository's licence for this footage; Intel does not state its provenance separately |

## Choosing the PPE model (what was checked)
A general COCO detector cannot recognise helmets or vests, so a PPE-specific model is required. Reachable candidates and why they were not used:
* Models trained with **Ultralytics YOLO** (YOLOv5/8/11/12) – the PPE weights found were licensed AGPL-3.0 or had no licence; serving them from a public site brings AGPL obligations or an unclear right to redistribute.
* Repositories whose weights are **not in git** (hosted on Baidu/Google Drive) or whose licence is GPL-3.0 – not usable here.
* HuggingFace and Roboflow hosted models – not reachable from the build environment, and their dataset licences (CC BY, "research only") were not verifiable.
* **Intel `worker_safety_mobilenet`** – BSD-3-Clause, weights in git, runs on CPU through OpenCV, and it genuinely detects hard hats and vests (verified below). Chosen.

## What was verified about the model, and what was not
Verified by running it on real person crops (corridor clip, public sample images with workers on construction sites): class **2** boxes sit on the torso of people wearing vests, class **4** boxes sit on hard hats, and both are absent on people wearing neither (e.g. dark clothing). This matches how Intel's own application reads the classes.
**Not known:** Intel publishes no class list, training data description or accuracy figures; class 1 behaves like a generic "person" output and class 3 is unexplained, so both are ignored. The model produces false positives (e.g. a vest box on a bright helmet area, hat boxes on dark hair) and false negatives, especially for small, distant or partly hidden workers; the position rules and temporal smoothing exist because of this. The demo reports no accuracy figure because none was measured against labelled data.

## Using a different PPE model
`app/ppe.py` is the only place that knows the model: `SafetyGearModel.detect(frame, persons)` returns `PPEBox(kind, score, box, worker)` and `CLASS_OF` maps class ids to `hard_hat` / `safety_vest`. A replacement must (a) really contain those classes, (b) have a licence that fits your use. A whole-frame detector (e.g. a YOLO-family helmet/vest model) can be plugged in by running it once per frame and assigning each box to the worker whose box contains its centre; `associate()` and `Assessor` then apply unchanged. Extra classes (gloves, goggles, masks) need new kinds in `KINDS` and the UI; they are not supported today.
