"""Worker detection, tracking, PPE detection and PPE assessment API. Only these responsibilities: no HR, payroll, attendance, identity or incident workflows."""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .config import Settings
from .detector import YoloxDetector
from .ppe import SafetyGearModel
from .jobs import Job, JobManager, QueueFull
from .media import IMAGE_EXT, VIDEO_EXT, MediaError, decode_image, probe_video, sniff
from .pipeline import FrameAnalyzer, JobParams, Models

CHUNK = 1024 * 1024
SAMPLE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        models = Models(YoloxDetector(s.model_path, s.input_size, s.intra_threads), SafetyGearModel(s.safety_prototxt, s.safety_weights))
        state["models"], state["jobs"] = models, JobManager(s, models)
        yield
        state["jobs"].shutdown()

    app = FastAPI(title="Neo Forge factory workforce detection, tracking and PPE monitoring", version="1.0.0", lifespan=lifespan,
                  description="Detects people (YOLOX), tracks them (ByteTrack) and detects hard hats and safety vests (Intel worker_safety_mobilenet), then reports a cautious per-worker PPE assessment. Nothing else. Track IDs are temporary labels: there is no face recognition and no identity matching.")
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"], expose_headers=["Content-Range", "Accept-Ranges"])

    def jobs() -> JobManager:
        return state["jobs"]

    def need_job(job_id: str) -> Job:
        j = jobs().get(job_id)
        if not j:
            raise HTTPException(404, "Job not found or expired.")
        return j

    async def save_upload(file: UploadFile, dest: Path, max_bytes: int) -> str:
        """Stream the upload to disk with a hard size cap and return the sniffed format."""
        size, head = 0, b""
        with open(dest, "wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    out.close(); dest.unlink(missing_ok=True)
                    raise HTTPException(413, f"The file is larger than the {max_bytes // 1_000_000} MB limit.")
                if len(head) < 32:
                    head += chunk[:32 - len(head)]
                out.write(chunk)
        if size == 0:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, "The file is empty.")
        fmt = sniff(head)
        if fmt is None:
            dest.unlink(missing_ok=True)
            raise HTTPException(415, "Unsupported file type. Upload an MP4, MOV, WebM, MKV or AVI video, or a JPEG, PNG or WebP image.")
        return fmt

    def parse_zone(zone: str | None):
        if not zone:
            return None
        try:
            v = tuple(float(x) for x in zone.split(","))
        except ValueError:
            raise HTTPException(400, "zone must be four comma-separated numbers: x1,y1,x2,y2 (0 to 1).") from None
        if len(v) != 4 or any(not (0 <= x <= 1) for x in v) or v[2] - v[0] < 0.02 or v[3] - v[1] < 0.02:
            raise HTTPException(400, "zone must be four numbers between 0 and 1 describing a rectangle (x1<x2, y1<y2).") from None
        return v

    def samples() -> list[dict]:
        m = s.samples_dir / "manifest.json"
        if not m.is_file():
            return []
        try:
            return json.loads(m.read_text())["samples"]
        except (ValueError, KeyError):
            return []

    # ---- meta -----------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        j = jobs()
        return {"ok": True, "person_model": state["models"].person.model_name, "ppe_model": state["models"].safety.model_name, "runtime": "onnxruntime + OpenCV DNN (CPU)", "ffmpeg": bool(shutil.which("ffmpeg")),
                "active_jobs": sum(1 for x in j.jobs.values() if x.status in ("queued", "running")),
                "limits": {"max_video_mb": s.max_video_mb, "max_image_mb": s.max_image_mb, "max_video_seconds": s.max_video_seconds, "max_frames": s.max_frames, "max_concurrent_jobs": s.max_concurrent_jobs},
                "ppe_classes": ["hard_hat", "safety_vest"], "assessments": ["compliant", "potential_violation", "uncertain"]}

    @app.get("/api/samples")
    def list_samples():
        return {"samples": [{**x, "video_url": f"/api/samples/{x['id']}/video"} for x in samples()]}

    @app.get("/api/samples/{sample_id}/video")
    def sample_video(sample_id: str):
        item = next((x for x in samples() if x["id"] == sample_id), None) if SAMPLE_ID.match(sample_id) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        return FileResponse(s.samples_dir / item["file"], media_type="video/mp4")

    # ---- single image ---------------------------------------------------------------------------------------------
    @app.post("/api/detect/image")
    async def detect_image(request: Request, file: UploadFile = File(...), conf: float = Form(0.4), ppe_conf: float = Form(0.4), require_hat: bool = Form(True), require_vest: bool = Form(True)):
        if not (0.05 <= conf <= 0.95) or not (0.2 <= ppe_conf <= 0.95):
            raise HTTPException(400, "conf must be 0.05-0.95 and ppe_conf 0.2-0.95.")
        data = await file.read(s.max_image_mb * 1_000_000 + 1)
        if not data:
            raise HTTPException(400, "The file is empty.")
        if len(data) > s.max_image_mb * 1_000_000:
            raise HTTPException(413, f"The image is larger than the {s.max_image_mb} MB limit.")
        try:
            img = decode_image(data, s.max_pixels)
        except MediaError as e:
            raise HTTPException(415 if "Unsupported" in str(e) else 422, str(e)) from None
        h, w = img.shape[:2]
        an = FrameAnalyzer(state["models"], JobParams(conf=conf, ppe_conf=ppe_conf, require_hat=require_hat, require_vest=require_vest), 1.0, tracked=False)
        t0 = time.perf_counter()
        rec = an.run(img, 0, 1.0)
        ms = (time.perf_counter() - t0) * 1000
        for k in ("frame_number", "frame_index", "timestamp_seconds", "unique_worker_tracks", "unique_tracks_with_potential_violation", "detection_instances_processed", "zone"):
            rec.pop(k, None)
        return {"image": {"width": w, "height": h}, "person_model": state["models"].person.model_name, "ppe_model": state["models"].safety.model_name, "inference_ms": round(ms, 1), **rec,
                "coordinates": "pixels, relative to the uploaded image (origin top-left)",
                "note": "A single image has no tracking: track_id is null, and PPE state is judged from this one view without temporal smoothing."}

    # ---- video jobs -----------------------------------------------------------------------------------------------
    @app.post("/api/detect/video", status_code=202)
    async def detect_video(file: UploadFile | None = File(None), sample_id: str | None = Form(None), conf: float = Form(0.4), ppe_conf: float = Form(0.4), stride: int = Form(1), min_hits: int = Form(3),
                           require_hat: bool = Form(True), require_vest: bool = Form(True), zone: str | None = Form(None), write_video: bool = Form(True)):
        if not (0.05 <= conf <= 0.95) or not (0.2 <= ppe_conf <= 0.95) or not (1 <= stride <= 10) or not (1 <= min_hits <= 20):
            raise HTTPException(400, "conf must be 0.05-0.95, ppe_conf 0.2-0.95, stride 1-10 and min_hits 1-20.")
        params = JobParams(conf=conf, ppe_conf=ppe_conf, stride=stride, min_hits=min_hits, require_hat=require_hat, require_vest=require_vest, zone=parse_zone(zone), write_video=write_video)
        if (file is None) == (sample_id is None):
            raise HTTPException(400, "Send either a video file or a sample_id.")
        jid, d = jobs().new_dir()
        try:
            if sample_id is not None:
                item = next((x for x in samples() if x["id"] == sample_id), None) if SAMPLE_ID.match(sample_id) else None
                if not item:
                    raise HTTPException(404, "Unknown sample.")
                src = d / "input.mp4"
                shutil.copyfile(s.samples_dir / item["file"], src)
                source = f"sample:{sample_id}"
            else:
                fmt = await save_upload(file, d / "upload.bin", s.max_video_mb * 1_000_000)
                if fmt not in VIDEO_EXT:
                    raise HTTPException(415, "That is an image. Use the image option, or upload a video (MP4, MOV, WebM, MKV, AVI).")
                src = d / f"input.{fmt}"
                (d / "upload.bin").rename(src)
                source = "upload"
            try:
                info = probe_video(src, s.max_pixels, s.max_video_seconds, s.max_frames)
            except MediaError as e:
                raise HTTPException(422, str(e)) from None
            job = jobs().submit(jid, d, src, info, params, source)
        except QueueFull as e:
            raise HTTPException(503, str(e)) from None
        except HTTPException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(500, "The upload could not be processed.") from None
        return job_json(job)

    def job_json(j: Job) -> dict:
        p = j.progress
        total = p.total_frames_estimate
        done = j.status in ("completed", "cancelled", "failed")
        out = j.outputs
        return {"job_id": j.id, "status": j.status, "source": j.source, "error": j.error, "error_detail": j.error_detail,
                "video": {"width": j.info.width, "height": j.info.height, "fps": round(j.info.fps, 3), "frames_estimate": j.info.frames, "duration_seconds": round(j.info.duration, 2)},
                "params": {"conf": j.params.conf, "ppe_conf": j.params.ppe_conf, "stride": j.params.stride, "min_hits": j.params.min_hits, "required_ppe": list(j.params.required), "zone": list(j.params.zone) if j.params.zone else None},
                "progress": {"frames_processed": p.frames_processed, "total_frames_estimate": total, "fraction": (1.0 if j.status == "completed" else min(0.999, p.frames_processed / total) if total else 0.0),
                             "elapsed_seconds": round(p.elapsed, 2), "live_fps": round(p.frames_processed / p.elapsed, 2) if p.elapsed > 0 else 0.0},
                "latest": p.latest, "summary": out.summary if (out and done) else None,
                "outputs": {"original": f"/api/jobs/{j.id}/original", "frames": f"/api/jobs/{j.id}/frames", "result": f"/api/jobs/{j.id}/result", "csv": f"/api/jobs/{j.id}/result.csv",
                            "video_webm": f"/api/jobs/{j.id}/video?format=webm" if out and out.video_webm else None, "video_mp4": f"/api/jobs/{j.id}/video?format=mp4" if out and out.video_mp4 else None},
                "person_model": state["models"].person.model_name, "ppe_model": state["models"].safety.model_name}

    @app.get("/api/jobs/{job_id}")
    def job_status(job_id: str):
        return job_json(need_job(job_id))

    @app.get("/api/jobs/{job_id}/frames")
    def job_frames(job_id: str, start: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=1000)):
        j = need_job(job_id)
        frames = jobs().frames(j, start, limit)
        return {"status": j.status, "start": start, "count": len(frames), "next_start": start + len(frames), "frames": frames, "coordinates": "pixels, relative to the original frame (origin top-left)"}

    @app.post("/api/jobs/{job_id}/stop")
    def job_stop(job_id: str):
        j = need_job(job_id)
        if j.status in ("queued", "running"):
            jobs().cancel(j)
        return {"job_id": j.id, "status": j.status, "stop_requested": True}

    @app.delete("/api/jobs/{job_id}")
    def job_delete(job_id: str):
        jobs().delete(need_job(job_id))
        return {"deleted": True}

    @app.get("/api/jobs/{job_id}/original")
    def job_original(job_id: str):
        j = need_job(job_id)
        mt = {"mp4": "video/mp4", "webm": "video/webm", "mkv": "video/x-matroska", "avi": "video/x-msvideo"}.get(j.input_path.suffix[1:], "video/mp4")
        return FileResponse(j.input_path, media_type=mt)

    @app.get("/api/jobs/{job_id}/video")
    def job_video(job_id: str, format: str = Query("webm", pattern="^(webm|mp4)$")):
        j = need_job(job_id)
        out = j.outputs
        path = (out.video_mp4 if format == "mp4" else out.video_webm) if out else None
        if not path or not path.is_file():
            raise HTTPException(404, "The processed video is not available (still processing, disabled, or this format could not be created).")
        return FileResponse(path, media_type="video/mp4" if format == "mp4" else "video/webm", filename=f"workers-ppe-processed.{format}")

    @app.get("/api/jobs/{job_id}/result")
    def job_result(job_id: str, include_frames: bool = False):
        j = need_job(job_id)
        if j.status in ("queued", "running"):
            raise HTTPException(409, "The job is still running. Poll /api/jobs/{id} for progress.")
        body = job_json(j)
        if include_frames:
            body["frames"] = jobs().frames(j, 0, 10**9)
        return JSONResponse(body, headers={"Content-Disposition": f'attachment; filename="ppe-results-{j.id[:8]}.json"'} if include_frames else {})

    @app.get("/api/jobs/{job_id}/result.csv")
    def job_csv(job_id: str):
        j = need_job(job_id)
        if j.status in ("queued", "running"):
            raise HTTPException(409, "The job is still running.")

        def rows():
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["frame_number", "timestamp_seconds", "class", "worker_track_id", "confidence", "assessment", "hard_hat", "safety_vest", "reasons", "x1", "y1", "x2", "y2"])
            yield buf.getvalue(); buf.seek(0); buf.truncate()
            start = 0
            while True:
                fr = jobs().frames(j, start, 500)
                if not fr:
                    break
                for f in fr:
                    for d in f["detections"]:
                        b = d["bbox"]
                        if d["class"] == "worker":
                            a = d["ppe_assessment"]
                            w.writerow([f["frame_number"], f["timestamp_seconds"], "worker", d["track_id"] if d["track_id"] is not None else "", d["confidence"], a["status"], a["items"]["hard_hat"]["state"], a["items"]["safety_vest"]["state"], "; ".join(a["reasons"]), b["x1"], b["y1"], b["x2"], b["y2"]])
                        else:
                            w.writerow([f["frame_number"], f["timestamp_seconds"], d["class"], d.get("worker_track_id") if d.get("worker_track_id") is not None else "", d["confidence"], "", "", "", "", b["x1"], b["y1"], b["x2"], b["y2"]])
                yield buf.getvalue(); buf.seek(0); buf.truncate()
                start += len(fr)
        return StreamingResponse(rows(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="ppe-detections-{j.id[:8]}.csv"'})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


app = create_app()
