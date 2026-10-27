# Neo Forge CAD / BIM Suite — 11 full-stack demonstrations

Built inside the Neo Forge Technology Next.js app. Every demonstration has its own interface and a real server-side pipeline: files are uploaded and validated by content, stored, parsed with real readers, processed in staged jobs, persisted, and exported. Nothing on screen is a hard-coded result; sample files are **synthetic with known content** and are labelled as samples everywhere.

- **Index:** `/cad-bim-suite` — **Apps:** `/cad-bim-suite/<slug>/app` — **API:** `/api/bim/*` ([API.md](API.md), OpenAPI at `/api/bim/openapi`)
- **Health:** `GET /api/bim/health`

| # | Application | Slug | Input | Main output |
|---|---|---|---|---|
| 1 | 2D plan → interactive 3D building model (+ MEP/HVAC, clashes) | `plan-to-3d-building-model` | DXF, SVG, PNG/JPG, IFC | 3D model, IFC4, GLB, DXF, CSV, PDF |
| 2 | CAD drawing analysis & conversion | `cad-drawing-analysis-conversion` | ASCII DXF, SVG | layers/entities/units, validation, SVG/GeoJSON/CSV/DXF/JSON |
| 3 | BIM model viewer & information explorer | `bim-model-viewer` | IFC2X3/IFC4 | tree, properties, quantities, 3D |
| 4 | Point cloud & scan-to-BIM analysis | `point-cloud-scan-to-bim` | LAS, PLY, XYZ/CSV | statistics, planes, dimensions, room draft IFC |
| 5 | CAD-to-BIM interoperability | `cad-to-bim-interoperability` | DXF/SVG/image/IFC | verified conversions + loss report |
| 6 | Architectural floor-plan analysis | `floor-plan-analysis` | DXF, SVG, PNG/JPG | room/wall/opening schedules, findings |
| 7 | Structural drawing analysis | `structural-drawing-analysis` | ASCII DXF (+ 2nd revision) | columns/beams/grids/footings, drafting checks, revision diff |
| 8 | MEP & HVAC coordination | `mep-hvac-coordination` | DXF + MEP DXF, IFC | systems, networks, clash matrix |
| 9 | BIM validation / quality control | `bim-quality-control` | IFC | configurable rule results |
| 10 | Quantity take-off & cost estimate | `quantity-takeoff-cost-estimate` | DXF/SVG/image/IFC | BOQ with basis, waste, rates, markups |
| 11 | Collaboration, issues & model review | `bim-project-review-issues` | IFC revisions | versions, comparison, issues, comments, roles, reports |

## What is deliberately not done
- **No fabricated engineering values.** No airflow, pressure, load, capacity, structural adequacy, fire rating or code compliance is calculated or implied anywhere. MEP sizes/elevations that a 2D drawing does not carry come from configuration and are marked *assumed*.
- **No proprietary-format claims.** DWG, LAZ, E57, PDF plans, binary DXF, IFCZIP are rejected or flagged with the conversion route; they are never silently "supported".
- **Raster plans** are *interpreted* (axis-aligned thick strokes) and say so. Scale is asked for, never guessed, for SVG and images.
- **Rates in the cost estimate are placeholders**, labelled as such on every screen and report.
- **No accounts.** Review projects use an owner key plus share keys (viewer / reviewer). BCF, live co-editing and notifications are not implemented.

See [ENGINEERING_ACCURACY.md](ENGINEERING_ACCURACY.md) for methods and limits, [TESTING.md](TESTING.md) for what was tested (and what was real vs synthetic), [ARCHITECTURE.md](ARCHITECTURE.md), [LIBRARIES.md](LIBRARIES.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Run locally
```bash
npm install
# Firestore: use the emulator (no credentials needed) or your own project
firebase emulators:start --only firestore        # or any Firestore reachable by firebase-admin
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run dev
# open http://localhost:3000/cad-bim-suite
```
Regenerate the bundled sample files in `public/bim/samples` with `npx tsx scripts/make-bim-samples.ts`.

## Tests
```bash
npm run test:bim          # engine/unit tests with ground-truth files (no server)
npm run test:bim:api      # HTTP API tests, demonstrations 1-10 + collaboration (needs server + Firestore)
npm run test:bim:ui       # Playwright UI tests (needs NODE_PATH to playwright)
python3 scripts/validate-bim-outputs.py out.ifc out.dxf out.glb   # optional independent validators (ifcopenshell, ezdxf)
```
