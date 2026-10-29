"""LiDAR point-cloud API: loading, preprocessing, heuristic/provided classification, wire-candidate detection, geometric measurement and export.
Only these responsibilities: no CRM/ERP/inventory/HR/payment modules. Distance parameters are always in the cloud's current length unit (see units.label)."""
from __future__ import annotations

import csv
import io
import json
import re
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import asdict

import numpy as np
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from . import classify as cl
from . import ops
from .cloud import ASPRS, UNIT_SHORT, UNIT_TO_M, CloudError, PointCloud, bounds, read_any, write_ply
from .config import Settings
from .measure import MeasureError, measure
from .store import CloudRecord, Store, Version
from .wires import WireParams, detect

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,60}$")
CHUNK = 1024 * 1024
VALID_UNITS = tuple(UNIT_TO_M) + ("unknown",)


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    state: dict = {}
    gate = threading.BoundedSemaphore(max(1, s.max_concurrent))

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        state["store"] = Store(s.ttl_seconds, s.max_clouds, s.max_versions)
        yield

    app = FastAPI(title="Neo Forge LiDAR point cloud & wire measurement", version="1.0.0", lifespan=lifespan,
                  description="Loads PLY/PCD/LAS/LAZ/XYZ point clouds, preprocesses, classifies (provided labels or heuristics), finds wire-like candidates and measures distances and clearances in the cloud's own coordinates. Units are never assumed.")
    app.add_middleware(CORSMiddleware, allow_origins=list(s.allowed_origins), allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"], expose_headers=["X-Meta"])

    def store() -> Store:
        return state["store"]

    def need(cid: str) -> CloudRecord:
        r = store().get(cid)
        if not r:
            raise HTTPException(404, "Point cloud not found or expired.")
        return r

    def ver(rec: CloudRecord, v: str | None) -> Version:
        vid = v or max(rec.versions, key=lambda k: int(k[1:]))
        if vid not in rec.versions:
            raise HTTPException(404, "Unknown version.")
        return rec.versions[vid]

    def busy():
        if not gate.acquire(blocking=False):
            raise HTTPException(503, "The service is busy processing other point clouds. Try again in a moment.")

    # ---- summaries -------------------------------------------------------------------------------------------------------
    def defaults(pc: PointCloud) -> dict:
        upm = pc.units.per_metre()
        w = WireParams.metres(upm)
        return {"length_unit": pc.units.label(), "assumed": not pc.units.known,
                "note": None if pc.units.known else "Units are not known: distance defaults are metre-scale numbers applied as coordinate units. Check them against your data, or set the units.",
                "preprocess": {"voxel": round(0.1 * upm, 4), "sor_k": 16, "sor_std": 2.0, "ror_radius": round(1.0 * upm, 4), "ror_min_neighbors": 4, "normals_k": 20},
                "classify": {"cell": round(2.0 * upm, 4), "ground_tolerance": round(0.3 * upm, 4), "feature_radius": round(1.5 * upm, 4)},
                "wires": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in asdict(w).items()}}

    def vsum(v: Version) -> dict:
        pc = v.pc
        out = {"id": v.id, "parent": v.parent, "description": v.description, "points": len(pc), "bounds": bounds(pc.xyz), "attributes": {"rgb": pc.rgb is not None, "intensity": pc.intensity is not None, "provided_classification": pc.classification is not None, "normals": pc.normals is not None},
               "classification": None if v.labels is None else {**v.label_info, "counts": cl.counts(v.labels)}, "ground_model": v.ground is not None, "wires": None if v.wire_info is None else {**v.wire_info, "count": len(v.wires)}, "log": v.log}
        if pc.classification is not None:
            out["provided_codes"] = {f"{int(k)} {ASPRS.get(int(k), 'other')}": int((pc.classification == k).sum()) for k in np.unique(pc.classification)}
        if pc.intensity is not None:
            out["intensity_range"] = [float(pc.intensity.min()), float(pc.intensity.max())]
        return out

    def csum(rec: CloudRecord) -> dict:
        v0 = rec.versions["v0"]
        pc = v0.pc
        warns = []
        if not pc.units.known:
            warns.append("Coordinate units are not stated in this file. Measurements are reported in coordinate units until you set the units.")
        ext = bounds(pc.xyz)["extent"]
        return {"id": rec.id, "name": rec.name, "created_at": rec.created, "info": pc.info, "units": pc.units.to_json(), "extent": ext, "versions": [vsum(v) for v in rec.versions.values()], "defaults": defaults(pc),
                "measurements": len(rec.measurements), "warnings": warns + ([f"{pc.info['dropped_non_finite']} points with missing or non-finite coordinates were dropped on load."] if pc.info.get("dropped_non_finite") else [])}

    # ---- meta ------------------------------------------------------------------------------------------------------------
    @app.get("/api/health")
    def health():
        try:
            import laspy
            las = laspy.__version__
            try:
                import lazrs  # noqa: F401
                laz = True
            except ImportError:
                laz = False
        except ImportError:
            las, laz = None, False
        return {"ok": True, "formats": {"ply": True, "pcd": True, "las": las is not None, "laz": laz, "xyz/txt/csv": True}, "limits": {"max_file_mb": s.max_file_mb, "max_points": s.max_points, "max_versions": s.max_versions, "ttl_seconds": s.ttl_seconds},
                "classification": "provided ASPRS labels or documented geometric heuristics; not a trained model", "wire_detection": "geometric candidates (PCA line-likeness + connected components + sequential RANSAC); not validated on arbitrary data", "clouds_loaded": len(store().clouds)}

    @app.get("/api/samples")
    def samples():
        m = s.samples_dir / "manifest.json"
        if not m.is_file():
            return {"samples": []}
        try:
            return {"samples": json.loads(m.read_text())["samples"]}
        except (ValueError, KeyError):
            return {"samples": []}

    # ---- upload ----------------------------------------------------------------------------------------------------------
    def register(data: bytes, name: str, units: str | None) -> dict:
        try:
            pc = read_any(data, name, s.max_points)
        except CloudError as e:
            raise HTTPException(422, str(e)) from None
        if units:
            _apply_units(pc, units)
        rec = store().add(re.sub(r"[^A-Za-z0-9._ -]", "_", name)[:80] or "cloud", pc)
        return csum(rec)

    def _apply_units(pc: PointCloud, units: str) -> None:
        if units not in VALID_UNITS:
            raise HTTPException(400, f"units must be one of: {', '.join(VALID_UNITS)}.")
        if units == "unknown":
            pc.units.horizontal = pc.units.vertical = "unknown"
            pc.units.source = "set by user to unknown"
        else:
            pc.units.horizontal = pc.units.vertical = units
            pc.units.source = "set by user"
            pc.units.notes = [n for n in pc.units.notes if "treated as unknown" not in n]

    @app.post("/api/pointcloud/upload", status_code=201)
    async def upload(file: UploadFile = File(...), units: str | None = Form(None)):
        size, parts = 0, []
        while chunk := await file.read(CHUNK):
            size += len(chunk)
            if size > s.max_file_mb * 1_000_000:
                raise HTTPException(413, f"The file is larger than the {s.max_file_mb} MB limit.")
            parts.append(chunk)
        if size == 0:
            raise HTTPException(400, "The file is empty.")
        busy()
        try:
            return register(b"".join(parts), file.filename or "upload", units)
        finally:
            gate.release()

    @app.post("/api/pointcloud/from-sample", status_code=201)
    def from_sample(body: dict = Body(...)):
        sid = str(body.get("sample_id", ""))
        item = next((x for x in samples()["samples"] if x["id"] == sid), None) if ID_RE.match(sid) else None
        if not item:
            raise HTTPException(404, "Unknown sample.")
        busy()
        try:
            out = register((s.samples_dir / item["file"]).read_bytes(), item["file"], None)
        finally:
            gate.release()
        return {**out, "sample": item}

    @app.get("/api/pointcloud/{cid}/summary")
    def summary(cid: str):
        return csum(need(cid))

    @app.delete("/api/pointcloud/{cid}")
    def delete(cid: str):
        if not store().delete(cid):
            raise HTTPException(404, "Point cloud not found or expired.")
        return {"deleted": True}

    @app.delete("/api/pointcloud/{cid}/versions/{vid}")
    def delete_version(cid: str, vid: str):
        rec = need(cid)
        if vid == "v0" or vid not in rec.versions:
            raise HTTPException(400, "The original (v0) cannot be deleted, and the version must exist.")
        with rec.lock:
            rec.versions.pop(vid)
        return csum(rec)

    @app.post("/api/pointcloud/{cid}/units")
    def set_units(cid: str, body: dict = Body(...)):
        """Declare the coordinate units (the file does not say). Changes how values are reported; coordinates are never rescaled."""
        rec = need(cid)
        units = body.get("units")
        with rec.lock:
            for v in rec.versions.values():
                _apply_units(v.pc, str(units))
            rec.versions["v0"].pc.units  # shared object semantics: each version holds the same Units instance
        return csum(rec)

    # ---- processing ------------------------------------------------------------------------------------------------------
    @app.post("/api/pointcloud/{cid}/preprocess", status_code=201)
    def preprocess(cid: str, body: dict = Body(...)):
        """body: {version?, ops: [{op: voxel_downsample|statistical_outlier_removal|radius_outlier_removal|crop|estimate_normals, ...}]} -> a new version."""
        rec = need(cid)
        v = ver(rec, body.get("version"))
        steps = body.get("ops")
        if not isinstance(steps, list) or not 1 <= len(steps) <= 8:
            raise HTTPException(400, "ops must be a list of 1-8 operations.")
        busy()
        try:
            cur, log, desc = v.pc, [], []
            for st in steps:
                if not isinstance(st, dict):
                    raise HTTPException(400, "Each operation must be an object.")
                before = len(cur)
                t0 = time.perf_counter()
                try:
                    cur, d = ops.apply(cur, st, cur.units.per_metre())
                except CloudError as e:
                    raise HTTPException(422, str(e)) from None
                log.append({"op": d, "before": before, "after": len(cur), "seconds": round(time.perf_counter() - t0, 3)})
                desc.append(d)
            nv = store().new_version(rec, v.id, " → ".join(desc), cur)
            nv.log = v.log + log if v.id != "v0" else log
        except ValueError as e:
            raise HTTPException(409, str(e)) from None
        finally:
            gate.release()
        return {"version": vsum(nv), "steps": log}

    @app.post("/api/pointcloud/{cid}/classify")
    def classify(cid: str, body: dict = Body(default={})):
        """body: {version?, method: auto|provided|heuristic, cell?, ground_tolerance?, feature_radius?}. Heuristic results are labelled as heuristics."""
        rec = need(cid)
        v = ver(rec, body.get("version"))
        method = body.get("method", "auto")
        if method not in ("auto", "provided", "heuristic"):
            raise HTTPException(400, "method must be auto, provided or heuristic.")
        has = v.pc.classification is not None
        if method == "provided" and not has:
            raise HTTPException(409, "This cloud carries no classification labels. Use method heuristic.")
        use_provided = method == "provided" or (method == "auto" and has)
        d = defaults(v.pc)["classify"]
        try:
            cell, tol, rad = (float(body.get("cell", d["cell"])), float(body.get("ground_tolerance", d["ground_tolerance"])), float(body.get("feature_radius", d["feature_radius"])))
        except (TypeError, ValueError):
            raise HTTPException(400, "cell, ground_tolerance and feature_radius must be numbers.") from None
        if not (cell > 0 and tol > 0 and rad > 0):
            raise HTTPException(400, "Distances must be positive.")
        busy()
        try:
            t0 = time.perf_counter()
            upm = v.pc.units.per_metre()
            with rec.lock:
                if use_provided:
                    lab, info = cl.from_provided(v.pc)
                    gm, hag = cl.ground_from_labels(v.pc.xyz, lab == cl.GROUND, cell)
                    v.ground_source = "ground points provided in the file"
                else:
                    lab, info, gm, hag = _heuristic(v.pc, cell, tol, rad)
                    v.ground_source = "heuristic ground surface (progressive morphological filter)"
                v.labels, v.base_labels, v.label_info, v.ground, v.hag = lab, lab.copy(), {**info, "seconds": round(time.perf_counter() - t0, 2)}, gm, hag.astype(np.float32)
                v.wires, v.wire_info = {}, None
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        finally:
            gate.release()
        return vsum(v)

    def _heuristic(pc: PointCloud, cell: float, tol: float, rad: float):
        # parameters arrive in the cloud's current unit, so no further scaling is applied here
        return cl.heuristic(pc, pc.units.per_metre(), cell, tol, rad)

    @app.post("/api/pointcloud/{cid}/detect-wires")
    def detect_wires(cid: str, body: dict = Body(default={})):
        """body: {version?, params?: {min_height, radius, min_linearity, link, min_support, min_length, inlier_tol, max_rms, min_coverage}} in the cloud's length unit."""
        rec = need(cid)
        v = ver(rec, body.get("version"))
        if v.labels is None or v.hag is None:
            raise HTTPException(409, "Classify the cloud first: wire detection needs a ground model.")
        raw = body.get("params") or {}
        if not isinstance(raw, dict):
            raise HTTPException(400, "params must be an object.")
        p = WireParams.metres(1.0)
        # start from the unit-aware defaults, then apply user values (all in the cloud's unit)
        base = defaults(v.pc)["wires"]
        for k, val in base.items():
            setattr(p, k, type(getattr(p, k))(val))
        for k, val in raw.items():
            if not hasattr(p, k):
                raise HTTPException(400, f"Unknown wire parameter '{str(k)[:30]}'.")
            try:
                setattr(p, k, type(getattr(p, k))(val))
            except (TypeError, ValueError):
                raise HTTPException(400, f"{k} must be a number.") from None
        if p.min_support < 5 or p.min_linearity <= 0 or p.min_linearity > 1 or p.radius <= 0 or p.inlier_tol <= 0 or p.link <= 0:
            raise HTTPException(400, "Invalid wire parameters (min_support >= 5, 0 < min_linearity <= 1, positive distances).")
        busy()
        try:
            t0 = time.perf_counter()
            with rec.lock:
                wires, diag = detect(v.pc.xyz, v.hag.astype(np.float64), v.labels, p)
                lab = v.base_labels.copy()
                for w in wires:
                    lab[w.support] = cl.WIRE
                v.labels = lab
                v.wires = {w.id: w for w in wires}
                v.wire_info = {"params": asdict(p), "diagnostics": diag, "seconds": round(time.perf_counter() - t0, 2), "unit": v.pc.units.label(),
                               "honesty": "Wire candidates are geometric evidence of thin, elevated, line-like structures. They are not verified as wires."}
        finally:
            gate.release()
        return {"version": vsum(v), "wires": [w.to_json() for w in wires], "diagnostics": diag}

    @app.get("/api/pointcloud/{cid}/wires")
    def wires_list(cid: str, version: str | None = None, step: float | None = None):
        rec = need(cid)
        v = ver(rec, version)
        st = step if step and step > 0 else 0.5 * v.pc.units.per_metre()
        out = []
        for w in v.wires.values():
            j = w.to_json()
            sm = w.samples(max(st, (w.s1 - w.s0) / 400.0))
            j["curve"] = [[float(a), float(b), float(c)] for a, b, c in sm]
            out.append(j)
        return {"wires": out, "info": v.wire_info}

    @app.post("/api/pointcloud/{cid}/measure", status_code=201)
    def do_measure(cid: str, body: dict = Body(...)):
        rec = need(cid)
        v = ver(rec, body.get("version"))
        a, b = body.get("a"), body.get("b")
        if not isinstance(a, dict) or not isinstance(b, dict):
            raise HTTPException(400, "a and b must be selectors, e.g. {\"kind\":\"point\",\"xyz\":[x,y,z]} or {\"kind\":\"wire\",\"id\":\"W1\"}.")
        try:
            res = measure(str(body.get("type") or "auto"), a, b, v.pc.units, v.wires, v.pc.xyz, v.labels, v.ground, v.ground_source, body.get("threshold"))
        except MeasureError as e:
            raise HTTPException(422, str(e)) from None
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, "The measurement request was not valid.") from None
        with rec.lock:
            res = {"id": f"M{rec.next_measure}", "version": v.id, "created_at": time.time(), "label": str(body.get("label") or "")[:60], **res}
            rec.next_measure += 1
            rec.measurements.append(res)
        return res

    @app.get("/api/pointcloud/{cid}/measurements")
    def measurements(cid: str):
        return {"measurements": need(cid).measurements}

    @app.delete("/api/pointcloud/{cid}/measurements/{mid}")
    def del_measurement(cid: str, mid: str):
        rec = need(cid)
        with rec.lock:
            n = len(rec.measurements)
            rec.measurements = [m for m in rec.measurements if m["id"] != mid]
            if len(rec.measurements) == n:
                raise HTTPException(404, "Unknown measurement.")
        return {"deleted": True}

    # ---- viewer data -----------------------------------------------------------------------------------------------------
    def view_arrays(v: Version, max_points: int):
        n = len(v.pc)
        if n > max_points:
            idx = np.sort(np.random.default_rng(1).choice(n, max_points, replace=False))
        else:
            idx = np.arange(n)
        lo, hi = v.pc.xyz.min(0), v.pc.xyz.max(0)
        origin = (lo + hi) / 2
        return idx, origin

    @app.get("/api/pointcloud/{cid}/points/meta")
    def points_meta(cid: str, version: str | None = None, max_points: int = Query(0, ge=0)):
        rec = need(cid)
        v = ver(rec, version)
        mp = min(max_points or s.view_points, s.view_points)
        idx, origin = view_arrays(v, mp)
        loc = v.pc.xyz[idx] - origin
        return {"version": v.id, "n": int(len(idx)), "total": len(v.pc), "decimated": len(idx) < len(v.pc), "origin": [float(x) for x in origin], "local_min": [float(x) for x in loc.min(0)], "local_max": [float(x) for x in loc.max(0)],
                "has_rgb": v.pc.rgb is not None, "has_intensity": v.pc.intensity is not None, "has_hag": v.hag is not None, "has_labels": v.labels is not None,
                "intensity_range": [float(v.pc.intensity.min()), float(v.pc.intensity.max())] if v.pc.intensity is not None else None, "label_names": cl.NAMES, "units": v.pc.units.to_json(),
                "layout": "float32 xyz (n*3, local = world - origin) | uint8 label (n) | uint8 rgb (n*3, if has_rgb) | float32 intensity (n, if has_intensity) | float32 height above ground (n, if has_hag)"}

    @app.get("/api/pointcloud/{cid}/points/data")
    def points_data(cid: str, version: str | None = None, max_points: int = Query(0, ge=0)):
        rec = need(cid)
        v = ver(rec, version)
        mp = min(max_points or s.view_points, s.view_points)
        idx, origin = view_arrays(v, mp)
        parts = [(v.pc.xyz[idx] - origin).astype("<f4").tobytes(), (v.labels[idx] if v.labels is not None else np.zeros(len(idx), np.uint8)).astype("u1").tobytes()]
        if v.pc.rgb is not None:
            parts.append(v.pc.rgb[idx].astype("u1").tobytes())
        if v.pc.intensity is not None:
            parts.append(v.pc.intensity[idx].astype("<f4").tobytes())
        if v.hag is not None:
            parts.append(v.hag[idx].astype("<f4").tobytes())
        return Response(b"".join(parts), media_type="application/octet-stream", headers={"Cache-Control": "no-store"})

    # ---- export ----------------------------------------------------------------------------------------------------------
    @app.get("/api/pointcloud/{cid}/export")
    def export(cid: str, kind: str = Query("ply", pattern="^(ply|measurements\\.csv|measurements\\.json|wires\\.json)$"), version: str | None = None):
        rec = need(cid)
        v = ver(rec, version)
        if kind == "ply":
            return Response(write_ply(v.pc, v.labels), media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="pointcloud-{v.id}.ply"'})
        if kind == "measurements.json":
            return JSONResponse({"units": v.pc.units.to_json(), "measurements": rec.measurements}, headers={"Content-Disposition": 'attachment; filename="measurements.json"'})
        if kind == "wires.json":
            return JSONResponse({"units": v.pc.units.to_json(), "wires": [w.to_json() for w in v.wires.values()], "info": v.wire_info}, headers={"Content-Disposition": 'attachment; filename="wire-candidates.json"'})
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["id", "label", "type", "geometry", "value", "unit", "value_m", "horizontal", "vertical", "method", "status", "threshold_status", "notes"])
        for m in rec.measurements:
            c = m.get("components", {})
            w.writerow([m["id"], m.get("label", ""), m["type"], " | ".join(m["geometry"]), round(m["value"], 4), m["unit"], round(m["value_m"], 4) if "value_m" in m else "", round(c.get("horizontal", float("nan")), 4) if "horizontal" in c else "",
                        round(c.get("vertical", c.get("vertical_wire_minus_object", float("nan"))), 4) if ("vertical" in c or "vertical_wire_minus_object" in c) else "", m["method"], m["status"], (m.get("threshold_check") or {}).get("status", ""), " ".join(m.get("notes", []))])
        return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="measurements.csv"'})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # never leak internals
        return JSONResponse({"detail": "Internal error."}, status_code=500)

    return app


app = create_app()
