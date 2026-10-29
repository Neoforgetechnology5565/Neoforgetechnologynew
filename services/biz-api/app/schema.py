"""Field specifications and cross-record rules. Specs: s string, s! non-empty string, n number, n+ number >= 0, i+ integer >= 0, b boolean, d ISO date (YYYY-MM-DD),
d? ISO date or empty, t? HH:MM or empty, email (valid or empty), e:A|B|C enumeration, a list, o object. A '?' suffix on the key makes the field optional."""
from __future__ import annotations

import re
from datetime import date

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME = re.compile(r"^([0-3]\d|4[0-7]):[0-5]\d$")  # hours may run past 24 for shifts that end after midnight (the demo's own convention)
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _date_ok(v) -> bool:
    if not isinstance(v, str) or not DATE.match(v):
        return False
    try:
        date.fromisoformat(v)
        return True
    except ValueError:
        return False


def check_field(v, spec: str) -> str | None:
    if spec == "s":
        return None if isinstance(v, str) else "must be text"
    if spec == "s!":
        return None if isinstance(v, str) and v.strip() else "is required"
    if spec in ("n", "n+"):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or abs(v) == float("inf"):
            return "must be a number"
        return "must be 0 or more" if spec == "n+" and v < 0 else None
    if spec == "i+":
        return None if isinstance(v, int) and not isinstance(v, bool) and v >= 0 else "must be a whole number, 0 or more"
    if spec == "b":
        return None if isinstance(v, bool) else "must be true or false"
    if spec == "d":
        return None if _date_ok(v) else "must be a valid date (YYYY-MM-DD)"
    if spec == "d?":
        return None if v == "" or _date_ok(v) else "must be a valid date (YYYY-MM-DD) or empty"
    if spec == "t?":
        return None if v == "" or (isinstance(v, str) and TIME.match(v)) else "must be a time HH:MM or empty"
    if spec == "email":
        return None if v == "" or (isinstance(v, str) and EMAIL.match(v) and len(v) <= 200) else "is not a valid e-mail address"
    if spec == "a":
        return None if isinstance(v, list) else "must be a list"
    if spec == "o":
        return None if isinstance(v, dict) else "must be an object"
    if spec.startswith("e:"):
        return None if v in spec[2:].split("|") else f"must be one of {', '.join(spec[2:].split('|'))}"
    return None


def validate_record(spec: dict[str, str], rec: dict) -> list[str]:
    errs = []
    for k, sp in spec.items():
        optional = k.endswith("?")
        key = k.rstrip("?")
        if key not in rec or rec[key] is None:
            if not optional:
                errs.append(f"{key} is required")
            continue
        e = check_field(rec[key], sp)
        if e:
            errs.append(f"{key} {e}")
    return errs


