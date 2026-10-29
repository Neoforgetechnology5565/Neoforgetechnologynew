"""Video intelligence API for three demonstrations: restaurant area-presence review, table tennis analysis and basketball analysis.
Person detection and tracking (YOLOX + ByteTrack) and ball tracking run once per video; areas, calibration and thresholds are applied afterwards.
No face recognition, identification or biometric processing is performed, and no employee decision is made by this service."""
from __future__ import annotations

import io
import json
import re
import shutil
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from . import analytics as an_
from .ball import KINDS
from .config import Settings
from .detector import Detector
from .jobs import JobManager, QueueFull, Video
from .media import VIDEO_EXT, MediaError, probe_video, sniff
from .pipeline import MODEL_INFO, JobParams

CHUNK = 1024 * 1024
SAMPLE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
MODES = ("restaurant", "tabletennis", "basketball")

NOTICE = ("Results come from computer-vision models and simple rules over their output. They are fallible and meant to support human review. The service does not recognise faces or "
          "identify people, and it does not make employment, disciplinary or officiating decisions.")


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        state["jobs"] = app.state.jobs = JobManager(s, Detector(s.detector_path, s.intra_threads))
        yield
        state["jobs"].shutdown()

    app = FastAPI(title="Neo Forge video intelligence", version="1.0.0", lifespan=lifespan,
                  description="Person tracking, ball tracking, area-presence events, calibration to a plane and honest sports analytics for human review. " + NOTICE)
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"], expose_headers=["Content-Range", "Accept-Ranges"])
    app.add_middleware(GZipMiddleware, minimum_size=2000)
    hits: dict[str, deque] = defaultdict(deque)

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.method != "OPTIONS":
            ip = request.client.host if request.client else "?"
            q, now = hits[ip], time.time()
            while q and q[0] < now - 60:
                q.popleft()
            if len(q) >= s.rate_per_minute:
                return JSONResponse({"detail": "Too many requests. Please slow down."}, status_code=429, headers={"Retry-After": "10"})
            q.append(now)
        return await call_next(request)

    @app.exception_handler(an_.CalibrationError)
    async def calib(_: Request, e: an_.CalibrationError):
        return JSONResponse({"detail": str(e)}, status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    jobs = lambda: state["jobs"]  # noqa: E731

    def need(vid: str) -> Video:
        v = jobs().get(vid)
        if not v:
            raise HTTPException(404, "Video not found or expired.")
        return v

    def need_done(v: Video):
        if v.status in ("queued", "running"):
            raise HTTPException(409, "Processing is still running.")
        if v.status != "completed" or not v.analysis:
            raise HTTPException(409, f"No results: the video is {v.status}.")
        return v.analysis

    def samples() -> list[dict]:
        m = s.samples_dir / "manifest.json"
        try:
            return json.loads(m.read_text())["samples"] if m.is_file() else []
        except (ValueError, KeyError):
            return []

    def num(d: dict, k: str, lo: float, hi: float, default):
        v = d.get(k, default)
        if v is None:
            return default
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise HTTPException(400, f"{k} must be a number.")
        if not lo <= v <= hi:
            raise HTTPException(400, f"{k} must be between {lo:g} and {hi:g}.")
        return float(v)

    def obj(raw) -> dict:
        if raw is None:
            return {}
        if not isinstance(raw, dict):
            raise HTTPException(400, "The request body must be a JSON object.")
        return raw

    async def save_upload(file: UploadFile, dest: Path, max_bytes: int) -> str:
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
            raise HTTPException(415, "Unsupported file type. Upload an MP4, MOV, WebM, MKV or AVI video.")
        return fmt

    # ---- meta ---------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"ok": True, "models": MODEL_INFO, "ffmpeg": bool(shutil.which("ffmpeg")), "notice": NOTICE, "ball_kinds": KINDS,
                "limits": {"max_video_mb": s.max_video_mb, "max_video_seconds": s.max_video_seconds, "max_analysed_frames": s.max_samples, "max_concurrent_jobs": s.max_concurrent_jobs}}

    @app.get("/api/samples")
    def list_samples(app_name: str | None = Query(None, alias="app")):
        out = [x for x in samples() if not app_name or app_name in x.get("apps", [])]
        return {"samples": [{**x, "video_url": f"/api/samples/{x['id']}/video"} for x in out]}

    @app.get("/api/samples/{sample_id}/video")
    def sample_video(sample_id: str):
        item = next((x for x in samples() if x["id"] == sample_id), None) if SAMPLE_ID.match(sample_id) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        return FileResponse(s.samples_dir / item["file"], media_type="video/mp4")

    @app.get("/api/court-landmarks")
    def landmarks():
        return {"court_m": [an_.COURT_L, an_.COURT_W], "table_m": [an_.TABLE_L, an_.TABLE_W], "landmarks": [{"name": k, "x_m": v[0], "y_m": v[1]} for k, v in an_.COURT_LANDMARKS.items()]}

    # ---- videos -------------------------------------------------------------------------------------------------
    def vjson(v: Video) -> dict:
        pr = v.progress
        el = (v.finished or time.time()) - v.started if v.started else 0.0
        a = v.analysis
        return {"video_id": v.id, "status": v.status, "stage": pr.stage, "source": v.source, "error": v.error, "playback": v.playback_state, "playback_formats": [f for f, x in (("webm", v.playback_webm), ("mp4", v.playback)) if x],
                "video": {"width": v.info.width, "height": v.info.height, "fps": round(v.info.fps, 3), "frames_estimate": v.info.frames, "duration_seconds": round(v.info.duration, 2), "fps_assumed": v.info.fps_assumed},
                "progress": {"frames_done": pr.done, "frames_total": pr.total, "fraction": 1.0 if v.status == "completed" else (min(0.99, pr.done / pr.total) if pr.total else 0.0), "elapsed_seconds": round(el, 2)},
                "params": None if not v.params else v.params.__dict__,
                "summary": None if not a else {**a.counts, "effective_fps": round(a.effective_fps, 2), "range_s": [a.start_s, a.end_s], "timing": a.timing}, "notice": NOTICE}

    @app.post("/api/videos", status_code=201)
    async def upload(file: UploadFile | None = File(None), sample_id: str | None = Form(None)):
        if (file is None) == (sample_id is None):
            raise HTTPException(400, "Send either a video file or a sample_id.")
        try:
            vid, d = jobs().new_dir()
        except QueueFull as e:
            raise HTTPException(503, str(e)) from None
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
                    raise HTTPException(415, "That is an image. Upload a video (MP4, MOV, WebM, MKV or AVI).")
                src = d / f"input.{fmt}"
                (d / "upload.bin").rename(src)
                source = "upload"
            try:
                info = probe_video(src, s.max_pixels, s.max_video_seconds)
            except MediaError as e:
                raise HTTPException(422, str(e)) from None
            v = jobs().add(vid, d, src, info, source)
        except HTTPException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(500, "The upload could not be processed.") from None
        return vjson(v)

    @app.get("/api/videos/{vid}")
    def status(vid: str):
        return vjson(need(vid))

    @app.delete("/api/videos/{vid}")
    def delete(vid: str):
        jobs().delete(need(vid))
        return {"deleted": True}

    @app.post("/api/videos/{vid}/jobs", status_code=202)
    def start(vid: str, body: dict | None = Body(None)):
        v, b = need(vid), obj(body)
        mode = b.get("mode", "restaurant")
        if mode not in MODES:
            raise HTTPException(400, f"mode must be one of {', '.join(MODES)}.")
        kind = b.get("ball_kind", "orange" if mode == "basketball" else "white")
        if kind not in KINDS:
            raise HTTPException(400, f"ball_kind must be one of {', '.join(KINDS)}.")
        default_fps = {"restaurant": 5.0, "tabletennis": 25.0, "basketball": 10.0}[mode]
        start_s = num(b, "start_s", 0, 1e6, 0.0)
        end_s = num(b, "end_s", 0, 1e6, None)
        if end_s is not None and end_s <= start_s:
            raise HTTPException(400, "end_s must be greater than start_s.")
        p = JobParams(mode=mode, sample_fps=num(b, "sample_fps", 1, 30, default_fps), start_s=start_s, end_s=end_s, det_threshold=num(b, "det_threshold", 0.1, 0.9, 0.35),
                      ball=bool(b.get("ball", mode != "restaurant")), ball_kind=kind)
        try:
            jobs().submit(v, p)
        except QueueFull as e:
            raise HTTPException(429, str(e)) from None
        return vjson(v)

    @app.post("/api/videos/{vid}/cancel")
    def cancel(vid: str):
        v = need(vid)
        v.cancel.set()
        return vjson(v)

    @app.get("/api/videos/{vid}/playback")
    def playback(vid: str, format: str = Query("mp4", pattern="^(mp4|webm)$")):
        v = need(vid)
        p = v.playback_webm if format == "webm" else v.playback
        if not p or not p.is_file():
            raise HTTPException(404, "A browser-playable copy in that format is not available (ffmpeg missing or the encode failed). Use the frame viewer instead.")
        return FileResponse(p, media_type="video/webm" if format == "webm" else "video/mp4")

    @app.get("/api/videos/{vid}/frame")
    def frame(vid: str, t: float = Query(0.0, ge=0), w: int = Query(960, ge=160, le=1920)):
        v = need(vid)
        cap = cv2.VideoCapture(str(v.input_path))
        try:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * v.info.fps))
            ok, img = cap.read()
        finally:
            cap.release()
        if not ok or img is None:
            raise HTTPException(404, "No frame at that time.")
        if img.shape[1] > w:
            img = cv2.resize(img, (w, int(img.shape[0] * w / img.shape[1])), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        return Response(buf.tobytes(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.get("/api/videos/{vid}/observations")
    def observations(vid: str):
        """Everything detected, for drawing overlays in the browser: persons per analysed frame and the ball track."""
        v = need(vid)
        a = need_done(v)
        return {"width": a.width, "height": a.height, "effective_fps": a.effective_fps, "frames": [{"t": f["t"], "persons": [[p["id"], *p["box"]] for p in f["persons"]], "ball": None if not f["ball"] else [f["ball"]["x"], f["ball"]["y"], f["ball"]["src"]]} for f in a.frames],
                "tracks": an_.track_summary(a), "ball_points": a.ball_points, "model": MODEL_INFO}

    # ---- analyses (derived from stored observations; instant) ----------------------------------------------------
    @app.post("/api/videos/{vid}/analyze/restaurant")
    def restaurant(vid: str, body: dict = Body(...)):
        v, b = need(vid), obj(body)
        a = need_done(v)
        poly = an_.valid_polygon(b.get("roi"))
        res = an_.presence_events(a, poly, num(b, "min_stay_s", 1, 36000, 60.0), num(b, "merge_gap_s", 0, 600, 3.0), int(num(b, "min_observations", 1, 100, 3)))
        res["occupancy"] = an_.occupancy(a, poly, num(b, "bin_s", 1, 600, 5.0))
        res["tracks"] = an_.track_summary(a)
        emp = b.get("employees")
        if emp is not None:
            if not isinstance(emp, list) or len(emp) > 50 or not all(isinstance(e, dict) and isinstance(e.get("id"), str) and isinstance(e.get("name"), str) for e in emp):
                raise HTTPException(400, "employees must be a list of up to 50 objects with id, name, shift_start and shift_end.")
            links = b.get("links") or {}
            if not isinstance(links, dict) or not all(isinstance(k, str) and isinstance(x, str) for k, x in links.items()):
                raise HTTPException(400, "links must map track ids to employee ids.")
            res["attendance"] = an_.attendance(res["events"], emp, links, str(b.get("clock_start", "00:00:00")), a.start_s, a.end_s, num(b, "tolerance_min", 0, 240, 10.0))
        res["limits"] = ["Tracks are temporary numbers. After occlusion or crossing a person can receive a new number, which splits one visit into several events.",
                         "Presence is judged from the point where the person's feet appear to touch the floor (bottom centre of the box). Tall objects and camera angle can shift it.",
                         "A flag means the observed time reached your threshold. It says nothing about the reason, and it must be reviewed by a person with the video."]
        return res

    @app.post("/api/videos/{vid}/analyze/tabletennis")
    def tabletennis(vid: str, body: dict = Body(...)):
        v, b = need(vid), obj(body)
        a = need_done(v)
        corners = b.get("corners")
        if not isinstance(corners, list) or len(corners) != 4:
            raise HTTPException(400, "corners must list the four table corners (left-near, right-near, right-far, left-far) as [x, y] image points.")
        if not a.params.ball:
            raise HTTPException(409, "Ball tracking was not enabled for this analysis. Run it again with ball tracking on.")
        return an_.table_tennis(a, corners, num(b, "gap_s", 0.05, 5, 0.6), num(b, "min_len_s", 0.1, 60, 0.8), int(num(b, "min_points", 2, 500, 4)))

    @app.post("/api/videos/{vid}/analyze/basketball")
    def basketball(vid: str, body: dict = Body(...)):
        v, b = need(vid), obj(body)
        a = need_done(v)
        refs = b.get("references")
        if not isinstance(refs, list) or len(refs) < 4 or len(refs) > 30:
            raise HTTPException(400, "references must list at least four matches of {image: [x, y], world: [x_m, y_m]}.")
        try:
            img, world = [r["image"] for r in refs], [r["world"] for r in refs]
        except (TypeError, KeyError):
            raise HTTPException(400, "Each reference needs image and world coordinates.") from None
        ids = b.get("track_ids")
        if ids is not None and (not isinstance(ids, list) or not all(isinstance(i, int) for i in ids)):
            raise HTTPException(400, "track_ids must be a list of integers.")
        return an_.basketball(a, img, world, num(b, "cell_m", 0.5, 4, 1.0), ids, num(b, "min_possession_s", 0.1, 30, 0.6), num(b, "margin_frac", 0, 0.5, 0.08))

    # ---- evidence clips and reports -----------------------------------------------------------------------------------
    @app.post("/api/videos/{vid}/clip")
    def clip(vid: str, body: dict = Body(...)):
        v, b = need(vid), obj(body)
        a = need_done(v)
        t0, t1 = num(b, "t0", 0, 1e6, None), num(b, "t1", 0, 1e6, None)
        if t0 is None or t1 is None or t1 <= t0:
            raise HTTPException(400, "t0 and t1 are required and t1 must be greater than t0.")
        pad = num(b, "pad_s", 0, 10, 2.0)
        t0, t1 = max(0.0, t0 - pad), min(max(a.end_s, t1), t1 + pad)
        if t1 - t0 > 30:
            raise HTTPException(422, "Evidence clips are limited to 30 seconds.")
        ids = b.get("track_ids", [])
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            raise HTTPException(400, "track_ids must be a list of integers.")
        roi = b.get("roi")
        if roi is not None:
            roi = an_.valid_polygon(roi)
        try:
            key, (mp4, web) = jobs().clip(v, t0, t1, ids, roi)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        except RuntimeError:
            raise HTTPException(503, "Clip encoding is not available on this server (ffmpeg is required).") from None
        return {"clip_id": key, "url": f"/api/videos/{vid}/clips/{key}?format=mp4", "url_webm": f"/api/videos/{vid}/clips/{key}?format=webm" if web else None, "has_mp4": mp4.suffix == ".mp4", "t0": round(t0, 2), "t1": round(t1, 2)}

    @app.get("/api/videos/{vid}/clips/{cid}")
    def get_clip(vid: str, cid: str, format: str = Query("mp4", pattern="^(mp4|webm)$")):
        v = need(vid)
        pair = v.clips.get(cid) if re.fullmatch(r"[0-9a-f]{12}", cid) else None
        p = None if not pair else (pair[1] if format == "webm" else (pair[0] if pair[0].suffix == ".mp4" else None))
        if not p or not p.is_file():
            raise HTTPException(404, "Clip not found.")
        return FileResponse(p, media_type="video/webm" if format == "webm" else "video/mp4")

    @app.post("/api/report/pdf")
    def report(body: dict = Body(...)):
        from .report import build
        b = obj(body)
        title = str(b.get("title", "Report"))[:120]
        secs = b.get("sections")
        if not isinstance(secs, list) or not secs or len(secs) > 20:
            raise HTTPException(400, "sections must be a list of 1-20 sections.")
        try:
            pdf = build(title, str(b.get("subtitle", ""))[:300], secs, str(b.get("footer", ""))[:400])
        except (TypeError, ValueError, KeyError):
            raise HTTPException(400, "Each section needs a heading and optional text, rows or lines.") from None
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="report.pdf"'})

    return app


app = create_app()
