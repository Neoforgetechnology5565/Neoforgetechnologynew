# Factory Workforce Detection, Tracking & PPE Monitoring (Computer Vision demo no. 2)

An interactive Computer Vision demonstration: it **detects workers, tracks them, detects hard hats and safety vests, associates them with workers and reports a cautious per-worker assessment**. Frontend `src/components/ppe/*`, minimal backend `services/ppe-monitor/` (FastAPI). No database, no HR/payroll/attendance/incident features, no identity matching.

Route: `/ai-demos/ai-factory-workforce-ppe-compliance/app`.

## What is real
| Part | How |
|---|---|
| Worker detection | YOLOX-tiny (Apache-2.0), COCO class "person", on every processed frame |
| Tracking | ByteTrack (own implementation, shared with the vehicle demo): IDs persist through short occlusion, new IDs for new tracks, no per-frame recounting |
| Hard hat / vest detection | Intel `worker_safety_mobilenet` (BSD-3-Clause) run on a crop around each worker. It is a real PPE model; see `MODEL_AND_LICENSES.md` for what is and is not known about it |
| Association and assessment | project code (`services/ppe-monitor/app/ppe.py`): PPE boxes must sit where the item would sit on that worker; "not detected" is concluded only from a good view and consistent evidence; otherwise "uncertain" |
| Sample | Intel's 65 s corridor clip (BSD-3-Clause repo). On a site without the service, the demo opens a **stored result of a real run** of the service on this clip, labelled as such |

## What it does not do
Gloves, goggles, masks, boots and harnesses are not detected (the model has no such classes). No face recognition, no identity or cross-video matching. No claim of guaranteed safety, no accuracy figures (none were measured against ground truth), not production-ready. See `LIMITATIONS.md`.

## Assessment per worker
`Compliant` – every required item detected consistently · `Potential PPE violation` – a required item was **not detected** from a view good enough to have seen it, consistently over time · `Uncertain` – everything else (small, cut off, partly hidden, weak detection, track too new, no consistent evidence). Required items are configurable (hard hat, vest).

Documents: `ARCHITECTURE.md`, `API.md`, `MODEL_AND_LICENSES.md`, `LIMITATIONS.md`, `TESTING.md`, `DEPLOYMENT.md`.
