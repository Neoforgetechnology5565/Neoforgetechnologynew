#!/usr/bin/env python3
"""Pick sample images from VisA's TEST split (never used to build references) and write public/defects/samples + manifest.json.

VisA (Zou et al., ECCV 2022; Amazon) is CC BY 4.0. Samples are RESIZED copies (longest side 960 px, JPEG re-encoded); that modification is stated in the manifest.

    python scripts/make_samples.py /path/to/VisA [--per-class 2]
"""
import argparse
import csv
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT.parent.parent / "public" / "defects" / "samples"
PRETTY = {"pcb1": "Printed circuit board 1", "pcb2": "Printed circuit board 2", "pcb3": "Printed circuit board 3", "pcb4": "Printed circuit board 4", "macaroni1": "Macaroni (plain background)", "macaroni2": "Macaroni (textured background)",
          "capsules": "Capsules", "candle": "Candles", "cashew": "Cashews", "chewinggum": "Chewing gum", "fryum": "Fryum snacks", "pipe_fryum": "Pipe fryum snacks"}

ap = argparse.ArgumentParser()
ap.add_argument("visa")
ap.add_argument("--per-class", type=int, default=2)
a = ap.parse_args()
visa = Path(a.visa)
rows = list(csv.DictReader(open(visa / "split_csv" / "1cls.csv")))
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(3)
samples = []
for obj in sorted({r["object"] for r in rows}):
    for label in ("normal", "anomaly"):
        pool = [r for r in rows if r["object"] == obj and r["split"] == "test" and r["label"] == label]
        for k, i in enumerate(rng.choice(len(pool), a.per_class, replace=False)):
            r = pool[int(i)]
            img = cv2.imread(str(visa / r["image"]))
            s = min(1.0, 960 / max(img.shape[:2]))
            small = cv2.resize(img, (int(img.shape[1] * s), int(img.shape[0] * s)), interpolation=cv2.INTER_AREA)
            sid = f"{obj}-{'normal' if label == 'normal' else 'anomalous'}-{k + 1}"
            cv2.imwrite(str(OUT / f"{sid}.jpg"), small, [cv2.IMWRITE_JPEG_QUALITY, 86])
            mask_file = None
            if label == "anomaly" and r["mask"]:
                m = cv2.imread(str(visa / r["mask"]), cv2.IMREAD_GRAYSCALE)
                m = cv2.resize((m > 0).astype(np.uint8) * 255, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
                mask_file = f"{sid}.mask.png"
                cv2.imwrite(str(OUT / mask_file), m)
            samples.append({"id": sid, "reference_id": obj, "title": f"{PRETTY[obj]} — {'good part' if label == 'normal' else 'part with an annotated anomaly'} {k + 1}", "label": "normal" if label == "normal" else "anomalous", "file": f"{sid}.jpg", "mask": mask_file,
                            "dataset_file": r["image"], "licence": "CC BY 4.0", "attribution": "VisA dataset, Amazon (Zou et al., ECCV 2022), https://github.com/amazon-science/spot-diff", "modification": "resized to 960 px longest side and re-encoded as JPEG"})
(OUT / "manifest.json").write_text(json.dumps({"dataset": "VisA", "licence": "CC BY 4.0", "attribution": "Zou, Y., Jeong, J., Pemula, L., Zhang, D., Dabeer, O.: SPot-the-Difference Self-Supervised Pre-training for Anomaly Detection and Segmentation. ECCV 2022. Dataset released under CC BY 4.0.", "samples": samples}, indent=1))
print(len(samples), "samples written to", OUT)
