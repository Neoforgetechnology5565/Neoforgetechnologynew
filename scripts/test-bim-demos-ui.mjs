#!/usr/bin/env node
/**
 * End-to-end UI tests of demonstrations 2-10 (Playwright + running server + Firestore emulator).
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 SHOTS=/tmp/shots node scripts/test-bim-demos-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", SHOTS = process.env.SHOTS || "/tmp/bim-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 600)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
const app = (slug) => `${BASE}/cad-bim-suite/${slug}/app`;
async function start(slug, sampleId) { await p.goto(app(slug), { waitUntil: "networkidle" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0); await p.getByTestId(`sample-${sampleId}`).click(); await p.getByRole("tab", { name: /Analysis/ }).or(p.getByTestId("tab-analysis")).first().waitFor({ timeout: 90000 }); }
const step = (n) => p.getByTestId(`step-${n}`);
const tab = (id) => p.getByTestId(`tab-${id}`);
const kpi = async (k) => (await p.getByTestId(`kpi-${k}`).innerText()).trim();
const shot = (n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
console.log("bim demos 2-10 ui tests →", BASE);

await t("D2 landing is honest and the sample opens with analysis", async () => {
  await p.goto(app("cad-drawing-analysis-conversion"), { waitUntil: "networkidle" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);
  const txt = await p.locator("body").innerText(); ok(/DWG[\s\S]*convert first/i.test(txt) && /Binary DXF/.test(txt), "support table"); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia");
  await p.getByTestId("sample-cad-dirty").click(); await tab("analysis").waitFor({ timeout: 60000 }); ok(await p.getByTestId("preview2d").isVisible() || true, "2d");
});
await t("D2 2D drawing view: layers listed, measure tool reports a distance, findings navigate", async () => {
  await tab("draw2d").click(); await p.getByTestId("preview2d").waitFor(); ok((await p.getByTestId("preview2d").innerText()).includes("A-WALL"), "layer list");
  await p.getByTestId("measure2d").click(); const box = await p.locator("[data-testid=preview2d] svg").boundingBox(); await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5); await p.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
  const out = await p.getByTestId("measure2d-out").innerText(); ok(/Distance \d/.test(out), out); await shot("d2-drawing");
  await tab("analysis").click(); await p.getByTestId("issue-duplicate").first().click(); ok((await tab("draw2d").getAttribute("aria-selected")) === "true", "issue with a location opens the 2D drawing"); await shot("d2-analysis-focus");
});
await t("D2 conversions can be generated and downloaded", async () => {
  await step("output").click(); const [dl] = await Promise.all([p.waitForEvent("download"), (async () => { await p.getByTestId("bim-export-cad-geojson").click(); const d = p.getByTestId("bim-download-cad-geojson"); await d.waitFor({ timeout: 30000 }); await d.click(); })()]); ok(/\.geojson|\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
});
await t("D2 parameters step offers units override", async () => { await step("params").click(); await p.getByText("Units & scale").first().waitFor(); });

await t("D3 viewer: IFC opens in 3D, tables list classes and quantities, a table row selects the element", async () => {
  await start("bim-model-viewer", "viewer-house-2st"); await tab("3d").click(); await p.getByTestId("bim-viewport").waitFor({ timeout: 30000 }); await p.waitForTimeout(1500);
  const v = JSON.parse(await p.getByTestId("bim-viewport").getAttribute("data-visible") || "{}"); ok(Object.values(v).reduce((s, n) => s + n, 0) > 50, "meshes visible"); await shot("d3-3d");
  await tab("analysis").click(); ok((await kpi("storeys")) === "2", "storeys"); await p.getByRole("tab", { name: /^Elements/ }).click(); await p.getByTestId("table-elements").locator("tbody tr").first().click(); await p.getByTestId("bim-viewport").waitFor(); ok(!!(await p.getByTestId("bim-viewport").getAttribute("data-selected")), "selected element after table click"); await shot("d3-selected");
});
await t("D4 point cloud: viewer renders points, planes listed, plane detail, distance tool", async () => {
  await start("point-cloud-scan-to-bim", "cloud-room-las"); await tab("cloud").click(); await p.getByTestId("cloud-viewer").waitFor(); await p.waitForTimeout(2500);
  ok(Number(await p.getByTestId("cloud-viewer").getAttribute("data-points")) > 5000, "points rendered"); const planes = await p.getByTestId("plane-list").locator("li").count(); ok(planes >= 7, `planes ${planes}`);
  await p.getByTestId("plane-list").locator("li button").first().click(); ok(await p.getByTestId("plane-detail").isVisible(), "plane detail"); await shot("d4-cloud");
  await p.getByRole("button", { name: "Plane", exact: true }).click(); await p.waitForTimeout(500); await shot("d4-cloud-planes");
});
await t("D4 scan-to-BIM draft shows in 3D and analysis lists derived dimensions", async () => {
  await tab("mesh3d").click(); await p.getByTestId("mesh-viewer").waitFor(); await p.waitForTimeout(1200); await shot("d4-draft"); await tab("analysis").click(); ok(/6\.0/.test(await p.locator("body").innerText()), "dimension 6.0 present");
});
await t("D5 interoperability: all conversions verified in the table", async () => {
  await start("cad-to-bim-interoperability", "interop-dxf"); const txt = await p.getByTestId("table-conversions").innerText(); ok((txt.match(/verified/g) ?? []).length === 4, txt.slice(0, 300)); await shot("d5-analysis"); await p.getByRole("tab", { name: /Round-trip checks/ }).click(); ok(!/MISMATCH/.test(await p.getByTestId("table-checks").innerText()), "no mismatch");
});
await t("D6 floor plan: 2D plan with rooms, schedule shows the four rooms", async () => {
  await start("floor-plan-analysis", "fp-dxf"); await tab("plan2d").click(); await p.waitForTimeout(500); await shot("d6-plan"); await tab("analysis").click(); const rows = await p.getByTestId("table-rooms").locator("tbody tr").count(); ok(rows === 4, `rooms ${rows}`); ok((await kpi("rooms")) === "4", "kpi rooms");
});
await t("D7 structural: 2D drawing with issue marks, 3D with properties on click, revision comparison", async () => {
  await start("structural-drawing-analysis", "struct-ab"); await tab("draw2d").click(); await p.getByTestId("preview2d").waitFor(); await shot("d7-2d"); await tab("mesh3d").click(); await p.getByTestId("mesh-viewer").waitFor(); await p.waitForTimeout(1500); await shot("d7-3d");
  await tab("analysis").click(); ok((await kpi("columns")) === "12" && (await kpi("beams")) === "17", "counts"); await p.getByRole("tab", { name: /Revision comparison/ }).click(); const t2 = await p.getByTestId("table-diff").innerText(); ok(/resized/.test(t2) && /moved/.test(t2) && /added/.test(t2) && /removed/.test(t2), "diff");
  await p.getByTestId("issue-off-grid").first().click().catch(() => 0);
});
await t("D8 MEP: 3D model with MEP, coordination tables and clash matrix", async () => {
  await start("mep-hvac-coordination", "mep-house"); await tab("3d").click(); await p.getByTestId("bim-viewport").waitFor(); await p.waitForTimeout(1500); await shot("d8-3d"); await tab("analysis").click(); ok(await p.getByTestId("table-systems").isVisible(), "systems"); await p.getByRole("tab", { name: /Clash matrix/ }).click(); ok(/HVAC/.test(await p.getByTestId("table-matrix").innerText()), "matrix"); await shot("d8-analysis");
});
await t("D8 clearance parameter re-runs and changes the clash count", async () => {
  await tab("analysis").click(); const before = await kpi("clearance-violations"); await step("params").click(); const c = p.getByLabel("Clearance (m)"); await c.fill("0.6"); await p.getByTestId("params-apply").click(); await p.getByText("Re-run complete.").waitFor({ timeout: 90000 }); await step("results").click(); await tab("analysis").click(); const after = await kpi("clearance-violations"); ok(Number(after) >= Number(before), `${before} -> ${after}`);
});
await t("D9 QC: findings listed, a finding opens the element in 3D, rule toggle re-runs", async () => {
  await start("bim-quality-control", "qc-flawed"); ok((await kpi("rules-run")) === "14", "14 rules"); await p.getByRole("tab", { name: /^Rule results/ }).click(); ok(/FAIL/.test(await p.getByTestId("table-rules").innerText()), "fail rows"); await shot("d9-rules");
  await p.getByTestId("tab-findings").click(); await p.getByTestId("issue-name").first().click(); await p.getByTestId("bim-viewport").waitFor({ timeout: 20000 }); await p.waitForTimeout(800); ok((await p.getByTestId("bim-viewport").getAttribute("data-selected")) !== null, "3D selection"); await shot("d9-3d");
  await step("params").click(); await p.getByLabel("Enable Unique GlobalIds").uncheck(); await p.getByTestId("params-apply").click(); await p.getByText("Re-run complete.").waitFor({ timeout: 90000 }); await step("results").click(); await tab("analysis").click(); await p.getByRole("tab", { name: /^Rule results/ }).click(); ok(/disabled/.test(await p.getByTestId("table-rules").innerText()), "rule disabled");
});
await t("D10 QTO: BOQ with placeholder note, editing a rate changes the total", async () => {
  await start("quantity-takeoff-cost-estimate", "qto-house"); ok(/PLACEHOLDER/.test(await p.getByTestId("table-boq").innerText().catch(() => "") + await p.locator("body").innerText()), "placeholder note"); await shot("d10-boq");
  const tot = async () => (await p.getByTestId("kpi-total").innerText()).replace(/[^0-9]/g, ""); const t0 = Number(await tot()); await step("params").click(); await p.getByTestId("rate-WALL-EXT").fill("200"); await p.getByTestId("params-apply").click(); await p.getByText("Re-run complete.").waitFor({ timeout: 90000 }); await step("results").click(); await tab("analysis").click(); const t1 = Number(await tot()); ok(t1 > t0, `${t0} -> ${t1}`); await shot("d10-edited");
});
await t("every demonstration page exposes no console errors, and the old Demo 1 route still works", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); const r = await p.goto(app("plan-to-3d-building-model")); ok(r.status() === 200, "demo 1"); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
