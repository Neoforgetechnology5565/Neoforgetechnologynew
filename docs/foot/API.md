# API (`/api/foot`)

JSON unless noted. Mutating requests must be same-origin. Auth headers: `x-foot-key` (owner) or `x-foot-phone` (capture-only token). Errors: `{ "error": "…" }`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | – | DB status, limits, retention, rule-set id, processing/reconstruction notes |
| `POST /sessions` `{name?,paper,fit}` | – | Create. Returns `{session,key}`; **key is shown once** |
| `POST /sessions/list` `{items:[{id,key}]}` | keys | Summaries for still-valid sessions (history) |
| `GET /sessions/{id}` | owner/phone | Session summary |
| `PATCH /sessions/{id}` | owner | name, paper, fit, `activeCapture{left,right}` |
| `DELETE /sessions/{id}` | owner | Deletes session, captures and images |
| `POST /sessions/{id}/phone-link` / `DELETE` | owner | Mint (30 min, capture-only) / revoke phone token |
| `GET /sessions/{id}/captures` | owner/phone | List captures |
| `POST /sessions/{id}/captures` multipart `file, side, source, paper` | owner/phone | Validate → decode → calibrate → measure; returns the capture with `auto` analysis and stage events. 8 MB; JPEG/PNG/WebP by magic bytes; max 24 per session, 10 per side |
| `GET/PATCH/DELETE /sessions/{id}/captures/{cid}` | owner | read; `{use,side}`; delete |
| `GET …/captures/{cid}/image` | owner | Stored JPEG (`private, no-store`) |
| `POST/DELETE …/captures/{cid}/calibration` `{corners[4],paper}` | owner | Re-measure from manual corners (original preserved) / discard |
| `POST /sessions/{id}/samples` `{side,lengthMm?,widthMm?}` | owner | Demo: synthetic scene through the real pipeline; labelled `sample` with known truth |
| `POST /sessions/{id}/mesh?side&unit&filename` (text/plain OBJ) / `DELETE` | owner | Measure an OBJ (≤12 MB, ≤400k vertices); only the measurement is stored |
| `POST /sessions/{id}/process` | owner | Finalise; returns real stage events + results. 409 if nothing was measured |
| `GET /sessions/{id}/status` | owner/phone | Session + per-capture job status/stages |
| `GET /sessions/{id}/results?fit&allowanceMm` | owner | Per-side results, comparison, size, width class, sample-profile recommendations |
| `POST /sessions/{id}/recommendations` `{fit,allowanceMm?,profileId?}` | owner | Recommendations with rule-set text and disclaimer |
| `GET /sessions/{id}/report?format=json|csv` | owner | Download report |
| `GET /sw` | – | Service worker for the phone scanner |

Job statuses: `Uploading, Validating, Preparing, Calibrating, Measuring, Completed, Failed` (per capture), plus `Generating recommendations` (process). `Reconstructing` is never emitted: nothing is reconstructed.
Rate limits are per client IP (in-memory limiter). The in-memory limiter is per server instance.
