#!/usr/bin/env python3
"""Builds public/roof/samples from SpaceNet 2 chips (CC BY-SA 4.0) and STORES a real run of the analysis service on each.

    python scripts/build_samples.py <dir with the chips as data/<city>/imgNNN.tif> <dest dir>

The chips are copied UNCHANGED (16-bit GeoTIFF, with their georeferencing). A preview JPEG uses the same per-channel stretch the service applies. The stored
results are the service's own output for the default settings; nothing is edited by hand. The chosen chips come from the held-out split of the fine-tuning
(never seen in training): see docs/roof/MODEL_AND_LICENSES.md.
"""
import json
import shutil
import sys
import time
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.media import decode_image  # noqa: E402

SRC, DEST = Path(sys.argv[1]), Path(sys.argv[2])
CHIPS = [
    ("vegas-subdivision", "vegas", "img1359", "Suburban subdivision (Las Vegas)", "Rows of single-family houses with tile roofs along curved streets, seen from straight above. The model finds most roofs; a few roofs are merged where they touch.", "Hip and gable roofs in a regular layout, several roof colours, swimming pools and some trees. Georeferenced: the scale comes from the file's own metadata."),
    ("vegas-waterfront", "vegas", "img779", "Houses beside a lake (Las Vegas)", "Houses of different sizes and roof colours between a lake and a road.", "Mixed roof colours and shapes, partial shadows, water, tennis courts. Georeferenced."),
    ("paris-flat-roofs", "paris", "img1185", "Large flat-roofed buildings (Paris area)", "Large rectangular buildings with flat roofs and strong shadows.", "Flat roofs, strong shadows, rooftop equipment. The model finds only part of each large roof: a harder case, shown on purpose."),
    ("vegas-desert-edge", "vegas", "img2491", "Desert edge with houses (Las Vegas)", "Houses at the edge of town with terracotta-coloured bare ground around them.", "A KNOWN WEAK CASE: bare soil of a similar colour to tile roofs is partly mistaken for roofs. The tool's warning about implausibly large roof coverage and the confidence map exist for cases like this."),
]
DEST.mkdir(parents=True, exist_ok=True)
manifest = {"samples": []}
for sid, city, img, title, desc, scenario in CHIPS:
    src = SRC / "data" / city / f"{img}.tif"
    shutil.copyfile(src, DEST / f"{sid}.tif")
    dec = decode_image(src.read_bytes(), 40_000_000)
    cv2.imwrite(str(DEST / f"{sid}.preview.jpg"), cv2.cvtColor(dec.rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
    manifest["samples"].append({
        "id": sid, "file": f"{sid}.tif", "preview": f"{sid}.preview.jpg", "title": title, "description": desc, "scenario": scenario, "width": dec.rgb.shape[1], "height": dec.rgb.shape[0], "georeferenced": True,
        "gsd_note": f"{dec.georef.gsd_x_m:.3f} × {dec.georef.gsd_y_m:.3f} m per pixel (x × y), read from the GeoTIFF",
        "license": "CC BY-SA 4.0", "attribution": f"SpaceNet 2 (Round 2 buildings) chip {city.capitalize()} {img}: imagery © DigitalGlobe, Inc., distributed by SpaceNet (Radiant Solutions / CosmiQ Works) under CC BY-SA 4.0. The chip is unmodified; overlays derived from it are shared under the same licence.",
        "source": "https://spacenet.ai/spacenet-buildings-dataset-v2/", "results": f"{sid}.results.json",
        "artifacts": {"original": f"{sid}.original.jpg", "overlay": f"{sid}.overlay.png", "mask": f"{sid}.mask.png", "probability": f"{sid}.probability.png"}})
(DEST / "manifest.json").write_text(json.dumps(manifest, indent=1))

with TestClient(create_app(Settings(samples_dir=DEST, work_dir=Path("/tmp/roof-build-work")))) as c:
    for s in manifest["samples"]:
        t = time.time()
        j = c.post("/api/roof/analyze", data={"sample_ids": s["id"], "params": json.dumps({"threshold": 0.5, "min_area_px": 150})}).json()
        while c.get(f"/api/roof/jobs/{j['job_id']}").json()["status"] in ("queued", "running"):
            time.sleep(0.3)
        res = c.get(f"/api/roof/jobs/{j['job_id']}/results").json()
        entry = res["images"][0]
        assert entry["ok"], entry
        (DEST / s["results"]).write_text(json.dumps(entry["result"]))
        for kind, path in res["artifact_urls"]["0"].items():
            (DEST / s["artifacts"][kind]).write_bytes(c.get(path).content)
        r = entry["result"]
        print(s["id"], r["summary"]["regions"], "regions,", f"{100 * r['summary']['roof_fraction_of_image']:.0f} % roof,", f"{time.time() - t:.1f}s", r["warnings"])
