"""Local HTTP API used by the desktop UI. It listens on 127.0.0.1 only. Heavy work happens in job worker processes (see jobs.py)."""
from __future__ import annotations

import json
import os
import shutil
import struct
import tempfile
import time
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import __version__, clean as C, formats as FM, reconstruct as R, refine as F
from .exporter import export_stage
from .jobs import JobManager
from .model import Cloud, Mesh
from .pipeline import report_for
from .presets import BASE_CLEAN, BASE_COLOR, BASE_RECON, BASE_REFINE, PRESETS, preset
from .project import Project, STAGES, cleanup_stale, home, summary
from .sample import make_sample

app = FastAPI(title="PhotoMesh Studio engine", version=__version__)
jobs = JobManager()
_preview_cache: dict[tuple, bytes] = {}
_report_cache: dict[tuple, dict] = {}
MAX_UPLOAD = int(os.environ.get("PGS_MAX_UPLOAD_MB", "2048")) * 1024 * 1024


def proj(pid: str) -> Project:
    try: return Project.open(pid)
    except KeyError: raise HTTPException(404, "Project not found.")


def view(p: Project) -> dict:
    s = p.state; e = p.entry
    return {"id": p.id, "name": s["name"], "info": s.get("info", {}), "stages": {k: v["summary"] | {"file": v["file"]} for k, v in e["stages"].items()}, "can_undo": s["pointer"] > 0, "can_redo": s["pointer"] < len(s["history"]) - 1,
            "history": [{"id": h["id"], "label": h["label"], "op": h["op"], "seconds": h["seconds"], "time": h["time"], "current": i == s["pointer"], "future": i > s["pointer"]} for i, h in enumerate(s["history"])], "entry_report": e.get("report", {})}


# ------------------------------------------------------------------------------------------------------------- system
@app.get("/api/health")
def health(): return {"ok": True, "version": __version__}


def _gpu() -> dict:
    try:
        import open3d as o3d
        cuda = bool(o3d.core.cuda.is_available()); return {"cuda": cuda, "open3d": o3d.__version__, "note": "CUDA available to Open3D." if cuda else "This build runs on the CPU. The pip build of Open3D has no GPU reconstruction; CPU is used for every algorithm."}
    except Exception as e: return {"cuda": False, "note": f"Open3D unavailable: {e}"}


@app.get("/api/capabilities")
def capabilities():
    import importlib
    def have(m):
        try: importlib.import_module(m); return True
        except Exception: return False
    gpu = _gpu(); usd = have("pxr"); las = have("laspy"); lazrs = have("lazrs")
    return {"version": __version__, "gpu": gpu, "cpu_count": os.cpu_count(), "workspace": str(home()),
            "import": {".ply": True, ".obj": True, ".stl": True, ".pcd": True, ".xyz": True, ".xyzn": True, ".xyzrgb": True, ".pts": True, ".glb": True, ".gltf": True, ".las": las, ".laz": las and lazrs, ".usdz": usd, ".usd": usd, ".usda": usd, ".usdc": usd},
            "reconstruction": R.METHODS, "smoothing": {"laplacian": True, "taubin": True, "bilateral": True, "regularize": True, "curvature_aware": True},
            "refinement": {"decimate": True, "fill_holes": True, "non_manifold": True, "normals": True, "remesh": True, "refine_edges": True, "small_components": True, "degenerate": True, "optimize": True, "subdivision_preview": True},
            "unavailable": [{"name": "Texture atlas re-baking", "reason": "Not implemented. Texture maps are preserved only while the topology is unchanged (smoothing); after decimation or reconstruction colours are baked to vertices."},
                            {"name": "GPU acceleration", "reason": gpu["note"]}, {"name": "UV unwrapping of new meshes", "reason": "Not implemented."}],
            "export": FM.EXPORT_FORMATS, "orientations": list(FM.ORIENT)}


@app.get("/api/presets")
def presets(): return {k: {"label": v["label"], "description": v["description"]} for k, v in PRESETS.items()}


