"""Structured fields from item text by explicit rules (regular expressions and a small label list), checks between them, and a keyword document classifier.
Nothing here is learned. Every field says which rule produced it and whether the text came from the PDF's own text layer or from OCR."""
from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation

MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
MON = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
RE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
# spaces are optional between the parts because the OCR model sometimes drops them ("14March2024")
RE_DMY_TEXT = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s*{MON}\.?,?\s*(\d{{4}})\b", re.I)
RE_MDY_TEXT = re.compile(rf"\b{MON}\.?\s*(\d{{1,2}})(?:st|nd|rd|th)?,?\s*(\d{{4}})\b", re.I)
RE_NUM_DATE = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b")
RE_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
CUR = {"£": "GBP", "$": "USD", "€": "EUR", "GBP": "GBP", "USD": "USD", "EUR": "EUR"}
RE_AMOUNT = re.compile(r"(?P<cur>[£$€]|\bUSD|\bEUR|\bGBP)\s?(?P<num>-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)|(?P<num2>-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+\.\d{2})\s?(?P<cur2>USD|EUR|GBP)\b")
RE_PLAIN_AMOUNT = re.compile(r"^-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$|^-?\d+(?:\.\d{1,2})?$")
RE_PHONE = re.compile(r"(?<![\w/])\+?\d[\d\s().-]{6,18}\d(?!\w)")
RE_KV = re.compile(r"^\s*(?P<label>[A-Za-z][A-Za-z0-9 .#/&()'%-]{1,40}?)\s*:\s*(?P<value>\S.*)$")
AMOUNT_LABELS = re.compile(r"\b(total|subtotal|sub-total|vat|tax|amount|balance|due|price|paid|deposit|fee|charge)\b", re.I)
PHONE_LABELS = re.compile(r"\b(phone|tel|telephone|mobile|fax|call)\b", re.I)
ID_LABELS = re.compile(r"(invoice|\binv\b|order|\bpo\b|purchase ?order|\bref|account|customer|number|\bno\b|no\.?$)", re.I)  # substring tolerant: OCR may drop the spaces
KNOWN_LABEL_ONLY = re.compile(r"^(grand total|total|subtotal|sub-total|vat|tax|amount due|balance due|balance|invoice date|due date|date)\s*:?$", re.I)
LOW_CONF = 0.85


def _num(s: str) -> Decimal | None:
    try:
        return Decimal(s.replace(",", ""))
    except InvalidOperation:
        return None


def parse_dates(text: str) -> list[tuple[int, int, str, list[str], str | None]]:
    """[(start, end, iso or raw, flags, rule)]. Ambiguous numeric dates keep the raw text and say why."""
    out = []
    for m in RE_ISO.finditer(text):
        try:
            out.append((m.start(), m.end(), date(int(m[1]), int(m[2]), int(m[3])).isoformat(), [], "ISO date yyyy-mm-dd"))
        except ValueError:
            pass
    for m in RE_DMY_TEXT.finditer(text):
        try:
            out.append((m.start(), m.end(), date(int(m[3]), MONTHS[m[2][:3].lower()], int(m[1])).isoformat(), [], "day month-name year"))
        except ValueError:
            pass
    for m in RE_MDY_TEXT.finditer(text):
        try:
            out.append((m.start(), m.end(), date(int(m[3]), MONTHS[m[1][:3].lower()], int(m[2])).isoformat(), [], "month-name day year"))
        except ValueError:
            pass
    for m in RE_NUM_DATE.finditer(text):
        a, b, y = int(m[1]), int(m[2]), int(m[3])
        y = y + 2000 if y < 100 else y
        try:
            if a > 12 and b <= 12:
                out.append((m.start(), m.end(), date(y, b, a).isoformat(), [], "numeric dd/mm/yyyy (day > 12)"))
            elif b > 12 and a <= 12:
                out.append((m.start(), m.end(), date(y, a, b).isoformat(), [], "numeric mm/dd/yyyy (day > 12)"))
            elif a == b:
                out.append((m.start(), m.end(), date(y, a, b).isoformat(), [], "numeric date, day equals month"))
            else:
                date(y, a, b); date(y, b, a)
                out.append((m.start(), m.end(), m.group(0), [f"ambiguous: day/month order unknown ({date(y, b, a).isoformat()} if day first, {date(y, a, b).isoformat()} if month first)"], "numeric date, order ambiguous"))
        except ValueError:
            pass
    # drop dates contained in longer matches
    return [d for d in out if not any(o is not d and o[0] <= d[0] and d[1] <= o[1] and (o[1] - o[0]) > (d[1] - d[0]) for o in out)]


