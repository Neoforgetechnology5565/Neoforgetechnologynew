# Deployment

```bash
docker build -f services/activity-monitor/Dockerfile -t neoforge-activity .      # from the repository root
docker run -p 8090:8090 neoforge-activity
```
Set `ACTIVITY_API_URL` (for example `http://localhost:8090`) for the Next.js site. Without it the page says the service is not connected and analyses nothing. Needs `ffmpeg` (in the image) for browser previews and annotated clips. CPU only; allow roughly 1.5× real time at 5 fps per concurrent job and about 1.5 GB RAM.

Environment variables (defaults): `ACTIVITY_MAX_VIDEO_MB` (300), `ACTIVITY_MAX_VIDEO_SECONDS` (600), `ACTIVITY_MAX_SAMPLES` (4000 analysed frames), `ACTIVITY_MAX_PIXELS` (9 000 000), `ACTIVITY_MAX_CONCURRENT_JOBS` (1), `ACTIVITY_MAX_QUEUED_JOBS` (2), `ACTIVITY_MAX_VIDEOS` (6), `ACTIVITY_JOB_TTL_SECONDS` (3600), `ACTIVITY_ALLOWED_ORIGINS`, `ACTIVITY_INTRA_THREADS`, `ACTIVITY_PREVIEW_WIDTH` (960), `ACTIVITY_WORK_DIR`, `ACTIVITY_SAMPLES_DIR`, `ACTIVITY_DETECTOR_PATH`, `ACTIVITY_POSE_PATH`.

Models in `models/`: `yolox_s.onnx` (Megvii YOLOX 0.1.1rc0 release, Apache-2.0) and `blazepose_full.onnx` (MediaPipe pose_landmark_full.tflite from the mediapipe 0.10.14 wheel, Apache-2.0, converted with tf2onnx; see `services/activity-monitor/README.md`).
