#!/usr/bin/env python3
"""Build one PatchCore reference per VisA object type and evaluate it on VisA's test split.

VisA (Visual Anomaly dataset; Zou et al., ECCV 2022; Amazon) is licensed CC BY 4.0. Download VisA_20220922.tar from
https://amazon-visual-anomaly.s3.us-west-2.amazonaws.com/VisA_20220922.tar and extract it, then:

    python scripts/build_references.py /path/to/VisA [--objects pcb1 candle ...] [--train 200] [--val 50] [--budget 2000]

For each object: `train` good images (from the 1cls train split) form the memory bank, `val` other good training images calibrate the flag
threshold (mean + 3 std of their image scores), and the 1cls TEST split (never used for training or calibration) gives the honest evaluation:
image-level and pixel-level AUROC, plus the true-positive and false-positive rates AT the calibrated threshold. Results are written to
models/references/<object>.npz and models/references/evaluation.json.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.patchcore import DEFAULT_SIZE, Backbone, anomaly_map, auroc, build_bank, nn_distance  # noqa: E402


def load(path: Path) -> np.ndarray:
    return cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2RGB)


def image_stats(rgb: np.ndarray) -> dict:
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return {"aspect": rgb.shape[1] / rgb.shape[0], "brightness": float(g.mean()), "sharpness": float(cv2.Laplacian(cv2.resize(g, (512, int(512 * g.shape[0] / g.shape[1]))), cv2.CV_64F).var())}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("visa")
    ap.add_argument("--objects", nargs="*")
    ap.add_argument("--train", type=int, default=200)
    ap.add_argument("--val", type=int, default=50)
    ap.add_argument("--budget", type=int, default=2000)
    ap.add_argument("--size", type=int, default=DEFAULT_SIZE)
    a = ap.parse_args()
    visa = Path(a.visa)
    rows = list(csv.DictReader(open(visa / "split_csv" / "1cls.csv")))
    objs = a.objects or sorted({r["object"] for r in rows})
    bb = Backbone(ROOT / "models" / "resnet50_l23.onnx")
    out = ROOT / "models" / "references"
    out.mkdir(exist_ok=True)
    ev_path = out / "evaluation.json"
    ev = json.loads(ev_path.read_text()) if ev_path.is_file() else {}
    rng = np.random.default_rng(0)
    for obj in objs:
        t0 = time.time()
        tr = [r for r in rows if r["object"] == obj and r["split"] == "train"]
        te = [r for r in rows if r["object"] == obj and r["split"] == "test"]
        perm = rng.permutation(len(tr))
        bank_rows, val_rows = [tr[i] for i in perm[:a.train]], [tr[i] for i in perm[a.train:a.train + a.val]]
        feats, stats = [], []
        for r in bank_rows:
            img = load(visa / r["image"]); feats.append(bb.features(img, a.size)); stats.append(image_stats(img))
        bank = build_bank(feats, a.budget)
        def score(r):
            img = load(visa / r["image"]); m = anomaly_map(nn_distance(bb.features(img, a.size), bank), a.size); return m, img
        vs = np.array([score(r)[0].max() for r in val_rows])
        mu, sd = float(vs.mean()), float(vs.std())
        tau = mu + 3 * sd
        # ---- honest evaluation on the test split
        img_scores, img_labels, pix_s, pix_l = [], [], [], []
        for r in te:
            m, img = score(r)
            img_scores.append(float(m.max())); img_labels.append(1 if r["label"] == "anomaly" else 0)
            if r["label"] == "anomaly" and r["mask"]:
                gt = cv2.imread(str(visa / r["mask"]), cv2.IMREAD_GRAYSCALE) > 0
            else:
                gt = np.zeros(img.shape[:2], bool)
            small_gt = cv2.resize(gt.astype(np.uint8), (192, 192), interpolation=cv2.INTER_NEAREST).astype(bool)
            pix_s.append(cv2.resize(m, (192, 192), interpolation=cv2.INTER_AREA).ravel()); pix_l.append(small_gt.ravel())
        S, L = np.array(img_scores), np.array(img_labels)
        pa = auroc(np.concatenate(pix_s), np.concatenate(pix_l))
        meta = {"object": obj, "good_images_in_bank": len(bank_rows), "good_images_for_threshold": len(val_rows), "coreset_patches": int(len(bank)), "input_size": a.size, "backbone": "ResNet-50 (ImageNet, Keras applications) layers 2+3",
                "dataset": "VisA (CC BY 4.0)", "tau": tau, "mu": mu, "sigma": sd, "reference_stats": {k: float(np.median([s[k] for s in stats])) for k in ("aspect", "brightness", "sharpness")}}
        meta["val_scores"] = [round(float(v), 4) for v in vs]
        np.savez_compressed(out / f"{obj}.npz", bank=bank, tau=tau, mu=mu, sigma=sd, size=a.size, meta=json.dumps(meta))
        np.savez_compressed(out / f"{obj}.test_scores.npz", scores=S, labels=L)  # kept so the threshold rule can be revisited without recomputing
        ev[obj] = {"test_normal": int((L == 0).sum()), "test_anomalous": int((L == 1).sum()), "image_auroc": round(auroc(S, L), 4), "pixel_auroc": round(pa, 4), "at_threshold": {"true_positive_rate": round(float((S[L == 1] >= tau).mean()), 3), "false_positive_rate": round(float((S[L == 0] >= tau).mean()), 3)},
                    "tau": round(tau, 3), "normal_score_range_test": [round(float(S[L == 0].min()), 3), round(float(S[L == 0].max()), 3)], "anomalous_score_median_test": round(float(np.median(S[L == 1])), 3), "seconds": round(time.time() - t0, 1)}
        ev_path.write_text(json.dumps(ev, indent=1))
        print(obj, ev[obj], flush=True)


if __name__ == "__main__":
    main()
