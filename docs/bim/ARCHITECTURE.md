# Architecture

```
Browser (Next.js client components, Three.js, SVG)
   │  fetch / XHR (upload progress)           x-bim-key  |  x-bim-share  |  x-bim-version
   ▼
Next.js route handlers  /api/bim/*   (runtime: nodejs, maxDuration on heavy routes)
   │   zod validation · same-origin check on writes · per-IP rate limits · key/role authorisation
   ▼
src/lib/bim   pure TypeScript engines (no I/O)  ── parsers · interpreters · exporters
   │
   ▼
Firestore (firebase-admin)   bim_projects · bim_blobs · bim_issues
```

## Storage
| Collection | Content |
|---|---|
| `bim_projects` | One document per project: demo key, name, owner-key **hash**, settings, file metadata, artifact metadata, job records (real stage timings), model metadata, versions, share-key **hashes**, activity, expiry. |
| `bim_blobs` | Uploaded files, processed models and generated exports. gzip-compressed, split into ≤ 600 KB base64 chunks (Firestore documents are limited to 1 MiB). |
| `bim_issues` | Review issues and saved views (demonstration 11), keyed by `projectId`. |

Projects expire after `BIM_RETENTION_HOURS` (default 72); `purgeExpired` runs on project creation; deleting a project deletes all its blobs and issues. Keys are 24-char random strings, shown once; only SHA-256 hashes are stored.

## Request lifecycle (processing)
1. `POST /projects` → project + owner key. 2. `POST /projects/{id}/files` (multipart) → content validation (`validate.ts`: bytes decide the format, not the extension; size ≤ 25 MB; scripts in SVG rejected). 3. `POST /projects/{id}/process` → `processProject` runs the demonstration's processor in staged steps recorded with real timings (`stager`). The result model is stored as a blob and summarised in `modelMeta`. A failure keeps the previous model. 4. `GET /model`, `/components`, `/clashes`, `/measurements` read the stored model. 5. `POST /exports` generates an export from the stored result into a downloadable artifact.

Jobs run inside the request (≤ 120 s, `maxDuration`). The samples finish in 0.5–6 s locally; there is no external queue, so very large uploads are bounded by the file-size limit rather than queued. This is stated rather than hidden: a production deployment with larger files would move `processProject` to a worker/queue — the processor functions are pure and already separated from the HTTP layer.

## Engines (`src/lib/bim`)
| Area | Files |
|---|---|
| DXF | `dxf.ts` parser (ASCII; blocks exploded with scale/rotation; `$INSUNITS`), R12 writer |
| 2D → 3D | `plan.ts` (walls, openings, rooms, columns, stairs), `build.ts`, `mesh.ts`, `svg.ts`, `raster.ts` |
| MEP | `mep.ts` (layer config, annotations, networks), `mepmesh.ts` |
| Clash | `clash.ts` (OBB SAT, round-round, slab prism; hard vs clearance; severity) |
| IFC | `ifcwrite.ts` (IFC4 writer), `ifcread.ts` (web-ifc) |
| Exports | `glb.ts`, `dxfout.ts`, `csv.ts`, `pdf.ts`, `report.ts`, `demos/exports.ts` |
| Demonstrations | `demos/{cad,viewer,cloud,interop,floorplan,structural,mepcoord,qc,qto}.ts`, `pointcloud.ts`, `cadanalysis.ts`, `compare.ts`, `collab.ts` |
| Orchestration | `pipeline.ts` (`runPlan3d`), `demos/index.ts` (`runDemo`), `process.ts`, `server.ts` |

Demonstrations 1, 3, 5, 6, 8, 9, 10 share the **plan/IFC → model** result (`Plan3dModel`) with an `ext` block (headline numbers, tables, findings); demonstrations 2, 4, 7 produce an `AnalysisModel`. Demonstration 11 stores versions (each a processed IFC model) and issues.

## Conventions
Lengths in metres, Z up. The viewer root is rotated −90° about X (model → three.js: `(x, y, z) → (x, z, −y)`); glTF export converts the same way; web-ifc returns Y-up and the reader converts back.

## Front end
`DemoApp` (demonstrations 2–10), `Plan3dApp` (1), `CollabApp` (11); shared `ModelWorkspace` (3D with layers/MEP/section/walkthrough/measure/properties), `PlanView2D`, `Preview2D`, `MeshViewer`, `CloudViewer`, `AnalysisPanel`. Style: Georgia, the site's existing logo and header, dark application chrome.
