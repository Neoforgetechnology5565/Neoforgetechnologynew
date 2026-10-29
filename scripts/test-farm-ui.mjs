#!/usr/bin/env node
/**
 * Browser tests for demo 08 (Animal Detection & Monitoring for Smart Farming), Playwright. The model runs in the page; no service is involved.
 *   scripts/make-farm-fixtures.sh   (once; creates test-only media)
 *   NODE_PATH=<dir with playwright> BASE_URL=http://localhost:3000 node scripts/test-farm-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const FIX = process.env.FIX || "/tmp/claude-0/samp", BASE = process.env.BASE_URL || "http://localhost:3000", SHOTS = process.env.SHOTS || "/tmp/farm-shots"; mkdirSync(SHOTS, { recursive: true });
const APP = `${BASE}/ai-demos/ai-animal-detection-smart-farming/app`;
let failed = 0, passed = 0; const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true }); const p = await ctx.newPage(); p.setDefaultTimeout(30000); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded/i.test(m.text())) errors.push(m.text()); });
const t = async (n, f) => { try { await f(); passed++; console.log("  ✓", n); } catch (e) { failed++; console.error("  ✗", n, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 500)); await p.screenshot({ path: `${SHOTS}/fail-${failed}.png` }).catch(() => 0); } };
const tid = (id) => p.getByTestId(id); const txt = (id) => tid(id).innerText();
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), loc.click()]); const path = `${SHOTS}/${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path); };
const open = async () => { await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1200 }).catch(() => 0); await p.waitForTimeout(500); };
const run = async () => { await tid("run").scrollIntoViewIfNeeded(); await tid("run").click(); await tid("headline").waitFor({ timeout: 240000 }); };
const clickAt = async (fx, fy) => { const b = await tid("overlay").boundingBox(); await p.mouse.click(b.x + b.width * fx, b.y + b.height * fy); };
const haveFix = existsSync(`${FIX}/horses.jpg`) && existsSync(`${FIX}/horses-pan.webm`);
console.log("farm ui tests →", APP, haveFix ? "" : "(fixtures missing: run scripts/make-farm-fixtures.sh)");

await open();
await t("landing: honest scope, Georgia, official logo, no results before an analysis", async () => {
  const b = await p.locator("body").innerText(); ok(/Animal Detection & Monitoring for Smart Farming/.test(b) && /goats, pigs, chickens and deer are not detectable/.test(await txt("notice")) && /crop damage, disease/.test(await txt("notice")), "scope text");
  ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)) || /Georgia/.test(await p.evaluate(() => getComputedStyle(document.querySelector("[data-testid=notice]").parentElement.parentElement).fontFamily)), "Georgia");
  ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link"); ok(/Nothing to show yet/.test(await txt("stage-empty")), "empty stage"); ok(/Nothing is shown before then|Results appear here/.test(await txt("results-empty")), "empty results");
  ok(/Sheep, Cow, Horse|Sheep, cow and horse/i.test(await txt("classes")) && /Horse/.test(await txt("classes")), "classes listed"); ok(!(await tid("headline").count()), "no headline"); ok(await tid("run").isDisabled(), "run disabled without a file");
});
await t("invalid and empty files get clear errors and nothing is analysed", async () => {
  writeFileSync(`${SHOTS}/notes.txt`, "not an image"); await tid("file-input").setInputFiles(`${SHOTS}/notes.txt`); ok(/Unsupported file/.test(await txt("error")), "txt rejected");
  writeFileSync(`${SHOTS}/empty.jpg`, ""); await tid("file-input").setInputFiles(`${SHOTS}/empty.jpg`); ok(/empty/.test(await txt("error")), "empty rejected");
  writeFileSync(`${SHOTS}/broken.jpg`, "this is not really a jpeg"); await tid("file-input").setInputFiles(`${SHOTS}/broken.jpg`); await p.waitForFunction(() => /could not be decoded/.test(document.querySelector("[data-testid=error]")?.textContent || "")); ok(!(await tid("headline").count()), "no result for a broken image");
});
await t("sample: real detection of the cat, labelled with the model's own confidence, downloads work", async () => {
  await open(); await tid("sample-chelsea").click(); await p.waitForFunction(() => document.querySelector("[data-testid=stage-image]")?.complete); await tid("run").click(); await tid("headline").waitFor({ timeout: 120000 });
  ok(/not a farm scene/.test(await p.locator("body").innerText()), "sample honestly labelled"); ok((await tid("count-cat").count()) === 1, "cat class counted"); ok(Number(await txt("total")) >= 1, "total");
  const png = await dl(tid("dl-png")); ok(png.slice(1, 4).toString() === "PNG" && png.length > 20000, "annotated PNG"); const js = JSON.parse((await dl(tid("dl-json"))).toString()); ok(js.supported_animal_classes.includes("sheep") && !js.supported_animal_classes.includes("goat") && js.unique_animals_by_class.cat >= 1 && /YOLOX/.test(js.model), "JSON summary");
  await tid("view-original").click(); await tid("view-processed").click(); await p.screenshot({ path: `${SHOTS}/sample-cat.png` });
});
if (haveFix) {
  await t("image of horses: livestock-class counts, zone flags the animals standing inside it", async () => {
    await open(); await tid("file-input").setInputFiles(`${FIX}/horses.jpg`); await p.waitForFunction(() => document.querySelector("[data-testid=stage-image]")?.complete);
    await tid("run").click(); await tid("headline").waitFor({ timeout: 120000 }); const n = Number(await txt("count-horse").then((s) => s.split(/\s+/).slice(-2)[0])); ok(n >= 3, `horses detected ${n}`); ok(/livestock class/.test(await txt("count-horse")), "livestock label");
    ok(/No zone/.test(await txt("headline")), "no zone yet");
    await tid("zone-draw").click(); for (const [x, y] of [[0.0, 0.55], [0.5, 0.55], [0.5, 1.0], [0.0, 1.0]]) await clickAt(x === 0 ? 0.01 : x, y === 1 ? 0.99 : y); ok(/Click the picture/.test(await txt("zone-state")), "drawing state"); await tid("zone-draw").click(); ok(/Zone set with 4 corners/.test(await txt("zone-state")), "zone set");
    ok(!(await tid("headline").count()), "changing the zone clears the stale result"); await tid("run").click(); await tid("headline").waitFor({ timeout: 120000 }); const z = Number(await txt("zone-count")); ok(z >= 1 && z <= n, `animals in the left-half zone: ${z} of ${n}`);
    await p.screenshot({ path: `${SHOTS}/horses-zone.png` }); await tid("zone-clear").click(); ok(/No zone/.test(await txt("zone-state")), "zone cleared");
  });
  await t("video: frame-by-frame analysis with tracking and timestamped zone-entry events", async () => {
    await open(); await tid("file-input").setInputFiles(`${FIX}/horses-pan.webm`); await p.waitForFunction(() => { const v = document.querySelector("[data-testid=stage-video]"); return v && v.videoWidth > 0; });
    await tid("zone-draw").click(); for (const [x, y] of [[0.72, 0.4], [0.99, 0.4], [0.99, 0.99], [0.72, 0.99]]) await clickAt(x, y); await tid("zone-draw").click(); await tid("fps").selectOption("4");
    await run(); const n = Number(await txt("total")); ok(n >= 2, `distinct animals tracked ${n}`); ok((await tid("count-horse").count()) === 1, "horse class");
    const rows = await tid("event-row").allInnerTexts(); ok(rows.length >= 1 && rows.some((r) => /entered zone/.test(r)), `zone events: ${rows.join(" | ")}`); const first = parseFloat(rows[0]); ok(first > 0.2, `no event at t=0 (first at ${first}s), animals start outside the zone`);
    const csv = (await dl(tid("dl-csv"))).toString(); ok(/^time_s,frame,track,animal,event/.test(csv) && /horse,enter/.test(csv), "events CSV"); const js = JSON.parse((await dl(tid("dl-json"))).toString()); ok(js.zone_events.length === rows.length && js.tracker.startsWith("ByteTrack") && js.frame_sampling_per_second === 4, "JSON summary");
    await p.screenshot({ path: `${SHOTS}/video-events.png` });
  });
  await t("video without a zone: counts only, and no zone events panel", async () => {
    await open(); await tid("file-input").setInputFiles(`${FIX}/horses-pan.webm`); await p.waitForFunction(() => document.querySelector("[data-testid=stage-video]")?.videoWidth > 0); await tid("fps").selectOption("2"); await run();
    ok(/No zone set/.test(await txt("headline")) && !(await tid("events").count()), "no zone → no events");
  });
}
await t("responsive: no horizontal scroll at phone and tablet width", async () => {
  for (const w of [390, 820]) { await p.setViewportSize({ width: w, height: 900 }); await open(); const s = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(s <= 2, `scroll overflow ${s}px at ${w}`); }
});
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
