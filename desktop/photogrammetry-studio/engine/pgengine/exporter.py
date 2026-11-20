"""Export a stage to OBJ / PLY / STL / GLB / GLTF with scale, orientation, texture and simplification choices; returns the file(s) and an honest note about what each format kept."""
from __future__ import annotations

import os
import shutil
import tempfile
import zipfile

import numpy as np

from .formats import EXPORT_FORMATS, export_mesh
from .model import Cloud, Mesh
from .project import Project


def export_stage(p: Project, stage: str, fmt: str, scale: float = 1.0, orientation: str = "as-is", keep_texture: bool = True, simplify_percent: float = 0.0, target_faces: int = 0, recentre: bool = False) -> dict:
    o = p.get(stage); tmp = tempfile.mkdtemp(prefix="pgs-export-")
    if isinstance(o, Cloud):
        if fmt not in ("ply", "obj"): raise ValueError("Point clouds can be exported as PLY (with colours) or OBJ (vertices only). Reconstruct a mesh for other formats.")
        import open3d as o3d
        from .model import to_o3d_cloud
        path = os.path.join(tmp, f"{stage}.{fmt}"); pc = to_o3d_cloud(o)
        if scale != 1.0: pc.scale(scale, center=(0, 0, 0))
        if fmt == "ply": o3d.io.write_point_cloud(path, pc)
        else:
            with open(path, "w") as f:
                for q in np.asarray(pc.points): f.write(f"v {q[0]:.9g} {q[1]:.9g} {q[2]:.9g}\n")
        return {"path": path, "name": os.path.basename(path), "notes": ["point cloud (no faces)"], "faces": 0}
    m: Mesh = o; notes = []
    nf = len(m.faces); want = nf
    if simplify_percent and simplify_percent > 0: want = min(want, max(4, int(nf * (1 - simplify_percent / 100.0))))
    if target_faces and target_faces > 0: want = min(want, int(target_faces))
    if want < nf:
        from .refine import decimate
        m, st = decimate(m, target_faces=want); notes.append(f"simplified for export: {nf:,} -> {len(m.faces):,} faces (the project mesh is unchanged)")
        if st.get("texture_note"): notes.append(st["texture_note"])
    base = f"{stage}.{fmt}"; path = os.path.join(tmp, base); r = export_mesh(m, path, fmt, scale, orientation, keep_texture, recentre); notes += r["notes"]
    files = [f for f in os.listdir(tmp)]
    if len(files) > 1 or fmt == "obj" and m.texture is not None and keep_texture:  # .gltf + .bin/.png, or .obj + .mtl + texture -> zip them together
        zp = os.path.join(tmp, f"{stage}_{fmt}.zip")
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for fn in files: z.write(os.path.join(tmp, fn), fn)
        return {"path": zp, "name": os.path.basename(zp), "notes": notes + ["multi-file format packed as a zip"], "faces": len(m.faces)}
    return {"path": path, "name": base, "notes": notes, "faces": len(m.faces)}


def formats() -> dict:
    return EXPORT_FORMATS
