"""A small, real rule-based workflow engine. Workflows are validated data (no user code is executed). Actions write to the workspace's own records in the
same database; each step records what actually happened. External actions (e-mail, webhooks) are not supported and are rejected at validation."""
from __future__ import annotations

import re
import time
import uuid
from datetime import date, timedelta

from .db import Rejected, Store
from .schema import SPECS

TODAY = date(2026, 3, 15)  # the demo's fixed 'today' so due dates are reproducible
OPS = {"eq", "ne", "gt", "gte", "lt", "lte", "contains", "exists"}
TYPES = {"condition", "create_task", "set_field", "create_alert", "approval", "delay", "end"}
TRIGGERS = {("crm", "leads"), ("crm", "opps"), ("desk", "tickets"), ("fin", "invoices"), ("inv", "movements"), ("hrm", "leave"), ("proc", "requisitions"), ("fin", "expenses")}
TARGETS = {("crm", "leads"), ("crm", "opps"), ("desk", "tickets"), ("hrm", "leave"), ("proc", "requisitions")}
TEMPLATE = re.compile(r"\{\{\s*([A-Za-z0-9_.]+)\s*\}\}")


def validate_workflow(wf: dict) -> list[str]:
    errs: list[str] = []
    if not isinstance(wf.get("name"), str) or not wf["name"].strip():
        errs.append("the workflow needs a name")
    t = wf.get("trigger")
    if not isinstance(t, dict) or t.get("type") not in ("record_created", "manual"):
        errs.append("the trigger must be record_created or manual")
    elif t["type"] == "record_created" and (t.get("slice"), t.get("coll")) not in TRIGGERS:
        errs.append("the trigger needs a supported record type: " + ", ".join(f"{a}.{b}" for a, b in sorted(TRIGGERS)))
    steps = wf.get("steps")
    if not isinstance(steps, list) or not steps:
        return errs + ["add at least one step"]
    if len(steps) > 20:
        errs.append("a workflow can have at most 20 steps")
    ids = set()
    for i, s in enumerate(steps, 1):
        if not isinstance(s, dict) or s.get("type") not in TYPES:
            errs.append(f"step {i}: unknown step type")
            continue
        if s.get("id") in ids:
            errs.append(f"step {i}: duplicate step id")
        ids.add(s.get("id"))
        c = s.get("config") or {}
        ty = s["type"]
        if ty == "condition":
            if not c.get("field") or c.get("op") not in OPS:
                errs.append(f"step {i}: a condition needs a field and an operator ({', '.join(sorted(OPS))})")
            elif c["op"] != "exists" and "value" not in c:
                errs.append(f"step {i}: a condition needs a value")
        elif ty == "create_task":
            if not isinstance(c.get("subject"), str) or not c["subject"].strip():
                errs.append(f"step {i}: a task needs a subject")
            if not isinstance(c.get("dueDays", 0), int) or not 0 <= c.get("dueDays", 0) <= 365:
                errs.append(f"step {i}: dueDays must be a whole number from 0 to 365")
        elif ty == "set_field":
            if (c.get("slice"), c.get("coll")) not in TARGETS or not c.get("field") or "value" not in c:
                errs.append(f"step {i}: set_field needs a supported target ({', '.join(f'{a}.{b}' for a, b in sorted(TARGETS))}), a field and a value")
            elif c["field"] in ("id",):
                errs.append(f"step {i}: the id cannot be changed")
        elif ty == "create_alert":
            if not isinstance(c.get("title"), str) or not c["title"].strip():
                errs.append(f"step {i}: an alert needs a title")
        elif ty == "approval":
            if not isinstance(c.get("title"), str) or not c["title"].strip():
                errs.append(f"step {i}: an approval needs a title")
        elif ty == "delay":
            if not isinstance(c.get("days"), int) or not 0 <= c["days"] <= 365:
                errs.append(f"step {i}: delay days must be a whole number from 0 to 365")
    return errs


def _get(payload: dict, path: str):
    cur = payload
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            raise KeyError(path)
        cur = cur[part]
    return cur


def _render(tpl: str, payload: dict) -> str:
    return TEMPLATE.sub(lambda m: str(_get(payload, m.group(1))), tpl)


