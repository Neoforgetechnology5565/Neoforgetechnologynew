# Spatial mapping and 3D reconstruction service

FastAPI + COLMAP (pycolmap, CPU) + Depth Anything V2 Small (ONNX) + NumPy/SciPy/trimesh. Estimates camera poses and a sparse 3D map from video or images, adds relative depth and an approximate densified cloud and mesh, processes point clouds, and exports. Nothing else. See `docs/spatial/`.

```bash
pip install -r requirements-dev.txt
python scripts/fetch_models.py      # depth model (99 MB), not committed
uvicorn app.main:app --port 8030
pytest                              # fast; add `-m slow` for the real reconstruction
```
