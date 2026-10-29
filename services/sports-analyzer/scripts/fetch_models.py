#!/usr/bin/env python3
"""The detector model is committed (models/footandball.onnx, 0.8 MB). This script verifies it and, with --rebuild, regenerates it from the
published FootAndBall weights (downloads them from GitHub, checks the SHA-256, runs scripts/convert_footandball.py; needs the `onnx` package)."""
import hashlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEIGHTS_SHA256 = "42fbc1f457fc34d804b403e26138524fc40facde303ccd7b4be73121e8da4cd5"
onnx_path = ROOT / "models" / "footandball.onnx"

if "--rebuild" in sys.argv:
    pth = ROOT / "models" / "model_20201019_1416_final.pth"
    subprocess.check_call([sys.executable, str(ROOT / "scripts" / "convert_footandball.py")])
    got = hashlib.sha256(pth.read_bytes()).hexdigest()
    if got != WEIGHTS_SHA256:
        sys.exit(f"Downloaded weights have an unexpected SHA-256 ({got}); refusing to trust them.")
if not onnx_path.is_file():
    sys.exit("models/footandball.onnx is missing. Restore it from the repository or run with --rebuild.")
print(onnx_path, f"{onnx_path.stat().st_size / 1e6:.2f} MB", "sha256", hashlib.sha256(onnx_path.read_bytes()).hexdigest())
