# Architecture

```
 Browser (CctvPlatform)                          Next.js API (/api/cctv/*)                 Firestore
 ┌───────────────────────────┐   box coords only   ┌──────────────────────────┐   cctv_jobs / cctv_frames
 │ <video> + canvas overlay  │ ───────────────────►│ validate (zod), token    │◄────────────────────────►
 │ Detector (interface)      │  POST /jobs/:id/    │ store raw detections     │
 │  └ HumanCenterNet (TF.js) │  frames, /finalize  │ analyze(): tracker +     │
 │ seek→canvas→detect loop   │◄────────────────────│  zone/line events+stats  │
 └───────────────────────────┘  GET /results       └──────────▲───────────────┘
                                                              │ same API, job token
                                             scripts/cctv-worker.mjs (ffmpeg + Human node-wasm), optional
```

* **Stateless analysis.** Only *raw* detections are stored (`cctv_frames`, batches of ≤ 100 frames). Tracks, events and
  statistics are recomputed on every read by the pure function `analyze()` (`src/lib/cctv/analyze.ts`). Changing
  settings therefore never needs new inference, and review decisions survive because event IDs are deterministic
  (`type-track-frame-zone/line`) and reviews live in the job document.
* **Modular detector.** The UI depends on `Detector` (`src/components/demos/cctv/detector.ts`): `load()`, `detect(canvas)`,
  `dispose()`. `HumanCenterNet` is the only implementation. A licensed YOLO build could be added behind the same interface
  (see MODEL.md for the AGPL note).
* **Tracking** (`tracker.ts`): per-class greedy association by IoU / centre distance with constant-velocity prediction,
  `maxAge` and `minHits`. Appearance is not used, no re-identification, no faces.
* **Rules** (`analytics.ts`): zone state per track (enter/exit/dwell) and line side per track (crossing + direction),
  evaluated on the box's bottom-centre ground point in **video time**. Adapted from VisionGuard (MIT).
* **Coordinates** are normalised (0..1) everywhere (boxes, zones, lines), so rules are resolution independent.
* **Job lifecycle:** `created → receiving/processing → ready | failed`; jobs expire after 24 h (opportunistic cleanup on
  job creation). Uploaded files live in the OS temp dir (`neoforge-cctv/`, mode 0600) for ≤ 60 min.
* **Modes:** `reference` (bundled synthetic annotations), `browser` (client inference), `worker` (server inference).
