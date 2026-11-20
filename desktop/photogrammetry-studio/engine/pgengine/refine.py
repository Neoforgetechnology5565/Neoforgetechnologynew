"""Modules D and E: mesh refinement. Smoothing is implemented here (sparse Laplacian operators with feature locking and a hard limit on how far a vertex may move),
so the user's size and sharp edges are protected. Topology operations use PyMeshLab / Open3D / Trimesh."""
from __future__ import annotations

import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
from scipy.spatial import cKDTree

from .common import Progress
from .model import Mesh, from_o3d_mesh, to_o3d_mesh
from .validate import boundary_loops, edge_table, face_components, triangle_areas


# ------------------------------------------------------------------------------------------------------- geometry helpers
def adjacency(f: np.ndarray, n: int) -> csr_matrix:
    r = np.concatenate([f[:, 0], f[:, 1], f[:, 2], f[:, 1], f[:, 2], f[:, 0]]); c = np.concatenate([f[:, 1], f[:, 2], f[:, 0], f[:, 0], f[:, 1], f[:, 2]])
    A = coo_matrix((np.ones(len(r)), (r, c)), shape=(n, n)).tocsr(); A.data[:] = 1.0; return A


def face_normals(v: np.ndarray, f: np.ndarray) -> np.ndarray:
    n = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]); return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-30)


def vertex_normals(v: np.ndarray, f: np.ndarray) -> np.ndarray:
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]); out = np.zeros_like(v)
    for k in range(3): np.add.at(out, f[:, k], fn)
    return out / (np.linalg.norm(out, axis=1, keepdims=True) + 1e-30)


def feature_vertices(v: np.ndarray, f: np.ndarray, angle_deg: float) -> np.ndarray:
    """Vertices on sharp edges: the angle between the normals of the two faces sharing an edge exceeds angle_deg. Boundary vertices count as features too."""
    n = len(v); fn = face_normals(v, f); uk, inv, cnt, _, e = edge_table(f); fid = np.tile(np.arange(len(f)), 3); order = np.argsort(inv, kind="stable"); inv_s = inv[order]; fs = fid[order]; es = e[order]
    first = np.r_[0, np.flatnonzero(np.diff(inv_s)) + 1]; c = cnt[inv_s[first]]; mask = np.zeros(n, bool)
    two = first[c == 2]; a = fs[two]; b = fs[two + 1]; cosang = (fn[a] * fn[b]).sum(1); sharp = cosang < np.cos(np.radians(angle_deg)); ev = es[two[sharp]]; mask[ev.ravel()] = True
    one = first[c == 1]; mask[es[one].ravel()] = True; return mask


def mean_edge(v: np.ndarray, f: np.ndarray) -> float:
    return float(np.linalg.norm(v[f[:, [1, 2, 0]]] - v[f], axis=2).mean())


