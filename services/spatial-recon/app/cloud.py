"""Point cloud and mesh I/O and basic geometry processing (NumPy/SciPy only: no heavyweight geometry library is needed for these operations)."""
from __future__ import annotations

import io
import re
import struct
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree


class CloudError(ValueError):
    """A problem with spatial data that is safe to show to the user."""


@dataclass
class Cloud:
    points: np.ndarray  # (N,3) float32
    colors: np.ndarray | None = None  # (N,3) uint8
    normals: np.ndarray | None = None  # (N,3) float32
    faces: np.ndarray | None = None  # (M,3) int32 (meshes only)
    meta: dict = field(default_factory=dict)


_PLY_T = {"char": "i1", "int8": "i1", "uchar": "u1", "uint8": "u1", "short": "i2", "int16": "i2", "ushort": "u2", "uint16": "u2", "int": "i4", "int32": "i4", "uint": "u4", "uint32": "u4", "float": "f4", "float32": "f4", "double": "f8", "float64": "f8"}


def read_ply(data: bytes, max_points: int) -> Cloud:
    end = data.find(b"end_header")
    if not data.startswith(b"ply") or end < 0:
        raise CloudError("Not a valid PLY file (missing header).")
    hdr_end = data.find(b"\n", end) + 1
    header = data[:hdr_end].decode("ascii", "replace").splitlines()
    fmt = next((l.split()[1] for l in header if l.startswith("format")), None)
    if fmt not in ("ascii", "binary_little_endian", "binary_big_endian"):
        raise CloudError("Unsupported PLY format.")
    elements: list[dict] = []
    for l in header:
        t = l.split()
        if t[:1] == ["element"]:
            elements.append({"name": t[1], "count": int(t[2]), "props": []})
        elif t[:1] == ["property"] and elements:
            elements[-1]["props"].append(t[1:])
    vert = next((e for e in elements if e["name"] == "vertex"), None)
    if not vert or vert["count"] == 0:
        raise CloudError("The PLY file has no vertices.")
    if vert["count"] > max_points:
        raise CloudError(f"The point cloud has {vert['count']:,} points; the limit is {max_points:,}. Downsample it first.")
    body = data[hdr_end:]
    names = [p[-1] for p in vert["props"]]
    if any(p[0] == "list" for p in vert["props"]):
        raise CloudError("List properties on vertices are not supported.")
    if fmt == "ascii":
        rows = body.split(b"\n")
        arr = np.array([r.split() for r in rows[: vert["count"]]], dtype=np.float64)
        cols = {n: arr[:, i] for i, n in enumerate(names)}
        faces = None
        face = next((e for e in elements if e["name"] == "face"), None)
        if face:
            fl = [list(map(int, r.split()[1:])) for r in rows[vert["count"]: vert["count"] + face["count"]] if r.strip()]
            faces = np.array([f[:3] for f in fl if len(f) >= 3], np.int32) if fl else None
    else:
        end_ch = "<" if fmt == "binary_little_endian" else ">"
        dt = np.dtype([(n, end_ch + _PLY_T[p[0]]) for n, p in zip(names, vert["props"])])
        need = dt.itemsize * vert["count"]
        if len(body) < need:
            raise CloudError("The PLY file is truncated.")
        arr = np.frombuffer(body[:need], dtype=dt)
        cols = {n: arr[n] for n in names}
        faces = None
        face = next((e for e in elements if e["name"] == "face"), None)
        if face and face["props"] and face["props"][0][0] == "list" and face["count"]:
            ct, it = end_ch + _PLY_T[face["props"][0][1]], end_ch + _PLY_T[face["props"][0][2]]
            off, out = need, []
            csz, isz = np.dtype(ct).itemsize, np.dtype(it).itemsize
            for _ in range(face["count"]):
                n = int(np.frombuffer(body[off:off + csz], ct)[0]); off += csz
                idx = np.frombuffer(body[off:off + n * isz], it); off += n * isz
                if n >= 3:
                    out.append(idx[:3])
                if len(face["props"]) > 1:  # extra per-face properties are not supported with lists; stop
                    break
            faces = np.array(out, np.int32) if out else None
    try:
        pts = np.stack([cols["x"], cols["y"], cols["z"]], 1).astype(np.float32)
    except KeyError:
        raise CloudError("The PLY file has no x, y, z vertex properties.") from None
    if not np.isfinite(pts).all():
        keep = np.isfinite(pts).all(1)
        pts = pts[keep]
        cols = {k: np.asarray(v)[keep] for k, v in cols.items()}
        faces = None
    colors = np.stack([cols[c] for c in ("red", "green", "blue")], 1).astype(np.uint8) if all(c in cols for c in ("red", "green", "blue")) else None
    normals = np.stack([cols[c] for c in ("nx", "ny", "nz")], 1).astype(np.float32) if all(c in cols for c in ("nx", "ny", "nz")) else None
    return Cloud(pts, colors, normals, faces)


