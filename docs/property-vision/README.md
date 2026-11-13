# PropertyVision AI (CV/AI demo 25)

Route: `/ai-demos/ai-property-vision/app` (short path `/property-vision-demo`). It is listed as demo 25 in the Computer Vision portfolio.

**It runs inside the website.** Like demos 12–21 and 22–24, with no server configured the whole demo runs in the visitor's browser (ONNX Runtime Web): the photo never leaves the device and nothing needs to be deployed besides the site. The first analysis downloads about 100 MB of model files (CLIP int8 95 MB, YOLOX-tiny 20 MB), which the browser then caches. If `ML_API_URL` is set, the same page uses the Python FastAPI service instead (`services/ml-lab/app/property.py`; CLIP fp32 + YOLOX-S) for the same three modules.

| | In the browser (default) | Python service (optional) |
|---|---|---|
| Classification | CLIP ViT-B/32 **int8-quantised** (`public/ml/models/clip_vit_b32_visual_int8.onnx`, 95 MB; embedding cosine 0.99 to the full model on the samples, probabilities within a few points) | CLIP ViT-B/32 fp32 (351 MB, downloaded by `fetch_clip.py`) |
| Detection | YOLOX-tiny, 416 px (finds fewer small objects) | YOLOX-S, 640 px |
| Scoring | `src/lib/ml/property-score.ts` | `services/ml-lab/app/property.py`; same rules, tested to give the same numbers |
| Code | `src/lib/ml/browser/property.ts`, `src/components/ml/PropertyApp.tsx` | `services/ml-lab/app/main.py` (`/api/property/*`) |

## Scope (revised)
Exactly three modules on one uploaded photograph. The earlier, larger plan (hand-built damage and distress detection, anomaly heat maps, model training, dataset collection) was stopped and removed.

| Module | What runs | Output |
|---|---|---|
| 1. Property image classification | **Pretrained OpenAI CLIP ViT-B/32**, zero-shot: the image embedding is compared with text descriptions of four categories (residential house, commercial building, vacant land, mobile home); softmax over 100 × cosine similarity | predicted category, confidence for every category, an "unsure" note when the top two are close |
| 2. Visual object detection | **Pretrained YOLOX-S** (COCO, 80 classes; the model the ML lab already ships) | boxes, labels and confidence scores on the image, a list, an adjustable threshold |
| 3. Condition scoring | A small **Python scoring engine** (`score_property`) fed with the real outputs of 1 and 2 plus three OpenCV measurements (green cover, sharpness, brightness) | experimental 0–100 score, every factor labelled *observed* or *assumption*, plain-English explanation, evidence strength, what the score cannot see |

## Honest limits
- **CLIP is general-purpose.** It was not trained on property photos. Aerial images and borderline cases (a hotel/apartment block, a desert-edge development) can land in a surprising category; the UI shows all four probabilities.
- **COCO has no tree, fence, roof or crack class**, so none of those is detected. The detector also makes mistakes in aerial photographs (a tree canopy can look like broccoli). The UI and the scoring engine say so; household-object penalties need ≥ 50 % confidence.
- **The score is a hand-written rule set, not a model**: baseline 60 ("no evidence either way"); vehicles +3 each (max +9, assumption), people +2 each (max +4, assumption), planters/benches +2 each (max +4, assumption), household items outdoors −4 each (max −12, assumption, only ≥ 50 % confidence, built-up types only), very high green cover −6 (assumption; vegetation is not scored on vacant land). It is **not validated** against inspections or valuations and does not prove a property is distressed or well kept. "Evidence strength" (High/Medium/Low) drops when the property type is uncertain, the photo is blurry or extreme in brightness, or nothing was detected.
- Not implemented: training, crack/damage detection, valuation, analysis history across sessions.

## Reference repositories (inspected, not copied)
| Repository | What it offers | Why it is not used directly |
|---|---|---|
| Sardhendu/PropertyClassification | TensorFlow image-classification pipeline for assessor, aerial and street-side imagery | trained on private assessor imagery, no weights published, no licence file found |
| najmulmowla1/Earthquake-Building-Damage-Detection | CNN + Vision Transformer architecture for earthquake damage on aerial images | architecture code only (no weights); the UAVs-TEBDE dataset is on Mendeley Data and was not reachable here; it targets disaster damage, not ordinary condition |
| bburakoztoprak/Anomaly-Detection | convolutional auto-encoder anomaly detection with FastAPI | checkpoints are trained on the industrial MVTec AD set (not property imagery) and the repository has no licence file |
No code was copied from these projects. The revised scope uses pretrained CLIP and YOLO instead, as requested.

## Models and licences
- CLIP ViT-B/32 image encoder: OpenAI CLIP weights (MIT), ONNX export by Jina AI clip-as-service (Apache-2.0), downloaded from its public S3 bucket by `services/ml-lab/scripts/fetch_clip.py` (351 MB; **not stored in git**).
- Class text embeddings (`models/clip_property_prompts.npz`, 9 KB): made once with CLIP's text encoder (254 MB, only needed to rebuild them: `python scripts/fetch_clip.py --rebuild`). The descriptions and templates are in that script.
- YOLOX-S: Megvii YOLOX, Apache-2.0 (`services/activity-monitor/models/yolox_s.onnx`).
- Tokenizer vocabulary (build step only): from the `onnx_clip` package (MIT).

## Sample photographs (real, with licences shown in the interface)
`public/ml/samples/property/` and `manifest.json` (kind `property`): a ground-level photograph of a large building with a car, hedges and planters (OpenCV repository sample, Apache-2.0 repository), and four aerial SpaceNet chips (CC BY-SA 4.0, © DigitalGlobe) of Las Vegas houses, a lake-side neighbourhood, a desert edge and Paris flat roofs. **No sample photograph of a mobile home or of a ground-level house was available offline**, so none is bundled; upload your own to test those categories.

## API (service)
`GET /api/samples?kind=property` · `POST /api/property/classify` (file or `sample_id`) · `POST /api/property/detect` (+ `threshold` 0.05–0.95) · `POST /api/property/analyze` (all three; returns classification, detection with an annotated JPEG as a data URL, measurements, score, timings, model info). Interactive docs at `/docs` on the service. Limits: 15 MB images, per-IP rate limit, same as the other ML lab endpoints.

## Setup (only for the optional Python service)
```
cd services/ml-lab
pip install -r requirements.txt
python scripts/fetch_clip.py                 # downloads the 351 MB CLIP image encoder
uvicorn app.main:create_app --factory --port 8110
# website: set ML_API_URL=http://localhost:8110 (and ML_ALLOWED_ORIGINS on the service to the site's origin)
```
Docker: `docker build -f services/ml-lab/Dockerfile -t neoforge-ml .` downloads the weights during the build.

## Tests (all real models, nothing mocked)
- `cd services/ml-lab && pytest tests/test_property.py`: 17 tests: CLIP on real photographs, YOLO boxes and thresholds, the analyze pipeline, upload and bad input, and every scoring rule with controlled inputs.
- `npm run test:property:ui` runs 18 browser checks in either mode. `MODE=browser` (site started without `ML_API_URL`): CLIP int8 and YOLOX-tiny run in the page, the score is checked to equal 60 + the displayed factors, and the class and probability are compared with the service. `MODE=server` (site started with `ML_API_URL`): the UI values must equal the service's for the same image. Both modes cover upload, threshold, rejection of bad files and phone width.
- `npx tsx src/lib/ml/property-score.test.ts`: the TypeScript scoring engine on the same controlled cases as the Python tests.
