# worker_safety_mobilenet

MobileNet-SSD (Caffe) hard hat / safety vest detector, © 2021 Intel Corporation, BSD 3-Clause (see `LICENSE-intel-bsd-3-clause.txt`).
Copied unmodified from https://github.com/intel-iot-devkit/safety-gear-detector-python (`resources/worker-safety-mobilenet/`).

| File | SHA-256 |
|---|---|
| `worker_safety_mobilenet.prototxt` | `c28f328a149de80f35fd7b9c6636993381d138d2e35782c9b10fb3dcc9a09ed9` |
| `worker_safety_mobilenet.caffemodel` | `245439d0cf50f2ed7344b699cc75d60a06725bdc84fd2a550df43a07fc8ddd9d` |

Input: a crop around one person, resized to 224×224, raw BGR 0-255 (no mean, no scale) – exactly as Intel's own application feeds it.
Output (SSD DetectionOutput, 5 classes incl. background): Intel does not document the classes. Their application uses class 2 as **safety vest** and class 4 as
**hard hat**; class 1 fires on almost every person crop with a body-sized box and class 3 is unused by Intel, so both are ignored here.
Intel publishes no training data description and no accuracy figures for this model.
