import io

from conftest import load


def wf(wid="w1", active=True, trigger=None, steps=None, name="High value lead"):
    return {"id": wid, "name": name, "active": active, "trigger": trigger or {"type": "record_created", "slice": "crm", "coll": "leads"},
            "steps": steps or [
                {"id": "s1", "type": "condition", "config": {"field": "value", "op": "gte", "value": 10000}},
                {"id": "s2", "type": "create_task", "config": {"subject": "Call {{name}}", "dueDays": 2}},
                {"id": "s3", "type": "create_alert", "config": {"title": "Big lead {{name}}"}}]}


def save(api, ws, *wfs):
    r = api.post(f"/api/biz/{ws}/flow/ops", json={"upsert": {"workflows": list(wfs)}})
    assert r.status_code == 200, r.text


def lead(i="lead_x", value=20000):
    return {"id": i, "name": "Acme Buyer", "status": "New", "score": 50, "value": value, "createdAt": "2026-03-01"}


def test_validation_reports_each_problem(api, ws):
    bad = {"name": "", "trigger": {"type": "webhook"}, "steps": [{"id": "a", "type": "send_email", "config": {}}]}
    r = api.post(f"/api/biz/{ws}/flow/validate", json=bad).json()
    assert not r["valid"] and len(r["errors"]) >= 3
    assert api.post(f"/api/biz/{ws}/flow/validate", json=wf()).json() == {"valid": True, "errors": []}
    assert any("at least one step" in e for e in api.post(f"/api/biz/{ws}/flow/validate", json={**wf(), "steps": []}).json()["errors"])


def test_manual_run_writes_real_records_and_logs_steps(api, ws):
    load(api, ws, "crm")
    save(api, ws, wf())
    run = api.post(f"/api/biz/{ws}/flow/workflows/w1/run", json={"payload": lead()}).json()
    assert run["status"] == "succeeded" and [s["status"] for s in run["steps"]] == ["ok", "ok", "ok"]
    acts = api.get(f"/api/biz/{ws}/crm/activities?q=Acme").json()
    assert any(a["subject"] == "Call Acme Buyer" and a["due"] == "2026-03-17" for a in acts["items"])
    assert api.get(f"/api/biz/{ws}/flow/alerts").json()["total"] == 1
    assert api.get(f"/api/biz/{ws}/flow/runs").json()["total"] == 1


def test_condition_not_met_stops_without_side_effects(api, ws):
    save(api, ws, wf())
    run = api.post(f"/api/biz/{ws}/flow/workflows/w1/run", json={"payload": lead(value=50)}).json()
    assert run["status"] == "stopped_condition"
    assert [s["status"] for s in run["steps"]] == ["stopped", "not_run", "not_run"]
    assert api.get(f"/api/biz/{ws}/flow/alerts").json()["total"] == 0


def test_creating_a_matching_record_triggers_active_workflows_only(api, ws):
    save(api, ws, wf("on", True), wf("off", False, name="Disabled"))
    r = api.post(f"/api/biz/{ws}/crm/ops", json={"upsert": {"leads": [lead("l1")]}}).json()
    assert [x["workflow"] for x in r["workflow_runs"]] == ["High value lead"] and "flow" in r["refresh"]
    # updating the same record does not re-trigger
    r2 = api.post(f"/api/biz/{ws}/crm/ops", json={"upsert": {"leads": [{**lead("l1"), "score": 70}]}}).json()
    assert r2["workflow_runs"] == []
    assert api.get(f"/api/biz/{ws}/flow/runs").json()["total"] == 1


