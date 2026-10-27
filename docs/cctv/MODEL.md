# Model information

* **Detector:** MB3-CenterNet (MobileNet-V3 backbone, CenterNet head), COCO 80 classes, 512×512 input, ~4 MB
  (`public/models/cctv/centernet.json|bin`). Run through **@vladmandic/human 3.3.6** on **TensorFlow.js 4.22**:
  WebGL → CPU fallback in the browser, WASM (CPU) in the Node worker.
* **Classes used:** person, bicycle, car, motorcycle, bus, truck. All other COCO labels are dropped.
* **Speed (measured once, not a benchmark):** the Node WASM worker processed 16 sampled 640×480 frames in 6.5 s *including*
  process start-up and model load on a 4-vCPU container (about 0.4 s per frame or better). Browser speed depends on the
  device (WebGL vs CPU fallback) and is shown live as "s per frame" while a run is in progress. It is **not real-time**
  and no GPU is used server-side.
* **Accuracy:** a small mobile model. Expect missed small/occluded objects, wrong classes at low confidence and duplicate
  boxes. No accuracy benchmark is claimed. Use the confidence slider and the human review workflow.
* **Why not YOLO?** Ultralytics YOLO (code and weights) is AGPL-3.0 (or a paid Enterprise licence). Embedding it in a
  network-served site would put the whole combined work under AGPL obligations, and its weights were not reachable
  from the build environment. It was therefore not used or bundled. The `Detector` interface allows a licensed build later.
* **Weapon detection:** no validated model exists in this project; the feature is disabled and labelled, not mocked.
* **Faces:** face/body/hand/segmentation models inside Human are disabled. No biometric processing.
