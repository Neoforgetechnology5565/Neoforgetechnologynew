# Neo Forge business demo API

SQLite-backed FastAPI service behind the fictional CRM / HRM / ERP demos (`/erp-demos`). **All data is demo data**; nothing is sent to any
external system (no e-mail, SMS, payment or webhook).

* **Persistence** – each browser gets an anonymous workspace id; records are stored one row per record, so edits, deletes and ordering survive restarts.
* **Validation** – a field schema per collection plus cross-record rules: no negative stock, unique SKUs/invoice numbers, payments ≤ invoice total,
  received ≤ ordered, leave dates valid, referenced records must exist. Invalid batches are rolled back atomically (HTTP 422 with an `errors` list).
* **Real calculations** – `GET /api/biz/{ws}/summary/{crm|fin|inv|proc|desk|hrm|pay|mkt|proj|exec}` recomputes pipeline totals, invoice/expense balances,
  stock levels, headcount, attendance hours, etc. from the stored records. Marketing metrics are labelled simulated by the front end; nothing is sent.
* **Domain operations** – inventory movements, invoice/bill payments, purchase-order receipts (which also write inventory receipts).
* **Workflow engine** – validated rule workflows (condition, create task, set field, alert, approval, delay) that really write to the workspace;
  delays are recorded, not waited for. External actions are rejected.
* **BI import** – CSV preview/commit with type inference, per-line errors, mapping, de-duplication, and grouped aggregation queries.
* **Security** – workspace-id format check, body-size and CSV limits, per-IP rate limit, CORS allow-list, binary uploads refused, formula-neutralised CSV
  export, generic 500 messages, workspace TTL cleanup.

```
pip install -r requirements.txt -r requirements-dev.txt
BIZ_DB_PATH=./biz.db uvicorn app.main:app --port 8120
pytest -q            # 27 tests, all seeds of the front-end demos are loaded through the API
```

Front end: set `BIZ_API_URL` (server) so the ERP demos sync to it. Without it the demos run **local-only** in the browser and say so.
Configuration: `BIZ_DB_PATH, BIZ_ALLOWED_ORIGINS, BIZ_MAX_BODY_KB, BIZ_MAX_RECORDS, BIZ_MAX_WORKSPACES, BIZ_WS_TTL_DAYS, BIZ_MAX_CSV_MB, BIZ_MAX_CSV_ROWS, BIZ_RATE_PER_MINUTE`.
`tests/seeds.json` is generated from the TypeScript seeds with `npx tsx services/biz-api/scripts/dump_seeds.ts`.
