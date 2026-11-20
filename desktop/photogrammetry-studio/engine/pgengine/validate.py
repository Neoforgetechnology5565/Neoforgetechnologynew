"""Module G: mesh quality analysis. All numbers are measured from the mesh; nothing is estimated from assumptions."""
from __future__ import annotations

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from .model import Cloud, Mesh


def edge_table(f: np.ndarray):
    """Undirected edge list with the number of faces using each edge, and directed-use counts (for winding consistency)."""
    e = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]); lo = e.min(1); hi = e.max(1); key = lo.astype(np.int64) * (int(f.max()) + 1) + hi
    uk, inv, cnt = np.unique(key, return_inverse=True, return_counts=True); fwd = (e[:, 0] < e[:, 1]).astype(np.int64)
    nfwd = np.bincount(inv, weights=fwd, minlength=len(uk)); return uk, inv, cnt, nfwd, e


def boundary_loops(f: np.ndarray) -> list[np.ndarray]:
    """Boundary edges (used by exactly one face) grouped into connected loops/chains; each loop is the array of its vertex indices."""
    uk, inv, cnt, _, e = edge_table(f)
    if not (cnt == 1).any(): return []
    one = (cnt[inv] == 1); be = e[one]; vs, idx = np.unique(be, return_inverse=True); idx = idx.reshape(-1, 2)
    g = coo_matrix((np.ones(len(idx)), (idx[:, 0], idx[:, 1])), shape=(len(vs), len(vs))); nc, lab = connected_components(g, directed=False)
    return [vs[lab == k] for k in range(nc)]


def triangle_areas(v: np.ndarray, f: np.ndarray):
    a = v[f[:, 1]] - v[f[:, 0]]; b = v[f[:, 2]] - v[f[:, 0]]; return 0.5 * np.linalg.norm(np.cross(a, b), axis=1)


def face_components(f: np.ndarray, nv: int):
    g = coo_matrix((np.ones(len(f) * 3), (np.concatenate([f[:, 0], f[:, 1], f[:, 2]]), np.concatenate([f[:, 1], f[:, 2], f[:, 0]]))), shape=(nv, nv)); nc, lab = connected_components(g, directed=False); return nc, lab


def quality_report(m: Mesh, cloud: Cloud | None = None) -> dict:
    v, f = m.vertices, m.faces; nv, nf = len(v), len(f)
    if nf == 0: return {"vertices": nv, "faces": 0, "error": "The mesh has no faces."}
    uk, inv, cnt, nfwd, _ = edge_table(f); area = triangle_areas(v, f); mn = v.min(0); mx = v.max(0); size = mx - mn; scale = float(np.linalg.norm(size))
    boundary = int((cnt == 1).sum()); nonman = int((cnt > 2).sum()); inter = cnt == 2
    inconsistent = int((inter & (nfwd != 1)).sum())  # two faces traversing the shared edge in the same direction
    degenerate = int((area <= 1e-12 * max(scale, 1e-12) ** 2).sum())
    el = np.linalg.norm(v[f[:, [1, 2, 0]]] - v[f], axis=2); sliver = int(((el.max(1) ** 2) * 0.433 / np.maximum(area, 1e-30) > 100).sum()) if nf else 0  # aspect: longest edge^2 / area
    loops = boundary_loops(f); nc, lab = face_components(f, nv); sizes = np.bincount(lab[f[:, 0]], minlength=nc); sizes = sizes[sizes > 0]
    unref = nv - len(np.unique(f)); vol = None
    watertight = boundary == 0 and nonman == 0 and inconsistent == 0
    if watertight:
        t0 = v[f[:, 0]]; vol = float(np.einsum("ij,ij->i", t0, np.cross(v[f[:, 1]], v[f[:, 2]])).sum() / 6.0)
    r = {"vertices": nv, "faces": nf, "edges": int(len(uk)), "watertight": bool(watertight), "boundary_edges": boundary, "holes": len(loops), "hole_sizes": sorted([len(l) for l in loops], reverse=True)[:10],
         "non_manifold_edges": nonman, "inconsistent_normal_edges": inconsistent, "normal_consistency": 1.0 - inconsistent / max(1, int(inter.sum())), "degenerate_triangles": degenerate, "sliver_triangles": sliver,
         "unreferenced_vertices": int(unref), "components": int(len(sizes)), "component_sizes": sorted(sizes.tolist(), reverse=True)[:10], "bbox_min": mn.tolist(), "bbox_max": mx.tolist(), "size": size.tolist(),
         "surface_area": float(area.sum()), "volume": vol, "outward_normals": None if vol is None else bool(vol > 0), "mean_edge": float(el.mean()), "has_colors": m.colors is not None, "has_texture": m.texture is not None}
    if cloud is not None and len(cloud):
        sub = np.random.default_rng(0).choice(len(cloud), min(len(cloud), 50000), replace=False); d = deviation(m, cloud.points[sub])
        r["deviation_from_points"] = {"mean": float(d.mean()), "p95": float(np.percentile(d, 95)), "max": float(d.max()), "samples": int(len(sub))}
    r["verdict"] = verdict(r); return r


def deviation(m: Mesh, pts: np.ndarray) -> np.ndarray:
    """Unsigned distance of each point to the mesh surface (Open3D ray-casting scene)."""
    import open3d as o3d
    sc = o3d.t.geometry.RaycastingScene(); sc.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(_o3d(m)))
    return sc.compute_distance(o3d.core.Tensor(pts.astype(np.float32))).numpy().astype(np.float64)


def _o3d(m: Mesh):
    from .model import to_o3d_mesh
    return to_o3d_mesh(m)


def verdict(r: dict) -> list[dict]:
    """Plain-language findings: level is 'ok', 'warn' or 'bad'."""
    out = []
    add = lambda level, text: out.append({"level": level, "text": text})  # noqa: E731
    add("ok" if r["watertight"] else "warn", "Watertight (closed surface)." if r["watertight"] else f"Not watertight: {r['holes']} hole(s), {r['boundary_edges']:,} boundary edges. Fine for display; 3D printing needs a closed mesh.")
    if r["non_manifold_edges"]: add("bad", f"{r['non_manifold_edges']:,} non-manifold edges (shared by more than two faces). Run non-manifold repair.")
    if r["inconsistent_normal_edges"]: add("bad", f"{r['inconsistent_normal_edges']:,} edges with inconsistent face winding. Run normal correction.")
    if r["degenerate_triangles"]: add("warn", f"{r['degenerate_triangles']:,} degenerate (zero-area) triangles.")
    if r["unreferenced_vertices"]: add("warn", f"{r['unreferenced_vertices']:,} vertices are not used by any face.")
    if r["components"] > 1: add("warn", f"{r['components']} separate pieces (largest {r['component_sizes'][0]:,} faces); small ones may be floating artifacts.")
    if r["outward_normals"] is False: add("bad", "Normals point inward (negative volume).")
    if r.get("deviation_from_points"): add("ok", f"Mean distance of the cleaned points to the surface: {r['deviation_from_points']['mean']:.5g}, 95%: {r['deviation_from_points']['p95']:.5g}, max {r['deviation_from_points']['max']:.5g} (model units).")
    if not [x for x in out if x["level"] != "ok"]: add("ok", "No structural problems found.")
    return out
