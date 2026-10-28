# Deployment

The site (Next.js) can be hosted as usual. The service is a separate container (long-running Python process: COLMAP, ONNX Runtime, OpenCV, ffmpeg not required).

## Without the service
Leave `SPATIAL_API_URL` unset: the page offers the precomputed sample and local viewing of PLY, PCD, OBJ, GLB, STL files; reconstruction and point-cloud processing are disabled with a clear message.

## With the service
```bash
docker build -f services/spatial-recon/Dockerfile -t neoforge-spatial .      # from the repository root
docker run -p 8030:8030 -e SPATIAL_ALLOWED_ORIGINS=https://your-site.example neoforge-spatial
```
Set `SPATIAL_API_URL=https://spatial-service.example` on the site. Serve it over HTTPS when the site is.

| Variable (service) | Default | Meaning |
|---|---|---|
| `SPATIAL_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | CORS allow-list |
| `SPATIAL_DEPTH_MODEL` | `models/depth_anything_v2_vits.onnx` | depth model (optional; without it depth/densify/mesh report `unsupported`) |
| `SPATIAL_MAX_UPLOAD_MB`, `_MAX_TOTAL_MB`, `_MAX_IMPORT_MB` | 200, 300, 150 | upload limits |
| `SPATIAL_MAX_VIDEO_SECONDS`, `_MAX_FRAMES`, `_MAX_IMAGES`, `_MAX_PIXELS`, `_MAX_POINTS` | 120, 120, 80, 40 M, 6 M | input limits |
| `SPATIAL_MAX_CONCURRENT_JOBS`, `_MAX_QUEUED_JOBS` | 1, 2 | resource protection (503 when full) |
| `SPATIAL_MAX_RUNTIME_SECONDS`, `_JOB_TTL_SECONDS`, `_THREADS`, `_WORK_DIR` | 900, 3600, 4, system temp | runtime cap for mapping, cleanup, CPU threads, storage |

Reconstruction is CPU- and memory-hungry (about 1.5 GB for the sample). Add edge rate limiting for a public deployment. Uploads are validated by magic bytes and size, stored under random 32-hex names, never executed, and deleted after processing; the service never returns server paths. Nothing in this repository deploys anything, configures DNS or creates paid services.
