# Deployment

The platform ships with the existing Next.js app; no new service. Nothing here deploys anything or incurs cost by itself.

## Requirements
- Node 20+ runtime for `/api/foot/*` (uses `sharp`; the routes set `runtime = "nodejs"`).
- Firestore (production project or emulator). Collections: `foot_sessions`, `foot_captures`, `foot_images`. Images are base64 documents (~0.3–0.6 MB each, under the 1 MiB document limit).
- **HTTPS** – required for the phone camera (`getUserMedia`) and service worker (localhost is exempt).
- Serverless platforms: analysis is ~0.3 s/photo; set a function timeout ≥ 30 s (routes declare `maxDuration = 60`).

## Configuration
See `.env.example`. Only `FOOT_RETENTION_HOURS` is foot-specific (default 72). Firebase credentials are the project's existing ones. Never commit secrets.

## Operations
- `GET /api/foot/health` for monitoring (503 if the DB is unreachable).
- Retention: lazy purge on session creation; for strict retention add a scheduled job that calls the same logic or a Firestore TTL policy on `expiresAt` for the three collections (images/captures would need an `expiresAt` copy).
- The rate limiter is in-memory per instance; use an edge/WAF limit for production.
- CORS: the API is same-origin only (no CORS headers are set; mutating calls check `Origin`).
- Storing many images in Firestore is a demo-grade choice; move `foot_images` to private object storage before real traffic.

## Not done / needs authorisation
Production deploy, DNS and any paid service were not touched.
