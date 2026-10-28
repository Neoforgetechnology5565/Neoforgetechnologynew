# Deployment

The Next.js site can be hosted as usual (e.g. Vercel). The vehicle service is a separate, small container because it needs a long-running Python process (ONNX Runtime, OpenCV, optionally ffmpeg) that serverless functions are not suited to.

## Without the service
Leave `VEHICLE_API_URL` unset. The page offers only the in-browser engine (ONNX Runtime Web + the 20 MB model and 15 MB WASM binary served from `/models/vehicle/` and `/vehicle/ort/`). `npm run build` copies the WASM file from `node_modules` (`scripts/copy-ort-wasm.mjs`, wired as `prebuild` and `postinstall`).

## With the service
```bash
docker build -f services/vehicle-tracker/Dockerfile -t neoforge-vehicle .   # from the repository root
docker run -p 8010:8010 -e VEHICLE_ALLOWED_ORIGINS=https://your-site.example neoforge-vehicle
```
Then set `VEHICLE_API_URL=https://vehicle-service.example` on the site (browsers call the service directly; this avoids serverless request-size limits for video uploads). The service must be served over HTTPS when the site is.

| Variable (service) | Default | Meaning |
|---|---|---|
| `VEHICLE_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | CORS allow-list (comma separated) |
| `VEHICLE_MODEL_PATH`, `VEHICLE_INPUT_SIZE` | `models/yolox_tiny.onnx`, 416 | model file and its input size |
| `VEHICLE_MAX_VIDEO_MB`, `_MAX_VIDEO_SECONDS`, `_MAX_FRAMES`, `_MAX_PIXELS`, `_MAX_IMAGE_MB` | 100, 180, 6000, 40 M, 15 | upload limits |
| `VEHICLE_MAX_CONCURRENT_JOBS`, `_MAX_QUEUED_JOBS` | 1, 3 | resource protection (503 when full) |
| `VEHICLE_JOB_TTL_SECONDS`, `VEHICLE_WORK_DIR`, `VEHICLE_INTRA_THREADS` | 3600, system temp, ORT default | cleanup, storage, CPU threads |

A public deployment should add rate limiting at the edge (the service bounds work but does not rate-limit per client) and run the container as a non-root user with a read-only root filesystem and a writable temp dir (the Dockerfile uses `USER nobody`). Nothing in this repository deploys, configures DNS or creates paid services.
