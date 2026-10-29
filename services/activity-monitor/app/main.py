"""Human activity review API: person detection and tracking, pose estimation and candidate-event rules (fall, rapid close contact) for human review.
Only these responsibilities: no accounts, cameras, identities, face recognition, emergency dispatch or notification."""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from .activity import AggressionParams, FallParams
from .config import Settings
from .detector import PersonDetector
from .jobs import STATUSES, JobManager, QueueFull, Video
from .media import VIDEO_EXT, MediaError, probe_video, sniff
from .pipeline import MODEL_INFO, JobParams, frames_json
from .pose import PoseEstimator
from .render import render

CHUNK = 1024 * 1024
SAMPLE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
ALERT_ID = re.compile(r"^[0-9a-f]{32}-[0-9]{1,5}$")

NOTICE = ("Alerts are candidates produced by simple rules over person detections and pose estimates. They are fallible: they miss real events and flag harmless ones. "
          "A person must review every alert. This is not an emergency, safety or security system and must not be relied on to detect falls or violence. It does not identify people.")

LIMITS = [
    "No face recognition or identification: track numbers are temporary labels for this video only, and they can switch after occlusion or crossings.",
    "The fall rule looks for an upright-to-lying change in torso tilt, hip height and box shape that then persists. It has not been validated on a labelled fall dataset; sensitivity and false-alarm rates are unknown.",
    "Falls out of view, behind objects, toward or away from the camera, from a seated position, or under a ceiling-mounted camera are likely to be missed or mis-measured.",
    "People lying down deliberately, bending, crouching, sitting down quickly, exercising or playing can satisfy the fall rule.",
    "The rapid close-contact rule flags two people who stay close while a wrist moves fast relative to the person's own hips. Dancing, sport, play, hugging and handshakes do the same; nothing measures contact, force or intent.",
    "Pose estimates are unreliable for small, blurred, partly hidden or horizontal people. Analysis is at a reduced frame rate (default 5 fps), so very fast motion is under-sampled.",
    "Thresholds were set by inspection on a pedestrian-only clip, which bounds false alarms on walking only; they say nothing about detection rates for real events.",
]


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        det, pose = PersonDetector(s.detector_path, s.intra_threads), PoseEstimator(s.pose_path, s.intra_threads)
        state["jobs"] = app.state.jobs = JobManager(s, det, pose)
        yield
        state["jobs"].shutdown()

    app = FastAPI(title="Neo Forge human activity review", version="1.0.0", lifespan=lifespan,
                  description="Detects and tracks people (YOLOX + ByteTrack), estimates pose (BlazePose) and proposes fall and rapid-close-contact candidate events for human review. " + NOTICE)
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["*"], expose_headers=["Content-Range", "Accept-Ranges"])
    app.add_middleware(GZipMiddleware, minimum_size=2000)

    def jobs() -> JobManager:
        return state["jobs"]

    def need(vid: str) -> Video:
        v = jobs().get(vid)
        if not v:
            raise HTTPException(404, "Video not found or expired.")
        return v

    def need_done(v: Video) -> None:
        if v.status in ("queued", "running"):
            raise HTTPException(409, "Processing is still running. Poll /api/videos/{id}/status.")
        if v.status != "completed" or not v.analysis:
            raise HTTPException(409, f"No results: the video is {v.status}.")

    def samples() -> list[dict]:
        m = s.samples_dir / "manifest.json"
        try:
            return json.loads(m.read_text())["samples"] if m.is_file() else []
        except (ValueError, KeyError):
            return []

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

    # ---- meta -------------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        j = jobs()
        return {"ok": True, "models": MODEL_INFO, "ffmpeg": bool(shutil.which("ffmpeg")), "notice": NOTICE,
                "active_jobs": sum(1 for x in j.videos.values() if x.status in ("queued", "running")),
                "limits": {"max_video_mb": s.max_video_mb, "max_video_seconds": s.max_video_seconds, "max_analysed_frames": s.max_samples, "max_concurrent_jobs": s.max_concurrent_jobs}}

    @app.get("/api/samples")
    def list_samples():
        return {"samples": [{**x, "video_url": f"/api/samples/{x['id']}/video"} for x in samples()]}

    @app.get("/api/samples/{sample_id}/video")
    def sample_video(sample_id: str):
        item = next((x for x in samples() if x["id"] == sample_id), None) if SAMPLE_ID.match(sample_id) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        return FileResponse(s.samples_dir / item["file"], media_type="video/mp4")

    # ---- videos -----------------------------------------------------------------------------------------------------
    def video_json(v: Video) -> dict:
        pr, done = v.progress, v.status in ("completed", "cancelled", "failed")
        el = (v.finished or time.time()) - v.started if v.started else 0.0
        return {"video_id": v.id, "status": v.status, "stage": pr.stage, "source": v.source, "error": v.error, "error_detail": v.error_detail,
                "video": {"width": v.info.width, "height": v.info.height, "fps": round(v.info.fps, 3), "frames_estimate": v.info.frames, "duration_seconds": round(v.info.duration, 2), "fps_assumed": v.info.fps_assumed},
                "progress": {"frames_done": pr.done, "frames_total": pr.total, "fraction": 1.0 if v.status == "completed" else (min(0.99, pr.done / pr.total) if pr.total else 0.0), "elapsed_seconds": round(el, 2)},
                "preview": v.preview_state, "preview_done": v.preview_done, "preview_formats": [f for f, x in (("mp4", v.preview), ("webm", v.preview_webm)) if x],
                "alert_count": len(v.alerts) if done else None, "notice": NOTICE}

    @app.post("/api/videos/upload", status_code=201)
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
                info = probe_video(src, s.max_pixels, 10 ** 9)
            except MediaError as e:
                raise HTTPException(422, str(e)) from None
            v = jobs().add(vid, d, src, info, source)
        except HTTPException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(500, "The upload could not be processed.") from None
        return video_json(v)

    def num(d: dict, k: str, lo: float, hi: float, default: float | None):
        v = d.get(k, default)
        if v is None:
            return default
        if isinstance(v, bool):
            raise HTTPException(400, f"{k} must be a number.")
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise HTTPException(400, f"{k} must be a number.") from None
        if not (lo <= v <= hi):
            raise HTTPException(400, f"{k} must be between {lo} and {hi}.")
        return v

    def parse_rules(d: dict) -> tuple[FallParams, AggressionParams]:
        f, a = d.get("fall") or {}, d.get("aggression") or {}
        if not isinstance(f, dict) or not isinstance(a, dict):
            raise HTTPException(400, "fall and aggression must be objects.")
        fd, ad = FallParams(), AggressionParams()
        return (FallParams(min_upright_s=num(f, "min_upright_s", 0.2, 10, fd.min_upright_s), window_s=num(f, "window_s", 0.3, 5, fd.window_s), upright_tilt_deg=num(f, "upright_tilt_deg", 5, 60, fd.upright_tilt_deg),
                           lying_tilt_deg=num(f, "lying_tilt_deg", 40, 120, fd.lying_tilt_deg), lying_aspect=num(f, "lying_aspect", 0.8, 3, fd.lying_aspect), min_drop_torso=num(f, "min_drop_torso", 0.1, 3, fd.min_drop_torso),
                           drop_height_ratio=num(f, "drop_height_ratio", 0.2, 0.95, fd.drop_height_ratio), min_lying_s=num(f, "min_lying_s", 0.2, 20, fd.min_lying_s), min_visibility=num(f, "min_visibility", 0.1, 0.95, fd.min_visibility)),
                AggressionParams(max_distance=num(a, "max_distance", 0.2, 3, ad.max_distance), min_arm_speed=num(a, "min_arm_speed", 1, 30, ad.min_arm_speed), min_duration_s=num(a, "min_duration_s", 0.3, 20, ad.min_duration_s),
                                 min_fraction=num(a, "min_fraction", 0.1, 1, ad.min_fraction), min_visibility=num(a, "min_visibility", 0.1, 0.95, ad.min_visibility)))

    def body_dict(raw) -> dict:
        if raw is None:
            return {}
        if not isinstance(raw, dict):
            raise HTTPException(400, "The request body must be a JSON object.")
        return raw

    @app.post("/api/videos/{vid}/process", status_code=202)
    def process(vid: str, body: dict | None = Body(None)):
        v = need(vid)
        d = body_dict(body)
        fall, aggr = parse_rules(d)
        end = d.get("end_s")
        p = JobParams(sample_fps=num(d, "sample_fps", 1, 12, 5), start_s=num(d, "start_s", 0, 86400, 0), end_s=num(d, "end_s", 0.5, 86400, None) if end is not None else None,
                      det_threshold=num(d, "det_threshold", 0.15, 0.95, 0.35), pose=bool(d.get("pose", True)), fall=fall, aggression=aggr)
        if p.end_s is not None and p.end_s <= p.start_s:
            raise HTTPException(400, "end_s must be greater than start_s.")
        if v.info.duration and p.start_s >= v.info.duration:
            raise HTTPException(400, "start_s is beyond the end of the video.")
        window = (min(p.end_s, v.info.duration) if (p.end_s is not None and v.info.duration) else (p.end_s or v.info.duration)) - p.start_s
        if window > s.max_video_seconds:
            raise HTTPException(422, f"The selected part is {window:.0f} s long. This service analyses up to {s.max_video_seconds} s per job; use start_s and end_s to choose a part.")
        if window * p.sample_fps > s.max_samples:
            raise HTTPException(422, f"That would analyse about {window * p.sample_fps:.0f} frames; the limit is {s.max_samples}. Lower sample_fps or choose a shorter part.")
        try:
            jobs().submit(v, p)
        except QueueFull as e:
            raise HTTPException(503, str(e)) from None
        return video_json(v)

    @app.get("/api/videos/{vid}/status")
    def status(vid: str):
        return video_json(need(vid))

    @app.post("/api/videos/{vid}/cancel")
    def cancel(vid: str):
        v = need(vid)
        if v.status in ("queued", "running"):
            v.cancel.set()
        return {"video_id": v.id, "status": v.status, "cancel_requested": True}

    @app.delete("/api/videos/{vid}")
    def delete(vid: str):
        jobs().delete(need(vid))
        return {"deleted": True}

    @app.get("/api/videos/{vid}/video")
    def video_file(vid: str, format: str = Query("mp4", pattern="^(mp4|webm)$"), original: bool = False):
        v = need(vid)
        if not original:
            path, mt = (v.preview_webm, "video/webm") if format == "webm" else (v.preview, "video/mp4")
            if path and path.is_file():
                return FileResponse(path, media_type=mt)
            if v.preview_state == "pending" or v.preview_state == "ready" and not path and v.status in ("uploaded", "queued", "running"):
                raise HTTPException(425, "The browser preview is still being prepared.")
            if v.preview_state == "ready":
                raise HTTPException(404, f"No {format} preview could be created on this server.")
        mt = {"mp4": "video/mp4", "webm": "video/webm", "mkv": "video/x-matroska", "avi": "video/x-msvideo"}.get(v.input_path.suffix[1:], "video/mp4")
        return FileResponse(v.input_path, media_type=mt)

    # ---- results ----------------------------------------------------------------------------------------------------
    def summary_json(v: Video) -> dict:
        an = v.analysis
        pose_frames = {tid: sum(1 for x in tr if x.kp is not None) for tid, tr in an.tracks.items()}
        by_kind: dict[str, int] = {}
        by_status = {k: 0 for k in STATUSES}
        for a in v.alerts:
            by_kind[a.cand.kind] = by_kind.get(a.cand.kind, 0) + 1
            by_status[a.status] += 1
        tracks = [{"id": tid, "first_s": tr[0].t, "last_s": tr[-1].t, "observations": len(tr), "with_pose": pose_frames[tid]} for tid, tr in sorted(an.tracks.items())]
        p = v.params
        return {**video_json(v), "counts": {**an.counts, "alerts": len(v.alerts), "alerts_by_kind": by_kind, "alerts_by_status": by_status, "tracks_with_pose": sum(1 for n in pose_frames.values() if n)},
                "analysed_fps": round(an.effective_fps, 2), "timing_seconds": an.timing, "tracks": tracks, "models": MODEL_INFO, "limitations": LIMITS,
                "params": {"sample_fps": p.sample_fps, "start_s": p.start_s, "end_s": p.end_s, "det_threshold": p.det_threshold, "pose": p.pose, "fall": p.fall.__dict__, "aggression": p.aggression.__dict__},
                "warnings": ([f"{sum(1 for t in tracks if t['observations'] < 5)} of {len(tracks)} tracks lasted fewer than 5 analysed frames; identity switches and fragmentation are likely in crowded or distant scenes."] if tracks else ["No people were detected in the analysed frames."])}

    @app.get("/api/videos/{vid}/summary")
    def summary(vid: str):
        v = need(vid)
        need_done(v)
        return summary_json(v)

    @app.get("/api/videos/{vid}/alerts")
    def alerts(vid: str, status: str | None = Query(None, pattern="^(pending|confirmed|dismissed|uncertain)$")):
        v = need(vid)
        need_done(v)
        rows = [a.public() for a in v.alerts if status is None or a.status == status]
        return {"video_id": v.id, "alerts": rows, "notice": NOTICE}

    @app.get("/api/videos/{vid}/frames")
    def frames(vid: str, start: float = Query(0.0, ge=0, le=86400), end: float = Query(86400.0, ge=0, le=86400)):
        """Per-frame boxes, track ids and 33 pose keypoints (x, y, visibility) for the analysed frames in [start, end] seconds."""
        v = need(vid)
        need_done(v)
        an = v.analysis
        lo = next((i for i, t in enumerate(an.times) if t >= start), len(an.times))
        hi = next((i for i, t in enumerate(an.times) if t > end), len(an.times))
        return {"width": v.info.width, "height": v.info.height, "analysed_fps": round(an.effective_fps, 2), "frames": frames_json(an, lo, hi)}

    @app.post("/api/videos/{vid}/reanalyse")
    def reanalyse(vid: str, body: dict | None = Body(None)):
        """Re-evaluate the rules with new thresholds on the stored detections (no video processing). Existing alerts, with any reviews, are replaced."""
        v = need(vid)
        need_done(v)
        d = body_dict(body)
        if any(a.status != "pending" for a in v.alerts) and not d.get("discard_reviews"):
            raise HTTPException(409, "Some alerts have been reviewed. Re-analysing replaces them; send discard_reviews: true to proceed.")
        fall, aggr = parse_rules(d)
        p = v.params
        p.fall, p.aggression = fall, aggr
        jobs().rederive(v, p)
        return {"alerts": [a.public() for a in v.alerts], "notice": NOTICE}

    @app.post("/api/alerts/{alert_id}/review")
    def review(alert_id: str, body: dict = Body(...)):
        if not ALERT_ID.match(alert_id):
            raise HTTPException(404, "Alert not found.")
        hit = jobs().find_alert(alert_id)
        if not hit:
            raise HTTPException(404, "Alert not found or expired.")
        _, a = hit
        st = body.get("status")
        if st not in STATUSES:
            raise HTTPException(400, "status must be one of: " + ", ".join(STATUSES))
        note = body.get("note", a.note)
        if not isinstance(note, str):
            raise HTTPException(400, "note must be text.")
        a.status, a.note = st, note.strip()[:1000]
        a.reviewed_at = None if st == "pending" else time.time()
        return a.public()

    @app.patch("/api/alerts/{alert_id}/review")
    def review_patch(alert_id: str, body: dict = Body(...)):
        return review(alert_id, body)

    @app.get("/api/videos/{vid}/annotated")
    def annotated(vid: str, alert: str | None = Query(None), pad: float = Query(2.0, ge=0, le=10), overlay: str = Query("all", pattern="^(all|boxes|pose)$")):
        """Annotated MP4 (boxes, track ids, pose) of the whole video, or of one alert with `pad` seconds around it. Rendered on demand."""
        v = need(vid)
        need_done(v)
        an = v.analysis
        t0, t1, flagged, tag = 0.0, (an.times[-1] if an.times else 0.0) + 1.0 / max(an.effective_fps, 1), set(), "all"
        if alert:
            a = next((x for x in v.alerts if x.id == alert), None) if ALERT_ID.match(alert) else None
            if not a:
                raise HTTPException(404, "Alert not found.")
            t0, t1, flagged, tag = max(0.0, a.cand.t_start - pad), min(v.info.duration or 1e9, a.cand.t_end + pad), set(a.cand.tracks), a.id.split("-")[1] + f"-{pad:g}"
        elif t1 - t0 > 300:
            raise HTTPException(422, "Rendering the whole video is limited to 300 s; request an alert clip instead.")
        dst = v.dir / f"annotated-{tag}-{overlay}.mp4"
        with v.render_lock:
            if not dst.is_file():
                try:
                    render(an, v.input_path, dst, v.info.fps, t0, t1, flagged, boxes=overlay != "pose", skeleton=overlay != "boxes")
                except RuntimeError as e:
                    raise HTTPException(503, f"The annotated video could not be created: {e}") from None
        return FileResponse(dst, media_type="video/mp4", filename=f"annotated-{vid[:8]}-{tag}.mp4")

    @app.get("/api/videos/{vid}/export")
    def export(vid: str, kind: str = Query("alerts.json", pattern="^(alerts\\.json|alerts\\.csv)$")):
        v = need(vid)
        need_done(v)
        rows = [a.public() for a in v.alerts]
        if kind == "alerts.json":
            body = json.dumps({"video_id": v.id, "source": v.source, "notice": NOTICE, "alerts": rows}, indent=1)
            return Response(body, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="alerts-{v.id[:8]}.json"'})
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["alert_id", "kind", "tracks", "start_s", "end_s", "peak_s", "criteria_met", "criteria_total", "status", "reviewer_note", "evidence"])
        for r in rows:
            w.writerow([r["id"], r["kind"], " ".join(map(str, r["tracks"])), round(r["t_start"], 2), round(r["t_end"], 2), round(r["t_peak"], 2), r["criteria_met"], r["criteria_total"], r["status"], r["note"],
                        "; ".join(f"{e['name']}={e['value']} (threshold {e['threshold']})" for e in r["evidence"])])
        return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="alerts-{v.id[:8]}.csv"'})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


app = create_app()
