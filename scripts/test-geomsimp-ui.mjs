// Browser test for demo 22 (architectural geometry simplification). Usage: BASE=http://localhost:3011 node scripts/test-geomsimp-ui.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.BASE || "http://localhost:3011", URL = `${BASE}/cad-bim-suite/architectural-geometry-simplification/app`;
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1700, height: 950 }, acceptDownloads: true }), p = await ctx.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
let pass = 0, fail = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n     " + String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const id = (x) => p.getByTestId(x);
const lit = () => p.evaluate(async () => { const c = document.querySelector("[data-testid=viewport-canvas]"); const im = new Image(); im.src = c.toDataURL(); await im.decode(); const k = document.createElement("canvas"); k.width = 400; k.height = 240; const g = k.getContext("2d"); g.drawImage(im, 0, 0, 400, 240); const d = g.getImageData(0, 0, 400, 240).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 11) + Math.abs(d[i + 1] - 18) + Math.abs(d[i + 2] - 32) > 60) n++; return n; });
const val = (x) => id(x).locator("p").nth(1).innerText();
const settle = () => p.waitForTimeout(500);
console.log("geometry demo 22 ui tests → " + URL);
await p.goto(URL, { waitUntil: "load" });
await p.getByRole("button", { name: "Accept" }).click({ timeout: 3000 }).catch(() => undefined);

