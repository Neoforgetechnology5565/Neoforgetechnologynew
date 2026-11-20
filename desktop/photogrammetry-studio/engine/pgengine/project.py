"""Project workspace on disk: stages (original / cleaned / reconstructed / refined / preview), an undo/redo history, and automatic temporary-file management.
All state lives in <workspace>/<id>/state.json plus one .npz per stage version, so a separate worker process can read and extend it, and cancelling a job never corrupts the project."""
from __future__ import annotations

import json
import os
import shutil
import time
import uuid
import zipfile
from pathlib import Path

from . import model
from .model import Cloud, Mesh

STAGES = ["original", "cleaned", "reconstructed", "refined", "preview", "reference"]


def home() -> Path:
    p = Path(os.environ.get("PGS_HOME") or Path.home() / ".photomesh-studio") / "workspaces"; p.mkdir(parents=True, exist_ok=True); return p


def cleanup_stale(max_age_days: float = 7.0, keep: set[str] | None = None) -> list[str]:
    """Delete workspaces untouched for max_age_days (temporary files). Returns the removed ids."""
    gone = []
    for d in home().iterdir():
        if d.is_dir() and (not keep or d.name not in keep) and time.time() - d.stat().st_mtime > max_age_days * 86400: shutil.rmtree(d, ignore_errors=True); gone.append(d.name)
    return gone


def summary(obj: Cloud | Mesh) -> dict:
    import numpy as np
    pts = obj.points if isinstance(obj, Cloud) else obj.vertices; mn = pts.min(0); mx = pts.max(0)
    s = {"kind": obj.kind, "bbox_min": mn.tolist(), "bbox_max": mx.tolist(), "size": (mx - mn).tolist(), "has_colors": obj.colors is not None}
    if isinstance(obj, Cloud): s.update({"points": len(obj), "has_normals": obj.normals is not None})
    else: s.update({"vertices": len(obj.vertices), "faces": len(obj.faces), "has_texture": obj.texture is not None})
    return s


class Project:
    def __init__(self, pid: str):
        self.id = pid; self.dir = home() / pid; self.state_file = self.dir / "state.json"

    @classmethod
    def create(cls, name: str = "Untitled") -> "Project":
        p = cls(uuid.uuid4().hex[:12]); p.dir.mkdir(parents=True, exist_ok=True)
        p.state = {"id": p.id, "name": name, "created": time.time(), "info": {}, "history": [{"id": 0, "label": "New project", "op": "new", "stages": {}, "report": {}, "time": time.time(), "seconds": 0.0}], "pointer": 0, "counter": 0, "saved": False}
        p.write(); return p

    @classmethod
    def open(cls, pid: str) -> "Project":
        p = cls(pid)
        if not p.state_file.exists(): raise KeyError("Project not found.")
        p.state = json.loads(p.state_file.read_text()); return p

    def reload(self) -> None:
        self.state = json.loads(self.state_file.read_text())

    def write(self) -> None:
        tmp = self.state_file.with_suffix(".tmp"); tmp.write_text(json.dumps(self.state)); os.replace(tmp, self.state_file)  # atomic: a killed worker never leaves half a state

    # -- stages
    @property
    def entry(self) -> dict:
        return self.state["history"][self.state["pointer"]]

    @property
    def stages(self) -> dict:
        return self.entry["stages"]

    def has(self, stage: str) -> bool:
        return stage in self.stages

    def get(self, stage: str) -> Cloud | Mesh:
        if stage not in self.stages: raise KeyError(f"The '{stage}' stage does not exist yet.")
        return model.load(str(self.dir / self.stages[stage]["file"]))

    def commit(self, label: str, op: str, params: dict, new: dict[str, Cloud | Mesh], drop: list[str] | None = None, report: dict | None = None, seconds: float = 0.0, info: dict | None = None) -> dict:
        """Write new stage files and add a history entry (dropping any redo branch). `drop` removes stale downstream stages from the new snapshot."""
        self.reload(); st = self.state; st["counter"] += 1; n = st["counter"]; snap = {k: dict(v) for k, v in self.stages.items()}
        for k in drop or []: snap.pop(k, None)
        for k, obj in new.items():
            fn = f"s{n}_{k}.npz"; model.save(str(self.dir / fn), obj); snap[k] = {"file": fn, "summary": summary(obj)}
        st["history"] = st["history"][: st["pointer"] + 1]; e = {"id": n, "label": label, "op": op, "params": params, "stages": snap, "report": report or {}, "time": time.time(), "seconds": round(seconds, 2)}
        st["history"].append(e); st["pointer"] = len(st["history"]) - 1
        if info is not None: st["info"] = info
        self.write(); self.gc(); return e

    def move(self, delta: int) -> bool:
        self.reload(); p = self.state["pointer"] + delta
        if p < 0 or p >= len(self.state["history"]): return False
        self.state["pointer"] = p; self.write(); return True

    def gc(self) -> None:
        """Delete stage files that no history entry references any more (redo branch discarded)."""
        used = {v["file"] for e in self.state["history"] for v in e["stages"].values()}
        for f in self.dir.glob("*.npz"):
            if f.name not in used: f.unlink(missing_ok=True)

    def rename(self, name: str) -> None:
        self.reload(); self.state["name"] = name; self.write()

    def delete(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)

    # -- save / open project files (.pgproj is a zip of the workspace)
    def export_pgproj(self, path: str) -> None:
        self.reload(); self.state["saved"] = True; self.write()
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(self.state_file, "state.json")
            for f in self.dir.glob("*.npz"): z.write(f, f.name)

    @classmethod
    def import_pgproj(cls, path: str) -> "Project":
        with zipfile.ZipFile(path) as z:
            if "state.json" not in z.namelist(): raise ValueError("Not a PhotoMesh Studio project file (state.json missing).")
            st = json.loads(z.read("state.json")); pid = uuid.uuid4().hex[:12]; d = home() / pid; d.mkdir(parents=True)
            for n in z.namelist():
                if "/" in n or "\\" in n or n.startswith("."): continue  # no path tricks
                if n == "state.json" or n.endswith(".npz"): (d / n).write_bytes(z.read(n))
        st["id"] = pid; (d / "state.json").write_text(json.dumps(st)); p = cls(pid); p.state = st; return p
