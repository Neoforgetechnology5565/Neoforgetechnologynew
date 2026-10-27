# HTTP API (`/api/bim`)

All writes require same-origin (`Origin` header), are rate limited per IP, and reply with `{ "error": "…" }` (and `issues[]` for validation errors). Authorisation headers: `x-bim-key` (owner), `x-bim-share` (viewer/reviewer), optional `x-bim-version` (read a specific review version). The machine-readable description is served at **`GET /api/bim/openapi`**.

| Method & path | Role | Purpose |
|---|---|---|
| `GET /health` | – | status, limits, engines and their honest support notes |
| `GET /samples?demo=` | – | bundled sample definitions |
| `POST /projects` `{demo,name}` | – | create; returns `key` **once** |
| `POST /projects/list` `{items:[{id,key}],demo}` | owner | summaries for saved projects |
| `GET/PATCH/DELETE /projects/{id}` | viewer / owner / owner | project, rename + settings, delete (blobs and issues too) |
| `POST /projects/{id}/samples` `{sample}` | owner | load a bundled sample (review samples also register versions and create sample issues) |
| `GET/POST /projects/{id}/files`, `DELETE …/files/{fid}` | viewer/owner | multipart upload (`file`, `role`), content validation, ≤ 25 MB, ≤ 12 files |
| `POST /projects/{id}/process` `{settings}` | owner | run the processor (staged job, real timings) |
| `GET /projects/{id}/jobs` | viewer | job history |
| `GET /projects/{id}/model[?meta=1]` | viewer | stored result (gzip as stored) |
| `POST /projects/{id}/history` `{version|reset}` | owner | restore earlier settings / reset and regenerate |
| `GET/POST …/components`, `GET …/components/{eid}` | viewer / owner | element search, properties, edit overrides (plan models) |
| `POST …/clashes`, `POST …/measurements` | viewer | re-run clash detection with other clearance; distances, polygon areas, element measures |
| `GET/POST …/exports`, `GET …/artifacts/{aid}` | viewer / owner | export list, generate, protected download |
| `GET/POST …/versions`, `GET …/versions/{vid}/model`, `GET …/compare?a=&b=` | viewer / owner | review versions and comparison |
| `GET/POST …/issues`, `GET/PATCH/DELETE …/issues/{iid}`, `POST …/issues/{iid}/comments` | viewer / reviewer / owner | issue tracking |
| `GET/POST/DELETE …/views` | viewer / reviewer / owner | saved camera views |
| `GET/POST/DELETE …/shares` | owner | share keys (viewer / reviewer); key shown once; revocation |
| `GET …/activity`, `GET …/report?format=csv|json|html` | viewer | activity log, downloadable issue report |

## Settings (`PATCH /projects/{id}`, `POST …/process`)
Plan models: `unitsOverride, layerMap, wallMode, defaultWallThickness, thicknessRange, wallHeight, storeys, floorThickness, roofType, roofPitchDeg, parapet, doorHeight, doorWidth, windowSill, windowHeight, mep[], clearance, clashTolerance, svgUnitsPerMetre, rasterPxPerMetre, overrides`. Every demonstration also accepts `params` (≤ 40 KB, validated by the processor): rule set and required properties (QC), rates/waste/markups (QTO), thresholds (floor plan), layer roles and assumptions (structural), outlier/voxel/plane parameters (point cloud).

## Security measures
Content-based file validation; size/count limits; SVG with scripts rejected; owner and share keys hashed; protected downloads (authorised, `no-store`); same-origin writes; rate limits; expiry and cleanup; zod validation on every body; error messages never contain file contents or keys.