def read_pcd(data: bytes, max_points: int) -> Cloud:
    end = data.find(b"DATA")
    if end < 0:
        raise CloudError("Not a valid PCD file.")
    nl = data.find(b"\n", end) + 1
    head = data[:nl].decode("ascii", "replace")
    h = {l.split()[0].upper(): l.split()[1:] for l in head.splitlines() if l.strip() and not l.startswith("#")}
    fields, sizes, types, counts = h.get("FIELDS", []), list(map(int, h.get("SIZE", []))), h.get("TYPE", []), list(map(int, h.get("COUNT", ["1"] * len(h.get("FIELDS", [])))))
    mode = (h.get("DATA") or [""])[0]
    n = int(h.get("POINTS", ["0"])[0])
    if not {"x", "y", "z"} <= set(fields) or n == 0:
        raise CloudError("The PCD file has no x, y, z fields or no points.")
    if n > max_points:
        raise CloudError(f"The point cloud has {n:,} points; the limit is {max_points:,}.")
    if mode == "ascii":
        rows = [r.split() for r in data[nl:].decode("ascii", "replace").splitlines()[:n] if r.strip()]
        col = {f: i for i, f in enumerate(fields)}
        arr = np.array(rows, dtype=np.float64)
        pts = arr[:, [col["x"], col["y"], col["z"]]].astype(np.float32)
        rgb = None
        if "rgb" in col:
            v = arr[:, col["rgb"]].astype(np.float32).view(np.uint32) if arr[:, col["rgb"]].max() < 1e6 else arr[:, col["rgb"]].astype(np.uint32)
            rgb = np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], 1).astype(np.uint8)
        return Cloud(pts, rgb)
    if mode != "binary":
        raise CloudError("Only ASCII and uncompressed binary PCD files are supported (binary_compressed is not).")
    tmap = {("F", 4): "f4", ("F", 8): "f8", ("U", 1): "u1", ("U", 2): "u2", ("U", 4): "u4", ("I", 1): "i1", ("I", 2): "i2", ("I", 4): "i4"}
    try:
        dt = np.dtype([(f if c == 1 else f"{f}_{k}", "<" + tmap[(t, s)]) for f, s, t, c in zip(fields, sizes, types, counts) for k in range(c) if True][: sum(counts)])
    except KeyError:
        raise CloudError("Unsupported PCD field type.") from None
    arr = np.frombuffer(data[nl:nl + dt.itemsize * n], dtype=dt)
    pts = np.stack([arr["x"], arr["y"], arr["z"]], 1).astype(np.float32)
    rgb = None
    if "rgb" in arr.dtype.names:
        v = arr["rgb"].view(np.uint32) if arr["rgb"].dtype.itemsize == 4 else None
        if v is not None:
            rgb = np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], 1).astype(np.uint8)
    keep = np.isfinite(pts).all(1)
    return Cloud(pts[keep], rgb[keep] if rgb is not None else None)


def write_ply(path: Path, c: Cloud) -> None:
    n = len(c.points)
    props = [("x", "<f4"), ("y", "<f4"), ("z", "<f4")]
    if c.normals is not None:
        props += [("nx", "<f4"), ("ny", "<f4"), ("nz", "<f4")]
    if c.colors is not None:
        props += [("red", "u1"), ("green", "u1"), ("blue", "u1")]
    arr = np.empty(n, dtype=np.dtype(props))
    arr["x"], arr["y"], arr["z"] = c.points[:, 0], c.points[:, 1], c.points[:, 2]
    if c.normals is not None:
        arr["nx"], arr["ny"], arr["nz"] = c.normals[:, 0], c.normals[:, 1], c.normals[:, 2]
    if c.colors is not None:
        arr["red"], arr["green"], arr["blue"] = c.colors[:, 0], c.colors[:, 1], c.colors[:, 2]
    head = ["ply", "format binary_little_endian 1.0", "comment Neo Forge Technology spatial service", f"element vertex {n}"]
    head += [f"property {'float' if t == '<f4' else 'uchar'} {name}" for name, t in props]
    if c.faces is not None:
        head += [f"element face {len(c.faces)}", "property list uchar int vertex_indices"]
    head.append("end_header\n")
    with open(path, "wb") as f:
        f.write("\n".join(head).encode("ascii"))
        f.write(arr.tobytes())
        if c.faces is not None:
            fa = np.empty(len(c.faces), dtype=[("n", "u1"), ("a", "<i4"), ("b", "<i4"), ("c", "<i4")])
            fa["n"] = 3; fa["a"], fa["b"], fa["c"] = c.faces[:, 0], c.faces[:, 1], c.faces[:, 2]
            f.write(fa.tobytes())


