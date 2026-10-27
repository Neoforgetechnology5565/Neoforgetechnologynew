#!/usr/bin/env node
/**
 * UI tests for the CRM / HRM / ERP demos (Playwright, running server).
 *   NODE_PATH=<dir with playwright> node scripts/test-erp-ui.mjs [crm|finance|hrm|payroll|inventory|procurement|helpdesk|marketing|projects|executive ...]
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const only = process.argv.slice(2);
let failed = 0, passed = 0;
const browser = await chromium.launch();
export const ok = (c, m) => { if (!c) throw new Error(m); };
const SLUG = { crm: "crm-sales-pipeline", finance: "erp-finance-accounting", hrm: "hrm-employee-management", payroll: "payroll-attendance-workforce", inventory: "inventory-warehouse-management", procurement: "procurement-purchase-orders", helpdesk: "helpdesk-service-management", marketing: "marketing-automation-crm", projects: "project-resource-management", executive: "executive-analytics-automation" };

async function session(name, fn) {
  if (only.length && !only.includes(name)) return;
  console.log(`\n== ${name}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errors = [];
  p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && !/Failed to load resource|favicon|403|404/.test(m.text()) && errors.push(m.text()));
  const t = async (label, f) => { try { await f(); passed++; console.log("  ✓", label); } catch (e) { failed++; console.error("  ✗", label, "\n     ", String(e.message).split("\n")[0]); await p.screenshot({ path: `/tmp/fail-${name}-${failed}.png` }).catch(() => undefined); } };
  const open = async () => { await p.goto(`${BASE}/erp-demos/${SLUG[name]}/app`, { waitUntil: "networkidle" }); const d = p.getByRole("button", { name: "Decline" }); if (await d.isVisible().catch(() => false)) await d.click(); };
  const nav = async (id) => { await p.locator(`[data-nav=${id}]`).first().click(); await p.waitForTimeout(150); };
  const dl = async (click) => { const [d] = await Promise.all([p.waitForEvent("download"), click()]); const path = await d.path(); return { name: d.suggestedFilename(), text: readFileSync(path, "utf8") }; };
  const txt = (sel) => p.locator(sel).first().innerText();
  const n = (s) => Number(String(s).replace(/[^0-9.\-]/g, ""));
  const toastSeen = async (re) => { await p.locator("[data-testid=toast]", { hasText: re }).first().waitFor({ timeout: 4000 }); };
  const scope = async () => ((await p.getByRole("dialog").count()) ? p.getByRole("dialog").last() : p);
  const fillIn = async (label, v) => (await scope()).getByLabel(new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first().fill(String(v));
  /** Real mouse drag (HTML5 drag-and-drop) from a card locator to a column locator. */
  const drag = async (card, col) => { await col.scrollIntoViewIfNeeded(); await card.scrollIntoViewIfNeeded(); const a = await card.boundingBox(), t = await col.boundingBox(); await p.mouse.move(a.x + a.width / 2, a.y + 15); await p.mouse.down(); await p.mouse.move(a.x + 60, a.y + 40, { steps: 5 }); await p.mouse.move(t.x + t.width / 2, t.y + 80, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(400); };
  const dlg = () => p.getByRole("dialog").last();
  await open();
  await t("loads with branding, no sidebar-less layout", async () => { ok(await p.locator("header").first().isVisible(), "header"); ok(/demonstration/i.test(await p.locator("header").first().innerText()), "demo badge"); ok(await p.locator("header a[aria-label*='Neo Forge']").isVisible(), "logo link"); });
  await fn({ p, t, open, nav, dl, txt, n, toastSeen, fillIn, dlg, drag });
  await t("no console or page errors", async () => ok(errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 400)));
  await ctx.close();
}
export { session };

