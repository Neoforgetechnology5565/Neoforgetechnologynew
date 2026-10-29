"""Point-cloud model, readers (PLY, PCD, LAS/LAZ, XYZ/TXT/CSV), writer (PLY) and coordinate-unit handling.

Coordinates are kept in float64 and in the file's own coordinate system. Airborne data often uses UTM or state-plane coordinates in the
hundreds of thousands or millions; float32 would round those to metres, so they are never stored as float32 on the server. Units are
read from the LAS header (GeoTIFF keys or WKT) when present, and are otherwise UNKNOWN: nothing here assumes metres.
"""
from __future__ import annotations

import io
import re
import struct
from dataclasses import dataclass, field

import numpy as np

# factor to metres
UNIT_TO_M = {"metre": 1.0, "foot": 0.3048, "us-foot": 1200.0 / 3937.0, "centimetre": 0.01, "millimetre": 0.001}
UNIT_SHORT = {"metre": "m", "foot": "ft", "us-foot": "ft (US survey)", "centimetre": "cm", "millimetre": "mm", "unknown": "coordinate units"}
EPSG_UNIT = {9001: "metre", 9002: "foot", 9003: "us-foot"}
ASPRS = {0: "never classified", 1: "unassigned", 2: "ground", 3: "low vegetation", 4: "medium vegetation", 5: "high vegetation", 6: "building", 7: "low point (noise)", 8: "reserved", 9: "water", 10: "rail", 11: "road surface",
         12: "reserved", 13: "wire - guard (shield)", 14: "wire - conductor (phase)", 15: "transmission tower", 16: "wire-structure connector", 17: "bridge deck", 18: "high noise"}


class CloudError(ValueError):
    """A problem with the uploaded data that is safe to show to the user."""


@dataclass
class Units:
    horizontal: str = "unknown"
    vertical: str = "unknown"
    crs: str | None = None
    source: str = "not stated in the file"
    notes: list[str] = field(default_factory=list)

    @property
    def known(self) -> bool:
        return self.horizontal != "unknown" and self.horizontal == self.vertical

    def per_metre(self) -> float:
        """Coordinate units per metre (1.0 when unknown: callers must then treat parameters as coordinate units)."""
        return 1.0 / UNIT_TO_M[self.horizontal] if self.known else 1.0

    def label(self) -> str:
        return UNIT_SHORT[self.horizontal] if self.known else "coordinate units"

    def to_json(self) -> dict:
        return {"horizontal": self.horizontal, "vertical": self.vertical, "known": self.known, "crs": self.crs, "source": self.source, "notes": self.notes, "label": self.label()}


@dataclass
class PointCloud:
    xyz: np.ndarray  # (N,3) float64
    rgb: np.ndarray | None = None  # (N,3) uint8
    intensity: np.ndarray | None = None  # (N,) float32, source scale
    classification: np.ndarray | None = None  # (N,) uint8 ASPRS codes provided by the file
    normals: np.ndarray | None = None  # (N,3) float32
    units: Units = field(default_factory=Units)
    info: dict = field(default_factory=dict)

    def __len__(self) -> int:
        return len(self.xyz)

    def take(self, idx: np.ndarray) -> "PointCloud":
        return PointCloud(self.xyz[idx], None if self.rgb is None else self.rgb[idx], None if self.intensity is None else self.intensity[idx],
                          None if self.classification is None else self.classification[idx], None if self.normals is None else self.normals[idx], self.units, self.info)


def bounds(xyz: np.ndarray) -> dict:
    lo, hi = xyz.min(0), xyz.max(0)
    return {"min": [float(v) for v in lo], "max": [float(v) for v in hi], "extent": [float(v) for v in hi - lo]}


# ---- PLY -----------------------------------------------------------------------------------------------------------------
_PLY_T = {"char": "i1", "int8": "i1", "uchar": "u1", "uint8": "u1", "short": "i2", "int16": "i2", "ushort": "u2", "uint16": "u2", "int": "i4", "int32": "i4", "uint": "u4", "uint32": "u4", "float": "f4", "float32": "f4", "double": "f8", "float64": "f8"}


