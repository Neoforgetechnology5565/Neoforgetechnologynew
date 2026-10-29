"""References: the memory of what a good part looks like. Built-in references come from VisA (CC BY 4.0); custom ones are built from the user's own good images."""
from __future__ import annotations

import json
import re
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .patchcore import DEFAULT_SIZE, Backbone, Reference, anomaly_map, build_bank, nn_distance

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,40}$")
PRETTY = {"pcb1": "Printed circuit board 1", "pcb2": "Printed circuit board 2", "pcb3": "Printed circuit board 3", "pcb4": "Printed circuit board 4", "macaroni1": "Macaroni (4 pieces, plain background)", "macaroni2": "Macaroni (4 pieces, textured background)",
          "capsules": "Capsules", "candle": "Candles", "cashew": "Cashews", "chewinggum": "Chewing gum", "fryum": "Fryum snacks", "pipe_fryum": "Pipe fryum snacks"}
BUDGET = 2000


@dataclass
class RefInfo:
    id: str
    name: str
    kind: str  # "builtin" | "custom"
    images: int
    validated: bool
    tau: float
    input_size: int
    stats: dict
    evaluation: dict | None = None
    status: str = "ready"  # building | ready | failed
    error: str | None = None
    notes: list[str] = field(default_factory=list)
    created: float = field(default_factory=time.time)

    def public(self) -> dict:
        return {"id": self.id, "name": self.name, "kind": self.kind, "good_images": self.images, "validated": self.validated, "status": self.status, "error": self.error, "input_size": self.input_size,
                "threshold": round(self.tau, 3), "evaluation": self.evaluation, "notes": self.notes}


class ReferenceStore:
    def __init__(self, builtin_dir: Path, work_dir: Path, backbone: Backbone, max_images: int, min_images: int):
        self.bb, self.max_images, self.min_images = backbone, max_images, min_images
        self.dir = work_dir / "references"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.refs: dict[str, Reference] = {}
        self.info: dict[str, RefInfo] = {}
        self.lock = threading.Lock()
        ev_path = builtin_dir / "evaluation.json"
        ev = json.loads(ev_path.read_text()) if ev_path.is_file() else {}
        if builtin_dir.is_dir():
            for p in sorted(builtin_dir.glob("*.npz")):
                if p.name.endswith(".test_scores.npz"):
                    continue
                try:
                    z = np.load(p, allow_pickle=False)
                    meta = json.loads(str(z["meta"]))
                    oid = p.stem
                    ref = Reference(oid, PRETTY.get(oid, oid), z["bank"], float(z["tau"]), float(z["mu"]), float(z["sigma"]), int(z["size"]), meta)
                    self.refs[oid] = ref
                    self.info[oid] = RefInfo(oid, PRETTY.get(oid, oid), "builtin", meta["good_images_in_bank"], True, ref.tau, ref.size, meta["reference_stats"], ev.get(oid))
                except Exception:  # noqa: BLE001 - one damaged reference must not stop the service
                    continue

    def get(self, rid: str) -> Reference | None:
        return self.refs.get(rid) if ID_RE.match(rid or "") else None

    def list(self) -> list[dict]:
        return [i.public() for i in self.info.values()]

    # ---- custom references ---------------------------------------------------------------------------------------------
    def start_custom(self, name: str, images: list[np.ndarray]) -> RefInfo:
        n = len(images)
        if n < self.min_images:
            raise ValueError(f"At least {self.min_images} good images are needed to build a reference (you sent {n}).")
        if n > self.max_images:
            raise ValueError(f"At most {self.max_images} images can be used to build a reference.")
        rid = "c" + uuid.uuid4().hex[:12]
        info = RefInfo(rid, (name or "Custom part")[:60], "custom", n, False, 0.0, DEFAULT_SIZE, {}, None, "building")
        with self.lock:
            self.info[rid] = info
        threading.Thread(target=self._build, args=(rid, images), daemon=True, name="ref-build").start()
        return info

    def _build(self, rid: str, images: list[np.ndarray]) -> None:
        info = self.info[rid]
        try:
            feats = [self.bb.features(im, DEFAULT_SIZE) for im in images]
            n = len(feats)
            # threshold from k-fold held-out good images: every image is scored by a bank that has not seen it
            k = min(5, n)
            folds = [list(range(i, n, k)) for i in range(k)]
            held = np.zeros(n)
            for f in folds:
                train = [feats[i] for i in range(n) if i not in f]
                bank = build_bank(train, min(BUDGET, 800 * len(train) // 4))
                for i in f:
                    held[i] = anomaly_map(nn_distance(feats[i], bank), DEFAULT_SIZE).max()
            mu, sd = float(held.mean()), float(held.std())
            tau = mu + 3 * sd
            bank = build_bank(feats, BUDGET)
            g = [cv2.cvtColor(im, cv2.COLOR_RGB2GRAY) for im in images]
            stats = {"aspect": float(np.median([a.shape[1] / a.shape[0] for a in g])), "brightness": float(np.median([a.mean() for a in g])),
                     "sharpness": float(np.median([cv2.Laplacian(cv2.resize(a, (512, int(512 * a.shape[0] / a.shape[1]))), cv2.CV_64F).var() for a in g]))}
            meta = {"object": info.name, "good_images_in_bank": n, "k_fold": k, "coreset_patches": int(len(bank)), "input_size": DEFAULT_SIZE, "reference_stats": stats}
            ref = Reference(rid, info.name, bank, tau, mu, sd, DEFAULT_SIZE, meta)
            info.tau, info.stats, info.validated = tau, stats, n >= 30
            info.notes = [f"Threshold estimated from {k}-fold held-out good images ({n} images in total)."] + ([f"Only {n} good images: the threshold is a rough estimate. Use 30 or more, covering normal variation (position, lighting, small marks)."] if n < 30 else [])
            with self.lock:
                self.refs[rid] = ref
            info.status = "ready"
        except Exception as e:  # noqa: BLE001
            info.status, info.error = "failed", f"The reference could not be built ({type(e).__name__})."

    def delete_custom(self, rid: str) -> bool:
        with self.lock:
            i = self.info.get(rid)
            if not i or i.kind != "custom":
                return False
            self.info.pop(rid, None)
            self.refs.pop(rid, None)
        return True

    def expire(self, ttl: int) -> None:
        now = time.time()
        for rid in [r for r, i in self.info.items() if i.kind == "custom" and i.created + ttl < now]:
            self.delete_custom(rid)
