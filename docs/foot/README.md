# AI Shoe & Foot Measurement and Fitting Platform

Demo 11 in the Computer Vision & AI portfolio, built inside the Neo Forge Technology Next.js app.

- **Workspace:** `/ai-demos/ai-shoe-foot-measurement-fitting/app`
- **Phone scanner (installable PWA):** `/ai-demos/ai-shoe-foot-measurement-fitting/app/scan` (opened from a QR code)
- **API:** `/api/foot/*` (see [API.md](API.md))

## What it does
Two first-class ways to get a foot into the system:
1. **Camera** – on a phone (QR hand-off) or in the desktop browser, with live guidance.
2. **Upload** – existing JPEG / PNG / WebP photos (several per foot), plus optional **OBJ** scan import.

Measurement = calibrated **top view** with a sheet of **A4 / US Letter paper** as the scale: length, widest width, forefoot (ball) width, heel width, outline area, left-vs-right difference, in mm / cm / in. Then EU / UK / US men's / US women's size estimates with the calculation shown, an adjustable fit allowance, sample style profiles, a 3D viewer, history, a printable report and JSON / CSV export.

## What it deliberately does not do
- No girth, instep, arch height or volume (impossible from one top silhouette; never displayed).
- No guessing without calibration: if the sheet cannot be verified the photo gets a reason, not a number.
- No official brand size charts (none are bundled; the structure to add them with source/date exists).
- No photogrammetry / depth / LiDAR reconstruction (see [AI_MODELS.md](AI_MODELS.md)). The 3D view is **inferred** from the outline, an **imported OBJ** you supply, or a **sample visualization**, and is labelled as such.
- No face or identity analysis.

## Run locally
```bash
npm install
# Firestore: real project credentials, or the emulator
java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar --host 127.0.0.1 --port 8080 &
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx next dev -p 3000
```
Open the workspace URL above and press **Try with sample data**. For camera use off `localhost` you need https. See [DEPLOYMENT.md](DEPLOYMENT.md), [TESTING.md](TESTING.md).

## Layout of the code
| Path | Role |
|---|---|
| `src/lib/foot/vision.ts` | Paper detection, homography, rectification, segmentation, measurement (pure TypeScript, runs in browser and server) |
| `src/lib/foot/sizing.ts` | Size rules, width heuristic, sample profiles, brand-chart structure |
| `src/lib/foot/mesh.ts` | OBJ parsing/measurement with limits |
| `src/lib/foot/synthetic.ts` | Synthetic scene generator for tests/samples |
| `src/lib/foot/server.ts`, `src/app/api/foot/**` | Storage, auth, intake pipeline, routes |
| `src/components/demos/foot/*` | Workspace, camera, review/corner editor, viewer, phone scanner |
| `public/foot/samples/` | Synthetic test photos (rendered, not photographed) |

## Implementation checklist
- [x] Calibrated paper-based measurement engine, parallax correction with reported uncertainty
- [x] Camera capture with live guidance, permission/unsupported handling, camera switch, track cleanup
- [x] Upload with type/size validation, previews, progress, retry, left/right assignment, delete
- [x] Phone QR hand-off (30-minute capture-only token), PWA manifest + service worker
- [x] Manual four-corner correction preserving the original result
- [x] OBJ import (declared units, limits) and Three.js viewer with labels
- [x] Sizing engine (EU/UK/US M/US W, allowance, explanation, larger-foot notes)
- [x] Sessions, history, report, CSV/JSON export, delete, retention
- [x] Tests: unit (geometry/sizing/mesh), API integration, browser UI (fake camera)
- [ ] Not built: real 3D reconstruction, depth/LiDAR, brand charts, accounts, native apps
