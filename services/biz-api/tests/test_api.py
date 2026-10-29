import copy
import io

import pytest

from tests.conftest import SEEDS, load


def test_health_and_workspace_ids(api, ws):
    assert api.get("/api/health").json()["storage"] == "sqlite"
    assert api.get("/api/biz/not-hex/state").status_code == 400
    assert api.get("/api/biz/" + "g" * 32 + "/state").status_code == 400
    assert api.get(f"/api/biz/{ws}/state").json()["slices"] == {}
    assert api.put(f"/api/biz/{ws}/nope", json={"state": {}}).status_code == 404
    assert api.put(f"/api/biz/{ws}/crm", json={"state": "x"}).status_code == 400
    assert api.post(f"/api/biz/{ws}/crm/ops", json={"surprise": 1}).status_code == 400


def test_every_real_seed_is_accepted_and_round_trips_in_order(api, ws):
    for k in ("hrm", "crm", "fin", "pay", "inv", "proc", "desk", "mkt", "proj", "exec", "activity"):
        load(api, ws, k)
    st = api.get(f"/api/biz/{ws}/state").json()["slices"]
    for k, v in SEEDS.items():
        if k == "activity":
            continue
        for coll, arr in v.items():
            if isinstance(arr, list) and arr and isinstance(arr[0], dict) and "id" in arr[0]:
                assert [r["id"] for r in st[k][coll]] == [r["id"] for r in arr], f"{k}.{coll} order"
                assert st[k][coll][0] == arr[0]


def test_persistence_survives_a_server_restart(make, ws):
    a = make()
    load(a, ws, "crm")
    r = a.post(f"/api/biz/{ws}/crm/leads", json={"id": "ld_new", "name": "Acme Test", "status": "New", "score": 10, "value": 5000, "createdAt": "2026-03-15", "email": "a@b.co"})
    assert r.status_code == 201
    a.patch(f"/api/biz/{ws}/crm/leads/ld_new", json={"status": "Qualified"})
    b = make()          # a second application instance on the same database file = a refresh after a restart
    got = b.get(f"/api/biz/{ws}/crm/leads/ld_new").json()
    assert got["status"] == "Qualified" and got["name"] == "Acme Test"
    assert b.get(f"/api/biz/{ws}/crm/leads", params={"q": "acme"}).json()["total"] == 1


def test_crud_search_filter_sort_pagination(api, ws):
    load(api, ws, "crm")
    allleads = api.get(f"/api/biz/{ws}/crm/leads", params={"limit": 500}).json()
    n = allleads["total"]
    assert n == len(SEEDS["crm"]["leads"]) and len(api.get(f"/api/biz/{ws}/crm/leads", params={"limit": 3, "offset": 2}).json()["items"]) == 3
    q = api.get(f"/api/biz/{ws}/crm/leads", params={"f.status": "Qualified", "limit": 500}).json()
    assert q["total"] == sum(1 for l in SEEDS["crm"]["leads"] if l["status"] == "Qualified") and all(r["status"] == "Qualified" for r in q["items"])
    srt = api.get(f"/api/biz/{ws}/crm/leads", params={"sort": "value", "desc": "true", "limit": 500}).json()["items"]
    assert [x["value"] for x in srt] == sorted((x["value"] for x in srt), reverse=True)
    assert api.get(f"/api/biz/{ws}/crm/leads", params={"limit": 0}).status_code == 422
    first = allleads["items"][0]["id"]
    assert api.delete(f"/api/biz/{ws}/crm/leads/{first}").json()["deleted"]
    assert api.get(f"/api/biz/{ws}/crm/leads/{first}").status_code == 404 and api.delete(f"/api/biz/{ws}/crm/leads/{first}").status_code == 404
    assert api.get(f"/api/biz/{ws}/crm/leads").json()["total"] == n - 1
    csv = api.get(f"/api/biz/{ws}/crm/leads/export/csv")
    assert csv.status_code == 200 and csv.text.splitlines()[0].startswith("company") or "name" in csv.text.splitlines()[0]


