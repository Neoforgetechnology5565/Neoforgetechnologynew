# Libraries and research notes

Checked in this repository on the date of the build (versions from `node_modules`, licences from each `package.json`).

| Component | Used for | Version | Licence | Notes |
|---|---|---|---|---|
| **web-ifc** | Reading IFC (tree, properties, quantities, triangulated geometry) | 0.0.78 | MPL-2.0 | Runs in Node (WASM) on the server. Pre-1.0 API; actively maintained by the ThatOpen community. MPL-2.0 is file-level copyleft: modifications to web-ifc itself must be shared; using it unmodified does not affect this code's licence. |
| **three** | 3D rendering (BIM scene, point clouds) | 0.170.0 | MIT | Browser only. |
| **sharp** | Rasterising SVG for the raster-plan sample, test image prep | 0.35.5 | Apache-2.0 | Server only. |
| **zod** | Request validation | 4.6.5 | MIT | |
| **firebase-admin** | Firestore persistence | 14.5.0 | Apache-2.0 | Works against the Firestore emulator for local runs. |
| **Next.js / React** | Application framework | 15.5.27 / 19.3.0 | MIT | |
| ifcopenshell | *Dev-only* independent IFC validation | 0.9.0 | LGPL-3.0 | Not shipped or imported by the app; used by `scripts/validate-bim-outputs.py`. |
| ezdxf | *Dev-only* DXF audit | 1.4.5 | MIT | Same. |

## Written in this repository (instead of adding a dependency)
- **DXF parser/writer** (ASCII; LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE, TEXT/MTEXT, INSERT with ATTRIB, DIMENSION, 3DFACE/SOLID, POINT, SPLINE → control polygon). Validated against ezdxf's audit.
- **IFC4 writer** (STEP), validated with ifcopenshell. **GLB writer**, **PDF writer**, **LAS/PLY/XYZ readers and writers**, RANSAC plane fitting, SAT clash tests.

## Evaluated and not used
| Option | Why not |
|---|---|
| **DWG** (LibreDWG, ODA/Teigha, Autodesk APS) | LibreDWG is GPL-3.0 (incompatible with this closed-source app); ODA and APS are commercial/cloud services needing licences or credentials. DWG is therefore *not supported*: the UI says to convert to DXF. |
| **LAZ / E57** | No verified permissively licensed reader for Node was integrated; converting to LAS/PLY is documented. |
| **PDF → vector plan** | Needs content-stream interpretation or OCR; reliable results are not achievable generically, so PDF plans are not converted. |
| **That Open Engine components, IfcOpenShell WASM** | Heavier dependency chains than needed; web-ifc covers the read path. |
| **OpenCascade / Rhino3dm / Assimp** | Not needed for the supported formats. |
| **BCF libraries** | Not implemented; issues export as CSV/JSON/HTML. |

Licence texts: see each package in `node_modules`, and [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
