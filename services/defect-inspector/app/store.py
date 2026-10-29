"""Inspection history: one directory per inspection (metadata JSON + images) in a temporary work directory, expired after a TTL. Not a database."""
from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from pathlib import Path

import cv2
import numpy as np

KINDS = {"original": ("original.jpg", "image/jpeg"), "annotated": ("annotated.jpg", "image/jpeg"), "heatmap": ("heatmap.png", "image/png"), "thumb": ("thumb.jpg", "image/jpeg"), "dataset_annotation": ("dataset_annotation.png", "image/png")}
ID_LEN = 32


class Store:
    def __init__(self, work_dir: Path, ttl: int, max_items: int):
        self.dir = work_dir / "inspections"
        self.dir.mkdir(parents=True, exist_ok=True)
        for p in self.dir.iterdir():  # leftovers from a previous run are never served
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self.ttl, self.max_items = ttl, max_items
        self.lock = threading.Lock()

    def valid(self, iid: str) -> bool:
        return len(iid) == ID_LEN and all(c in "0123456789abcdef" for c in iid)

    def path(self, iid: str) -> Path | None:
        return self.dir / iid if self.valid(iid) and (self.dir / iid / "meta.json").is_file() else None

    def create(self, meta: dict, original: np.ndarray, annotated: np.ndarray, heat_rgba: np.ndarray, extra_mask: np.ndarray | None = None, model_map: np.ndarray | None = None) -> dict:
        iid = uuid.uuid4().hex
        d = self.dir / iid
        d.mkdir()
        cv2.imwrite(str(d / "original.jpg"), cv2.cvtColor(original, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
        cv2.imwrite(str(d / "annotated.jpg"), cv2.cvtColor(annotated, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
        cv2.imwrite(str(d / "heatmap.png"), cv2.cvtColor(heat_rgba, cv2.COLOR_RGBA2BGRA))
        h, w = original.shape[:2]
        s = 256 / max(h, w)
        cv2.imwrite(str(d / "thumb.jpg"), cv2.cvtColor(cv2.resize(original, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 80])
        if extra_mask is not None:
            rgba = np.zeros((*extra_mask.shape, 4), np.uint8)
            rgba[extra_mask > 0] = (56, 189, 248, 170)
            cv2.imwrite(str(d / "dataset_annotation.png"), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
        if model_map is not None:
            np.save(d / "map.npy", model_map.astype(np.float16))  # anomaly map at model resolution, so rules can be re-evaluated without re-running the model
        meta = {**meta, "id": iid, "created_at": time.time(), "review": {"history": [], "current": None}}
        self._write(iid, meta)
        self.prune()
        return meta

    def _write(self, iid: str, meta: dict) -> None:
        with self.lock:
            tmp = self.dir / iid / "meta.json.tmp"
            tmp.write_text(json.dumps(meta))
            tmp.replace(self.dir / iid / "meta.json")

    def get(self, iid: str) -> dict | None:
        p = self.path(iid)
        if not p:
            return None
        try:
            return json.loads((p / "meta.json").read_text())
        except (OSError, ValueError):
            return None

    def list(self, limit: int = 100) -> list[dict]:
        items = []
        for p in self.dir.iterdir():
            m = self.get(p.name) if p.is_dir() else None
            if m:
                items.append(m)
        items.sort(key=lambda m: -m["created_at"])
        return items[:limit]

    def update(self, iid: str, meta: dict, annotated: np.ndarray | None = None) -> None:
        if annotated is not None:
            cv2.imwrite(str(self.dir / iid / "annotated.jpg"), cv2.cvtColor(annotated, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
        self._write(iid, meta)

    def load_map(self, iid: str) -> np.ndarray | None:
        p = self.dir / iid / "map.npy"
        return np.load(p).astype(np.float32) if self.path(iid) and p.is_file() else None

    def review(self, iid: str, entry: dict) -> dict | None:
        m = self.get(iid)
        if not m:
            return None
        m["review"]["history"].append(entry)
        m["review"]["current"] = entry
        self._write(iid, m)
        return m

    def image(self, iid: str, kind: str) -> tuple[Path, str] | None:
        if kind not in KINDS or not self.path(iid):
            return None
        f = self.dir / iid / KINDS[kind][0]
        return (f, KINDS[kind][1]) if f.is_file() else None

    def delete(self, iid: str) -> bool:
        p = self.path(iid)
        if not p:
            return False
        shutil.rmtree(p, ignore_errors=True)
        return True

    def prune(self) -> None:
        now = time.time()
        items = self.list(10 ** 6)
        for m in items:
            if m["created_at"] + self.ttl < now:
                self.delete(m["id"])
        for m in self.list(10 ** 6)[self.max_items:]:
            self.delete(m["id"])
