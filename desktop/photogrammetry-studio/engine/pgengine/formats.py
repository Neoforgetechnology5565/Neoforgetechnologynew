"""Import and export of point clouds and meshes. Every loader reports what it found, what it dropped and which features are unavailable."""
from __future__ import annotations

import os
import zipfile
from pathlib import Path

import numpy as np

from .model import Cloud, Mesh, sample_texture

POINT_EXT = {".ply", ".pcd", ".xyz", ".xyzn", ".xyzrgb", ".pts", ".txt", ".las", ".laz"}
MESH_EXT = {".obj", ".stl", ".ply", ".glb", ".gltf", ".usdz", ".usd", ".usda", ".usdc"}
SUPPORTED = sorted(POINT_EXT | MESH_EXT)


class ImportError_(Exception):
    pass


def _finite(points: np.ndarray, *others):
    ok = np.isfinite(points).all(axis=1)
    return ok, int((~ok).sum())


def _cloud(points, colors, normals, note: str, meta: dict) -> tuple[Cloud, dict]:
    points = np.asarray(points, dtype=np.float64)
    if points.ndim != 2 or points.shape[1] != 3 or len(points) == 0: raise ImportError_("The file contains no usable 3D points.")
    ok, bad = _finite(points)
    if colors is not None: colors = np.asarray(colors, dtype=np.float32)
    if normals is not None: normals = np.asarray(normals, dtype=np.float64)
    if bad:
        points = points[ok]; colors = None if colors is None else colors[ok]; normals = None if normals is None else normals[ok]
    if len(points) == 0: raise ImportError_("Every point has NaN or infinite coordinates.")
    return Cloud(points, colors, normals, meta), {"invalid_removed": bad, "notes": [note] if note else []}


def _load_text_points(path: str, ext: str):
    rows = []
    with open(path, "r", errors="replace") as f:
        for ln in f:
            ln = ln.strip().replace(",", " ")
            if not ln or ln[0] in "#/;": continue
            parts = ln.split()
            try: rows.append([float(x) for x in parts])
            except ValueError: continue  # header or text line
    if not rows: raise ImportError_("No numeric rows found. Expected columns: x y z [r g b] or [nx ny nz].")
    width = max(set(map(len, rows)), key=list(map(len, rows)).count); a = np.array([r for r in rows if len(r) == width], dtype=np.float64)
    skipped = len(rows) - len(a)
    if a.shape[1] < 3: raise ImportError_("Need at least three columns (x y z).")
    pts = a[:, :3]; col = nor = None; note = ""
    if a.shape[1] >= 6:
        extra = a[:, 3:6]
        if ext == ".xyzn": nor = extra
        elif ext == ".xyzrgb" or ext == ".pts" or (extra.min() >= 0 and extra.max() <= 255 and np.allclose(extra, np.round(extra))) or (extra.min() >= 0 and extra.max() <= 1.0):
            col = extra / (255.0 if extra.max() > 1.0 else 1.0)
        else: nor = extra; note = "Columns 4-6 were read as normals."
    if ext == ".pts" and a.shape[1] == 7: col = a[:, 4:7] / 255.0  # x y z intensity r g b
    if a.shape[1] >= 7 and ext != ".pts": col = a[:, 6:9] / (255.0 if a[:, 6:9].max() > 1 else 1.0) if a.shape[1] >= 9 else col
    if skipped: note = (note + f" {skipped} row(s) with a different column count were skipped.").strip()
    return pts, col, nor, note


def _load_las(path: str):
    import laspy
    las = laspy.read(path); pts = np.column_stack([np.asarray(las.x), np.asarray(las.y), np.asarray(las.z)]); col = None
    if all(d in las.point_format.dimension_names for d in ("red", "green", "blue")):
        c = np.column_stack([las.red, las.green, las.blue]).astype(np.float32)
        if c.max() > 0: col = c / (65535.0 if c.max() > 255 else 255.0)
    return pts, col, None, f"LAS point format {las.header.point_format.id}, version {las.header.version}."


def _trimesh_to_mesh(tm, source: str) -> Mesh:
    import trimesh
    uv = None; tex = None; col = None
    vis = getattr(tm, "visual", None)
    if vis is not None and getattr(vis, "kind", None) == "texture" and getattr(vis, "uv", None) is not None and len(vis.uv) == len(tm.vertices):
        uv = np.asarray(vis.uv, dtype=np.float32)
        mat = getattr(vis, "material", None); img = getattr(mat, "baseColorTexture", None) or getattr(mat, "image", None)
        if img is not None:
            tex = np.asarray(img.convert("RGB"), dtype=np.uint8)
            col = sample_texture(tex, uv)
    elif vis is not None and getattr(vis, "kind", None) == "vertex":
        c = np.asarray(vis.vertex_colors, dtype=np.float32)[:, :3] / 255.0
        if len(c) == len(tm.vertices) and not np.allclose(c, c[0]): col = c
    return Mesh(np.asarray(tm.vertices, dtype=np.float64), np.asarray(tm.faces, dtype=np.int64), col, uv if tex is not None else None, tex, {"source": source})