def read_ply(data: bytes, max_points: int) -> PointCloud:
    end = data.find(b"end_header")
    if not data.startswith(b"ply") or end < 0:
        raise CloudError("Not a valid PLY file (missing header).")
    hdr_end = data.find(b"\n", end) + 1
    header = data[:hdr_end].decode("ascii", "replace").splitlines()
    fmt = next((l.split()[1] for l in header if l.startswith("format")), None)
    if fmt not in ("ascii", "binary_little_endian", "binary_big_endian"):
        raise CloudError("Unsupported PLY format.")
    elems: list[dict] = []
    for l in header:
        t = l.split()
        if t[:1] == ["element"] and len(t) >= 3:
            elems.append({"name": t[1], "count": int(t[2]), "props": []})
        elif t[:1] == ["property"] and elems:
            elems[-1]["props"].append(t[1:])
    vert = next((e for e in elems if e["name"] == "vertex"), None)
    if not vert or vert["count"] == 0:
        raise CloudError("The PLY file has no vertices (it is empty).")
    if vert["count"] > max_points:
        raise CloudError(f"The point cloud has {vert['count']:,} points; the limit is {max_points:,}. Downsample it first.")
    if any(p[0] == "list" for p in vert["props"]):
        raise CloudError("List properties on vertices are not supported.")
    names = [p[-1] for p in vert["props"]]
    if not {"x", "y", "z"} <= set(names):
        raise CloudError("The PLY vertices have no x, y, z properties.")
    body = data[hdr_end:]
    n = vert["count"]
    if fmt == "ascii":
        try:
            rows = [r.split() for r in body.split(b"\n")[:n]]
            arr = np.array(rows, dtype=np.float64)
        except (ValueError, TypeError):
            raise CloudError("The PLY body could not be read as numbers.") from None
        if arr.shape != (n, len(names)):
            raise CloudError("The PLY body does not match its header.")
        cols = {nm: arr[:, i] for i, nm in enumerate(names)}
    else:
        endian = "<" if fmt == "binary_little_endian" else ">"
        try:
            dt = np.dtype([(p[-1], endian + _PLY_T[p[0]]) for p in vert["props"]])
        except KeyError:
            raise CloudError("Unsupported PLY property type.") from None
        if len(body) < dt.itemsize * n:
            raise CloudError("The PLY file is truncated.")
        arr = np.frombuffer(body[:dt.itemsize * n], dtype=dt)
        cols = {nm: arr[nm] for nm in names}
    xyz = np.stack([cols["x"], cols["y"], cols["z"]], 1).astype(np.float64)
    rgb = np.stack([cols[c] for c in ("red", "green", "blue")], 1).astype(np.uint8) if {"red", "green", "blue"} <= set(names) else None
    inten = cols["intensity"].astype(np.float32) if "intensity" in cols else None
    cls = cols["classification"].astype(np.uint8) if "classification" in cols else (cols["class"].astype(np.uint8) if "class" in cols else None)
    nrm = np.stack([cols["nx"], cols["ny"], cols["nz"]], 1).astype(np.float32) if {"nx", "ny", "nz"} <= set(names) else None
    return _finish(xyz, rgb, inten, cls, nrm, Units(), {"format": "PLY"})


