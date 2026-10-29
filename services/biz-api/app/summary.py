"""Server-side summaries computed from the stored records of a workspace. Nothing here is a constant: every figure is derived from rows."""
from __future__ import annotations

from collections import Counter, defaultdict

from .schema import doc_total, stock_map

TODAY = "2026-03-15"  # the demo's fixed 'today' (same as the front end) so overdue figures are reproducible


def r2(x: float) -> float:
    return round(x + 1e-9, 2)


def crm(s: dict) -> dict:
    opps, leads, acts = s.get("opps", []), s.get("leads", []), s.get("activities", [])
    open_ = [o for o in opps if o["stage"] not in ("Won", "Lost")]
    won, lost = [o for o in opps if o["stage"] == "Won"], [o for o in opps if o["stage"] == "Lost"]
    by_stage = {st: {"count": sum(1 for o in opps if o["stage"] == st), "value": r2(sum(o["value"] for o in opps if o["stage"] == st))} for st in ("New Lead", "Qualified", "Discovery", "Proposal", "Negotiation", "Won", "Lost")}
    closed = len(won) + len(lost)
    return {"leads": len(leads), "qualified_leads": sum(1 for l in leads if l["status"] == "Qualified"), "open_opportunities": len(open_), "open_pipeline_value": r2(sum(o["value"] for o in open_)),
            "won": len(won), "won_value": r2(sum(o["value"] for o in won)), "lost": len(lost), "win_rate": round(len(won) / closed, 4) if closed else None, "by_stage": by_stage,
            "activities_open": sum(1 for a in acts if not a["done"]), "activities_overdue": sum(1 for a in acts if not a["done"] and a["due"] < TODAY)}


def fin(s: dict) -> dict:
    inv, bills, exp = s.get("invoices", []), s.get("bills", []), s.get("expenses", [])
    paid = lambda d: sum(p["amount"] for p in d.get("payments", []))  # noqa: E731
    live = [i for i in inv if not i.get("draft")]
    ar = [(i, doc_total(i) - paid(i)) for i in live]
    ap = [(b, doc_total(b) - paid(b)) for b in bills]
    revenue = sum(sum(float(l["qty"]) * float(l["price"]) for l in i["lines"]) for i in live)
    cost = sum(sum(float(l["qty"]) * float(l["price"]) for l in b["lines"]) for b in bills) + sum(e["amount"] for e in exp)
    return {"invoiced_net": r2(revenue), "expenses_and_bills_net": r2(cost), "net_result": r2(revenue - cost), "receivable": r2(sum(b for _, b in ar if b > 0.004)), "payable": r2(sum(b for _, b in ap if b > 0.004)),
            "cash_received": r2(sum(paid(i) for i in live)), "cash_paid": r2(sum(paid(b) for b in bills) + sum(e["amount"] for e in exp)),
            "invoices": {"draft": len(inv) - len(live), "paid": sum(1 for i, b in ar if b <= 0.004), "overdue": sum(1 for i, b in ar if b > 0.004 and i["due"] < TODAY), "open": sum(1 for i, b in ar if b > 0.004 and i["due"] >= TODAY)},
            "expenses_by_account": {k: r2(v) for k, v in sorted(_sum_by(exp, "accountId", "amount").items())}}


def _sum_by(rows: list[dict], key: str, val: str) -> dict:
    d: dict = defaultdict(float)
    for r in rows:
        d[r[key]] += r[val]
    return d


def inv(s: dict) -> dict:
    prods, moves = s.get("products", []), s.get("movements", [])
    sm = stock_map(moves)
    per = {}
    for p in prods:
        q = sum(v for (pid, _), v in sm.items() if pid == p["id"])
        per[p["id"]] = {"sku": p["sku"], "name": p["name"], "on_hand": q, "reorder": p["reorder"], "level": "Out of stock" if q <= 0 else "Low" if q <= p["reorder"] else "OK", "value_at_standard_cost": r2(q * p["cost"])}
    wh = defaultdict(float)
    for (pid, w), q in sm.items():
        wh[w] += q
    return {"products": len(prods), "movements": len(moves), "units_on_hand": sum(v["on_hand"] for v in per.values()), "low_stock": [k for k, v in per.items() if v["level"] == "Low"], "out_of_stock": [k for k, v in per.items() if v["level"] == "Out of stock"],
            "value_at_standard_cost": r2(sum(v["value_at_standard_cost"] for v in per.values())), "by_warehouse_units": dict(wh), "per_product": per,
            "valuation_method": "standard cost (the product's unit cost); the front end also shows a weighted-average valuation from the movement ledger"}