def _load_usd(path: str):
    try:
        from pxr import Usd, UsdGeom, Gf
    except Exception as e:  # pragma: no cover
        raise ImportError_("USD/USDZ import needs the 'usd-core' package, which is not installed. Convert the asset to OBJ or GLB in Reality Converter/Blender instead.") from e
    stage = Usd.Stage.Open(path)
    if not stage: raise ImportError_("The USD file could not be opened.")
    scale = UsdGeom.GetStageMetersPerUnit(stage) or 1.0; up = UsdGeom.GetStageUpAxis(stage)
    V = []; F = []; C = []; off = 0; cache = UsdGeom.XformCache(); have_col = True
    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh): continue
        m = UsdGeom.Mesh(prim); pts = m.GetPointsAttr().Get(); cnt = m.GetFaceVertexCountsAttr().Get(); idx = m.GetFaceVertexIndicesAttr().Get()
        if pts is None or cnt is None or idx is None: continue
        mat = cache.GetLocalToWorldTransform(prim); p = np.array([list(mat.Transform(Gf.Vec3d(*map(float, q)))) for q in pts], dtype=np.float64) * scale
        cnt = np.asarray(cnt); idx = np.asarray(idx); tri = []; k = 0
        for c in cnt:
            for j in range(1, c - 1): tri.append((idx[k], idx[k + j], idx[k + j + 1]))
            k += c
        V.append(p); F.append(np.array(tri, dtype=np.int64) + off); off += len(p)
        dc = UsdGeom.PrimvarsAPI(prim).GetPrimvar("displayColor"); cc = dc.Get() if dc and dc.HasValue() else None
        if cc is not None and len(cc) == len(pts): C.append(np.array([list(x) for x in cc], dtype=np.float32))
        else: have_col = False; C.append(np.zeros((len(p), 3), np.float32))
    if not V: raise ImportError_("The USD file contains no triangle/polygon meshes.")
    v = np.vstack(V)
    if up == "Z": pass
    note = "USD: geometry and vertex display colours were read. Textures inside USDZ packages are not read (use OBJ or GLB for textured models)."
    return Mesh(v, np.vstack(F), np.vstack(C) if have_col else None, None, None, {"source": os.path.basename(path), "up_axis": up}), {"invalid_removed": 0, "notes": [note]}


def load_any(path: str) -> tuple[Cloud | Mesh, dict]:
    ext = Path(path).suffix.lower()
    if ext not in SUPPORTED: raise ImportError_(f"Unsupported file type '{ext}'. Supported: {', '.join(SUPPORTED)}.")
    if not os.path.getsize(path): raise ImportError_("The file is empty.")
    meta = {"source": os.path.basename(path), "format": ext.lstrip(".")}
    try:
        if ext in (".xyz", ".xyzn", ".xyzrgb", ".pts", ".txt"):
            r = _load_text_points(path, ext); return _cloud(r[0], r[1], r[2], r[3], meta)
        if ext in (".las", ".laz"):
            p, c, n, note = _load_las(path); return _cloud(p, c, n, note, meta)
        if ext == ".pcd":
            import open3d as o3d
            pc = o3d.io.read_point_cloud(path)
            return _cloud(np.asarray(pc.points), np.asarray(pc.colors) if pc.has_colors() else None, np.asarray(pc.normals) if pc.has_normals() else None, "", meta)
        if ext == ".ply":
            import open3d as o3d
            m = o3d.io.read_triangle_mesh(path)
            if len(m.triangles) > 0:
                v = np.asarray(m.vertices); ok, bad = _finite(v)
                if bad: raise ImportError_("The mesh has NaN/infinite vertex coordinates.")
                return Mesh(v.astype(np.float64), np.asarray(m.triangles, dtype=np.int64), np.asarray(m.vertex_colors, dtype=np.float32) if m.has_vertex_colors() else None, None, None, meta), {"invalid_removed": 0, "notes": []}
            pc = o3d.io.read_point_cloud(path)
            return _cloud(np.asarray(pc.points), np.asarray(pc.colors) if pc.has_colors() else None, np.asarray(pc.normals) if pc.has_normals() else None, "", meta)
        if ext in (".usdz", ".usd", ".usda", ".usdc"):
            m, info = _load_usd(path); m.meta.update(meta)
            if ext == ".usdz":
                try:
                    with zipfile.ZipFile(path) as z: info["notes"].append("Package contents: " + ", ".join(sorted(z.namelist())[:8]))
                except zipfile.BadZipFile: pass
            return m, info
        import trimesh
        loaded = trimesh.load(path, force="scene" if ext in (".glb", ".gltf") else None, process=False)
        if isinstance(loaded, trimesh.PointCloud):
            c = np.asarray(loaded.colors, dtype=np.float32)[:, :3] / 255.0 if getattr(loaded, "colors", None) is not None and len(loaded.colors) else None
            if c is not None and np.allclose(c, c[0]): c = None
            return _cloud(np.asarray(loaded.vertices), c, None, "", meta)
        if isinstance(loaded, trimesh.Scene):
            geoms = [g for g in loaded.dump() if isinstance(g, trimesh.Trimesh)]; pcs = [g for g in loaded.dump() if isinstance(g, trimesh.PointCloud)]
            if not geoms and pcs: return _cloud(np.vstack([np.asarray(p.vertices) for p in pcs]), None, None, "", meta)
            if not geoms: raise ImportError_("The scene contains no meshes or point clouds.")
            tm = geoms[0] if len(geoms) == 1 else trimesh.util.concatenate(geoms)
            note = "" if len(geoms) == 1 else f"{len(geoms)} mesh parts were merged into one (textures of merged parts are not kept)."
        else:
            tm = loaded; note = ""
        if not isinstance(tm, trimesh.Trimesh) or len(tm.faces) == 0:
            raise ImportError_("The file has vertices but no faces; try importing it as a point cloud (PLY/XYZ).")
        mesh = _trimesh_to_mesh(tm, meta["source"]); mesh.meta.update(meta)
        notes = [note] if note else []
        if ext == ".obj" and mesh.texture is None and mesh.colors is None:
            notes.append("No texture map was loaded. For Apple Object Capture output, select the OBJ together with its .mtl and texture image when importing.")
        return mesh, {"invalid_removed": 0, "notes": notes}
    except ImportError_:
        raise
    except Exception as e:
        raise ImportError_(f"Could not read the file: {e}") from e


