# ML lab service

One small FastAPI service behind portfolio demos 12–21 (classification, detection, segmentation, OCR, forecasting, sensor anomalies, pose, semantic search, recommendation). Demo 16 (image anomaly) reuses `services/defect-inspector`. Documentation: `docs/ml-lab/`.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8110       # then set ML_API_URL=http://localhost:8110 for the Next.js site
pytest                                 # 17 tests with the real models on the real sample data (about 25 s)
python scripts/make_assets.py          # rebuild public/ml/samples (needs /tmp/fmnist test files, see the script)
python scripts/make_covers.py          # re-render public/covers/cv-NN.jpg from real outputs (needs this service and the defect service running)
```
Needs `ffmpeg` for annotated video. YOLOX-S and BlazePose are read from `services/activity-monitor/models/` (override with `ML_SHARED_MODELS_DIR`).

## Models and data
| Item | Origin | Licence |
|---|---|---|
| `models/mobilenet_v2.onnx`, `mobilenet_v2_features.onnx` | Keras Applications MobileNetV2 ImageNet weights, converted with tf2onnx | Apache-2.0 |
| `models/deeplab_v3.onnx` | MediaPipe `deeplab_v3` (PASCAL VOC 21 classes) TFLite, converted with tf2onnx | Apache-2.0 |
| YOLOX-S, BlazePose ONNX | see `services/activity-monitor/README.md` | Apache-2.0 |
| `models/vectors.npy`, `word2row.json` | the 20 000 word vectors (300-d, float16) of spaCy `en_core_web_md` 3.7.1, extracted from its wheel | MIT |
| OCR | RapidOCR / PP-OCR on ONNX Runtime (models inside the wheel) | Apache-2.0 |
| Sample images | scikit-image sample data (public domain / CC0), OpenCV pedestrian clip, CO2 record (public domain), Fashion-MNIST images (MIT) | see `public/ml/samples/manifest.json` |
