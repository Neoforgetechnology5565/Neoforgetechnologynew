"""Sports video analysis API: player and ball detection, tracking, pitch mapping and statistics. Only these responsibilities: no accounts, teams database, billing or CRM."""
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
import numpy as np
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .config import Settings
from .footandball import FootAndBall
from .jobs import Job, JobManager, QueueFull
from .media import VIDEO_EXT, MediaError, probe_video, sniff
from .pipeline import MODEL_INFO, JobParams
from .pitch import landmarks
from .stats import CELL_M, SIGMA_CELLS, grid_shape, heatmap, in_pitch

CHUNK = 1024 * 1024
SAMPLE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        det = FootAndBall(s.model_path, s.intra_threads)
        state["det"], state["jobs"] = det, JobManager(s, det)
        yield
        state["jobs"].shutdown()

    app = FastAPI(title="Neo Forge sports video intelligence", version="1.0.0", lifespan=lifespan,
                  description="Detects and tracks players and the ball in football match video (FootAndBall + ByteTrack), estimates camera motion, maps positions onto the pitch from user-identified landmarks and derives statistics and heatmaps. Track IDs are temporary labels; there is no player identification.")
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"], expose_headers=["Content-Range", "Accept-Ranges", "X-Frame-Time", "X-Frame-Index"])
    app.add_middleware(GZipMiddleware, minimum_size=2000)

    def jobs() -> JobManager:
        return state["jobs"]

    def need_job(job_id: str) -> Job:
        j = jobs().get(job_id)
        if not j:
            raise HTTPException(404, "Job not found or expired.")
        return j

    def need_results(j: Job) -> dict:
        if j.status in ("queued", "running"):
            raise HTTPException(409, "The job is still running. Poll /api/sports/jobs/{id} for progress.")
        if j.status != "completed" or not j.analysis or not j.analysis.results:
            raise HTTPException(409, f"No results: the job {j.status}.")
        return j.analysis.results

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

    def samples() -> list[dict]:
        m = s.samples_dir / "manifest.json"
        if not m.is_file():
            return []
        try:
            return json.loads(m.read_text())["samples"]
        except (ValueError, KeyError):
            return []

    # ---- meta -------------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        j = jobs()
        return {"ok": True, "model": MODEL_INFO, "detector": state["det"].model_name, "tracker": "ByteTrack", "ffmpeg": bool(shutil.which("ffmpeg")), "sports": ["football"],
                "active_jobs": sum(1 for x in j.jobs.values() if x.status in ("queued", "running")),
                "limits": {"max_video_mb": s.max_video_mb, "max_video_seconds": s.max_video_seconds, "max_analysed_frames": s.max_samples, "max_concurrent_jobs": s.max_concurrent_jobs}}

    @app.get("/api/sports/samples")
    def list_samples():
        return {"samples": [{**x, "video_url": f"/api/sports/samples/{x['id']}/video"} for x in samples()]}

    @app.get("/api/sports/samples/{sample_id}/video")
    def sample_video(sample_id: str):
        item = next((x for x in samples() if x["id"] == sample_id), None) if SAMPLE_ID.match(sample_id) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        return FileResponse(s.samples_dir / item["file"], media_type="video/mp4")

    @app.get("/api/sports/pitch")
    def pitch_model(length: float = Query(105.0, ge=40, le=130), width: float = Query(68.0, ge=30, le=100)):
        return {"length_m": length, "width_m": width, "landmarks": list(landmarks(length, width).values()), "origin": "top-left of the diagram; x along the touchline, y across the pitch"}

    # ---- analysis jobs ----------------------------------------------------------------------------------------------
    def parse_params(raw: str | None) -> tuple[JobParams, dict]:
        try:
            d = json.loads(raw) if raw else {}
            if not isinstance(d, dict):
                raise ValueError
        except ValueError:
            raise HTTPException(400, "params must be a JSON object.") from None
        def num(k, lo, hi, default):
            v = d.get(k, default)
            if v is None:
                return default
            try:
                v = float(v)
            except (TypeError, ValueError):
                raise HTTPException(400, f"{k} must be a number.") from None
            if not (lo <= v <= hi):
                raise HTTPException(400, f"{k} must be between {lo} and {hi}.")
            return v
        sport = str(d.get("sport", "football"))
        if sport != "football":
            raise HTTPException(400, "Only football is supported in this version. The pipeline is structured so other sports can be added.")
        mode = str(d.get("team_mode", "auto"))
        if mode not in ("auto", "off", "colors"):
            raise HTTPException(400, "team_mode must be auto, off or colors.")
        colours = d.get("team_colors")
        if mode == "colors" and not (isinstance(colours, list) and len(colours) == 2 and all(isinstance(c, str) and HEX.match(c) for c in colours)):
            raise HTTPException(400, "team_colors must be two #rrggbb colours when team_mode is colors.")
        end = d.get("end_s")
        p = JobParams(sport=sport, sample_fps=num("sample_fps", 1, 12, 5), start_s=num("start_s", 0, 86400, 0), end_s=num("end_s", 0.5, 86400, None) if end is not None else None,
                      player_conf=num("player_conf", 0.2, 0.95, 0.5), ball_conf=num("ball_conf", 0.1, 0.95, 0.3), detect_scale=num("detect_scale", 0.4, 1.0, None) if d.get("detect_scale") is not None else None, min_hits=int(num("min_hits", 2, 30, 5)),
                      analyse_ball=bool(d.get("analyse_ball", True)), team_mode=mode, team_colors=colours if mode == "colors" else None, pitch_length=num("pitch_length", 40, 130, 105), pitch_width=num("pitch_width", 30, 100, 68),
                      match_label=str(d.get("match_label"))[:80] if d.get("match_label") else None, declared_duration_s=num("declared_duration_s", 1, 20000, None) if d.get("declared_duration_s") is not None else None,
                      calibration=d.get("calibration") if isinstance(d.get("calibration"), dict) else None)
        if p.end_s is not None and p.end_s <= p.start_s:
            raise HTTPException(400, "end_s must be greater than start_s.")
        return p, d

    def job_json(j: Job) -> dict:
        pr = j.progress
        done = j.status in ("completed", "cancelled", "failed")
        total = pr.samples_total
        el = (j.finished or time.time()) - j.started if j.started else 0.0
        r = j.analysis.results if (j.analysis and j.analysis.results) else None
        return {"job_id": j.id, "status": j.status, "stage": pr.stage, "source": j.source, "error": j.error, "error_detail": j.error_detail,
                "video": {"width": j.info.width, "height": j.info.height, "fps": round(j.info.fps, 3), "frames_estimate": j.info.frames, "duration_seconds": round(j.info.duration, 2), "fps_assumed": j.info.fps_assumed},
                "params": {k: getattr(j.params, k) for k in ("sport", "sample_fps", "start_s", "end_s", "player_conf", "ball_conf", "detect_scale", "min_hits", "analyse_ball", "team_mode", "pitch_length", "pitch_width", "match_label", "declared_duration_s")},
                "progress": {"samples_done": pr.samples_done, "samples_total": total, "fraction": 1.0 if j.status == "completed" else (min(0.99, pr.samples_done / total) if total else 0.0), "elapsed_seconds": round(el, 2),
                             "live_fps": round(pr.samples_done / pr.elapsed, 2) if pr.elapsed > 0 else 0.0, "player_detections": pr.detections},
                "latest": pr.latest, "preview": j.preview_state, "preview_formats": [f for f, x in (("mp4", j.preview), ("webm", j.preview_webm)) if x], "summary": r["summary"] if (r and done) else None,
                "urls": {"video": f"/api/sports/jobs/{j.id}/video", "results": f"/api/sports/jobs/{j.id}/results", "frame": f"/api/sports/jobs/{j.id}/frame"}}

    @app.post("/api/sports/analyze", status_code=202)
    async def analyze(file: UploadFile | None = File(None), sample_id: str | None = Form(None), params: str | None = Form(None)):
        p, _ = parse_params(params)
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
                    raise HTTPException(415, "That is an image. Upload a match video (MP4, MOV, WebM, MKV or AVI).")
                src = d / f"input.{fmt}"
                (d / "upload.bin").rename(src)
                source = "upload"
            try:
                info = probe_video(src, s.max_pixels, 10 ** 9)
            except MediaError as e:
                raise HTTPException(422, str(e)) from None
            window = (min(p.end_s, info.duration) if (p.end_s is not None and info.duration) else (p.end_s or info.duration)) - p.start_s
            if info.duration and p.start_s >= info.duration:
                raise HTTPException(400, "start_s is beyond the end of the video.")
            if window > s.max_video_seconds:
                raise HTTPException(422, f"The selected part is {window:.0f} s long. This service analyses up to {s.max_video_seconds} s per job; use start_s and end_s to choose a part.")
            if info.duration and p.declared_duration_s and abs(p.declared_duration_s - info.duration) > max(5.0, 0.1 * info.duration):
                pass  # reported in results.warnings instead of rejecting: the declared duration is only informational metadata
            job = jobs().submit(jid, d, src, info, p, source)
        except QueueFull as e:
            raise HTTPException(503, str(e)) from None
        except HTTPException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise HTTPException(500, "The upload could not be processed.") from None
        return job_json(job)

    @app.get("/api/sports/jobs/{job_id}")
    def job_status(job_id: str):
        return job_json(need_job(job_id))

    @app.post("/api/sports/jobs/{job_id}/cancel")
    def job_cancel(job_id: str):
        j = need_job(job_id)
        if j.status in ("queued", "running"):
            jobs().cancel(j)
        return {"job_id": j.id, "status": j.status, "cancel_requested": True}

    @app.delete("/api/sports/jobs/{job_id}")
    def job_delete(job_id: str):
        jobs().delete(need_job(job_id))
        return {"deleted": True}

    @app.get("/api/sports/jobs/{job_id}/video")
    def job_video(job_id: str, format: str = Query("mp4", pattern="^(mp4|webm)$"), original: bool = False):
        """The browser preview (H.264 MP4 or VP9 WebM, Range requests supported) or, with original=true, the uploaded file itself."""
        j = need_job(job_id)
        if not original:
            path, mt = (j.preview_webm, "video/webm") if format == "webm" else (j.preview, "video/mp4")
            if path and path.is_file():
                return FileResponse(path, media_type=mt)
            if j.preview_state == "pending" or (j.preview_state == "ready" and not path and not j.cancel.is_set() and j.finished is None):
                raise HTTPException(425, "The browser preview is still being prepared.")
            if j.preview_state == "ready":
                raise HTTPException(404, f"No {format} preview could be created on this server.")
        mt = {"mp4": "video/mp4", "webm": "video/webm", "mkv": "video/x-matroska", "avi": "video/x-msvideo"}.get(j.input_path.suffix[1:], "video/mp4")
        return FileResponse(j.input_path, media_type=mt)

    @app.get("/api/sports/jobs/{job_id}/frame")
    def job_frame(job_id: str, time_s: float = Query(0.0, alias="time", ge=0, le=86400), max_width: int = Query(1600, ge=320, le=3840)):
        """One decoded source frame as JPEG, snapped to the nearest analysed frame when analysis exists (calibration clicks refer to that frame)."""
        j = need_job(job_id)
        idx = int(round(time_s * j.info.fps))
        if j.analysis and j.analysis.samples:
            ts = np.array([x["t"] for x in j.analysis.samples])
            idx = j.analysis.samples[int(np.abs(ts - time_s).argmin())]["i"]
        cap = cv2.VideoCapture(str(j.input_path))
        try:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, fr = cap.read()
            if not ok and idx > 0:
                raise HTTPException(404, "That frame could not be decoded.")
            h, w = fr.shape[:2]
            sc = min(1.0, max_width / w)
            if sc < 1.0:
                fr = cv2.resize(fr, (int(w * sc), int(h * sc)), interpolation=cv2.INTER_AREA)
            ok, buf = cv2.imencode(".jpg", fr, [cv2.IMWRITE_JPEG_QUALITY, 88])
        finally:
            cap.release()
        return Response(buf.tobytes(), media_type="image/jpeg", headers={"X-Frame-Index": str(idx), "X-Frame-Time": f"{idx / j.info.fps:.3f}", "Cache-Control": "no-store"})

    @app.get("/api/sports/jobs/{job_id}/results")
    def job_results(job_id: str):
        j = need_job(job_id)
        r = need_results(j)
        body = {**job_json(j), **r, "model": MODEL_INFO, "methodology": METHOD, "limitations": LIMITS}
        return JSONResponse(body)

    @app.post("/api/sports/jobs/{job_id}/calibrate")
    def job_calibrate(job_id: str, body: dict = Body(...)):
        """Establish (or clear) the pitch calibration from landmarks identified on a frame; positions, statistics and events are re-derived."""
        j = need_job(job_id)
        need_results(j)
        cal = None if body.get("clear") else body
        r = jobs().calibrate(j, cal)
        return {"pitch_mapping": r["pitch_mapping"], "tracks": r["tracks"], "frames": r["frames"], "events": r["events"], "summary": r["summary"], "pitch": r["pitch"], "warnings": r["warnings"]}

    @app.get("/api/sports/jobs/{job_id}/heatmap")
    def job_heatmap(job_id: str, track: str | None = None, team: str | None = None, t0: float = 0.0, t1: float = 10 ** 9, cell_m: float = Query(CELL_M, ge=0.5, le=10), sigma: float = Query(SIGMA_CELLS, ge=0, le=6)):
        j = need_job(job_id)
        r = need_results(j)
        m = r["pitch_mapping"]
        if m["status"] == "unavailable":
            raise HTTPException(409, m.get("reason") or "Pitch calibration has not been established.")
        ids = {int(x) for x in track.split(",") if x.strip().isdigit()} if track else None
        L, W = r["pitch"]["length_m"], r["pitch"]["width_m"]
        pts = [(row[7], row[8]) for f in r["frames"] if t0 <= f["t"] <= t1 for row in f["p"] if row[7] is not None and (ids is None or row[0] in ids) and (team is None or row[6] == team) and in_pitch(row[7], row[8], L, W)]
        arr = np.array(pts, float).reshape(-1, 2)
        g = heatmap(arr, None, L, W, cell_m, sigma)
        return {"observations": len(pts), "cell_m": cell_m, "sigma_cells": sigma, "rows": g.shape[0], "cols": g.shape[1], "grid": np.round(g, 4).tolist(), "pitch_m": [L, W],
                "warning": "Fewer than 30 mapped observations: this map is not meaningful." if len(pts) < 30 else None}

    @app.get("/api/sports/jobs/{job_id}/export.csv")
    def job_csv(job_id: str, kind: str = Query("stats", pattern="^(stats|tracks|ball|events)$")):
        j = need_job(job_id)
        r = need_results(j)
        buf = io.StringIO()
        w = csv.writer(buf)
        if kind == "stats":
            w.writerow(["track_id", "team", "state", "first_seen_s", "last_seen_s", "observed_seconds", "observations", "image_distance_px_stabilised", "pitch_status", "mapped_observations", "pitch_distance_m", "avg_speed_ms", "max_speed_ms"] + [f"zone{i}_seconds" for i in range(9)])
            for t in r["tracks"]:
                pt = t["pitch"] or {}
                w.writerow([t["track_id"], t["team"], t["state"], t["first_seen_s"], t["last_seen_s"], t["observed_seconds"], t["observations"], t["image_distance_px"], pt.get("status", "unavailable"), pt.get("mapped_observations", ""), pt.get("distance_m", ""),
                            pt.get("avg_speed_ms", ""), pt.get("max_speed_ms", "")] + (t["zone_seconds"] or [""] * 9))
        elif kind == "tracks":
            w.writerow(["frame_index", "time_s", "track_id", "team", "confidence", "x1", "y1", "x2", "y2", "foot_x", "foot_y", "pitch_x_m", "pitch_y_m"])
            for f in r["frames"]:
                for p in f["p"]:
                    w.writerow([f["i"], f["t"], p[0], p[6], p[5], p[1], p[2], p[3], p[4], round((p[1] + p[3]) / 2, 1), p[4], "" if p[7] is None else p[7], "" if p[8] is None else p[8]])
        elif kind == "ball":
            w.writerow(["frame_index", "time_s", "kind", "confidence", "image_x", "image_y", "pitch_x_m_assuming_ground", "pitch_y_m_assuming_ground"])
            for f in r["frames"]:
                if f["b"]:
                    b = f["b"]
                    w.writerow([f["i"], f["t"], b[3], "" if b[2] is None else b[2], b[0], b[1], "" if b[4] is None else b[4], "" if b[5] is None else b[5]])
        else:
            w.writerow(["kind", "start_s", "end_s", "track_id", "team", "confidence", "ball_observations", "basis"])
            for e in r["events"]:
                w.writerow([e["kind"], e["t0"], e["t1"], e["track_id"], e["team"], e["confidence"], e["ball_observations"], e["basis"]])
        return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="sports-{kind}-{j.id[:8]}.csv"'})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


