#!/usr/bin/env python3
"""The roof model is committed in models/ (30 MB ONNX). This script only verifies it."""
import hashlib
import sys
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "models" / "roof_unet_ft.onnx"
if not p.is_file():
    print("models/roof_unet_ft.onnx is missing. Restore it from the repository.")
    sys.exit(1)
print(p, f"{p.stat().st_size / 1e6:.1f} MB", "sha256", hashlib.sha256(p.read_bytes()).hexdigest())
