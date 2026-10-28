#!/usr/bin/env python3
"""Package a finished reconstruction as the precomputed sample shipped with the site (public/spatial/samples/<id>/).

    python scripts/build_sample.py <results.json> <job out dir> <frames dir> <dest dir> [--sample-id highway]

results.json is the service's GET /api/spatial/jobs/{id}/results body. Every file is copied unchanged from the service's output; only the number of full-size
frames is reduced (every third frame, plus the frames that carry feature overlays) to keep the repository small. Nothing is edited or synthesised.
"""
import json
import shutil
import sys
from pathlib import Path

res_p, out_dir, frames_dir, dest = (Path(a) for a in sys.argv[1:5])
res = json.loads(res_p.read_text())
dest.mkdir(parents=True, exist_ok=True)
feat_frames = {f["image"] for f in json.loads((out_dir / "tracking.json").read_text())["features"]}
keep_frames = {m["name"] for i, m in enumerate(res["report"]["frames"]) if i % 3 == 0 or m["name"] in feat_frames}
arts = []
for a in res["artifacts"]:
    n = a["name"]
    if n.startswith("frame_"):
        if n[len("frame_"):] not in keep_frames:
            continue
        shutil.copyfile(frames_dir / n[len("frame_"):], dest / n)
    elif n.startswith("thumb_") or (out_dir / n).is_file():
        if a["status"] != "available":
            arts.append({**a, "url": None})
            continue
        shutil.copyfile(out_dir / n, dest / n)
    elif a["status"] == "available":
        continue
    a = {**a, "url": None, "size_bytes": (dest / n).stat().st_size if (dest / n).is_file() else None}
    arts.append(a)
res["artifacts"] = arts
res["job_id"] = "precomputed"
res["report"]["frames_full_size_stored"] = sorted(keep_frames)
(dest / "results.json").write_text(json.dumps(res))
total = sum(p.stat().st_size for p in dest.iterdir())
print(f"wrote {len(arts)} artifacts to {dest} ({total / 1e6:.1f} MB)")
