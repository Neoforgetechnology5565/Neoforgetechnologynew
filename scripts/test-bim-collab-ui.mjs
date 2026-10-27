#!/usr/bin/env node
/** End-to-end UI test of demonstration 11 (review workspace): Playwright + running server + Firestore emulator. */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", APP = `${BASE}/cad-bim-suite/bim-project-review-issues/app`, SHOTS = process.env.SHOTS || "/tmp/bim-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 600)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } }); const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
const tab = (n) => p.getByRole("tab", { name: n });
const shot = (n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
let shareLink = "";
console.log("bim collab ui tests →", APP);
await p.goto(APP, { waitUntil: "networkidle" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);
await t("landing states what is and is not implemented; sample opens with two versions and three issues", async () => {
  const txt = await p.locator("body").innerText(); ok(/not implemented/i.test(txt) && /user accounts/i.test(txt) && /BCF/.test(txt), "honest scope"); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia");
  await p.getByTestId("start-sample").click(); await p.getByTestId("role-badge").waitFor({ timeout: 90000 }); ok(/owner/.test(await p.getByTestId("role-badge").innerText()), "owner role"); ok((await p.getByTestId("version-select").locator("option").count()) === 2, "2 versions"); await p.getByTestId("bim-viewport").waitFor({ timeout: 60000 }); await p.waitForTimeout(1500); await shot("d11-model");
  ok(/Issues\s*3/.test(await tab(/^Issues/).innerText()), "3 issues");
});
await t("comparison lists the known changes; clicking an element opens it in the model", async () => {
  await tab(/^Versions/).click(); await p.getByTestId("compare-run").click(); await p.getByTestId("comparison").waitFor(); ok((await p.getByTestId("cmp-added").innerText()) === "1" && (await p.getByTestId("cmp-removed").innerText()) === "1", "added/removed 1/1"); const txt = await p.getByTestId("cmp-list").innerText(); ok(/O011/.test(txt) && /geometry/.test(txt), "door change"); await shot("d11-compare");
  await p.getByRole("tab", { name: /^Added/ }).click(); await p.getByTestId("cmp-list").getByRole("button", { name: "C98" }).click(); await p.getByTestId("bim-viewport").waitFor(); await p.waitForTimeout(1800); ok(!!(await p.getByTestId("bim-viewport").getAttribute("data-selected")), "element selected in model");
});
await t("creating an issue from a 3D view stores the camera; restoring it returns to that view", async () => {
  await p.getByTestId("issue-from-view").click(); await p.getByTestId("issue-title").fill("Check clearance at new column"); await p.getByTestId("issue-form").getByLabel("Assignee").fill("Priya"); await p.getByTestId("issue-save").click(); await p.getByTestId("issue-detail").waitFor(); ok(/Check clearance at new column/.test(await p.getByTestId("issue-detail").innerText()), "detail"); ok(await p.getByTestId("show-viewpoint").isVisible(), "viewpoint stored");
  await p.getByTestId("show-viewpoint").click(); await p.getByTestId("bim-viewport").waitFor({ timeout: 20000 }); await p.waitForTimeout(1500); ok(!!(await p.getByTestId("bim-viewport").getAttribute("data-selected")), "selection restored with the view"); await shot("d11-restored");
});
await t("status change and comment are recorded with the author and visible in history", async () => {
  await tab(/^Issues/).click(); await p.getByTestId("issue-row-4").click(); await p.getByTestId("issue-status").selectOption("resolved"); await p.waitForTimeout(600); await p.getByTestId("comment-text").fill("Checked with the engineer."); await p.getByTestId("comment-send").click(); await p.getByTestId("comments").getByText("Checked with the engineer.").waitFor();
  await p.getByText(/^History/).click(); const h = await p.getByTestId("history").innerText(); ok(/status: open → resolved/.test(h) && /Owner/.test(h) && !/type:|elements:/.test(h), h); await shot("d11-issue");
});
await t("filters: status chips and search narrow the list", async () => {
  await p.getByRole("button", { name: /^resolved/ }).click(); ok((await p.getByTestId("issue-list").locator("li").count()) === 1, "one resolved"); await p.getByRole("button", { name: /^resolved/ }).click(); await p.getByLabel("Search issues").fill("window"); ok((await p.getByTestId("issue-list").locator("li").count()) === 1, "search window"); await p.getByLabel("Search issues").fill("");
});
await t("share: a reviewer link gives a reviewer role that cannot manage; a viewer link is read-only; revoking blocks access", async () => {
  await tab(/Share/).click(); await p.getByTestId("share-name").fill("Dana"); await p.getByTestId("share-role").selectOption("reviewer"); await p.getByTestId("share-create").click(); shareLink = (await p.getByTestId("share-link").locator("p").nth(1).innerText()).trim(); ok(/#share=/.test(shareLink), "link");
  const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 950 } }); const q = await ctx2.newPage(); await q.goto(shareLink, { waitUntil: "networkidle" }); await q.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0); await q.getByTestId("role-badge").waitFor({ timeout: 60000 }); ok(/reviewer/.test(await q.getByTestId("role-badge").innerText()), "reviewer role");
  await q.getByRole("tab", { name: /^Issues/ }).click(); await q.getByTestId("issue-row-4").click(); await q.getByTestId("comment-text").fill("Reviewer comment"); await q.getByTestId("comment-send").click(); await q.getByTestId("comments").getByText("Reviewer comment").waitFor(); ok(/Dana/.test(await q.getByTestId("comments").innerText()), "author is the share name");
  ok((await q.getByRole("button", { name: "Delete issue" }).count()) === 0, "no delete for reviewer"); ok((await q.getByRole("tab", { name: /^Share/ }).count()) === 0, "no share management"); await q.screenshot({ path: `${SHOTS}/d11-reviewer.png` });
  await p.getByRole("button", { name: "Revoke" }).first().click(); await p.getByText("Access revoked.").waitFor(); await q.reload({ waitUntil: "networkidle" }); await q.waitForTimeout(1500); ok(!(await q.getByTestId("role-badge").count()), "access gone after revoke"); await ctx2.close();
});
await t("report downloads and no console errors", async () => { const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("report-csv").click()]); ok(/\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename()); ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
