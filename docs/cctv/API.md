# API reference (`/api/cctv`)

All JSON. Errors: `{ "error": "message", "issues"?: [...] }` with 400 validation, 403 origin/token, 404 missing/expired,
409 not ready/finalised, 413 too large, 415 unsupported type, 422 undecodable video, 429 rate limit, 501 unavailable.
Mutating browser calls need a same-origin `Origin` header. Job-scoped writes need the job token in `X-Job-Token`
(returned once by `POST /jobs`, stored only as a SHA-256 hash).

| Method & path | Purpose |
|---|---|
| `GET /health` | DB + capability probe (503 if the database is unreachable) |
| `GET /capabilities` | ffmpeg/worker availability, limits, detector, RTSP/weapon/GPU/real-time flags (always honest) |
| `GET /samples` | Bundled synthetic sample clips |
| `GET /settings` | Defaults, limits, supported classes, schema notes |
| `POST /videos/upload` | multipart `file`. Magic-byte sniff (mp4/webm), ≤ 40 MB, ffprobe decode check + ≤ 180 s when available. Returns `videoId`. 6 uploads / 10 min / IP |
| `POST /jobs` | `{source:{type:"sample",id}\|{type:"upload",videoId?,name?}, mode:"reference"\|"browser"\|"worker", meta:{durationSec,width,height}, settings?}` → job + `token` |
| `GET /jobs/:id` | Status, progress (`framesReceived/expectedFrames`), settings, detector, mode |
| `POST /jobs/:id/frames` 🔑 | `{frames:[{i,t,dets:[{cls,conf,box:[x,y,w,h]}]}]}` ≤ 100 frames, idempotent per frame index |
| `POST /jobs/:id/finalize` 🔑 | `{ok?, error?}` → status `ready` (or `failed`) |
| `POST /jobs/:id/process` 🔑 | Start the Node worker for an uploaded worker-mode job (501 where unavailable) |
| `POST /jobs/:id/analyze` 🔑 | Partial settings update → re-run tracking + events on stored detections → full results |
| `GET /jobs/:id/results` | `{job, frames, tracks, events, stats}`; `stats` keeps frame-level `detectionsTotal` and `uniqueTotal` separate |
| `GET /jobs/:id/events` | Filters: `type`, `severity`, `cls`, `review`, `min_conf` |
| `GET /jobs/:id/events/:eid` | Event + its track |
| `PATCH /jobs/:id/events/:eid` 🔑 | `{review:"confirmed"\|"dismissed"\|"unreviewed", note?}` |
| `GET /jobs/:id/export?format=csv\|json` | Events CSV (formula-injection safe) or full JSON incl. `disclosure` |
| `DELETE /jobs/:id` 🔑 | Delete job + stored detections |

🔑 = needs `X-Job-Token`. Settings: `classes`, `minConf (0.05–0.99)`, `sampleFps (1–10)`, `zones` (≤ 4 polygons of 3–12
points), `lines` (≤ 4), `trackMaxAgeSec`, `minTrackHits`. Event types: `object_first_seen`, `zone_enter`, `zone_exit`,
`zone_dwell`, `line_cross`. Severities: `info`, `notice`, `review`. Review: `unreviewed`, `confirmed`, `dismissed`.
