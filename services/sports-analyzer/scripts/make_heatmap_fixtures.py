#!/usr/bin/env python3
"""Write src/lib/sports/fixtures/heatmap-cases.json: inputs and the Python heatmap output, so the TypeScript twin can be checked against it."""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.stats import heatmap  # noqa: E402

rng = np.random.default_rng(7)
cases = []
for name, (L, W, cell, sigma, n) in {"standard": (105, 68, 2.0, 1.5, 300), "small-pitch-coarse": (90, 55, 5.0, 1.0, 80), "no-smoothing": (105, 68, 2.0, 0.0, 120), "wide-sigma": (105, 68, 2.0, 3.0, 200), "empty": (105, 68, 2.0, 1.5, 0)}.items():
    pts = np.c_[rng.uniform(-3, L + 3, n), rng.uniform(-3, W + 3, n)] if n else np.zeros((0, 2))
    if name == "standard":
        pts[:100] = rng.normal([30, 20], 4, (100, 2))
    pts = np.round(pts, 3)  # the fixture stores rounded points; compute from exactly those
    g = heatmap(pts, None, L, W, cell, sigma)
    cases.append({"name": name, "length": L, "width": W, "cell": cell, "sigma": sigma, "points": np.round(pts, 3).tolist(), "rows": g.shape[0], "cols": g.shape[1], "grid": np.round(g, 6).ravel().tolist()})
out = ROOT.parent.parent / "src" / "lib" / "sports" / "fixtures" / "heatmap-cases.json"
out.write_text(json.dumps({"cases": cases}))
print("wrote", out, len(cases), "cases")
