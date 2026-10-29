#!/usr/bin/env node
/** Screenshots every ERP demo's real home screen (needs the site on :3000 with BIZ_API_URL and services/biz-api on :8120) into /tmp/erp-shots; scripts/compose-erp-covers.py turns them into covers. */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", OUT = "/tmp/erp-shots"; mkdirSync(OUT, { recursive: true });
const SLUGS = ["crm-sales-pipeline", "erp-finance-accounting", "hrm-employee-management", "payroll-attendance-workforce", "inventory-warehouse-management", "procurement-purchase-orders", "helpdesk-service-management", "marketing-automation-crm", "project-resource-management", "executive-analytics-automation", "workflow-automation-engine"];
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); p.setDefaultTimeout(20000);
for (const [i, s] of SLUGS.entries()) {
  await p.goto(`${BASE}/erp-demos/${s}/app`, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);
  await p.waitForFunction(() => document.querySelector("[data-testid=sync-badge]")?.getAttribute("data-mode") === "synced", null, { timeout: 20000 }).catch(() => 0);
  if (s === "workflow-automation-engine") { await p.getByTestId("add-examples").click().catch(() => 0); await p.waitForTimeout(1200); }
  await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}.png`, clip: { x: 0, y: 0, width: 1440, height: 810 } }); console.log("shot", s);
}
await b.close();
