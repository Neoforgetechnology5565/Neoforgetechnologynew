#!/usr/bin/env python3
"""Download a YOLOX ONNX model (Apache-2.0, Megvii-BaseDetection/YOLOX release 0.1.1rc0) and verify its SHA-256.

    python scripts/fetch_model.py            # yolox_tiny (default, 416x416, ~20 MB)
    python scripts/fetch_model.py yolox_s    # larger and more accurate, 640x640 -> set PPE_INPUT_SIZE=640
"""
import hashlib
import sys
import urllib.request
from pathlib import Path

BASE = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/{}.onnx"
SHA256 = {
    "yolox_tiny": "427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7",
    "yolox_s": None,  # not pinned: printed after download so you can pin it for your deployment
}


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "yolox_tiny"
    if name not in SHA256:
        print(f"Unknown model {name}. Choose from: {', '.join(SHA256)}")
        return 2
    dest = Path(__file__).resolve().parent.parent / "models" / f"{name}.onnx"
    dest.parent.mkdir(exist_ok=True)
    with urllib.request.urlopen(BASE.format(name), timeout=120) as r:  # noqa: S310 - fixed https URL
        data = r.read()
    digest = hashlib.sha256(data).hexdigest()
    pinned = SHA256[name]
    if pinned and digest != pinned:
        print(f"Checksum mismatch for {name}: expected {pinned}, got {digest}. Not saved.")
        return 1
    dest.write_bytes(data)
    print(f"Saved {dest} ({len(data) / 1e6:.1f} MB) sha256={digest}" + ("" if pinned else "  (not pinned)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