def parse_amount(text: str, label: str | None) -> tuple[str, str | None, str] | None:
    """(value as plain decimal string, ISO currency or None, rule) when the whole text is a money amount. A bare number needs a money-like label."""
    t = text.strip()
    m = RE_AMOUNT.fullmatch(t)
    if m:
        num = m["num"] or m["num2"]
        cur = CUR.get((m["cur"] or m["cur2"] or "").strip())
        d = _num(num)
        return (str(d), cur, "currency amount") if d is not None else None
    if label and AMOUNT_LABELS.search(label) and RE_PLAIN_AMOUNT.fullmatch(t):
        d = _num(t)
        return (str(d), None, "number after a money label") if d is not None else None
    return None


def _subbox(it: dict, a: int, b: int) -> tuple[list[float], bool]:
    """Box of characters [a, b) of the item text; exact when the PDF gave per-character positions, otherwise proportional (approximate)."""
    x0, y0, x1, y1 = it["bbox"]
    cx = it.get("char_x")
    if cx and len(cx) == len(it["text"]):
        return [cx[a][0], y0, cx[b - 1][1], y1], False
    n = max(len(it["text"]), 1)
    return [x0 + (x1 - x0) * a / n, y0, x0 + (x1 - x0) * b / n, y1], True


class Fields:
    def __init__(self, page: int, based_on_of):
        self.page, self.out, self.n, self.seen = page, [], 0, set()
        self.based_on_of = based_on_of

    def add(self, it: dict, a: int, b: int, ftype: str, label: str | None, value: str, rule: str, flags: list[str] | None = None, currency: str | None = None) -> None:
        raw = it["text"][a:b]
        key = (ftype, value, round(it["bbox"][0], 2), round(it["bbox"][1], 2), a)
        if key in self.seen:
            return
        self.seen.add(key)
        box, approx = _subbox(it, a, b)
        conf = it.get("conf")
        fl = list(flags or [])
        if conf is not None and conf < LOW_CONF:
            fl.append(f"low OCR confidence ({conf:.2f})")
        self.n += 1
        self.out.append({"id": f"f{self.page}-{self.n}", "page": self.page, "type": ftype, "label": label, "raw": raw, "value": value, "currency": currency, "bbox": [round(v, 5) for v in box], "bbox_approximate": approx,
                         "item_id": it.get("id"), "origin": "rule_parsed", "based_on": self.based_on_of(it), "rule": rule, "ocr_confidence": conf, "flags": fl,
                         "status": "unreviewed", "original_value": value, "current_value": value, "note": ""})


def _typed_value(text: str, label: str | None) -> tuple[str, str, str | None, str, list[str]] | None:
    """If the whole text is one typed value: (type, value, currency, rule, flags)."""
    t = text.strip()
    ds = parse_dates(t)
    if len(ds) == 1 and ds[0][0] == 0 and ds[0][1] == len(t):
        return "date", ds[0][2], None, ds[0][4] or "date", ds[0][3]
    if RE_EMAIL.fullmatch(t):
        return "email", t, None, "email address pattern", []
    am = parse_amount(t, label)
    if am:
        return "amount", am[0], am[1], am[2], (["currency inferred from the symbol"] if am[1] else [])
    if RE_PHONE.fullmatch(t) and 8 <= sum(c.isdigit() for c in t) <= 15 and (t.startswith("+") or (label and PHONE_LABELS.search(label))):
        return "phone", re.sub(r"[^\d+]", "", t) if t.startswith("+") else t, None, "phone number pattern (+ prefix or phone label)", []
    if label and ID_LABELS.search(label) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9\-/_.]{2,}", t) and any(c.isdigit() for c in t):
        return "identifier", t, None, "identifier after an id-like label", []
    return None