await t("landing: shell, ten sections, simulated-source notices, import prompt", async () => {
  ok(await id("import-overlay").isVisible(), "import prompt");
  for (const n of ["overview", "explorer", "extraction", "simplification", "zones", "shading", "incremental", "performance", "export", "settings"]) ok(await id("nav-" + n).isVisible(), n);
  const top = await id("topline").innerText(); ok(/Commercial Building – Sample Model/i.test(top) && /Revit \/ SketchUp Demo Import/i.test(top) && /simulated/i.test(top), top);
  const body = await p.locator("body").innerText(); ok(/not read from Revit or SketchUp/i.test(body), "footer disclaimer"); ok(/Georgia/.test(await p.locator(".app-readable").first().evaluate((e) => getComputedStyle(e).fontFamily)), "Georgia");
});
await t("simplified and analysis modes are locked before processing", async () => { ok(await id("mode-simplified").isDisabled(), "simplified locked"); ok(await id("mode-analysis").isDisabled(), "analysis locked"); });
await t("import renders the 3D building (canvas has content) and the model counts", async () => {
  await id("import-overlay").click(); await settle(); await p.waitForTimeout(800);
  ok((await lit()) > 3000, "canvas lit pixels " + (await lit()));
  ok(/123 elements/.test(await id("toast").innerText()), await id("toast").innerText());
  ok(/21,044/.test(await id("kpi-orig").innerText()), await id("kpi-orig").innerText());
});
await t("extraction: progress, dynamic counts per category, completion summary", async () => {
  await id("nav-extraction").click(); await id("extract").click(); await id("progress").waitFor({ timeout: 5000 });
  await id("extract-summary").waitFor({ timeout: 30000 });
  const want = { wall: 12, window: 70, door: 14, floor: 3, roof: 1, partition: 12, shading: 11, zone: 15 };
  for (const [k, v] of Object.entries(want)) ok((await id("detected-" + k).innerText()) === String(v), `${k}: ${await id("detected-" + k).innerText()}`);
  ok(/123 of 123 elements classified/.test(await id("extract-summary").innerText()), await id("extract-summary").innerText());
  ok(/Extracted/.test(await id("row-wall").innerText()), "status");
  ok(await id("mode-extracted").getAttribute("aria-selected") === "true", "extracted mode shown");
});
await t("category toggles change the viewport", async () => {
  const before = await lit(); await id("cat-wall").click(); await id("cat-roof").click(); await id("cat-floor").click(); await settle(); await p.waitForTimeout(500);
  const after = await lit(); ok(Math.abs(after - before) > 800, `lit ${before} → ${after}`);
  await id("cat-wall").click(); await id("cat-roof").click(); await id("cat-floor").click(); await settle();
});
await t("simplification: operations, counts, reduction, validation, mode switch", async () => {
  await id("nav-simplification").click(); await id("simplify").click(); await id("simp-result").waitFor({ timeout: 40000 });
  ok(/125 surfaces/.test(await id("simp-count").innerText()) && /9 lines/.test(await id("simp-count").innerText()), await id("simp-count").innerText());
  const red = parseFloat(await val("reduction")); ok(red > 98, "reduction " + red);
  ok(/passed/i.test(await id("simp-result").innerText()), "validation");
  ok((await p.locator("[data-testid=ops] li[data-done=true]").count()) === 9, "9 operations done");
  ok((await id("checks").locator("li").count()) === 7 && (await id("checks").locator("li .text-red-400").count()) === 0, "7 checks pass");
  ok(await id("mode-simplified").getAttribute("aria-selected") === "true", "simplified mode");
});
await t("simplified view renders and side-by-side compare works", async () => {
  await settle(); ok((await lit()) > 1500, "simplified lit"); await id("compare-toggle").click(); await settle(); await p.waitForTimeout(600);
  ok(/Original · 21,044/.test(await p.locator("[data-testid=viewport]").innerText()), "left label"); ok(/Analytical · 125 surfaces/.test(await p.locator("[data-testid=viewport]").innerText()), "right label");
  ok((await lit()) > 3000, "compare lit"); await id("compare-toggle").click(); await settle();
});
await t("click-to-select in the viewport (analytical surface) and in the original", async () => {
  await p.evaluate(() => 0); const pos = await p.evaluate(() => window.__geom.screenOf("W-L3-S")); ok(pos, "screenOf"); await p.mouse.click(pos.x, pos.y); await settle();
  ok(/W-L3-S/.test(await id("sel-id").innerText()), "selected " + (await id("sel-id").innerText().catch(() => "none")));
  ok(/Area/.test(await id("sel-surface").first().innerText()) && /thickness 0/.test(await id("sel-surface").first().innerText()), "surface metadata");
  await id("mode-original").click(); await settle(); const q = await p.evaluate(() => window.__geom.screenOf("WIN-L3-S06")); ok(q, "window on screen"); await p.mouse.click(q.x, q.y); await settle();
  ok(/WIN-L3-S06/.test(await id("sel-id").innerText()), "picked " + await id("sel-id").innerText());
});
await t("model explorer: tree, search, selection, visibility", async () => {
  await id("nav-explorer").click(); await id("tree-search").fill("WIN-L2-S03"); await id("tree-WIN-L2-S03").click(); await settle();
  ok(/WIN-L2-S03/.test(await id("sel-id").innerText()), "selected from tree");
  await id("tree-search").fill(""); ok(await id("tree-root").isVisible() && await id("tree-shading").isVisible(), "hierarchy"); await id("tree-level-2").click(); ok(/External walls/i.test(await id("tree").innerText()), "categories under level");
  await id("tree-search").fill("TREE-3"); const eye = p.getByRole("button", { name: /Hide TREE-3/ }); await eye.click(); ok(await p.getByRole("button", { name: /Show TREE-3/ }).isVisible(), "hidden toggle");
  await p.getByRole("button", { name: /Show TREE-3/ }).click();
});
await t("thermal zones: table, detail, enclosure, orientation split", async () => {
  await id("nav-zones").click(); await id("zone-Z-L1-A").click(); const d = await id("zone-detail").innerText();
  ok(/66\.00 m²/.test(d) && /13\.50 m²/.test(d), d.slice(0, 200)); ok(/\(closed\)/.test(d), "closed"); ok(/F-L1/.test(d) && /F-L2/.test(d), "floor and ceiling refs");
  ok(await id("zones-toggle").isChecked(), "zones shown in viewport"); ok((await id("zone-table").locator("tbody tr").count()) === 15, "15 zones");
});
await t("shading geometry: objects, reduction, visibility", async () => {
  await id("nav-shading").click(); const tx = await id("shade-table").innerText(); ok(/Total \(11 objects\)/.test(tx), tx.slice(-200));
  ok(/2 surf/.test(await id("shade-row-NB-A").innerText()) && /1 line/.test(await id("shade-row-TREE-1").innerText()), "neighbour 2 surfaces, tree surface + line");
  await id("shade-tree").click(); ok(/Show trees/.test(await id("shade-tree").innerText()), "trees hidden"); await id("shade-tree").click();
});
await t("incremental updates: modify, outdated list, selective reprocessing, summary", async () => {
  await id("nav-incremental").click(); await id("mod-element").selectOption("WIN-L2-S03"); await id("mod-op").selectOption("widen"); await id("modify").click();
  await id("pending").waitFor(); const items = await id("pending-item").allInnerTexts(); ok(items.length === 3, JSON.stringify(items)); ok(items.some((x) => /WIN-L2-S03/.test(x)) && items.some((x) => /W-L2-S/.test(x)) && items.some((x) => /Z-L2-A/.test(x)), JSON.stringify(items));
  await id("update-incremental").click(); await id("incr-summary").waitFor({ timeout: 20000 });
  ok((await val("inc-total")) === "138", "total"); ok((await val("inc-re")) === "3", "reprocessed 3: " + await val("inc-re")); ok((await val("inc-mod")) === "1", "modified 1"); ok((await val("inc-unch")) === "135", "unchanged 135"); ok((await val("inc-ratio")) === "97.8%", await val("inc-ratio"));
  ok(/ms|µs/.test(await id("inc-time").innerText()) && /ms|µs/.test(await id("inc-saved").innerText()), "times measured");
});
await t("a second edit (partition move) reprocesses only the partition and its two zones", async () => {
  await id("mod-element").selectOption("P-L1-1"); await id("modify").click(); const items = await id("pending-item").allInnerTexts(); ok(items.length === 3 && items.some((x) => /Z-L1-B/.test(x)), JSON.stringify(items));
  await id("update-incremental").click(); await id("incr-summary").waitFor(); ok((await val("inc-re")) === "3", "3 reprocessed");
  ok(await id("nav-incremental").isVisible(), "still on page");
});
await t("performance analytics: tiles, four charts, simulated-benchmark label", async () => {
  await id("nav-performance").click(); ok(/Simulated benchmark/.test(await id("bench-note").innerText()), "label");
  for (const x of ["p-orig", "p-simp", "p-red", "p-cache", "p-origms", "p-simpms", "p-incms", "p-saved"]) ok(await id(x).isVisible(), x);
  for (const x of ["chart-reduction", "chart-time", "chart-geom", "chart-cache"]) ok(await id(x).isVisible(), x);
  ok(/%/.test(await id("p-cache").innerText()) && !/—/.test(await id("p-incms").innerText()), "values from state");
});
await t("export: selectable sections and a valid downloadable JSON file", async () => {
  await id("nav-export").click(); const [dl] = await Promise.all([p.waitForEvent("download"), id("download-json").click()]);
  ok(dl.suggestedFilename() === "analytical-geometry.json", dl.suggestedFilename()); const j = JSON.parse(readFileSync(await dl.path(), "utf8"));
  ok(j.surfaces.length + j.shadingGeometry.surfaces.length === 125 && j.thermalZones.length === 15 && /demo only/.test(j.schema) && /Not exported from Revit/.test(j.note), "content");
  ok(j.surfaces.every((s) => s.thickness_m === 0 && s.area_m2 > 0), "zero thickness");
  await id("exp-zones").uncheck(); await id("exp-shading").uncheck(); await id("exp-metadata").uncheck(); await p.waitForTimeout(200);
  const [d2] = await Promise.all([p.waitForEvent("download"), id("download-json").click()]); const j2 = JSON.parse(readFileSync(await d2.path(), "utf8")); ok(!j2.thermalZones && !j2.shadingGeometry && !j2.metadata && j2.surfaces, "selection applied");
  ok(/gbXML/.test(await p.locator("[data-testid=panel]").innerText()), "formats listed");
});
await t("settings: unit change applies, opacity, save and load", async () => {
  await id("nav-settings").click(); await id("area-unit").selectOption("ft2"); await id("nav-zones").click(); await id("zone-Z-L1-A").click(); ok(/ft²/.test(await id("zone-detail").innerText()), "ft²");
  await id("nav-settings").click(); await id("area-unit").selectOption("m2"); await id("opacity").fill("0.8"); await id("labels-toggle").check(); await id("save-btn").click(); ok(/saved/i.test(await id("toast").innerText()), "saved");
});
await t("reset and the guided demo run end to end", async () => {
  await id("nav-settings").click(); await id("reset-demo").click(); await id("nav-overview").click(); ok(await id("import-overlay").isVisible(), "reset to import");
  await id("run-guide").click(); await p.waitForFunction(() => /Guided demo finished/.test(document.querySelector("[data-testid=toast]")?.textContent || ""), null, { timeout: 120000 });
  await id("nav-overview").click(); const done = await p.locator("[data-testid^=step-][data-done=true]").count(); ok(done === 10, "steps done " + done); ok(await id("mode-analysis").getAttribute("aria-selected") === "true", "ends in analysis-ready mode");
  ok(/WIN-L2-S03/.test(await p.evaluate(() => JSON.stringify(window.__geom.state().runs.map((r) => r.modId)))), "incremental run recorded");
});
await t("pan/orbit does not break picking; viewport controls work", async () => {
  await id("nav-overview").click(); await p.getByRole("button", { name: "Top view" }).click(); await settle(); ok((await lit()) > 1000, "top view lit"); await p.getByRole("button", { name: "Zoom in" }).click(); await p.getByRole("button", { name: "Iso view" }).click(); await settle();
});
await t("responsive: no horizontal scroll at tablet and phone width", async () => {
  for (const w of [820, 390]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(400); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "scroll at " + w); ok(await id("viewport").isVisible() && await id("panel").isVisible(), "visible at " + w); }
  await p.setViewportSize({ width: 1700, height: 950 });
});
await t("catalogue: demo 22 is listed under CAD/BIM and has its own page", async () => {
  await p.goto(`${BASE}/portfolio/cad-bim`, { waitUntil: "load" }); const txt = await p.locator("body").innerText(); ok(/Architectural Geometry Intelligence/.test(txt), "listed on CAD/BIM portfolio");
  await p.goto(`${BASE}/cad-bim-suite/architectural-geometry-simplification`, { waitUntil: "load" }); const d = await p.locator("body").innerText(); ok(/not connected to Revit or SketchUp/i.test(d) && /Launch application/.test(d), "detail page honest");
});
await t("no console or page errors", async () => { const bad = errors.filter((e) => !/favicon|GPU stall|WebGL|swiftshader|Failed to load resource/i.test(e)); ok(bad.length === 0, bad.slice(0, 3).join(" | ")); });
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
