# Deployment

```bash
docker build -f services/ml-lab/Dockerfile -t neoforge-ml .       # from the repository root
docker run -p 8110:8110 neoforge-ml
```
Set `ML_API_URL` (for example `http://localhost:8110`) and, for demo 16, `DEFECT_API_URL`, for the Next.js site. Without them each page explains that the service is not connected and shows nothing. CPU only; allow about 1.5 GB RAM (word vectors, five ONNX sessions). The image includes ffmpeg. Environment variables (defaults): `ML_MAX_IMAGE_MB` 15, `ML_MAX_PIXELS` 25 000 000, `ML_MAX_VIDEO_MB` 80, `ML_MAX_VIDEO_SECONDS` 60, `ML_MAX_FRAMES` 300, `ML_MAX_CSV_MB` 5, `ML_MAX_CSV_ROWS` 50 000, `ML_MAX_DOC_MB` 15, `ML_MAX_PDF_PAGES` 10, `ML_MAX_SEARCH_DOCS` 30, `ML_JOB_TTL_SECONDS` 1800, `ML_ALLOWED_ORIGINS`, `ML_MODELS_DIR`, `ML_SHARED_MODELS_DIR`, `ML_SAMPLES_DIR`, `ML_WORK_DIR`. No API keys are used or needed.
