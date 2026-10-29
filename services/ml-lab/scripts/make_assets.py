"""Build the bundled sample data for the ML demos (deterministic). Needs scikit-image, statsmodels, pandas, opencv, numpy, ffmpeg.
  python scripts/make_assets.py [output_dir]            default: ../../public/ml/samples
Fashion-MNIST test images are read from /tmp/fmnist (download t10k-*-ubyte.gz from https://storage.googleapis.com/tensorflow/tf-keras-datasets/)."""
from __future__ import annotations

import gzip
import json
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parent.parent.parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "public" / "ml" / "samples"
OUT.mkdir(parents=True, exist_ok=True)
S: list[dict] = []


def add(**kw):
    S.append(kw)


# ---- images (scikit-image's bundled sample images, all public domain / CC0) -------------------------------------------------
from skimage import data  # noqa: E402

for name, fn, title, lic, desc in [
    ("astronaut", data.astronaut, "Astronaut portrait", "Public domain (NASA Great Images database, via scikit-image)", "One person, indoors."),
    ("chelsea", data.chelsea, "Cat", "CC0 by Stefan van der Walt (via scikit-image)", "A domestic cat."),
    ("coffee", data.coffee, "Coffee cup", "CC0 by Rachel Michetti (via scikit-image)", "A cup of coffee on a wooden table."),
    ("rocket", data.rocket, "Rocket launch", "Public domain, released by SpaceX (via scikit-image)", "A Falcon 9 launch at night."),
]:
    cv2.imwrite(str(OUT / f"{name}.jpg"), cv2.cvtColor(fn(), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
    add(id=name, kind="image", file=f"{name}.jpg", title=title, description=desc, provenance=f"scikit-image sample data: skimage.data.{name}()", licence=lic)
# a street frame and a short clip from the OpenCV pedestrian sample already in the repository
clip = REPO / "public" / "activity" / "samples" / "pedestrians-opencv-vtest.mp4"
if clip.is_file():
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-ss", "20", "-t", "8", "-i", str(clip), "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT / "pedestrians-8s.mp4")], check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-ss", "30", "-i", str(clip), "-frames:v", "1", "-q:v", "3", str(OUT / "street.jpg")], check=True)
    prov = "Cut from samples/data/vtest.avi in the OpenCV repository (Apache-2.0 licensed repository; the recording's author is not documented)"
    add(id="street", kind="image", file="street.jpg", title="Street scene with pedestrians", description="Several people walking on a campus path, seen from above.", provenance=prov, licence="Apache-2.0 repository sample; see provenance")
    add(id="pedestrians-8s", kind="video", file="pedestrians-8s.mp4", title="Pedestrians, 8 s clip", description="Eight seconds of people walking.", provenance=prov, licence="Apache-2.0 repository sample; see provenance")
# documents (created for this project or Apache-2.0)
docs = REPO / "public" / "documents" / "samples"
for f, t, d in [("invoice-text.pdf", "Invoice, text PDF (fictional)", "Two-page PDF with a text layer."), ("invoice-scanned.pdf", "Invoice, simulated scan (fictional)", "Image-only PDF: no text layer, so the text must be recognised."),
                ("scan-tesseract-phototest.tif", "Clean test scan (Tesseract project)", "Eight lines of 12-point text.")]:
    if (docs / f).is_file():
        shutil.copyfile(docs / f, OUT / f)
        add(id=f.rsplit(".", 1)[0], kind="document", file=f, title=t, description=d, provenance="See public/documents/samples/manifest.json", licence="Created for this project / Apache-2.0 (Tesseract test image)")
# ---- time series: real CO2 record --------------------------------------------------------------------------------------------
from statsmodels.datasets import co2  # noqa: E402

c = co2.load_pandas().data["co2"].resample("MS").mean().interpolate()
c.index.name = "month"
c.round(2).rename("co2_ppm").reset_index().to_csv(OUT / "co2-monthly.csv", index=False, date_format="%Y-%m-%d")
add(id="co2-monthly", kind="csv", file="co2-monthly.csv", title="Atmospheric CO2, monthly (1958-2001)", description="Mauna Loa carbon-dioxide concentration (ppm), weekly readings averaged by month; 526 rows with a trend and a yearly cycle.", provenance="statsmodels.datasets.co2 (Keeling and Whorf, Scripps Institution of Oceanography); gaps filled by linear interpolation when averaging", licence="Public domain")
# ---- sensors: synthetic with injected faults ---------------------------------------------------------------------------------
rng = np.random.default_rng(11)
n = 2880  # ten days at five-minute steps
t = pd.date_range("2024-03-01", periods=n, freq="5min")
day = 2 * np.pi * (np.arange(n) % 288) / 288
temp = 62 + 3 * np.sin(day - 1) + rng.normal(0, 0.4, n)
vib = 2.0 + 0.2 * np.sin(day) + rng.normal(0, 0.08, n)
pres = 5.0 + 0.15 * np.sin(day + 1) + rng.normal(0, 0.03, n)
lab = np.zeros(n, int)
vib[2000:2600] += np.linspace(0, 1.6, 600); lab[2300:2600] = 1            # bearing wear: vibration drifts upward; labelled once clearly out of range
for i in (700, 1500):                                                    # isolated temperature spikes
    temp[i] += 14; lab[i] = 1