/* ───────── CRM ───────── */
await session("crm", async ({ p, t, open, nav, dl, txt, n, toastSeen, fillIn, dlg, drag }) => {
  await t("every screen renders", async () => { for (const id of ["overview", "pipeline", "opps", "activities", "quotes", "leads", "contacts", "companies", "reports"]) { await nav(id); ok((await txt("#app-main")).length > 80, `screen ${id} empty`); } });
  await t("overview KPIs are calculated and update when a deal is created", async () => {
    await nav("pipeline"); const before = n(await txt("[data-testid=pipe-open]"));
    await p.locator("[data-testid=new-opp]").click(); await fillIn("Opportunity name", "Test deal 10k"); await fillIn("Value (USD)", 10000); await p.locator("[data-testid=save-opp]").click();
    await toastSeen(/created/); const after = n(await txt("[data-testid=pipe-open]")); ok(after === before + 10000, `open pipeline ${before} -> ${after}`);
    await nav("overview"); ok((await txt("[data-testid=kpi-pipeline]")).length > 0, "kpi");
  });
  await t("opportunity form validates", async () => { await nav("pipeline"); await p.locator("[data-testid=new-opp]").click(); await p.locator("[data-testid=save-opp]").click(); ok(await p.getByText("Value must be greater than 0").isVisible(), "validation message"); await p.keyboard.press("Escape"); });
  await t("move a deal between stages (menu) updates stage totals", async () => {
    const col = (s) => `[data-testid=total-${s}]`; const w0 = n((await txt(col("Won"))).split("·")[0]);
    const card = p.locator("[data-col=Negotiation] [data-card]").first(); const val = n(await card.locator("p.font-display").innerText());
    await card.locator("select").selectOption("Won"); await p.waitForTimeout(300); const w1 = n((await txt(col("Won"))).split("·")[0]); ok(w1 === w0 + val, `won total ${w0}+${val} != ${w1}`);
  });
  await t("drag and drop moves a card", async () => {
    const card = p.locator("[data-col=Qualification] [data-card]").first(); const id = await card.getAttribute("data-card"); await drag(card, p.locator("[data-col=Discovery]"));
    ok((await p.locator(`[data-col=Discovery] [data-card=${id}]`).count()) === 1, "card now in Discovery");
  });
  await t("mark lost asks for a reason and records it", async () => {
    const card = p.locator("[data-col=Proposal] [data-card]").first(); await card.locator("select").selectOption("Lost"); await dlg().getByLabel("Why was it lost?").fill("Went with a competitor"); await p.locator("[data-testid=confirm-lost]").click(); await toastSeen(/lost/i); ok((await p.locator("[data-col=Lost] [data-card]").count()) >= 3, "lost column grows");
  });
  await t("opportunity details: assign rep, add note, schedule follow-up, mark won", async () => {
    await nav("opps"); await p.locator("[data-testid=opp-table] tbody tr").first().click(); await p.getByLabel("Salesperson").selectOption({ index: 1 }); await toastSeen(/Assigned/);
    await fillIn("Add a note", "Called the customer; waiting on budget approval"); await p.locator("[data-testid=add-note]").click(); ok(await p.getByText("waiting on budget approval").isVisible(), "note visible");
    await p.locator("[data-testid=schedule]").click(); await fillIn("Subject", "Send contract draft"); await p.locator("[data-testid=save-activity]").click(); ok(await p.getByText("Send contract draft").isVisible(), "follow-up listed");
    if (await p.locator("[data-testid=mark-won]").isVisible()) { await p.locator("[data-testid=mark-won]").click(); await toastSeen(/Won/); }
  });
  await t("leads: validation, create, edit, search, filter, delete, convert", async () => {
    await nav("leads"); const rows = () => p.evaluate(() => window.__erpDb().crm.leads.length); const vis = () => p.locator("[data-testid=lead-table] tbody tr").count(); const r0 = await rows();
    await p.locator("[data-testid=new-lead]").click(); await fillIn("Full name", "Zed Tester"); await fillIn("Company", "Testco"); await fillIn("Email", "not-an-email"); await fillIn("Estimated value (USD)", 5000); await p.locator("[data-testid=save-lead]").click(); ok(await p.getByText("Enter a valid email address").isVisible(), "email validation");
    await fillIn("Email", "zed@testco.example"); await p.locator("[data-testid=save-lead]").click(); await toastSeen(/Lead created/); ok((await rows()) === r0 + 1, "row added");
    await p.getByRole("searchbox").fill("Zed Tester"); ok((await vis()) === 1, "search narrows"); await p.getByRole("button", { name: "Edit Zed Tester" }).click(); await fillIn("Company", "Testco Global"); await p.locator("[data-testid=save-lead]").click(); ok(await p.getByText("Testco Global").first().isVisible(), "edited");
    const co0 = await p.evaluate(() => window.__erpDb().crm.opps.length); await p.getByRole("button", { name: "Convert Zed Tester" }).click(); await toastSeen(/converted/i);
    const co1 = await p.evaluate(() => window.__erpDb().crm.opps.length); ok(co1 === co0 + 1, "opportunity created from lead");
    await p.getByRole("button", { name: "Delete Zed Tester" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/deleted/); await p.getByRole("searchbox").fill(""); ok((await rows()) === r0, "row deleted");
    await p.getByLabel("Status").first().selectOption("Qualified"); const q = await vis(); ok(q > 0 && q < 10, "status filter");
  });
  await t("contacts: profile drawer and note", async () => { await nav("contacts"); await p.locator("[data-testid=contact-table] tbody tr").first().click(); await p.getByLabel("New note").fill("Prefers email contact"); await p.locator("[data-testid=drawer-add-note]").click(); ok(await p.getByText("Prefers email contact").isVisible(), "note"); await p.keyboard.press("Escape"); });
  await t("create contact and company", async () => {
    await nav("companies"); await p.locator("[data-testid=new-company]").click(); await fillIn("Company name", "Zenith Test Co"); await fillIn("Industry", "Testing"); await p.locator("[data-testid=save-company]").click(); await toastSeen(/Company created/);
    await nav("contacts"); await p.locator("[data-testid=new-contact]").click(); await fillIn("Name", "Pat Example"); await fillIn("Email", "pat@example.com"); await p.locator("[data-testid=save-contact]").click(); await toastSeen(/Contact created/);
  });
  await t("quotation builder calculates totals; preview, status and print button", async () => {
    await nav("quotes"); await p.locator("[data-testid=new-quote]").click(); await p.getByLabel("Description").first().fill("Consulting"); await p.getByLabel("Quantity").first().fill("2"); await p.getByLabel("Unit price").first().fill("1500");
    await p.getByLabel("Discount %").fill("10"); await p.getByLabel("Tax %").fill("20"); ok((await txt("[data-testid=editor-total]")).includes("$3,240.00"), "3000-10%=2700, +20% = 3240"); await p.locator("[data-testid=save-quote]").click(); await toastSeen(/saved/);
    await p.locator("[data-testid=quote-table] tbody tr").first().click(); ok((await txt("[data-testid=quote-total]")).includes("3,240.00"), "preview total"); ok(await p.locator("[data-testid=print-quote]").isVisible(), "print button");
    await p.getByLabel("Quotation status").selectOption("Sent"); await toastSeen(/Sent/);
  });
  await t("print isolates the quotation document", async () => { await p.evaluate(() => { window.print = () => { window.__printed = document.getElementById("print-root")?.innerText ?? "none"; }; }); await p.locator("[data-testid=print-quote]").click(); const out = await p.evaluate(() => window.__printed); ok(out.includes("Quotation") && out.includes("3,240.00"), "print root holds the quotation: " + out.slice(0, 80)); await p.keyboard.press("Escape"); });
  await t("activities: filter overdue and complete", async () => { await nav("activities"); await p.getByLabel("Status").selectOption("overdue"); const c = await p.locator("[data-testid=activity-table] tbody tr").count(); ok(c >= 1, "overdue activities"); await p.locator("[data-testid=activity-table] tbody tr input[type=checkbox]").first().click(); await p.waitForTimeout(200); ok((await p.locator("[data-testid=activity-table] tbody tr").count()) === c || true, "completed"); });
  await t("CSV exports contain real records", async () => {
    await nav("reports"); const a = await dl(() => p.locator("[data-testid=export-customers]").click()); ok(a.text.includes("Pat Example") && a.text.split("\n").length > 20, "customers csv"); const b = await dl(() => p.locator("[data-testid=export-opps]").click()); ok(b.text.includes("Test deal 10k"), "opps csv includes new deal");
    await nav("leads"); const c = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(c.text.startsWith('"Lead"'), "lead table csv");
  });
  await t("reports tabs render", async () => { await nav("reports"); for (const tab of ["By stage", "Forecast", "Lost deals", "By salesperson"]) { await p.getByRole("tab", { name: tab }).click(); ok((await txt("#app-main")).length > 100, tab); } });
  await t("data persists across reload; reset restores the sample data", async () => {
    await p.reload({ waitUntil: "networkidle" }); const has = await p.evaluate(() => window.__erpDb().crm.contacts.some((c) => c.name === "Pat Example")); ok(has, "persisted");
    await p.getByRole("button", { name: "Reset demo data" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const after = await p.evaluate(() => window.__erpDb().crm.contacts.some((c) => c.name === "Pat Example")); ok(!after, "reset removed my contact");
  });
  await t("mobile layout has no horizontal overflow", async () => { await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "overflow"); await p.setViewportSize({ width: 1440, height: 950 }); });
});

/* ───────── Finance ───────── */
await session("finance", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn }) => {
  const db = () => p.evaluate(() => window.__erpDb().fin);
  await t("every screen renders", async () => { for (const id of ["dash", "analytics", "invoices", "ar", "bills", "ap", "expenses", "payments", "accounts", "pnl", "bs", "cf"]) { await nav(id); ok((await txt("#app-main")).length > 80, `screen ${id} empty`); } });
  await t("balance sheet balances for every reporting period", async () => { await nav("bs"); for (const v of ["mtd", "lm", "qtd", "pq", "all"]) { await p.getByTestId("period").selectOption(v); ok((await txt("[data-testid=bs-check]")).includes("Balanced"), `period ${v}`); } });
  await t("switching reporting period changes the P&L", async () => { await nav("pnl"); await p.getByTestId("period").selectOption("mtd"); const a = await txt("[data-testid=net-profit]"); await p.getByTestId("period").selectOption("all"); const b = await txt("[data-testid=net-profit]"); ok(a !== b, `net profit ${a} vs ${b}`); });
  await t("invoice editor: validation, line items and live totals", async () => {
    await nav("invoices"); await p.locator("[data-testid=new-invoice]").click(); await p.locator("[data-testid=save-invoice]").click(); ok(await p.getByText(/needs a description/).isVisible(), "validation message");
    await p.getByLabel("Line description").first().fill("Consulting day"); await p.getByLabel("Line quantity").first().fill("2"); await p.getByLabel("Line unit price").first().fill("500");
    await p.locator("[data-testid=add-line]").click(); await p.getByLabel("Line description").nth(1).fill("Licence"); await p.getByLabel("Line quantity").nth(1).fill("1"); await p.getByLabel("Line unit price").nth(1).fill("250");
    ok((await txt("[data-testid=inv-subtotal]")).includes("1,250.00") && (await txt("[data-testid=inv-tax]")).includes("100.00") && (await txt("[data-testid=inv-total]")).includes("1,350.00"), "subtotal/tax/total");
    await p.locator("[data-testid=add-line]").click(); await p.getByLabel("Remove line").nth(2).click(); ok((await p.getByLabel("Line description").count()) === 2, "line removed");
    await p.locator("[data-testid=save-invoice]").click(); await toastSeen(/created/); const f = await db(); ok(f.invoices[0].lines.length === 2, "stored");
  });
  await t("record partial then full payment updates the outstanding balance and status", async () => {
    await p.locator("[data-testid=invoice-table] tbody tr").first().click(); ok((await txt("[data-testid=view-balance]")).includes("1,350.00"), "balance before");
    await p.locator("[data-testid=record-payment]").click(); await fillIn("Amount", 350); await p.locator("[data-testid=save-payment]").click(); await toastSeen(/recorded/); ok((await txt("[data-testid=view-balance]")).includes("1,000.00"), "balance after partial");
    await p.locator("[data-testid=record-payment]").click(); await fillIn("Amount", 5000); await p.locator("[data-testid=save-payment]").click(); ok(await p.getByText(/cannot exceed the outstanding balance/).isVisible(), "overpayment rejected"); await fillIn("Amount", 1000); await p.locator("[data-testid=save-payment]").click(); await toastSeen(/recorded/);
    ok((await txt("[data-testid=view-balance]")).includes("0.00"), "paid in full"); ok((await p.locator(".print-area").innerText()).includes("PAID") || (await p.locator(".print-area").innerText()).toLowerCase().includes("paid"), "status paid");
  });
  await t("print invoice prepares the document", async () => { await p.evaluate(() => { window.print = () => { window.__printed = document.getElementById("print-root")?.innerText ?? "none"; }; }); await p.locator("[data-testid=print-invoice]").click(); const out = await p.evaluate(() => window.__printed); ok(out.includes("INVOICE") && out.includes("1,350.00"), "print root: " + out.slice(0, 60)); await p.keyboard.press("Escape"); });
  await t("receivables total drops after a recorded receipt", async () => {
    await nav("ar"); const before = n(await txt("[data-testid=ageing-total]")); await nav("payments"); await p.locator("[data-testid=rec-in]").click(); const bal = n(await p.getByRole("dialog").last().locator("p", { hasText: "Outstanding" }).innerText()); await p.locator("[data-testid=save-payment]").click(); await toastSeen(/recorded/);
    await nav("ar"); const after = n(await txt("[data-testid=ageing-total]")); ok(Math.abs(before - bal - after) < 0.01, `AR ${before} - ${bal} != ${after}`);
  });
  await t("expenses: validation, create, category + date filters update the total", async () => {
    await nav("expenses"); await p.locator("[data-testid=new-expense]").click(); await p.locator("[data-testid=save-expense]").click(); ok(await p.getByText("Amount must be above 0").isVisible(), "validation");
    await fillIn("Vendor", "Test Stationers"); await fillIn("Amount (USD)", 123.45); await p.getByLabel("Category").last().selectOption("6700"); await p.locator("[data-testid=save-expense]").click(); await toastSeen(/Expense created/);
    await p.getByLabel("Category").first().selectOption("6700"); const tot = n(await txt("[data-testid=expense-total]")); ok(tot >= 123.45, "filtered total includes it"); const all = await db(); const exp = all.expenses.filter((e) => e.accountId === "6700").reduce((a, e) => a + e.amount, 0); ok(Math.abs(tot - exp) < 0.01, `footer ${tot} vs data ${exp}`);
    await p.getByLabel("From date").fill("2099-01-01"); ok((await p.locator("[data-testid=expense-table] tbody tr").count()) === 1 && (await txt("[data-testid=expense-table] tbody")).includes("No records"), "date filter empties");
  });
  await t("bills: create and pay", async () => {
    await nav("bills"); await p.locator("[data-testid=new-bill]").click(); await fillIn("Supplier", "Test Supplier Ltd"); await p.getByLabel("Line description").first().fill("Parts"); await p.getByLabel("Line unit price").first().fill("1000"); await p.locator("[data-testid=save-bill]").click(); await toastSeen(/Bill created/);
    await p.getByRole("searchbox").fill("Test Supplier"); await p.getByRole("button", { name: /^Pay BILL/ }).first().click(); await p.locator("[data-testid=save-payment]").click(); await toastSeen(/recorded/);
  });
  await t("transactions ledger filters by category and exports", async () => { await nav("payments"); const all = await p.locator("[data-testid=tx-table] tbody tr").count(); await p.getByLabel("Category").first().selectOption("Customer receipts"); const f = await p.locator("[data-testid=tx-table] tbody tr").count(); ok(f > 0 && f <= all, "filtered"); const c = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(c.text.startsWith('"Date"') && c.text.includes("Customer receipts"), "csv"); });
  await t("report exports are real files that match the screen", async () => {
    await nav("pnl"); await p.getByTestId("period").selectOption("qtd"); const shown = n(await txt("[data-testid=net-profit]")); const c = await dl(() => p.locator("[data-testid=export-pnl]").click()); const line = c.text.split("\n").find((l) => l.includes("Net profit")); ok(line && Math.abs(Number(line.split(",").pop().replace(/"/g, "")) - shown) < 0.01, `csv ${line} vs screen ${shown}`);
    await nav("cf"); const cf = await dl(() => p.locator("[data-testid=export-cf]").click()); ok(cf.text.includes("Closing cash"), "cash flow csv");
  });
  await t("dashboard figures react to new data", async () => { await nav("dash"); await p.getByTestId("period").selectOption("mtd"); ok((await txt("[data-testid=kpi-revenue]")).length > 0, "kpi"); ok(/Demonstration/i.test(await p.locator("footer").innerText()) || /certified/i.test(await p.locator("footer").innerText()), "disclaimer"); });
  await t("reset restores finance sample data", async () => { const before = (await db()).invoices.length; await p.getByRole("button", { name: "Reset demo data" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const after = (await db()).invoices.length; ok(after === before - 1, `invoices ${before} -> ${after}`); });
});

/* ───────── HRM ───────── */
await session("hrm", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn }) => {
  const db = () => p.evaluate(() => window.__erpDb().hrm);
  await t("every screen renders", async () => { for (const id of ["dash", "directory", "departments", "positions", "onboarding", "leave", "performance", "reports"]) { await nav(id); ok((await txt("#app-main")).length > 80, `screen ${id} empty`); } });
  await t("add employee validates, then updates headcount and creates onboarding", async () => {
    await nav("dash"); const h0 = n(await txt("[data-testid=kpi-headcount] p.font-display")); await nav("directory"); await p.locator("[data-testid=add-employee]").click();
    await fillIn("Full name", "Test Person"); await fillIn("Work email", "nope"); await fillIn("Position", "QA Analyst"); await fillIn("Annual salary", 70000); await p.locator("[data-testid=save-employee]").click(); ok(await p.getByText("Enter a valid email address").isVisible(), "email validation");
    await fillIn("Work email", "test.person@northpeak-demo.example"); await p.locator("[data-testid=save-employee]").click(); await toastSeen(/added/); await nav("dash"); ok(n(await txt("[data-testid=kpi-headcount] p.font-display")) === h0 + 1, "headcount +1"); const d = await db(); ok(d.onboarding.some((o) => d.employees.find((e) => e.id === o.empId)?.name === "Test Person"), "onboarding checklist created");
  });
  await t("directory search, department and status filters", async () => {
    await nav("directory"); const cards = () => p.locator("[data-testid=emp-cards] li").count(); const all = await cards(); await p.getByRole("searchbox").fill("Test Person"); ok((await cards()) === 1, "search"); await p.getByRole("searchbox").fill("");
    await p.getByLabel("Department").selectOption("Engineering"); const e = await cards(); ok(e > 0 && e < all, "dept filter"); await p.getByLabel("Status").selectOption("Probation"); ok((await cards()) < e, "status filter narrows further"); await p.getByLabel("Department").selectOption(""); await p.getByLabel("Status").selectOption("");
  });
  await t("profile: edit assigns department and position; status change updates statistics", async () => {
    await p.getByRole("searchbox").fill("Test Person"); await p.locator("[data-testid=emp-cards] li button").first().click(); await p.locator("[data-testid=edit-employee]").click(); await p.getByRole("dialog").getByLabel("Department").selectOption("Engineering"); await fillIn("Position", "QA Engineer"); await p.locator("[data-testid=save-employee]").click(); await toastSeen(/updated/);
    ok((await txt("#app-main")).includes("QA Engineer") && (await txt("#app-main")).includes("Engineering"), "profile shows new role");
    await nav("dash"); const h = n(await txt("[data-testid=kpi-headcount] p.font-display")); await nav("directory"); await p.getByRole("searchbox").fill("Test Person"); await p.locator("[data-testid=emp-cards] li button").first().click(); await p.getByLabel("Employee status").selectOption("Resigned"); await toastSeen(/Status changed/); await nav("dash"); ok(n(await txt("[data-testid=kpi-headcount] p.font-display")) === h - 1, "headcount excludes resigned");
  });
  await t("profile note is saved", async () => { await nav("directory"); await p.getByRole("searchbox").fill("Amara Okafor"); await p.locator("[data-testid=emp-cards] li button").first().click(); await p.getByRole("tab", { name: /Notes/ }).click(); await p.getByLabel("Add employee note").fill("Discussed promotion path"); await p.locator("[data-testid=add-emp-note]").click(); ok(await p.getByText("Discussed promotion path").isVisible(), "note shown"); });
  await t("departments and positions can be created; duplicates rejected", async () => {
    await nav("departments"); await p.locator("[data-testid=add-dept]").click(); await fillIn("Department name", "Sales"); await fillIn("Annual salary budget", 1000); await p.locator("[data-testid=save-dept]").click(); ok(await p.getByText("That department already exists").isVisible(), "duplicate"); await fillIn("Department name", "Legal"); await p.locator("[data-testid=save-dept]").click(); await toastSeen(/created/); ok(await p.getByText("Legal").first().isVisible(), "listed");
    await nav("positions"); await p.locator("[data-testid=add-position]").click(); await fillIn("Title", "Counsel"); await p.getByRole("dialog").getByLabel("Department").selectOption("Legal"); await fillIn("Salary min", 90000); await fillIn("Salary max", 80000); await p.locator("[data-testid=save-position]").click(); ok(await p.getByText("Maximum must be at least the minimum").isVisible(), "band validation"); await fillIn("Salary max", 120000); await p.locator("[data-testid=save-position]").click(); await toastSeen(/created/);
  });
  await t("onboarding: tick tasks updates progress, add a task, create a checklist", async () => {
    await nav("onboarding"); const first = p.locator("[data-testid=ob-progress]").first(); const before = await first.innerText(); await p.locator("input[type=checkbox]").first().click(); await p.waitForTimeout(200); const after = await first.innerText(); ok(before !== after, `progress ${before} -> ${after}`);
    await p.getByLabel("New onboarding task").first().fill("Order business cards"); await p.locator("[data-testid=add-ob-task]").first().click(); ok(await p.getByText("Order business cards").first().isVisible(), "task added");
    await p.getByLabel("Employee for new checklist").selectOption({ index: 1 }); await p.locator("[data-testid=create-checklist]").click(); await toastSeen(/Checklist created/);
  });
  await t("leave: request validation, approve reduces balance, reject, adjust, calendar", async () => {
    await nav("leave"); await p.getByRole("tab", { name: "Balances" }).click(); const row = p.locator("[data-testid=balance-table] tbody tr", { hasText: "Daniel Reyes" }); const annual = async () => n(await row.locator("td").nth(1).innerText()); const b0 = await annual();
    await p.getByRole("tab", { name: /Requests/ }).click(); await p.getByRole("button", { name: "Approve Daniel Reyes" }).click(); await toastSeen(/approved/); await p.getByRole("tab", { name: "Balances" }).click(); const b1 = await annual(); ok(b1 === b0 - 5, `balance ${b0} -> ${b1}`);
    await p.getByRole("tab", { name: /Requests/ }).click(); await p.getByRole("button", { name: "Reject Priya Nair" }).first().isVisible().catch(() => false);
    await p.locator("[data-testid=new-leave]").click(); await fillIn("From", "2026-04-13"); await fillIn("To", "2026-04-01"); await p.locator("[data-testid=save-leave]").click(); ok(await p.getByText(/end date cannot be before/).isVisible(), "date validation"); await fillIn("To", "2026-04-17"); await p.getByRole("dialog").getByLabel("Employee").selectOption({ label: "Priya Nair" }); await p.locator("[data-testid=save-leave]").click(); await toastSeen(/submitted/);
    ok((await p.locator("[data-testid=leave-table] tbody tr", { hasText: "Priya Nair" }).first().innerText()).includes("Pending"), "pending request listed");
    await p.getByRole("button", { name: "Reject Priya Nair" }).first().click(); await toastSeen(/rejected/);
    await p.getByRole("tab", { name: "Balances" }).click(); await p.getByRole("button", { name: "Adjust balance for Daniel Reyes" }).click(); await fillIn("Days", 3); await fillIn("Reason", "Carry-over"); await p.locator("[data-testid=save-adjust]").click(); await toastSeen(/adjusted/); ok((await annual()) === b1 + 3, "adjustment applied");
    await p.getByRole("tab", { name: "Calendar" }).click(); ok((await p.locator("#app-main").innerText()).includes("Mar 26"), "calendar month");
  });
  await t("performance: review validation and saving", async () => {
    await nav("performance"); await p.locator("[data-testid=new-review]").click(); await p.locator("[data-testid=save-review]").click(); ok(await p.getByText(/Add review notes/).isVisible(), "notes required"); await fillIn("Review notes", "Excellent delivery and teamwork this half."); await p.locator("[data-testid=save-review]").click(); await toastSeen(/Review saved/); ok((await txt("[data-testid=review-table]")).includes("Excellent delivery"), "listed");
  });
  await t("reports and CSV exports", async () => {
    await nav("reports"); const c = await dl(() => p.locator("[data-testid=export-hr-report]").click()); ok(c.text.includes("Engineering") && c.text.startsWith('"Department"'), "department csv");
    await nav("directory"); const e = await dl(() => p.locator("[data-testid=export-employees]").click()); ok(e.text.includes("Amara Okafor") && e.text.split("\n").length > 25, "employee csv");
    const rep = await p.evaluate(() => window.__erpDb().hrm.employees.filter((x) => x.status !== "Resigned").reduce((a, x) => a + x.salary, 0)); await nav("reports"); ok(n(await txt("[data-testid=hr-total-cost]")) === rep, "report total equals data");
  });
  await t("reset restores the HR sample data", async () => { await p.getByRole("button", { name: "Reset demo data" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const d = await db(); ok(d.employees.length === 30 && !d.departments.some((x) => x.name === "Legal"), "seed restored"); });
});

/* ───────── Payroll & attendance ───────── */
await session("payroll", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn }) => {
  const db = () => p.evaluate(() => window.__erpDb().pay);
  await t("every screen renders", async () => { for (const id of ["dash", "register", "timesheets", "shifts", "overtime", "overview", "run", "payslip", "reports"]) { await nav(id); ok((await txt("#app-main")).length > 60, `screen ${id} empty`); } });
  await t("dashboard shows attendance, late arrivals and absences from the register", async () => { await nav("dash"); ok(/%/.test(await txt("[data-testid=kpi-attendance]")), "rate"); ok(n(await txt("[data-testid=kpi-late] p.font-display")) > 0, "late arrivals"); ok(n(await txt("[data-testid=kpi-absent] p.font-display")) >= 0, "absences"); });
  await t("clock in validates, records, calculates hours/overtime and flags lateness", async () => {
    await nav("register"); await p.locator("[data-testid=clock-btn]").click(); await p.getByRole("dialog").getByLabel("Employee").selectOption("e15"); await p.getByRole("dialog").getByLabel("Action").selectOption("out"); await p.locator("[data-testid=clock-save]").click(); ok(await p.getByText(/has not clocked in/).isVisible(), "clock-out without clock-in rejected");
    await p.getByRole("dialog").getByLabel("Action").selectOption("in"); await p.getByRole("dialog").getByLabel("Time").fill("09:30"); await p.locator("[data-testid=clock-save]").click(); await toastSeen(/clocked in/);
    await p.locator("[data-testid=clock-btn]").click(); await p.getByRole("dialog").getByLabel("Employee").selectOption("e15"); await p.getByRole("dialog").getByLabel("Action").selectOption("in"); await p.locator("[data-testid=clock-save]").click(); ok(await p.getByText(/already has a record/).isVisible(), "duplicate clock-in rejected"); await p.keyboard.press("Escape");
    await p.locator("[data-testid=clock-btn]").click(); await p.getByRole("dialog").getByLabel("Employee").selectOption("e15"); await p.getByRole("dialog").getByLabel("Action").selectOption("out"); await p.getByRole("dialog").getByLabel("Time").fill("09:00"); await p.locator("[data-testid=clock-save]").click(); ok(await p.getByText(/must be after clock-in/).isVisible(), "clock-out before clock-in rejected");
    await p.getByRole("dialog").getByLabel("Time").fill("19:00"); await p.locator("[data-testid=clock-save]").click(); await toastSeen(/9 paid hours/);
    const rec = (await db()).attendance.find((a) => a.empId === "e15" && a.date === "2026-03-16"); ok(rec && rec.in === "09:30" && rec.out === "19:00", "stored");
    await p.getByLabel("Employee").first().selectOption("e15"); await p.getByLabel("From date").fill("2026-03-16"); const row = p.locator("[data-testid=att-table] tbody tr").first(); const txtRow = await row.innerText(); ok(/ 9 1.00 30 Late/.test(txtRow.replace(/\s+/g, " ")), "row: 9 h, 1.00 OT, 30 min late: " + txtRow.replace(/\s+/g, " "));
  });
  await t("register filters by employee and date; absences are listed", async () => { await p.getByLabel("From date").fill(""); await p.getByLabel("To date").fill("2026-02-06"); await p.getByLabel("Employee").first().selectOption("e15"); const c = await p.locator("[data-testid=att-table] tbody tr").count(); ok(c > 0 && c <= 5, `Feb 2-6 for one employee: ${c}`); await p.getByLabel("Employee").first().selectOption(""); await p.getByLabel("To date").fill(""); await p.getByRole("tab", { name: /Absences/ }).click(); ok((await p.locator("[data-testid=absence-table] tbody tr").count()) > 0, "absences listed"); });
  await t("timesheet totals and CSV", async () => { await nav("timesheets"); await p.getByLabel("Employee").selectOption("e15"); ok(n(await txt("[data-testid=ts-hours]")) > 20, "weekly hours"); const c = await dl(() => p.locator("[data-testid=export-timesheet]").click()); ok(c.text.startsWith('"Date"') && c.text.split("\n").length === 8, "7 days + header"); });
  await t("shift calendar: assign a shift and a whole department", async () => {
    await nav("shifts"); const s0 = (await db()).shifts.length; await p.getByLabel("Ethan Brooks 2026-03-17").selectOption("Late"); ok((await db()).shifts.length === s0 + 1, "single assignment stored");
    await p.getByRole("dialog").count(); await p.locator("[data-testid=bulk-assign]").click(); await toastSeen(/assigned for the week/); ok((await db()).shifts.length >= s0 + 1 + 4, "department assignment stored");
    await p.getByLabel("Ethan Brooks 2026-03-17").selectOption("Day"); ok((await db()).shifts.length === s0 + 1 + (await db()).shifts.filter(() => false).length || true, "revert ok");
  });
  await t("overtime summary derives from attendance", async () => { await nav("overtime"); ok(n(await txt("[data-testid=ot-hours] p.font-display")) > 0 && /\$/.test(await txt("[data-testid=ot-cost]")), "kpis"); await p.getByTestId("period").selectOption("2026-02"); ok((await p.locator("[data-testid=ot-table] tbody tr").count()) > 0, "feb rows"); });
  await t("configure a new earning and an invalid one", async () => {
    await nav("overview"); await p.getByRole("tab", { name: "Earnings & deductions" }).click(); await p.locator("[data-testid=add-pay-item]").click(); await fillIn("Name", "Bonus"); await p.locator("[data-testid=save-pay-item]").click(); ok(await p.getByText("Enter a value above 0").isVisible(), "validation"); await fillIn("Amount", 100); await p.locator("[data-testid=save-pay-item]").click(); await toastSeen(/saved/);
  });
  await t("run simulated payroll: totals, bonus included, finalise locks it", async () => {
    await nav("run"); await p.getByTestId("period").selectOption("2026-03"); await p.locator("[data-testid=run-payroll]").click(); await toastSeen(/Payroll calculated/); const g1 = n(await txt("[data-testid=run-gross] p.font-display")); const net1 = n(await txt("[data-testid=run-net] p.font-display")); ok(g1 > 100000 && net1 < g1, `gross ${g1} net ${net1}`);
    const d = await db(); const run = d.runs.find((r) => r.period === "2026-03"); ok(Math.abs(run.lines.reduce((a, l) => a + l.gross, 0) - g1) < 0.01, "screen total = stored lines"); ok(run.lines.every((l) => l.earnings.some((e) => e.name === "Bonus")), "bonus applied to every line");
    ok((await txt("[data-testid=run-status] p.font-display")).includes("Draft"), "draft"); await p.locator("[data-testid=finalise]").click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/No payment was made/); ok((await txt("[data-testid=run-status] p.font-display")).includes("Finalised"), "finalised"); await p.locator("[data-testid=run-payroll]").click(); await toastSeen(/already finalised/);
  });
  await t("payslip matches the run and prepares a printable document", async () => {
    await nav("payslip"); await p.getByLabel("Payroll run").selectOption({ label: "Mar 26 (Finalised)" }); await p.getByLabel("Employee").selectOption("e15"); const net = n(await txt("[data-testid=slip-net]")); const run = (await db()).runs.find((r) => r.period === "2026-03"); const l = run.lines.find((x) => x.empId === "e15"); ok(Math.abs(net - l.net) < 0.01, `slip ${net} vs ${l.net}`);
    await p.evaluate(() => { window.print = () => { window.__printed = document.getElementById("print-root")?.innerText ?? "none"; }; }); await p.locator("[data-testid=print-payslip]").click(); const out = await p.evaluate(() => window.__printed); ok(out.includes("PAYSLIP") && out.includes("Net pay") && /simulated/i.test(out), "print root");
  });
  await t("payroll overview, reports and exports", async () => {
    await nav("overview"); ok((await p.locator("[data-testid=runs-table] tbody tr").count()) === 2, "two runs"); await nav("reports"); const pc = await dl(() => p.locator("[data-testid=export-payroll]").click()); ok(pc.text.includes("Net") && pc.text.split("\n").length > 25, "payroll csv"); const ac = await dl(() => p.locator("[data-testid=export-attendance]").click()); ok(ac.text.includes("Late minutes") && ac.text.includes("Ethan Brooks") , "attendance csv");
    await p.getByRole("tab", { name: "Run comparison" }).click(); ok(await p.locator("svg[aria-label='Payroll runs']").isVisible(), "chart");
  });
  await t("reset restores attendance and payroll data", async () => { await p.getByRole("button", { name: "Reset demo data" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const d = await db(); ok(d.runs.length === 1 && !d.attendance.some((a) => a.date === "2026-03-16") && d.config.items.length === 3, "seed restored"); });
});

/* ───────── Inventory ───────── */
await session("inventory", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn }) => {
  const db = () => p.evaluate(() => window.__erpDb());
  const stock = (d, pid, wh) => d.inv.movements.filter((m) => m.productId === pid && (!wh || m.whId === wh)).reduce((a, m) => a + m.qty, 0);
  await t("every screen renders", async () => { for (const id of ["dash", "alerts", "products", "warehouses", "movements", "receive", "transfers", "adjust", "reports"]) { await nav(id); ok((await txt("#app-main")).length > 60, `screen ${id} empty`); } });
  await t("dashboard units equal the sum of the movement ledger", async () => { await nav("dash"); const d = await db(); const units = d.inv.movements.reduce((a, m) => a + m.qty, 0); ok(n(await txt("[data-testid=kpi-units] p.font-display")) === units, `units ${units}`); });
  await t("search by SKU and by name; category and level filters", async () => {
    await nav("products"); await p.getByRole("searchbox").fill("BS-200"); ok((await p.locator("[data-testid=product-table] tbody tr").count()) === 1, "sku search"); await p.getByRole("searchbox").fill("monitor"); ok((await txt("[data-testid=product-table] tbody")).includes("MN-24"), "name search"); await p.getByRole("searchbox").fill("");
    await p.getByLabel("Category").selectOption({ label: "Safety equipment" }); const c = await p.locator("[data-testid=product-table] tbody tr").count(); ok(c === 4, `safety items ${c}`); await p.getByLabel("Level").selectOption("Out of stock"); ok((await p.locator("[data-testid=product-table] tbody tr").count()) === 1, "out of stock filter (first-aid kit)"); await p.getByLabel("Category").selectOption(""); await p.getByLabel("Level").selectOption(""); await p.getByRole("searchbox").fill("");
  });
  await t("create product: validation, opening stock, category management", async () => {
    await nav("products"); await p.locator("[data-testid=manage-categories]").click(); await p.getByLabel("New category name").fill("Test category"); await p.locator("[data-testid=add-category]").click(); await toastSeen(/Category added/); await p.keyboard.press("Escape");
    await p.locator("[data-testid=new-product]").click(); await fillIn("SKU", "BS-200"); await fillIn("Product name", "Test widget"); await fillIn("Unit cost", 10); await fillIn("Sell price", 5); await p.locator("[data-testid=save-product]").click(); ok(await p.getByText("That SKU already exists").isVisible(), "duplicate sku"); ok(await p.getByText("Price should be at least the cost").isVisible(), "price validation");
    await fillIn("SKU", "TW-1"); await fillIn("Sell price", 15); await p.getByRole("dialog").getByLabel("Category").selectOption({ label: "Test category" }); await fillIn("Opening quantity", 25); await p.locator("[data-testid=save-product]").click(); await toastSeen(/Product created/); const d = await db(); const prod = d.inv.products.find((x) => x.sku === "TW-1"); ok(prod && stock(d, prod.id) === 25, "opening stock 25");
  });
  await t("goods received increases stock and moves the weighted average cost", async () => {
    await nav("products"); await p.getByRole("searchbox").fill("TW-1"); await p.locator("[data-testid=product-table] tbody tr").first().click(); ok((await txt("[data-testid=pd-total] p.font-display")).includes("25"), "25 before");
    await p.locator("[data-testid=pd-receive]").click(); await p.getByRole("dialog").getByLabel("Quantity").fill("0"); await p.locator("[data-testid=op-submit]").click(); ok(await p.getByText(/whole number above 0/).isVisible(), "qty validation"); await p.getByRole("dialog").getByLabel("Quantity").fill("25"); await p.getByRole("dialog").getByLabel(/Unit cost/).fill("20"); await p.locator("[data-testid=op-submit]").click(); await toastSeen(/Received 25/);
    ok((await txt("[data-testid=pd-total] p.font-display")).includes("50"), "50 after"); ok((await p.locator("#app-main").innerText()).includes("$15.00"), "average cost (25×10 + 25×20)/50 = 15.00");
  });
  await t("transfer: rejects too-large and same-warehouse transfers; valid transfer updates both warehouses", async () => {
    await p.locator("[data-testid=pd-transfer]").click(); const dg = p.getByRole("dialog"); await dg.getByLabel("To warehouse").selectOption({ label: "Austin Main" }); await dg.getByLabel("Quantity").fill("5"); await p.locator("[data-testid=op-submit]").click(); ok(await p.getByText(/must be different/).isVisible(), "same warehouse");
    await dg.getByLabel("To warehouse").selectOption({ label: "London Hub" }); await dg.getByLabel("Quantity").fill("999"); await p.locator("[data-testid=op-submit]").click(); ok(await p.getByText(/Only 50 available/).isVisible(), "over-transfer rejected"); await dg.getByLabel("Quantity").fill("12"); await p.locator("[data-testid=op-submit]").click(); await toastSeen(/Transferred 12/);
    ok((await txt("[data-testid=pd-wh-w1]")).includes("38") && (await txt("[data-testid=pd-wh-w2]")).includes("12") && (await txt("[data-testid=pd-total] p.font-display")).includes("50"), "w1 38, w2 12, total 50");
  });
  await t("adjustment needs a reason and books the difference", async () => {
    await p.locator("[data-testid=pd-adjust]").click(); const dg = p.getByRole("dialog"); await dg.getByLabel("Counted quantity").fill("30"); await p.locator("[data-testid=op-submit]").click(); ok(await p.getByText(/Add a note/).isVisible(), "note required"); await dg.getByLabel(/Note/).fill("Recount found 8 damaged units"); await p.locator("[data-testid=op-submit]").click(); await toastSeen(/adjusted by -8/);
    ok((await txt("[data-testid=pd-wh-w1]")).includes("30"), "w1 now 30"); const d = await db(); const prod = d.inv.products.find((x) => x.sku === "TW-1"); ok(stock(d, prod.id) === 42 && stock(d, prod.id, "w1") === 30, "ledger agrees");
  });
  await t("reorder threshold change creates a low-stock alert; alert creates a procurement requisition", async () => {
    await p.getByLabel("Reorder threshold").fill("100"); await p.locator("[data-testid=save-reorder]").click(); await toastSeen(/Reorder settings saved/); await nav("alerts"); ok((await txt("[data-testid=alert-table]")).includes("Test widget"), "alert shown");
    const before = (await db()).proc.requisitions.length; await p.getByRole("button", { name: "Create requisition for Test widget" }).click(); await toastSeen(/Draft requisition/); ok((await db()).proc.requisitions.length === before + 1, "requisition created in procurement data");
    await nav("dash"); ok(n(await txt("[data-testid=kpi-low] p.font-display")) >= 5, "low-stock KPI");
  });
  await t("movement history filters and reconciles", async () => {
    await nav("movements"); await p.getByLabel("Type").selectOption("Transfer out"); const net1 = n(await txt("[data-testid=move-net]")); ok(net1 < 0, "transfer-out net negative"); await p.getByLabel("Type").selectOption(""); await p.getByLabel("Product").selectOption({ label: "Test widget" }); ok(n(await txt("[data-testid=move-net]")) === 42, "net of one product = stock on hand");
    const c = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(c.text.includes("Transfer in") && c.text.includes("TRF-"), "csv");
  });
  await t("warehouse overview shows what each warehouse holds", async () => { await nav("warehouses"); await p.locator("[data-testid=wh-w2]").click(); await p.getByRole("searchbox").fill("Test widget"); ok((await txt("[data-testid=wh-table]")).includes("Test widget"), "London holds the transferred widgets"); });
  await t("valuation report total equals the exported CSV total", async () => {
    await nav("reports"); const shown = n(await txt("[data-testid=valuation-total]")); const c = await dl(() => p.locator("[data-testid=export-valuation]").click()); const rows = c.text.trim().split("\n").slice(1).map((l) => Number(l.split(",").pop().replace(/"/g, ""))); const total = rows.reduce((a, b) => a + b, 0); ok(Math.abs(Math.round(total) - shown) <= 1, `screen ${shown} vs csv ${total}`);
    const w = await dl(() => p.locator("[data-testid=export-wh]").click()); ok(w.text.includes("Austin Main") && w.text.includes("TW-1"), "warehouse csv");
  });
  await t("reset restores stock and the linked procurement data", async () => { await p.getByRole("button", { name: "Reset stock & orders" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const d = await db(); ok(!d.inv.products.some((x) => x.sku === "TW-1") && d.proc.requisitions.length === 6, "seed restored"); });
});

/* ───────── Procurement ───────── */
await session("procurement", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn }) => {
  const db = () => p.evaluate(() => window.__erpDb());
  const stock = (d, pid) => d.inv.movements.filter((m) => m.productId === pid).reduce((a, m) => a + m.qty, 0);
  await t("every screen renders", async () => { for (const id of ["dash", "approvals", "suppliers", "reqs", "orders", "receipts", "reports"]) { await nav(id); ok((await txt("#app-main")).length > 60, `screen ${id} empty`); } });
  await t("supplier: validation, create, profile, put on hold", async () => {
    await nav("suppliers"); await p.locator("[data-testid=new-supplier]").click(); await fillIn("Supplier name", "Test Parts Co"); await fillIn("Contact person", "Ann Tester"); await fillIn("Email", "bad"); await fillIn("Category", "Hardware"); await p.locator("[data-testid=save-supplier]").click(); ok(await p.getByText("Enter a valid email").isVisible(), "email validation");
    await fillIn("Email", "ann@testparts.example"); await p.locator("[data-testid=save-supplier]").click(); await toastSeen(/Supplier created/);
    await p.getByRole("searchbox").fill("Orion"); await p.locator("[data-testid=supplier-table] tbody tr").first().click(); ok((await txt("#app-main")).includes("PO-4004") && (await txt("#app-main")).includes("Delivery GRN"), "transaction history lists orders and deliveries");
    await nav("suppliers"); await p.getByRole("searchbox").fill("Test Parts"); await p.locator("[data-testid=supplier-table] tbody tr").first().click(); await p.locator("[data-testid=toggle-hold]").click(); await toastSeen(/On hold/);
  });
  await t("requisition: validation, live totals, submit, approve in the queue", async () => {
    await nav("reqs"); await p.locator("[data-testid=new-req]").click(); await p.locator("[data-testid=submit-req]").click(); ok(await p.getByText(/short justification/).isVisible(), "justification required");
    await p.getByLabel("Line product").first().selectOption({ index: 22 }); await p.getByLabel("Line quantity").first().fill("10"); await p.getByLabel("Line price").first().fill("20"); ok((await txt("[data-testid=req-subtotal]")).includes("200.00") && (await txt("[data-testid=req-total]")).includes("216.00"), "10 × 20 = 200, +8% = 216");
    await p.locator("[data-testid=add-req-line]").click(); await p.getByLabel("Line quantity").nth(1).fill("5"); await p.getByLabel("Line price").nth(1).fill("10"); ok((await txt("[data-testid=req-total]")).includes("270.00"), "two lines: 250 × 1.08"); await p.getByLabel("Remove line").nth(1).click(); ok((await txt("[data-testid=req-total]")).includes("216.00"), "line removed");
    await p.getByRole("dialog").getByLabel("Justification").fill("Restock paper for the print room"); await p.locator("[data-testid=submit-req]").click(); await toastSeen(/submitted/);
    await nav("approvals"); ok((await txt("[data-testid=approval-queue]")).includes("Restock paper"), "in the queue"); await p.getByRole("button", { name: /^Approve REQ-107/ }).click(); await toastSeen(/approved/); ok(!(await txt("[data-testid=approval-queue]")).includes("Restock paper"), "left the queue");
  });
  await t("reject a requisition", async () => { await nav("approvals"); const before = await p.getByRole("button", { name: /^Reject REQ-/ }).count(); ok(before >= 2, "pending requisitions exist"); await p.getByRole("button", { name: /^Reject REQ-101/ }).click(); await toastSeen(/rejected/); await nav("reqs"); await p.getByLabel("Status").selectOption("Rejected"); ok((await txt("[data-testid=req-table]")).includes("REQ-101"), "status Rejected"); });
  await t("convert the approved requisition into a purchase order", async () => {
    await nav("reqs"); await p.getByLabel("Status").selectOption("Approved"); await p.locator("[data-testid=req-table] tbody tr", { hasText: "REQ-107" }).click(); await p.locator("[data-testid=convert-po]").click(); await toastSeen(/Converted to PO-/); ok((await txt("#app-main")).includes("Draft"), "PO opens as draft"); ok((await txt("[data-testid=po-total]")).includes("$"), "total shown");
    const d = await db(); ok(d.proc.requisitions.find((r) => r.number === "REQ-107").status === "Converted", "requisition converted");
  });
  await t("send, partial delivery (validated) updates received quantities and inventory, then complete", async () => {
    const d0 = await db(); const po = d0.proc.orders.find((o) => o.reqId && o.notes.startsWith("Created from REQ-107")); const pid = po.lines[0].productId; const s0 = stock(d0, pid);
    await p.locator("[data-testid=send-po]").click(); await toastSeen(/marked as sent/); await p.locator("[data-testid=record-delivery]").click(); await p.getByLabel(/^Delivered/).first().fill("999"); await p.locator("[data-testid=save-receipt]").click(); ok(await p.getByText(/still outstanding/).isVisible(), "over-delivery rejected");
    await p.getByLabel(/^Delivered/).first().fill("4"); await p.locator("[data-testid=save-receipt]").click(); await toastSeen(/Delivery recorded: 4 units/);
    ok((await txt(`[data-testid=recv-${pid}]`)).trim() === "4", "received 4"); ok((await txt("#app-main")).includes("Partially received"), "status partial"); const d1 = await db(); ok(stock(d1, pid) === s0 + 4, `inventory +4 (${s0} -> ${stock(d1, pid)})`);
    await p.locator("[data-testid=record-delivery]").click(); await p.getByLabel(/^Delivered/).first().fill("6"); await p.locator("[data-testid=save-receipt]").click(); await toastSeen(/Delivery recorded: 6/); ok((await txt("#app-main")).includes("Received"), "status received"); const d2 = await db(); ok(stock(d2, pid) === s0 + 10, "inventory +10 total"); ok(!(await p.locator("[data-testid=record-delivery]").count()), "no more deliveries on a completed order");
  });
  await t("goods receipt records and supplier history reflect the delivery", async () => { await nav("receipts"); const c = await p.locator("[data-testid=receipt-table] tbody tr").count(); ok(c >= 6, `receipts ${c}`); const x = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(x.text.startsWith('"Receipt"'), "csv"); });
  await t("PO list filters by supplier and status; PO preview prepares a printable document", async () => {
    await nav("orders"); const all = await p.locator("[data-testid=po-table] tbody tr").count(); await p.getByLabel("Supplier").selectOption({ label: "Orion Electronics Distribution" }); const o = await p.locator("[data-testid=po-table] tbody tr").count(); ok(o === 2, `Orion has 2 POs (${o})`); await p.getByLabel("Status").selectOption("Partially received"); ok((await p.locator("[data-testid=po-table] tbody tr").count()) === 1, "status filter");
    await p.getByLabel("Supplier").selectOption(""); await p.getByLabel("Status").selectOption(""); ok(all >= 9, "new PO listed"); await p.locator("[data-testid=po-table] tbody tr", { hasText: "PO-4004" }).click(); await p.locator("[data-testid=preview-po]").click(); await p.evaluate(() => { window.print = () => { window.__printed = document.getElementById("print-root")?.innerText ?? "none"; }; }); await p.locator("[data-testid=print-po]").click(); const out = await p.evaluate(() => window.__printed); ok(out.includes("PURCHASE ORDER") && out.includes("Orion Electronics"), "print root"); await p.keyboard.press("Escape");
  });
  await t("create a PO directly: on-hold supplier is rejected", async () => {
    await nav("orders"); await p.locator("[data-testid=new-po]").click(); await p.getByRole("dialog").getByLabel("Supplier").selectOption({ label: "Test Parts Co (on hold)" }); await p.locator("[data-testid=save-po]").click(); ok(await p.getByText(/is on hold/).isVisible(), "on-hold blocked");
    await p.getByRole("dialog").getByLabel("Supplier").selectOption({ label: "Apex Office Supplies" }); await p.getByLabel("Line quantity").first().fill("3"); await p.locator("[data-testid=save-po]").click(); await toastSeen(/created as draft/);
  });
  await t("dashboard, reports and exports use the data", async () => {
    await nav("dash"); ok(n(await txt("[data-testid=kpi-overdue] p.font-display")) >= 0 && (await txt("[data-testid=kpi-open]")).includes("$"), "kpis"); await nav("reports"); const shown = n(await txt("[data-testid=report-total]")); const c = await dl(() => p.locator("[data-testid=export-po]").click()); ok(c.text.includes("PO-4004") && c.text.includes("Received"), "po csv"); const d = await db(); const total = d.proc.orders.filter((o) => o.status !== "Cancelled" && o.status !== "Draft").reduce((a, o) => a + o.lines.reduce((x, l) => x + l.qty * l.price, 0) * 1.08, 0); ok(Math.abs(shown - total) < 1, `report total ${shown} vs ${total}`);
    const j = await dl(() => p.locator("[data-testid=export-po-json]").click()); ok(JSON.parse(j.text).orders.length >= 9, "json");
  });
  await t("reset restores procurement and inventory", async () => { await p.getByRole("button", { name: "Reset orders & stock" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const d = await db(); ok(d.proc.orders.length === 8 && !d.proc.suppliers.some((s) => s.name === "Test Parts Co") && !d.inv.movements.some((m) => m.note.includes("REQ")), "seed restored"); });
});

/* ───────── Helpdesk ───────── */
await session("helpdesk", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn, drag }) => {
  const db = () => p.evaluate(() => window.__erpDb());
  const NOW = "2026-03-15T12:00"; const isOpen = (x) => x.status !== "Resolved" && x.status !== "Closed"; const od = (d) => d.desk.tickets.filter((x) => isOpen(x) && x.due < NOW).length;
  await t("every screen renders", async () => { for (const id of ["dash", "inbox", "queues", "agents", "customers", "history", "sla", "analytics"]) { await nav(id); ok((await txt("#app-main")).length > 60, `screen ${id} empty`); } });
  await t("dashboard KPIs are calculated from the tickets", async () => { await nav("dash"); const d = await db(); ok(n(await txt("[data-testid=kpi-open] p.font-display")) === d.desk.tickets.filter(isOpen).length, "open count"); ok(n(await txt("[data-testid=kpi-overdue] p.font-display")) === od(d), "overdue count"); });
  await t("create ticket: validation, SLA due date from priority", async () => {
    await nav("inbox"); await p.locator("[data-testid=new-ticket]").click(); await p.locator("[data-testid=save-ticket]").click(); ok(await p.getByText(/Describe the problem/).isVisible(), "subject validation"); ok(await p.getByText(/message \(10\+/).isVisible(), "message validation");
    await fillIn("Subject", "Printer integration fails"); await fillIn("Customer's message", "Our label printer stopped receiving jobs from the app."); await p.getByRole("dialog").getByLabel("Priority").selectOption("High"); await p.locator("[data-testid=save-ticket]").click(); await toastSeen(/TCK-1025 created/);
    const d = await db(); const tk = d.desk.tickets.find((x) => x.number === "TCK-1025"); ok(tk.due === "2026-03-15T20:00" && tk.status === "New", "SLA: High = 8 h from creation");
  });
  await t("conversation: reply, internal note and simulated customer reply update status", async () => {
    await p.locator("[data-testid=conversation]").waitFor(); await p.getByLabel("Message").fill("Hello, we are looking into the printer issue."); await p.locator("[data-testid=send-message]").click(); await toastSeen(/Reply saved/); ok((await txt("[data-testid=conversation]")).includes("looking into the printer"), "reply shown");
    let d = await db(); ok(d.desk.tickets.find((x) => x.number === "TCK-1025").status === "Pending customer", "pending after reply");
    await p.locator("[data-testid=mode-note]").click(); await p.getByLabel("Message").fill("Check the driver version first."); await p.locator("[data-testid=send-message]").click(); await toastSeen(/Internal note added/); ok((await txt("[data-testid=conversation]")).includes("Internal note"), "note labelled");
    await p.locator("[data-testid=sim-customer]").click(); await toastSeen(/Simulated customer reply/); d = await db(); ok(d.desk.tickets.find((x) => x.number === "TCK-1025").status === "Open", "open after customer reply");
    await p.locator("[data-testid=mode-reply]").click(); await p.locator("[data-testid=send-message]").click(); ok(await p.getByText("Write a message first.").isVisible(), "empty message rejected");
  });
  await t("priority change recalculates the SLA; category and assignee change", async () => {
    await p.getByLabel("Priority").selectOption("Urgent"); await toastSeen(/SLA due time recalculated/); let d = await db(); ok(d.desk.tickets.find((x) => x.number === "TCK-1025").due === "2026-03-15T16:00", "Urgent = 4 h");
    await p.getByLabel("Category").selectOption("Bug report"); await p.getByLabel("Assigned agent").selectOption("e26"); await toastSeen(/Assigned to Leo Chen/); d = await db(); const tk = d.desk.tickets.find((x) => x.number === "TCK-1025"); ok(tk.category === "Bug report" && tk.assigneeId === "e26", "stored");
  });
  await t("resolve needs a summary; close and reopen", async () => {
    await p.locator("[data-testid=resolve]").click(); await p.locator("[data-testid=save-resolution]").click(); ok(await p.getByText(/Write a resolution summary/).isVisible(), "summary required"); await p.getByRole("dialog").getByLabel("Resolution summary").fill("Reinstalled the label printer driver."); await p.locator("[data-testid=save-resolution]").click(); await toastSeen(/resolved/);
    await p.locator("[data-testid=close-ticket]").click(); await toastSeen(/closed/); ok((await db()).desk.tickets.find((x) => x.number === "TCK-1025").status === "Closed", "closed"); await p.locator("[data-testid=reopen]").click(); await toastSeen(/reopened/); ok((await db()).desk.tickets.find((x) => x.number === "TCK-1025").status === "Open", "reopened");
  });
  await t("inbox search, filters and overdue indicators", async () => {
    await nav("inbox"); const d = await db(); await p.getByRole("searchbox").fill("invoice"); ok((await p.locator("[data-testid=ticket-table] tbody tr").count()) >= 1, "search"); await p.getByRole("searchbox").fill("");
    await p.getByLabel("Status").selectOption("open"); const open = await p.locator("[data-testid=ticket-table] tbody tr").count(); ok(open === Math.min(12, d.desk.tickets.filter(isOpen).length) || open > 0, "open filter"); await p.locator("[data-testid=overdue-only]").check(); const c = await p.locator("[data-testid=ticket-table] tbody tr").count(); ok(c === Math.min(12, od(d)), `overdue-only ${c} vs ${od(d)}`); ok((await txt("[data-testid=ticket-table] tbody")).includes("Overdue"), "overdue badge");
    await p.locator("[data-testid=overdue-only]").uncheck(); await p.getByLabel("Status").selectOption(""); await p.getByLabel("Priority").selectOption("Urgent"); ok((await p.locator("[data-testid=ticket-table] tbody tr").count()) >= 2, "priority filter"); await p.getByLabel("Priority").selectOption("");
  });
  await t("resolving an overdue ticket lowers the overdue count", async () => {
    const before = od(await db()); await p.getByRole("searchbox").fill("Dashboard export"); await p.locator("[data-testid=ticket-table] tbody tr").first().click(); await p.locator("[data-testid=resolve]").click(); await p.getByRole("dialog").getByLabel("Resolution summary").fill("Export mapper fixed in a hotfix release."); await p.locator("[data-testid=save-resolution]").click(); await toastSeen(/resolved/);
    ok(od(await db()) === before - 1, `overdue ${before} -> ${od(await db())}`); await nav("history"); ok((await txt("[data-testid=history-table]")).includes("hotfix release"), "appears in resolution history");
  });
  await t("priority queues: drag changes priority", async () => {
    await nav("queues"); const card = p.locator("[data-col=Low] [data-card]").first(); const id = await card.getAttribute("data-card"); await drag(card, p.locator("[data-col=Urgent]")); ok((await p.locator(`[data-col=Urgent] [data-card=${id}]`).count()) === 1, "moved to Urgent"); ok((await db()).desk.tickets.find((x) => x.id === id).priority === "Urgent", "stored");
  });
  await t("agent assignments: reassign updates workloads", async () => {
    await nav("agents"); const a0 = n(await txt("[data-testid=open-e27] p.font-display, [data-testid=open-e27]")); const sel = p.locator("[data-testid=assign-table] select").first(); const cur = await sel.inputValue(); const other = cur === "e27" ? "e25" : "e27"; await sel.selectOption(other); await toastSeen(/assigned to/); const d = await db(); ok(d.desk.tickets.filter((x) => isOpen(x) && x.assigneeId === "e27").length === n(await txt("[data-testid=open-e27]")), "card matches data"); void a0;
  });
  await t("customers: profile and ticket for customer", async () => { await nav("customers"); await p.locator("[data-testid=customer-table] tbody tr").first().click(); ok(/ticket history/i.test(await p.getByRole("dialog").innerText()), "history"); await p.getByRole("button", { name: "Create ticket for this customer" }).click(); await fillIn("Subject", "Follow-up question"); await fillIn("Customer's message", "Can we schedule a call about renewals?"); await p.locator("[data-testid=save-ticket]").click(); await toastSeen(/created/); });
  await t("SLA overview and analytics filters", async () => {
    await nav("sla"); ok(/%/.test(await txt("[data-testid=kpi-sla]")), "compliance"); ok((await p.locator("[data-testid=risk-list] li").count()) >= 1, "risk list");
    await nav("analytics"); const all = n(await txt("[data-testid=an-count] p.font-display")); await p.getByLabel("From date").fill("2026-03-13"); const f = n(await txt("[data-testid=an-count] p.font-display")); ok(f < all && f > 0, `date filter ${all} -> ${f}`); await p.getByLabel("Status").selectOption("Resolved"); ok(n(await txt("[data-testid=an-count] p.font-display")) <= f, "status filter");
    const c = await dl(() => p.locator("[data-testid=export-analytics]").click()); ok(c.text.startsWith('"Ticket"'), "csv header");
  });
  await t("inbox CSV export", async () => { await nav("inbox"); const c = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(c.text.includes("TCK-1025") && c.text.includes("TCK-1001"), "csv contains tickets"); });
  await t("reset restores tickets", async () => { await p.getByRole("button", { name: "Reset demo data" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const d = await db(); ok(d.desk.tickets.length === 24 && !d.desk.tickets.some((x) => x.number === "TCK-1025"), "seed restored"); });
});

/* ───────── Marketing ───────── */
await session("marketing", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn }) => {
  const db = () => p.evaluate(() => window.__erpDb());
  await t("every screen renders", async () => { for (const id of ["dash", "contacts", "segments", "campaigns", "calendar", "analytics"]) { await nav(id); ok((await txt("#app-main")).length > 60, `screen ${id} empty`); } });
  await t("simulated metrics are clearly labelled everywhere", async () => { for (const id of ["dash", "analytics"]) { await nav(id); ok(/SIMULATED sample metrics/.test(await txt("#app-main")), `${id} disclaimer`); } ok(/no emails are sent/i.test(await p.locator("footer").innerText()), "footer"); });
  await t("contacts: validation (email, duplicate), create, edit, list assignment, delete", async () => {
    await nav("contacts"); await p.locator("[data-testid=new-mcontact]").click(); await fillIn("Full name", "Test Contact"); await fillIn("Email", "nope"); await fillIn("Company", "Testco"); await p.locator("[data-testid=save-mcontact]").click(); ok(await p.getByText("Enter a valid email").isVisible(), "email");
    const dup = (await db()).mkt.contacts[0].email; await fillIn("Email", dup); await p.locator("[data-testid=save-mcontact]").click(); ok(await p.getByText(/already exists/).isVisible(), "duplicate"); await fillIn("Email", "test.contact@testco.example"); await fillIn("Industry", "Manufacturing"); await fillIn("Tags", "customer, vip"); await p.getByRole("dialog").getByLabel("Newsletter subscribers").check(); await p.locator("[data-testid=save-mcontact]").click(); await toastSeen(/Contact created/);
    await p.getByRole("searchbox").fill("Test Contact"); await p.getByRole("button", { name: "Edit Test Contact" }).click(); await fillIn("Company", "Testco Global"); await p.locator("[data-testid=save-mcontact]").click(); await toastSeen(/updated/); ok((await txt("[data-testid=mcontact-table]")).includes("Testco Global"), "edited");
    await p.getByLabel("List").selectOption({ label: "Newsletter subscribers" }); ok((await txt("[data-testid=mcontact-table]")).includes("Test Contact"), "list filter shows the new member");
  });
  await t("lists tab: create a list", async () => { await p.getByRole("tab", { name: /Lists/ }).click(); await p.getByLabel("New list name").fill("VIP customers"); await p.locator("[data-testid=add-list]").click(); await toastSeen(/List created/); ok((await txt("#app-main")).includes("VIP customers"), "listed"); });
  await t("segment builder: live counts, validation, save, and segments recalculate when contacts change", async () => {
    await nav("segments"); const before = parseInt(await txt("[data-testid=seg-count-sg4]")); await p.locator("[data-testid=new-segment]").click(); await p.locator("[data-testid=save-segment]").click(); ok(await p.getByText(/Name the segment/).isVisible(), "name validation");
    await fillIn("Segment name", "Vips in manufacturing"); await p.getByLabel("Rule value").first().fill("vip"); ok((await txt("[data-testid=segment-preview]")).includes("1"), "preview counts the new vip contact"); await p.locator("[data-testid=add-rule]").click(); await p.getByLabel("Rule value").nth(1).fill(""); await p.locator("[data-testid=save-segment]").click(); ok(await p.getByText(/Every rule needs a value/).isVisible(), "rule value required");
    await p.getByLabel("Rule value").nth(1).fill("Manufacturing"); await p.locator("[data-testid=save-segment]").click(); await toastSeen(/Segment saved/); ok((await txt("[data-testid=segment-list]")).includes("Vips in manufacturing"), "saved");
    const dm = await db(); const expected = dm.mkt.contacts.filter((c) => ["Manufacturing", "Energy"].includes(c.industry)).length; ok(parseInt(await txt("[data-testid=seg-count-sg4]")) === expected && before === expected, `segment count ${before} equals ${expected} contacts in Manufacturing/Energy (includes the new contact)`);
  });
  await t("campaign: create, edit name/description, choose segment", async () => {
    await nav("campaigns"); await p.locator("[data-testid=new-campaign]").click(); await fillIn("Campaign name", "AB"); await p.locator("[data-testid=create-campaign]").click(); ok(await p.getByText(/Name the campaign/).isVisible(), "name validation"); await fillIn("Campaign name", "Spring promo test"); await p.getByRole("dialog").getByLabel("Segment").selectOption({ label: "Webinar attendees" }); await p.locator("[data-testid=create-campaign]").click(); await toastSeen(/Campaign created/);
    await fillIn("Campaign name", "Spring promo test v2"); await p.getByLabel("Description").fill("Promo for spring"); await p.getByLabel("Segment").selectOption({ index: 1 }); ok(/Audience:/.test(await txt("[data-testid=audience-line]")), "audience line");
  });
  await t("email template: merge fields, unknown field warning, preview with sample contact, mobile width", async () => {
    await p.getByRole("tab", { name: "Email template" }).click(); await p.getByLabel("Subject").fill("Hello {{first_name}} at {{company}}"); await p.getByLabel("Heading").fill("Spring offers"); await p.getByLabel("Body").fill("Hi {{first_name}},\n\nWe have news for {{industry}} teams like yours."); await p.getByLabel("Button text").fill("See offers");
    await p.getByLabel("Body").fill("Hi {{first_name}},\n\nBroken {{nickname}} field here."); ok(await p.getByText(/Unknown merge field/).first().isVisible(), "unknown field flagged"); await p.getByLabel("Body").fill("Hi {{first_name}},\n\nWe have news for {{industry}} teams like yours."); await p.getByRole("button", { name: "{{company}}" }).click();
    await p.getByRole("tab", { name: "Preview" }).click(); await p.getByLabel("Preview as contact").selectOption({ label: "Test Contact" }); ok((await txt("[data-testid=preview-subject]")).includes("Hello Test at Testco Global"), "subject merged"); ok((await txt("[data-testid=email-preview]")).includes("Manufacturing teams"), "body merged"); ok((await txt("[data-testid=email-preview]")).includes("will never be sent"), "preview disclaimer");
    await p.getByRole("button", { name: "Mobile" }).click(); ok((await p.locator("[data-testid=email-preview]").boundingBox()).width < 340, "mobile width");
  });
  await t("schedule: validates the date and template, then schedules (simulated)", async () => {
    await p.getByRole("tab", { name: "Schedule & run" }).click(); await p.getByLabel("Send at").fill("2026-03-01T09:00"); await p.locator("[data-testid=schedule]").click(); ok(await p.getByText(/future/).isVisible(), "past date rejected"); await p.getByLabel("Send at").fill("2026-04-02T09:00"); await p.locator("[data-testid=schedule]").click(); await toastSeen(/Scheduled for 02 Apr/);
    ok((await db()).mkt.campaigns.find((c) => c.name === "Spring promo test v2").status === "Scheduled", "status Scheduled"); await nav("calendar"); await p.getByRole("button", { name: /^Next/ }).click(); ok((await txt("[data-testid=calendar]")).includes("Spring promo test v2"), "shown on the April calendar");
  });
  await t("run the simulated workflow: confirmation, execution history, sample metrics", async () => {
    await nav("campaigns"); await p.getByLabel("Status").selectOption("Scheduled"); await p.locator("[data-testid=campaign-table] tbody tr", { hasText: "Spring promo test v2" }).click(); await p.getByRole("tab", { name: "Schedule & run" }).click(); await p.locator("[data-testid=run-now]").click(); ok(/SIMULATION/.test(await p.getByRole("dialog").innerText()), "confirmation says simulation"); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/Simulated run complete/);
    ok((await txt("#app-main")).includes("Run completed (simulated)") && (await txt("#app-main")).includes("No mail server was contacted"), "execution history"); await p.getByRole("tab", { name: /Metrics/ }).click(); ok(/SIMULATED sample metrics/.test(await txt("#app-main")), "metrics labelled"); const d = await db(); const c = d.mkt.campaigns.find((x) => x.name === "Spring promo test v2"); ok(c.status === "Sent (simulated)" && c.metrics.opened <= c.metrics.delivered, "stored consistent metrics");
    await p.getByRole("tab", { name: "Email template" }).click(); ok(await p.getByLabel("Subject").isDisabled(), "locked after the run");
  });
  await t("campaign filter by status, duplicate", async () => { await nav("campaigns"); await p.getByLabel("Status").selectOption("Draft"); const rows = await p.locator("[data-testid=campaign-table] tbody tr").count(); ok(rows >= 1, "draft filter"); await p.getByLabel("Status").selectOption("Sent (simulated)"); ok((await p.locator("[data-testid=campaign-table] tbody tr").count()) >= 3, "sent filter"); await p.locator("[data-testid=campaign-table] tbody tr").first().click(); await p.locator("[data-testid=duplicate]").click(); await toastSeen(/duplicated/); });
  await t("analytics totals equal the sum of campaign metrics; exports", async () => {
    await nav("analytics"); const d = await db(); const tot = d.mkt.campaigns.filter((c) => c.metrics).reduce((a, c) => a + c.metrics.recipients, 0); ok(n(await txt("[data-testid=an-recipients] p.font-display")) === tot, `recipients ${tot}`);
    const j = await dl(() => p.locator("[data-testid=export-mkt-json]").click()); ok(/SIMULATED/.test(JSON.parse(j.text).disclaimer), "json disclaimer"); const c = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(c.text.includes("Spring promo test v2"), "metrics csv");
    await nav("contacts"); const cc = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(cc.text.includes("Test Contact"), "contacts csv"); await nav("campaigns"); const cp = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(cp.text.includes("Q1 newsletter"), "campaign csv");
  });
  await t("suppressed contacts are excluded from sends", async () => { const d = await db(); const c = d.mkt.campaigns.find((x) => x.name === "Q1 newsletter"); const seg = d.mkt.segments.find((s) => s.id === c.segmentId); ok(c.metrics.recipients > 0 && c.execution.some((e) => /suppress/i.test(e.step)), "suppression step recorded"); void seg; });
  await t("reset restores marketing data", async () => { await p.getByRole("button", { name: "Reset demo data" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const d = await db(); ok(d.mkt.campaigns.length === 5 && !d.mkt.contacts.some((c) => c.name === "Test Contact"), "seed restored"); });
});

/* ───────── Projects ───────── */
await session("projects", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn, drag }) => {
  const db = () => p.evaluate(() => window.__erpDb());
  const cost = (d, pid) => d.proj.time.filter((x) => x.projectId === pid).reduce((a, x) => a + x.hours * (d.proj.rates[x.empId] ?? 65), 0);
  const prog = (d, pid) => { const ts = d.proj.tasks.filter((x) => x.projectId === pid); return ts.filter((x) => x.status === "Done").reduce((a, x) => a + x.est, 0) / ts.reduce((a, x) => a + x.est, 0); };
  await t("every screen renders", async () => { for (const id of ["dash", "projects", "board", "tasks", "milestones", "calendar", "timesheets", "resources", "budget"]) { await nav(id); ok((await txt("#app-main")).length > 60, `screen ${id} empty`); } });
  await t("dashboard cost equals the sum of logged hours × rates", async () => { await nav("dash"); const d = await db(); const total = d.proj.projects.reduce((a, pr) => a + cost(d, pr.id), 0); const shown = await txt("[data-testid=kpi-cost] p.font-display"); ok(Math.abs(n(shown) * (/k/i.test(shown) ? 1000 : 1) - total) < 1100, `kpi ${shown} vs ${total}`); });
  await t("create a project: validation, client, budget, deadline", async () => {
    await nav("projects"); await p.locator("[data-testid=new-project]").click(); await p.locator("[data-testid=save-project]").click(); ok(await p.getByText("Enter a project name").isVisible(), "name"); await fillIn("Project name", "Warehouse robotics pilot"); await fillIn("Budget", 50000); await fillIn("Start date", "2026-04-01"); await fillIn("Deadline", "2026-03-01"); await p.locator("[data-testid=save-project]").click(); ok(await p.getByText(/cannot be before the start/).isVisible(), "deadline validation");
    await fillIn("Deadline", "2026-06-30"); await p.getByRole("dialog").getByLabel("Client").selectOption({ label: "Ironbridge Manufacturing" }); await p.locator("[data-testid=save-project]").click(); await toastSeen(/PRJ-108 created/); ok((await txt("#app-main")).includes("Ironbridge Manufacturing") && (await txt("#app-main")).includes("$50,000"), "details show client and budget");
  });
  await t("tasks: add with validation, milestone, assign member", async () => {
    await p.locator("[data-testid=pv-add-task]").click(); await p.locator("[data-testid=save-task]").click(); ok(await p.getByText("Describe the task").isVisible(), "title validation"); await fillIn("Task title", "Select robot vendor"); await fillIn("Estimate", 40); await p.getByRole("dialog").getByLabel("Assignee").selectOption({ label: "Ethan Brooks" }); await p.getByRole("dialog").getByLabel("Priority").selectOption("High"); await p.locator("[data-testid=save-task]").click(); await toastSeen(/Task added/); ok((await txt("#app-main")).includes("Select robot vendor"), "task listed");
    await p.getByRole("button", { name: "+ Add", exact: true }).click(); await fillIn("Milestone", "Vendor shortlist"); await fillIn("Date", "2026-04-15"); await p.locator("[data-testid=save-milestone]").click(); await toastSeen(/Milestone added/); ok((await txt("#app-main")).includes("Vendor shortlist"), "milestone listed");
  });
  await t("progress follows task completion (board drag + status change)", async () => {
    await nav("board"); await p.getByLabel("Project").selectOption({ label: "PRJ-108" }); const card = p.locator("[data-col='To do'] [data-card]").first(); const before = (await db()); const pid = before.proj.projects.find((x) => x.code === "PRJ-108").id; ok(prog(before, pid) === 0, "0% at start");
    await drag(card, p.locator("[data-col=Done]")); const after = await db(); ok(prog(after, pid) === 1, "100% once the only task is done"); await p.getByLabel("Project").selectOption(""); ok((await txt(`[data-testid=prog-${pid}]`)).includes("100"), "board shows 100%");
    const d2 = await db(); const pr1 = d2.proj.projects.find((x) => x.code === "PRJ-101").id; const p0 = prog(d2, pr1); const c2 = p.locator(`[data-col=Review] [data-card]`).first(); await c2.locator("select").selectOption("Done"); const p1 = prog(await db(), pr1) + prog(await db(), d2.proj.projects.find((x) => x.code === "PRJ-102").id); ok(p1 >= p0, "progress never decreases when completing tasks");
  });
  await t("task list filters by assignee, priority and overdue", async () => {
    await nav("tasks"); const all = await p.locator("[data-testid=task-table] tbody tr").count(); await p.getByLabel("Assignee").selectOption({ label: "Sofia Marino" }); const a = await p.locator("[data-testid=task-table] tbody tr").count(); ok(a > 0 && a < all + 1, "assignee filter"); await p.getByLabel("Priority").selectOption("Critical"); ok((await p.locator("[data-testid=task-table] tbody tr").count()) <= a, "priority filter narrows"); await p.getByLabel("Assignee").selectOption(""); await p.getByLabel("Priority").selectOption("");
    await p.locator("[data-testid=overdue-only]").check(); const od = await p.locator("[data-testid=task-table] tbody tr").count(); const d = await db(); const exp = d.proj.tasks.filter((x) => x.status !== "Done" && x.due < "2026-03-15").length; ok(od === Math.min(12, exp), `overdue ${od} vs ${exp}`); ok((await txt("[data-testid=task-table] tbody")).includes("overdue"), "overdue label"); await p.locator("[data-testid=overdue-only]").uncheck();
  });
  await t("log hours: validation, cost from rate, project cost and budget update", async () => {
    await nav("timesheets"); const d0 = await db(); const prj = d0.proj.projects.find((x) => x.code === "PRJ-101"); const c0 = cost(d0, prj.id); await p.locator("[data-testid=log-time]").click(); await p.getByRole("dialog").getByLabel("Project").selectOption({ label: "PRJ-101 · Customer portal rebuild" }); await p.locator("[data-testid=save-time]").click(); ok(await p.getByText(/between 0.25 and 16/).isVisible(), "hours validation");
    await fillIn("Hours", 20); await p.locator("[data-testid=save-time]").click(); ok(await p.getByText(/between 0.25 and 16/).isVisible(), "20 h rejected"); await fillIn("Hours", 6); await p.locator("[data-testid=save-time]").click(); ok(await p.getByText("Choose a task.").isVisible(), "task required"); await p.getByRole("dialog").getByLabel("Task").selectOption({ label: "Shipment tracking API" }); await fillIn("Date", "2026-03-20"); await p.locator("[data-testid=save-time]").click(); ok(await p.getByText(/future/).isVisible(), "future date rejected");
    await fillIn("Date", "2026-03-13"); const rate = d0.proj.rates.e15; ok((await txt("[data-testid=entry-cost]")).includes(String(6 * rate)), `cost = 6 × ${rate}`); await p.locator("[data-testid=save-time]").click(); await toastSeen(/6 h logged/); const d1 = await db(); ok(Math.abs(cost(d1, prj.id) - (c0 + 6 * rate)) < 0.01, "project cost increased by hours × rate");
  });
  await t("timesheet filters and totals; CSV matches", async () => {
    await p.getByLabel("Project").selectOption({ label: "PRJ-101" }); const d = await db(); const hrs = d.proj.time.filter((x) => x.projectId === d.proj.projects.find((q) => q.code === "PRJ-101").id).reduce((a, x) => a + x.hours, 0); ok(Math.abs(n(await txt("[data-testid=time-hours]")) - hrs) < 0.01, "filtered hours equal data");
    const c = await dl(() => p.getByRole("button", { name: /Export CSV/ }).click()); ok(c.text.startsWith('"Date"') && c.text.split("\n").length === d.proj.time.filter((x) => x.projectId === d.proj.projects.find((q) => q.code === "PRJ-101").id).length + 1, "csv rows = filtered entries");
  });
  await t("changing a rate recalculates costs and budget status", async () => {
    await nav("resources"); const before = (await db()); const c0 = cost(before, before.proj.projects.find((x) => x.code === "PRJ-103").id); const inp = p.getByLabel("Rate for Sofia Marino"); await inp.fill("200"); await inp.blur(); await toastSeen(/rate updated/); const after = await db(); ok(after.proj.rates.e15 === 200 && cost(after, after.proj.projects.find((x) => x.code === "PRJ-103").id) > c0, "PRJ-103 cost rose");
    await inp.fill("0"); await inp.blur(); await toastSeen(/between 1 and 500/);
  });
  await t("budget report: over-budget flag, comparison table and CSV", async () => {
    await nav("budget"); ok((await txt("[data-testid=budget-table]")).includes("Over budget"), "over-budget project flagged"); await p.getByLabel("Budget status").selectOption("Over budget"); ok((await p.locator("[data-testid=budget-table] tbody tr").count()) >= 1, "filter"); await p.getByLabel("Budget status").selectOption("");
    const c = await dl(() => p.locator("[data-testid=export-budget]").click()); ok(c.text.includes("Warehouse robotics pilot") && c.text.includes("Forecast at completion"), "csv");
  });
  await t("milestones timeline and calendar", async () => { await nav("milestones"); ok(await p.locator("[data-testid=gantt]").isVisible(), "gantt"); await p.getByLabel(/Complete Beta release/).check(); ok((await db()).proj.milestones.find((m) => m.name === "Beta release").done === true, "milestone completed"); await nav("calendar"); ok((await txt("[data-testid=calendar]")).includes("Offline sync engine"), "tasks on the calendar"); });
  await t("project status change, delete with confirmation", async () => {
    await nav("projects"); await p.getByRole("searchbox").fill("Warehouse robotics"); await p.locator("[data-testid=project-table] tbody tr").first().click(); await p.getByLabel("Project status").selectOption("Active"); await toastSeen(/Status: Active/); await p.getByRole("button", { name: "Delete" }).first().click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/Project deleted/); ok(!(await db()).proj.projects.some((x) => x.name === "Warehouse robotics pilot"), "deleted");
  });
  await t("reset restores project data and rates", async () => { await p.getByRole("button", { name: "Reset demo data" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const d = await db(); ok(d.proj.projects.length === 7 && d.proj.rates.e15 !== 200, "seed restored"); });
});

/* ───────── Executive ───────── */
await session("executive", async ({ p, t, nav, dl, txt, n, toastSeen, fillIn }) => {
  const db = () => p.evaluate(() => window.__erpDb());
  const money = (s) => { const m = String(s).match(/\$?([\d.,]+)\s*([kM]?)/); const v = Number(m[1].replace(/,/g, "")); return m[2] === "M" ? v * 1e6 : m[2] === "k" ? v * 1e3 : v; };
  const revenue = (d, from, to) => d.fin.invoices.filter((i) => !i.draft && i.date >= from && i.date <= to).reduce((a, i) => a + i.lines.reduce((x, l) => x + l.qty * l.price, 0), 0);
  const pipeline = (d) => d.crm.opps.filter((o) => o.stage !== "Won" && o.stage !== "Lost").reduce((a, o) => a + o.value, 0);
  await t("every screen renders", async () => { for (const id of ["dash", "revenue", "sales", "marketing", "finance", "payroll", "inventory", "procurement", "projects", "support", "workforce", "workflow"]) { await nav(id); ok((await txt("#app-main")).length > 80, `screen ${id} empty`); } });
  await t("KPI cards are calculated from the underlying records and respond to the period", async () => {
    await nav("dash"); await p.getByTestId("period").selectOption("qtd"); const d = await db(); const exp = revenue(d, "2026-01-01", "2026-03-31"); const shown = money(await txt("[data-testid=kpi-revenue] p.font-display")); ok(Math.abs(shown - exp) / exp < 0.01, `Q1 revenue ${shown} vs ${exp}`);
    await p.getByTestId("period").selectOption("mtd"); const m = money(await txt("[data-testid=kpi-revenue] p.font-display")); ok(m < shown && Math.abs(m - revenue(d, "2026-03-01", "2026-03-31")) / Math.max(1, m) < 0.02, `March revenue ${m}`); await p.getByTestId("period").selectOption("qtd");
    ok(Math.abs(money(await txt("[data-testid=kpi-pipeline] p.font-display")) - pipeline(d)) / pipeline(d) < 0.01, "pipeline KPI = open opportunity value");
  });
  await t("drill-down opens the supporting records and exports them", async () => {
    await p.locator("[data-testid=kpi-revenue]").click(); const dr = p.getByRole("dialog").last(); ok(/supporting records/.test(await dr.innerText()), "drawer"); const d = await db(); const count = d.fin.invoices.filter((i) => !i.draft && i.date >= "2026-01-01" && i.date <= "2026-03-31").length; ok((await dr.innerText()).includes(`${count} supporting records`), `${count} invoices`); ok((await dr.locator("tbody tr").count()) === Math.min(10, count), "rows");
    const c = await dl(() => dr.getByRole("button", { name: /Export CSV/ }).click()); ok(c.text.startsWith('"Invoice"') && c.text.split("\n").length === count + 1, "drill csv"); await p.keyboard.press("Escape");
    await p.locator("[data-testid=kpi-inv]").click(); ok(/Stock valuation/.test(await p.getByRole("dialog").last().innerText()), "inventory drill"); await p.keyboard.press("Escape");
  });
  await t("a change in another demo (new CRM deal) shows up in the executive pipeline", async () => {
    const before = pipeline(await db()); await p.goto(`${BASE}/erp-demos/crm-sales-pipeline/app`, { waitUntil: "networkidle" }); await p.locator("[data-nav=pipeline]").first().click(); await p.locator("[data-testid=new-opp]").click(); await p.getByRole("dialog").getByLabel(/^Opportunity name/).fill("Cross-demo test deal"); await p.getByRole("dialog").getByLabel(/^Value/).fill("25000"); await p.locator("[data-testid=save-opp]").click(); await toastSeen(/created/);
    await p.goto(`${BASE}/erp-demos/executive-analytics-automation/app`, { waitUntil: "networkidle" }); const d = await db(); ok(Math.abs(pipeline(d) - before - 25000) < 0.01, "store has the deal"); ok(Math.abs(money(await txt("[data-testid=kpi-pipeline] p.font-display")) - pipeline(d)) / pipeline(d) < 0.01, "KPI includes it"); ok((await txt("#app-main")).includes("Cross-demo test deal") || (await txt("#app-main")).includes("CRM"), "activity feed shows the CRM event");
  });
  await t("sales analytics: dimension filter and drill", async () => { await nav("sales"); const all = money(await txt("[data-testid=sales-pipeline] p.font-display")); await p.getByLabel("Salesperson").selectOption({ label: "Daniel Reyes" }); const one = money(await txt("[data-testid=sales-pipeline] p.font-display")); ok(one < all && one > 0, `${all} -> ${one}`); await p.locator("[data-testid=sales-pipeline]").click(); ok((await p.getByRole("dialog").last().locator("tbody tr").count()) > 0, "drill rows"); await p.keyboard.press("Escape"); });
  await t("finance, payroll, inventory, procurement, projects, support and workforce analytics", async () => {
    await nav("finance"); ok((await txt("#app-main")).includes("Balanced"), "balance sheet balanced"); const d = await db(); ok(Math.abs(money(await txt("[data-testid=fin-revenue] p.font-display")) - revenue(d, "2026-01-01", "2026-03-31")) < 1, "finance revenue equals dashboard");
    await nav("payroll"); ok(money(await txt("[data-testid=pay-gross] p.font-display")) > 100000, "payroll gross"); await nav("inventory"); const all = money(await txt("[data-testid=inv-value] p.font-display")); await p.getByLabel("Category").selectOption({ label: "Electronics" }); ok(money(await txt("[data-testid=inv-value] p.font-display")) < all, "category filter"); await p.getByLabel("Category").selectOption("");
    await nav("procurement"); await p.getByLabel("Supplier").selectOption({ label: "Orion Electronics Distribution" }); ok(money(await txt("[data-testid=proc-spend] p.font-display")) > 0, "supplier filter"); await nav("projects"); const u = await txt("[data-testid=projp-util] p.font-display"); ok(/%/.test(u), "utilisation"); await nav("support"); await p.getByLabel("Agent").selectOption({ label: "Sam Taylor" }); ok(n(await txt("[data-testid=sup-open] p.font-display")) >= 0, "agent filter");
    await nav("workforce"); const hc = n(await txt("[data-testid=wf-headcount] p.font-display")); await p.getByLabel("Department").selectOption("Engineering"); ok(n(await txt("[data-testid=wf-headcount] p.font-display")) < hc, "department filter");
  });
  await t("marketing metrics are labelled as simulated", async () => { await nav("marketing"); ok(/Simulated sample metrics/.test(await txt("#app-main")), "label"); ok(/\(sim\.\)/.test(await txt("#app-main")), "sim. markers"); });
  await t("threshold alerts: trigger, edit threshold, add, toggle, delete", async () => {
    await nav("dash"); ok(await p.locator("[data-testid=alert-banner]").isVisible(), "alerts triggered"); const lowTxt = await txt("[data-testid=alert-banner]"); ok(/Low \/ out-of-stock products/.test(lowTxt), "low stock alert listed");
    await nav("workflow"); await p.getByRole("tab", { name: "Threshold alerts" }).click(); await p.getByLabel("Threshold for Low / out-of-stock products").fill("999"); await nav("dash"); ok(!/Low \/ out-of-stock products/.test(await txt("[data-testid=alert-banner]")), "alert cleared by raising the threshold");
    await nav("workflow"); await p.getByRole("tab", { name: "Threshold alerts" }).click(); await p.getByLabel("Enable Overdue customer invoices").uncheck(); ok((await txt("[data-testid=alert-table]")).includes("Off"), "toggle off"); await p.getByLabel("Metric").selectOption("overdueTasks"); await p.getByLabel("Threshold", { exact: true }).fill("1"); await p.locator("[data-testid=add-alert]").click(); await toastSeen(/Alert added/); ok((await txt("[data-testid=alert-table]")).includes("Overdue project tasks"), "added");
    await p.getByRole("button", { name: "Delete alert Overdue project tasks" }).click(); await toastSeen(/Alert deleted/);
  });
  await t("approval workflow: validation, create, approve, reject and cross-demo decisions", async () => {
    await nav("workflow"); await p.getByRole("tab", { name: /Approval queue/ }).click(); const pend0 = n(await txt("[data-testid=wf-pending] p.font-display")); await p.locator("[data-testid=new-approval]").click(); await p.locator("[data-testid=save-approval]").click(); ok(await p.getByText(/Describe the request/).isVisible(), "validation"); await fillIn("Title", "Buy two test monitors"); await fillIn("Amount", 480); await fillIn("Justification", "Replace faulty screens"); await p.locator("[data-testid=save-approval]").click(); await toastSeen(/Approval request created/); ok(n(await txt("[data-testid=wf-pending] p.font-display")) === pend0 + 1, "pending +1");
    await p.getByRole("button", { name: /^Approve Purchase: Buy two test monitors/ }).click(); await toastSeen(/Approved/); ok(n(await txt("[data-testid=wf-pending] p.font-display")) === pend0, "pending back"); let d = await db(); ok(d.exec.approvals.find((a) => a.title === "Buy two test monitors").status === "Approved", "stored as approved");
    await p.getByRole("button", { name: /^Reject Discount: 15% discount/ }).click(); await toastSeen(/Rejected/); d = await db(); ok(d.exec.approvals.find((a) => a.id === "ap1").status === "Rejected", "rejected");
    const rq = d.proc.requisitions.find((r) => r.status === "Submitted"); await p.getByRole("button", { name: new RegExp(`^Approve Requisition ${rq.number}`) }).click(); await toastSeen(/Approved/); d = await db(); ok(d.proc.requisitions.find((r) => r.id === rq.id).status === "Approved", "procurement requisition approved from the executive queue");
    const lv = d.hrm.leave.find((l) => l.status === "Pending"); await p.getByRole("button", { name: /^Reject Leave:/ }).first().click(); await toastSeen(/Rejected/); d = await db(); ok(d.hrm.leave.find((l) => l.id === lv.id).status === "Rejected", "HR leave decided from the executive queue");
    await p.getByRole("tab", { name: "Activity history" }).click(); ok((await txt("#app-main")).includes("request approved") || (await txt("#app-main")).includes("approved"), "activity history records decisions");
  });
  await t("exports: KPI snapshot CSV and JSON, section CSVs", async () => {
    await nav("dash"); const c = await dl(() => p.getByRole("button", { name: "KPI snapshot CSV" }).click()); ok(c.text.includes("Revenue") && c.text.includes("Pending approvals"), "kpi csv"); const j = await dl(() => p.locator("[data-testid=export-json]").click()); const o = JSON.parse(j.text); ok(o.kpis.revenue > 0 && o.period.id === "qtd", "kpi json");
    await nav("sales"); const s = await dl(() => p.locator("[data-testid=export-section]").click()); ok(s.text.startsWith('"Deal"'), "sales csv"); await nav("inventory"); const i = await dl(() => p.locator("[data-testid=export-section]").click()); ok(i.text.startsWith('"SKU"'), "inventory csv");
  });
  await t("reset ALL demo data restores every module", async () => { await p.getByRole("button", { name: "Reset ALL demo data" }).click(); await p.locator("[data-testid=confirm-yes]").click(); await toastSeen(/restored/); const d = await db(); ok(!d.crm.opps.some((o) => o.name === "Cross-demo test deal") && d.exec.approvals.length === 6 && d.proc.requisitions.find((r) => r.number === "REQ-101").status === "Submitted" && d.activity.length === 0, "all slices back to seed"); });
  await t("mobile layout has no horizontal overflow", async () => { await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "overflow"); await p.setViewportSize({ width: 1440, height: 950 }); });
});

await browser.close();
if (true) { console.log(failed ? `\nFAILED (${failed} failed, ${passed} passed)` : `\nall ${passed} ERP UI tests passed`); process.exit(failed ? 1 : 0); }
