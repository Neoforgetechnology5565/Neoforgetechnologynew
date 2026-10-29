#!/usr/bin/env node
/**
 * Browser tests for demo 05 (Medical Imaging AI & Analysis), Playwright. All processing is in the page.
 *   NODE_PATH=<dir with playwright> BASE_URL=http://localhost:3000 node scripts/test-med-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", SHOTS = process.env.SHOTS || "/tmp/med-shots"; mkdirSync(SHOTS, { recursive: true });
const APP = `${BASE}/ai-demos/ai-medical-imaging-analysis/app`;
let failed = 0, passed = 0; const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true }); const p = await ctx.newPage(); p.setDefaultTimeout(30000); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded/i.test(m.text())) errors.push(m.text()); });
const t = async (n, f) => { try { await f(); passed++; console.log("  ✓", n); } catch (e) { failed++; console.error("  ✗", n, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 500)); await p.screenshot({ path: `${SHOTS}/fail-${failed}.png` }).catch(() => 0); } };
const tid = (id) => p.getByTestId(id); const txt = (id) => tid(id).innerText();
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), loc.click()]); const path = `${SHOTS}/${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path); };
const open = async () => { await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1200 }).catch(() => 0); await p.waitForTimeout(500); };
const settle = () => p.waitForTimeout(600);
const stat = (id) => p.evaluate((i) => { const c = document.querySelector(`[data-testid=${i}]`); const x = c.getContext("2d"), d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = c.width * c.height; for (let k = 0; k < n; k++) { const v = d[k * 4]; s += v; s2 += v * v; } const m = s / n; return { w: c.width, h: c.height, mean: m, sd: Math.sqrt(s2 / n - m * m) }; }, id);
console.log("medical imaging ui tests →", APP);

await open();
await t("landing: honest scope, Georgia, official logo, nothing before an image is chosen", async () => {
  const n = await txt("notice"); ok(/not a medical device/.test(n) && /never names a disease/.test(n) && /not a trained medical AI model/.test(n), "scope text"); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.querySelector("[data-testid=notice]").parentElement.parentElement).fontFamily)), "Georgia");
  ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "logo"); ok(/Nothing is shown before an image/.test(await txt("empty")), "empty state"); ok(/No radiology/.test(await txt("modalities")), "modalities stated honestly");
  ok((await p.locator("[data-testid^=sample-]").count()) === 5, "five samples");
});
await t("errors: DICOM, TIFF, text and broken images are refused clearly", async () => {
  for (const [f, c, re] of [["a.dcm", "x", /DICOM is not supported/], ["a.tif", "x", /not supported/], ["notes.txt", "hello", /Unsupported file/], ["broken.png", "not a png", /could not be decoded/], ["empty.png", "", /empty/]]) { writeFileSync(`${SHOTS}/${f}`, c); await tid("file-input").setInputFiles(`${SHOTS}/${f}`); await p.waitForFunction((r) => new RegExp(r).test(document.querySelector("[data-testid=error]")?.textContent || ""), re.source); }
  ok(!(await tid("canvas-original").count()), "no image shown after errors");
});
await t("sample: provenance and licence shown; original and processed canvases are real pixels", async () => {
  await open(); await tid("sample-fundus").click(); await tid("canvas-original").waitFor(); await settle(); ok(/CC0/.test(await txt("provenance")) && /No diagnosis is implied/.test(await txt("provenance")), "provenance");
  const a = await stat("canvas-original"), b = await stat("canvas-processed"); ok(a.w === 900 && a.h === 900 && a.sd > 20, `original ${JSON.stringify(a)}`); ok(b.w === 900 && b.sd > 10, "processed canvas drawn"); ok(/colour image/.test(await txt("colour-note")), "colour note");
  ok(/Decoded .* to 8-bit grayscale \(900×900 px\)/.test(await txt("ops-list")), "ops log starts with decode");
});
await t("enhancement: CLAHE raises local contrast, median / gaussian change the pixels, all logged", async () => {
  await tid("sample-phase-cell").click(); await settle(); const base = await stat("canvas-processed");
  await tid("contrast").selectOption("clahe"); await settle(); const c = await stat("canvas-processed"); ok(c.sd > base.sd * 1.05 || Math.abs(c.mean - base.mean) > 3, `CLAHE changed the image: sd ${base.sd.toFixed(1)}→${c.sd.toFixed(1)}`); ok(/CLAHE, 8×8 tiles/.test(await txt("ops-list")), "CLAHE logged");
  await tid("denoise").selectOption("median"); await settle(); ok(/Median filter, 3×3/.test(await txt("ops-list")), "median logged"); await tid("denoise").selectOption("gaussian"); await settle(); ok(/Gaussian blur/.test(await txt("ops-list")), "gaussian logged");
  await tid("invert").check(); await settle(); const inv = await stat("canvas-processed"); ok(/Inverted/.test(await txt("ops-list")) && inv.mean !== c.mean, "invert logged and applied");
  await tid("contrast").selectOption("window"); await settle(); ok(/Window \/ level/.test(await txt("ops-list")), "window logged"); await tid("contrast").selectOption("stretch"); await settle(); ok(/percentile/.test(await txt("ops-list")), "stretch logged");
});
await t("segmentation: Otsu finds regions with areas and statistics, mask overlay is drawn, regions can be focused", async () => {
  await open(); await tid("sample-phase-cell").click(); await settle(); await tid("seg").selectOption("otsu"); await settle();
  ok(/Otsu threshold \d+/.test(await txt("ops-list")) && /Connected components/.test(await txt("ops-list")), "ops logged"); const rows = await tid("region-row").count(); ok(rows >= 1, `regions: ${rows}`);
  const first = await tid("region-row").first().innerText(); ok(/\d+/.test(first), "row has numbers"); ok(!/mm²/.test(await txt("regions")), "areas are pixels without a pixel size");
  const noMask = await stat("canvas-processed"); await tid("mask-toggle").uncheck(); await settle(); const off = await stat("canvas-processed"); ok(Math.abs(noMask.mean - off.mean) > 0.5, "overlay toggles pixels"); await tid("mask-toggle").check();
  await tid("pixel-size").fill("0.107"); ok(/mm²/.test(await txt("regions")), "areas in mm² after entering a pixel size"); await tid("region-row").first().click(); await settle();
  ok(/no anatomical or diagnostic label/.test(await txt("regions")), "regions carry no diagnostic label");
});
await t("segmentation of the fluorescence sample: multi-level Otsu, morphology and hole filling", async () => {
  await tid("sample-mitosis").click(); await settle(); await tid("seg").selectOption("multi"); await settle(); ok(/Three-class Otsu/.test(await txt("ops-list")), "multi logged"); await tid("cls").selectOption("2"); await settle();
  await tid("seg").selectOption("otsu"); await tid("open").fill("1"); await tid("fill").check(); await settle(); ok(/Morphological opening/.test(await txt("ops-list")) && /Holes filled/.test(await txt("ops-list")), "morphology logged");
  const n = await tid("region-row").count(); ok(n >= 5, `cells found ${n}`); await tid("minarea").fill("500"); await p.waitForTimeout(500); const n2 = await tid("region-row").count().catch(() => 0); ok(n2 < n, `min-area removes small regions (${n}→${n2})`);
});
await t("region growing from a clicked seed", async () => {
  await tid("sample-phase-cell").click(); await settle(); await tid("seg").selectOption("grow"); await settle(); ok(/place the seed/.test(await txt("regions")) || /Click the processed image/.test(await txt("regions")), "asks for a seed");
  const b = await tid("canvas-processed").boundingBox(); await p.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5); await settle(); ok(/Region growing from seed/.test(await txt("ops-list")), "grow logged");
});
await t("swipe comparison and side-by-side layouts", async () => {
  await tid("layout-swipe").click(); await tid("swipe").waitFor(); await tid("swipe").fill("30"); ok((await tid("canvas-swipe").count()) === 1, "swipe canvas"); await tid("layout-side").click(); ok((await tid("canvas-processed").count()) === 1, "side by side");
});
await t("downloads: processed PNG, mask PNG, overlay PNG and a JSON report that lists the actual operations", async () => {
  await open(); await tid("sample-mitosis").click(); await settle(); await tid("contrast").selectOption("clahe"); await tid("seg").selectOption("otsu"); await settle();
  for (const id of ["dl-processed", "dl-mask", "dl-overlay"]) { const b = await dl(tid(id)); ok(b.slice(1, 4).toString() === "PNG" && b.length > 2000, `${id} is a PNG`); }
  const js = JSON.parse((await dl(tid("dl-json"))).toString()); ok(js.operations_in_order.some((s) => /CLAHE/.test(s)) && js.operations_in_order.some((s) => /Otsu/.test(s)) && js.regions.length >= 1 && /No diagnosis/.test(js.notice) && js.processed_as.includes("grayscale"), "JSON report");
  ok(!JSON.stringify(js).match(/diagnos(is|ed)\b(?!.*No)/) || /No diagnosis/.test(js.notice), "no diagnostic wording beyond the disclaimer"); await p.screenshot({ path: `${SHOTS}/segmentation.png` });
});
await t("responsive: no horizontal scroll at phone and tablet width", async () => {
  for (const w of [390, 820]) { await p.setViewportSize({ width: w, height: 900 }); await open(); await tid("sample-fundus").click(); await settle(); const s = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(s <= 2, `overflow ${s}px at ${w}`); }
});
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
