# ML lab: computer-vision and machine-learning demos 12–21

Ten small applications, each with a genuine core feature, a direct URL and honest labels. Frontend `src/components/ml/*`, `src/lib/ml/api.ts`; backend `services/ml-lab/` (FastAPI, ONNX Runtime, scikit-learn, statsmodels). Routes follow the portfolio pattern `/ai-demos/<slug>/app`; the short paths below redirect there.

| No. | Demo | Route (short path redirects) | What genuinely runs |
|---|---|---|---|
| 12 | Image classification | `/ai-demos/ai-image-classification/app` (`/image-classification-demo/`) | MobileNetV2 (ImageNet-1000), top-k softmax scores |
| 13 | Object detection & video | `/ai-demos/ai-object-detection-video-analytics/app` (`/object-detection-demo/`) | YOLOX-S (COCO-80) on images and uploaded video (3 fps, background job, annotated MP4) |
| 14 | Segmentation | `/ai-demos/ai-image-segmentation/app` (`/image-segmentation-demo/`) | DeepLabV3 (VOC-21) masks, overlay, side-by-side, opacity, downloads |
| 15 | OCR & extraction | `/ai-demos/ai-ocr-document-extraction/app` (`/ocr-document-intelligence-demo/`) | PDF text layer or RapidOCR, line boxes with confidence, pattern fields, copy / TXT / CSV |
| 16 | Image anomaly detection | `/ai-demos/ai-image-anomaly-detection/app` (`/image-anomaly-detection-demo/`) | PatchCore-style scoring via the defect-inspector service (VisA references), threshold slider |
| 17 | Time-series forecasting | `/ai-demos/ai-time-series-forecasting/app` (`/time-series-forecasting-demo/`) | naive, seasonal naive, Holt, Holt-Winters; hold-out MAE/RMSE/MAPE computed from the data |
| 18 | Predictive maintenance | `/ai-demos/ai-predictive-maintenance/app` (`/predictive-maintenance-demo/`) | rolling robust z-score, baseline z-score, Isolation Forest; scored against fault labels when present |
| 19 | Pose estimation | `/ai-demos/ai-human-pose-estimation/app` (`/human-pose-estimation-demo/`) | YOLOX person boxes + BlazePose 33 keypoints, joint angles, video frames |
| 20 | Semantic document search | `/ai-demos/ai-semantic-document-search/app` (`/semantic-document-search-demo/`) | IDF-weighted word-vector embeddings (semantic), BM25 (keyword) or both (hybrid) over a per-session index |
| 21 | Product recommendation | `/ai-demos/ai-product-recommendation/app` (`/product-recommendation-demo/`) | MobileNetV2 image embeddings + TF-IDF text, user-set blend, per-result explanation |

## Honest labelling
Every page has a notice stating what runs, a footer listing what is implemented and what is not, and a **Beyond this demo** section whose items carry one of: *Working* (shown on the implemented panel), *UI Preview — Not Functional*, *Coming Soon*, *Requires External Integration*, *Requires Compatible Hardware*. Their buttons do not act: they open a short "Not available: …" explanation. No result is shown before a model or calculation has produced it; empty states say so.

## Covers
`public/covers/cv-01…21.jpg` (1200×675) are rendered by `services/ml-lab/scripts/make_covers.py` from real outputs: detections, pose, OCR boxes, classification scores, segmentation, anomaly maps, a rendered LiDAR point cloud, real forecasts and sensor flags, real search hits and recommendations. Exceptions, stated here: **06 (sports)** is an illustration (a seeded random-walk heat map on a pitch, labelled in the image) because no sports footage is bundled; **05** shows a real frame and its depth map; **11** is the demo's synthetic foot photo; the zone and counting line on **01** are drawn on a real detection frame to show what the demo's tools do. The official logo is not placed in the images.

See `ARCHITECTURE.md`, `API.md`, `METHODS.md`, `SAMPLE_DATA.md`, `LIMITATIONS.md`, `TESTING.md`, `DEPLOYMENT.md`.
