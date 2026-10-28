"""Roof detection and measurement API. Only these responsibilities: no CRM, customers, payments, suppliers or accounts."""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from .config import Settings
from .jobs import Job, JobManager, QueueFull
from .measure import ScaleError, measure_polygon, pitch_from, resolve_scale
from .media import IMAGE_EXT, sniff
from .model import RoofSegmenter
from .pipeline import MODEL_INFO, Params
from .report import make_pdf

CHUNK = 1024 * 1024
SAMPLE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
KINDS = {"original": "image/jpeg", "overlay": "image/png", "mask": "image/png", "probability": "image/png"}


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        model = RoofSegmenter(s.model_path, s.intra_threads)
        state["model"], state["jobs"] = model, JobManager(s, model)
        yield
        state["jobs"].shutdown()

    app = FastAPI(title="Neo Forge roof detection and measurement", version="1.0.0", lifespan=lifespan,
                  description="Segments roofs in top-down imagery with a U-Net, derives outlines and candidate edges, and measures them when a defensible scale exists. Nothing else.")
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])

    def jobs() -> JobManager:
        return state["jobs"]

    def need_job(job_id: str) -> Job:
        j = jobs().get(job_id)
        if not j:
            raise HTTPException(404, "Job not found or expired.")
        return j

    def samples() -> list[dict]:
        m = s.samples_dir / "manifest.json"
        if not m.is_file():
            return []
        try:
            return json.loads(m.read_text())["samples"]
        except (ValueError, KeyError):
            return []

    def parse_params(raw: str | None) -> Params:
        try:
            d = json.loads(raw) if raw else {}
            if not isinstance(d, dict):
                raise ValueError
        except ValueError:
            raise HTTPException(400, "params must be a JSON object.") from None
        p = Params()
        try:
            p.threshold = float(d.get("threshold", p.threshold)); p.min_area_px = int(d.get("min_area_px", p.min_area_px)); p.model_scale = float(d.get("model_scale", p.model_scale))
        except (TypeError, ValueError):
            raise HTTPException(400, "threshold, min_area_px and model_scale must be numbers.") from None
        if not (0.2 <= p.threshold <= 0.9) or not (10 <= p.min_area_px <= 100_000) or not (0.5 <= p.model_scale <= 3.0):
            raise HTTPException(400, "threshold must be 0.2-0.9, min_area_px 10-100000 and model_scale 0.5-3.")
        p.view = d.get("view", "nadir")
        if p.view not in ("nadir", "oblique", "unknown"):
            raise HTTPException(400, "view must be nadir, oblique or unknown.")
        p.approx_roof_type = (str(d["approx_roof_type"])[:40] if d.get("approx_roof_type") else None)
        p.scale = d.get("scale") if isinstance(d.get("scale"), dict) else None
        p.pitch = d.get("pitch") if isinstance(d.get("pitch"), dict) else None
        try:  # validate early so the user gets the message before processing starts
            resolve_scale(p.scale, None) if (p.scale and p.scale.get("type") != "geo") else None
            pitch_from(p.pitch)
        except ScaleError as e:
            raise HTTPException(400, str(e)) from None
        return p

    # ---- meta -----------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        j = jobs()
        return {"ok": True, "model": state["model"].model_name, "runtime": "onnxruntime (CPU)", "limits": {"max_file_mb": s.max_file_mb, "max_images": s.max_images, "max_total_mb": s.max_total_mb, "max_pixels": s.max_pixels},
                "active_jobs": sum(1 for x in j.jobs.values() if x.status in ("queued", "running")), "model_info": MODEL_INFO, "formats": ["jpg", "png", "webp", "tif (GeoTIFF supported)"]}

    @app.get("/api/samples")
    def list_samples():
        return {"samples": [{**x, "image_url": f"/api/samples/{x['id']}/image"} for x in samples()]}

    @app.get("/api/samples/{sample_id}/image")
    def sample_image(sample_id: str):
        item = next((x for x in samples() if x["id"] == sample_id), None) if SAMPLE_ID.match(sample_id) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        return FileResponse(s.samples_dir / item["file"])

    # ---- stateless measurement (used for user-drawn outlines and for recalculating with new reference information) ----------
    @app.post("/api/roof/measure")
    def measure(body: dict = Body(...)):
        poly = body.get("polygon")
        if not isinstance(poly, list) or not (3 <= len(poly) <= 500):
            raise HTTPException(400, "polygon must be a list of 3 to 500 [x, y] points in image pixels.")
        try:
            pts = [[float(a), float(b)] for a, b in poly]
            georef = None
            g = body.get("georeference")
            if isinstance(g, dict):
                from .media import Georef
                georef = Georef(float(g["gsd_x_m"]), float(g["gsd_y_m"]), str(g.get("crs", "")), str(g.get("note", "")))
            scale = resolve_scale(body.get("scale") if isinstance(body.get("scale"), dict) else None, georef)
            return {"provenance": "user-drawn polygon" if body.get("source") == "user" else "supplied polygon", "measurements": measure_polygon(pts, scale, pitch_from(body.get("pitch") if isinstance(body.get("pitch"), dict) else None)),
                    "scale": scale.describe() if scale else {"kind": None, "meaning": "No scale"}}
        except (ScaleError, TypeError, ValueError, KeyError) as e:
            raise HTTPException(400, str(e) if isinstance(e, ScaleError) else "The request was not valid.") from None

    # ---- analysis jobs ----------------------------------------------------------------------------------------------
    def job_json(j: Job) -> dict:
        done = j.status in ("completed", "cancelled", "failed")
        return {"job_id": j.id, "status": j.status, "stage": j.stage, "error": j.error, "images_total": len(j.files), "images_done": j.images_done,
                "progress": {"fraction": 1.0 if j.status == "completed" else (j.images_done / max(1, len(j.files)))}, "elapsed_seconds": round(((j.finished or __import__("time").time()) - (j.started or j.created)), 2),
                "results_url": f"/api/roof/jobs/{j.id}/results" if done else None}

    @app.post("/api/roof/analyze", status_code=202)
    async def analyze(request: Request, files: list[UploadFile] = File(default=[]), sample_ids: str | None = Form(None), params: str | None = Form(None)):
        p = parse_params(params)
        wanted = [x for x in (sample_ids or "").split(",") if x]
        if not files and not wanted:
            raise HTTPException(400, "Send at least one image or a sample_ids list.")
        if len(files) + len(wanted) > s.max_images:
            raise HTTPException(400, f"At most {s.max_images} images per analysis session.")
        jid, d = jobs().new_dir()
        stored: list[tuple[str, Path]] = []
        try:
            total = 0
            for k, f in enumerate(files):
                dest = d / f"in{k}.bin"
                size, head = 0, b""
                with open(dest, "wb") as out:
                    while chunk := await f.read(CHUNK):
                        size += len(chunk); total += len(chunk)
                        if size > s.max_file_mb * 1_000_000 or total > s.max_total_mb * 1_000_000:
                            raise HTTPException(413, f"The files are larger than the limit ({s.max_file_mb} MB per file, {s.max_total_mb} MB in total).")
                        if len(head) < 32:
                            head += chunk[:32 - len(head)]
                        out.write(chunk)
                if size == 0:
                    raise HTTPException(400, "A file is empty.")
                if sniff(head) not in IMAGE_EXT:
                    raise HTTPException(415, "Unsupported file type. Upload JPEG, PNG, WebP or GeoTIFF images.")
                stored.append((re.sub(r"[^\w.\- ]+", "_", (f.filename or f"image{k}"))[:80], dest))
            for sid in wanted:
                item = next((x for x in samples() if x["id"] == sid), None) if SAMPLE_ID.match(sid) else None
                if not item:
                    raise HTTPException(404, f"Unknown sample {sid!r}.")
                dest = d / f"sample-{sid}.bin"
                shutil.copyfile(s.samples_dir / item["file"], dest)
                stored.append((item["file"], dest))
            job = jobs().submit(jid, d, stored, p)
        except QueueFull as e:
            raise HTTPException(503, str(e)) from None
        except HTTPException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(500, "The upload could not be processed.") from None
        return job_json(job)

    @app.get("/api/roof/jobs/{job_id}")
    def job_status(job_id: str):
        return job_json(need_job(job_id))

    @app.post("/api/roof/jobs/{job_id}/cancel")
    def job_cancel(job_id: str):
        j = need_job(job_id)
        if j.status in ("queued", "running"):
            j.cancel.set()
        return {"job_id": j.id, "status": j.status, "cancel_requested": True}

    @app.delete("/api/roof/jobs/{job_id}")
    def job_delete(job_id: str):
        jobs().delete(need_job(job_id))
        return {"deleted": True}

    @app.get("/api/roof/jobs/{job_id}/results")
    def job_results(job_id: str):
        j = need_job(job_id)
        if j.status in ("queued", "running"):
            raise HTTPException(409, "The job is still running.")
        return {**job_json(j), "images": j.results, "artifact_urls": {str(i): {k: f"/api/roof/jobs/{j.id}/images/{i}/{k}" for k in a} for i, a in j.artifacts.items()},
                "session_note": "Each image is analysed independently. Images are not merged into one reconstruction (photogrammetry is not part of this tool)."}

    @app.get("/api/roof/jobs/{job_id}/images/{index}/{kind}")
    def job_image(job_id: str, index: int, kind: str):
        j = need_job(job_id)
        path = j.artifacts.get(index, {}).get(kind) if kind in KINDS else None
        if not path or not path.is_file():
            raise HTTPException(404, "Not available.")
        return FileResponse(path, media_type=KINDS[kind])

    @app.get("/api/roof/jobs/{job_id}/results.csv")
    def job_csv(job_id: str):
        j = need_job(job_id)
        if j.status in ("queued", "running"):
            raise HTTPException(409, "The job is still running.")
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["image", "region_id", "confidence_mean", "area_px", "perimeter_px", "area_m2", "perimeter_m", "surface_area_m2", "scale_kind", "scale_source", "pitch_degrees", "pitch_source"])
        for r in j.results:
            if not r["ok"]:
                continue
            res = r["result"]
            for g in res["regions"]:
                m = g["measurements"]
                met, sur, pit = m["metric"], m["surface"], m["pitch"]
                w.writerow([res["image"]["name"], g["id"], g["confidence"]["mean_probability"], round(m["pixels"]["area_px"], 1), round(m["pixels"]["perimeter_px"], 1), round(met["area_m2"], 3) if met.get("available") else "", round(met["perimeter_m"], 3) if met.get("available") else "",
                            round(sur["area_m2"], 3) if sur.get("available") else "", met.get("scale_kind", "") if met.get("available") else "", met.get("scale_source", "") if met.get("available") else "", round(pit["degrees"], 2) if pit.get("status") == "supplied" else "", "user" if pit.get("status") == "supplied" else ""])
        return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="roof-results-{j.id[:8]}.csv"'})

    @app.get("/api/roof/jobs/{job_id}/report.pdf")
    def job_pdf(job_id: str):
        j = need_job(job_id)
        if j.status in ("queued", "running"):
            raise HTTPException(409, "The job is still running.")
        ok = [r for r in j.results if r["ok"]]
        if not ok:
            raise HTTPException(404, "There are no results to report.")
        pdf = make_pdf(ok, {i: a for i, a in j.artifacts.items()}, j.params)
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="roof-report-{j.id[:8]}.pdf"'})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


app = create_app()