def extract_fields(page: int, rows: list[list[dict]], table_items: set[int], based_on_of) -> list[dict]:
    F = Fields(page, based_on_of)
    for r in rows:
        for idx, it in enumerate(r):
            if id(it) in table_items:
                continue
            text = it["text"]
            m = RE_KV.match(text)
            if m and not m["value"].startswith("//") and not re.fullmatch(r"\d{1,2}", m["label"].strip()) and len(m["label"].split()) <= 5 \
                    and not (m["label"][-1].isdigit() and m["value"][0].isdigit() and " " not in text[m.end("label"):m.start("value")]):  # not a clock time such as 10:30
                label, va, vb = m["label"].strip(), m.start("value"), len(text)
                tv = _typed_value(m["value"], label)
                if tv:
                    F.add(it, va, vb, tv[0], label, tv[1], "label: value + " + tv[3], tv[4], tv[2])
                else:
                    F.add(it, va, vb, "text", label, m["value"].strip(), "label: value pair")
                    for s, e, iso, fl, rule in parse_dates(m["value"]):  # a date or email inside a longer value
                        F.add(it, va + s, va + e, "date", None, iso, rule, fl)
                    for em in RE_EMAIL.finditer(m["value"]):
                        F.add(it, va + em.start(), va + em.end(), "email", None, em.group(0), "email address pattern")
                continue
            if KNOWN_LABEL_ONLY.match(text.strip()) and idx + 1 < len(r) and id(r[idx + 1]) not in table_items:  # label and value are separate items on one row
                nxt, label = r[idx + 1], text.strip().rstrip(":").strip()
                tv = _typed_value(nxt["text"], label)
                if tv:
                    F.add(nxt, 0, len(nxt["text"]), tv[0], label, tv[1], "known label followed by value on the same row + " + tv[3], tv[4], tv[2])
                continue
            tv = _typed_value(text, None)
            if tv and tv[0] in ("date", "email", "amount", "phone"):
                F.add(it, 0, len(text), tv[0], None, tv[1], "stand-alone " + tv[3], tv[4], tv[2])
                continue
            for s, e, iso, fl, rule in parse_dates(text):
                F.add(it, s, e, "date", None, iso, "date inside text: " + rule, fl)
            for em in RE_EMAIL.finditer(text):
                F.add(it, em.start(), em.end(), "email", None, em.group(0), "email address pattern")
            for am in RE_AMOUNT.finditer(text):
                if am["cur"] or am["cur2"]:
                    p = parse_amount(am.group(0), None)
                    if p:
                        F.add(it, am.start(), am.end(), "amount", None, p[0], "currency amount inside text", ["currency inferred from the symbol"] if p[1] else [], p[1])
            for ph in RE_PHONE.finditer(text):
                s = ph.group(0)
                if s.startswith("+") and 8 <= sum(c.isdigit() for c in s) <= 15 and not any(f["type"] == "date" for f in F.out if f["item_id"] == it.get("id") and f["raw"] == s):
                    F.add(it, ph.start(), ph.end(), "phone", None, re.sub(r"[^\d+]", "", s), "phone number pattern (+ prefix)")
    return F.out


# ---- checks -------------------------------------------------------------------------------------------------------------
def _find(fields: list[dict], *names: str) -> dict | None:
    for f in fields:
        if f["type"] == "amount" and f["label"] and f["label"].strip().lower() in names:
            return f
    return None


