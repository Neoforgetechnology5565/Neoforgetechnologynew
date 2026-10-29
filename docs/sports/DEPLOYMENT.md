# Deployment

```bash
cd services/sports-analyzer
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --port 8050           # needs ffmpeg on PATH for browser previews (apt install ffmpeg)
# site:  SPORTS_API_URL=http://localhost:8050 npm run dev
```
Docker: `docker build -f services/sports-analyzer/Dockerfile -t neoforge-sports .` (includes ffmpeg; port 8050; runs as `nobody`).

Environment (all optional): `SPORTS_MAX_VIDEO_MB` (400), `SPORTS_MAX_VIDEO_SECONDS` (900 per analysed window), `SPORTS_MAX_SAMPLES` (6000 analysed frames), `SPORTS_MAX_PIXELS` (9 M per frame), `SPORTS_MAX_CONCURRENT_JOBS` (1), `SPORTS_MAX_QUEUED_JOBS` (2), `SPORTS_JOB_TTL_SECONDS` (3600; uploads and results are deleted afterwards), `SPORTS_ALLOWED_ORIGINS`, `SPORTS_INTRA_THREADS`, `SPORTS_PREVIEW_WIDTH`, `SPORTS_WORK_DIR`, `SPORTS_SAMPLES_DIR`.

Hardware: CPU only (no GPU support is implemented); 4+ cores and 4 GB RAM recommended; a 4K frame needs ~1.5 GB while the network runs at full resolution (the detector scales frames above 2000 px wide down). Run the service on a container platform, not on serverless functions (model runtime and job duration). Uploaded videos live in the temp directory only and are removed after the TTL or on `DELETE`. Nothing is deployed by this repository and no DNS or hosting setting is changed.