STATUS_TS = "e:New|Open|Pending customer|Resolved|Closed"
SPECS: dict[tuple[str, str], dict[str, str]] = {
    ("crm", "companies"): {"name": "s!", "industry?": "s", "ownerId?": "s"},
    ("crm", "contacts"): {"name": "s!", "email?": "email", "companyId?": "s", "lastContact?": "d?"},
    ("crm", "leads"): {"name": "s!", "email?": "email", "status": "e:New|Contacted|Qualified|Unqualified", "score": "n+", "value": "n+", "createdAt": "d"},
    ("crm", "opps"): {"name": "s!", "value": "n+", "stage": "e:New Lead|Qualified|Discovery|Proposal|Negotiation|Won|Lost", "closeDate?": "d?", "createdAt": "d", "notes?": "a"},
    ("crm", "activities"): {"type": "e:Call|Email|Meeting|Demo|Task", "subject": "s!", "due": "d", "done": "b"},
    ("crm", "quotes"): {"number": "s!", "oppId": "s!", "lines": "a", "discount": "n+", "tax": "n+", "status": "e:Draft|Sent|Accepted|Declined"},
    ("fin", "accounts"): {"code": "s!", "name": "s!", "type": "e:Asset|Liability|Equity|Revenue|Expense"},
    ("fin", "invoices"): {"number": "s!", "date": "d", "due": "d", "lines": "a", "taxRate": "n+", "draft": "b", "payments": "a"},
    ("fin", "bills"): {"number": "s!", "supplier": "s!", "date": "d", "due": "d", "lines": "a", "taxRate": "n+", "payments": "a"},
    ("fin", "expenses"): {"date": "d", "accountId": "s!", "vendor": "s!", "amount": "n+"},
    ("hrm", "employees"): {"name": "s!", "email?": "email", "dept": "s!", "position?": "s", "status": "e:Active|Probation|On leave|Resigned", "type": "e:Full-time|Part-time|Contract", "hireDate": "d", "salary": "n+"},
    ("hrm", "departments"): {"name": "s!", "budget?": "n+"},
    ("hrm", "positions"): {"title": "s!", "openings?": "i+"},
    ("hrm", "leave"): {"empId": "s!", "type": "e:Annual|Sick|Parental|Unpaid", "from": "d", "to": "d", "days": "n+", "status": "e:Pending|Approved|Rejected"},
    ("hrm", "reviews"): {"empId": "s!", "rating": "n+", "status": "e:Draft|Completed"},
    ("pay", "attendance"): {"empId": "s!", "date": "d", "in": "t?", "out": "t?"},
    ("inv", "products"): {"sku": "s!", "name": "s!", "cost": "n+", "price": "n+", "reorder": "n+"},
    ("inv", "warehouses"): {"name": "s!"},
    ("inv", "movements"): {"date": "d", "productId": "s!", "whId": "s!", "type": "e:Opening|Receipt|Issue|Transfer out|Transfer in|Adjustment", "qty": "n"},
    ("proc", "suppliers"): {"name": "s!", "status": "e:Active|On hold", "rating?": "n+"},
    ("proc", "requisitions"): {"number": "s!", "date": "d", "status": "e:Draft|Submitted|Approved|Rejected|Converted", "lines": "a"},
    ("proc", "orders"): {"number": "s!", "supplierId": "s!", "date": "d", "status": "e:Draft|Sent|Partially received|Received|Cancelled", "lines": "a"},
    ("desk", "tickets"): {"subject": "s!", "channel": "e:Email|Chat|Phone|Portal", "priority": "e:Low|Normal|High|Urgent", "status": STATUS_TS, "messages": "a"},
    ("mkt", "contacts"): {"name": "s!", "email": "email", "status": "e:Subscribed|Unsubscribed|Bounced", "score?": "n+"},
    ("mkt", "segments"): {"name": "s!", "match": "e:all|any", "rules": "a"},
    ("mkt", "campaigns"): {"name": "s!", "status": "e:Draft|Scheduled|Sent (simulated)|Cancelled", "template": "o"},
    ("proj", "projects"): {"code": "s!", "name": "s!", "budget": "n+", "status": "e:Planning|Active|On hold|Completed"},
    ("proj", "tasks"): {"projectId": "s!", "title": "s!", "status": "e:Backlog|To do|In progress|Review|Done", "priority": "e:Low|Medium|High|Critical", "est": "n+"},
    ("proj", "time"): {"projectId": "s!", "empId": "s!", "date": "d", "hours": "n+"},
    ("exec", "approvals"): {"type": "e:Discount|Purchase|Expense|Budget change|Hiring", "title": "s!", "amount": "n+", "status": "e:Pending|Approved|Rejected"},
    ("flow", "workflows"): {"name": "s!", "active": "b", "trigger": "o", "steps": "a"},
}
SLICES = {"crm", "fin", "hrm", "pay", "inv", "proc", "desk", "mkt", "proj", "exec", "activity", "flow", "bi"}


def stock_map(movements: list[dict]) -> dict[tuple[str, str], float]:
    m: dict[tuple[str, str], float] = {}
    for x in movements:
        k = (x.get("productId", ""), x.get("whId", ""))
        m[k] = round(m.get(k, 0) + float(x.get("qty", 0)), 6)
    return m


def doc_total(d: dict) -> float:
    sub = sum(float(l.get("qty", 0)) * float(l.get("price", 0)) for l in d.get("lines", []))
    return round(round(sub, 2) + round(round(sub, 2) * float(d.get("taxRate", 0)), 2), 2)


