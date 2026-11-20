"""Runs the REAL engine on the bundled sample and writes display files for the website's demo page (public/models/photomesh-studio).
Usage (from engine/):  PYTHONPATH=. python ../scripts/make_web_demo.py ../../../public/models/photomesh-studio
The files are the engine's own stage outputs in the binary preview format (see api.pack_preview), decimated for the web, plus a JSON file with the measured reports and timings."""
import json, sys, time
from pathlib import Path

from pgengine.api import pack_preview
from pgengine.common import Progress
from pgengine.pipeline import report_for, run
from pgengine.presets import preset
from pgengine.project import Project
from pgengine.sample import make_sample

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
p = Project.create("web-demo"); c, ref, meta = make_sample("bunny", 90000); p.commit("Sample", "sample", {}, {"original": c, "reference": ref}, info=meta)
t = time.time(); logs = []
cfg = preset("balanced"); cfg["refine"]["decimate"] = {"ratio": 0.25}
run(p, "pipeline", cfg, Progress(lambda k, d: logs.append(d["message"]) if k == "log" else None)); total = time.time() - t
files = {}
for stage in ("original", "cleaned", "reconstructed", "refined"):
    b = pack_preview(p.get(stage), 70000, 60000); (out / f"{stage}.bin").write_bytes(b); files[stage] = len(b)
rep = {s: report_for(p, s) for s in ("cleaned", "reconstructed", "refined")}
for r in rep.values(): r.pop("verdict", None)
json.dump({"preset": "balanced (reconstruction decimated to 25%)", "seconds": round(total, 1), "log": logs, "reports": rep, "stages": {s: p.stages[s]["summary"] for s in ("original", "cleaned", "reconstructed", "refined")}, "files": files, "note": meta["sample_note"]}, open(out / "report.json", "w"), indent=1)
print(files, round(total, 1), "s")
p.delete()
