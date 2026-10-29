"""Neo Forge ML lab: small, honest backends for ten computer-vision / machine-learning demos (classification, detection, segmentation, OCR,
anomaly via the defect service, forecasting, sensor anomalies, pose, semantic search, recommendation). Nothing is stored beyond a temporary,
expiring working directory and per-session in-memory search indexes."""
from __future__ import annotations

import base64
import io
import json
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from . import forecast as fc
from . import sensors as sn
from . import tabular
from .config import Settings
from .imaging import decode_image, jpeg, png, read_upload
from .models import COCO, INFO, VOC, Classifier, Detector, Pose, Segmenter
from .recommend import Catalogue
from .search import Index, WordVectors
from .video import Jobs, Writer, probe

IMG = {"jpg", "png", "webp", "tiff"}
SAMPLE_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,60}$")
SESSION = re.compile(r"^[0-9a-f]{16,32}$")
PALETTE = np.array([[0, 0, 0], [230, 25, 75], [60, 180, 75], [255, 225, 25], [0, 130, 200], [245, 130, 48], [145, 30, 180], [70, 240, 240], [240, 50, 230], [210, 245, 60], [250, 190, 212], [0, 128, 128],
                    [220, 190, 255], [170, 110, 40], [255, 250, 200], [128, 0, 0], [170, 255, 195], [128, 128, 0], [255, 215, 180], [0, 0, 128], [128, 128, 128]], np.uint8)
COLORS = [(75, 180, 60), (75, 25, 230), (25, 225, 255), (200, 130, 0), (48, 130, 245), (180, 30, 145), (240, 240, 70), (230, 50, 240)]
CREATED = "Cover and sample images are described in public/ml/samples/manifest.json."


