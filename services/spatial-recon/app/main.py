"""Spatial mapping and 3D reconstruction API. Only these responsibilities: media ingest, camera estimation, reconstruction, point cloud and mesh handling, export."""
from __future__ import annotations

import json
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import pycolmap
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import cloud as pc
from .config import Settings
from .depth import DepthModel
from .jobs import Job, JobManager, QueueFull
from .media import CLOUD_FMT, IMAGE_FMT, MESH_FMT, VIDEO_FMT, MediaError, image_size, probe_video, sniff, sniff_with_name
from .pipeline import SCALE, Artifact, Params

CHUNK = 1024 * 1024
ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
MIME = {"json": "application/json", "ply": "application/octet-stream", "glb": "model/gltf-binary", "jpg": "image/jpeg", "png": "image/png", "obj": "text/plain"}
OPS = {"voxel_downsample", "statistical_outlier_removal", "radius_outlier_removal", "estimate_normals", "crop"}


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            depth = DepthModel(s.depth_model_path, s.threads)
        except FileNotFoundError:
            depth = None
        state["depth"], state["jobs"] = depth, JobManager(s, depth)
        yield
        state["jobs"].shutdown()

    app = FastAPI(title="Neo Forge spatial mapping and 3D reconstruction", version="1.0.0", lifespan=lifespan,
                  description="Structure from motion (COLMAP), relative depth (Depth Anything V2 Small), point cloud processing and export. Nothing else.")
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])

    def jobs() -> JobManager:
        return state["jobs"]

    def need(job_id: str) -> Job:
        j = jobs().get(job_id)
        if not j:
            raise HTTPException(404, "Job not found or expired.")
        return j

    def samples() -> list[dict]:
        m = s.samples_dir / "manifest.json"
        try:
            return json.loads(m.read_text())["samples"] if m.is_file() else []
        except (ValueError, KeyError):
            return []

    async def save(f: UploadFile, dest: Path, limit: int) -> tuple[str | None, int]:
        size, head = 0, b""
        with open(dest, "wb") as out:
            while chunk := await f.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    out.close(); dest.unlink(missing_ok=True)
                    raise HTTPException(413, f"The file is larger than the {limit // 1_000_000} MB limit.")
                if len(head) < 128:
                    head += chunk[:128 - len(head)]
                out.write(chunk)
        if size == 0:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, "The file is empty.")
        return sniff_with_name(head, f.filename or ""), size

    def parse_params(raw: str | None) -> Params:
        try:
            d = json.loads(raw) if raw else {}
            if not isinstance(d, dict):
                raise ValueError
        except ValueError:
            raise HTTPException(400, "params must be a JSON object.") from None
        p = Params()
        try:
            p.max_frames = int(d.get("max_frames", p.max_frames)); p.image_size = int(d.get("image_size", p.image_size)); p.keyframes = int(d.get("keyframes", p.keyframes))
        except (TypeError, ValueError):
            raise HTTPException(400, "max_frames, image_size and keyframes must be integers.") from None
        if not (8 <= p.max_frames <= s.max_frames) or not (320 <= p.image_size <= 1600) or not (1 <= p.keyframes <= 12):
            raise HTTPException(400, f"max_frames must be 8-{s.max_frames}, image_size 320-1600 and keyframes 1-12.")
        for k in ("depth", "densify", "mesh"):
            setattr(p, k, bool(d.get(k, getattr(p, k))))
        return p

    # ---- meta ----------------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"ok": True, "pycolmap": pycolmap.__version__, "depth_model": state["depth"].name if state["depth"] else None, "runtime": "COLMAP (pycolmap, CPU) + onnxruntime (CPU)", "cuda": bool(pycolmap.has_cuda),
                "limits": {"max_upload_mb": s.max_upload_mb, "max_images": s.max_images, "max_video_seconds": s.max_video_seconds, "max_frames": s.max_frames, "max_import_mb": s.max_import_mb, "max_points": s.max_points},
                "active_jobs": sum(1 for j in jobs().jobs.values() if j.status in ("queued", "running") and j.kind == "reconstruct"),
                "formats": {"images": sorted(IMAGE_FMT), "video": ["mp4", "mov", "webm"], "point_clouds": sorted(CLOUD_FMT), "meshes": sorted(MESH_FMT)}, "dense_multi_view_stereo": False,
                "notes": ["Dense multi-view stereo needs a CUDA GPU and is not available; the dense cloud is depth-model-based and approximate."]}

    @app.get("/api/samples")
    def list_samples():
        return {"samples": [{**x, "video_url": f"/api/samples/{x['id']}/media"} for x in samples()]}

    @app.get("/api/samples/{sid}/media")
    def sample_media(sid: str):
        item = next((x for x in samples() if x["id"] == sid), None) if ID.match(sid) else None
        if not item or not item.get("file"):
            raise HTTPException(404, "Unknown sample.")
        return FileResponse(s.samples_dir / item["file"])

    # ---- jobs ----------------------------------------------------------------------------------------------------------
    def art_list(j: Job) -> list[dict]:
        return [a.public(f"/api/spatial/jobs/{j.id}/artifacts") for a in j.artifacts.values()]

    def job_json(j: Job) -> dict:
        now = time.time()
        return {"job_id": j.id, "kind": j.kind, "status": j.status, "stage": j.current, "stages": j.stages, "error": j.error, "progress": {"fraction": round(j.progress(), 3)}, "elapsed_seconds": round((j.finished or now) - (j.started or j.created), 1),
                "inputs": j.inputs, "scale": SCALE if j.kind == "reconstruct" else {"status": "unknown", "metric": False, "note": "An imported file does not state its scale to this service; treat distances as unit-less unless you know the file's units."},
                "warnings": j.warnings, "artifacts_url": f"/api/spatial/jobs/{j.id}/artifacts"}

    @app.post("/api/spatial/reconstruct", status_code=202)
    async def reconstruct(request: Request, files: list[UploadFile] = File(default=[]), sample_id: str | None = Form(None), params: str | None = Form(None)):
        p = parse_params(params)
        if (not files) == (sample_id is None):
            raise HTTPException(400, "Send either media files or a sample_id.")
        jid, d = jobs().new_dir()
        job = Job(jid, d, "reconstruct", params=p)
        try:
            kinds: list[str] = []
            total = 0
            if sample_id is not None:
                item = next((x for x in samples() if x["id"] == sample_id), None) if ID.match(sample_id) else None
                if not item or not item.get("file"):
                    raise HTTPException(404, "Unknown sample.")
                dest = d / "input.bin"
                shutil.copyfile(s.samples_dir / item["file"], dest)
                job.input_files, job.inputs = [dest], {"source": f"sample:{sample_id}"}
                head = dest.read_bytes()[:128]
                kinds = [sniff(head) or ""]
            else:
                if len(files) > s.max_images:
                    raise HTTPException(400, f"At most {s.max_images} files per reconstruction.")
                for k, f in enumerate(files):
                    dest = d / f"in{k}.bin"
                    fmt, size = await save(f, dest, s.max_upload_mb * 1_000_000)
                    total += size
                    if total > s.max_total_mb * 1_000_000:
                        raise HTTPException(413, f"The files are larger than {s.max_total_mb} MB in total.")
                    if fmt not in IMAGE_FMT | VIDEO_FMT:
                        raise HTTPException(415, "Unsupported file type for reconstruction. Upload one video (MP4, MOV, WebM) or several JPG/PNG images. Point clouds and meshes can be imported for viewing instead.")
                    job.input_files.append(dest)
                    kinds.append(fmt)
                job.inputs = {"source": "upload", "files": len(files), "bytes": total}
            vids = [k for k in kinds if k in VIDEO_FMT]
            if vids:
                if len(kinds) != 1:
                    raise HTTPException(400, "Send either a single video or a set of images, not a mix.")
                try:
                    info = probe_video(job.input_files[0], s.max_pixels, s.max_video_seconds)
                except MediaError as e:
                    raise HTTPException(422, str(e)) from None
                job.is_video, job.video_info = True, info
                job.inputs["video"] = {"width": info.width, "height": info.height, "fps": round(info.fps, 2), "duration_seconds": round(info.duration, 1)}
            else:
                if len(kinds) < 3:
                    raise HTTPException(422, "Structure from motion needs at least three overlapping images (or one video).")
                for f in job.input_files:
                    fmt = sniff(f.read_bytes()[:16])
                    w, h = image_size(f.read_bytes()[:200_000], fmt or "jpg")
                    if w * h > s.max_pixels:
                        raise HTTPException(422, f"An image is too large ({w}×{h}); the limit is {s.max_pixels // 1_000_000} megapixels.")
                job.inputs["images"] = len(kinds)
            job.inputs["workflow"] = "video → frames → SfM" if job.is_video else "image set → SfM"
            jobs().submit(job)
        except QueueFull as e:
            raise HTTPException(503, str(e)) from None
        except HTTPException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(500, "The upload could not be processed.") from None
        return job_json(job)

    @app.post("/api/spatial/import", status_code=201)
    async def import_file(file: UploadFile = File(...)):
        """View an existing point cloud (PLY, PCD) or mesh (OBJ, GLB, STL). Nothing is reconstructed."""
        jid, d = jobs().new_dir()
        job = Job(jid, d, "import")
        try:
            dest = d / "import.bin"
            fmt, size = await save(file, dest, s.max_import_mb * 1_000_000)
            if fmt not in CLOUD_FMT | MESH_FMT:
                raise HTTPException(415, "Unsupported file type. Import PLY or PCD point clouds, or OBJ, GLB or STL meshes.")
            data = dest.read_bytes()
            job.inputs = {"source": "import", "format": fmt, "bytes": size, "name": re.sub(r"[^\w.\- ]+", "_", file.filename or "file")[:80]}
            try:
                if fmt in CLOUD_FMT:
                    c = pc.read_ply(data, s.max_points) if fmt == "ply" else pc.read_pcd(data, s.max_points)
                    if c.faces is not None and len(c.faces):  # a PLY with faces is a mesh
                        import trimesh
                        m = trimesh.Trimesh(c.points, c.faces, process=False)
                        m.export(str(d / "mesh.glb"))
                        job.artifacts["mesh.glb"] = Artifact("mesh.glb", "mesh", f"Imported mesh: {len(c.points):,} vertices, {len(c.faces):,} faces", "imported, geometry unchanged (converted to GLB for viewing)", "available", d / "mesh.glb", "glb", extra={"vertices": int(len(c.points)), "faces": int(len(c.faces)), **pc.stats(c.points)})
                    else:
                        pc.write_ply(d / "points.ply", c)
                        job.artifacts["points.ply"] = Artifact("points.ply", "point_cloud", f"Imported point cloud: {len(c.points):,} points" + (" with colours" if c.colors is not None else ""), "imported, geometry unchanged", "available", d / "points.ply", "ply", extra={"points": int(len(c.points)), "has_colors": c.colors is not None, "has_normals": c.normals is not None, **pc.stats(c.points)})
                else:
                    import trimesh
                    m = trimesh.load(file_obj=__import__("io").BytesIO(data), file_type=fmt, force="mesh", process=False)
                    if not hasattr(m, "faces") or len(m.faces) == 0:
                        raise pc.CloudError("The file contains no triangle faces.")
                    if len(m.vertices) > 3_000_000:
                        raise pc.CloudError("The mesh has more than 3 million vertices; simplify it first.")
                    m.export(str(d / "mesh.glb"))
                    st = pc.stats(np.asarray(m.vertices, np.float32))
                    job.artifacts["mesh.glb"] = Artifact("mesh.glb", "mesh", f"Imported mesh: {len(m.vertices):,} vertices, {len(m.faces):,} faces", "imported, geometry preserved (converted to GLB for viewing)", "available", d / "mesh.glb", "glb", extra={"vertices": int(len(m.vertices)), "faces": int(len(m.faces)), **st})
            except pc.CloudError as e:
                raise HTTPException(422, str(e)) from None
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(422, f"The {fmt.upper()} file could not be parsed. It may be damaged or use an unsupported variant.") from None
            job.status, job.finished = "completed", time.time()
            for n in job.stages:
                job.stages[n] = {"state": "skipped", "detail": "not applicable to an imported file"}
            jobs().register(job)
        except HTTPException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(500, "The file could not be processed.") from None
        return job_json(job)

    @app.get("/api/spatial/jobs/{job_id}")
    def status(job_id: str):
        return job_json(need(job_id))

    @app.get("/api/spatial/jobs/{job_id}/results")
    def results(job_id: str):
        j = need(job_id)
        if j.status in ("queued", "running"):
            raise HTTPException(409, "The job is still running.")
        return {**job_json(j), "report": j.report, "artifacts": art_list(j)}

    @app.get("/api/spatial/jobs/{job_id}/artifacts")
    def artifacts(job_id: str):
        j = need(job_id)
        return {"status": j.status, "artifacts": art_list(j)}

    @app.get("/api/spatial/jobs/{job_id}/artifacts/{name}")
    def artifact(job_id: str, name: str):
        j = need(job_id)
        a = j.artifacts.get(name)  # only registered names resolve: no path is ever built from user input
        if not a or a.status != "available" or not a.path or not a.path.is_file():
            raise HTTPException(404, "Not available.")
        return FileResponse(a.path, media_type=MIME.get(a.fmt, "application/octet-stream"), filename=a.name if a.kind != "image" else None)

    @app.post("/api/spatial/jobs/{job_id}/process")
    def process(job_id: str, body: dict = Body(...)):
        j = need(job_id)
        if j.status in ("queued", "running"):
            raise HTTPException(409, "The job is still running.")
        src = j.artifacts.get(str(body.get("source", "")))
        op, prm = body.get("op"), body.get("params") or {}
        if op not in OPS or not isinstance(prm, dict):
            raise HTTPException(400, f"op must be one of {sorted(OPS)}.")
        if not src or src.kind != "point_cloud" or src.status != "available" or not src.path:
            raise HTTPException(404, "The source must be an available point cloud artifact of this job.")
        with j.lock:
            if j.op_count >= 12:
                raise HTTPException(429, "At most 12 processed clouds per job. Delete the job or start a new one.")
            j.op_count += 1
            n = j.op_count
        try:
            c = pc.read_ply(src.path.read_bytes(), s.max_points)
            before = len(c.points)
            if op == "voxel_downsample":
                out = pc.voxel_downsample(c, float(prm.get("voxel_size", 0)))
            elif op == "statistical_outlier_removal":
                out = pc.statistical_outlier_removal(c, int(prm.get("neighbors", 16)), float(prm.get("std_ratio", 2.0)))
            elif op == "radius_outlier_removal":
                out = pc.radius_outlier_removal(c, float(prm.get("radius", 0)), int(prm.get("min_neighbors", 4)))
            elif op == "estimate_normals":
                out = pc.estimate_normals(c, int(prm.get("neighbors", 20)))
            else:
                out = pc.crop(c, prm.get("min"), prm.get("max"))
            if len(out.points) == 0:
                raise pc.CloudError("The operation removed every point. Use less aggressive parameters.")
        except (pc.CloudError, TypeError, ValueError) as e:
            with j.lock:
                j.op_count -= 1
            raise HTTPException(400, str(e) if isinstance(e, pc.CloudError) else "The parameters were not valid.") from None
        name = f"processed_{n}_{op}.ply"
        pc.write_ply(j.dir / name, out)
        j.artifacts[name] = Artifact(name, "point_cloud", f"{src.name} after {op.replace('_', ' ')} ({before:,} → {len(out.points):,} points)", f"derived from {src.name} by {op} with {json.dumps(prm)}", "available", j.dir / name, "ply",
                                     extra={"points": int(len(out.points)), "has_normals": out.normals is not None, "source": src.name, "operation": op, "parameters": prm, "relative_scale": src.extra.get("relative_scale", False), **pc.stats(out.points)})
        return {"artifact": j.artifacts[name].public(f"/api/spatial/jobs/{j.id}/artifacts"), "points_before": before, "points_after": int(len(out.points))}

    @app.post("/api/spatial/jobs/{job_id}/cancel")
    def cancel(job_id: str):
        j = need(job_id)
        if j.status in ("queued", "running"):
            jobs().cancel(j)
        return {"job_id": j.id, "status": j.status, "cancel_requested": True}

    @app.delete("/api/spatial/jobs/{job_id}")
    def delete(job_id: str):
        jobs().delete(need(job_id))
        return {"deleted": True}

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


app = create_app()