# ---- PCD -----------------------------------------------------------------------------------------------------------------
def read_pcd(data: bytes, max_points: int) -> PointCloud:
    end = data.find(b"DATA")
    if end < 0:
        raise CloudError("Not a valid PCD file (no DATA line).")
    nl = data.find(b"\n", end) + 1
    head = data[:nl].decode("ascii", "replace")
    h = {l.split()[0].upper(): l.split()[1:] for l in head.splitlines() if l.strip() and not l.startswith("#")}
    fields, sizes, types = h.get("FIELDS", []), list(map(int, h.get("SIZE", []))), h.get("TYPE", [])
    counts = list(map(int, h.get("COUNT", ["1"] * len(fields))))
    mode = (h.get("DATA") or [""])[0]
    n = int(h.get("POINTS", ["0"])[0])
    if not {"x", "y", "z"} <= set(fields) or n == 0:
        raise CloudError("The PCD file has no x, y, z fields or no points.")
    if n > max_points:
        raise CloudError(f"The point cloud has {n:,} points; the limit is {max_points:,}. Downsample it first.")
    tmap = {("F", 4): "f4", ("F", 8): "f8", ("U", 1): "u1", ("U", 2): "u2", ("U", 4): "u4", ("I", 1): "i1", ("I", 2): "i2", ("I", 4): "i4"}
    if mode == "ascii":
        try:
            rows = [r.split() for r in data[nl:].decode("ascii", "replace").splitlines()[:n] if r.strip()]
            arr = np.array(rows, dtype=np.float64)
        except (ValueError, TypeError):
            raise CloudError("The PCD body could not be read as numbers.") from None
        col = {f: i for i, f in enumerate(fields)}
        xyz = arr[:, [col["x"], col["y"], col["z"]]]
        rgb = _pcd_rgb(arr[:, col["rgb"]].astype(np.float32).view(np.uint32)) if "rgb" in col else None
        inten = arr[:, col["intensity"]].astype(np.float32) if "intensity" in col else None
        return _finish(xyz, rgb, inten, None, None, Units(), {"format": "PCD ascii"})
    if mode != "binary":
        raise CloudError("Only ASCII and uncompressed binary PCD files are supported (binary_compressed is not).")
    try:
        dt = np.dtype([(f if c == 1 else f"{f}_{k}", "<" + tmap[(t, s)]) for f, s, t, c in zip(fields, sizes, types, counts) for k in range(c)])
    except KeyError:
        raise CloudError("Unsupported PCD field type.") from None
    if len(data) - nl < dt.itemsize * n:
        raise CloudError("The PCD file is truncated.")
    arr = np.frombuffer(data[nl:nl + dt.itemsize * n], dtype=dt)
    xyz = np.stack([arr["x"], arr["y"], arr["z"]], 1).astype(np.float64)
    rgb = _pcd_rgb(np.ascontiguousarray(arr["rgb"]).view(np.uint32)) if "rgb" in arr.dtype.names and arr["rgb"].dtype.itemsize == 4 else None
    inten = arr["intensity"].astype(np.float32) if "intensity" in arr.dtype.names else None
    return _finish(xyz, rgb, inten, None, None, Units(), {"format": "PCD binary"})


def _pcd_rgb(v: np.ndarray) -> np.ndarray:
    return np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], 1).astype(np.uint8)


