# API (service port 8070; the browser calls it through `LIDAR_API_URL`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | status and limits |
| GET | `/api/samples` | bundled samples with provenance |
| POST | `/api/pointcloud/upload` | multipart `file`; returns summary |
| POST | `/api/pointcloud/from-sample` | `{id}` |
| GET | `/api/pointcloud/{cid}/summary` | counts, bbox, units, versions |
| DELETE | `/api/pointcloud/{cid}` , `/versions/{vid}` | remove |
| POST | `/api/pointcloud/{cid}/units` | declare units (`unit`, or per-axis) |
| POST | `/api/pointcloud/{cid}/preprocess` | voxel / sor / ror / crop / normals → new version |
| POST | `/api/pointcloud/{cid}/classify` | `mode`: provided or heuristic |
| POST | `/api/pointcloud/{cid}/detect-wires` | parameters in the cloud's unit |
| GET | `/api/pointcloud/{cid}/wires` | candidate list with fit data |
| POST | `/api/pointcloud/{cid}/measure` | `type`, operand ids/points, optional `threshold` |
| GET/DELETE | `/api/pointcloud/{cid}/measurements[/{mid}]` | list / remove |
| GET | `/api/pointcloud/{cid}/points/meta`, `/points/data` | viewer buffers |
| GET | `/api/pointcloud/{cid}/export?kind=ply\|measurements.csv\|measurements.json\|wires.json` | downloads |

Errors: 400 invalid input, 404 unknown id, 413 too large, 415 unsupported format, 422 parameter errors, 429 busy, 500 generic.
