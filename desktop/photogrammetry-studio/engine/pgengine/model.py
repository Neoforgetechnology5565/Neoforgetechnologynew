"""Plain data containers for point clouds and meshes, plus lossless on-disk storage (npz)."""
from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np


@dataclass
class Cloud:
    points: np.ndarray                       # (N,3) float64, world coordinates (never re-centred on disk)
    colors: np.ndarray | None = None         # (N,3) float32 in 0..1
    normals: np.ndarray | None = None        # (N,3) float64
    meta: dict = field(default_factory=dict)

    kind = "cloud"

    def __len__(self) -> int:
        return len(self.points)

    def select(self, idx) -> "Cloud":
        return Cloud(self.points[idx], None if self.colors is None else self.colors[idx], None if self.normals is None else self.normals[idx], dict(self.meta))


@dataclass
class Mesh:
    vertices: np.ndarray                     # (V,3) float64
    faces: np.ndarray                        # (F,3) int64
    colors: np.ndarray | None = None         # (V,3) float32 in 0..1
    uvs: np.ndarray | None = None            # (V,2) float32 per-vertex UV (kept only while topology is unchanged)
    texture: np.ndarray | None = None        # (H,W,3|4) uint8
    meta: dict = field(default_factory=dict)

    kind = "mesh"

    def copy(self) -> "Mesh":
        c = lambda a: None if a is None else a.copy()  # noqa: E731
        return Mesh(self.vertices.copy(), self.faces.copy(), c(self.colors), c(self.uvs), c(self.texture), dict(self.meta))


def save(path: str, obj: Cloud | Mesh) -> None:
    d: dict = {"kind": np.array(obj.kind), "meta": np.array(repr(obj.meta))}
    if isinstance(obj, Cloud):
        d["points"] = obj.points
        if obj.colors is not None: d["colors"] = obj.colors.astype(np.float32)
        if obj.normals is not None: d["normals"] = obj.normals
    else:
        d["vertices"] = obj.vertices; d["faces"] = obj.faces.astype(np.int64)
        if obj.colors is not None: d["colors"] = obj.colors.astype(np.float32)
        if obj.uvs is not None: d["uvs"] = obj.uvs.astype(np.float32)
        if obj.texture is not None: d["texture"] = obj.texture
    with open(path, "wb") as f:
        np.savez(f, **d)


def load(path: str) -> Cloud | Mesh:
    import ast
    z = np.load(path, allow_pickle=False)
    meta = ast.literal_eval(str(z["meta"])) if "meta" in z else {}
    g = lambda k: z[k] if k in z else None  # noqa: E731
    if str(z["kind"]) == "cloud":
        return Cloud(z["points"], g("colors"), g("normals"), meta)
    return Mesh(z["vertices"], z["faces"], g("colors"), g("uvs"), g("texture"), meta)


def to_o3d_cloud(c: Cloud):
    import open3d as o3d
    p = o3d.geometry.PointCloud(); p.points = o3d.utility.Vector3dVector(c.points)
    if c.colors is not None: p.colors = o3d.utility.Vector3dVector(c.colors.astype(np.float64))
    if c.normals is not None: p.normals = o3d.utility.Vector3dVector(c.normals)
    return p


def to_o3d_mesh(m: Mesh):
    import open3d as o3d
    o = o3d.geometry.TriangleMesh(); o.vertices = o3d.utility.Vector3dVector(m.vertices); o.triangles = o3d.utility.Vector3iVector(m.faces.astype(np.int32))
    if m.colors is not None: o.vertex_colors = o3d.utility.Vector3dVector(m.colors.astype(np.float64))
    return o


def from_o3d_mesh(o, colors: np.ndarray | None = None, meta: dict | None = None) -> Mesh:
    v = np.asarray(o.vertices, dtype=np.float64); f = np.asarray(o.triangles, dtype=np.int64)
    col = np.asarray(o.vertex_colors, dtype=np.float32) if o.has_vertex_colors() else colors
    return Mesh(v, f, col, None, None, meta or {})


def sample_texture(tex: np.ndarray, uvs: np.ndarray) -> np.ndarray:
    """Bilinear lookup of a texture at per-vertex UVs (OpenGL convention: v = 0 at the bottom). Returns (V,3) float32 in 0..1."""
    h, w = tex.shape[:2]; u = np.mod(uvs[:, 0], 1.0) * (w - 1); v = (1.0 - np.mod(uvs[:, 1], 1.0)) * (h - 1)
    x0 = np.floor(u).astype(int); y0 = np.floor(v).astype(int); x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1); fx = (u - x0)[:, None]; fy = (v - y0)[:, None]
    t = tex[..., :3].astype(np.float32) / 255.0
    return ((t[y0, x0] * (1 - fx) + t[y0, x1] * fx) * (1 - fy) + (t[y1, x0] * (1 - fx) + t[y1, x1] * fx) * fy).astype(np.float32)


def png_bytes(tex: np.ndarray) -> bytes:
    from PIL import Image
    b = io.BytesIO(); Image.fromarray(tex).save(b, format="PNG"); return b.getvalue()