# ------------------------------------------------------------------------------------------------------------- smoothing
def smooth(m: Mesh, method: str = "taubin", iterations: int = 10, lam: float = 0.5, mu: float = -0.53, strength: float = 1.0, preserve_features: float = 1.0, feature_angle: float = 40.0,
           curvature_aware: bool = False, max_move: float = 0.5, keep_boundary: bool = True, prog: Progress | None = None, **_) -> tuple[Mesh, dict]:
    """method: laplacian | taubin | bilateral | regularize.
    preserve_features (0-1): 1 freezes vertices on sharp edges (> feature_angle); curvature_aware lowers the step on strongly curved areas;
    max_move: vertices never leave a ball of max_move x average edge length around their original position, which bounds the change in size."""
    prog = prog or Progress(); v0 = m.vertices.copy(); v = m.vertices.copy(); f = m.faces; n = len(v); A = adjacency(f, n); deg = np.asarray(A.sum(1)).ravel(); inv_deg = 1.0 / np.maximum(deg, 1); me = mean_edge(v, f)
    w = np.ones(n) * strength
    feat = feature_vertices(v0, f, feature_angle) if (preserve_features > 0 or keep_boundary) else np.zeros(n, bool)
    if preserve_features > 0: w[feat] *= (1.0 - preserve_features)
    elif keep_boundary: pass
    if keep_boundary:
        b = np.zeros(n, bool)
        for l in boundary_loops(f): b[l] = True
        w[b] = 0.0
    if curvature_aware:
        lap0 = (A @ v) * inv_deg[:, None] - v; c = np.linalg.norm(lap0, axis=1); ref = np.quantile(c, 0.75) + 1e-30; w *= 1.0 / (1.0 + (c / ref) ** 2)
    if not np.all(deg > 0): w[deg == 0] = 0

    def L(x): return (A @ x) * inv_deg[:, None] - x
    for it in range(int(iterations)):
        if method == "laplacian": v = v + (lam * w)[:, None] * L(v)
        elif method == "taubin": v = v + (lam * w)[:, None] * L(v); v = v + (mu * w)[:, None] * L(v)
        elif method == "regularize":
            nrm = vertex_normals(v, f); d = L(v); d = d - (d * nrm).sum(1, keepdims=True) * nrm; v = v + (lam * w)[:, None] * d
        elif method == "bilateral":
            v = _bilateral(v, f, A, w * lam)
        else: raise ValueError(f"Unknown smoothing method '{method}'.")
        if max_move > 0:  # hard bound on the displacement from the original position
            dv = v - v0; ln = np.linalg.norm(dv, axis=1); lim = max_move * me; s = np.where(ln > lim, lim / (ln + 1e-30), 1.0); v = v0 + dv * s[:, None]
        prog.step(f"{method} smoothing", (it + 1) / iterations)
    d = np.linalg.norm(v - v0, axis=1); out = Mesh(v, f.copy(), m.colors, m.uvs, m.texture, dict(m.meta))
    ext0 = v0.max(0) - v0.min(0); ext1 = v.max(0) - v.min(0)
    return out, {"method": method, "iterations": int(iterations), "frozen_feature_vertices": int(feat.sum()) if preserve_features > 0 else 0, "mean_move": float(d.mean()), "max_move": float(d.max()), "max_move_over_edge": float(d.max() / me),
                 "size_change_percent": ((ext1 - ext0) / np.maximum(ext0, 1e-30) * 100).tolist()}


def _bilateral(v: np.ndarray, f: np.ndarray, A: csr_matrix, step: np.ndarray) -> np.ndarray:
    """Normal-direction bilateral filter (Fleishman et al. 2003): each vertex moves along its normal by a weighted mean of the neighbours' height above its tangent plane.
    Weights fall off with distance and with the height difference, so noise (small heights) is removed while edges (large heights) are kept."""
    n = len(v); nrm = vertex_normals(v, f); Ac = A.tocoo(); i = Ac.row; j = Ac.col; dvec = v[j] - v[i]; t = np.linalg.norm(dvec, axis=1); h = (dvec * nrm[i]).sum(1)
    sc = np.bincount(i, t, minlength=n) / np.maximum(np.bincount(i, minlength=n), 1); mh = np.bincount(i, h, minlength=n) / np.maximum(np.bincount(i, minlength=n), 1)
    ss = np.sqrt(np.maximum(np.bincount(i, (h - mh[i]) ** 2, minlength=n) / np.maximum(np.bincount(i, minlength=n), 1), 0)) + 1e-12
    wgt = np.exp(-(t ** 2) / (2 * sc[i] ** 2 + 1e-30)) * np.exp(-(h ** 2) / (2 * ss[i] ** 2)); num = np.bincount(i, wgt * h, minlength=n); den = np.bincount(i, wgt, minlength=n) + 1e-30
    return v + (step * num / den)[:, None] * nrm


# ----------------------------------------------------------------------------------------------------- topology operations
def _ml(m: Mesh):
    import pymeshlab as pm
    ms = pm.MeshSet(); kw = {}
    if m.colors is not None: kw["v_color_matrix"] = np.column_stack([m.colors, np.ones(len(m.colors))]).astype(np.float64)
    ms.add_mesh(pm.Mesh(vertex_matrix=m.vertices, face_matrix=m.faces.astype(np.int32), **kw)); return ms


def _from_ml(ms, like: Mesh | None) -> Mesh:
    cm = ms.current_mesh(); col = None
    try:
        c = cm.vertex_color_matrix()
        if c is not None and len(c) == cm.vertex_number() and like is not None and like.colors is not None: col = c[:, :3].astype(np.float32)
    except Exception: pass
    return Mesh(cm.vertex_matrix().astype(np.float64), cm.face_matrix().astype(np.int64), col, None, None, dict(like.meta) if like else {})


