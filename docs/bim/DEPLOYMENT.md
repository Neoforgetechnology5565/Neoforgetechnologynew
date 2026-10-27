# Deployment

The suite is part of the main Next.js application; there is nothing separate to deploy.

## Requirements
- Node 20+, the project's `npm install`.
- A Firestore database reachable by `firebase-admin` (same credentials as the rest of the app) — or the Firestore emulator for local work (`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`).
- No extra binaries. `web-ifc` ships its WASM; `sharp` ships prebuilt binaries.

## Environment variables
| Variable | Default | Meaning |
|---|---|---|
| `BIM_RETENTION_HOURS` | 72 | Hours before a project (files, models, issues) is deleted automatically |
| standard Firebase admin variables | – | as already used by the site (never commit them) |

## Build and run
```bash
npm run build && npm start
```
`/api/bim/health` returns `{ ok: true, limits, engines }` for load-balancer or uptime checks.

## Capacity notes
- Upload limit 25 MB per file, 80 MB per project, 12 files per project.
- Processing runs inside the request (`maxDuration` 60–120 s on heavy routes). Hosts with shorter function limits need either a longer limit on these routes or a worker/queue in front of `processProject`; the processors themselves are pure functions.
- Firestore stores blobs as gzip + base64 chunks. Many large projects increase storage cost; lower `BIM_RETENTION_HOURS` or move blobs to object storage by replacing `putBlob/getBlob/deleteBlob` in `src/lib/bim/server.ts` (the only storage touch points).
- Rate limits are in-memory per instance (`src/lib/ratelimit`); behind several instances, add a shared limiter at the edge.

## Not done here
No production deployment, DNS change, paid service or secret was created or modified while building the suite.