METHOD = {
    "detection": "FootAndBall: per-frame player boxes (stride-16 map) and ball candidates (stride-4 map), ONNX Runtime on CPU. Trained for fixed long-shot footage; unvalidated elsewhere.",
    "tracking": "ByteTrack in a camera-motion-stabilised reference frame; temporary integer ids; a track needs at least min_hits observations to be kept.",
    "camera_motion": "Lucas-Kanade background flow + RANSAC homography, chained within a segment; a new segment starts when the fit is unreliable (cut).",
    "pitch_mapping": "Homography from at least 4 user-identified landmarks (frame time + clicks) to a standard pitch of the stated size; foot point = bottom centre of the box.",
    "ball": "Viterbi selection of ball candidates with a plausibility limit on frame-to-frame jumps; gaps up to 1 s between observations are interpolated and labelled estimated.",
    "teams": "Two-means clustering of torso colour per track, with uncertain/other outcomes; optional user colours.",
    "heatmap": "Time-weighted 2-D histogram of mapped positions (2 m cells), Gaussian-smoothed (sigma 1.5 cells), max-normalised.",
}
LIMITS = [
    "Track IDs are temporary labels, not player identities; IDs can switch after occlusions or camera cuts.",
    "Detection quality depends on footage similar to the training data (fixed long-shot cameras). Broadcast close-ups and heavy zoom are outside that domain.",
    "The ball is tiny: many frames have no reliable observation. Missing intervals are shown as missing; short gaps may be interpolated and are marked estimated.",
    "Pitch positions assume players' feet are on the ground plane and the calibration landmarks were identified correctly. Accuracy is not validated against ground truth.",
    "Speeds and distances are estimates from smoothed, mapped foot positions at the sampling rate shown.",
    "Possession candidates are image-proximity heuristics, not validated possession. No passes, shots, goals or fouls are detected.",
]

app = create_app()
