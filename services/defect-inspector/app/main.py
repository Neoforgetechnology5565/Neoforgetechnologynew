"""Visual inspection API: anomaly detection against a reference of good parts, configurable quality rules, human review. Only inspection: no ERP/MES/CRM modules."""
from __future__ import annotations

import json
import re
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from .config import Settings
from .inspect import evaluate, inspect, render_annotated, render_heat
from .media import MediaError, decode
from .patchcore import Backbone
from .reference import ReferenceStore
from .report import make_pdf
from .rules import FAIL, PASS, REVIEW, RuleError, Rules
from .store import KINDS, Store

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,40}$")
DECISIONS = (PASS, FAIL, REVIEW)
METHOD = "PatchCore-style anomaly detection (frozen ImageNet ResNet-50 features, coreset memory of good parts, nearest-neighbour patch distance)."
LIMITS = [
    "The model finds where a part looks unusual compared with good examples of the same kind of part. It does not name defect types (scratch, dent, crack…) and cannot find defects that look like normal variation.",
    "A reference works for one kind of part, photographed the same way. A different part, lighting or camera angle produces high scores that are not defects.",
    "The anomaly score is a distance, not a probability. The flag threshold is estimated from a limited number of good images; it will flag some good parts and miss some defects (see the evaluation figures per reference).",
    "Recommendations follow the configured rules and are not certified quality assurance. A person decides.",
]


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}
    gate = threading.BoundedSemaphore(max(1, s.max_concurrent))

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        bb = Backbone(s.backbone_path, s.intra_threads)
        s.work_dir.mkdir(parents=True, exist_ok=True)
        state["bb"], state["refs"] = bb, ReferenceStore(s.references_dir, s.work_dir, bb, s.max_ref_images, s.min_ref_images)
        state["store"] = Store(s.work_dir, s.ttl_seconds, s.max_inspections)
        stop = threading.Event()
        def reaper():
            while not stop.wait(60):
                state["store"].prune(); state["refs"].expire(s.ttl_seconds)
        threading.Thread(target=reaper, daemon=True, name="inspect-reaper").start()
        yield
        stop.set()

    app = FastAPI(title="Neo Forge visual inspection", version="1.0.0", lifespan=lifespan, description="Anomaly detection against a reference of good parts, with configurable pass/fail/manual-review rules and human review. Scores are distances, not probabilities.")
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])

    def refs() -> ReferenceStore:
        return state["refs"]

    def store() -> Store:
        return state["store"]

    def samples() -> list[dict]:
        m = s.samples_dir / "manifest.json"
        if not m.is_file():
            return []
        try:
            return json.loads(m.read_text())["samples"]
        except (ValueError, KeyError):
            return []

    async def read_limited(f: UploadFile) -> bytes:
        data = await f.read(s.max_image_mb * 1_000_000 + 1)
        if not data:
            raise HTTPException(400, "The file is empty.")
        if len(data) > s.max_image_mb * 1_000_000:
            raise HTTPException(413, f"The image is larger than the {s.max_image_mb} MB limit.")
        return data

    def decode_or_http(data: bytes):
        try:
            return decode(data, s.max_pixels)
        except MediaError as e:
            raise HTTPException(415 if "Unsupported" in str(e) else 422, str(e)) from None

    # ---- meta --------------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        r = refs().list()
        return {"ok": True, "backbone": "ResNet-50 layers 2+3 (ImageNet), ONNX Runtime CPU", "method": METHOD, "references": len(r), "builtin_references": sum(1 for x in r if x["kind"] == "builtin"),
                "limits": {"max_image_mb": s.max_image_mb, "max_pixels": s.max_pixels, "min_reference_images": s.min_ref_images, "max_reference_images": s.max_ref_images, "inspection_ttl_seconds": s.ttl_seconds}, "limitations": LIMITS}

    @app.get("/api/references")
    def list_references():
        return {"references": refs().list()}

    @app.get("/api/references/{rid}")
    def get_reference(rid: str):
        i = refs().info.get(rid) if ID_RE.match(rid) else None
        if not i:
            raise HTTPException(404, "Unknown reference.")
        return i.public()

    @app.post("/api/references", status_code=202)
    async def create_reference(name: str = Form("Custom part"), files: list[UploadFile] = File(default=[])):
        """Build a reference from good images of one kind of part (at least INSPECT_MIN_REF_IMAGES). Building runs in the background; poll GET /api/references/{id}."""
        if len(files) > s.max_ref_images:
            raise HTTPException(400, f"At most {s.max_ref_images} images can be used to build a reference.")
        imgs = []
        for f in files:
            img, _ = decode_or_http(await read_limited(f))
            imgs.append(img)
        try:
            info = refs().start_custom(name.strip() or "Custom part", imgs)
        except ValueError as e:
            raise HTTPException(400, str(e)) from None
        return info.public()

    @app.delete("/api/references/{rid}")
    def delete_reference(rid: str):
        if not refs().delete_custom(rid):
            raise HTTPException(404, "Unknown or built-in reference.")
        return {"deleted": True}

    @app.get("/api/sample-images")
    def sample_images():
        return {"samples": [{**x, "image_url": f"/api/sample-images/{x['id']}/image"} for x in samples()], "dataset": "VisA (Amazon; CC BY 4.0)"}

    @app.get("/api/sample-images/{sid}/image")
    def sample_image(sid: str):
        item = next((x for x in samples() if x["id"] == sid), None) if ID_RE.match(sid) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        return FileResponse(s.samples_dir / item["file"], media_type="image/jpeg")

    # ---- inspection --------------------------------------------------------------------------------------------------
    @app.post("/api/inspect", status_code=201)
    async def inspect_endpoint(file: UploadFile | None = File(None), sample_id: str | None = Form(None), reference_id: str = Form(...), rules: str | None = Form(None)):
        if (file is None) == (sample_id is None):
            raise HTTPException(400, "Send either an image file or a sample_id.")
        ref = refs().get(reference_id)
        info = refs().info.get(reference_id) if ref else None
        if not ref or not info:
            raise HTTPException(404, "Unknown reference. Choose a part type first." if not refs().info.get(reference_id) else "The reference is not ready yet.")
        try:
            rl = Rules.parse(json.loads(rules) if rules else None)
        except (ValueError, RuleError) as e:
            raise HTTPException(400, str(e) if isinstance(e, RuleError) else "rules must be valid JSON.") from None
        gt_mask, label, filename, dataset = None, None, None, None
        if sample_id is not None:
            item = next((x for x in samples() if x["id"] == sample_id), None) if ID_RE.match(sample_id) else None
            if not item:
                raise HTTPException(404, "Unknown sample.")
            img, _ = decode_or_http((s.samples_dir / item["file"]).read_bytes())
            filename = item["title"]
            dataset = {"label": item["label"], "source": "VisA dataset annotation (not model output)", "licence": "CC BY 4.0"}
            if item.get("mask") and (s.samples_dir / item["mask"]).is_file():
                m = cv2.imread(str(s.samples_dir / item["mask"]), cv2.IMREAD_GRAYSCALE)
                gt_mask = cv2.resize(m, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
        else:
            img, _ = decode_or_http(await read_limited(file))
            filename = re.sub(r"[^A-Za-z0-9._ -]", "_", (file.filename or "upload"))[:80] or "upload"
        if not gate.acquire(blocking=False):
            raise HTTPException(503, "The inspection service is busy. Try again in a moment.")
        try:
            t0 = time.perf_counter()
            res, heat, model_map = inspect(img, ref, state["bb"], rl, {"images": info.images, "validated": info.validated})
            ms = (time.perf_counter() - t0) * 1000
        finally:
            gate.release()
        annotated = render_annotated(img, heat, res["model_output"]["regions"])
        meta = {"filename": filename, "source": "sample" if sample_id else "upload", "reference": {"id": info.id, "name": info.name, "kind": info.kind, "good_images": info.images, "validated": info.validated, "threshold": round(info.tau, 3),
                                                                                                              "evaluation": info.evaluation, "notes": info.notes}, "inference_ms": round(ms, 1), "dataset_annotation": dataset, "method": METHOD, "limitations": LIMITS, **res}
        return store().create(meta, img, annotated, heat, gt_mask, model_map)

    def need(iid: str) -> dict:
        m = store().get(iid)
        if not m:
            raise HTTPException(404, "Inspection not found or expired.")
        return m

    @app.get("/api/inspections")
    def list_inspections(limit: int = 100):
        items = store().list(max(1, min(limit, 300)))
        return {"inspections": [{"id": m["id"], "created_at": m["created_at"], "filename": m["filename"], "source": m["source"], "reference": m["reference"]["name"], "score_ratio": m["model_output"]["score_ratio"],
                                 "flagged_regions": sum(1 for r in m["model_output"]["regions"] if r["status"] == "flagged"), "recommendation": m["recommendation"]["decision"], "human_decision": (m["review"]["current"] or {}).get("decision"),
                                 "thumb_url": f"/api/inspections/{m['id']}/images/thumb"} for m in items]}

    @app.get("/api/inspections/{iid}")
    def get_inspection(iid: str):
        return need(iid)

    @app.delete("/api/inspections/{iid}")
    def delete_inspection(iid: str):
        if not store().delete(iid):
            raise HTTPException(404, "Inspection not found or expired.")
        return {"deleted": True}

    @app.post("/api/inspections/{iid}/review")
    def review(iid: str, body: dict = Body(...)):
        """Record a human decision. `action`: "confirm" (take the recommendation; not allowed when it is MANUAL_REVIEW) or "override" with `decision` PASS|FAIL|MANUAL_REVIEW. `notes` and `reviewer` are free text."""
        m = need(iid)
        action = body.get("action", "override")
        rec = m["recommendation"]["decision"]
        if action == "confirm":
            if rec == REVIEW:
                raise HTTPException(400, "The recommendation is MANUAL REVIEW: choose PASS or FAIL explicitly.")
            decision = rec
        elif action == "override":
            decision = body.get("decision")
            if decision not in DECISIONS:
                raise HTTPException(400, "decision must be PASS, FAIL or MANUAL_REVIEW.")
        else:
            raise HTTPException(400, "action must be confirm or override.")
        notes = str(body.get("notes") or "")[:2000]
        reviewer = re.sub(r"[^\w .@-]", "", str(body.get("reviewer") or ""))[:60]
        rr = body.get("region_reviews") or {}
        if not isinstance(rr, dict) or any(str(k) not in {str(r["id"]) for r in m["model_output"]["regions"]} or v not in ("confirmed", "dismissed", "pending") for k, v in rr.items()):
            raise HTTPException(400, "region_reviews must map existing region ids to confirmed, dismissed or pending.")
        entry = {"decision": decision, "action": action, "notes": notes, "reviewer": reviewer, "at": time.time(), "agrees_with_recommendation": decision == rec, "recommendation_at_review": rec, "rules_revision": int(m.get("rules_revision", 0)),
                 "region_reviews": {str(k): v for k, v in rr.items()}}
        return store().review(iid, entry)

    @app.post("/api/inspections/{iid}/reevaluate")
    def reevaluate(iid: str, body: dict = Body(...)):
        """Apply different quality rules to the stored model output (the model is not run again). Earlier human decisions are kept and show which recommendation they answered."""
        m = need(iid)
        try:
            rl = Rules.parse(body.get("rules") if isinstance(body, dict) else None)
        except RuleError as e:
            raise HTTPException(400, str(e)) from None
        small = store().load_map(iid)
        if small is None:
            raise HTTPException(409, "The stored model output is no longer available; inspect the image again.")
        d = store().path(iid)
        img = cv2.cvtColor(cv2.imread(str(d / "original.jpg")), cv2.COLOR_BGR2RGB)
        h, w = img.shape[:2]
        full = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
        ref = m["reference"]
        mo, rec = evaluate(full, ref["threshold"], rl, {"images": ref["good_images"], "validated": ref["validated"]}, m["model_output"]["condition_checks"], m["model_output"]["anomaly_score"])
        m["model_output"], m["recommendation"] = mo, rec
        m["rules_revision"] = int(m.get("rules_revision", 0)) + 1
        heat = cv2.cvtColor(cv2.imread(str(d / "heatmap.png"), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA)
        store().update(iid, m, render_annotated(img, heat, mo["regions"]))
        return m

    @app.get("/api/inspections/{iid}/images/{kind}")
    def image(iid: str, kind: str):
        r = store().image(iid, kind) if kind in KINDS else None
        if not r:
            raise HTTPException(404, "Image not available.")
        return FileResponse(r[0], media_type=r[1], headers={"Cache-Control": "private, max-age=300"})

    @app.get("/api/inspections/{iid}/report.pdf")
    def report(iid: str):
        m = need(iid)
        d = store().path(iid)
        pdf = make_pdf(m, d / "original.jpg", d / "annotated.jpg")
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="inspection-{iid[:8]}.pdf"'})

    @app.get("/api/inspections/{iid}/report.json")
    def report_json(iid: str):
        return JSONResponse(need(iid), headers={"Content-Disposition": f'attachment; filename="inspection-{iid[:8]}.json"'})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


app = create_app()
