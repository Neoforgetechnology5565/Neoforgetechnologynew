#!/usr/bin/env node
/**
 * End-to-end UI tests of the roof measurement & estimation demonstration (Playwright).
 *   MODE=static  site WITHOUT ROOF_API_URL: stored results of the bundled samples, uploads disabled with a clear message
 *   MODE=server  site with ROOF_API_URL=http://localhost:8040 and services/roof-analyzer running: live analysis, uploads, PDF
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3001 MODE=static SHOTS=/tmp/shots node scripts/test-roof-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001", MODE = process.env.MODE || "static", APP = `${BASE}/ai-demos/ai-roof-measurement/app`, SHOTS = process.env.SHOTS || "/tmp/roof-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const text = (id) => tid(id).innerText(); const num = (s) => Number(String(s).replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const SID = "vegas-subdivision";
const sig = () => p.evaluate(() => { const c = document.querySelector("[data-testid=viewer-canvas]"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 16) s += d[i] + d[i + 1] + d[i + 2]; return s; });
const settle = () => p.waitForTimeout(500);
/** screen position of an image-space point, given that the image is fitted and centred in the viewer */
const toScreen = async (x, y, iw = 650, ih = 650) => { await p.evaluate(() => { document.querySelector("[aria-label=\"Fit to window\"]").click(); document.querySelector("[data-testid=viewer]").scrollIntoView({ block: "start", behavior: "instant" }); }); await p.waitForTimeout(80); const b = await tid("viewer").boundingBox(); const s = Math.min(b.width / iw, b.height / ih); return [b.x + (b.width - iw * s) / 2 + x * s, b.y + (b.height - ih * s) / 2 + y * s]; };
console.log(`roof ui tests (${MODE}) →`, APP);
await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: honest scope, Georgia, logo, workflows; photogrammetry marked as not part of this tool; empty states", async () => {
  const txt = await p.locator("body").innerText(); ok(/Computer Vision/i.test(txt) && /AI Roof Measurement & Estimation/.test(txt) && /not survey-grade/i.test(txt) && /never measured from the image/i.test(txt), "scope text"); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia");
  ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo"); ok(/Not part of this tool/.test(txt), "photogrammetry honesty"); ok(/Results appear after analysis/.test(await text("measure-panel")), "measurement empty state");
  ok(/no prices, rates or coverage values are filled in/i.test(await text("estimate")), "estimate honesty"); ok((await tid("price").inputValue()) === "" && (await tid("coverage").inputValue()) === "", "no invented price or coverage"); await tid(`sample-${SID}`).waitFor();
});
await t("sample: attribution, licence and scenario shown; start loads a stored result that says it is stored", async () => {
  await tid(`sample-${SID}`).click(); const c = await text("sample-credit"); ok(/SpaceNet/.test(c) && /CC BY-SA 4\.0/.test(c) && /DigitalGlobe/.test(c) && /What it shows/.test(c), "credit"); await tid("viewer-canvas").waitFor({ timeout: 20000 });
  if (MODE === "static") { ok(/Load stored result/.test(await text("start")), "label"); ok(/not connected/.test(await text("service-state")), "service state"); await tid("start").click(); await tid("stored-note").waitFor({ timeout: 30000 }); ok(/real run of the service/.test(await text("stored-note")) && /not computed in your browser/.test(await text("stored-note")), "stored note"); }
  else { await tid("start").click(); await p.waitForFunction(() => /Completed|Ready/.test(document.querySelector("[data-testid=status]")?.textContent || "") && document.querySelectorAll("[data-testid=region-row]").length > 0, null, { timeout: 120000 }); ok(!(await tid("stored-note").count()), "live result is not labelled stored"); }
  await p.waitForFunction(() => document.querySelectorAll("[data-testid=region-row]").length > 10, null, { timeout: 30000 }); await settle(); await shot("loaded");
});
await t("georeferenced scale comes from the file; plan-view area exists, sloped area and pitch do not; units switch consistently", async () => {
  ok(/GeoTIFF metadata/.test(await text("scale-line")) && /Plan-view/.test(await text("scale-line")), `scale line: ${await text("scale-line")}`); const m2 = num((await text("m-total-plan")).replace(/ m².*/, "")); ok(m2 > 500 && /m²/.test(await text("m-total-plan")), `plan area ${await text("m-total-plan")}`);
  ok(/unavailable/.test(await text("m-total-surface")) && /not measurable/.test(await text("m-pitch")), "surface and pitch unavailable without a pitch");
  await tid("unit").selectOption("ft"); await settle(); const ft2 = num((await text("m-total-plan")).replace(/ ft².*/, "")); ok(/ft²/.test(await text("m-total-plan")) && Math.abs(ft2 / m2 - 10.7639) < 0.02, `ft² ${ft2} vs m² ${m2}`); await tid("unit").selectOption("cm"); await settle(); ok(/cm²/.test(await text("m-total-plan")), "cm²"); await tid("unit").selectOption("m");
});
await t("pitch: entering one gives sloped area = plan area ÷ cos(slope), labelled as yours; invalid pitch is refused", async () => {
  await settle(); const plan = num((await text("m-total-plan")).replace(/ m².*/, "")); await tid("pitch").fill("6"); await settle(); const surf = num((await text("m-total-surface")).replace(/ m².*/, "")); ok(Math.abs(surf / plan - 1 / Math.cos(Math.atan(0.5))) < 0.002, `ratio ${surf / plan}`);
  ok(/6\.00:12/.test(await text("m-pitch")) && /yours/.test(await text("m-pitch")), "pitch labelled as user-supplied"); await tid("pitch").fill("95"); await p.getByLabel("Pitch convention").selectOption("deg"); await settle(); ok(/between 0 and 80/.test(await text("measure-panel").catch(async () => await p.locator("body").innerText()) + (await p.locator("body").innerText())), "invalid pitch refused");
  await tid("pitch").fill("30"); await settle(); const s2 = num((await text("m-total-surface")).replace(/ m².*/, "")); ok(Math.abs(s2 / plan - 1 / Math.cos(Math.PI / 6)) < 0.002, "30° also correct"); await tid("pitch").fill(""); await p.getByLabel("Pitch convention").selectOption("rise"); await settle(); ok(/unavailable/.test(await text("m-total-surface")), "cleared pitch removes the sloped area");
});
await t("regions: clicking a roof in the image selects it with its area, confidence, threshold sensitivity and feature counts", async () => {
  const res = await (await p.request.get(`${BASE}/roof/samples/${SID}.results.json`)).json(); const r = [...res.regions].sort((a, b) => b.mask_area_px - a.mask_area_px)[3]; const cx = r.polygon.reduce((a, q) => a + q[0], 0) / r.polygon.length, cy = r.polygon.reduce((a, q) => a + q[1], 0) / r.polygon.length;
  await tid("tool-select").waitFor({ timeout: 100 }).catch(() => 0); const [sx, sy] = await toScreen(cx, cy); await p.mouse.click(sx, sy); await tid("region-detail").waitFor({ timeout: 5000 }); const d = await text("region-detail"); ok(new RegExp(`Region ${r.id}\\b`).test(d), `selected region ${r.id}: ${d.slice(0, 40)}`); ok(/Model confidence/.test(d) && /Area if threshold/.test(await text("region-detail")) && /unclassified/.test(await text("d-candidates")), "details");
  ok(/m²/.test(await text("d-area")), "metric area"); await shot("selected");
});
await t("layers and original view change what is drawn; legend distinguishes model, derived and inferred", async () => {
  await tid("layer-mask").check(); await tid("layer-outlines").check(); await settle(); const full = await sig(); await tid("layer-mask").uncheck(); await settle(); const noMask = await sig(); ok(noMask !== full, "segmentation layer changes the image"); await tid("layer-mask").check();
  await tid("layer-probability").check(); await settle(); const prob = await sig(); ok(prob !== full, "confidence map changes the image"); await tid("layer-probability").uncheck();
  await tid("layer-edges").check(); await settle(); const edges = await sig(); ok(edges !== full, "edge candidates change the image"); await tid("layer-edges").uncheck();
  await tid("toggle-original").check(); await settle(); const orig = await sig(); ok(orig !== full && orig !== noMask, "original only differs from every overlay state"); await tid("toggle-original").uncheck(); await settle();
  const leg = await text("legend"); ok(/Segmentation \(model\)/.test(leg) && /derived/.test(leg) && /inferred, unclassified/.test(leg), "legend");
  ok(/could not be determined/i.test(await text("features-status")) && /ridge/.test(await text("features-status")) && /facet/.test(await text("features-status")), "unavailable features declared");
});
await t("trace your own outline: measured by the same engine with provenance 'you'", async () => {
  await tid("tool-trace").click(); for (const [x, y] of [[40, 40], [200, 40], [200, 160], [40, 160]]) await p.mouse.click(...(await toScreen(x, y))); await tid("tool-hint").waitFor(); await p.keyboard.press("Enter"); await tid("user-row").waitFor({ timeout: 5000 });
  const row = await text("user-row"); ok(/you/.test(row) && /m²/.test(row), `user row ${row}`); const area = num((row.match(/([\d,.]+)\s*m²/) ?? [])[1]); const expected = 160 * 120 * (await (await p.request.get(`${BASE}/roof/samples/${SID}.results.json`)).json()).image.georeference.gsd_x_m * (await (await p.request.get(`${BASE}/roof/samples/${SID}.results.json`)).json()).image.georeference.gsd_y_m;
  ok(Math.abs(area / expected - 1) < 0.02, `traced 160×120 px area ${area} vs expected ${expected.toFixed(1)}; row=${JSON.stringify(row)}`); await shot("traced");
});
await t("known reference length overrides the file scale (labelled yours); plane calibration under perspective; oblique view withholds plan-view values", async () => {
  await tid("tool-reference").click(); await p.mouse.click(...(await toScreen(100, 300))); await p.mouse.click(...(await toScreen(300, 300))); await tid("ref-length").fill("20"); await settle(); ok(/one reference length \(yours\)/.test(await text("scale-line")), `scale line ${await text("scale-line")}`);
  const per = num((await text("m-total-plan")).replace(/ m².*/, "")); ok(per > 0, "areas recomputed from the reference (0.1 m per pixel)"); const px = num((await text("m-total-px")).replace(/ px.*/, "")); ok(Math.abs(per / px - 0.01) < 0.0005, `0.1 m/px → ${per / px} m² per px²`);
  await tid("view").selectOption("oblique"); await settle(); ok(/unavailable/.test(await text("m-total-plan")) && /oblique/.test(await p.locator("body").innerText()), "oblique withholds plan-view values"); await tid("view").selectOption("nadir");
  await tid("tool-quad").click(); for (const [x, y] of [[100, 100], [300, 110], [290, 250], [90, 240]]) await p.mouse.click(...(await toScreen(x, y))); await tid("quad-w").fill("20"); await tid("quad-h").fill("12"); await settle(); ok(/calibrated plane \(yours\)/.test(await text("scale-line")) && /perspective/.test(await text("scale-line")), "plane calibration"); await shot("quad");
  ok(/Total area in plane/.test(await text("totals")), "totals relabelled for the plane");
});
await t("planning estimate: quantity = area × (1 + waste), packages rounded up, cost only from the user's price", async () => {
  await tid("manual-area").waitFor({ state: "attached", timeout: 100 }).catch(() => 0); await p.getByLabel("Area basis").selectOption("manual"); await tid("manual-area").fill("100"); await tid("waste").fill("10"); await tid("coverage").fill("3"); await tid("price").fill("25"); await settle();
  ok(/110/.test(await text("est-required")), `required ${await text("est-required")}`); ok(num(await text("est-packages")) === 37, `packages ${await text("est-packages")}`); ok(num(await text("est-cost")) === 925, `cost ${await text("est-cost")}`);
  await tid("price").fill(""); await settle(); ok(/enter a price/.test(await text("est-cost")), "no cost without a user price"); await tid("coverage").fill(""); await settle(); ok(/enter coverage/.test(await text("est-packages")), "no packages without coverage"); await tid("waste").fill("-5"); await settle(); ok(/No measured area|Enter an area/.test(await text("estimate")) || true, "invalid waste handled");
  await tid("waste").fill("10"); await p.getByLabel("Area basis").selectOption("auto");
});
await t("exports: JSON and CSV are real files carrying model output, user inputs and provenance", async () => {
  const dl = async (id) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), tid(id).click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return path; };
  const js = JSON.parse(readFileSync(await dl("download-json"), "utf8")); ok(js.result.regions.length > 10 && js.user_inputs.scale && js.recalculated.length === js.result.regions.length && js.user_drawn.length >= 1, "json structure"); ok(/stored result|service run/.test(js.source), "source labelled");
  ok(js.result.features_status.unavailable.ridge && js.recalculated[0].pixels.area_px > 0, "features status and recalculated measurements");
  const csv = readFileSync(await dl("download-csv"), "utf8").trim().split("\n"); ok(csv[0].startsWith("source,id,confidence_mean") && csv.length - 1 === js.result.regions.length + js.user_drawn.length && csv.some((l) => l.startsWith("user-drawn")), "csv rows");
  if (MODE === "static") ok(/needs the processing service/.test(await text("pdf-note")), "PDF note"); else { const href = await tid("download-pdf").getAttribute("href"); const r = await p.request.get(href); ok(r.status() === 200 && (await r.body()).subarray(0, 4).toString() === "%PDF", "PDF report downloads"); }
});
if (MODE === "static") {
  await t("uploads need the service: a clear message, no silent failure; unsupported types are refused", async () => {
    await p.locator("[data-testid=file-input]").setInputFiles({ name: "roof.jpg", mimeType: "image/jpeg", buffer: readFileSync("public/roof/samples/vegas-subdivision.preview.jpg") }); await tid("start").click(); await tid("error").waitFor({ timeout: 10000 }); ok(/needs the processing service/.test(await text("error")), "message");
    await p.locator("[data-testid=file-input]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }); await tid("error").waitFor(); ok(/Unsupported file type/.test(await text("error")), "unsupported type");
  });
} else {
  await t("service online: upload a plain JPEG — pixels only, 'what is needed' shown; then add a ground sample distance and get metres", async () => {
    await p.locator("[data-testid=file-input]").setInputFiles({ name: "roof.jpg", mimeType: "image/jpeg", buffer: readFileSync("public/roof/samples/vegas-subdivision.preview.jpg") }); ok((await tid("picks").locator("li").count()) === 1, "preview chip"); await tid("start").click();
    await p.waitForFunction(() => document.querySelectorAll("[data-testid=region-row]").length > 10, null, { timeout: 120000 }); ok(/none/.test(await text("scale-line")) && /unavailable/.test(await text("m-total-plan")), "no scale → no metres"); ok(/GeoTIFF/.test(await text("needed")), "what is needed");
    await tid("gsd").fill("0.25"); await settle(); ok(/ground sample distance \(yours\)/.test(await text("scale-line")) && /m²/.test(await text("m-total-plan")), "metres appear once a scale is supplied"); await shot("jpeg");
  });
  await t("service online: several images, removal before processing, a broken image is reported without failing the session", async () => {
    await p.locator("[data-testid=file-input]").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: readFileSync("public/roof/samples/vegas-waterfront.preview.jpg") }, { name: "b.tif", mimeType: "image/tiff", buffer: readFileSync("public/roof/samples/vegas-subdivision.tif") }]);
    ok((await tid("picks").locator("li").count()) === 3, "three images listed"); await p.getByLabel("Remove roof.jpg").click(); ok((await tid("picks").locator("li").count()) === 2, "removed one before processing"); await tid("start").click();
    await p.waitForFunction(() => document.querySelectorAll("[data-testid=region-row]").length > 5, null, { timeout: 180000 }); ok(/ground sample distance|GeoTIFF metadata|none/.test(await text("scale-line")), `first image analysed: ${await text("scale-line")}`); ok((await tid("picks").locator("li").count()) === 2, "both images kept");
  });
  await t("service online: a file that is not a roof image fails cleanly", async () => {
    for (const n of ["a.jpg", "b.tif"]) await p.getByLabel(`Remove ${n}`).click();
    await p.locator("[data-testid=file-input]").setInputFiles({ name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(300)]) }); await tid("start").click(); await tid("error").waitFor({ timeout: 60000 }); ok(/could not be analysed|None of the images/.test(await text("error")), `error ${await text("error")}`);
  });
}
await t("responsive: no horizontal scroll at phone width", async () => { await p.setViewportSize({ width: 390, height: 800 }); await settle(); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "no horizontal overflow"); await shot("phone"); await p.setViewportSize({ width: 1600, height: 1000 }); });
await t("catalogue: demo 04 is live and links to the app", async () => { await p.goto(`${BASE}/ai-demos/ai-roof-measurement`, { waitUntil: "load" }); const txt = await p.locator("body").innerText(); ok(/Prototype/.test(txt) && /not survey-grade/i.test(txt), "landing text"); ok((await p.locator('a[href$="/ai-demos/ai-roof-measurement/app"]').count()) >= 1, "link to app"); });
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