def _cond(c: dict, payload: dict) -> bool:
    try:
        v = _get(payload, c["field"])
    except KeyError:
        if c["op"] == "exists":
            return False
        raise
    op, want = c["op"], c.get("value")
    if op == "exists":
        return v not in (None, "", [])
    if op in ("gt", "gte", "lt", "lte"):
        a, b = float(v), float(want)
        return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    if op == "contains":
        return str(want).lower() in str(v).lower()
    return (str(v) == str(want)) == (op == "eq")


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


class Engine:
    def __init__(self, store: Store):
        self.store = store

    def run(self, ws: str, wf: dict, payload: dict, auto: bool = False, start_at: int = 0, run: dict | None = None) -> dict:
        errs = validate_workflow(wf)
        rid = run["id"] if run else f"run_{uuid.uuid4().hex[:10]}"
        run = run or {"id": rid, "workflowId": wf.get("id", ""), "workflowName": wf.get("name", ""), "startedAt": _now(), "auto": auto, "payload": payload, "steps": [], "status": "running", "error": ""}
        if errs:
            run.update(status="validation_error", error="; ".join(errs), endedAt=_now())
            self._save(ws, run)
            return run
        steps = wf["steps"]
        for i in range(start_at, len(steps)):
            st = steps[i]
            rec = {"stepId": st["id"], "type": st["type"], "at": _now(), "status": "ok", "detail": ""}
            run["steps"] = [s for s in run["steps"] if s["stepId"] != st["id"]] + [rec]
            try:
                stop = self._step(ws, st, payload, run, rec)
            except Exception as e:  # noqa: BLE001
                rec.update(status="failed", detail=self._msg(e))
                run.update(status="failed", error=f"step {i + 1} ({st['type']}): {rec['detail']}", failedStep=i)
                for later in steps[i + 1:]:
                    run["steps"].append({"stepId": later["id"], "type": later["type"], "at": "", "status": "not_run", "detail": "an earlier step failed"})
                break
            if stop == "pause":
                run.update(status="pending_approval", resumeAt=i + 1)
                for later in steps[i + 1:]:
                    run["steps"].append({"stepId": later["id"], "type": later["type"], "at": "", "status": "not_run", "detail": "waiting for the approval decision"})
                break
            if stop == "end":
                run["status"] = "succeeded"
                for later in steps[i + 1:]:
                    run["steps"].append({"stepId": later["id"], "type": later["type"], "at": "", "status": "not_run", "detail": "the workflow ended"})
                break
            if stop == "stop":
                run.update(status="stopped_condition")
                for later in steps[i + 1:]:
                    run["steps"].append({"stepId": later["id"], "type": later["type"], "at": "", "status": "not_run", "detail": "the condition was not met"})
                break
        else:
            run["status"] = "succeeded"
        if run["status"] in ("succeeded", "failed", "stopped_condition"):
            run["endedAt"] = _now()
        self._save(ws, run)
        return run

    @staticmethod
    def _msg(e: Exception) -> str:
        if isinstance(e, KeyError):
            return f"the payload has no field {e.args[0]!r}"
        if isinstance(e, Rejected):
            return "the change was refused: " + "; ".join(e.errors[:2])
        if isinstance(e, (ValueError, TypeError)):
            return f"invalid value: {e}"
        return f"{type(e).__name__}"

    def _step(self, ws: str, st: dict, payload: dict, run: dict, rec: dict) -> str | None:
        ty, c = st["type"], st.get("config") or {}
        if ty == "condition":
            ok = _cond(c, payload)
            rec["detail"] = f"{c['field']} {c['op']} {c.get('value', '')}: {'met' if ok else 'not met'}"
            if not ok:
                rec["status"] = "stopped"
                return "stop"
        elif ty == "create_task":
            subject = _render(c["subject"], payload)
            due = (TODAY + timedelta(days=int(c.get("dueDays", 0)))).isoformat()
            tid = f"act_{uuid.uuid4().hex[:8]}"
            self.store.apply(ws, "crm", upsert={"activities": [{"id": tid, "type": "Task", "subject": subject[:200], "due": due, "done": False, "ownerId": str(c.get("ownerId", "")), "source": run["id"]}]})
            rec["detail"] = f"created task {tid} “{subject[:80]}” due {due} in CRM activities"
        elif ty == "set_field":
            sl, coll = c["slice"], c["coll"]
            rid = _get(payload, c.get("idField", "id"))
            cur = next((r for r in self.store.slice(ws, sl).get(coll, []) if r["id"] == rid), None)
            if cur is None:
                raise KeyError(f"{sl}.{coll} record {rid} does not exist in this workspace")
            new = dict(cur)
            new[c["field"]] = c["value"]
            self.store.apply(ws, sl, upsert={coll: [new]})
            rec["detail"] = f"set {sl}.{coll}[{rid}].{c['field']} = {c['value']!r} (was {cur.get(c['field'])!r})"
        elif ty == "create_alert":
            title = _render(c["title"], payload)
            aid = f"al_{uuid.uuid4().hex[:8]}"
            self.store.apply(ws, "flow", upsert={"alerts": [{"id": aid, "title": title[:200], "message": _render(c.get("message", ""), payload)[:500], "at": _now(), "runId": run["id"]}]})
            rec["detail"] = f"created alert {aid} “{title[:80]}”"
        elif ty == "approval":
            aid = f"apr_{uuid.uuid4().hex[:8]}"
            self.store.apply(ws, "flow", upsert={"approvals": [{"id": aid, "runId": run["id"], "title": _render(c["title"], payload)[:200], "status": "Pending", "createdAt": _now(), "note": ""}]})
            rec.update(status="waiting", detail=f"approval {aid} is waiting for a decision")
            run["approvalId"] = aid
            return "pause"
        elif ty == "delay":
            rec.update(status="skipped_demo", detail=f"a {c['days']}-day delay is recorded but not waited for in this demo")
        elif ty == "end":
            rec["detail"] = "workflow ended"
            return "end"
        return None

    def _save(self, ws: str, run: dict) -> None:
        self.store.apply(ws, "flow", upsert={"runs": [run]})

    def decide(self, ws: str, approval_id: str, decision: str, note: str) -> dict:
        fl = self.store.slice(ws, "flow")
        ap = next((a for a in fl.get("approvals", []) if a["id"] == approval_id), None)
        if not ap:
            raise Rejected(["approval not found"], 404)
        if ap["status"] != "Pending":
            raise Rejected(["this approval has already been decided"], 409)
        run = next((r for r in fl.get("runs", []) if r["id"] == ap["runId"]), None)
        wf = next((w for w in fl.get("workflows", []) if run and w["id"] == run["workflowId"]), None)
        ap.update(status="Approved" if decision == "approve" else "Rejected", decidedAt=_now(), note=note[:300])
        self.store.apply(ws, "flow", upsert={"approvals": [ap]})
        if not run or not wf:
            raise Rejected(["the run or workflow no longer exists"], 409)
        if decision != "approve":
            run.update(status="rejected", endedAt=_now(), error="the approval was rejected")
            for s in run["steps"]:
                if s["status"] == "waiting":
                    s.update(status="rejected", detail="rejected")
            self._save(ws, run)
            return run
        for s in run["steps"]:
            if s["status"] == "waiting":
                s.update(status="ok", detail="approved")
        run["steps"] = [s for s in run["steps"] if s["status"] != "not_run"]
        run["status"] = "running"
        return self.run(ws, wf, run["payload"], run.get("auto", False), run.get("resumeAt", len(wf["steps"])), run)

    def retry(self, ws: str, run_id: str) -> dict:
        fl = self.store.slice(ws, "flow")
        run = next((r for r in fl.get("runs", []) if r["id"] == run_id), None)
        if not run or run["status"] != "failed":
            raise Rejected(["only a failed run can be retried"], 409)
        wf = next((w for w in fl.get("workflows", []) if w["id"] == run["workflowId"]), None)
        if not wf:
            raise Rejected(["the workflow no longer exists"], 409)
        i = run.get("failedStep", 0)
        if wf["steps"][i]["type"] not in ("set_field", "create_alert", "condition"):
            raise Rejected(["this step type is not safe to retry automatically because it could create a duplicate"], 409)
        run["status"], run["error"] = "running", ""
        return self.run(ws, wf, run["payload"], run.get("auto", False), i, run)

    def on_created(self, ws: str, sl: str, coll: str, rec: dict) -> list[dict]:
        out = []
        for wf in self.store.slice(ws, "flow").get("workflows", []):
            t = wf.get("trigger", {})
            if wf.get("active") and t.get("type") == "record_created" and (t.get("slice"), t.get("coll")) == (sl, coll):
                out.append(self.run(ws, wf, rec, auto=True))
        return out
