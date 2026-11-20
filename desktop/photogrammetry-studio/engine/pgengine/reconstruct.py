"""Module C: surface reconstruction (Poisson, Screened Poisson, Ball Pivoting, Alpha Shapes) with a transparent method recommendation.
Reconstruction can invent surface across gaps, so every method can be trimmed back to the measured points (`trim_factor`)."""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

from .common import Progress, bbox, spacing, surface_variation
from .model import Cloud, Mesh, from_o3d_mesh, to_o3d_cloud

METHODS = {
    "poisson": {"label": "Poisson (Open3D)", "available": True, "note": "Smooth watertight surface; robust to noise; fills holes, so trim it back to the data."},
    "screened_poisson": {"label": "Screened Poisson (PyMeshLab)", "available": True, "note": "Sharper than plain Poisson thanks to point-interpolation screening; watertight; fills holes."},
    "ball_pivoting": {"label": "Ball Pivoting (Open3D)", "available": True, "note": "Connects the measured points only (no invented surface); leaves holes where the data is sparse; needs low noise and fairly even density."},
    "alpha_shape": {"label": "Alpha Shapes (Open3D)", "available": True, "note": "Surface through the points within an alpha radius; follows thin parts and open surfaces; may leave holes or spikes on noisy data."},
}


def estimate_normals(c: Cloud, neighbors: int = 30, orient: str = "tangent", prog: Progress | None = None) -> Cloud:
    """Estimate normals with PCA (Open3D). orient: 'tangent' = consistent propagation over a kNN graph, 'centroid' = point away from the centre (good for compact objects), 'none'."""
    import open3d as o3d
    p = to_o3d_cloud(Cloud(c.points, c.colors, None)); p.estimate_normals(o3d.geometry.KDTreeSearchParamKNN(neighbors))
    if orient == "tangent":
        try: p.orient_normals_consistent_tangent_plane(min(neighbors, 30))
        except Exception:  # fall back for degenerate graphs
            p.orient_normals_towards_camera_location(p.get_center() + np.array([0, 0, 1e6]))
    elif orient == "centroid":
        n = np.asarray(p.normals); d = c.points - c.points.mean(0); flip = (n * d).sum(1) < 0; n[flip] *= -1; p.normals = o3d.utility.Vector3dVector(n)
    nor = np.asarray(p.normals, dtype=np.float64)
    if orient == "tangent":  # make the global sign outward using the volume-weighted centroid test
        d = c.points - c.points.mean(0)
        if (nor * d).sum() < 0: nor = -nor
    return Cloud(c.points, c.colors, nor, dict(c.meta))


def analyse(c: Cloud) -> dict:
    """Scan characteristics used for the recommendation: density, uniformity, noise, normals/colour presence."""
    tree = cKDTree(c.points); n = len(c); sel = np.random.default_rng(0).choice(n, min(n, 20000), replace=False); d, _ = tree.query(c.points[sel], k=7, workers=-1)
    nn = d[:, 1]; sp = float(np.median(nn)); cv = float(nn.std() / (nn.mean() + 1e-15)); diag = float(np.linalg.norm(bbox(c.points)[2]))
    sv = surface_variation(c.points[sel] if n > 20000 else c.points, 16)
    # noise: median distance of points to their local best-fit plane, relative to spacing
    k = 16; _, nb = tree.query(c.points[sel], k=min(k, n), workers=-1); P = c.points[nb]; Pc = P - P.mean(1, keepdims=True); w = np.linalg.eigvalsh(np.einsum("nki,nkj->nij", Pc, Pc) / k)
    noise = float(np.median(np.sqrt(np.maximum(w[:, 0], 0))) / (sp + 1e-15))
    return {"points": n, "spacing": sp, "spacing_ratio": sp / diag, "uniformity_cv": cv, "noise_to_spacing": noise, "median_surface_variation": float(np.median(sv)), "diagonal": diag, "has_normals": c.normals is not None, "has_colors": c.colors is not None}


def recommend(c: Cloud) -> dict:
    """Rule-based recommendation. The reasons and the measured values are returned so the user can judge or override it."""
    a = analyse(c); reasons = []
    if a["points"] < 3000:
        m = "alpha_shape"; reasons.append(f"Only {a['points']:,} points: too sparse for Ball Pivoting or a deep Poisson; Alpha Shapes with a trimmed result is the least inventive choice.")
    elif a["noise_to_spacing"] > 0.7:
        m = "screened_poisson"; reasons.append(f"Noise is high relative to point spacing ({a['noise_to_spacing']:.2f}x spacing): Ball Pivoting would produce a rough surface. Screened Poisson averages the noise.")
    elif a["uniformity_cv"] > 0.6:
        m = "poisson"; reasons.append(f"Point spacing is uneven (variation {a['uniformity_cv']:.2f}): Ball Pivoting would leave many holes; Poisson copes with uneven density.")
    elif a["spacing_ratio"] < 0.004 and a["noise_to_spacing"] < 0.4:
        m = "ball_pivoting"; reasons.append(f"Dense (spacing {a['spacing_ratio'] * 100:.2f}% of the object size), even and low-noise: Ball Pivoting keeps every measured detail and invents no surface.")
    else:
        m = "screened_poisson"; reasons.append("Moderate density and noise: Screened Poisson gives a continuous, detailed surface; trim it to the data to avoid invented areas.")
    if not a["has_normals"]: reasons.append("The file has no normals: they will be estimated (PCA) before reconstruction.")
    return {"method": m, "label": METHODS[m]["label"], "reasons": reasons, "metrics": a}


