# LiDAR point-cloud service

FastAPI service behind the **LiDAR Point Cloud & Wire Measurement** demo: loads PLY / PCD / LAS / LAZ / XYZ clouds, preprocesses, classifies (provided labels or heuristics), detects wire-like candidates and measures distances in the cloud's own coordinates. Documentation: `docs/lidar/`.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8070     # then set LIDAR_API_URL=http://localhost:8070 for the Next.js site
pytest                               # service tests (no downloads; the corridor test scene is generated)
```
Coordinates stay float64 on the server. Units are read from the LAS header when present and never assumed otherwise. State is in memory with a TTL; nothing is written to a database.
