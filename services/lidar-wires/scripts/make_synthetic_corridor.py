#!/usr/bin/env python3
"""Generate a SYNTHETIC power-corridor point cloud with exact ground truth (metres), as LAZ with the unit stated in the file header.

This scene is made by this script, not scanned: terrain, trees, two buildings, three lattice-like towers, two spans of three phase conductors plus a
shield wire, a low distribution line and a few random outliers. It exists so wire detection, classification and clearance measurement can be checked
against known answers. It says nothing about how the detector behaves on real scans.   python scripts/make_synthetic_corridor.py out.laz truth.json
"""
from __future__ import annotations

import json
import struct
import sys

import laspy
import numpy as np


def terrain(x, y):
    return 3.0 + 0.012 * x + 0.008 * y + 1.6 * np.sin(x / 31.0) * np.cos(y / 23.0)


def main(out: str, truth_path: str, seed: int = 11) -> None:
    rng = np.random.default_rng(seed)
    W, H = 200.0, 120.0
    pts, cls = [], []

    def add(p, c):
        pts.append(np.asarray(p, np.float64)); cls.append(np.full(len(p), c, np.uint8))

    # ground (about 4 points per square metre, with centimetre noise)
    n = int(W * H * 4)
    gx, gy = rng.uniform(0, W, n), rng.uniform(0, H, n)
    add(np.c_[gx, gy, terrain(gx, gy) + rng.normal(0, 0.03, n)], 2)
    truth = {"units": "metre", "terrain": "z = 3 + 0.012 x + 0.008 y + 1.6 sin(x/31) cos(y/23)", "trees": [], "buildings": [], "towers": [], "wires": []}
    # trees: ellipsoids
    for _ in range(30):
        cx, cy = rng.uniform(5, W - 5), rng.uniform(5, H - 5)
        if 52 < cy < 68:  # keep the corridor clear
            continue
        r, h = rng.uniform(1.6, 3.2), rng.uniform(5, 11)
        m = int(rng.integers(150, 350))
        d = rng.normal(0, 1, (m, 3))
        d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
        d *= rng.uniform(0.5, 1, (m, 1))
        z0 = terrain(cx, cy)
        p = np.c_[cx + d[:, 0] * r, cy + d[:, 1] * r, z0 + h * 0.6 + d[:, 2] * h * 0.4]
        add(p, 5)
        truth["trees"].append({"centre": [cx, cy], "radius": r, "top_z": float(z0 + h)})
    # a tree close under the corridor (clearance test): crown top at 16 m above its ground
    cx, cy = 60.0, 50.5
    z0 = terrain(cx, cy)
    d = rng.normal(0, 1, (400, 3)); d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9); d *= rng.uniform(0.6, 1, (400, 1))
    add(np.c_[cx + d[:, 0] * 3.0, cy + d[:, 1] * 3.0, z0 + 12.0 + d[:, 2] * 4.0], 5)
    truth["trees"].append({"centre": [cx, cy], "radius": 3.0, "top_z": float(z0 + 16.0), "note": "tall tree beside the corridor"})
    # buildings: flat-roofed boxes sampled on roof and walls
    for (bx, by, bw, bd, bh) in ((150.0, 20.0, 12.0, 9.0, 6.0), (30.0, 95.0, 10.0, 8.0, 5.0)):
        z0 = float(terrain(bx + bw / 2, by + bd / 2))
        m = 2500
        roof = np.c_[rng.uniform(bx, bx + bw, m), rng.uniform(by, by + bd, m), np.full(m, z0 + bh) + rng.normal(0, 0.02, m)]
        walls = []
        for _ in range(4):
            k = 700
            t = rng.uniform(0, 1, k); zz = rng.uniform(z0, z0 + bh, k)
            walls += [np.c_[bx + t * bw, np.full(k, by), zz], np.c_[bx + t * bw, np.full(k, by + bd), zz], np.c_[np.full(k, bx), by + t * bd, zz], np.c_[np.full(k, bx + bw), by + t * bd, zz]]
        add(np.vstack([roof] + walls), 6)
        truth["buildings"].append({"x": [bx, bx + bw], "y": [by, by + bd], "roof_z": z0 + bh})
    # towers: four legs and two cross arms
    tower_x = [12.0, 100.0, 188.0]
    ty = 60.0
    tower_h = 26.0
    for tx in tower_x:
        z0 = float(terrain(tx, ty))
        legs = []
        for dx, dy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            zz = rng.uniform(z0, z0 + tower_h, 90)
            leg_w = 1.5 * (1 - 0.6 * (zz - z0) / tower_h)
            legs.append(np.c_[tx + dx * leg_w, ty + dy * leg_w, zz])
        arm_z = z0 + 23.0
        arms = np.c_[tx + rng.normal(0, 0.1, 160), ty + np.linspace(-4.5, 4.5, 160), np.full(160, arm_z)]
        top = np.c_[tx + rng.normal(0, 0.1, 60), np.full(60, ty), np.linspace(z0 + 23.0, z0 + tower_h + 1.0, 60)]
        add(np.vstack(legs + [arms, top]), 15)
        truth["towers"].append({"x": tx, "y": ty, "ground_z": z0, "arm_z": arm_z, "top_z": z0 + tower_h + 1.0})
    # conductors: three phases (y offsets) and a shield wire, parabolic sag
    def wire(p0, p1, sag, spacing, name, kind):
        L = float(np.linalg.norm(p1[:2] - p0[:2]))
        m = int(L / spacing)
        t = np.sort(rng.uniform(0, 1, m))
        p = p0[None] + t[:, None] * (p1 - p0)[None]
        p[:, 2] -= 4 * sag * t * (1 - t)
        p += rng.normal(0, 0.03, p.shape)
        add(p, 14)
        truth["wires"].append({"name": name, "kind": kind, "p0": p0.tolist(), "p1": p1.tolist(), "sag": sag, "points": m})
    for i in range(len(tower_x) - 1):
        a, b = truth["towers"][i], truth["towers"][i + 1]
        for k, off in enumerate((-4.0, 0.0, 4.0)):
            sag = 2.2 + 0.2 * k
            wire(np.array([a["x"], ty + off, a["arm_z"]]), np.array([b["x"], ty + off, b["arm_z"]]), sag, 0.45, f"span{i + 1}-phase{k + 1}", "phase conductor")
        wire(np.array([a["x"], ty, a["top_z"]]), np.array([b["x"], ty, b["top_z"]]), 1.6, 0.6, f"span{i + 1}-shield", "shield wire")
    # a low distribution line between two poles near the northern edge
    for px in (20.0, 90.0):
        z0 = float(terrain(px, 108.0)); zz = np.linspace(z0, z0 + 9.0, 70)
        add(np.c_[px + rng.normal(0, 0.05, 70), np.full(70, 108.0) + rng.normal(0, 0.05, 70), zz], 0)
    wire(np.array([20.0, 108.0, terrain(20.0, 108.0) + 9.0]), np.array([90.0, 108.0, terrain(90.0, 108.0) + 9.0]), 0.8, 0.5, "distribution-line", "low-voltage line")
    # outliers (birds, noise)
    n_out = 300
    add(np.c_[rng.uniform(0, W, n_out), rng.uniform(0, H, n_out), rng.uniform(3, 45, n_out)], 7)
    P = np.vstack(pts)
    C = np.concatenate(cls)
    order = rng.permutation(len(P))
    P, C = P[order], C[order]
    # LAZ with the unit stated in the header (GeoTIFF keys: user-defined projected CRS, linear unit metre, vertical unit metre)
    hdr = laspy.LasHeader(point_format=1, version="1.4")
    hdr.scales, hdr.offsets = [0.001, 0.001, 0.001], [0.0, 0.0, 0.0]
    keys = [(1, 1, 0, 3), (1024, 0, 1, 1), (3072, 0, 1, 32767), (3076, 0, 1, 9001), (4099, 0, 1, 9001)]  # model type projected; user-defined CRS; metres; metres
    gk = struct.pack("<4H", 1, 1, 0, len(keys) - 1) + b"".join(struct.pack("<4H", *k) for k in keys[1:])
    hdr.vlrs.append(laspy.vlrs.known.VLR("LASF_Projection", 34735, "GeoKeyDirectoryTag", gk) if hasattr(laspy.vlrs.known, "VLR") else laspy.VLR(user_id="LASF_Projection", record_id=34735, description="GeoKeyDirectoryTag", record_data=gk))
    las = laspy.LasData(hdr)
    las.x, las.y, las.z = P[:, 0], P[:, 1], P[:, 2]
    las.classification = np.zeros(len(P), np.uint8)  # the file carries NO classification: wires, trees, buildings must be found from geometry
    las.write(out)
    truth["points"] = int(len(P))
    truth["true_classes"] = {"2": "ground", "5": "vegetation", "6": "building", "14": "conductor", "15": "tower", "0": "pole", "7": "noise"}
    np.save(out + ".truth_classes.npy", C) if False else None
    json.dump(truth, open(truth_path, "w"), indent=1)
    print("wrote", out, len(P), "points;", truth_path)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
