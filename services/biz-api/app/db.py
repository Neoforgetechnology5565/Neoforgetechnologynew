"""SQLite persistence: one row per record (JSON body), one row per scalar, grouped by workspace and slice. All writes run in one transaction with validation."""
from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
from pathlib import Path

from .schema import SLICES, SPECS, check_slice, validate_record

WS = re.compile(r"^[0-9a-f]{16,32}$")
NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,40}$")


class Rejected(Exception):
    def __init__(self, errors: list[str], status: int = 422):
        super().__init__("; ".join(errors[:3]))
        self.errors, self.status = errors, status


def is_collection(v) -> bool:
    return isinstance(v, list) and all(isinstance(x, dict) and isinstance(x.get("id"), str) and x["id"] for x in v) and len(v) > 0


class Store:
    def __init__(self, path: Path, max_records: int, max_ws: int, ttl_days: int):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path, self.max_records, self.max_ws, self.ttl = path, max_records, max_ws, ttl_days
        self.lock = threading.RLock()
        self.c = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self.c.row_factory = sqlite3.Row
        self.c.executescript("""
            PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS ws(id TEXT PRIMARY KEY, created REAL NOT NULL, touched REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS rec(ws TEXT NOT NULL, slice TEXT NOT NULL, coll TEXT NOT NULL, rid TEXT NOT NULL, pos INTEGER NOT NULL, body TEXT NOT NULL, upd REAL NOT NULL,
                PRIMARY KEY(ws, slice, coll, rid), FOREIGN KEY(ws) REFERENCES ws(id) ON DELETE CASCADE);
            CREATE TABLE IF NOT EXISTS scal(ws TEXT NOT NULL, slice TEXT NOT NULL, k TEXT NOT NULL, body TEXT NOT NULL,
                PRIMARY KEY(ws, slice, k), FOREIGN KEY(ws) REFERENCES ws(id) ON DELETE CASCADE);
            CREATE INDEX IF NOT EXISTS rec_slice ON rec(ws, slice, coll, pos);
        """)
        self.cleanup()

    # ---- workspaces -------------------------------------------------------------------------------------------------
    def cleanup(self) -> None:
        with self.lock:
            self.c.execute("DELETE FROM ws WHERE touched < ?", (time.time() - self.ttl * 86400,))

    def ensure_ws(self, ws: str) -> None:
        if not WS.match(ws or ""):
            raise Rejected(["workspace id must be 16-32 hexadecimal characters"], 400)
        now = time.time()
        with self.lock:
            r = self.c.execute("SELECT id FROM ws WHERE id=?", (ws,)).fetchone()
            if r:
                self.c.execute("UPDATE ws SET touched=? WHERE id=?", (now, ws))
                return
            if self.c.execute("SELECT COUNT(*) FROM ws").fetchone()[0] >= self.max_ws:
                raise Rejected(["the demo server has reached its workspace limit; try again later"], 503)
            self.c.execute("INSERT INTO ws(id,created,touched) VALUES(?,?,?)", (ws, now, now))

    def delete_ws(self, ws: str) -> None:
        with self.lock:
            self.c.execute("DELETE FROM ws WHERE id=?", (ws,))

    # ---- reading ----------------------------------------------------------------------------------------------------
    def slice(self, ws: str, sl: str) -> dict:
        out: dict = {}
        for r in self.c.execute("SELECT coll, body FROM rec WHERE ws=? AND slice=? ORDER BY coll, pos", (ws, sl)):
            out.setdefault(r["coll"], []).append(json.loads(r["body"]))
        for r in self.c.execute("SELECT k, body FROM scal WHERE ws=? AND slice=?", (ws, sl)):
            out[r["k"]] = json.loads(r["body"])
        return out

    def state(self, ws: str) -> dict:
        slices = [r["slice"] for r in self.c.execute("SELECT DISTINCT slice FROM (SELECT slice FROM rec WHERE ws=? UNION SELECT slice FROM scal WHERE ws=?)", (ws, ws))]
        return {s: self.slice(ws, s) for s in slices}

    def count(self, ws: str) -> int:
        return self.c.execute("SELECT COUNT(*) FROM rec WHERE ws=?", (ws,)).fetchone()[0]

    # ---- writing ----------------------------------------------------------------------------------------------------
    def apply(self, ws: str, sl: str, upsert: dict | None = None, delete: dict | None = None, order: dict | None = None, scalars: dict | None = None,
              drop_scalars: list | None = None, replace: bool = False) -> dict:
        """Apply a batch atomically. Validates every record and the resulting slice; on any problem nothing is written."""
        if sl not in SLICES:
            raise Rejected([f"unknown slice '{sl}'"], 404)
        upsert, delete, order, scalars = upsert or {}, delete or {}, order or {}, scalars or {}
        errors: list[str] = []
        for coll, recs in upsert.items():
            if not NAME.match(coll) or not isinstance(recs, list):
                errors.append(f"invalid collection '{coll}'")
                continue
            spec = SPECS.get((sl, coll))
            for r in recs:
                if not isinstance(r, dict) or not isinstance(r.get("id"), str) or not r["id"] or len(r["id"]) > 80:
                    errors.append(f"{coll}: every record needs a text id")
                    continue
                if spec:
                    errors += [f"{coll} {r['id']}: {e}" for e in validate_record(spec, r)]
        for k in scalars:
            if not NAME.match(k):
                errors.append(f"invalid field name '{k}'")
        if errors:
            raise Rejected(errors[:25])
        with self.lock:
            self.ensure_ws(ws)
            self.c.execute("BEGIN IMMEDIATE")
            try:
                if replace:
                    self.c.execute("DELETE FROM rec WHERE ws=? AND slice=?", (ws, sl))
                    self.c.execute("DELETE FROM scal WHERE ws=? AND slice=?", (ws, sl))
                now = time.time()
                created: list[tuple[str, str]] = []
                for coll, recs in upsert.items():
                    base = self.c.execute("SELECT COALESCE(MAX(pos),-1) FROM rec WHERE ws=? AND slice=? AND coll=?", (ws, sl, coll)).fetchone()[0]
                    for i, r in enumerate(recs):
                        ex = self.c.execute("SELECT pos FROM rec WHERE ws=? AND slice=? AND coll=? AND rid=?", (ws, sl, coll, r["id"])).fetchone()
                        if ex:
                            self.c.execute("UPDATE rec SET body=?, upd=? WHERE ws=? AND slice=? AND coll=? AND rid=?", (json.dumps(r, separators=(",", ":")), now, ws, sl, coll, r["id"]))
                        else:
                            base += 1
                            created.append((coll, r["id"]))
                            self.c.execute("INSERT INTO rec(ws,slice,coll,rid,pos,body,upd) VALUES(?,?,?,?,?,?,?)", (ws, sl, coll, r["id"], base, json.dumps(r, separators=(",", ":")), now))
                for coll, ids in delete.items():
                    for rid in ids:
                        self.c.execute("DELETE FROM rec WHERE ws=? AND slice=? AND coll=? AND rid=?", (ws, sl, coll, rid))
                for coll, ids in order.items():
                    for pos, rid in enumerate(ids):
                        self.c.execute("UPDATE rec SET pos=? WHERE ws=? AND slice=? AND coll=? AND rid=?", (pos, ws, sl, coll, rid))
                for k, v in scalars.items():
                    self.c.execute("INSERT INTO scal(ws,slice,k,body) VALUES(?,?,?,?) ON CONFLICT(ws,slice,k) DO UPDATE SET body=excluded.body", (ws, sl, k, json.dumps(v, separators=(",", ":"))))
                for k in drop_scalars or []:
                    self.c.execute("DELETE FROM scal WHERE ws=? AND slice=? AND k=?", (ws, sl, k))
                if self.count(ws) > self.max_records:
                    raise Rejected(["this workspace holds too many records"], 413)
                after = self.slice(ws, sl)
                others = {o: self.slice(ws, o) for o in ("hrm",) if o != sl} if sl == "pay" else None
                violations = check_slice(sl, after, others)
                if violations:
                    raise Rejected(violations[:25])
                self.c.execute("COMMIT")
                return {"ok": True, "created": created}
            except BaseException:
                self.c.execute("ROLLBACK")
                raise

    def clear_slice(self, ws: str, sl: str) -> None:
        with self.lock:
            self.c.execute("DELETE FROM rec WHERE ws=? AND slice=?", (ws, sl))
            self.c.execute("DELETE FROM scal WHERE ws=? AND slice=?", (ws, sl))
