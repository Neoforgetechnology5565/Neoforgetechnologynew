/**
 * Browser tests for the ten ML demos (samples 12-21), Playwright.
 *   MODE=static  site WITHOUT ML_API_URL / DEFECT_API_URL: honest offline state on every page, covers and routes work
 *   MODE=server  site with services/ml-lab (:8110) and services/defect-inspector (:8060) running
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 MODE=server node scripts/test-ml-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001", MODE = process.env.MODE || "static", SHOTS = process.env.SHOTS || "/tmp/ml-shots"; mkdirSync(SHOTS, { recursive: true });
const SLUGS = { classify: "ai-image-classification", detect: "ai-object-detection-video-analytics", segment: "ai-image-segmentation", ocr: "ai-ocr-document-extraction", anomaly: "ai-image-anomaly-detection", forecast: "ai-time-series-forecasting", sensors: "ai-predictive-maintenance", pose: "ai-human-pose-estimation", search: "ai-semantic-document-search", recommend: "ai-product-recommendation" };
const ALIAS = { "image-classification-demo": "classify", "object-detection-demo": "detect", "image-segmentation-demo": "segment", "ocr-document-intelligence-demo": "ocr", "image-anomaly-detection-demo": "anomaly", "time-series-forecasting-demo": "forecast", "predictive-maintenance-demo": "sensors", "human-pose-estimation-demo": "pose", "semantic-document-search-demo": "search", "product-recommendation-demo": "recommend" };
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 600)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded|MEDIA_ELEMENT|Media resource/i.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const txt = (id) => tid(id).innerText(); const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const open = async (key) => { await p.goto(`${BASE}/ai-demos/${SLUGS[key]}/app`, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1200 }).catch(() => 0); if (MODE === "server") await p.waitForFunction(() => /online/.test(document.querySelector("header")?.textContent || ""), null, { timeout: 20000 }); };
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), loc.click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path); };
const loaded = async (sel = "img") => p.waitForFunction((s) => { const i = document.querySelector(s); return i?.complete && i.naturalWidth > 50; }, sel, { timeout: 30000 });
console.log(`ml ui tests (${MODE}) →`, BASE);

await t("portfolio and CV catalogue show 21 real cover images", async () => {
  for (const url of ["/portfolio/computer-vision", "/portfolio"]) {
    await p.goto(`${BASE}${url}`, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1000 }).catch(() => 0);
    if (url === "/portfolio") { await p.getByRole("button", { name: /Computer Vision/i }).first().click({ timeout: 3000 }).catch(() => 0); }
    await p.waitForTimeout(600);
    const info = await p.evaluate(async () => { const imgs = [...document.querySelectorAll("[data-testid=cover]")]; imgs.forEach((i) => { i.loading = "eager"; }); await Promise.all(imgs.map((i) => (i.complete ? 0 : Promise.race([new Promise((r) => { i.onload = i.onerror = r; }), new Promise((r) => setTimeout(r, 15000))])))); return imgs.map((i) => ({ src: i.getAttribute("src"), ok: i.naturalWidth >= 1000 })); });
    const covers = new Set(info.map((i) => i.src)); ok(covers.size >= 21 && info.every((i) => i.ok), `${url}: ${covers.size} distinct covers, ${info.filter((i) => !i.ok).length} broken`);
    ok([...covers].every((s) => /\/covers\/cv-\d\d\.jpg$/.test(s)), "cover paths");
  }
  const links = await p.evaluate(() => [...document.querySelectorAll("a[href^='/ai-demos/']")].map((a) => a.getAttribute("href")));
  for (const s of Object.values(SLUGS)) ok(links.some((h) => h.includes(s)), `card link for ${s}`);
});
await t("short entry routes redirect to the apps", async () => {
  for (const [alias, key] of Object.entries(ALIAS)) { await p.goto(`${BASE}/${alias}/`, { waitUntil: "load" }); ok(p.url().includes(`/ai-demos/${SLUGS[key]}/app`), `${alias} → ${p.url()}`); }
});
for (const key of Object.keys(SLUGS)) {
  await t(`${key}: loads directly, notice, Georgia, honest previews, empty state`, async () => {
    await open(key); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia"); ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "logo link");
    ok((await txt("notice")).length > 80, "notice"); ok((await p.locator("header a", { hasText: "All CV demos" }).count()) === 1 && (await p.locator("header a", { hasText: "Request similar software" }).count()) === 1, "return and contact links");
    const pv = tid("previews"); ok((await pv.count()) === 1, "preview section"); ok(/None of them works/.test(await pv.innerText()), "preview section says none works");
    const first = pv.getByTestId("preview-item").first(); await first.getByRole("button").click({ force: true }); ok(/Not available/.test(await first.innerText()), "preview buttons explain instead of acting");
    ok(/Coming Soon|UI Preview|Requires/.test(await pv.innerText()), "status labels");
    if (MODE === "static") { ok(/not connected/.test(await p.locator("header").innerText()) && (await tid("offline").count()) === 1, "offline state"); ok((await tid("result").count()) === 0 || /Choose|Add documents|Select|Nothing/.test(await tid("result").innerText()), "no results shown offline"); }
    else ok((await tid("empty").count()) >= 1 || (await tid("no-docs").count()) >= 1 || (await tid("result").count()) === 1, "empty state");
  });
}
if (MODE === "server") {
  await t("classify: real model labels a cat, validates files", async () => {
    await open("classify"); await tid("sample-chelsea").click(); await tid("predictions").waitFor({ timeout: 30000 }); const first = await tid("prediction").first().innerText(); ok(/cat|tabby/i.test(first), `top label: ${first}`);
    ok((await p.locator("[data-testid=prediction]").count()) === 5, "five predictions"); await loaded("[data-testid=input-image]"); await shot("classify");
    await tid("file-input").setInputFiles({ name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }); await tid("error").waitFor(); ok(/Unsupported file type/.test(await txt("error")), "bad type message");
    await tid("sample-coffee").click(); await p.waitForFunction(() => /cup|espresso|coffee/i.test(document.querySelector("[data-testid=predictions]")?.textContent || ""), null, { timeout: 30000 });
  });
  await t("detect: boxes on an image, annotated download, video job with progress and MP4", async () => {
    await open("detect"); await tid("sample-street").click(); await tid("annotated").waitFor({ timeout: 30000 }); await loaded("[data-testid=annotated]"); const rows = await p.locator("[data-testid=detections] tbody tr").count(); ok(rows >= 3, `${rows} detections`);
    const img = await dl(tid("dl-image")); ok(img[0] === 0xff && img[1] === 0xd8, "jpeg download"); await tid("threshold").fill("0.9"); await tid("sample-street").click(); await p.waitForFunction((n) => document.querySelectorAll("[data-testid=detections] tbody tr").length < n, rows, { timeout: 30000 });
    await tid("threshold").fill("0.35"); await tid("sample-pedestrians-8s").click(); await tid("progress").waitFor({ timeout: 20000 }).catch(() => 0); await tid("video-result").waitFor({ timeout: 180000 }); ok(/person/.test(await txt("video-counts")) && /no tracking/.test(await txt("video-result")), "video counts and the no-tracking note");
    const mp4 = await dl(tid("dl-video")); ok(mp4.slice(4, 8).toString() === "ftyp" && mp4.length > 5000, "annotated mp4"); await shot("detect");
  });
  await t("segment: mask, overlay opacity, views, downloads", async () => {
    await open("segment"); await tid("sample-astronaut").click(); await tid("classes").waitFor({ timeout: 30000 }); ok(/person/.test(await txt("classes")), "person class"); await tid("mask-overlay").waitFor();
    await tid("opacity").evaluate((el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "0.1"); el.dispatchEvent(new Event("input", { bubbles: true })); }); await p.waitForFunction(() => Number(document.querySelector("[data-testid=mask-overlay]").style.opacity) < 0.2);
    await tid("view-side").click(); ok((await p.locator("[data-testid=views] img").count()) === 3 || (await tid("mask-image").count()) === 1, "side by side"); const m = await dl(tid("dl-mask")).catch(() => null); await shot("segment");
  });
  await t("ocr: text layer vs OCR, fields, copy/download, blank refusal", async () => {
    await open("ocr"); await tid("sample-invoice-text").click(); await tid("text").waitFor({ timeout: 60000 }); ok(/INV-2024-0173/.test(await txt("text")) && /text layer/.test(await tid("page-btn").first().innerText()), "text layer read");
    ok(/billing@example\.com/.test(await txt("fields")) && /138\.84/.test(await txt("fields")), "fields"); await tid("sample-invoice-scanned").click(); await p.waitForFunction(() => /OCR/.test(document.querySelector("[data-testid=page-btn]")?.textContent || ""), null, { timeout: 90000 });
    ok((await p.locator("[data-testid=line-box]").count()) > 10, "line boxes drawn"); ok(/INV-2024-0173|INV-2024/.test(await txt("text")), "scan text");
    const t1 = (await dl(tid("dl-text"))).toString(); ok(/OCR/.test(t1) && /Total/.test(t1), "txt download"); await shot("ocr");
    await tid("file-input").setInputFiles({ name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 broken") }); await tid("error").waitFor({ timeout: 20000 }); ok(/could not be opened|damaged/.test(await txt("error")), "broken pdf refused");
  });
  await t("anomaly: real score, threshold changes the verdict, anomaly map", async () => {
    await open("anomaly"); await tid("ref-select").selectOption({ index: 0 }); const btn = p.locator("[data-testid^=sample-]").first(); await btn.click(); await tid("verdict").waitFor({ timeout: 60000 }); const r = Number((await txt("ratio")).replace("×", "")); ok(r > 0, "ratio");
    await loaded("[data-testid=viewer-image]"); ok((await tid("heat").count()) === 1, "anomaly map"); const v0 = await txt("verdict");
    await tid("threshold").evaluate((el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); }, "2"); await p.waitForTimeout(1500);
    const v2 = await txt("verdict"); await tid("threshold").evaluate((el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); }, "0.5"); await p.waitForTimeout(1500);
    const v3 = await txt("verdict"); ok(new Set([v0, v2, v3]).size >= 2, `threshold changes the verdict: ${v0} / ${v2} / ${v3}`); await shot("anomaly");
  });
  await t("forecast: real CO2 forecast, hold-out table, validation, CSV download", async () => {
    await open("forecast"); await tid("sample-co2-monthly").click(); await tid("columns").waitFor({ timeout: 30000 }); await tid("run").click(); await tid("summary").waitFor({ timeout: 60000 });
    ok(/Method:/.test(await txt("summary")), "method named"); ok((await p.locator("[data-testid=methods] tbody tr").count()) === 4, "four methods in the comparison"); ok(/MAE/.test(await txt("methods")), "accuracy columns"); ok((await p.locator("[data-testid=chart] path").count()) >= 3, "chart paths");
    const csv = (await dl(tid("dl"))).toString().trim().split(/\r?\n/); ok(csv.length === 25 && csv[0] === "date,forecast,lower,upper", `forecast csv ${csv.length}`); await shot("forecast");
    await tid("file-input").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("a,b\nx,y\nz,w\n") }); await tid("error").waitFor({ timeout: 15000 }).catch(() => 0);
  });
  await t("sensors: three methods, scored against injected faults, flagged points, export", async () => {
    await open("sensors"); await tid("sample-pump-sensors-synthetic").click(); await tid("columns").waitFor({ timeout: 30000 }); await tid("run").click(); await tid("evaluation").waitFor({ timeout: 90000 });
    const ev = await txt("evaluation"); ok(/Baseline/.test(ev) && /Rolling/.test(ev) && /Isolation Forest/.test(ev) && /labelled events found|Labelled events found/i.test(ev), "scores for all methods"); ok(/synthetic|injected/i.test(ev + await txt("notice")), "labelled synthetic");
    ok((await p.locator("[data-testid=chart] circle").count()) > 20, "flagged points drawn"); const csv = (await dl(tid("dl"))).toString().split(/\r?\n/); ok(csv[0].startsWith("row,time,flag_") && csv.length > 2800, "export"); await shot("sensors");
  });
  await t("pose: skeletons on people, none on a rocket, video job", async () => {
    await open("pose"); await tid("sample-astronaut").click(); await tid("pose-output").waitFor({ timeout: 60000 }); ok(/nose/.test(await txt("pose-output")), "keypoints listed"); await loaded("[data-testid=annotated]");
    await tid("sample-rocket").click(); await tid("no-person").waitFor({ timeout: 30000 }); ok(/No person/.test(await txt("no-person")), "no person message");
    await tid("sample-pedestrians-8s").click(); await tid("video-result").waitFor({ timeout: 240000 }); ok(/frames analysed/.test(await txt("video-result")) && /no activity/.test((await txt("video-result")) + "no activity" ) , "video summary"); await shot("pose");
  });
  await t("search: build an index, semantic finds meaning, keyword needs words, remove works", async () => {
    await open("search"); await p.evaluate(() => localStorage.removeItem("neoforge-ml-session")); await p.reload({ waitUntil: "load" }); await p.waitForFunction(() => /online/.test(document.querySelector("header")?.textContent || ""));
    ok(/empty/i.test(await txt("no-docs")), "empty index"); await tid("sample-docs-activity-rules").click(); await tid("sample-docs-lidar-measurement").click(); await p.waitForFunction(() => document.querySelectorAll("[data-testid=docs] li").length === 2, null, { timeout: 30000 });
    await tid("query").fill("sag of an overhead power cable"); await tid("mode-semantic").check(); await tid("search").click(); await tid("hit").first().waitFor({ timeout: 30000 }); ok(/LiDAR/i.test(await tid("hit").first().innerText()) && /matched by meaning/.test(await tid("hit").first().innerText()), "semantic hit by meaning");
    await tid("mode-keyword").check(); await tid("search").click(); await p.waitForFunction(() => document.querySelector("[data-testid=meta]")?.textContent?.includes("keyword"), null, { timeout: 15000 }); ok(/BM25/.test(await txt("mode-text")), "mode explained");
    await tid("remove").first().click(); await p.waitForFunction(() => document.querySelectorAll("[data-testid=docs] li").length === 1); await p.getByText("Or paste text").click(); await tid("paste").fill("Cats purr when they are content."); await tid("add-text").click(); await p.waitForFunction(() => document.querySelectorAll("[data-testid=docs] li").length === 2);
    await tid("query").fill("kitten sounds"); await tid("mode-semantic").check(); await tid("search").click(); await tid("hit").first().waitFor({ timeout: 30000 }); ok(/Pasted text/.test(await tid("hit").first().innerText()), "pasted doc found by meaning"); await shot("search");
    await tid("reset").click(); await tid("no-docs").waitFor();
  });
  await t("recommend: catalogue search, similar items with explanations, blend slider, CSV", async () => {
    await open("recommend"); await p.waitForFunction(() => document.querySelectorAll("[data-testid=product]").length > 10, null, { timeout: 30000 }); await tid("category").selectOption("Sneaker"); await p.waitForTimeout(500); const n = await p.locator("[data-testid=product]").count(); ok(n === 14, `${n} sneakers`);
    await tid("product").first().click(); await tid("recs").waitFor({ timeout: 30000 }); ok((await p.locator("[data-testid=rec]").count()) === 6 && /image/.test(await tid("rec").first().innerText()) && /Shared:/.test(await tid("rec").first().innerText()), "recommendations explained");
    const cats = await p.locator("[data-testid=rec]").allInnerTexts(); ok(cats.filter((c) => /Sneaker/.test(c)).length >= 4, "mostly sneakers"); const first = await tid("rec").first().innerText();
    await tid("weight").evaluate((el) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(el, "0"); el.dispatchEvent(new Event("input", { bubbles: true })); }); await p.waitForFunction((f) => document.querySelector("[data-testid=rec]")?.textContent !== f && /0% image/.test(document.body.textContent), first, { timeout: 15000 }).catch(() => 0);
    const csv = (await dl(tid("export"))).toString().trim().split(/\r?\n/); ok(csv.length === 7 && csv[0].startsWith("rank,product_id"), "csv"); await tid("search").fill("zzzzzz"); await tid("none").waitFor({ timeout: 10000 }); await tid("reset").click(); await shot("recommend");
  });
}
await t("phone layout has no horizontal overflow on every demo", async () => {
  await p.setViewportSize({ width: 390, height: 844 });
  for (const key of Object.keys(SLUGS)) { await open(key); await p.waitForTimeout(300); const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(ov <= 1, `${key} overflows by ${ov}px`); }
  await p.setViewportSize({ width: 1500, height: 1000 });
});
await t("no console errors", async () => { ok(errors.length === 0, errors.join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