def proc(s: dict) -> dict:
    orders = s.get("orders", [])
    tot = lambda o: sum(l["qty"] * l["price"] for l in o["lines"])  # noqa: E731
    return {"suppliers": len(s.get("suppliers", [])), "requisitions": dict(Counter(r["status"] for r in s.get("requisitions", []))), "orders_by_status": dict(Counter(o["status"] for o in orders)),
            "ordered_value": r2(sum(tot(o) for o in orders if o["status"] != "Cancelled")), "received_value": r2(sum(sum(l["received"] * l["price"] for l in o["lines"]) for o in orders)),
            "outstanding_value": r2(sum(sum((l["qty"] - l["received"]) * l["price"] for l in o["lines"]) for o in orders if o["status"] in ("Sent", "Partially received")))}


def desk(s: dict) -> dict:
    t = s.get("tickets", [])
    open_ = [x for x in t if x["status"] not in ("Resolved", "Closed")]
    res = [x for x in t if x.get("resolution", {}) and x["status"] in ("Resolved", "Closed")]
    hrs = []
    for x in res:
        try:
            a, b = x["created"], x["resolution"]["at"]
            hrs.append((_ts(b) - _ts(a)) / 3600)
        except Exception:  # noqa: BLE001
            pass
    return {"tickets": len(t), "open": len(open_), "by_priority": dict(Counter(x["priority"] for x in open_)), "by_category": dict(Counter(x["category"] for x in t)), "by_assignee_open": dict(Counter(x["assigneeId"] for x in open_)),
            "overdue": sum(1 for x in open_ if x.get("due", "9999") < TODAY), "resolved": len(res), "avg_resolution_hours": round(sum(hrs) / len(hrs), 2) if hrs else None}


def _ts(v: str) -> float:
    from datetime import datetime
    return datetime.fromisoformat(v.replace(" ", "T")[:19]).timestamp()


def hrm(s: dict) -> dict:
    e = s.get("employees", [])
    return {"headcount": sum(1 for x in e if x["status"] != "Resigned"), "by_department": dict(Counter(x["dept"] for x in e if x["status"] != "Resigned")), "by_status": dict(Counter(x["status"] for x in e)),
            "pending_leave": sum(1 for l in s.get("leave", []) if l["status"] == "Pending"), "payroll_base_total": r2(sum(x["salary"] for x in e if x["status"] != "Resigned")), "open_positions": sum(p.get("openings", 0) for p in s.get("positions", []))}


def pay(s: dict) -> dict:
    hours: dict = defaultdict(float)
    missing = 0
    for a in s.get("attendance", []):
        if not a.get("in") or not a.get("out"):
            missing += 1
            continue
        h1, m1 = map(int, a["in"].split(":")); h2, m2 = map(int, a["out"].split(":"))
        mins = (h2 * 60 + m2) - (h1 * 60 + m1)
        if mins > 0:
            hours[a["empId"]] += mins / 60
    return {"records": len(s.get("attendance", [])), "missing_clock_out": missing, "worked_hours_by_employee": {k: round(v, 2) for k, v in sorted(hours.items())}, "total_worked_hours": round(sum(hours.values()), 2),
            "note": "Gross worked hours between clock-in and clock-out, before breaks; payroll rules are the demonstration assumptions configured in the app, not legislation."}


def mkt(s: dict) -> dict:
    c = s.get("contacts", [])
    return {"contacts": len(c), "subscribed": sum(1 for x in c if x["status"] == "Subscribed"), "suppressed": sum(1 for x in c if x["status"] != "Subscribed"), "campaigns_by_status": dict(Counter(x["status"] for x in s.get("campaigns", []))),
            "metrics_note": "Campaign opens and clicks in this demo are SIMULATED; no e-mail is sent."}


def proj(s: dict) -> dict:
    hrs = _sum_by(s.get("time", []), "projectId", "hours")
    return {"projects": len(s.get("projects", [])), "by_status": dict(Counter(p["status"] for p in s.get("projects", []))), "tasks_by_status": dict(Counter(t["status"] for t in s.get("tasks", []))), "hours_by_project": {k: round(v, 2) for k, v in hrs.items()}}


def exec_(s: dict) -> dict:
    a = s.get("approvals", [])
    return {"approvals_by_status": dict(Counter(x["status"] for x in a)), "pending_value": r2(sum(x["amount"] for x in a if x["status"] == "Pending"))}


SUMMARIES = {"crm": crm, "fin": fin, "inv": inv, "proc": proc, "desk": desk, "hrm": hrm, "pay": pay, "mkt": mkt, "proj": proj, "exec": exec_}
