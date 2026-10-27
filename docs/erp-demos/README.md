# CRM / HRM / ERP interactive demos (frontend only)

Ten polished, working business-software demonstrations inside the Neo Forge site. **Frontend only**: no backend, API, database server
or real integration. Everything runs in the browser, on fictional data, and is stored in this browser's `localStorage`.

Portfolio entry: `/portfolio/crm-hrm-erp` → each card → `/erp-demos/<slug>` (features page) → `/erp-demos/<slug>/app` (the application).

Each demo has **its own interface** (not a shared sidebar template). Layout archetypes:

| # | Demo | Route slug | Layout and sections |
|---|---|---|---|
| 01 | CRM & Sales Pipeline | `crm-sales-pipeline` | Sales command centre: top bar (search, workspace selector, alerts, profile, New opportunity) + pill tabs Pipeline, Leads, Contacts, Companies, Activities, Quotations, Reports. Seven-stage Kanban is home; deals open in a side panel; board/list toggle |
| 02 | ERP Finance & Accounting | `erp-finance-accounting` | Ledger workbook: underlined tabs Overview, Transactions (general ledger with debit/credit + cash movements), Invoices (+ receivable ageing), Expenses (+ bills, payable ageing), Accounts, Reconciliation, Reports; account-balance rail at the right |
| 03 | HRM Employee Management | `hrm-employee-management` | People-operations header band: People (faceted directory as cards, table or org tree), Departments (+ positions), Onboarding, Leave, Performance, Organization; employee profile page with Overview, Employment, Documents, Leave, Performance, Activity |
| 04 | Payroll, Attendance & Workforce | `payroll-attendance-workforce` | Dark control room: date and shift controls, Attendance (day timeline of scheduled vs actual, register), Shifts, Timesheets, Payroll (overview, run, payslip), Exceptions, Reports |
| 05 | Inventory & Warehouse | `inventory-warehouse-management` | Warehouse stock desk: scan/search bar, warehouse selector, task rail; split screen of stock list and product detail with bin floor map; receipts, transfers, adjustments, low stock, valuation, history, warehouse map |
| 06 | Procurement & Purchase Orders | `procurement-purchase-orders` | Stage funnel (Requisition → Completed) under the header on every screen; Pipeline queue, Requisitions, Purchase orders (document page with lifecycle and stock impact), Deliveries, Approvals, Suppliers, Reports |
| 07 | Helpdesk & Service Management | `helpdesk-service-management` | Three-panel console (queue, conversation, customer context; tabs on small screens) plus Priority board, Agents, Customers, SLA, Analytics, History |
| 08 | Marketing Automation | `marketing-automation-crm` | Violet campaign studio: Campaigns (cards with email thumbnails, side-by-side editor), Audience, Templates, Journeys (visual builder), Analytics. Simulated and labelled |
| 09 | Project & Resource Management | `project-resource-management` | Project strip scopes every view; Board (configurable grouping, hidden columns, WIP limits), Timeline (Gantt), Calendar, List, Team, Reports |
| 10 | Executive Analytics & Automation | `executive-analytics-automation` | Boardroom briefing: written summary, headline figures with period comparison, business-unit and date filters, scorecard with drill-down; Commercial, Finance, Operations, People & service reports; approval workflow and alerts |

### Typography
Georgia (`Georgia, "Times New Roman", serif`) is used everywhere, including native form controls and SVG chart labels (`globals.css`). Body text is 15px; the `.app-readable` scale (applied to the whole site via `<body>`) maps Tailwind `text-xs` to 14px, `text-sm` to 15px and the old 10–11px classes to 13px, so nothing renders below 13px. Headings and key metrics use 21–38px. Known limitation: Georgia's digits are old-style (non-lining) and it has no tabular figures, so numeric columns are right-aligned but not perfectly column-aligned.

## Architecture

* `src/lib/biz/db.ts`: one local store (`useSyncExternalStore`) holding a *slice* per demo (`crm`, `fin`, `hrm`, `pay`, `inv`, `proc`, `desk`, `mkt`, `proj`, `exec`) plus a shared `activity` log. Persisted to `localStorage` key `neoforge-erp-demos-v1`.
  Reset restores the seed for one demo (or all, from the Executive demo). Only this key is touched; no other site data.
* `src/lib/biz/seed-*.ts`: fictional, deterministic seed data. `seeds.ts` assembles all slices.
* `src/lib/biz/*-calc.ts`: pure, unit-tested business logic (finance statements, payroll rules, stock valuation, segment matching, project cost/progress, executive KPIs).
* `src/components/biz/kit.tsx`: shared UI kit (`AppProviders` for toasts/confirmations, brand logo from Admin → Branding, DataTable with search/sort/pagination/CSV, modals, drawers, tabs, Kanban with drag-and-drop, SVG charts, print sheet, toasts, confirmations).
* `src/components/biz/*App.tsx`: one application per demo. `src/app/erp-demos/[slug]/…`: routes. `src/lib/erp-demos.ts`: catalogue.

### Shared data (deliberate links between demos)
* Employees (HRM) are the salespeople in CRM, agents in Helpdesk, resources in Projects and the payroll roster.
* CRM companies/contacts are the customers in Finance, Helpdesk and Projects, and the base of the Marketing list.
* Inventory products and warehouses are the lines of Procurement orders. **A goods receipt in Procurement adds stock movements in Inventory**, and a low-stock alert can create a draft requisition in Procurement. (Resetting either one resets both.)
* The Executive demo computes every KPI from the other nine slices; its approval queue also approves/rejects Procurement requisitions and HR leave requests, updating those demos' records.

## What is simulated (and labelled as such in the UI)
* No emails, messages, supplier orders or payments are sent or made. Marketing delivery/open/click metrics are generated sample numbers (a deterministic function of audience size), labelled "simulated" everywhere they appear.
* Payroll rules are demonstration assumptions (documented on screen), not any country's legal rules. Finance is not certified accounting or tax software.
* Approvals, deliveries, clock events and replies change only local demo records.
* "Demo date" is fixed (15 Mar 2026) so overdue/ageing figures are reproducible. Helpdesk uses 15 Mar 2026 12:00.

## Exports and printing
CSV (and JSON where noted) are generated from the live data: every table, plus invoices/bills/transactions, P&L, balance sheet, cash flow, payroll runs & attendance, stock valuation/by warehouse, purchase orders (CSV+JSON), tickets, campaigns/contacts, project/timesheet/budget, executive KPI snapshot (CSV+JSON). CSV cells are protected against spreadsheet formula injection.
Print: invoices, payslips, quotations, purchase orders, P&L, balance sheet. `printNow()` clones the document into `#print-root` so only it prints.

## Tests
```bash
npx tsx src/lib/biz/biz.test.ts      # unit tests of the calculation libraries (npm run test:biz)
npm run dev                          # then, in another shell:
NODE_PATH=<dir with playwright> node scripts/test-erp-ui.mjs [crm finance hrm payroll inventory procurement helpdesk marketing projects executive]
```
`test-erp-ui.mjs` drives each demo end to end in Chromium: every screen, form validation, workflows, calculations vs. stored data, exports, print, persistence, reset, console errors, mobile overflow.

## Limitations
* Local browser data only: no multi-user sync; clearing site data (or Reset) restores the sample data.
* `localStorage` quota applies (the seed is ~1 MB). If storage is unavailable the demos still work for the session.
* Fixed demo clock; no timezone handling; USD only.
* Drag-and-drop uses the HTML5 API (desktop). Every card also has a "Move to" menu, which works on touch devices.
