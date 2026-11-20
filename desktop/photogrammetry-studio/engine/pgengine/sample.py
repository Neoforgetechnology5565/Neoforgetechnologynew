"""Sample project: a real 3D asset (the Stanford Bunny, downloaded by Open3D on first use) or a built-in procedural mug, both turned into a noisy photogrammetry-like point cloud by sampling the surface and
adding scanner-style defects. The original mesh is kept as a reference so the processing result can be measured against the truth. This is NOT an iPhone scan."""
from __future__ import annotations

import numpy as np

from .model import Cloud, Mesh


def _mug() -> Mesh:
    import trimesh
    # build the mug as an open-top cup by revolving a profile (no boolean engine needed)
    prof = np.array([[0.0, -0.045], [0.045, -0.045], [0.046, 0.045], [0.040, 0.045], [0.039, -0.040], [0.0, -0.040]]); n = 96
    ang = np.linspace(0, 2 * np.pi, n, endpoint=False); V = []; F = []
    for r, z in prof:
        for a in ang: V.append([r * np.cos(a), r * np.sin(a), z])
    m = len(prof)
    for i in range(m):
        j = (i + 1) % m
        for k in range(n):
            k2 = (k + 1) % n; a, b, c, d = i * n + k, i * n + k2, j * n + k2, j * n + k; F += [[a, b, c], [a, c, d]]
    cup = trimesh.Trimesh(np.array(V), np.array(F), process=True)
    handle = trimesh.creation.torus(major_radius=0.026, minor_radius=0.006, major_sections=48, minor_sections=24); handle.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0])); handle.apply_translation([0.052, 0, 0.0])
    full = trimesh.util.concatenate([cup, handle]); return Mesh(np.asarray(full.vertices), np.asarray(full.faces), None, None, None, {"name": "Procedural mug"})


def source_mesh(kind: str) -> tuple[Mesh, str]:
    if kind == "bunny":
        try:
            import open3d as o3d
            o = o3d.io.read_triangle_mesh(o3d.data.BunnyMesh().path)
            if len(o.triangles) > 0:
                v = np.asarray(o.vertices) * 1.0
                return Mesh(v, np.asarray(o.triangles, dtype=np.int64), None, None, None, {"name": "Stanford Bunny"}), "Stanford Bunny (Stanford Computer Graphics Laboratory, a real range-scanned object, loaded through Open3D's dataset helper)."
        except Exception:
            pass
        return _mug(), "The Stanford Bunny could not be downloaded (no network); the built-in procedural mug was used instead."
    return _mug(), "Built-in procedural mug (a modelled object, not a scan)."


def make_sample(kind: str = "bunny", points: int = 120000, seed: int = 7) -> tuple[Cloud, Mesh, dict]:
    import open3d as o3d
    from .model import to_o3d_mesh
    src, note = source_mesh(kind); rng = np.random.default_rng(seed); o = to_o3d_mesh(src); diag = float(np.linalg.norm(src.vertices.max(0) - src.vertices.min(0)))
    P = np.asarray(o.sample_points_uniformly(points).points)
    # 1. uneven density: thin out one side, as when a region is seen from few photos
    keep = rng.random(len(P)) < np.where(P[:, 0] > np.median(P[:, 0]), 0.55, 1.0); P = P[keep]
    # 2. occlusion: remove a patch (a hole in the scan)
    c = P[rng.integers(len(P))]; P = P[np.linalg.norm(P - c, axis=1) > 0.09 * diag]
    # 3. sensor noise, duplicates, outliers, floating blob
    P = P + rng.normal(0, 0.0015 * diag, P.shape); dup = P[rng.choice(len(P), len(P) // 40, replace=False)]
    lo, hi = src.vertices.min(0) - 0.15 * diag, src.vertices.max(0) + 0.15 * diag; out = rng.uniform(lo, hi, (int(len(P) * 0.012), 3)); blob = rng.normal(src.vertices.max(0) + 0.06 * diag, 0.012 * diag, (int(len(P) * 0.006), 3))
    allp = np.vstack([P, dup, out, blob])
    # colours: a procedural gradient + stripes so colour transfer can be seen (the source asset has none)
    t = (allp - src.vertices.min(0)) / (src.vertices.max(0) - src.vertices.min(0) + 1e-12); col = np.stack([0.35 + 0.5 * t[:, 1], 0.45 + 0.35 * np.sin(8 * t[:, 0]) * 0.5 + 0.2, 0.75 - 0.4 * t[:, 2]], 1).clip(0, 1).astype(np.float32)
    col += rng.normal(0, 0.03, col.shape).astype(np.float32); col = col.clip(0, 1)
    meta = {"source": f"sample-{kind}", "sample_note": note + " Degraded on purpose: noise, duplicates, outliers, a floating blob, uneven density and an occlusion hole. Colours are procedural. This is not an iPhone Object Capture scan.", "format": "generated"}
    return Cloud(allp, col, None, meta), src, meta