def check_slice(slice_: str, s: dict, others: dict[str, dict] | None = None) -> list[str]:
    """Cross-record rules over the whole slice after a change. Returns human-readable violations."""
    errs: list[str] = []
    g = lambda k: s.get(k, []) if isinstance(s.get(k, []), list) else []  # noqa: E731
    if slice_ == "inv":
        prods, whs = {p["id"] for p in g("products")}, {w["id"] for w in g("warehouses")}
        for m in g("movements"):
            if m["productId"] not in prods:
                errs.append(f"movement {m['id']}: unknown product {m['productId']}")
            if m["whId"] not in whs:
                errs.append(f"movement {m['id']}: unknown warehouse {m['whId']}")
            if m["qty"] == 0:
                errs.append(f"movement {m['id']}: quantity cannot be zero")
            sign_ok = (m["type"] in ("Issue", "Transfer out") and m["qty"] < 0) or (m["type"] in ("Receipt", "Transfer in", "Opening") and m["qty"] > 0) or m["type"] == "Adjustment"
            if not sign_ok:
                errs.append(f"movement {m['id']}: {m['type']} must {'reduce' if m['type'] in ('Issue', 'Transfer out') else 'increase'} stock")
        for (p, w), q in stock_map(g("movements")).items():
            if q < -1e-9:
                errs.append(f"stock of {p} in {w} would be {q:g}: negative stock is not allowed")
        skus = [p["sku"] for p in g("products")]
        if len(skus) != len(set(skus)):
            errs.append("SKUs must be unique")
    elif slice_ == "fin":
        for coll in ("invoices", "bills"):
            nums = [d["number"] for d in g(coll)]
            if len(nums) != len(set(nums)):
                errs.append(f"{coll} numbers must be unique")
            for d in g(coll):
                for p in d.get("payments", []):
                    if not isinstance(p, dict) or not isinstance(p.get("amount"), (int, float)) or p["amount"] <= 0 or not _date_ok(p.get("date")):
                        errs.append(f"{d['number']}: a payment needs a positive amount and a valid date")
                paid = sum(p.get("amount", 0) for p in d.get("payments", []) if isinstance(p, dict))
                if paid > doc_total(d) + 0.005:
                    errs.append(f"{d['number']}: payments ({paid:.2f}) exceed the total ({doc_total(d):.2f})")
                for l in d.get("lines", []):
                    if not isinstance(l, dict) or not isinstance(l.get("qty"), (int, float)) or not isinstance(l.get("price"), (int, float)) or l["qty"] < 0 or l["price"] < 0:
                        errs.append(f"{d['number']}: every line needs a quantity and price of 0 or more")
                        break
    elif slice_ == "proc":
        for o in g("orders"):
            lines = o.get("lines", [])
            rec = [float(l.get("received", 0)) for l in lines]
            if any(r < 0 or r > float(l.get("qty", 0)) + 1e-9 for r, l in zip(rec, lines)):
                errs.append(f"{o['number']}: received quantity must be between 0 and the ordered quantity")
            full = bool(lines) and all(r >= float(l.get("qty", 0)) for r, l in zip(rec, lines))
            if o["status"] == "Received" and not full:
                errs.append(f"{o['number']}: cannot be Received until every line is fully received")
            if o["status"] in ("Draft", "Cancelled") and any(r > 0 for r in rec):
                errs.append(f"{o['number']}: a {o['status']} order cannot have received goods")
            if o["status"] == "Partially received" and not any(r > 0 for r in rec):
                errs.append(f"{o['number']}: Partially received needs received goods")
        sup = {x["id"] for x in g("suppliers")}
        for o in g("orders"):
            if o["supplierId"] not in sup:
                errs.append(f"{o['number']}: unknown supplier")
        for r in g("requisitions"):
            if r["status"] == "Converted" and not r.get("poId"):
                errs.append(f"{r['number']}: Converted requires a purchase order")
    elif slice_ == "hrm":
        emp = {e["id"] for e in g("employees")}
        for e in g("employees"):
            if e.get("managerId") and e["managerId"] not in emp:
                errs.append(f"{e['name']}: manager does not exist")
        for l in g("leave"):
            if l["empId"] not in emp:
                errs.append(f"leave {l['id']}: unknown employee")
            if l["to"] < l["from"]:
                errs.append(f"leave {l['id']}: end date is before the start date")
    elif slice_ == "crm":
        co = {c["id"] for c in g("companies")}
        for o in g("opps"):
            if o.get("companyId") and o["companyId"] not in co:
                errs.append(f"opportunity {o['name']}: unknown company")
        for c in g("contacts"):
            if c.get("companyId") and c["companyId"] not in co:
                errs.append(f"contact {c['name']}: unknown company")
    elif slice_ == "pay" and others and "hrm" in others:
        emp = {e["id"] for e in others["hrm"].get("employees", [])}
        for a in g("attendance"):
            if a["empId"] not in emp:
                errs.append(f"attendance {a['id']}: unknown employee {a['empId']}")
    elif slice_ == "proj":
        pr = {p["id"] for p in g("projects")}
        for t in g("time"):
            if t["projectId"] not in pr:
                errs.append(f"time entry {t['id']}: unknown project")
            if t["hours"] > 24:
                errs.append(f"time entry {t['id']}: more than 24 hours in a day")
    return errs
