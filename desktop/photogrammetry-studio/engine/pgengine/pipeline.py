"""Operations that run inside a worker process. Each reads the current project state, processes real data, and commits a new history entry."""
from __future__ import annotations

import time

import numpy as np

from . import clean as C, reconstruct as R, refine as F, validate as V
from .common import Progress
from .model import Cloud, Mesh, sample_texture
from .project import Project


def base_cloud(p: Project) -> Cloud:
    """The point cloud the next cleaning/reconstruction step should use: cleaned if present, otherwise the original (a mesh's vertices are used as points when no cloud exists)."""
    for k in ("cleaned", "original"):
        if p.has(k):
            o = p.get(k)
            if isinstance(o, Cloud): return o
            if k == "original": return Cloud(o.vertices, o.colors if o.colors is not None else None, None, dict(o.meta))
    raise ValueError("Import a point cloud or open the sample project first.")


def base_mesh(p: Project) -> Mesh:
    for k in ("refined", "reconstructed", "original"):
        if p.has(k):
            o = p.get(k)
            if isinstance(o, Mesh): return o
    raise ValueError("There is no mesh yet. Run Surface Reconstruction first (or import a mesh).")


def mesh_for_refine(p: Project) -> Mesh:
    """Refinement always starts from the reconstructed mesh (or the imported mesh), never from a previous refinement, so a changed setting is applied to the same input."""
    for k in ("reconstructed", "original"):
        if p.has(k):
            o = p.get(k)
            if isinstance(o, Mesh): return o
    raise ValueError("There is no mesh to refine. Run Surface Reconstruction first (or import a mesh).")


def color_ops(m: Mesh, cloud: Cloud | None, p: dict, prog: Progress) -> tuple[Mesh, list[dict]]:
    """Module F. Geometric smoothing never touches colours; colour clean-up is a separate, optional step."""
    rep = []
    if p.get("transfer") and cloud is not None and cloud.colors is not None and m.colors is None:
        m = R.transfer_colors(m, cloud); rep.append({"step": "transfer", "note": "Vertex colours transferred from the nearest measured points."}); prog.log("Colours transferred from the point cloud.")
    if p.get("bake_texture") and m.texture is not None and m.uvs is not None:
        m.colors = sample_texture(m.texture, m.uvs); rep.append({"step": "bake_texture", "note": "Texture sampled into vertex colours."}); prog.log("Texture baked into vertex colours.")
    cl = p.get("clean")
    if cl is not None and cl is not False and m.colors is not None:
        it = int((cl or {}).get("iterations", 3)); s = float((cl or {}).get("strength", 0.5)); A = F.adjacency(m.faces, len(m.vertices)); deg = np.asarray(A.sum(1)).ravel()
        col = m.colors.astype(np.float64)
        for _ in range(it): col = (1 - s) * col + s * (A @ col) / np.maximum(deg, 1)[:, None]
        m.colors = col.astype(np.float32); rep.append({"step": "clean", "iterations": it, "strength": s, "note": "Vertex colours smoothed over the mesh; geometry untouched."})
    return m, rep


def run(p: Project, op: str, params: dict, prog: Progress) -> dict:
    t0 = time.time(); prog.log(f"Starting: {op}")
    if op == "clean":
        c = base_cloud(p) if not p.has("original") or isinstance(p.get("original"), Cloud) else base_cloud(p)
        src = p.get("original") if p.has("original") else c
        c0 = src if isinstance(src, Cloud) else Cloud(src.vertices, src.colors, None, {})
        out, rep = C.run_cleaning(c0, params, prog); e = p.commit("Point cloud cleanup", op, params, {"cleaned": out}, drop=["reconstructed", "refined", "preview"], report={"steps": rep}, seconds=time.time() - t0)
    elif op == "reconstruct":
        c = base_cloud(p); m, info = R.reconstruct(c, prog=prog, **params); e = p.commit(f"Reconstruction ({R.METHODS[info['method']]['label']})", op, params, {"reconstructed": m}, drop=["refined", "preview"], report=info, seconds=time.time() - t0)
    elif op == "refine":
        m0 = mesh_for_refine(p); out, rep = F.run_refinement(m0, params, prog); cl = p.get("cleaned") if p.has("cleaned") else None
        e = p.commit("Mesh refinement", op, params, {"refined": out}, drop=["preview"], report={"steps": rep}, seconds=time.time() - t0)
    elif op == "color":
        m = base_mesh(p).copy(); cloud = p.get("cleaned") if p.has("cleaned") and isinstance(p.get("cleaned"), Cloud) else (p.get("original") if p.has("original") and isinstance(p.get("original"), Cloud) else None)
        out, rep = color_ops(m, cloud, params, prog); stage = "refined" if p.has("refined") else ("reconstructed" if p.has("reconstructed") else "original")
        e = p.commit("Texture and colour processing", op, params, {stage: out}, report={"steps": rep}, seconds=time.time() - t0)
    elif op == "subdivision_preview":
        m = base_mesh(p); out, st = F.subdivision_preview(m, **params); e = p.commit("Subdivision surface preview", op, params, {"preview": out}, report=st, seconds=time.time() - t0)
    elif op == "pipeline":
        e = run_pipeline(p, params, prog, t0)
    else:
        raise ValueError(f"Unknown operation '{op}'.")
    prog.step("Done", 1.0); prog.log(f"Finished in {time.time() - t0:.1f} s"); return e


