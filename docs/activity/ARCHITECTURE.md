# Architecture

```
Browser (Next.js)                         services/activity-monitor (FastAPI, port 8090)
 ActivityApp ── ClipPlayer (video + canvas) ─▶ main.py   endpoints, validation, annotated rendering
   src/lib/activity/api.ts                      detector.py  YOLOX-S ONNX, person class only
                                                tracker.py   ByteTrack (shared implementation with the PPE/vehicle/sports demos)
                                                pose.py      BlazePose full (ONNX) on a square crop per tracked person
                                                pipeline.py  decode → detect → track → pose → stored observations
                                                activity.py  fall and close-contact rules (pure functions of the stored tracks)
                                                jobs.py      in-memory videos, bounded queue, expiry, review state
                                                render.py    annotated MP4 from stored observations
```
* **Observations are stored; alerts are derived.** Rules run on `Track = list[Sample(t, box, score, keypoints)]`, so thresholds can change without reprocessing, and the rules are unit-testable without a video.
* **Sampling**: the video is decoded sequentially and every k-th frame analysed so that the analysed rate is close to the requested one (default 5 fps). The ByteTrack buffer is 3 s regardless of rate. Times in rules are seconds of video.
* **Pose**: top-down. The track box becomes a square crop (×1.25), resized to 256×256. There is no body-axis rotation of the crop (MediaPipe's own pipeline rotates it), so horizontal bodies are less reliable; the rules fall back to box shape when pose is missing and say so in the alert.
* **Overlays** in the browser are drawn on a canvas from `/frames` (boxes, ids, 33 keypoints with visibility) at the analysed rate, held between frames and not shown if older than two sampling intervals. The annotated MP4 uses the same hold rule.
* **Bounds**: upload size, duration, analysed-frame count, pixels per frame, stored videos, queue length and TTL are limited in `config.py`. Ids are 32 hex characters (alerts `<video id>-<n>`); generic error messages; no file-system paths reach the client; temp files are removed on expiry and at start-up.
