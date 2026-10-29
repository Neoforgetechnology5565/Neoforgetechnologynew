#!/usr/bin/env python3
"""Register a football video as a bundled sample (public/sports/samples + manifest.json).

Only add footage you have the right to redistribute. Licence, source and attribution are mandatory and are shown next to the sample in the UI.

    python scripts/add_sample.py clip.mp4 --id sample-match --title "Sample match" --description "What the clip shows" \\
        --licence "CC BY 4.0" --source "https://..." --attribution "Name of the rights holder"
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT.parent.parent / "public" / "sports" / "samples"

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("video")
for k in ("id", "title", "description", "licence", "source", "attribution"):
    ap.add_argument(f"--{k}", required=True)
ap.add_argument("--max-mb", type=float, default=60.0)
a = ap.parse_args()

src = Path(a.video)
if not src.is_file():
    sys.exit("video not found")
if src.stat().st_size > a.max_mb * 1e6:
    sys.exit(f"the file is larger than {a.max_mb} MB; trim or re-encode it (H.264 MP4) before bundling it in the repository")
if not a.id.replace("-", "").isalnum() or not a.id.islower():
    sys.exit("--id must be lower-case letters, digits and hyphens")
cap = cv2.VideoCapture(str(src))
ok, frame = cap.read()
if not ok:
    sys.exit("the video cannot be decoded by OpenCV")
fps, n = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
OUT.mkdir(parents=True, exist_ok=True)
dest = OUT / f"{a.id}.mp4"
shutil.copyfile(src, dest)
m = OUT / "manifest.json"
data = json.loads(m.read_text()) if m.is_file() else {"samples": []}
data["samples"] = [s for s in data["samples"] if s["id"] != a.id] + [{"id": a.id, "title": a.title, "description": a.description, "file": dest.name, "licence": a.licence, "source": a.source, "attribution": a.attribution,
                                                                    "width": frame.shape[1], "height": frame.shape[0], "fps": round(fps, 3), "duration_s": round(n / fps, 2) if fps else None}]
m.write_text(json.dumps(data, indent=2))
print("added", dest, "-> manifest has", len(data["samples"]), "sample(s)")