def stats(pts: np.ndarray) -> dict:
    if len(pts) == 0:
        return {"count": 0}
    lo, hi = pts.min(0), pts.max(0)
    return {"count": int(len(pts)), "bbox_min": [float(v) for v in lo], "bbox_max": [float(v) for v in hi], "extent": [float(v) for v in hi - lo], "diagonal": float(np.linalg.norm(hi - lo)), "centroid": [float(v) for v in pts.mean(0)]}


def voxel_downsample(c: Cloud, voxel: float) -> Cloud:
    if voxel <= 0:
        raise CloudError("The voxel size must be positive.")
    key = np.floor((c.points - c.points.min(0)) / voxel).astype(np.int64)
    if key.max() > 2_000_000:
        raise CloudError("The voxel size is too small for this cloud's extent.")
    lin = (key[:, 0] * 2_000_003 + key[:, 1]) * 2_000_003 + key[:, 2]
    _, first, inv = np.unique(lin, return_index=True, return_inverse=True)
    cnt = np.bincount(inv).astype(np.float64)
    pts = np.stack([np.bincount(inv, c.points[:, i]) / cnt for i in range(3)], 1).astype(np.float32)
    col = None if c.colors is None else np.stack([np.bincount(inv, c.colors[:, i].astype(np.float64)) / cnt for i in range(3)], 1).round().astype(np.uint8)
    nor = None if c.normals is None else c.normals[first]
    return Cloud(pts, col, nor)


def _sub(c: Cloud, keep: np.ndarray) -> Cloud:
    return Cloud(c.points[keep], None if c.colors is None else c.colors[keep], None if c.normals is None else c.normals[keep])


def statistical_outlier_removal(c: Cloud, k: int = 16, std_ratio: float = 2.0) -> Cloud:
    if len(c.points) <= k + 1:
        raise CloudError("Too few points for this neighbourhood size.")
    d, _ = cKDTree(c.points).query(c.points, k=k + 1)
    m = d[:, 1:].mean(1)
    return _sub(c, m <= m.mean() + std_ratio * m.std())


def radius_outlier_removal(c: Cloud, radius: float, min_neighbors: int = 4) -> Cloud:
    if radius <= 0:
        raise CloudError("The radius must be positive.")
    cnt = cKDTree(c.points).query_ball_point(c.points, radius, return_length=True)
    return _sub(c, cnt - 1 >= min_neighbors)


def estimate_normals(c: Cloud, k: int = 20, viewpoints: np.ndarray | None = None) -> Cloud:
    if len(c.points) <= k:
        raise CloudError("Too few points for this neighbourhood size.")
    pts = c.points.astype(np.float64)
    tree = cKDTree(pts)
    _, idx = tree.query(pts, k=k)
    nb = pts[idx] - pts[idx].mean(1, keepdims=True)
    cov = np.einsum("nki,nkj->nij", nb, nb) / k
    _, vec = np.linalg.eigh(cov)
    n = vec[:, :, 0]
    if viewpoints is not None and len(viewpoints):
        vt = cKDTree(viewpoints)
        _, vi = vt.query(pts)
        flip = np.einsum("ij,ij->i", n, viewpoints[vi] - pts) < 0
        n[flip] *= -1
    return Cloud(c.points, c.colors, n.astype(np.float32), c.faces)


def crop(c: Cloud, lo: list[float], hi: list[float]) -> Cloud:
    lo_a, hi_a = np.array(lo, np.float32), np.array(hi, np.float32)
    if lo_a.shape != (3,) or hi_a.shape != (3,) or (lo_a >= hi_a).any():
        raise CloudError("The crop box must have min < max on all three axes.")
    return _sub(c, ((c.points >= lo_a) & (c.points <= hi_a)).all(1))
