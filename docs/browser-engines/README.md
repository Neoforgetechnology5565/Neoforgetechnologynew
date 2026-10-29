# Browser engines: what runs in the page and what it was checked against

The site is hosted statically, so every demo that can run in the visitor's browser does, with no service to set up and no upload. Each browser engine exposes the same API shape as the Python service it mirrors, so the screens are the same either way; setting a service URL (`ML_API_URL`, `PPE_API_URL`, `ROOF_API_URL`, `SPORTS_API_URL`, `ACTIVITY_API_URL`, `DOCS_API_URL`, `DEFECT_API_URL`, `VI_API_URL`, `BIZ_API_URL`) switches a demo back to its server.

| # | Demo | In the browser | How it was checked | Differences from the server |
|---|---|---|---|---|
| 03 | PPE monitoring | YOLOX-tiny workers (same model file as the server), ByteTrack, Intel `worker_safety_mobilenet` **converted from Caffe to ONNX** (`services/ppe-monitor/scripts/convert_safety_to_onnx.py`), the association and assessment rules | `check_safety_onnx.py`: on real image crops OpenCV and the ONNX graph agree to 8e-5 on raw outputs and 44 of 44 detections match (box difference < 3e-7). Rules: 6 ported unit tests. On the bundled clip at every 5th frame the browser finds 819 detections (stored server run implies about 842). | ~0.75 s per processed frame (CPU, WASM); at most 180 s of video; no server-rendered annotated video (overlays are drawn live). The original deploy file has a Reshape of 6 for a 5-class net; OpenCV and this graph both apply the soft-max over groups of 6. |
| 04 | Roof measurement | the U-Net (ONNX Runtime Web, 640 px tiles), mask → regions → outlines → rectangle fit, Canny + Hough interior-edge candidates, GeoTIFF scale (16-bit RGB TIFF decoded with `utif`), the same measurement code as the screens | the bundled Las Vegas chip gives 41 regions, as the stored server result; 16 Playwright checks | Interior edges come from Canny + Hough, not OpenCV's line-segment detector; ~40 s for a 650 px chip; no PDF report |
| 05 | Medical imaging (new) | classical image processing and segmentation | 10 phantom tests with known geometry, 11 UI tests | not a trained model: no diagnosis, no findings |
| 06 | Sports | FootAndBall (ONNX Runtime Web), Lucas–Kanade + RANSAC camera motion, ByteTrack in the stabilised frame, teams, ball Viterbi linking, pitch calibration, statistics | 10 ported unit tests; on a real long-shot clip the browser matched the Python pipeline: ball observed 9 vs 9 frames, 41 of 54 player boxes at IoU > 0.7 (different video decoders) | several times slower than real time; frame rate is measured from playback; no bundled footage |
| 07 / 16 | Visual inspection, anomaly detection | PatchCore with a ResNet-50 backbone and the VisA reference banks | UI tests (see the status table) | |
| 08 | Animal detection (new) | YOLOX-tiny, ByteTrack, polygon zone | 8 UI tests | ten COCO animal classes only |
| 09 | Activity | YOLOX-tiny, ByteTrack, BlazePose, the fall and close-contact rules | 9 ported rule tests; UI test | detector is YOLOX-tiny at 416 px (server: YOLOX-S at 640 px); at most 240 analysed frames per run |
| 10 | Documents | pdf.js text layer, Tesseract.js OCR, line-morphology table finder, the same rules for fields, checks and classification | 10 ported rule tests; 13 UI tests; the simulated scan is read perfectly (table, fields, skew −1.4°) | Tesseract (English) instead of RapidOCR; PDF field boxes inside a text run are approximate |
| 22–24 | Restaurant, table tennis, basketball | see `docs/video-intel/README.md` | | |
| CRM/ERP | Flow and BI | `src/lib/biz/local-engine.ts`: workflow engine, approvals, alerts, CSV import and queries over the local store | 12 Playwright checks with no server | data stays in this browser; no schema validation by the server's rules |

Not possible in a browser: COLMAP structure from motion (the former Sample 05; replaced) and the LiDAR service (the former Sample 08; replaced).

## Limits worth knowing
Everything is CPU WebAssembly, single-threaded, so video work is slow and bounded (see each demo's limits in the page). Models are downloaded on first use (PPE 22 MB + 20 MB, roof 31 MB, activity pose 13 MB, anomaly backbone and references).