def test_validation_rejects_and_writes_nothing(api, ws):
    load(api, ws, "crm")
    before = api.get(f"/api/biz/{ws}/crm/leads").json()["total"]
    bad = [{"id": "x1", "name": "", "status": "New", "score": 1, "value": 1, "createdAt": "2026-03-15"},
           {"id": "x2", "name": "N", "status": "Maybe", "score": 1, "value": 1, "createdAt": "2026-03-15"},
           {"id": "x3", "name": "N", "status": "New", "score": 1, "value": -5, "createdAt": "2026-03-15"},
           {"id": "x4", "name": "N", "status": "New", "score": 1, "value": 1, "createdAt": "2026-13-45"},
           {"id": "x5", "name": "N", "status": "New", "score": 1, "value": 1, "createdAt": "2026-03-15", "email": "no at sign"},
           {"id": "x6", "name": "N", "status": "New", "score": "high", "value": 1, "createdAt": "2026-03-15"}]
    for b in bad:
        r = api.post(f"/api/biz/{ws}/crm/leads", json=b)
        assert r.status_code == 422 and r.json()["errors"], b
    r = api.post(f"/api/biz/{ws}/crm/ops", json={"upsert": {"leads": [{"id": "ok1", "name": "Fine", "status": "New", "score": 1, "value": 1, "createdAt": "2026-03-15"}, bad[1]]}})
    assert r.status_code == 422                      # one bad record rejects the whole batch
    assert api.get(f"/api/biz/{ws}/crm/leads").json()["total"] == before and api.get(f"/api/biz/{ws}/crm/leads/ok1").status_code == 404
    assert api.post(f"/api/biz/{ws}/crm/leads", json={"id": SEEDS["crm"]["leads"][0]["id"], "name": "Dup", "status": "New", "score": 1, "value": 1, "createdAt": "2026-03-15"}).status_code == 409
    assert api.post(f"/api/biz/{ws}/crm/bad name", json={"id": "z"}).status_code in (404, 422)
    assert api.patch(f"/api/biz/{ws}/crm/leads/{SEEDS['crm']['leads'][0]['id']}", json={"id": "other"}).status_code == 400
    assert api.post(f"/api/biz/{ws}/crm/opps", json={"id": "o_x", "name": "Deal", "value": 1, "stage": "Won", "createdAt": "2026-03-15", "companyId": "missing"}).status_code == 422


def test_inventory_stock_is_ledger_derived_and_never_negative(api, ws):
    load(api, ws, "inv")
    p = SEEDS["inv"]["products"][0]["id"]
    w = SEEDS["inv"]["warehouses"][0]["id"]
    before = api.get(f"/api/biz/{ws}/summary/inv").json()["summary"]["per_product"][p]["on_hand"]
    r = api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Receipt", "productId": p, "whId": w, "qty": 25, "ref": "GRN-T"})
    assert r.status_code == 201 and r.json()["movements"][0]["qty"] == 25
    assert api.get(f"/api/biz/{ws}/summary/inv").json()["summary"]["per_product"][p]["on_hand"] == before + 25
    on = r.json()["on_hand_in_warehouse"]
    assert api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Issue", "productId": p, "whId": w, "qty": on + 1}).status_code == 422      # cannot go negative
    assert api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Issue", "productId": p, "whId": w, "qty": on}).status_code == 201           # exactly to zero is fine
    assert api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Issue", "productId": p, "whId": w, "qty": 1}).status_code == 422
    assert api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Receipt", "productId": p, "whId": w, "qty": 0}).status_code == 400
    assert api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Receipt", "productId": p, "whId": w, "qty": -3}).status_code == 400
    assert api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Receipt", "productId": "nope", "whId": w, "qty": 3}).status_code == 422
    assert api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Receipt", "productId": p, "whId": "nope", "qty": 3}).status_code == 422
    w2 = SEEDS["inv"]["warehouses"][1]["id"]
    api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Receipt", "productId": p, "whId": w, "qty": 10})
    t = api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Transfer", "productId": p, "whId": w, "toWhId": w2, "qty": 4})
    assert t.status_code == 201 and len(t.json()["movements"]) == 2 and t.json()["on_hand_in_warehouse"] == 6
    assert api.post(f"/api/biz/{ws}/inv/movements", json={"type": "Transfer", "productId": p, "whId": w, "toWhId": w, "qty": 1}).status_code == 400
    low = api.get(f"/api/biz/{ws}/summary/inv").json()["summary"]
    assert low["movements"] > len(SEEDS["inv"]["movements"]) and p in low["per_product"]
    dup = copy.deepcopy(SEEDS["inv"]["products"][1]); dup["id"] = "p_dupsku"; dup["sku"] = SEEDS["inv"]["products"][0]["sku"]
    assert api.post(f"/api/biz/{ws}/inv/products", json=dup).status_code == 422                   # SKUs are unique
    out_of = api.post(f"/api/biz/{ws}/inv/ops", json={"upsert": {"movements": [{"id": "mv_bad", "date": "2026-03-15", "productId": p, "whId": w, "type": "Issue", "qty": 5}]}})
    assert out_of.status_code == 422 and "reduce" in str(out_of.json()["errors"])               # an issue must carry a negative quantity


