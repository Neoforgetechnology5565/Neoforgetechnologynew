"""Business-intelligence data: validated CSV import and real aggregation over imported datasets or the workspace's own records."""
from __future__ import annotations

import csv
import io
import re
from datetime import date

from .tabular import parse_number

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
AGGS = {"sum", "avg", "count", "min", "max"}


def parse_csv(data: bytes, max_rows: int, mapping: dict | None = None, types: dict | None = None) -> dict:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("latin-1")
    if "\x00" in text[:2000]:
        raise ValueError("this looks like a binary file, not a CSV")
    rd = csv.reader(io.StringIO(text))
    try:
        head = next(rd)
    except StopIteration:
        raise ValueError("the file is empty") from None
    head = [h.strip() for h in head]
    if len(head) < 2 or any(not h for h in head) or len(set(head)) != len(head):
        raise ValueError("the first row must contain unique, non-empty column names (at least two)")
    mapping = mapping or {}
    cols = [mapping.get(h, h) for h in head]
    if len(set(cols)) != len(cols) or any(not re.match(r"^[A-Za-z][A-Za-z0-9_ ]{0,40}$", c) for c in cols):
        raise ValueError("column names must be unique, start with a letter and contain only letters, digits, spaces and underscores")
    raw = []
    for i, r in enumerate(rd, start=2):
        if not any(c.strip() for c in r):
            continue
        raw.append((i, r))
        if len(raw) > max_rows:
            raise ValueError(f"the file has more than {max_rows} rows")
    kinds = dict(types or {})
    for j, c in enumerate(cols):
        if c in kinds:
            continue
        vals = [r[j].strip() for _, r in raw if j < len(r) and r[j].strip()]
        # a column that is mostly dates / numbers is typed as such so stray bad values are reported, not silently accepted as text
        share = lambda f: sum(1 for v in vals if f(v)) / len(vals) if vals else 0  # noqa: E731
        kinds[c] = "date" if share(lambda v: DATE.match(v)) >= 0.8 else "number" if share(lambda v: parse_number(v) is not None) >= 0.8 else "text"
    rows, errors = [], []
    for ln, r in raw:
        if len(r) != len(cols):
            errors.append({"line": ln, "message": f"has {len(r)} values but the header has {len(cols)}"})
            continue
        rec, bad = {}, False
        for c, v in zip(cols, r):
            v = v.strip()
            if kinds[c] == "number":
                n = parse_number(v) if v else None
                if v and n is None:
                    errors.append({"line": ln, "message": f"{c}: '{v}' is not a number"}); bad = True; break
                rec[c] = n
            elif kinds[c] == "date":
                if v:
                    try:
                        date.fromisoformat(v)
                    except ValueError:
                        errors.append({"line": ln, "message": f"{c}: '{v}' is not a valid date (YYYY-MM-DD)"}); bad = True; break
                rec[c] = v or None
            else:
                rec[c] = v
        if not bad:
            rows.append(rec)
    return {"columns": [{"name": c, "type": kinds[c]} for c in cols], "rows": rows, "errors": errors, "rows_in_file": len(raw)}


def dedupe(rows: list[dict], key: list[str]) -> tuple[list[dict], int]:
    seen, out, dup = set(), [], 0
    for r in rows:
        k = tuple(r.get(c) for c in key)
        if k in seen:
            dup += 1
            continue
        seen.add(k)
        out.append(r)
    return out, dup


def query(rows: list[dict], columns: list[dict], group_by: str | None, metric: str | None, agg: str, filters: list[tuple[str, str, str]], date_col: str | None = None, date_from: str | None = None,
          date_to: str | None = None, sort: str = "value_desc", limit: int = 200) -> dict:
    kinds = {c["name"]: c["type"] for c in columns}
    if agg not in AGGS:
        raise ValueError("agg must be one of " + ", ".join(sorted(AGGS)))
    if group_by and group_by not in kinds:
        raise ValueError(f"unknown column '{group_by}'")
    if agg != "count":
        if not metric or kinds.get(metric) != "number":
            raise ValueError("choose a numeric column as the metric")
    sel = []
    for r in rows:
        if date_col:
            d = r.get(date_col)
            if (date_from or date_to) and not d:
                continue
            if date_from and d < date_from or date_to and d > date_to:
                continue
        ok = True
        for col, op, val in filters:
            v = r.get(col)
            if col not in kinds:
                raise ValueError(f"unknown filter column '{col}'")
            if op == "eq":
                ok = str(v) == val
            elif op == "ne":
                ok = str(v) != val
            elif op in ("gte", "lte", "gt", "lt"):
                try:
                    a, b = float(v), float(val)
                except (TypeError, ValueError):
                    ok = False
                else:
                    ok = {"gte": a >= b, "lte": a <= b, "gt": a > b, "lt": a < b}[op]
            else:
                raise ValueError("filter operator must be eq, ne, gt, gte, lt or lte")
            if not ok:
                break
        if ok:
            sel.append(r)
    groups: dict = {}
    for r in sel:
        groups.setdefault(r.get(group_by) if group_by else "All", []).append(r)

    def agg_of(rs):
        if agg == "count":
            return len(rs)
        v = [x[metric] for x in rs if x.get(metric) is not None]
        if not v:
            return None
        return {"sum": sum(v), "avg": sum(v) / len(v), "min": min(v), "max": max(v)}[agg]
    out = [{"group": ("(blank)" if k in (None, "") else k), "value": (round(agg_of(rs), 4) if agg_of(rs) is not None else None), "rows": len(rs)} for k, rs in groups.items()]
    out.sort(key=(lambda x: (-(x["value"] if x["value"] is not None else float("-inf")), str(x["group"]))) if sort == "value_desc" else (lambda x: str(x["group"])))
    total = agg_of(sel)
    return {"rows_matched": len(sel), "rows_total": len(rows), "groups": out[:limit], "total": None if total is None else round(total, 4), "agg": agg, "metric": metric, "group_by": group_by,
            "note": "A group with value null has no numeric values for the metric: it is not zero."}
