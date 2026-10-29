"""Rebuild models/blazepose_full.onnx from the MediaPipe wheel.
   pip download mediapipe==0.10.14 --no-deps --only-binary=:all: --python-version 3.11 --platform manylinux2014_x86_64 -d wheel
   python scripts/convert_pose.py wheel/mediapipe-0.10.14-*.whl        (needs tensorflow, tf2onnx, onnx)
"""
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

wheel = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "models" / "blazepose_full.onnx"
with tempfile.TemporaryDirectory() as d, zipfile.ZipFile(wheel) as z:
    z.extract("mediapipe/modules/pose_landmark/pose_landmark_full.tflite", d)
    subprocess.run([sys.executable, "-m", "tf2onnx.convert", "--tflite", str(Path(d) / "mediapipe/modules/pose_landmark/pose_landmark_full.tflite"), "--output", str(out), "--opset", "13"], check=True)
print("wrote", out)