def test_finance_payments_totals_and_summary(api, ws):
    load(api, ws, "fin")
    s0 = api.get(f"/api/biz/{ws}/summary/fin").json()["summary"]
    inv = {"id": "inv_t1", "number": "INV-T1", "customerId": "c1", "date": "2026-03-10", "due": "2026-04-09", "lines": [{"desc": "Work", "qty": 10, "price": 12.5, "accountId": "4000"}], "taxRate": 0.1, "draft": False, "payments": [], "notes": ""}
    assert api.post(f"/api/biz/{ws}/fin/invoices", json=inv).status_code == 201
    s1 = api.get(f"/api/biz/{ws}/summary/fin").json()["summary"]
    assert s1["invoiced_net"] == round(s0["invoiced_net"] + 125.0, 2) and s1["receivable"] == round(s0["receivable"] + 137.5, 2)    # 10 x 12.50 + 10 % tax
    p = api.post(f"/api/biz/{ws}/fin/invoices/inv_t1/payments", json={"amount": 100})
    assert p.status_code == 201 and p.json()["balance"] == 37.5 and p.json()["total"] == 137.5
    assert api.get(f"/api/biz/{ws}/summary/fin").json()["summary"]["receivable"] == round(s0["receivable"] + 37.5, 2)
    assert api.post(f"/api/biz/{ws}/fin/invoices/inv_t1/payments", json={"amount": 50}).status_code == 422          # overpayment refused
    for bad in ({"amount": 0}, {"amount": -5}, {"amount": "x"}, {}):
        assert api.post(f"/api/biz/{ws}/fin/invoices/inv_t1/payments", json=bad).status_code == 400
    assert api.post(f"/api/biz/{ws}/fin/invoices/nope/payments", json={"amount": 1}).status_code == 404
    assert api.post(f"/api/biz/{ws}/fin/invoices/inv_t1/payments", json={"amount": 37.5}).json()["balance"] == 0
    exp = {"id": "ex_t1", "date": "2026-03-12", "accountId": "6100", "vendor": "Test Vendor", "amount": 80.25, "method": "Card", "note": ""}
    assert api.post(f"/api/biz/{ws}/fin/expenses", json=exp).status_code == 201
    s2 = api.get(f"/api/biz/{ws}/summary/fin").json()["summary"]
    assert s2["expenses_and_bills_net"] == round(s1["expenses_and_bills_net"] + 80.25, 2) and s2["net_result"] == round(s2["invoiced_net"] - s2["expenses_and_bills_net"], 2)
    assert api.post(f"/api/biz/{ws}/fin/expenses", json={**exp, "id": "ex_t2", "amount": -1}).status_code == 422
    assert api.post(f"/api/biz/{ws}/fin/invoices", json={**inv, "id": "inv_t2", "number": "INV-T1"}).status_code == 422          # duplicate number
    drafts = api.post(f"/api/biz/{ws}/fin/invoices", json={**inv, "id": "inv_t3", "number": "INV-T3", "draft": True}).json()
    assert api.post(f"/api/biz/{ws}/fin/invoices/inv_t3/payments", json={"amount": 5}).status_code == 409