# ----------------------------------------------------------------------------------------------------------------- export
ORIENT = {"as-is": None, "z-up-to-y-up": np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float), "y-up-to-z-up": np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float), "flip-y": np.diag([1, -1, 1.0]), "flip-z": np.diag([1, 1, -1.0])}
EXPORT_FORMATS = {"obj": {"colors": "vertex colours (non-standard 'v x y z r g b' extension) or a texture image with MTL", "texture": True}, "ply": {"colors": "vertex colours", "texture": False}, "stl": {"colors": "none (STL has no colour)", "texture": False}, "glb": {"colors": "vertex colours or embedded texture", "texture": True}, "gltf": {"colors": "vertex colours or embedded texture", "texture": True}}


def export_mesh(m: Mesh, path: str, fmt: str, scale: float = 1.0, orientation: str = "as-is", keep_texture: bool = True, recentre: bool = False) -> dict:
    import trimesh
    fmt = fmt.lower()
    if fmt not in EXPORT_FORMATS: raise ValueError(f"Unsupported export format '{fmt}'.")
    if orientation not in ORIENT: raise ValueError(f"Unknown orientation '{orientation}'.")
    if not scale > 0: raise ValueError("Export scale must be greater than zero.")
    v = m.vertices.copy()
    if ORIENT[orientation] is not None: v = v @ ORIENT[orientation].T
    off = np.zeros(3)
    if recentre: off = (v.min(0) + v.max(0)) / 2; v = v - off
    v = v * scale
    faces = m.faces
    if ORIENT[orientation] is not None and np.linalg.det(ORIENT[orientation]) < 0: faces = faces[:, ::-1]
    notes = []; visual = None
    use_tex = keep_texture and m.texture is not None and m.uvs is not None and fmt in ("obj", "glb", "gltf")
    if use_tex:
        from PIL import Image
        visual = trimesh.visual.TextureVisuals(uv=m.uvs, image=Image.fromarray(m.texture))
        notes.append("texture map and UVs written")
    elif m.colors is not None and fmt != "stl":
        visual = trimesh.visual.ColorVisuals(vertex_colors=(np.clip(m.colors, 0, 1) * 255).astype(np.uint8))
        notes.append("vertex colours written" + ("; texture map is not kept in this export" if m.texture is not None else ""))
    elif m.colors is not None: notes.append("STL cannot store colour: colours were dropped")
    tm = trimesh.Trimesh(vertices=v, faces=faces, visual=visual, process=False)
    if fmt == "gltf":
        files = trimesh.exchange.gltf.export_gltf(tm); base = Path(path).stem
        with open(path, "w") as f: f.write(files.pop("model.gltf").decode() if isinstance(files.get("model.gltf"), bytes) else files.pop("model.gltf"))
        for name, data in files.items(): Path(path).with_name(name).write_bytes(data)
    elif fmt == "obj":
        tm.export(path, file_type="obj", include_color=True)
    else:
        tm.export(path, file_type=fmt)
    return {"path": path, "bytes": os.path.getsize(path), "notes": notes, "offset_removed": off.tolist()}
