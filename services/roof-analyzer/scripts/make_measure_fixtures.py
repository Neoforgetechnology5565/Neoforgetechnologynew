#!/usr/bin/env python3
"""Writes src/lib/roof/fixtures/measure-cases.json: inputs and the Python engine's outputs, so the TypeScript port can be checked against it."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.measure import measure_polygon, pitch_from, resolve_scale  # noqa: E402
from app.media import Georef  # noqa: E402

poly = [[100, 100], [400, 120], [420, 300], [90, 310], [60, 200]]
rect = [[10, 10], [210, 10], [210, 110], [10, 110]]
geo = Georef(0.2427, 0.2996, "EPSG:4326", "test")
cases = [
    {"name": "no scale", "polygon": poly, "scale": None, "pitch": None},
    {"name": "geo", "polygon": poly, "scale": None, "georef": vars(geo), "pitch": None},
    {"name": "gsd + pitch 6:12", "polygon": poly, "scale": {"type": "gsd", "gsd_m": 0.05}, "pitch": {"rise_per_12": 6}},
    {"name": "reference", "polygon": poly, "scale": {"type": "reference", "p1": [0, 0], "p2": [300, 400], "length_m": 25}, "pitch": {"degrees": 30}},
    {"name": "plane quad (perspective)", "polygon": [[120, 60], [330, 90], [310, 240], [100, 200]], "scale": {"type": "plane_quad", "quad": [[80, 40], [360, 70], [340, 280], [60, 220]], "width_m": 8, "height_m": 5}, "pitch": None},
    {"name": "plane quad (axis aligned)", "polygon": rect, "scale": {"type": "plane_quad", "quad": [[0, 0], [200, 0], [200, 100], [0, 100]], "width_m": 20, "height_m": 10}, "pitch": None},
]
for c in cases:
    g = Georef(**c["georef"]) if "georef" in c else None
    c["expected"] = measure_polygon(c["polygon"], resolve_scale(c["scale"], g), pitch_from(c["pitch"]))
out = ROOT.parent.parent / "src" / "lib" / "roof" / "fixtures" / "measure-cases.json"
out.write_text(json.dumps(cases, indent=1))
print("wrote", out, len(cases), "cases")