def test_procurement_receipt_updates_inventory_only_through_the_workflow(api, ws):
    load(api, ws, "proc", "inv")
    sent = next(o for o in SEEDS["proc"]["orders"] if o["status"] == "Sent")
    prod = sent["lines"][0]["productId"]
    before = api.get(f"/api/biz/{ws}/summary/inv").json()["summary"]["per_product"][prod]["on_hand"]
    q = sent["lines"][0]["qty"] - sent["lines"][0]["received"]
    assert api.post(f"/api/biz/{ws}/proc/orders/{sent['id']}/receive", json={"lines": [{"productId": prod, "qty": q + 1}]}).status_code == 409       # over-receipt refused
    r = api.post(f"/api/biz/{ws}/proc/orders/{sent['id']}/receive", json={"lines": [{"productId": prod, "qty": q}]})
    assert r.status_code == 201 and r.json()["inventory_updated"] and r.json()["inventory_movements"] == 1
    assert api.get(f"/api/biz/{ws}/summary/inv").json()["summary"]["per_product"][prod]["on_hand"] == before + q
    po = api.get(f"/api/biz/{ws}/proc/orders/{sent['id']}").json()
    assert po["lines"][0]["received"] == sent["lines"][0]["qty"] and len(po["receipts"]) == len(sent["receipts"]) + 1
    assert po["status"] in ("Received", "Partially received")
    draft = next((o for o in SEEDS["proc"]["orders"] if o["status"] == "Draft"), None)
    if draft:
        assert api.post(f"/api/biz/{ws}/proc/orders/{draft['id']}/receive", json={"lines": [{"productId": draft["lines"][0]["productId"], "qty": 1}]}).status_code == 409
    # the direct route cannot cheat: marking Received without receiving is refused, and so is receiving more than ordered
    o = api.get(f"/api/biz/{ws}/proc/orders").json()["items"][0]
    cheat = {**o, "status": "Received", "lines": [{**l, "received": 0} for l in o["lines"]]}
    assert api.put(f"/api/biz/{ws}/proc/orders/{o['id']}", json=cheat).status_code == 422
    over = {**o, "lines": [{**l, "received": l["qty"] + 5} for l in o["lines"]]}
    assert api.put(f"/api/biz/{ws}/proc/orders/{o['id']}", json=over).status_code == 422
    assert api.post(f"/api/biz/{ws}/proc/orders/nope/receive", json={"lines": []}).status_code == 404


def test_receipt_without_inventory_module_is_honest(api, ws):
    load(api, ws, "proc")
    sent = next(o for o in SEEDS["proc"]["orders"] if o["status"] == "Sent")
    r = api.post(f"/api/biz/{ws}/proc/orders/{sent['id']}/receive", json={"lines": [{"productId": sent["lines"][0]["productId"], "qty": 1}]})
    assert r.status_code == 201 and r.json()["inventory_updated"] is False and r.json()["inventory_movements"] == 0