def recolor(new: Mesh, old: Mesh) -> Mesh:
    """After a topology change, copy colours from the nearest vertices of the previous mesh (geometry untouched). Texture/UVs cannot follow a topology change and are dropped."""
    if old.colors is None and old.texture is not None and old.uvs is not None:
        from .model import sample_texture
        old = Mesh(old.vertices, old.faces, sample_texture(old.texture, old.uvs))
    if old.colors is None: new.colors = None; return new
    t = cKDTree(old.vertices); d, i = t.query(new.vertices, k=3, workers=-1); w = 1.0 / (d + 1e-12); w /= w.sum(1, keepdims=True); new.colors = (old.colors[i] * w[..., None]).sum(1).astype(np.float32); new.uvs = None; new.texture = None; return new


def decimate(m: Mesh, ratio: float = 0.5, target_faces: int = 0, preserve_boundary: bool = True, preserve_normals: bool = True, planar: bool = False, prog: Progress | None = None, **_) -> tuple[Mesh, dict]:
    """Quadric edge-collapse decimation (PyMeshLab). target_faces wins over ratio. planar=True adds a planar-simplification term that keeps flat areas flat (hard-surface parts)."""
    nf = len(m.faces); tgt = int(target_faces) if target_faces else max(4, int(nf * ratio))
    if tgt >= nf: return m.copy(), {"before": nf, "after": nf, "note": "Target is not smaller than the current face count; nothing to do."}
    ms = _ml(m); ms.meshing_decimation_quadric_edge_collapse(targetfacenum=tgt, preserveboundary=preserve_boundary, preservenormal=preserve_normals, planarquadric=planar, optimalplacement=True, qualitythr=0.3, autoclean=True)
    out = recolor(_from_ml(ms, m), m); out.meta = dict(m.meta)
    return out, {"before": nf, "after": len(out.faces), "target": tgt, "texture_note": "Texture map dropped (topology changed); colours baked to vertices." if m.texture is not None else ""}


def remove_small_components(m: Mesh, min_fraction: float = 0.05, **_) -> tuple[Mesh, dict]:
    """Keep face-connected components with at least min_fraction of the largest component's faces."""
    nc, lab = face_components(m.faces, len(m.vertices)); fl = lab[m.faces[:, 0]]; sizes = np.bincount(fl, minlength=nc); keepc = sizes >= max(1, min_fraction * sizes.max()); keep = keepc[fl]
    return _subset(m, keep), {"components_before": int((sizes > 0).sum()), "components_removed": int(((sizes > 0) & ~keepc).sum()), "faces_removed": int((~keep).sum())}


def _subset(m: Mesh, keep_faces: np.ndarray) -> Mesh:
    f = m.faces[keep_faces]; used = np.unique(f); remap = -np.ones(len(m.vertices), np.int64); remap[used] = np.arange(len(used))
    return Mesh(m.vertices[used], remap[f], None if m.colors is None else m.colors[used], None if m.uvs is None else m.uvs[used], m.texture, dict(m.meta))


def remove_degenerate(m: Mesh, **_) -> tuple[Mesh, dict]:
    a = triangle_areas(m.vertices, m.faces); f = m.faces; bad = (a <= 1e-12 * max(1e-12, float(np.linalg.norm(m.vertices.max(0) - m.vertices.min(0)))) ** 2) | (f[:, 0] == f[:, 1]) | (f[:, 1] == f[:, 2]) | (f[:, 0] == f[:, 2])
    return _subset(m, ~bad), {"removed": int(bad.sum())}


def optimize(m: Mesh, **_) -> tuple[Mesh, dict]:
    """Merge coincident vertices, drop duplicate and degenerate faces and unused vertices."""
    nv, nf = len(m.vertices), len(m.faces); ms = _ml(m); ms.meshing_remove_duplicate_vertices(); ms.meshing_remove_duplicate_faces(); ms.meshing_remove_unreferenced_vertices(); out = _from_ml(ms, m)
    if len(out.vertices) == nv and m.uvs is not None: out.uvs = m.uvs; out.texture = m.texture  # nothing merged: attributes still line up
    out, st = remove_degenerate(out); return out, {"vertices": f"{nv:,} -> {len(out.vertices):,}", "faces": f"{nf:,} -> {len(out.faces):,}", "degenerate_removed": st["removed"]}


