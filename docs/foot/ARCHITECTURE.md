# Architecture

```
Phone (PWA)  ─┐                     ┌─ Firestore: foot_sessions / foot_captures / foot_images
Desktop UI  ──┼─► Next.js /api/foot ┤
Upload      ─┘    (Node runtime)    └─ sharp (decode, downscale) ─► vision.ts (measure)
```

## Decisions
- **TypeScript end to end, no Python service.** The measurement engine is dependency-free TypeScript, so the *same* paper detector powers live phone guidance and the server measurement. It fits the existing Next.js/Firebase deployment (no extra host).
- **Process at upload, synchronously.** Analysis takes ~0.2–0.5 s per photo, so each upload request validates, decodes, calibrates and measures, and returns the full result. There is **no background worker**; heavy reconstruction (photogrammetry) is out of scope and would need one (see AI_MODELS.md).
- **Stages are real.** Uploading → Validating → Preparing → Calibrating → Measuring → Completed/Failed are timestamped as they happen and stored with the capture. The session-level *process* step records Validating / Calibrating / Measuring / Generating recommendations / Completed. "Reconstructing" is unused because nothing is reconstructed.
- **Privacy by design.** Only a ≤1400 px JPEG (and a 240 px thumbnail) is stored; the original is not retained. Images live in a separate collection, are served only with the owner key, `Cache-Control: private, no-store`.
- **Access model.** `POST /sessions` returns a random 48-hex *owner key* once; only its SHA-256 is stored. Session ids are 128-bit random. A *phone token* (separate, 30 min, capture-only: read session summary, list captures, upload) is placed in the URL **fragment** of the QR link so it is not sent to servers or logged, and is removed from the address bar on load. Phone tokens can be revoked.
- **Retention.** `FOOT_RETENTION_HOURS` (default 72). Expired sessions are purged lazily on session creation; users can delete any time.
- **Original vs corrected.** Each capture keeps `auto` (never mutated) and optional `manual` (re-measured from user-placed paper corners) and a `use` switch.
- **Same-origin POSTs, rate limits** reuse the project's existing helpers.

## Data model (Firestore)
- `foot_sessions/{id}` – ownerHash, phoneHash/phoneExp, name, paper, fit, status, events[], activeCapture{left,right}, meshes[] (measurements only), timestamps, expiresAt.
- `foot_captures/{id}` – side, source (camera|upload|sample), image size, thumb, `auto`, `manual`, `use`, job events, optional sampleTruth.
- `foot_images/{captureId}` – base64 JPEG (≤1400 px).
The spec's MeasurementSession / FootCapture / FootMeasurement / FootwearRecommendation / ReconstructionAsset map to: session, capture, `Analysis.measurement`, computed recommendations (not stored), and `meshes[]` (imported-OBJ measurements).