temp[1100:1160] = temp[1100]; lab[1100:1160] = 1                           # stuck sensor: flat line
pres[2700:2780] -= 0.9; lab[2700:2780] = 1                                 # pressure drop
pd.DataFrame({"timestamp": t.strftime("%Y-%m-%d %H:%M:%S"), "temperature_c": temp.round(2), "vibration_mm_s": vib.round(3), "pressure_bar": pres.round(3), "injected_fault": lab}).to_csv(OUT / "pump-sensors-synthetic.csv", index=False)
add(id="pump-sensors-synthetic", kind="csv", file="pump-sensors-synthetic.csv", title="Pump sensors (synthetic, with injected faults)", description="Ten days of five-minute readings for temperature, vibration and pressure with a daily cycle and noise, plus four injected faults (two spikes, a stuck sensor, a vibration drift and a pressure drop). The 'injected_fault' column marks them so detection can be scored.", provenance="Generated by services/ml-lab/scripts/make_assets.py (seed 11). Not real machine data.", licence="Created for this project")
# ---- text documents for search: this repository's own documentation ---------------------------------------------------------
tdir = OUT / "docs"
tdir.mkdir(exist_ok=True)
for rel, title in [("docs/activity/RULES.md", "Activity review rules"), ("docs/activity/LIMITATIONS.md", "Activity review limitations"), ("docs/documents/METHODS.md", "Document intelligence methods"), ("docs/documents/LIMITATIONS.md", "Document intelligence limitations"),
                   ("docs/defects/ARCHITECTURE.md", "Visual inspection architecture"), ("docs/defects/LIMITATIONS.md", "Visual inspection limitations"), ("docs/lidar/MEASUREMENT.md", "LiDAR units and measurement"), ("docs/lidar/LIMITATIONS.md", "LiDAR limitations")]:
    p = REPO / rel
    if p.is_file():
        name = rel.replace("/", "-").lower()
        shutil.copyfile(p, tdir / name)
        add(id=name.rsplit(".", 1)[0], kind="text", file=f"docs/{name}", title=title, description=f"Neo Forge documentation page ({rel}).", provenance=f"Copied from {rel} in this repository", licence="Created for this project")
# ---- product catalogue: Fashion-MNIST images with synthetic metadata -----------------------------------------------------------
fm = Path("/tmp/fmnist")
if (fm / "t10k-images-idx3-ubyte.gz").is_file():
    imgs = np.frombuffer(gzip.open(fm / "t10k-images-idx3-ubyte.gz").read(), np.uint8, offset=16).reshape(-1, 28, 28)
    labs = np.frombuffer(gzip.open(fm / "t10k-labels-idx1-ubyte.gz").read(), np.uint8, offset=8)
    cats = ["T-shirt", "Trousers", "Pullover", "Dress", "Coat", "Sandal", "Shirt", "Sneaker", "Bag", "Ankle boot"]
    brands, colours = ["Alder & Finch", "Northpoint", "Marlow Co.", "Quill Street", "Harbor Lane", "Kestrel"], ["black", "white", "navy", "olive", "grey", "red", "tan"]
    mats = {0: ["cotton", "cotton blend"], 1: ["denim", "wool blend"], 2: ["wool", "cotton blend"], 3: ["cotton", "linen", "viscose"], 4: ["wool", "polyester"], 5: ["leather", "rubber"], 6: ["cotton", "linen"], 7: ["canvas", "mesh"], 8: ["leather", "canvas"], 9: ["leather", "suede"]}
    rng = np.random.default_rng(5)
    pdir = OUT / "products"
    pdir.mkdir(exist_ok=True)
    items = []
    for cl in range(10):
        pick = np.flatnonzero(labs == cl)[:14]
        for j, ix in enumerate(pick):
            br, co, ma = rng.choice(brands), rng.choice(colours), rng.choice(mats[cl])
            pid = f"p{len(items) + 1:03d}"
            cv2.imwrite(str(pdir / f"{pid}.png"), cv2.resize(imgs[ix], (112, 112), interpolation=cv2.INTER_CUBIC))
            items.append({"id": pid, "name": f"{br} {co} {cats[cl].lower()}", "category": cats[cl], "brand": br, "colour": co, "material": ma, "price": float(round(rng.uniform(18, 140), 2)), "image": f"{pid}.png",
                          "description": f"A {co} {cats[cl].lower()} in {ma} from {br}.", "source_image": f"Fashion-MNIST test image {int(ix)}"})
    rng.shuffle(items)
    (pdir / "items.json").write_text(json.dumps(items, indent=1))
    add(id="fashion-catalogue", kind="catalogue", file="products/items.json", title="Sample catalogue (140 items)", description="Product images from Fashion-MNIST (28x28 grey-scale images of Zalando articles). Names, brands, colours, materials, prices and descriptions are synthetic and were generated for this demo.", provenance="Zalando Research Fashion-MNIST test set; metadata generated by services/ml-lab/scripts/make_assets.py (seed 5)", licence="MIT (Fashion-MNIST); metadata created for this project")
(OUT / "manifest.json").write_text(json.dumps({"samples": S}, indent=1))
print(len(S), "samples")
