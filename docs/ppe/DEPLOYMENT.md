# Deployment

The site (Next.js) can be hosted as usual. The service is a separate small container (long-running Python process: ONNX Runtime, OpenCV 4, ffmpeg).

## Without the service
Leave `PPE_API_URL` unset. The page then offers the stored result of a real run on the bundled sample (read-only) and disables uploads with a clear message.

## With the service
```bash
docker build -f services/ppe-monitor/Dockerfile -t neoforge-ppe .     # from the repository root
docker run -p 8020:8020 -e PPE_ALLOWED_ORIGINS=https://your-site.example neoforge-ppe
```
Set `PPE_API_URL=https://ppe-service.example` on the site (browsers call the service directly, avoiding serverless body-size limits). Serve it over HTTPS when the site is.

| Variable (service) | Default | Meaning |
|---|---|---|
| `PPE_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | CORS allow-list |
| `PPE_MODEL_PATH`, `PPE_INPUT_SIZE` | `models/yolox_tiny.onnx`, 416 | person model and its input size |
| `PPE_SAFETY_PROTOTXT`, `PPE_SAFETY_WEIGHTS` | `models/worker-safety-mobilenet/…` | PPE model |
| `PPE_MAX_VIDEO_MB`, `_MAX_VIDEO_SECONDS`, `_MAX_FRAMES`, `_MAX_PIXELS`, `_MAX_IMAGE_MB` | 100, 180, 6000, 40 M, 15 | upload limits |
| `PPE_MAX_CONCURRENT_JOBS`, `_MAX_QUEUED_JOBS` | 1, 3 | resource protection (503 when full) |
| `PPE_JOB_TTL_SECONDS`, `PPE_WORK_DIR`, `PPE_INTRA_THREADS` | 3600, system temp, ORT default | cleanup, storage, CPU threads |

Add edge rate limiting for a public deployment (the service bounds work but does not rate-limit per client). Uploads are never executed, are validated by magic bytes and size, stored under random 32-hex names in a temp directory and deleted after the TTL; errors never include paths. Nothing in this repository deploys, configures DNS or creates paid services.
