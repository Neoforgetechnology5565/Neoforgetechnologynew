#!/usr/bin/env python3
"""Download Depth Anything V2 Small as ONNX (Apache-2.0) from the fabio-sim/Depth-Anything-ONNX GitHub release and print its SHA-256.

    python scripts/fetch_models.py
"""
import hashlib
import sys
import urllib.request
from pathlib import Path

URL = "https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits.onnx"
dest = Path(__file__).resolve().parent.parent / "models" / "depth_anything_v2_vits.onnx"
dest.parent.mkdir(exist_ok=True)
with urllib.request.urlopen(URL, timeout=300) as r:  # noqa: S310 - fixed https URL
    data = r.read()
if len(data) < 50_000_000:
    print("Download looks incomplete; not saved.")
    sys.exit(1)
dest.write_bytes(data)
print(f"Saved {dest} ({len(data) / 1e6:.1f} MB) sha256={hashlib.sha256(data).hexdigest()}")