def test_hrm_leave_rules_and_summary(api, ws):
    load(api, ws, "hrm")
    emp = {"id": "e_new", "name": "Test Person", "email": "t@x.co", "dept": "Sales", "position": "Rep", "status": "Active", "type": "Full-time", "hireDate": "2026-03-01", "salary": 50000, "managerId": "e01", "notes": []}
    s0 = api.get(f"/api/biz/{ws}/summary/hrm").json()["summary"]
    assert api.post(f"/api/biz/{ws}/hrm/employees", json=emp).status_code == 201
    s1 = api.get(f"/api/biz/{ws}/summary/hrm").json()["summary"]
    assert s1["headcount"] == s0["headcount"] + 1 and s1["by_department"]["Sales"] == s0["by_department"]["Sales"] + 1 and s1["payroll_base_total"] == s0["payroll_base_total"] + 50000
    api.patch(f"/api/biz/{ws}/hrm/employees/e_new", json={"status": "Resigned"})
    assert api.get(f"/api/biz/{ws}/summary/hrm").json()["summary"]["headcount"] == s0["headcount"]
    assert api.post(f"/api/biz/{ws}/hrm/employees", json={**emp, "id": "e_x", "managerId": "ghost"}).status_code == 422
    assert api.post(f"/api/biz/{ws}/hrm/employees", json={**emp, "id": "e_y", "email": "bad"}).status_code == 422
    assert api.post(f"/api/biz/{ws}/hrm/employees", json={**emp, "id": "e_z", "salary": -1}).status_code == 422
    lv = {"id": "lv_t", "empId": "e_new", "type": "Annual", "from": "2026-04-10", "to": "2026-04-14", "days": 3, "reason": "", "status": "Pending", "submitted": "2026-03-15"}
    assert api.post(f"/api/biz/{ws}/hrm/leave", json=lv).status_code == 201
    assert api.get(f"/api/biz/{ws}/summary/hrm").json()["summary"]["pending_leave"] == s0["pending_leave"] + 1
    assert api.post(f"/api/biz/{ws}/hrm/leave", json={**lv, "id": "lv_b", "to": "2026-04-01"}).status_code == 422
    assert api.post(f"/api/biz/{ws}/hrm/leave", json={**lv, "id": "lv_g", "empId": "ghost"}).status_code == 422
    assert api.patch(f"/api/biz/{ws}/hrm/leave/lv_t", json={"status": "Approved"}).json()["status"] == "Approved"


def test_attendance_requires_existing_employees_and_hours_are_computed(api, ws):
    load(api, ws, "hrm", "pay")
    e = SEEDS["hrm"]["employees"][3]["id"]
    s0 = api.get(f"/api/biz/{ws}/summary/pay").json()["summary"]
    for i, (a, b) in enumerate([("09:00", "17:30"), ("08:15", "16:45")]):
        assert api.post(f"/api/biz/{ws}/pay/attendance", json={"id": f"at_t{i}", "empId": e, "date": f"2026-03-1{i}", "in": a, "out": b}).status_code == 201
    s1 = api.get(f"/api/biz/{ws}/summary/pay").json()["summary"]
    assert round(s1["worked_hours_by_employee"][e] - s0["worked_hours_by_employee"].get(e, 0), 2) == 17.0 and s1["records"] == s0["records"] + 2
    assert api.post(f"/api/biz/{ws}/pay/attendance", json={"id": "at_g", "empId": "ghost", "date": "2026-03-10", "in": "09:00", "out": "10:00"}).status_code == 422
    assert api.post(f"/api/biz/{ws}/pay/attendance", json={"id": "at_h", "empId": e, "date": "2026-03-10", "in": "25:99", "out": ""}).status_code == 422
    api.post(f"/api/biz/{ws}/pay/attendance", json={"id": "at_m", "empId": e, "date": "2026-03-12", "in": "09:00", "out": ""})
    assert api.get(f"/api/biz/{ws}/summary/pay").json()["summary"]["missing_clock_out"] == s0["missing_clock_out"] + 1


def test_crm_pipeline_summary_follows_the_records(api, ws):
    load(api, ws, "crm")
    s0 = api.get(f"/api/biz/{ws}/summary/crm").json()["summary"]
    co = SEEDS["crm"]["companies"][0]["id"]
    opp = {"id": "op_t", "name": "Test deal", "companyId": co, "contactId": "", "value": 12000, "stage": "Proposal", "ownerId": "", "closeDate": "2026-05-01", "createdAt": "2026-03-15", "notes": []}
    assert api.post(f"/api/biz/{ws}/crm/opps", json=opp).status_code == 201
    s1 = api.get(f"/api/biz/{ws}/summary/crm").json()["summary"]
    assert s1["open_pipeline_value"] == s0["open_pipeline_value"] + 12000 and s1["by_stage"]["Proposal"]["count"] == s0["by_stage"]["Proposal"]["count"] + 1
    api.patch(f"/api/biz/{ws}/crm/opps/op_t", json={"stage": "Won"})
    s2 = api.get(f"/api/biz/{ws}/summary/crm").json()["summary"]
    assert s2["open_pipeline_value"] == s0["open_pipeline_value"] and s2["won_value"] == s0["won_value"] + 12000 and s2["won"] == s0["won"] + 1
    assert s2["win_rate"] == round(s2["won"] / (s2["won"] + s2["lost"]), 4)
    assert api.get(f"/api/biz/{ws}/summary/nope").status_code == 404 and api.get(f"/api/biz/{uuid_other()}/summary/crm").status_code == 409