def fill_holes(m: Mesh, max_hole_edges: int = 30, **_) -> tuple[Mesh, dict]:
    """Close boundary loops of at most max_hole_edges edges (PyMeshLab). Larger openings are left alone: closing them would be guessing."""
    before = boundary_loops(m.faces); ms = _ml(m); ms.meshing_close_holes(maxholesize=int(max_hole_edges), refinehole=False, selfintersection=False); out = recolor(_from_ml(ms, m), m) if m.colors is not None or m.texture is not None else _from_ml(ms, m)
    after = boundary_loops(out.faces); return out, {"holes_before": len(before), "holes_after": len(after), "closed": max(0, len(before) - len(after)), "faces_added": len(out.faces) - len(m.faces)}


def repair_non_manifold(m: Mesh, **_) -> tuple[Mesh, dict]:
    _, _, cnt0, _, _ = edge_table(m.faces); nm0 = int((cnt0 > 2).sum()); ms = _ml(m); ms.meshing_repair_non_manifold_edges(method="Remove Faces"); ms.meshing_repair_non_manifold_vertices(vertdispratio=0.0); ms.meshing_remove_unreferenced_vertices()
    out = recolor(_from_ml(ms, m), m) if (m.colors is not None or m.texture is not None) else _from_ml(ms, m)
    nm1 = int((edge_table(out.faces)[2] > 2).sum()) if len(out.faces) else 0; return out, {"non_manifold_edges_before": nm0, "non_manifold_edges_after": nm1}


def fix_normals(m: Mesh, **_) -> tuple[Mesh, dict]:
    """Make triangle winding consistent per connected piece and point closed pieces outward."""
    import trimesh
    _, _, cnt, nfwd, _ = edge_table(m.faces); before = int(((cnt == 2) & (nfwd != 1)).sum()); tm = trimesh.Trimesh(m.vertices, m.faces, process=False); trimesh.repair.fix_normals(tm, multibody=True)
    out = Mesh(m.vertices.copy(), np.asarray(tm.faces, dtype=np.int64), m.colors, m.uvs, m.texture, dict(m.meta)); _, _, cnt2, nfwd2, _ = edge_table(out.faces)
    return out, {"inconsistent_edges_before": before, "inconsistent_edges_after": int(((cnt2 == 2) & (nfwd2 != 1)).sum())}


def adaptive_remesh(m: Mesh, target_edge_percent: float = 1.0, iterations: int = 6, adaptive: bool = True, feature_angle: float = 30.0, **_) -> tuple[Mesh, dict]:
    """Isotropic explicit remeshing (PyMeshLab): even triangles near a target edge length (percent of the bounding-box diagonal); adaptive mode uses smaller triangles in curved areas.
    The result is re-projected onto the input surface (surface-distance check keeps the shape)."""
    import pymeshlab as pm
    ms = _ml(m); ms.meshing_isotropic_explicit_remeshing(iterations=int(iterations), adaptive=bool(adaptive), targetlen=pm.PercentageValue(float(target_edge_percent)), featuredeg=float(feature_angle), checksurfdist=True, maxsurfdist=pm.PercentageValue(0.5), reprojectflag=True)
    out = recolor(_from_ml(ms, m), m); return out, {"before": len(m.faces), "after": len(out.faces)}


def refine_long_edges(m: Mesh, edge_percent: float = 1.0, iterations: int = 1, **_) -> tuple[Mesh, dict]:
    """Local refinement: edges longer than edge_percent of the bounding-box diagonal are split at their midpoint (PyMeshLab midpoint subdivision). Vertices are not moved."""
    import pymeshlab as pm
    ms = _ml(m); ms.meshing_surface_subdivision_midpoint(iterations=int(iterations), threshold=pm.PercentageValue(float(edge_percent))); out = recolor(_from_ml(ms, m), m); return out, {"before": len(m.faces), "after": len(out.faces)}


def subdivision_preview(m: Mesh, iterations: int = 1, **_) -> tuple[Mesh, dict]:
    """Loop subdivision for a smooth-surface preview only (shown as its own stage; the working mesh is not changed)."""
    o = to_o3d_mesh(m).subdivide_loop(number_of_iterations=int(iterations)); out = from_o3d_mesh(o); out = recolor(out, m) if m.colors is not None else out; return out, {"faces": len(out.faces)}


