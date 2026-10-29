#!/usr/bin/env node
/**
 * Flow (workflow automation) and BI (CSV import + query) running in the browser with NO business API (Playwright).
 *   NODE_PATH=<dir with playwright> BASE_URL=http://localhost:3000 node scripts/test-erp-flow-local.mjs
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let failed = 0, passed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage(); p.setDefaultTimeout(15000);
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
const t = async (label, f) => { try { await f(); passed++; console.log("  ✓", label); } catch (e) { failed++; console.error("  ✗", label, "\n     ", String(e.message).split("\n")[0]); await p.screenshot({ path: `/tmp/claude-0/flow-local-fail-${failed}.png` }).catch(() => undefined); } };
const open = async (slug) => { await p.goto(`${BASE}/erp-demos/${slug}/app`, { waitUntil: "domcontentloaded" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => undefined); await p.waitForSelector("[data-testid=sync-badge]"); };
/** Query the in-browser engine exactly like the screens do. */
const get = async (path) => ({ status: 200, body: await p.evaluate((x) => window.__erpLocalApi(x), path) });
const idle = async () => { await p.waitForTimeout(600); };
const toastSeen = (re) => p.locator("[data-testid=toast]", { hasText: re }).first().waitFor({ timeout: 6000 });
const fill = async (label, v) => p.getByRole("dialog").last().getByLabel(new RegExp("^" + label)).first().fill(String(v));
await p.goto(`${BASE}/erp-demos/workflow-automation-engine/app`, { waitUntil: "domcontentloaded" }); await p.evaluate(() => localStorage.clear());
await t("Flow is usable with no server: footer says local, no 'requires backend' panel", async () => { await open("workflow-automation-engine"); ok((await p.locator("[data-testid=flow-needs-server]").count()) === 0, "needs-server panel shown"); ok(/local|Local/.test(await p.locator("[data-testid=sync-badge]").innerText()), "badge"); });
console.log("== workflow automation");
await open("workflow-automation-engine");
await t("example workflows can be added, validated and stored", async () => {
  await p.locator("[data-testid=add-examples]").click(); await toastSeen(/Example workflows added/);
  await p.locator("[data-testid=workflow-list] [data-testid=wf-name]").first().waitFor(); const n = await p.locator("[data-testid=workflow-list] [data-testid=wf-name]").count(); ok(n === 3, "workflows shown: " + n);
});
await t("the builder reports validation errors by the engine", async () => {
  await p.locator("[data-testid=new-workflow]").click(); await p.locator("[data-testid=save-workflow]").click();
  const e = await p.locator("[data-testid=validation-errors]").innerText(); ok(/needs a name/.test(e) && /at least one step/.test(e), e); await p.keyboard.press("Escape"); await p.getByRole("dialog").waitFor({ state: "detached" });
});
await t("a new workflow can be built, saved and activated", async () => {
  await p.locator("[data-testid=new-workflow]").click(); await p.locator("[data-testid=wf-name-input]").fill("Any lead: alert"); await p.locator("[data-testid=trigger-select]").selectOption("crm.leads");
  await p.locator("[data-testid=add-step]").click(); await p.locator("[data-testid=step-type]").selectOption("create_alert"); await p.locator("[data-testid=alert-title]").fill("New lead {{name}}");
  await p.locator("[data-testid=save-workflow]").click(); await toastSeen(/Workflow saved/);
  const card = p.locator("[data-testid=workflow-list] section", { hasText: "Any lead: alert" }); await card.waitFor(); await card.locator("[data-testid=toggle-active]").click(); await toastSeen(/activated/);
  ok((await get("/flow/workflows?q=Any%20lead")).body.items[0].active === true, "active on server");
});
await t("a test run executes real steps and the log shows each one", async () => {
  const card = p.locator("[data-testid=workflow-list] section", { hasText: "High-value lead" }); await card.locator("[data-testid=test-run]").click(); await p.locator("[data-testid=run-now]").click();
  const log = p.locator("[data-testid=step-log]"); await log.waitFor(); const txt = await log.innerText(); ok(/created task/.test(txt) && /created alert/.test(txt), txt);
  ok(/Call Test Buyer/.test(JSON.stringify((await get("/crm/activities?q=Test%20Buyer")).body)), "task stored in CRM activities"); await p.keyboard.press("Escape");
});
await t("creating a matching lead in the CRM demo triggers the active workflow automatically", async () => {
  const n0 = (await get("/flow/runs")).body.total;
  await open("crm-sales-pipeline"); await p.locator("[data-nav=leads]").first().click();
  await p.locator("[data-testid=new-lead]").click(); await fill("Full name", "Auto Trigger"); await fill("Company", "Autoco"); await fill("Email", "auto@autoco.example"); await fill("Estimated value", 50000); await p.locator("[data-testid=save-lead]").click(); await toastSeen(/Lead created/); await idle();
  const runs = (await get("/flow/runs?limit=50")).body; ok(runs.total >= n0 + 2, `runs ${n0} -> ${runs.total}`); ok(runs.items.some((r) => r.auto && r.payload.name === "Auto Trigger" && r.status === "succeeded"), "automatic run of the high-value workflow");
  ok(JSON.stringify((await get("/crm/activities?q=Auto%20Trigger")).body).includes("Call Auto Trigger"), "task created");
});
await t("an approval step pauses the run until it is approved, then continues", async () => {
  await open("helpdesk-service-management");
  await p.evaluate(() => window.__erpSetDb((d) => ({ ...d, desk: { ...d.desk, tickets: [{ ...d.desk.tickets[0], id: "tk_urgent", number: "T-9999", subject: "Server down", priority: "Urgent", status: "New" }, ...d.desk.tickets] } }))); await idle();
  await open("workflow-automation-engine"); await p.getByRole("tab", { name: /Approvals/ }).click().catch(async () => p.getByText(/^Approvals/).first().click());
  const row = p.locator("[data-testid=approval-list] section", { hasText: "Server down" }); await row.waitFor();
  const alerts0 = (await get("/flow/alerts")).body.total; await row.locator("[data-testid=approve]").click(); await toastSeen(/Approved/);
  ok((await get("/flow/alerts")).body.total === alerts0 + 1, "alert step ran only after approval");
});