def validations(fields: list[dict], tables: list[dict]) -> list[dict]:
    """Arithmetic consistency checks between extracted amounts and table columns. Only run when the needed values were found."""
    out = []
    sub, tot = _find(fields, "subtotal", "sub-total"), _find(fields, "total", "grand total", "amount due", "balance due")
    tax = next((f for f in fields if f["type"] == "amount" and f["label"] and re.match(r"^(vat|tax)\b", f["label"].strip(), re.I)), None)
    if sub and tot and tax:
        a, b, c = _num(sub["current_value"]), _num(tax["current_value"]), _num(tot["current_value"])
        if None not in (a, b, c):
            ok = abs(a + b - c) <= Decimal("0.005")
            out.append({"rule": "subtotal + tax = total", "passed": ok, "detail": f"{a} + {b} = {a + b}; total shown {c}", "fields": [sub["id"], tax["id"], tot["id"]]})
    for t in tables:
        head = [h.strip().lower() for h in t["cells"][0]] if t["cells"] else []
        def col(*keys):
            return next((i for i, h in enumerate(head) if any(k in h for k in keys)), None)
        q, u, a = col("qty", "quantity"), col("unit", "price", "rate"), col("amount", "line total", "total")
        if q is None or u is None or a is None or len({q, u, a}) < 3:
            continue
        bad, checked, amounts = [], 0, []
        for ri, row in enumerate(t["cells"][1:], start=1):
            nq, nu, na = _num(row[q]), _num(row[u]), _num(row[a])
            if None in (nq, nu, na):
                continue
            checked += 1
            amounts.append(na)
            if abs(nq * nu - na) > Decimal("0.005"):
                bad.append(f"row {ri + 1}: {nq} x {nu} = {nq * nu}, shown {na}")
        if checked:
            out.append({"rule": f"quantity x unit price = amount ({t['id']})", "passed": not bad, "detail": f"{checked} row(s) checked" + ("; " + "; ".join(bad) if bad else ""), "fields": []})
            if sub:
                s = _num(sub["current_value"])
                if s is not None:
                    tsum = sum(amounts)
                    out.append({"rule": f"sum of table amounts = subtotal ({t['id']})", "passed": abs(tsum - s) <= Decimal("0.005"), "detail": f"table sum {tsum}; subtotal shown {s}", "fields": [sub["id"]]})
    failed_ids = {fid for v in out if not v["passed"] for fid in v["fields"]}
    for f in fields:
        if f["id"] in failed_ids:
            f["flags"].append("arithmetic check failed")
    return out


# ---- classification -----------------------------------------------------------------------------------------------------
CLASSES = {
    "invoice": ["invoice", "bill to", "invoice no", "invoice date", "due date", "subtotal", "vat", "tax", "total", "amount due", "qty", "quantity", "unit price", "payment terms"],
    "receipt": ["receipt", "thank you for your purchase", "cash", "change", "card", "visa", "mastercard", "subtotal", "total", "tax", "cashier", "store"],
    "letter": ["dear", "sincerely", "yours faithfully", "yours sincerely", "kind regards", "regards", "re:"],
    "report": ["report", "period", "prepared by", "summary", "quarter", "monthly", "annual", "status", "on hand", "reorder"],
    "terms_and_conditions": ["terms and conditions", "terms of service", "agreement", "liability", "governing law", "effective"],
}


def classify(text: str, n_tables: int) -> dict:
    low = text.lower()
    hits = {c: [k for k in ks if re.search(r"(?<![a-z])" + re.escape(k) + r"(?![a-z])", low)] for c, ks in CLASSES.items()}
    scores = {c: len(v) for c, v in hits.items()}
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    top, second = ranked[0], ranked[1]
    label = top[0] if top[1] >= 3 and top[1] - second[1] >= 2 else "unclassified"
    return {"label": label, "method": "keyword rules (not a trained classifier)", "scores": scores, "matched": {c: v for c, v in hits.items() if v},
            "note": "A label needs at least 3 distinct keywords and a lead of 2 over the runner-up; otherwise the document is left unclassified.", "tables_found": n_tables}