# ---- text (XYZ / TXT / CSV) ---------------------------------------------------------------------------------------------
def read_text(data: bytes, max_points: int) -> PointCloud:
    """Whitespace-, comma- or semicolon-separated numbers. Columns: x y z [r g b | intensity | classification] chosen by header names when
    present, otherwise by count: 3 = xyz, 4 = xyz+intensity, 6 = xyz+rgb, 7 = xyz+rgb+intensity. Lines starting with # or // are skipped."""
    try:
        txt = data.decode("utf-8", "strict")
    except UnicodeDecodeError:
        raise CloudError("The file is not a text point file (it is not valid UTF-8 text).") from None
    lines = [l.strip() for l in txt.splitlines() if l.strip() and not l.lstrip().startswith(("#", "//"))]
    if not lines:
        raise CloudError("The file is empty.")
    sep = "," if "," in lines[0] else (";" if ";" in lines[0] else None)
    first = lines[0].split(sep)
    names: list[str] | None = None
    try:
        [float(v) for v in first]
    except ValueError:
        names = [v.strip().strip('"').lower() for v in first]
        lines = lines[1:]
    if len(lines) == 0:
        raise CloudError("The file has a header but no points.")
    if len(lines) > max_points:
        raise CloudError(f"The point cloud has {len(lines):,} points; the limit is {max_points:,}. Downsample it first.")
    try:
        arr = np.array([l.split(sep) for l in lines], dtype=np.float64)
    except (ValueError, TypeError):
        raise CloudError("Some lines are not numeric or have a different number of columns. Expected one point per line: x y z [r g b | intensity].") from None
    if arr.ndim != 2 or arr.shape[1] < 3:
        raise CloudError("A text point file needs at least three numeric columns: x y z.")
    ix = iy = iz = None
    rgb = inten = cls = None
    if names:
        col = {n: i for i, n in enumerate(names)}
        if not {"x", "y", "z"} <= set(col):
            raise CloudError("The header must name the coordinate columns x, y and z.")
        ix, iy, iz = col["x"], col["y"], col["z"]
        if {"r", "g", "b"} <= set(col):
            rgb = arr[:, [col["r"], col["g"], col["b"]]]
        elif {"red", "green", "blue"} <= set(col):
            rgb = arr[:, [col["red"], col["green"], col["blue"]]]
        inten = arr[:, col["intensity"]] if "intensity" in col else (arr[:, col["i"]] if "i" in col else None)
        cls = arr[:, col["classification"]] if "classification" in col else (arr[:, col["class"]] if "class" in col else None)
    else:
        ix, iy, iz = 0, 1, 2
        k = arr.shape[1]
        if k == 4:
            inten = arr[:, 3]
        elif k >= 6:
            rgb = arr[:, 3:6]
            if k >= 7:
                inten = arr[:, 6]
    if rgb is not None:
        rgb = rgb.astype(np.float64)
        rgb = np.clip(rgb * (255.0 if rgb.max() <= 1.0 else 1.0), 0, 255).astype(np.uint8)
    return _finish(arr[:, [ix, iy, iz]], rgb, None if inten is None else inten.astype(np.float32), None if cls is None else np.clip(cls, 0, 255).astype(np.uint8), None, Units(), {"format": "text"})


# ---- LAS / LAZ -----------------------------------------------------------------------------------------------------------
def read_las(data: bytes, max_points: int) -> PointCloud:
    try:
        import laspy
    except ImportError:  # pragma: no cover - laspy is a declared dependency
        raise CloudError("LAS/LAZ support is not installed on this server.") from None
    try:
        with laspy.open(io.BytesIO(data)) as f:
            n = f.header.point_count
            if n == 0:
                raise CloudError("The LAS/LAZ file contains no points (it is empty).")
            if n > max_points:
                raise CloudError(f"The point cloud has {n:,} points; the limit is {max_points:,}. Downsample it first (for example with PDAL or CloudCompare).")
            las = f.read()
            hdr = f.header
            if len(las.points) < n:
                raise CloudError(f"The LAS/LAZ file is truncated: its header promises {n:,} points but only {len(las.points):,} could be read.")
    except CloudError:
        raise
    except Exception as e:  # noqa: BLE001 - laspy raises several exception types on damaged or unsupported files
        msg = str(e).lower()
        if "lazrs" in msg or "laszip" in msg or "backend" in msg:
            raise CloudError("This LAZ file needs a LAZ decoder that is not installed on the server.") from None
        raise CloudError("The LAS/LAZ file could not be read. It may be damaged or use an unsupported variant.") from None
    xyz = np.stack([np.asarray(las.x, np.float64), np.asarray(las.y, np.float64), np.asarray(las.z, np.float64)], 1)
    names = set(las.point_format.dimension_names)
    rgb = None
    if {"red", "green", "blue"} <= names:
        c = np.stack([np.asarray(las.red), np.asarray(las.green), np.asarray(las.blue)], 1).astype(np.float64)
        if c.max() > 0:
            rgb = (c / (256.0 if c.max() > 255 else 1.0)).clip(0, 255).astype(np.uint8)
    inten = np.asarray(las.intensity, np.float32) if "intensity" in names else None
    cls = np.asarray(las.classification, np.uint8) if "classification" in names else None
    units = _las_units(hdr)
    info = {"format": f"LAS {hdr.version}", "point_format": int(hdr.point_format.id), "system_identifier": str(hdr.system_identifier).strip()[:32] or None, "software": str(hdr.generating_software).strip()[:32] or None}
    if cls is not None and np.all(cls == 0):
        cls = None  # an all-zero classification means "never classified", i.e. no labels are provided
    return _finish(xyz, rgb, inten, cls, None, units, info)


