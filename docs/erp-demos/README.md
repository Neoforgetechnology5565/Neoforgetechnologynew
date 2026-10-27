# CRM / HRM / ERP interactive demos (frontend only)

Ten polished, working business-software demonstrations inside the Neo Forge site. **Frontend only**: no backend, API, database server
or real integration. Everything runs in the browser, on fictional data, and is stored in this browser's `localStorage`.

Portfolio entry: `/portfolio/crm-hrm-erp` → each card → `/erp-demos/<slug>` (features page) → `/erp-demos/<slug>/app` (the application).

| # | Demo | Route slug | Screens |
|---|---|---|---|
| 01 | CRM & Sales Pipeline | `crm-sales-pipeline` | Overview, Pipeline (Kanban), Opportunities + details, Activities, Quotations, Leads, Contacts, Companies, Sales reports |
| 02 | ERP Finance & Accounting | `erp-finance-accounting` | Dashboard, Analytics, Invoices, Receivable, Bills, Payable, Expenses, Payments & transactions, Chart of accounts, P&L, Balance sheet, Cash flow |
| 03 | HRM Employee Management | `hrm-employee-management` | Dashboard, Directory (cards/table), Profile, Departments, Positions, Onboarding, Leave (requests/balances/calendar), Performance, Reports |
| 04 | Payroll, Attendance & Workforce | `payroll-attendance-workforce` | Attendance dashboard, Register (+ clock in/out, absences), Timesheets, Shift calendar, Overtime, Payroll overview & config, Run preview, Payslip, Reports |
| 05 | Inventory & Warehouse | `inventory-warehouse-management` | Dashboard, Low-stock alerts, Catalogue, Product details, Warehouses, Movements, Goods received, Transfers, Adjustments, Reports |
| 06 | Procurement & Purchase Orders | `procurement-purchase-orders` | Dashboard, Approval queue, Suppliers + profile, Requisitions, Purchase orders + details, Goods receipts, Reports |
| 07 | Helpdesk & Service Management | `helpdesk-service-management` | Dashboard, Inbox, Ticket details, Priority queues, Agent assignments, Customer profiles, Resolution history, SLA overview, Analytics |
| 08 | Marketing Automation | `marketing-automation-crm` | Dashboard, Contacts & lists, Segment builder, Campaigns, Campaign editor (details, template, preview, schedule/run, history, metrics), Calendar, Analytics |
| 09 | Project & Resource Management | `project-resource-management` | Dashboard, Projects + details, Kanban board, Task list, Milestone timeline, Calendar, Timesheets, Resources, Budget reports |
| 10 | Executive Analytics & Automation | `executive-analytics-automation` | Executive dashboard + 11 analytics screens (revenue, sales, marketing, finance, payroll, inventory, procurement, projects, support, workforce) and the approval workflow (queue, threshold alerts, history) |

## Architecture

* `src/lib/biz/db.ts`: one local store (`useSyncExternalStore`) holding a *slice* per demo (`crm`, `fin`, `hrm`, `pay`, `inv`, `proc`, `desk`, `mkt`, `proj`, `exec`) plus a shared `activity` log. Persisted to `localStorage` key `neoforge-erp-demos-v1`.
  Reset restores the seed for one demo (or all, from the Executive demo). Only this key is touched; no other site data.
* `src/lib/biz/seed-*.ts`: fictional, deterministic seed data. `seeds.ts` assembles all slices.
* `src/lib/biz/*-calc.ts`: pure, unit-tested business logic (finance statements, payroll rules, stock valuation, segment matching, project cost/progress, executive KPIs).
* `src/components/biz/kit.tsx`: shared UI kit (app shell with the official logo from Admin → Branding, DataTable with search/sort/pagination/CSV, modals, drawers, tabs, Kanban with drag-and-drop, SVG charts, print sheet, toasts, confirmations).
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