def _trim(m: Mesh, c: Cloud, tree: cKDTree, dist: float) -> tuple[Mesh, int]:
    """Drop triangles whose vertices lie farther than `dist` from every measured point (invented geometry), then clean up unused vertices."""
    d, _ = tree.query(m.vertices, workers=-1); far = d > dist; bad = far[m.faces].any(1); keep = m.faces[~bad]
    used = np.unique(keep); remap = -np.ones(len(m.vertices), np.int64); remap[used] = np.arange(len(used))
    return Mesh(m.vertices[used], remap[keep], None if m.colors is None else m.colors[used], None, None, m.meta), int(bad.sum())


def transfer_colors(m: Mesh, c: Cloud, tree: cKDTree | None = None, k: int = 4) -> Mesh:
    """Colour each vertex from the k nearest measured points (inverse-distance weights). Geometry is untouched."""
    if c.colors is None: return m
    t = tree or cKDTree(c.points); d, i = t.query(m.vertices, k=min(k, len(c)), workers=-1)
    if d.ndim == 1: d = d[:, None]; i = i[:, None]
    w = 1.0 / (d + 1e-9); w /= w.sum(1, keepdims=True); m.colors = (c.colors[i] * w[..., None]).sum(1).astype(np.float32); return m


def reconstruct(c: Cloud, method: str = "auto", prog: Progress | None = None, normal_neighbors: int = 30, orient: str = "tangent", depth: int = 9, density_trim: float = 0.02,
                trim_factor: float = 3.0, point_weight: float = 4.0, samples_per_node: float = 1.5, radius_factors=(1.5, 2.5, 4.0), alpha_factor: float = 3.0, scale: float = 1.1, **_) -> tuple[Mesh, dict]:
    import open3d as o3d
    prog = prog or Progress(); info: dict = {}
    if method == "auto":
        rec = recommend(c); method = rec["method"]; info["recommendation"] = rec; prog.log(f"Auto method: {rec['label']}. " + " ".join(rec["reasons"]))
    if method not in METHODS: raise ValueError(f"Unknown reconstruction method '{method}'.")
    sp = spacing(c.points); prog.step("Estimating normals", 0.1)
    if c.normals is None or method in ("poisson", "screened_poisson", "ball_pivoting"):
        if c.normals is None or len(c.normals) != len(c): c = estimate_normals(c, normal_neighbors, orient)
    prog.step(f"Reconstructing ({METHODS[method]['label']})", 0.3); tree = cKDTree(c.points)
    if method == "poisson":
        p = to_o3d_cloud(c); mesh, dens = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(p, depth=int(depth), scale=scale, linear_fit=False)
        dens = np.asarray(dens)
        if density_trim > 0: mesh.remove_vertices_by_mask(dens < np.quantile(dens, density_trim))
        m = from_o3d_mesh(mesh)
    elif method == "screened_poisson":
        import pymeshlab as pm
        ms = pm.MeshSet(); ms.add_mesh(pm.Mesh(vertex_matrix=c.points, v_normals_matrix=c.normals)); ms.generate_surface_reconstruction_screened_poisson(depth=int(depth), pointweight=float(point_weight), samplespernode=float(samples_per_node), scale=float(scale), threads=4)
        cm = ms.current_mesh(); m = Mesh(cm.vertex_matrix().astype(np.float64), cm.face_matrix().astype(np.int64), None, None, None, {})
    elif method == "ball_pivoting":
        p = to_o3d_cloud(c); radii = o3d.utility.DoubleVector([sp * f for f in radius_factors]); mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(p, radii); m = from_o3d_mesh(mesh); info["radii"] = [sp * f for f in radius_factors]
    else:
        p = to_o3d_cloud(Cloud(c.points, c.colors, None)); mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_alpha_shape(p, sp * alpha_factor); m = from_o3d_mesh(mesh); info["alpha"] = sp * alpha_factor
    if len(m.faces) == 0: raise ValueError("The method produced no triangles. Try a different method, denser points, or a larger radius/alpha.")
    raw = len(m.faces); info.update({"method": method, "raw_faces": raw})
    if trim_factor and trim_factor > 0:
        prog.step("Trimming invented surface", 0.75); m, dropped = _trim(m, c, tree, sp * trim_factor); info["trimmed_faces"] = dropped; info["trim_distance"] = sp * trim_factor
        if len(m.faces) == 0: raise ValueError("Trimming removed every triangle; increase 'trim distance'.")
    prog.step("Transferring colours", 0.9); m = transfer_colors(m, c, tree); m.meta.update({"method": method})
    info.update({"faces": len(m.faces), "vertices": len(m.vertices), "spacing": sp}); prog.log(f"{METHODS[method]['label']}: {raw:,} -> {len(m.faces):,} triangles after trimming")
    return m, info