def test_approval_pauses_then_resumes_or_rejects(api, ws):
    steps = [{"id": "a", "type": "approval", "config": {"title": "Approve {{name}}"}}, {"id": "b", "type": "create_alert", "config": {"title": "Approved {{name}}"}}]
    save(api, ws, wf(steps=steps))
    run = api.post(f"/api/biz/{ws}/flow/workflows/w1/run", json={"payload": lead()}).json()
    assert run["status"] == "pending_approval" and run["steps"][1]["status"] == "not_run"
    assert api.get(f"/api/biz/{ws}/flow/alerts").json()["total"] == 0
    aid = run["approvalId"]
    done = api.post(f"/api/biz/{ws}/flow/approvals/{aid}/decide", json={"decision": "approve", "note": "ok"}).json()
    assert done["status"] == "succeeded" and api.get(f"/api/biz/{ws}/flow/alerts").json()["total"] == 1
    assert api.post(f"/api/biz/{ws}/flow/approvals/{aid}/decide", json={"decision": "approve"}).status_code == 409
    run2 = api.post(f"/api/biz/{ws}/flow/workflows/w1/run", json={"payload": lead()}).json()
    rej = api.post(f"/api/biz/{ws}/flow/approvals/{run2['approvalId']}/decide", json={"decision": "reject"}).json()
    assert rej["status"] == "rejected" and api.get(f"/api/biz/{ws}/flow/alerts").json()["total"] == 1
    assert api.post(f"/api/biz/{ws}/flow/approvals/{aid}/decide", json={"decision": "maybe"}).status_code == 400


def test_failed_step_is_reported_and_retry_only_when_safe(api, ws):
    steps = [{"id": "a", "type": "set_field", "config": {"slice": "crm", "coll": "leads", "field": "status", "value": "Qualified"}}]
    save(api, ws, wf(steps=steps))
    run = api.post(f"/api/biz/{ws}/flow/workflows/w1/run", json={"payload": lead("missing")}).json()
    assert run["status"] == "failed" and "does not exist" in run["error"]
    api.post(f"/api/biz/{ws}/crm/ops", json={"upsert": {"leads": [lead("missing")]}})
    again = api.post(f"/api/biz/{ws}/flow/runs/{run['id']}/retry").json()
    assert again["status"] == "succeeded"
    assert api.get(f"/api/biz/{ws}/crm/leads/missing").json()["status"] == "Qualified"
    assert api.post(f"/api/biz/{ws}/flow/runs/{run['id']}/retry").status_code == 409
    # a create_task step is never retried automatically (duplicate risk)
    save(api, ws, wf("w2", steps=[{"id": "t", "type": "create_task", "config": {"subject": "x {{nope}}"}}]))
    f = api.post(f"/api/biz/{ws}/flow/workflows/w2/run", json={"payload": lead()}).json()
    assert f["status"] == "failed" and api.post(f"/api/biz/{ws}/flow/runs/{f['id']}/retry").status_code == 409


def test_invalid_workflow_does_not_run_and_delay_is_honest(api, ws):
    save(api, ws, wf("w3", steps=[{"id": "d", "type": "delay", "config": {"days": 3}}, {"id": "e", "type": "end", "config": {}}]))
    run = api.post(f"/api/biz/{ws}/flow/workflows/w3/run", json={"payload": lead()}).json()
    assert run["steps"][0]["status"] == "skipped_demo" and run["status"] == "succeeded"
    assert api.post(f"/api/biz/{ws}/flow/workflows/w3/run", json={}).status_code == 400
    assert api.post(f"/api/biz/{ws}/flow/workflows/nope/run", json={"payload": lead()}).status_code == 404


CSV = "date,region,sales,units\n2026-01-05,North,100.5,3\n2026-01-20,South,200,5\n2026-02-03,North,50,1\n2026-02-10,East,75,2\n"


def imp(api, ws, text, **form):
    return api.post(f"/api/biz/{ws}/bi/import", files={"file": ("d.csv", io.BytesIO(text.encode() if isinstance(text, str) else text), "text/csv")}, data={"mode": "preview", **form})


def test_preview_does_not_store_and_commit_does(api, ws):
    p = imp(api, ws, CSV).json()
    assert not p["committed"] and p["valid_rows"] == 4 and {c["name"]: c["type"] for c in p["columns"]} == {"date": "date", "region": "text", "sales": "number", "units": "number"}
    assert api.get(f"/api/biz/{ws}/bi/datasets").json()["datasets"] == []
    c = imp(api, ws, CSV, mode="commit", name="Q1").json()
    assert c["committed"] and api.get(f"/api/biz/{ws}/bi/datasets").json()["datasets"][0]["rows"] == 4