def _raw(v) -> bytes:
    if hasattr(v, "record_data_bytes"):
        return bytes(v.record_data_bytes())
    return bytes(v.record_data)


def _las_units(hdr) -> Units:
    """Horizontal/vertical units from the GeoTIFF key directory (VLR 34735) or an OGC WKT VLR (2112); otherwise unknown."""
    u = Units()
    try:
        for v in hdr.vlrs:
            if getattr(v, "user_id", "") == "LASF_Projection" and getattr(v, "record_id", 0) == 34735:
                raw = _raw(v)
                if len(raw) >= 8:
                    nkeys = struct.unpack("<4H", raw[:8])[3]
                    keys = {}
                    for i in range(min(nkeys, (len(raw) - 8) // 8)):
                        kid, loc, cnt, val = struct.unpack("<4H", raw[8 + 8 * i:16 + 8 * i])
                        if loc == 0:
                            keys[kid] = val
                    if 3076 in keys:
                        u.horizontal = EPSG_UNIT.get(keys[3076], "unknown")
                    elif 3072 in keys:
                        u.horizontal = _epsg_hint(keys[3072])
                    if 3072 in keys:
                        u.crs = f"EPSG:{keys[3072]}" if keys[3072] != 32767 else "user-defined"
                    if 4099 in keys:
                        u.vertical = EPSG_UNIT.get(keys[4099], "unknown")
                    elif u.horizontal != "unknown":
                        u.notes.append("The vertical unit is not stated in the file; the horizontal unit is not assumed for it.")
                    u.source = "LAS GeoTIFF keys"
            elif getattr(v, "user_id", "") == "LASF_Projection" and getattr(v, "record_id", 0) == 2112:
                wkt = _raw(v).decode("utf-8", "ignore").strip("\x00")
                m = re.findall(r'(?:LENGTHUNIT|UNIT)\["([^"]+)"\s*,\s*([0-9.]+)', wkt)
                if m:
                    f = float(m[-1][1])
                    u.horizontal = "metre" if abs(f - 1.0) < 1e-6 else "foot" if abs(f - 0.3048) < 1e-4 else "us-foot" if abs(f - 0.3048006096) < 1e-5 else "unknown"
                    u.vertical = u.horizontal  # WKT compound CRS may differ; flagged below when a vertical unit is stated separately
                    vm = re.search(r'VERT_CS.*?UNIT\["([^"]+)"\s*,\s*([0-9.]+)', wkt, re.S) or re.search(r'VERTCRS.*?LENGTHUNIT\["([^"]+)"\s*,\s*([0-9.]+)', wkt, re.S)
                    if vm:
                        vf = float(vm.group(2))
                        u.vertical = "metre" if abs(vf - 1.0) < 1e-6 else "foot" if abs(vf - 0.3048) < 1e-4 else "us-foot" if abs(vf - 0.3048006096) < 1e-5 else "unknown"
                    cm = re.search(r'(?:PROJCS|PROJCRS|COMPD_CS)\["([^"]+)"', wkt)
                    u.crs = cm.group(1) if cm else None
                    u.source = "LAS WKT"
    except Exception:  # noqa: BLE001 - a malformed VLR must not make the file unreadable
        u = Units()
    if u.horizontal != "unknown" and u.vertical == "unknown" and not u.notes:
        u.notes.append("The vertical unit is not stated in the file; the horizontal unit is not assumed for it.")
    if u.horizontal != "unknown" and u.vertical not in ("unknown", u.horizontal):
        u.notes.append(f"Horizontal unit is {u.horizontal} but vertical unit is {u.vertical}: 3D distances would mix units, so units are treated as unknown until you set them.")
    return u


def _epsg_hint(code: int) -> str:
    """Projected CRS codes whose unit is certain from the code range (UTM WGS84/NAD83 zones are metres). Anything else stays unknown."""
    if 32601 <= code <= 32760 or 26901 <= code <= 26923 or 25828 <= code <= 25838 or code == 3857:
        return "metre"
    return "unknown"


def _finish(xyz, rgb, inten, cls, nrm, units, info) -> PointCloud:
    ok = np.isfinite(xyz).all(1)
    dropped = int((~ok).sum())
    if dropped:
        info = {**info, "dropped_non_finite": dropped}
        xyz = xyz[ok]
        rgb = None if rgb is None else rgb[ok]
        inten = None if inten is None else inten[ok]
        cls = None if cls is None else cls[ok]
        nrm = None if nrm is None else nrm[ok]
    if len(xyz) == 0:
        raise CloudError("The file contains no valid points (all coordinates are missing or not finite).")
    return PointCloud(np.ascontiguousarray(xyz, np.float64), rgb, inten, cls, nrm, units, info)


def sniff(head: bytes) -> str | None:
    if head[:3] == b"ply":
        return "ply"
    if head[:4] == b"LASF":
        return "las"
    h = head.lstrip()
    if h.startswith(b"# .PCD") or h.startswith(b"VERSION"):
        return "pcd"
    if head[:4] == b"\x7fELF" or head[:2] == b"MZ" or head[:4] == b"PK\x03\x04" or head[:3] == b"\xff\xd8\xff" or head[:8] == b"\x89PNG\r\n\x1a\n" or head[:5] == b"%PDF-":
        return "binary-other"
    try:
        head.decode("utf-8")
        return "text"
    except UnicodeDecodeError:
        return None


def read_any(data: bytes, filename: str, max_points: int) -> PointCloud:
    """The content decides the format, never the file name."""
    kind = sniff(data[:256])
    if kind in ("binary-other", None):
        raise CloudError("Unsupported file. Upload a PLY, PCD, LAS/LAZ or XYZ/TXT/CSV point file.")
    if kind == "ply":
        return read_ply(data, max_points)
    if kind == "las":
        return read_las(data, max_points)
    if kind == "pcd":
        return read_pcd(data, max_points)
    if filename.lower().endswith((".las", ".laz", ".ply")):
        raise CloudError("The file name says LAS/LAZ/PLY but its content is text; it cannot be read as that format.")
    return read_text(data, max_points)


# ---- PLY writer ---------------------------------------------------------------------------------------------------------
def write_ply(pc: PointCloud, labels: np.ndarray | None = None, origin: np.ndarray | None = None) -> bytes:
    """Binary little-endian PLY with double-precision coordinates, optional RGB / intensity / provided classification / our label / normals."""
    n = len(pc)
    props: list[tuple[str, str]] = [("x", "<f8"), ("y", "<f8"), ("z", "<f8")]
    if pc.normals is not None:
        props += [("nx", "<f4"), ("ny", "<f4"), ("nz", "<f4")]
    if pc.rgb is not None:
        props += [("red", "u1"), ("green", "u1"), ("blue", "u1")]
    if pc.intensity is not None:
        props += [("intensity", "<f4")]
    if pc.classification is not None:
        props += [("classification", "u1")]
    if labels is not None:
        props += [("label", "u1")]
    arr = np.empty(n, dtype=np.dtype(props))
    arr["x"], arr["y"], arr["z"] = pc.xyz[:, 0], pc.xyz[:, 1], pc.xyz[:, 2]
    if pc.normals is not None:
        arr["nx"], arr["ny"], arr["nz"] = pc.normals.T
    if pc.rgb is not None:
        arr["red"], arr["green"], arr["blue"] = pc.rgb.T
    if pc.intensity is not None:
        arr["intensity"] = pc.intensity
    if pc.classification is not None:
        arr["classification"] = pc.classification
    if labels is not None:
        arr["label"] = labels
    tn = {"<f8": "double", "<f4": "float", "u1": "uchar"}
    head = ["ply", "format binary_little_endian 1.0", "comment Neo Forge Technology LiDAR demo", f"comment coordinate units: {pc.units.label()} (source: {pc.units.source})", f"element vertex {n}"]
    head += [f"property {tn[t]} {name}" for name, t in props] + ["end_header\n"]
    return "\n".join(head).encode("ascii") + arr.tobytes()
