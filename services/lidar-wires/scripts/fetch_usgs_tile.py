#!/usr/bin/env python3
"""Cut a small tile out of a USGS 3DEP point cloud (public domain) from the AWS Entwine/EPT copy and write it as a LAZ in a metric UTM CRS.

The EPT copy is stored in EPSG:3857 (Web Mercator), whose horizontal "metres" are stretched by 1/cos(latitude) (about 1.27 at San Francisco). Writing
the tile in UTM removes that distortion and records the CRS in the file, so units are known. Needs: numpy, laspy[lazrs], pyproj (script only).

    python scripts/fetch_usgs_tile.py CA_SanFrancisco_1_B23 -122.4900 37.7550 --half 60 out.laz
"""
from __future__ import annotations

import argparse
import json
import struct
import urllib.request

import laspy
import numpy as np
from pyproj import CRS, Transformer

BASE = "https://usgs-lidar-public.s3.us-west-2.amazonaws.com"


def get(url: str, tries: int = 5) -> bytes:
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "neoforge-demo"}), timeout=120).read()
        except OSError:
            if i == tries - 1:
                raise


def hierarchy(project: str, key: str, out: dict) -> None:
    h = json.loads(get(f"{BASE}/{project}/ept-hierarchy/{key}.json"))
    for k, v in h.items():
        out[k] = v
    for k, v in h.items():
        if v == -1:  # the subtree lives in its own hierarchy page
            hierarchy(project, k, out)


def node_bounds(b: list[float], key: str) -> list[float]:
    d, x, y, z = (int(v) for v in key.split("-"))
    n = 2 ** d
    sx, sy, sz = (b[3] - b[0]) / n, (b[4] - b[1]) / n, (b[5] - b[2]) / n
    return [b[0] + x * sx, b[1] + y * sy, b[2] + z * sz, b[0] + (x + 1) * sx, b[1] + (y + 1) * sy, b[2] + (z + 1) * sz]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("project"); ap.add_argument("lon", type=float); ap.add_argument("lat", type=float); ap.add_argument("out")
    ap.add_argument("--half", type=float, default=60.0, help="half width of the square tile in metres")
    a = ap.parse_args()
    ept = json.loads(get(f"{BASE}/{a.project}/ept.json"))
    to3857 = Transformer.from_crs(4326, 3857, always_xy=True)
    zone = int((a.lon + 180) // 6) + 1
    utm = CRS.from_epsg((32600 if a.lat >= 0 else 32700) + zone)
    to_utm = Transformer.from_crs(4326, utm, always_xy=True)
    ux, uy = to_utm.transform(a.lon, a.lat)
    # tile in UTM -> 3857 bbox (take the corners' hull)
    back = Transformer.from_crs(utm, 3857, always_xy=True)
    cs = [back.transform(ux + sx * a.half, uy + sy * a.half) for sx in (-1, 1) for sy in (-1, 1)]
    bb = [min(c[0] for c in cs) - 5, min(c[1] for c in cs) - 5, max(c[0] for c in cs) + 5, max(c[1] for c in cs) + 5]
    hier: dict = {}
    hierarchy(a.project, "0-0-0-0", hier)
    chunks = []
    for key, cnt in hier.items():
        if cnt <= 0:
            continue
        nb = node_bounds(ept["bounds"], key)
        if nb[3] < bb[0] or nb[0] > bb[2] or nb[4] < bb[1] or nb[1] > bb[3]:
            continue
        las = laspy.read(__import__("io").BytesIO(get(f"{BASE}/{a.project}/ept-data/{key}.laz")))
        chunks.append(las)
        print("node", key, len(las.points))
    xs = np.concatenate([np.asarray(c.x) for c in chunks]); ys = np.concatenate([np.asarray(c.y) for c in chunks]); zs = np.concatenate([np.asarray(c.z) for c in chunks])
    ux_, uy_ = Transformer.from_crs(3857, utm, always_xy=True).transform(xs, ys)
    keep = (np.abs(ux_ - ux) <= a.half) & (np.abs(uy_ - uy) <= a.half)
    pf = chunks[0].header.point_format
    hdr = laspy.LasHeader(point_format=3 if "red" in pf.dimension_names else 1, version="1.4")
    hdr.scales = [0.01, 0.01, 0.01]
    hdr.offsets = [float(np.floor(ux_[keep].min())), float(np.floor(uy_[keep].min())), float(np.floor(zs[keep].min()))]
    # explicit GeoTIFF keys: projected CRS (EPSG UTM zone), linear unit metre, vertical unit metre (3DEP elevations are metres)
    keys = [(1024, 0, 1, 1), (3072, 0, 1, utm.to_epsg()), (3076, 0, 1, 9001), (4099, 0, 1, 9001)]
    gk = struct.pack("<4H", 1, 1, 0, len(keys)) + b"".join(struct.pack("<4H", *k) for k in keys)
    hdr.vlrs.append(laspy.VLR(user_id="LASF_Projection", record_id=34735, description="GeoKeyDirectoryTag", record_data=gk))
    out = laspy.LasData(hdr)
    out.x, out.y, out.z = ux_[keep], uy_[keep], zs[keep]
    def col(name):
        return np.concatenate([np.asarray(c[name]) for c in chunks])[keep]
    for n in ("classification", "intensity", "return_number", "number_of_returns"):
        out[n] = col(n)
    if "red" in pf.dimension_names:
        for n in ("red", "green", "blue"):
            out[n] = col(n)
    out.write(a.out)
    print("wrote", a.out, int(keep.sum()), "points; UTM zone", zone, "tile centre", round(ux, 1), round(uy, 1))


if __name__ == "__main__":
    main()