@app.get("/api/presets/{name}")
def preset_get(name: str):
    try: return preset(name)
    except KeyError as e: raise HTTPException(404, str(e))


@app.get("/api/defaults")
def defaults(): return {"clean": BASE_CLEAN, "reconstruct": BASE_RECON, "refine": BASE_REFINE, "color": BASE_COLOR}


# ----------------------------------------------------------------------------------------------------------- projects
class NewProject(BaseModel):
    name: str = "Untitled project"


@app.post("/api/projects")
def new_project(b: NewProject):
    cleanup_stale(); return view(Project.create(b.name))


@app.get("/api/projects/{pid}")
def get_project(pid: str): return view(proj(pid))


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    p = proj(pid); j = jobs.active(pid)
    if j: jobs.cancel(j.id)
    p.delete(); return {"deleted": True}


@app.post("/api/projects/{pid}/import")
async def import_files(pid: str, files: list[UploadFile] = File(...)):
    """Accepts one or several files (an OBJ together with its .mtl and texture images). The main file is the first mesh/point file; the rest are placed next to it."""
    p = proj(pid); tmp = tempfile.mkdtemp(prefix="pgs-import-"); saved = []
    try:
        total = 0
        for f in files:
            name = Path(f.filename or "file").name; dest = Path(tmp) / name
            with open(dest, "wb") as out:
                while chunk := await f.read(1 << 20):
                    total += len(chunk)
                    if total > MAX_UPLOAD: raise HTTPException(413, f"Upload larger than {MAX_UPLOAD // (1 << 20)} MB.")
                    out.write(chunk)
            saved.append(dest)
        main = next((s for s in saved if s.suffix.lower() in FM.SUPPORTED), None)
        if main is None: raise HTTPException(400, f"None of the files has a supported type. Supported: {', '.join(FM.SUPPORTED)}.")
        t0 = time.time()
        try: obj, info = FM.load_any(str(main))
        except FM.ImportError_ as e: raise HTTPException(400, str(e))
        info = {**info, "file": main.name, "bytes": main.stat().st_size, "extra_files": [s.name for s in saved if s != main]}
        p.commit(f"Import {main.name}", "import", {"file": main.name}, {"original": obj}, drop=["cleaned", "reconstructed", "refined", "preview", "reference"], report=info, seconds=time.time() - t0, info={**obj.meta, **info})
    finally: shutil.rmtree(tmp, ignore_errors=True)
    p.rename(main.stem); return view(p) | {"import": info}


class SampleReq(BaseModel):
    kind: str = "bunny"
    points: int = 120000


@app.post("/api/projects/{pid}/sample")
def sample(pid: str, b: SampleReq):
    if b.kind not in ("bunny", "mug"): raise HTTPException(400, "Unknown sample.")
    p = proj(pid); t0 = time.time(); c, ref, meta = make_sample(b.kind, max(20000, min(b.points, 400000)))
    p.commit(f"Sample project ({b.kind})", "sample", {"kind": b.kind}, {"original": c, "reference": ref}, drop=["cleaned", "reconstructed", "refined", "preview"], report={"notes": [meta["sample_note"]]}, seconds=time.time() - t0, info=meta)
    p.rename("Sample: " + ("Stanford Bunny" if b.kind == "bunny" else "Mug")); return view(p)


class RunReq(BaseModel):
    op: str
    params: dict = {}


@app.post("/api/projects/{pid}/run")
def run(pid: str, b: RunReq):
    proj(pid)
    if b.op not in ("clean", "reconstruct", "refine", "color", "subdivision_preview", "pipeline"): raise HTTPException(400, f"Unknown operation '{b.op}'.")
    try: j = jobs.start(pid, b.op, b.params)
    except RuntimeError as e: raise HTTPException(409, str(e))
    return j.view()


class PipelineReq(BaseModel):
    preset: str = "balanced"
    overrides: dict = {}