def run_pipeline(p: Project, cfg: dict, prog: Progress, t0: float) -> dict:
    """Full preset run: clean -> reconstruct -> refine -> colour, committed as ONE history entry so one Undo returns to the input."""
    new: dict = {}; rep: dict = {}; drop = ["cleaned", "reconstructed", "refined", "preview"]
    src = p.get("original"); has_cloud = isinstance(src, Cloud)
    if has_cloud:
        prog.log("Stage 1/4: cleaning"); sub = Progress(lambda k, d: prog.send(k, d if k == "log" else {"stage": "Cleaning: " + d["stage"], "fraction": 0.0 + 0.2 * d["fraction"]}))
        cl, rep["clean"] = C.run_cleaning(src, cfg["clean"], sub); new["cleaned"] = cl
        prog.log("Stage 2/4: surface reconstruction"); sub = Progress(lambda k, d: prog.send(k, d if k == "log" else {"stage": "Reconstruction: " + d["stage"], "fraction": 0.2 + 0.35 * d["fraction"]}))
        mesh, rep["reconstruct"] = R.reconstruct(cl, prog=sub, **cfg["reconstruct"]); new["reconstructed"] = mesh
    else:
        mesh = src; cl = None; prog.log("Imported mesh: cleaning and reconstruction skipped, refining the imported mesh.")
    prog.log("Stage 3/4: mesh refinement"); sub = Progress(lambda k, d: prog.send(k, d if k == "log" else {"stage": "Refinement: " + d["stage"], "fraction": 0.55 + 0.35 * d["fraction"]}))
    out, rep["refine"] = F.run_refinement(mesh, cfg["refine"], sub)
    prog.log("Stage 4/4: colour processing"); out, rep["color"] = color_ops(out, cl if cl is not None else (src if has_cloud else None), cfg.get("color", {}), prog); new["refined"] = out
    return p.commit("Full pipeline", "pipeline", cfg, new, drop=[k for k in drop if k not in new], report=rep, seconds=time.time() - t0)


def report_for(p: Project, stage: str) -> dict:
    """Quality report: mesh stages get the full validation (against the cleaned points when available); cloud stages get inspection statistics."""
    o = p.get(stage)
    if isinstance(o, Cloud): return {"type": "cloud", **C.inspect(o)}
    ref = None
    for k in ("cleaned", "original"):
        if p.has(k):
            c = p.get(k)
            if isinstance(c, Cloud): ref = c; break
    r = V.quality_report(o, ref); r["type"] = "mesh"
    if p.has("reference"):  # sample project: distance to the true (pre-degradation) mesh
        tr = p.get("reference"); import numpy as np
        pts = o.vertices[np.random.default_rng(0).choice(len(o.vertices), min(len(o.vertices), 40000), replace=False)]; d = V.deviation(tr, pts)
        ext_t = tr.vertices.max(0) - tr.vertices.min(0); ext_m = o.vertices.max(0) - o.vertices.min(0)
        r["against_reference"] = {"mean": float(d.mean()), "p95": float(np.percentile(d, 95)), "max": float(d.max()), "size_error_percent": ((ext_m - ext_t) / ext_t * 100).tolist(), "note": "Distance of the result's vertices to the original, noise-free sample mesh."}
    return r