console.log("== BI import and query");
await open("executive-analytics-automation");
await p.locator("[data-nav=explore]").click();
const CSV = "date,region,sales\n2026-01-05,North,100\n2026-01-20,South,200\n2026-02-03,North,50\n";
await t("a CSV is previewed, then imported, and the grouped totals are computed by the server", async () => {
  await p.locator("[data-testid=csv-file]").setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await p.locator("[data-testid=csv-preview]").click(); const pv = await p.locator("[data-testid=csv-preview-result]").innerText(); ok(/3\s*valid rows of 3/.test(pv.replace(/\n/g, " ")) && /not stored yet/.test(pv), pv);
  ok((await get("/bi/datasets")).body.datasets.length === 0, "preview must not store");
  await p.locator("[data-testid=csv-commit]").click(); await toastSeen(/Imported 3 rows/);
  await p.locator("[data-testid=bi-group]").selectOption("region"); await p.locator("[data-testid=bi-metric]").selectOption("sales"); await p.locator("[data-testid=bi-run]").click();
  const tb = (await p.locator("[data-testid=bi-table]").innerText()).replace(/\s+/g, " "); ok(/North 150/.test(tb) && /South 200/.test(tb), tb); ok((await p.locator("[data-testid=bi-total]").innerText()) === "350", "total");
});
await t("date range and filter narrow the result", async () => {
  await p.locator("[data-testid=bi-datecol]").selectOption("date"); await p.locator("[data-testid=bi-from]").fill("2026-02-01"); await p.locator("[data-testid=bi-run]").click();
  await p.waitForTimeout(500); const dt = await p.locator("[data-testid=bi-total]").innerText(); ok(dt === "50", "date range total " + dt); await p.locator("[data-testid=bi-from]").fill(""); await p.waitForTimeout(100);
  await p.locator("[data-testid=bi-fcol]").selectOption("region"); await p.locator("[data-testid=bi-fval]").fill("South"); await p.locator("[data-testid=bi-run]").click(); await p.waitForTimeout(500); const ft = await p.locator("[data-testid=bi-total]").innerText(); ok(ft === "200", "filter total " + ft);
});
await t("the demo's own records can be queried and match the data", async () => {
  await p.locator("[data-testid=bi-source]").selectOption("records:crm.opps"); await p.locator("[data-testid=bi-metric]").selectOption("value"); await p.locator("[data-testid=bi-group]").selectOption("stage"); await p.locator("[data-testid=bi-run]").click();
  const total = Number((await p.locator("[data-testid=bi-total]").innerText()).replace(/[^0-9.]/g, "")); const expect = await p.evaluate(() => window.__erpDb().crm.opps.reduce((a, o) => a + o.value, 0)); ok(total === expect, `${total} vs ${expect}`);
});
await t("invalid rows are listed and block the import; a binary file is refused", async () => {
  await p.locator("[data-testid=csv-file]").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(CSV + "2026-13-45,West,5\n2026-02-09,West,abc\n") });
  await p.locator("[data-testid=csv-preview]").click(); const pv = await p.locator("[data-testid=csv-preview-result]").innerText(); ok(/2\s*invalid/.test(pv) && /Line 5/.test(pv), pv);
  await p.locator("[data-testid=csv-commit]").click(); ok(/Fix the file|not a valid date|not a number/.test(await p.locator("[data-testid=csv-error]").innerText()), "commit refused");
  await p.locator("[data-testid=csv-file]").setInputFiles({ name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("\x89PNG\r\n\x1a\nxxxx", "latin1") });
  await p.locator("[data-testid=csv-preview]").click(); ok(/Unsupported file type/.test(await p.locator("[data-testid=csv-error]").innerText()), "binary refused");
});
await t("no page errors", async () => ok(errors.length === 0, errors.slice(0, 3).join(" | ")));
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