@app.post("/api/projects/{pid}/pipeline")
def run_pipeline(pid: str, b: PipelineReq):
    p = proj(pid)
    if not p.has("original"): raise HTTPException(400, "Import a file or open the sample first.")
    try: cfg = preset(b.preset)
    except KeyError as e: raise HTTPException(404, str(e))
    for k, v in b.overrides.items():
        if k in cfg and isinstance(v, dict): cfg[k].update(v)
    try: j = jobs.start(pid, "pipeline", cfg)
    except RuntimeError as e: raise HTTPException(409, str(e))
    return j.view()


@app.get("/api/jobs/{jid}")
def get_job(jid: str):
    j = jobs.jobs.get(jid)
    if not j: raise HTTPException(404, "Job not found.")
    return j.view()


@app.post("/api/jobs/{jid}/cancel")
def cancel(jid: str):
    if jid not in jobs.jobs: raise HTTPException(404, "Job not found.")
    return jobs.cancel(jid).view()


@app.post("/api/projects/{pid}/undo")
def undo(pid: str):
    p = proj(pid)
    if jobs.active(pid): raise HTTPException(409, "An operation is running.")
    if not p.move(-1): raise HTTPException(400, "Nothing to undo.")
    return view(p)


@app.post("/api/projects/{pid}/redo")
def redo(pid: str):
    p = proj(pid)
    if jobs.active(pid): raise HTTPException(409, "An operation is running.")
    if not p.move(1): raise HTTPException(400, "Nothing to redo.")
    return view(p)


@app.get("/api/projects/{pid}/recommend")
def recommend(pid: str):
    p = proj(pid)
    try:
        from .pipeline import base_cloud
        return R.recommend(base_cloud(p))
    except ValueError as e: raise HTTPException(400, str(e))


# --------------------------------------------------------------------------------------------------- stage data and reports
def pack_preview(o: Cloud | Mesh, max_points: int, max_faces: int) -> bytes:
    """Binary preview: u32 header length | header JSON | pad to 4 | float32 positions (relative to `center`) | uint8 colours | uint32 indices. Large data is subsampled/decimated for display only."""
    pts = o.points if isinstance(o, Cloud) else o.vertices; center = (pts.min(0) + pts.max(0)) / 2; hdr = {"kind": o.kind, "center": center.tolist(), "bbox_min": pts.min(0).tolist(), "bbox_max": pts.max(0).tolist(), "decimated": False}
    if isinstance(o, Cloud):
        n = len(o)
        if n > max_points: idx = np.sort(np.random.default_rng(0).choice(n, max_points, replace=False)); hdr["decimated"] = True; pos = o.points[idx]; col = None if o.colors is None else o.colors[idx]
        else: pos = o.points; col = o.colors
        hdr.update({"count": len(pos), "total": n}); idxb = b""
    else:
        m = o
        if len(m.faces) > max_faces:
            from .refine import decimate
            m, _ = decimate(m, target_faces=max_faces, preserve_boundary=True, preserve_normals=False); hdr["decimated"] = True
        pos = m.vertices; col = m.colors
        if col is None and m.texture is not None and m.uvs is not None:
            from .model import sample_texture
            col = sample_texture(m.texture, m.uvs)
        hdr.update({"count": len(pos), "faces": len(m.faces), "total_faces": len(o.faces)}); idxb = m.faces.astype(np.uint32).tobytes()
    hdr["has_colors"] = col is not None; posb = (pos - center).astype(np.float32).tobytes(); colb = b"" if col is None else (np.clip(col, 0, 1) * 255).astype(np.uint8).tobytes()
    h = json.dumps(hdr).encode(); h += b" " * ((-len(h)) % 4); body = posb + colb; body += b"\0" * ((-len(body)) % 4)
    return struct.pack("<I", len(h)) + h + body + idxb


@app.get("/api/projects/{pid}/stage/{stage}/preview")
def preview(pid: str, stage: str, max_points: int = 400000, max_faces: int = 500000):
    if stage not in STAGES: raise HTTPException(404, "Unknown stage.")
    p = proj(pid)
    if not p.has(stage): raise HTTPException(404, f"The '{stage}' stage does not exist yet.")
    key = (pid, p.stages[stage]["file"], max_points, max_faces)
    if key not in _preview_cache:
        if len(_preview_cache) > 24: _preview_cache.pop(next(iter(_preview_cache)))
        _preview_cache[key] = pack_preview(p.get(stage), max_points, max_faces)
    return Response(_preview_cache[key], media_type="application/octet-stream", headers={"Cache-Control": "no-store"})