def inspect_geometry(m: Mesh, **_) -> tuple[Mesh, dict]:
    """Per-vertex geometry inspection: returns the mesh unchanged plus statistics on edge length, triangle quality and curvature proxy."""
    v, f = m.vertices, m.faces; el = np.linalg.norm(v[f[:, [1, 2, 0]]] - v[f], axis=2); a = triangle_areas(v, f); q = 4 * np.sqrt(3) * a / (el ** 2).sum(1).clip(1e-30)
    A = adjacency(f, len(v)); deg = np.asarray(A.sum(1)).ravel(); lap = np.linalg.norm((A @ v) / np.maximum(deg, 1)[:, None] - v, axis=1)
    return m, {"edge_min": float(el.min()), "edge_mean": float(el.mean()), "edge_max": float(el.max()), "triangle_quality_mean": float(q.mean()), "triangle_quality_p5": float(np.percentile(q, 5)), "curvature_proxy_p95": float(np.percentile(lap, 95))}


OPS = {"smooth": smooth, "decimate": decimate, "small_components": remove_small_components, "degenerate": remove_degenerate, "optimize": optimize, "fill_holes": fill_holes,
       "non_manifold": repair_non_manifold, "normals": fix_normals, "remesh": adaptive_remesh, "refine_edges": refine_long_edges}
ORDER = ["degenerate", "small_components", "non_manifold", "normals", "fill_holes", "smooth", "remesh", "refine_edges", "decimate", "non_manifold", "degenerate", "small_components", "optimize", "normals"]


def run_refinement(m: Mesh, p: dict, prog: Progress) -> tuple[Mesh, list[dict]]:
    """Runs the enabled refinement steps in a safe order (repair first, smooth, change topology, decimate, clean up). p = {"smooth": {...}|None, ...}; a step runs when its entry is a dict."""
    report = []; cur = m; todo: list[str] = []; on = lambda k: p.get(k) is not None and p.get(k) is not False  # noqa: E731
    topo = any(on(k) for k in ("remesh", "refine_edges", "decimate")); repair = ("non_manifold", "degenerate", "small_components", "normals")
    for k in ORDER:  # repair steps run a second time after topology-changing steps, which can create new defects
        if not on(k): continue
        if k in todo and not (k in repair and topo and todo.count(k) < 2): continue
        todo.append(k)
    for i, k in enumerate(todo):
        prog.step(k, i / max(1, len(todo))); params = p[k] if isinstance(p[k], dict) else {}; before = (len(cur.vertices), len(cur.faces))
        if k == "smooth": params = {**params, "prog": Progress(lambda kind, d, _p=prog: _p.send(kind, d) if kind == "log" else None)}
        cur, st = OPS[k](cur, **params); st = {key: val for key, val in st.items()}; st.update({"step": k, "vertices_before": before[0], "faces_before": before[1], "vertices": len(cur.vertices), "faces": len(cur.faces)})
        report.append(st); prog.log(f"{k}: {before[1]:,} -> {len(cur.faces):,} faces")
    # Decimation and hole filling can leave a few new defects; repeat the enabled repair steps (at most 3 rounds) until the mesh is structurally clean.
    for rnd in range(3):
        _, _, cnt, nfwd, _ = edge_table(cur.faces); nm = int((cnt > 2).sum()); inc = int(((cnt == 2) & (nfwd != 1)).sum()); nc, _l = face_components(cur.faces, len(cur.vertices)); ncomp = len(np.unique(_l[cur.faces[:, 0]]))
        bad = (nm > 0 and on("non_manifold")) or (inc > 0 and on("normals")) or (ncomp > 1 and on("small_components"))
        if not bad: break
        for k in ("non_manifold", "degenerate", "small_components", "normals"):
            if on(k):
                before = len(cur.faces); cur, st = OPS[k](cur, **(p[k] if isinstance(p[k], dict) else {})); st.update({"step": k + " (repeat)", "faces_before": before, "faces": len(cur.faces)}); report.append(st)
        prog.log(f"Repair round {rnd + 1}: non-manifold {nm}, inconsistent {inc}, components {ncomp}")
    prog.step("Refinement finished", 1.0); return cur, report