def b64(img: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64," + base64.b64encode(img).decode()


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    st: dict = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        d, sd = s.models, s.shared_models
        st["cls"] = Classifier(d)
        st["det"] = Detector(sd / "yolox_s.onnx") if (sd / "yolox_s.onnx").is_file() else None
        st["seg"] = Segmenter(d)
        st["pose"] = Pose(sd / "blazepose_full.onnx") if (sd / "blazepose_full.onnx").is_file() else None
        st["wv"] = WordVectors(d)
        st["jobs"] = app.state.jobs = Jobs(s.work_dir, s.job_ttl_seconds)
        st["indexes"] = {}
        cat = s.samples / "products"
        st["cat"] = Catalogue(cat, st["cls"]) if (cat / "items.json").is_file() else None
        yield
        st["jobs"].shutdown()

    app = FastAPI(title="Neo Forge ML lab", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])
    app.add_middleware(GZipMiddleware, minimum_size=2000)

    def need(name: str):
        if st.get(name) is None:
            raise HTTPException(503, f"The {name} model files are not available on this server (see services/ml-lab/README.md).")
        return st[name]

    def samples() -> list[dict]:
        m = s.samples / "manifest.json"
        try:
            return json.loads(m.read_text())["samples"] if m.is_file() else []
        except (ValueError, KeyError):
            return []

    def sample_bytes(sid: str, kind: str) -> tuple[bytes, dict]:
        item = next((x for x in samples() if x["id"] == sid and x["kind"] == kind), None) if SAMPLE_ID.match(sid) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        return (s.samples / item["file"]).read_bytes(), item

    async def image_input(file: UploadFile | None, sample_id: str | None, kind: str = "image") -> tuple[np.ndarray, str]:
        if (file is None) == (sample_id is None):
            raise HTTPException(400, "Send either an image file or a sample_id.")
        if sample_id is not None:
            data, item = sample_bytes(sample_id, kind)
            return decode_image(data, s.max_pixels), item["file"]
        data, _ = await read_upload(file, s.max_image_mb * 1_000_000, IMG, "a JPEG, PNG, WebP or TIFF image")
        return decode_image(data, s.max_pixels), re.sub(r"[^\w.\- ]", "_", Path(file.filename or "image").name)[:80]

    # ---- meta -------------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"ok": True, "models": INFO, "available": {"classifier": True, "detector": st.get("det") is not None, "segmenter": True, "pose": st.get("pose") is not None, "ocr": True, "search_vectors": True, "catalogue": st.get("cat") is not None, "ffmpeg": bool(shutil.which("ffmpeg"))},
                "limits": {"max_image_mb": s.max_image_mb, "max_megapixels": s.max_pixels / 1e6, "max_video_mb": s.max_video_mb, "max_video_seconds": s.max_video_seconds, "max_frames": s.max_frames, "max_csv_mb": s.max_csv_mb, "max_csv_rows": s.max_csv_rows}}

    @app.get("/api/samples")
    def list_samples(kind: str | None = Query(None, pattern="^[a-z_]{1,30}$")):
        return {"samples": [x for x in samples() if kind is None or x["kind"] == kind]}

    @app.get("/api/samples/{sid}/file")
    def sample_file(sid: str):
        item = next((x for x in samples() if x["id"] == sid), None) if SAMPLE_ID.match(sid) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        return FileResponse(s.samples / item["file"])

    # ---- 12 classification ------------------------------------------------------------------------------------------
    @app.post("/api/classify")
    async def classify(file: UploadFile | None = File(None), sample_id: str | None = Form(None), top_k: int = Form(5)):
        if not 1 <= top_k <= 10:
            raise HTTPException(400, "top_k must be between 1 and 10.")
        img, name = await image_input(file, sample_id)
        t = time.perf_counter()
        preds = st["cls"](img, top_k)
        h, w = img.shape[:2]
        return {"filename": name, "width": w, "height": h, "predictions": preds, "seconds": round(time.perf_counter() - t, 3), "model": INFO["classifier"],
                "note": "Probabilities are the model's softmax outputs over 1000 ImageNet classes. They are not calibrated, and an image of something outside those classes still gets labels."}

    # ---- 13 detection -----------------------------------------------------------------------------------------------
    def draw_det(img: np.ndarray, dets: list[dict]) -> np.ndarray:
        out = img.copy()
        for d in dets:
            c = COLORS[d["class_index"] % len(COLORS)]
            x1, y1, x2, y2 = (int(v) for v in d["box"])
            cv2.rectangle(out, (x1, y1), (x2, y2), c, max(2, img.shape[1] // 400))
            t = f"{d['label']} {d['score']:.2f}"
            (tw, th), _ = cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
            cv2.rectangle(out, (x1, max(0, y1 - th - 6)), (x1 + tw + 4, y1), c, -1)
            cv2.putText(out, t, (x1 + 2, max(th, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)
        return out

    @app.post("/api/detect/image")
    async def detect_image(file: UploadFile | None = File(None), sample_id: str | None = Form(None), threshold: float = Form(0.35)):
        det = need("det")
        if not 0.05 <= threshold <= 0.95:
            raise HTTPException(400, "threshold must be between 0.05 and 0.95.")
        img, name = await image_input(file, sample_id)
        t = time.perf_counter()
        dets = det(img, threshold)
        counts: dict[str, int] = {}
        for d in dets:
            counts[d["label"]] = counts.get(d["label"], 0) + 1
        return {"filename": name, "width": img.shape[1], "height": img.shape[0], "detections": dets, "counts": counts, "threshold": threshold, "seconds": round(time.perf_counter() - t, 3), "model": INFO["detector"],
                "annotated": b64(jpeg(draw_det(img, dets))), "note": "COCO's 80 classes only. Objects outside them are not detected; small, blurred or partly hidden objects are often missed."}

    def vid_input_path(job_dir: Path, data: bytes) -> Path:
        p = job_dir / "input.bin"
        p.write_bytes(data)
        return p

    def run_video(job, path: Path, step_fps: float, per_frame, draw, dst: Path) -> dict:
        w, h, fps, n = probe(path, s.max_video_seconds)
        step = max(1, int(round(fps / step_fps)))
        total = min((n // step + 1) if n else s.max_frames, s.max_frames)
        job.total = total
        cap = cv2.VideoCapture(str(path))
        wr = Writer(dst, w, h, fps / step)
        frames, i, t0 = [], 0, time.perf_counter()
        try:
            while len(frames) < total and not job.cancel.is_set():
                ok, f = cap.read()
                if not ok:
                    break
                if i % step == 0:
                    r = per_frame(f)
                    frames.append({"t": round(i / fps, 3), **r})
                    wr.write(draw(f, r))
                    job.done = len(frames)
                i += 1
        finally:
            cap.release()
            wr.close()
        return {"width": w, "height": h, "source_fps": round(fps, 2), "analysed_fps": round(fps / step, 2), "frames_analysed": len(frames), "seconds": round(time.perf_counter() - t0, 2), "frames": frames}

    async def video_job(kind: str, file: UploadFile, step_fps: float, make):
        if not 1 <= step_fps <= 10:
            raise HTTPException(400, "analysed_fps must be between 1 and 10.")
        data, _ = await read_upload(file, s.max_video_mb * 1_000_000, {"video"}, "an MP4, MOV, WebM, MKV or AVI video")
        try:
            job = st["jobs"].submit(kind, lambda j: (lambda p: make(j, p))(vid_input_path(j.dir, data)))
        except RuntimeError:
            raise HTTPException(503, "The service is busy. Please try again in a few minutes.") from None
        return {"job_id": job.id, "status": job.status}

    @app.post("/api/detect/video")
    async def detect_video(file: UploadFile = File(...), threshold: float = Form(0.35), analysed_fps: float = Form(3)):
        det = need("det")
        if not 0.05 <= threshold <= 0.95:
            raise HTTPException(400, "threshold must be between 0.05 and 0.95.")

        def make(job, path):
            def per(f):
                ds = det(f, threshold)
                return {"detections": [{"label": d["label"], "score": round(d["score"], 3), "box": d["box"]} for d in ds]}
            res = run_video(job, path, analysed_fps, per, lambda f, r: draw_det(f, [{**d, "class_index": COCO.index(d["label"])} for d in r["detections"]]), job.dir / "annotated.mp4")
            counts: dict[str, int] = {}
            peak: dict[str, int] = {}
            for fr in res["frames"]:
                c: dict[str, int] = {}
                for d in fr["detections"]:
                    c[d["label"]] = c.get(d["label"], 0) + 1
                    counts[d["label"]] = counts.get(d["label"], 0) + 1
                for k, v in c.items():
                    peak[k] = max(peak.get(k, 0), v)
            res["per_frame_counts"] = [{"t": fr["t"], "n": len(fr["detections"])} for fr in res.pop("frames")]
            res.update(detection_instances_by_class=counts, max_in_one_frame=peak, threshold=threshold, model=INFO["detector"],
                       note="Counts are detections per analysed frame, not unique objects: there is no tracking in this demo, so the same object is counted in every frame it appears.")
            return res
        return await video_job("detect", file, analysed_fps, make)

    # ---- 19 pose ----------------------------------------------------------------------------------------------------
    def angle(a, b, c) -> float | None:
        v1, v2 = a[:2] - b[:2], c[:2] - b[:2]
        n = np.linalg.norm(v1) * np.linalg.norm(v2)
        return None if n < 1e-6 else float(np.degrees(np.arccos(np.clip(v1 @ v2 / n, -1, 1))))

    def pose_frame(img: np.ndarray, thr: float) -> list[dict]:
        det, pose = need("det"), need("pose")
        out = []
        for d in sorted(det(img, thr, only_person=True), key=lambda d: -d["score"])[:8]:
            b = d["box"]
            if b[3] - b[1] < 40:
                out.append({"box": b, "score": d["score"], "keypoints": None, "note": "person too small for pose estimation (under 40 px tall)"})
                continue
            kp, pres = pose(img, b)
            k = lambda i: kp[i]  # noqa: E731
            vis = lambda *ix: all(kp[i, 2] >= 0.5 for i in ix)  # noqa: E731
            ang = {}
            for nm, (a, bb, c) in {"left_elbow": (11, 13, 15), "right_elbow": (12, 14, 16), "left_knee": (23, 25, 27), "right_knee": (24, 26, 28), "left_hip": (11, 23, 25), "right_hip": (12, 24, 26)}.items():
                if vis(a, bb, c):
                    ang[nm] = round(angle(k(a), k(bb), k(c)), 1)
            out.append({"box": b, "score": d["score"], "pose_presence": pres, "keypoints": [{"name": Pose.NAMES[i], "x": round(float(kp[i, 0]), 1), "y": round(float(kp[i, 1]), 1), "visibility": round(float(kp[i, 2]), 3)} for i in range(Pose.N)], "joint_angles_degrees": ang})
        return out

    def draw_pose(img: np.ndarray, persons: list[dict]) -> np.ndarray:
        o = img.copy()
        for n, p in enumerate(persons):
            c = COLORS[n % len(COLORS)]
            x1, y1, x2, y2 = (int(v) for v in p["box"])
            cv2.rectangle(o, (x1, y1), (x2, y2), c, 1)
            if not p.get("keypoints"):
                continue
            kp = {k["name"]: k for k in p["keypoints"]}
            pts = [(k["x"], k["y"], k["visibility"]) for k in p["keypoints"]]
            for a, b in Pose.BONES:
                if pts[a][2] >= 0.4 and pts[b][2] >= 0.4:
                    cv2.line(o, (int(pts[a][0]), int(pts[a][1])), (int(pts[b][0]), int(pts[b][1])), c, max(2, img.shape[1] // 400), cv2.LINE_AA)
            for x, y, v in pts[:1] + pts[11:29]:
                if v >= 0.4:
                    cv2.circle(o, (int(x), int(y)), max(3, img.shape[1] // 300), (255, 255, 255), -1, cv2.LINE_AA)
        return o

    @app.post("/api/pose/image")
    async def pose_image(file: UploadFile | None = File(None), sample_id: str | None = Form(None), threshold: float = Form(0.35)):
        need("pose")
        if not 0.1 <= threshold <= 0.9:
            raise HTTPException(400, "threshold must be between 0.1 and 0.9.")
        img, name = await image_input(file, sample_id)
        t = time.perf_counter()
        persons = pose_frame(img, threshold)
        return {"filename": name, "width": img.shape[1], "height": img.shape[0], "persons": persons, "seconds": round(time.perf_counter() - t, 3), "model": INFO["pose"], "annotated": b64(jpeg(draw_pose(img, persons))),
                "message": None if persons else "No person was detected in this image, so there is no pose to show.",
                "note": "Keypoints are estimates of body-joint positions. A pose alone does not tell what someone is doing, intends or feels, and no activity label is produced."}

    @app.post("/api/pose/video")
    async def pose_video(file: UploadFile = File(...), threshold: float = Form(0.35), analysed_fps: float = Form(3)):
        need("pose")

        def make(job, path):
            res = run_video(job, path, analysed_fps, lambda f: {"persons": pose_frame(f, threshold)}, lambda f, r: draw_pose(f, r["persons"]), job.dir / "annotated.mp4")
            fr = res.pop("frames")
            res.update(frames_with_person=sum(1 for x in fr if x["persons"]), frames_without_person=sum(1 for x in fr if not x["persons"]), persons_per_frame=[{"t": x["t"], "n": len(x["persons"])} for x in fr], model=INFO["pose"],
                       note="Pose is estimated independently in every analysed frame; people are not tracked between frames, and no activity is classified.")
            return res
        return await video_job("pose", file, analysed_fps, make)

    @app.get("/api/jobs/{jid}")
    def job_status(jid: str):
        j = st["jobs"].get(jid)
        if not j:
            raise HTTPException(404, "Job not found or expired.")
        return {"job_id": j.id, "kind": j.kind, "status": j.status, "progress": {"done": j.done, "total": j.total, "fraction": 1.0 if j.status == "completed" else (min(0.99, j.done / j.total) if j.total else 0.0)}, "error": j.error, "result": j.result if j.status == "completed" else None,
                "output_url": f"/api/jobs/{j.id}/output" if j.status == "completed" else None}

    @app.post("/api/jobs/{jid}/cancel")
    def job_cancel(jid: str):
        j = st["jobs"].get(jid)
        if not j:
            raise HTTPException(404, "Job not found or expired.")
        j.cancel.set()
        return {"cancel_requested": True}

    @app.get("/api/jobs/{jid}/output")
    def job_output(jid: str):
        j = st["jobs"].get(jid)
        if not j or j.status != "completed":
            raise HTTPException(404, "No output available.")
        p = j.dir / "annotated.mp4"
        if not p.is_file():
            raise HTTPException(404, "No output available.")
        return FileResponse(p, media_type="video/mp4", filename=f"annotated-{jid[:8]}.mp4")

    # ---- 14 segmentation --------------------------------------------------------------------------------------------
    @app.post("/api/segment")
    async def segment(file: UploadFile | None = File(None), sample_id: str | None = Form(None), opacity: float = Form(0.5)):
        if not 0.0 <= opacity <= 1.0:
            raise HTTPException(400, "opacity must be between 0 and 1.")
        img, name = await image_input(file, sample_id)
        t = time.perf_counter()
        m = st["seg"](img)
        total = m.size
        classes = [{"index": int(c), "label": VOC[c], "pixels": int((m == c).sum()), "share": float((m == c).sum() / total), "colour": "#%02x%02x%02x" % tuple(int(v) for v in PALETTE[c])} for c in np.unique(m)]
        classes.sort(key=lambda c: -c["pixels"])
        colour = PALETTE[m][:, :, ::-1]
        overlay = np.where((m > 0)[:, :, None], (img * (1 - opacity) + colour * opacity).astype(np.uint8), img)
        return {"filename": name, "width": img.shape[1], "height": img.shape[0], "classes": classes, "known_classes": VOC, "seconds": round(time.perf_counter() - t, 3), "model": INFO["segmenter"],
                "mask_png": b64(png(np.dstack([colour.astype(np.uint8), np.where(m > 0, 255, 0).astype(np.uint8)])), "image/png"), "index_mask_png": b64(png(m), "image/png"), "overlay": b64(jpeg(overlay)), "original": b64(jpeg(img)),
                "note": "Semantic segmentation into the 21 PASCAL VOC classes (20 object classes + background). Everything outside those classes is labelled background or the nearest class. The model runs at 257x257 and its mask is upscaled, so edges are coarse."}

    # ---- 15 OCR -----------------------------------------------------------------------------------------------------
    def ocr_engine():
        if "ocr" not in st:
            from rapidocr_onnxruntime import RapidOCR
            st["ocr"] = RapidOCR()
        return st["ocr"]

    RE_DATE = re.compile(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s*\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b", re.I)
    RE_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    RE_AMOUNT = re.compile(r"[£$€]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*\.\d{2}\s?(?:USD|EUR|GBP)\b")
    RE_PHONE = re.compile(r"(?<![\w/])\+\d[\d\s().-]{6,16}\d")
    RE_KV = re.compile(r"^\s*(invoice\s*(?:no|number|#)|order\s*(?:no|number|#)|po\s*(?:no|number|#)|reference|ref)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-/_.]{2,})\s*$", re.I)

    def find_fields(pages: list[dict]) -> list[dict]:
        out = []
        for p in pages:
            for ln in p["lines"]:
                t = ln["text"]
                for typ, rx in (("date", RE_DATE), ("email", RE_EMAIL), ("amount", RE_AMOUNT), ("phone", RE_PHONE)):
                    for m in rx.finditer(t):
                        out.append({"type": typ, "value": m.group(0).strip(), "page": p["page"], "line": ln["text"], "confidence": ln.get("confidence"), "rule": f"{typ} pattern"})
                m = RE_KV.match(t)
                if m:
                    out.append({"type": "reference", "label": m.group(1), "value": m.group(2), "page": p["page"], "line": t, "confidence": ln.get("confidence"), "rule": "reference label followed by an id"})
        return out

    @app.post("/api/ocr")
    async def ocr(file: UploadFile | None = File(None), sample_id: str | None = Form(None), force_ocr: bool = Form(False)):
        if (file is None) == (sample_id is None):
            raise HTTPException(400, "Send either a file or a sample_id.")
        if sample_id is not None:
            data, item = sample_bytes(sample_id, "document")
            name = item["file"]
        else:
            data, _ = await read_upload(file, s.max_doc_mb * 1_000_000, IMG | {"pdf"}, "a PDF, PNG, JPEG, WebP or TIFF file")
            name = re.sub(r"[^\w.\- ]", "_", Path(file.filename or "document").name)[:80]
        from .imaging import sniff
        kind = sniff(data[:16])
        pages: list[dict] = []
        eng = ocr_engine()

        def run_ocr(bgr: np.ndarray) -> list[dict]:
            h, w = bgr.shape[:2]
            res, _ = eng(bgr)
            lines = []
            for box, text, conf in (res or []):
                pts = np.array(box, float)
                if str(text).strip():
                    lines.append({"text": str(text).strip(), "bbox": [round(float(pts[:, 0].min()) / w, 4), round(float(pts[:, 1].min()) / h, 4), round(float(pts[:, 0].max()) / w, 4), round(float(pts[:, 1].max()) / h, 4)], "confidence": round(float(conf), 3)})
            return lines
        t0 = time.perf_counter()
        if kind == "pdf":
            import pypdfium2 as pdfium
            try:
                pdf = pdfium.PdfDocument(data)
            except Exception as e:  # noqa: BLE001
                raise HTTPException(422, "The PDF is password-protected." if "password" in str(e).lower() else "The PDF could not be opened. The file may be damaged.") from None
            if len(pdf) > s.max_pdf_pages:
                raise HTTPException(422, f"The PDF has {len(pdf)} pages; this demo reads up to {s.max_pdf_pages}.")
            for i in range(len(pdf)):
                pg = pdf[i]
                W, H = pg.get_size()
                scale = min(200 / 72, 2200 / max(W, H))
                arr = np.ascontiguousarray(pg.render(scale=scale).to_numpy())
                bgr = cv2.cvtColor(arr, cv2.COLOR_BGRA2BGR) if arr.shape[2] == 4 else arr
                tp = pg.get_textpage()
                txt = tp.get_text_range().strip()
                tp.close()
                if len(txt) >= 20 and not force_ocr:
                    pages.append({"page": i + 1, "source": "pdf_text_layer", "text": txt.replace("\r\n", "\n"), "lines": [{"text": l, "bbox": None, "confidence": None} for l in txt.replace("\r", "").split("\n") if l.strip()], "image": b64(jpeg(cv2.resize(bgr, None, fx=min(1, 1100 / bgr.shape[1]), fy=min(1, 1100 / bgr.shape[1]), interpolation=cv2.INTER_AREA), 80))})
                else:
                    lines = run_ocr(bgr)
                    pages.append({"page": i + 1, "source": "ocr", "text": "\n".join(l["text"] for l in lines), "lines": lines, "image": b64(jpeg(cv2.resize(bgr, None, fx=min(1, 1100 / bgr.shape[1]), fy=min(1, 1100 / bgr.shape[1]), interpolation=cv2.INTER_AREA), 80))})
        else:
            bgr = decode_image(data, s.max_pixels)
            lines = run_ocr(bgr)
            pages.append({"page": 1, "source": "ocr", "text": "\n".join(l["text"] for l in lines), "lines": lines, "image": b64(jpeg(cv2.resize(bgr, None, fx=min(1, 1100 / bgr.shape[1]), fy=min(1, 1100 / bgr.shape[1]), interpolation=cv2.INTER_AREA), 80))})
        n_chars = sum(len(p["text"]) for p in pages)
        confs = [l["confidence"] for p in pages for l in p["lines"] if l["confidence"] is not None]
        return {"filename": name, "format": kind, "pages": pages, "characters": n_chars, "seconds": round(time.perf_counter() - t0, 2), "fields": find_fields(pages),
                "ocr": {"engine": "RapidOCR (PP-OCR v3 on ONNX Runtime, Apache-2.0)", "mean_confidence": round(float(np.mean(confs)), 3) if confs else None, "lines": len(confs)},
                "message": "No text was found in this document." if n_chars == 0 else None,
                "note": "OCR text can contain mistakes, especially digits and small print; the confidence is the engine's own score. Fields come from simple patterns (dates, e-mail addresses, currency amounts, +phone numbers, reference numbers); anything that does not match a pattern is not extracted."}

    # ---- 17 forecasting / 18 sensors -------------------------------------------------------------------------------
    async def csv_input(file: UploadFile | None, sample_id: str | None):
        if (file is None) == (sample_id is None):
            raise HTTPException(400, "Send either a CSV file or a sample_id.")
        if sample_id is not None:
            data, item = sample_bytes(sample_id, "csv")
            return tabular.read_csv(data, s.max_csv_rows), item["file"]
        data, _ = await read_csv_upload(file)
        return tabular.read_csv(data, s.max_csv_rows), re.sub(r"[^\w.\- ]", "_", Path(file.filename or "data.csv").name)[:80]

    async def read_csv_upload(file: UploadFile) -> tuple[bytes, None]:
        data = bytearray()
        while chunk := await file.read(1024 * 1024):
            data += chunk
            if len(data) > s.max_csv_mb * 1_000_000:
                raise HTTPException(413, f"The file is larger than the {s.max_csv_mb} MB limit.")
        if not data:
            raise HTTPException(400, "The file is empty.")
        from .imaging import sniff as _sniff
        if _sniff(bytes(data[:16])) is not None or bytes(data[:4]) == b"PK\x03\x04":
            raise HTTPException(415, "Unsupported file type. Upload a CSV file.")
        return bytes(data), None

    @app.post("/api/tabular/inspect")
    async def tab_inspect(file: UploadFile | None = File(None), sample_id: str | None = Form(None)):
        df, name = await csv_input(file, sample_id)
        return {"filename": name, **tabular.describe(df)}

    @app.post("/api/forecast")
    async def forecast(file: UploadFile | None = File(None), sample_id: str | None = Form(None), date_column: str = Form(...), value_column: str = Form(...), horizon: int = Form(12), season: int | None = Form(None), method: str = Form("auto")):
        if method not in ("auto", *fc.METHODS):
            raise HTTPException(400, "method must be auto, " + ", ".join(fc.METHODS) + ".")
        if season is not None and not 0 <= season <= 400:
            raise HTTPException(400, "season must be between 0 and 400.")
        df, name = await csv_input(file, sample_id)
        clean, notes = tabular.clean_series(df, date_column, [value_column])
        r = fc.run(clean, date_column, value_column, horizon, season, method)
        r["notes"] = notes + r["notes"]
        return {"filename": name, "date_column": date_column, "value_column": value_column, **r}

    @app.post("/api/sensors")
    async def sensors(file: UploadFile | None = File(None), sample_id: str | None = Form(None), time_column: str | None = Form(None), sensor_columns: str = Form(...), method: str = Form("all"), window: int = Form(48),
                      z_threshold: float = Form(4.0), contamination: float = Form(0.02), label_column: str | None = Form(None), baseline_fraction: float = Form(0.25)):
        if method not in ("zscore", "baseline", "iforest", "all"):
            raise HTTPException(400, "method must be zscore, baseline, iforest or all.")
        if not 0.05 <= baseline_fraction <= 0.8:
            raise HTTPException(400, "baseline_fraction must be between 0.05 and 0.8.")
        if not (5 <= window <= 2000 and 1.5 <= z_threshold <= 20 and 0.001 <= contamination <= 0.3):
            raise HTTPException(400, "window must be 5-2000, z_threshold 1.5-20 and contamination 0.001-0.3.")
        df, name = await csv_input(file, sample_id)
        cols = [c.strip() for c in sensor_columns.split(",") if c.strip()]
        if not 1 <= len(cols) <= 12:
            raise HTTPException(400, "Choose between 1 and 12 sensor columns.")
        for c in cols + ([time_column] if time_column else []) + ([label_column] if label_column else []):
            if c not in df.columns:
                raise HTTPException(422, f"Column '{c}' does not exist.")
        sub = df.copy()
        for c in cols:
            sub[c] = tabular.pd.to_numeric(sub[c], errors="coerce")
            if sub[c].notna().mean() < 0.8:
                raise HTTPException(422, f"Column '{c}' is mostly non-numeric.")
        if time_column and time_column in cols:
            raise HTTPException(400, "The time column cannot also be a sensor column.")
        if time_column and tabular.pd.api.types.is_numeric_dtype(sub[time_column]):
            raise HTTPException(422, f"Column '{time_column}' is numeric, not a date/time column.")
        if time_column:
            tt = tabular.pd.to_datetime(sub[time_column], errors="coerce", format="mixed")
            if tt.isna().mean() > 0.1:
                raise HTTPException(422, f"Column '{time_column}' does not contain valid timestamps.")
            sub = sub.assign(**{time_column: tt}).dropna(subset=[time_column]).sort_values(time_column).reset_index(drop=True)
        r = sn.run(sub, time_column, cols, method, window, z_threshold, contamination, label_column, baseline_fraction)
        return {"filename": name, "time_column": time_column, **r}

    # ---- 20 semantic search -----------------------------------------------------------------------------------------
    def index_for(session: str) -> Index:
        if not SESSION.match(session or ""):
            raise HTTPException(400, "A session id of 16-32 hexadecimal characters is required (the demo generates one per browser).")
        ix = st["indexes"]
        now = time.time()
        for k in [k for k, v in ix.items() if v.touched + s.job_ttl_seconds < now]:
            ix.pop(k, None)
        if session not in ix:
            if len(ix) >= 50:
                raise HTTPException(503, "The service is busy. Please try again later.")
            ix[session] = Index(st["wv"])
        return ix[session]

    @app.get("/api/search/documents")
    def search_docs(session: str):
        ix = index_for(session)
        return {"documents": [ix.summary(d) for d in ix.docs], "limit": s.max_search_docs}

    @app.post("/api/search/documents")
    async def search_add(session: str = Form(...), file: UploadFile | None = File(None), sample_id: str | None = Form(None), title: str | None = Form(None), text: str | None = Form(None)):
        ix = index_for(session)
        if len(ix.docs) >= s.max_search_docs:
            raise HTTPException(422, f"The index already holds {s.max_search_docs} documents; remove one first.")
        if sum(x is not None for x in (file, sample_id, text)) != 1:
            raise HTTPException(400, "Send exactly one of: file, sample_id, text.")
        if sample_id is not None:
            data, item = sample_bytes(sample_id, "text")
            name, body, src = item["title"], data.decode("utf-8", "replace"), "sample"
        elif text is not None:
            if len(text) > 200_000:
                raise HTTPException(413, "The pasted text is longer than 200,000 characters.")
            name, body, src = (title or "Pasted text").strip()[:80] or "Pasted text", text, "pasted"
        else:
            raw = bytearray()
            while chunk := await file.read(1024 * 1024):
                raw += chunk
                if len(raw) > s.max_doc_mb * 1_000_000:
                    raise HTTPException(413, f"The file is larger than the {s.max_doc_mb} MB limit.")
            if not raw:
                raise HTTPException(400, "The file is empty.")
            name, src = re.sub(r"[^\w.\- ]", "_", Path(file.filename or "document").name)[:80], "upload"
            if bytes(raw[:5]) == b"%PDF-":
                import pypdfium2 as pdfium
                try:
                    pdf = pdfium.PdfDocument(bytes(raw))
                except Exception:  # noqa: BLE001
                    raise HTTPException(422, "The PDF could not be opened (it may be damaged or password-protected).") from None
                if len(pdf) > 60:
                    raise HTTPException(422, "The PDF has more than 60 pages.")
                parts = []
                for i in range(len(pdf)):
                    tp = pdf[i].get_textpage()
                    parts.append(tp.get_text_range())
                    tp.close()
                body = "\n\n".join(parts)
                if len(body.strip()) < 20:
                    raise HTTPException(422, "This PDF has no text layer (it is probably a scan). OCR is not part of the search demo; use the OCR demo first and paste the text.")
            else:
                if bytes(raw[:3]) == b"\xff\xd8\xff" or bytes(raw[:8]) == b"\x89PNG\r\n\x1a\n" or b"\x00" in bytes(raw[:2000]):
                    raise HTTPException(415, "Unsupported file type. Upload a PDF, TXT or Markdown file, or paste text.")
                body = bytes(raw).decode("utf-8", "replace")
        try:
            return ix.add(name, body, src)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None

    @app.delete("/api/search/documents/{did}")
    def search_remove(did: str, session: str):
        if not re.match(r"^d\d{1,3}-\d{1,5}$", did):
            raise HTTPException(404, "Document not found.")
        if not index_for(session).remove(did):
            raise HTTPException(404, "Document not found.")
        return {"deleted": True}

    @app.post("/api/search/reset")
    def search_reset(session: str = Form(...)):
        index_for(session).docs.clear()
        return {"cleared": True}

    @app.post("/api/search/query")
    async def search_query(session: str = Form(...), query: str = Form(...), mode: str = Form("hybrid"), k: int = Form(5), alpha: float = Form(0.5)):
        if mode not in ("semantic", "keyword", "hybrid"):
            raise HTTPException(400, "mode must be semantic, keyword or hybrid.")
        if not (1 <= k <= 20 and 0.0 <= alpha <= 1.0) or not query.strip() or len(query) > 500:
            raise HTTPException(400, "Provide a query of 1-500 characters, k 1-20 and alpha 0-1.")
        try:
            return index_for(session).search(query, mode, k, alpha)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None

    # ---- 21 recommendation ------------------------------------------------------------------------------------------
    @app.get("/api/products")
    def products(q: str = "", category: str | None = None, limit: int = Query(60, ge=1, le=300)):
        cat = need("cat")
        return {"total": len(cat.items), "categories": sorted({i["category"] for i in cat.items}), "items": cat.listing(q[:80], category, limit)}

    @app.get("/api/products/{pid}/image")
    def product_image(pid: str):
        cat = need("cat")
        if pid not in cat.by_id:
            raise HTTPException(404, "Unknown product.")
        return FileResponse(cat.folder / cat.items[cat.by_id[pid]]["image"], media_type="image/png")

    @app.get("/api/products/{pid}/similar")
    def product_similar(pid: str, k: int = Query(6, ge=1, le=24), image_weight: float = Query(0.5, ge=0, le=1)):
        cat = need("cat")
        if pid not in cat.by_id:
            raise HTTPException(404, "Unknown product.")
        return cat.similar(pid, k, image_weight)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


app = create_app()