def test_invalid_rows_refused_unless_skipped(api, ws):
    bad = CSV + "2026-13-45,North,10,1\n2026-02-11,West,abc,1\n2026-02-12,West,5\n"
    p = imp(api, ws, bad).json()
    assert p["valid_rows"] == 4 and p["invalid_rows"] == 3 and all("line" in e for e in p["errors"])
    assert imp(api, ws, bad, mode="commit").status_code == 422
    ok = imp(api, ws, bad, mode="commit", skip_invalid="true").json()
    assert ok["committed"] and ok["valid_rows"] == 4


def test_dedupe_mapping_and_refusals(api, ws):
    dup = CSV + "2026-01-05,North,100.5,3\n"
    r = imp(api, ws, dup, dedupe_key="date,region").json()
    assert r["valid_rows"] == 4 and r["duplicates_removed"] == 1
    assert imp(api, ws, CSV, dedupe_key="nope").status_code == 400
    m = imp(api, ws, CSV, mapping='{"sales": "revenue"}').json()
    assert "revenue" in [c["name"] for c in m["columns"]]
    assert imp(api, ws, b"%PDF-1.4 junk").status_code == 415
    assert imp(api, ws, b"\x89PNG\r\n\x1a\nxx").status_code == 415
    assert imp(api, ws, "").status_code == 400
    assert imp(api, ws, "a,a\n1,2\n").status_code == 422
    assert imp(api, ws, CSV, mode="x").status_code == 400
    small = api.__class__  # noqa: F841


def test_query_aggregates_filters_and_dates(api, ws):
    did = imp(api, ws, CSV, mode="commit").json()["dataset_id"]
    q = lambda **p: api.get(f"/api/biz/{ws}/bi/query", params={"source": f"dataset:{did}", **p})  # noqa: E731
    g = q(group_by="region", metric="sales", agg="sum").json()
    assert {x["group"]: x["value"] for x in g["groups"]} == {"North": 150.5, "South": 200.0, "East": 75.0} and g["total"] == 425.5
    assert g["groups"][0]["group"] == "South"
    assert q(metric="units", agg="avg").json()["total"] == 2.75
    assert q(agg="count", **{"filter.region": "eq:North"}).json()["total"] == 2
    d = q(group_by="region", metric="sales", date_col="date", date_from="2026-02-01", date_to="2026-02-28").json()
    assert d["rows_matched"] == 2 and d["total"] == 125.0
    assert q(group_by="region", metric="region").status_code == 422 or q(group_by="region", metric="region").status_code == 400
    assert q(group_by="zzz", agg="count").status_code in (400, 422)
    assert api.get(f"/api/biz/{ws}/bi/query", params={"source": "dataset:ds_none", "agg": "count"}).status_code == 404
    assert api.get(f"/api/biz/{ws}/bi/query", params={"source": "bogus"}).status_code == 400


def test_query_on_workspace_records_matches_known_totals(api, ws):
    load(api, ws, "crm")
    opps = api.get(f"/api/biz/{ws}/crm/opps?limit=500").json()["items"]
    r = api.get(f"/api/biz/{ws}/bi/query", params={"source": "records:crm.opps", "metric": "value", "agg": "sum"})
    assert r.status_code == 200 and r.json()["total"] == round(sum(o["value"] for o in opps), 4)
    assert api.get(f"/api/biz/{ws}/bi/query", params={"source": "records:inv.products", "agg": "count"}).status_code == 409


def test_row_limit_and_size_limit(make, ws):
    api = make(max_csv_rows=3, max_csv_mb=1)
    assert imp(api, ws, CSV).status_code == 422
    big = "a,b\n" + "1,2\n" * 300000
    assert imp(make(max_csv_rows=10**7, max_csv_mb=1), ws, big).status_code == 413