def uuid_other():
    import uuid
    return uuid.uuid4().hex


def test_helpdesk_marketing_projects_exec_summaries(api, ws):
    load(api, ws, "desk", "mkt", "proj", "exec")
    d = api.get(f"/api/biz/{ws}/summary/desk").json()["summary"]
    assert d["tickets"] == len(SEEDS["desk"]["tickets"]) and d["open"] == sum(1 for t in SEEDS["desk"]["tickets"] if t["status"] not in ("Resolved", "Closed"))
    t = SEEDS["desk"]["tickets"][0]
    n = {**t, "id": "tk_t", "number": "T-9999", "subject": "Printer on fire", "priority": "Urgent", "status": "New", "messages": [{"id": "m1", "kind": "note", "at": "2026-03-15 10:00", "text": "internal"}], "resolution": None}
    n.pop("resolution")
    assert api.post(f"/api/biz/{ws}/desk/tickets", json=n).status_code == 201
    assert api.get(f"/api/biz/{ws}/summary/desk").json()["summary"]["open"] == d["open"] + 1
    assert api.patch(f"/api/biz/{ws}/desk/tickets/tk_t", json={"status": "Resolved", "priority": "Low"}).json()["status"] == "Resolved"
    assert api.patch(f"/api/biz/{ws}/desk/tickets/tk_t", json={"status": "Exploded"}).status_code == 422
    m = api.get(f"/api/biz/{ws}/summary/mkt").json()["summary"]
    assert m["subscribed"] + m["suppressed"] == m["contacts"] and "SIMULATED" in m["metrics_note"]
    assert api.post(f"/api/biz/{ws}/proj/time", json={"id": "te_t", "projectId": SEEDS["proj"]["projects"][0]["id"], "taskId": "", "empId": "e01", "date": "2026-03-10", "hours": 30, "note": ""}).status_code == 422
    assert api.post(f"/api/biz/{ws}/proj/time", json={"id": "te_u", "projectId": "ghost", "taskId": "", "empId": "e01", "date": "2026-03-10", "hours": 3, "note": ""}).status_code == 422
    e = api.get(f"/api/biz/{ws}/summary/exec").json()["summary"]
    assert e["approvals_by_status"]["Pending"] == 3 and e["pending_value"] == 26250 + 12000 + 118000


def test_security_limits(make, ws):
    small = make(max_body_kb=1, rate_per_minute=30)
    r = small.put(f"/api/biz/{ws}/crm", json={"state": {"leads": [{"id": f"l{i}", "name": "x" * 50, "status": "New", "score": 1, "value": 1, "createdAt": "2026-03-15"} for i in range(60)]}})
    assert r.status_code == 413
    sql = small.post(f"/api/biz/{ws}/crm/leads", json={"id": "x'; DROP TABLE rec;--", "name": "n'); DELETE FROM ws;--", "status": "New", "score": 1, "value": 1, "createdAt": "2026-03-15"})
    assert sql.status_code == 201 and small.get(f"/api/biz/{ws}/crm/leads", params={"q": "drop table"}).json()["total"] == 1      # parameterised: stored as text
    assert small.get(f"/api/biz/{ws}/crm/leads").status_code == 200
    codes = {small.get("/api/health").status_code for _ in range(40)}
    assert 429 in codes
    big = make(max_records_per_ws=5)
    assert big.put(f"/api/biz/{uuid_other()}/crm", json={"state": SEEDS["crm"]}).status_code == 413
    many = make(max_workspaces=1)
    many.get(f"/api/biz/{uuid_other()}/state")
    assert many.get(f"/api/biz/{uuid_other()}/state").status_code == 503
    assert big.get("/api/biz/%2e%2e%2f/state").status_code in (400, 404)
    resp = big.post(f"/api/biz/{ws}/crm/leads", content=b"not json", headers={"content-type": "application/json"})
    assert resp.status_code in (400, 422) and "Traceback" not in resp.text
