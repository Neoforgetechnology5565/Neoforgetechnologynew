# AI CCTV Intelligence & Security Analytics Platform (Demo 1 of 10)

A working demo inside the Neo Forge Technology site, at `/portfolio/computer-vision` → **Launch Interactive Demo**
(`/ai-demos/ai-cctv-intelligence-security-analytics/app`). It analyses **recorded clips** (not live cameras): object
detection → tracking → zone/line rules → reviewable events → analytics → export.

## What is real and what is not

| Part | Status |
|---|---|
| Object detection on an **uploaded clip** (person, bicycle, car, motorcycle, bus, truck) | **Real model inference** (MB3-CenterNet, COCO) in your browser, or in the optional Node worker |
| Multi-object tracking, zone enter/exit/dwell, line crossing, analytics, CSV/JSON export | Real computation on the stored detections |
| Sample clips (`gate-crossing`, `loading-bay`) | **Synthetic** drawn shapes with **reference annotations**. The banner says "REFERENCE ANNOTATIONS, no AI inference ran". The rules engine still runs for real on them |
| Live / RTSP cameras, webcam | **Not implemented.** Shown as "Not connected" |
| Weapon detection | **Not implemented, never simulated.** Settings shows a notice; events only have a human confirm/dismiss review workflow |
| Face recognition / identity matching | **Never** |
| Real-time, GPU | **No.** Offline sampling (default 4 fps) on CPU/WebGL (browser) or TF.js WASM on CPU (worker) |

The active mode is always shown in the banner above the video, and in every JSON export (`disclosure`). Simulated or
reference data is never substituted silently for model output.

## Using it

1. Open a sample (reference annotations load instantly) or **upload** an MP4/WebM (≤ 40 MB, ≤ 180 s, fictional/licensed/authorised footage only).
2. For an upload press **Run AI detection**. First run downloads the TF.js runtime and a 4 MB model. Progress and ms/frame are shown; **Stop** keeps the partial result.
3. Play, pause, seek, step analysed frames (± 1 s, speed). Boxes and track trails are drawn on the actual video.
4. Filter classes and minimum confidence; draw **zones** (polygon, double-click/Enter/Finish) and **virtual lines** (2 clicks); drag vertices to adjust. Tracking and events are re-computed instantly from the stored detections (no new inference).
5. **Events** tab: filter by type/severity/class/review, click to seek, open details, **Confirm / Dismiss** with a note.
6. **Detections** tab separates *frame-level detections* (a person in 40 frames = 40) from *unique tracked objects* (= 1).
7. Export CSV / JSON. **Reset** deletes the job; **Reset settings** restores defaults. Settings persist in `localStorage`.

## Optional server worker (self-hosted only)

`scripts/cctv-worker.mjs` decodes with **ffmpeg** and runs CenterNet on TensorFlow.js **WASM (CPU)**. It is just another
client of the public API (job token, `POST /frames`, `POST /finalize`). The site starts it for uploads when
`GET /api/cctv/capabilities` reports `workerInference: true` (needs `ffmpeg`/`ffprobe` on PATH and a long-running Node
server). On Vercel (serverless) it is automatically unavailable and the UI offers browser inference only.

```bash
# manual run
CCTV_JOB_TOKEN=<token from POST /api/cctv/jobs> node scripts/cctv-worker.mjs --api http://127.0.0.1:3000 --job <jobId> --file clip.mp4
```

## Tests

```bash
npm run test:cctv          # unit: geometry, tracker, rules, schemas, sniffing, CSV, ids (no server needed)
npm run dev                # (with the Firestore emulator or real Firebase credentials)
npm run test:cctv:api      # API + integration: auth/origin/validation/upload/path traversal/review/export
CCTV_TEST_IMAGE=photo.jpg npm run test:cctv:api   # + real ffmpeg+CenterNet worker run (image you may use)
NODE_PATH=<playwright dir> CCTV_TEST_VIDEO=clip.webm npm run test:cctv:ui   # end-to-end browser test incl. real in-browser inference
npm run cctv:samples       # regenerate the synthetic sample clips + annotations
```

Real footage is not shipped. Use a clip you are licensed to use (for example CC0 footage you downloaded yourself).

Further docs: [ARCHITECTURE](ARCHITECTURE.md) · [API](API.md) · [MODEL](MODEL.md) · [LICENSES](LICENSES.md) · [LIMITATIONS](LIMITATIONS.md)
