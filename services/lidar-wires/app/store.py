"""In-memory cloud store: uploaded clouds, their processing versions, results and measurements. Temporary by design (TTL), no database."""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field

import numpy as np

from .classify import GroundModel
from .cloud import PointCloud
from .wires import Wire


@dataclass
class Version:
    id: str
    parent: str | None
    description: str
    pc: PointCloud
    created: float = field(default_factory=time.time)
    labels: np.ndarray | None = None
    base_labels: np.ndarray | None = None  # labels before wire detection, so a re-run starts clean
    label_info: dict | None = None
    ground: GroundModel | None = None
    ground_source: str | None = None
    hag: np.ndarray | None = None
    wires: dict[str, Wire] = field(default_factory=dict)
    wire_info: dict | None = None
    log: list[dict] = field(default_factory=list)


@dataclass
class CloudRecord:
    id: str
    name: str
    versions: dict[str, Version]
    created: float = field(default_factory=time.time)
    touched: float = field(default_factory=time.time)
    measurements: list[dict] = field(default_factory=list)
    next_version: int = 1
    next_measure: int = 1
    lock: threading.RLock = field(default_factory=threading.RLock)


class Store:
    def __init__(self, ttl: int, max_clouds: int, max_versions: int):
        self.ttl, self.max_clouds, self.max_versions = ttl, max_clouds, max_versions
        self.clouds: dict[str, CloudRecord] = {}
        self.lock = threading.Lock()

    def add(self, name: str, pc: PointCloud) -> CloudRecord:
        with self.lock:
            self.expire()
            if len(self.clouds) >= self.max_clouds:
                oldest = min(self.clouds.values(), key=lambda c: c.touched)
                self.clouds.pop(oldest.id, None)
            rec = CloudRecord(uuid.uuid4().hex, name, {"v0": Version("v0", None, "original upload", pc)})
            self.clouds[rec.id] = rec
            return rec

    def get(self, cid: str) -> CloudRecord | None:
        rec = self.clouds.get(cid) if len(cid) == 32 and all(c in "0123456789abcdef" for c in cid) else None
        if rec:
            rec.touched = time.time()
        return rec

    def delete(self, cid: str) -> bool:
        with self.lock:
            return self.clouds.pop(cid, None) is not None

    def expire(self) -> None:
        now = time.time()
        for cid in [c for c, r in self.clouds.items() if r.touched + self.ttl < now]:
            self.clouds.pop(cid, None)

    def new_version(self, rec: CloudRecord, parent: str, desc: str, pc: PointCloud) -> Version:
        with rec.lock:
            if len(rec.versions) >= self.max_versions:
                raise ValueError(f"A cloud can hold {self.max_versions} versions. Delete one (DELETE /api/pointcloud/{{id}}/versions/{{version}}) or reset first.")
            vid = f"v{rec.next_version}"
            rec.next_version += 1
            v = Version(vid, parent, desc, pc)
            rec.versions[vid] = v
            return v