@app.get("/api/projects/{pid}/stage/{stage}/report")
def stage_report(pid: str, stage: str):
    if stage not in STAGES: raise HTTPException(404, "Unknown stage.")
    p = proj(pid)
    if not p.has(stage): raise HTTPException(404, f"The '{stage}' stage does not exist yet.")
    key = (pid, p.stages[stage]["file"])
    if key not in _report_cache: _report_cache[key] = report_for(p, stage)
    return _report_cache[key]


@app.get("/api/projects/{pid}/stage/{stage}/inspect")
def inspect_stage(pid: str, stage: str):
    """Module A: point count, bounding box, coordinates, colours, NaN/duplicate checks for the imported data."""
    p = proj(pid)
    if not p.has(stage): raise HTTPException(404, f"The '{stage}' stage does not exist yet.")
    o = p.get(stage); info = p.state.get("info", {}) if stage == "original" else {}
    if isinstance(o, Cloud): return {"type": "cloud", **C.inspect(o), "import": info}
    r = report_for(p, stage); return {"type": "mesh", **r, "import": info}


# ----------------------------------------------------------------------------------------------------------------- files
class ExportReq(BaseModel):
    stage: str = "refined"
    format: str = "glb"
    scale: float = 1.0
    orientation: str = "as-is"
    keep_texture: bool = True
    simplify_percent: float = 0.0
    target_faces: int = 0
    recentre: bool = False


@app.post("/api/projects/{pid}/export")
def export(pid: str, b: ExportReq):
    p = proj(pid)
    if not p.has(b.stage): raise HTTPException(404, f"The '{b.stage}' stage does not exist yet.")
    if b.format not in FM.EXPORT_FORMATS: raise HTTPException(400, "Unsupported export format.")
    try: r = export_stage(p, b.stage, b.format, b.scale, b.orientation, b.keep_texture, b.simplify_percent, b.target_faces, b.recentre)
    except (ValueError, KeyError) as e: raise HTTPException(400, str(e))
    return FileResponse(r["path"], filename=r["name"], headers={"X-Export-Notes": json.dumps(r["notes"])[:900], "X-Export-Faces": str(r["faces"]), "Access-Control-Expose-Headers": "X-Export-Notes, X-Export-Faces, Content-Disposition"})


@app.get("/api/projects/{pid}/save")
def save_project(pid: str):
    p = proj(pid); tmp = tempfile.mkdtemp(prefix="pgs-save-"); path = os.path.join(tmp, f"{p.state['name']}.pgproj"); p.export_pgproj(path)
    return FileResponse(path, filename=f"{p.state['name']}.pgproj", media_type="application/zip")


@app.post("/api/open")
async def open_project(file: UploadFile = File(...)):
    tmp = tempfile.mkdtemp(prefix="pgs-open-")
    try:
        path = os.path.join(tmp, "p.pgproj")
        with open(path, "wb") as f:
            while chunk := await file.read(1 << 20): f.write(chunk)
        try: p = Project.import_pgproj(path)
        except Exception as e: raise HTTPException(400, f"Could not open the project file: {e}")
    finally: shutil.rmtree(tmp, ignore_errors=True)
    return view(p)


# ---------------------------------------------------------------------------------------------------------- UI hosting
import sys
_frozen_ui = Path(getattr(sys, "_MEIPASS", "")) / "ui_dist" if getattr(sys, "frozen", False) else None
UI_DIR = Path(os.environ.get("PGS_UI_DIR") or (_frozen_ui if _frozen_ui else Path(__file__).resolve().parents[2] / "ui" / "dist"))
if UI_DIR.exists():
    app.mount("/", StaticFiles(directory=str(UI_DIR), html=True), name="ui")


@app.on_event("shutdown")
def _shutdown(): jobs.shutdown()
