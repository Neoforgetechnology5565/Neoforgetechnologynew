#!/usr/bin/env node
/**
 * Browser tests for samples 22-24 (restaurant area review, table tennis, basketball), Playwright.
 *   MODE=browser site WITHOUT VI_API_URL: the analysis runs inside the page (default on a static host)
 *   MODE=server  site with services/video-intel (:8130) running
 *   NODE_PATH=<dir with playwright> BASE_URL=http://localhost:3000 MODE=server node scripts/test-vi-ui.mjs [restaurant|tt|bb]
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const FIX = new URL("../test-fixtures/vi/", import.meta.url).pathname;
const BASE = process.env.BASE_URL || "http://localhost:3000", MODE = process.env.MODE || "server", SHOTS = process.env.SHOTS || "/tmp/vi-shots"; mkdirSync(SHOTS, { recursive: true });
const only = process.argv.slice(2);
const SLUGS = { restaurant: "ai-restaurant-employee-monitoring", tt: "ai-table-tennis-video-intelligence", bb: "ai-basketball-video-intelligence" };
const ALIAS = { "restaurant-employee-monitoring-demo": "restaurant", "table-tennis-intelligence-demo": "tt", "basketball-intelligence-demo": "bb" };
let failed = 0, passed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const p = await ctx.newPage(); p.setDefaultTimeout(15000); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded|MEDIA_ELEMENT|Media resource|403|404/i.test(m.text())) errors.push(m.text()); });
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 500)); await p.screenshot({ path: `${SHOTS}/${MODE}-fail-${failed}.png` }).catch(() => 0); } };
const tid = (id) => p.getByTestId(id); const txt = (id) => tid(id).innerText();
const nav = async (id) => { await p.locator(`[data-nav=${id}]`).click(); await p.waitForTimeout(150); };
const open = async (key) => { await p.goto(`${BASE}/ai-demos/${SLUGS[key]}/app`, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1200 }).catch(() => 0); await p.waitForTimeout(400); };
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), loc.click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return { name: d.suggestedFilename(), buf: readFileSync(path) }; };
const fillNum = async (testid, v) => { await tid(testid).fill(String(v)); };
const ready = async () => p.waitForFunction(() => document.querySelector("[data-testid=service-status]")?.getAttribute("data-state") === "online", null, { timeout: 15000 });
const analyse = async (timeout = 240000) => {
  await tid("run").click();
  await p.waitForFunction(() => document.querySelector("[data-testid=progress]") || document.querySelector("[data-testid=job-error]"), null, { timeout: 20000 });
  await p.waitForFunction(() => document.querySelector("[data-testid=job-error]") || /Analyse again/.test(document.querySelector("[data-testid=run]")?.textContent ?? ""), null, { timeout });
  ok(!(await tid("job-error").count()), "job error: " + (await tid("job-error").count() ? await txt("job-error") : ""));
  await p.waitForTimeout(1200);
};
/** True if the overlay canvas contains pixels of the given colour (r,g,b within tolerance). */
const canvasHas = (rgb, tol = 40) => p.evaluate(([c, tl]) => { const cv = document.querySelector("[data-testid=overlay]"); const g = cv.getContext("2d"); const d = g.getImageData(0, 0, cv.width, cv.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 120 && Math.abs(d[i] - c[0]) < tl && Math.abs(d[i + 1] - c[1]) < tl && Math.abs(d[i + 2] - c[2]) < tl) return true; return false; }, [rgb, tol]);
const canvasPoint = async (fx, fy) => { await tid("overlay").evaluate((el) => el.scrollIntoView({ block: "start" })); await p.waitForTimeout(350); const b = await tid("overlay").boundingBox(); return { x: b.x + b.width * fx, y: b.y + b.height * fy }; };
console.log(`vi ui tests (${MODE}) →`, BASE);

if (!only.length) {
  await t("portfolio and CV catalogue show the three new covers and live-demo links", async () => {
    for (const url of ["/portfolio/computer-vision", "/portfolio"]) {
      await p.goto(`${BASE}${url}`, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1000 }).catch(() => 0);
      if (url === "/portfolio") await p.getByRole("button", { name: /Computer Vision/i }).first().click({ timeout: 3000 }).catch(() => 0);
      await p.waitForTimeout(600);
      const info = await p.evaluate(async () => { const imgs = [...document.querySelectorAll("[data-testid=cover]")]; imgs.forEach((i) => { i.loading = "eager"; }); await Promise.all(imgs.map((i) => (i.complete ? 0 : Promise.race([new Promise((r) => { i.onload = r; i.onerror = r; }), new Promise((r) => setTimeout(r, 8000))])))); return imgs.map((i) => ({ src: i.src, ok: i.complete && i.naturalWidth > 100 })); });
      const covers = new Set(info.map((i) => i.src)); for (const n of ["22", "23", "24"]) ok([...covers].some((s) => s.endsWith(`/cv-${n}.jpg`)), `${url}: cover ${n}`); ok(info.every((i) => i.ok), `${url}: broken cover images`);
      ok(covers.size >= 24, `${url}: ${covers.size} distinct covers`);
    }
    const links = await p.evaluate(() => [...document.querySelectorAll("a[href^='/ai-demos/']")].map((a) => a.getAttribute("href")));
    for (const s of Object.values(SLUGS)) ok(links.some((h) => h.includes(s)), `card link for ${s}`);
  });
  await t("short entry routes redirect to the apps", async () => { for (const [alias, key] of Object.entries(ALIAS)) { await p.goto(`${BASE}/${alias}/`, { waitUntil: "load" }); ok(p.url().includes(`/ai-demos/${SLUGS[key]}/app`), `${alias} → ${p.url()}`); } });
  for (const key of Object.keys(SLUGS)) {
    await t(`${key}: renders the white/green Georgia workspace with honest status labels`, async () => {
      await open(key);
      const css = await p.evaluate(() => { const r = document.querySelector(".app-readable"); const cs = getComputedStyle(r); return { font: cs.fontFamily, bg: cs.backgroundColor, size: cs.fontSize }; });
      ok(/Georgia/.test(css.font), css.font); ok(css.bg === "rgb(255, 255, 255)", css.bg); ok(parseFloat(css.size) >= 15, css.size);
      const logo = await p.locator("header a[href='/portfolio/computer-vision'] >> visible=true").first().isVisible(); ok(logo, "official logo link");
      ok(/does not recogni[sz]e faces|no face recognition|never.*face|not.*identify/i.test(await txt("notice")) || /face/i.test(await p.locator("#app-main").innerText()), "face statement");
      const labels = await p.locator("[data-status]").evaluateAll((els) => [...new Set(els.map((e) => e.textContent))]);
      for (const l of ["Working", "Coming Soon"]) ok(labels.includes(l), `status label ${l} on overview: ${labels}`);
      if (MODE === "browser") { await ready(); ok(await p.getByText(/Open this sample/).first().isVisible().catch(() => false) === false, "samples are on the Video Analysis tab"); }
    });
  }
}
if (MODE === "server" || MODE === "browser") {
  if (!only.length || only.includes("restaurant")) {
    await t("restaurant: unsupported or empty uploads are refused with a message", async () => {
      await open("restaurant"); await ready(); await nav("analysis");
      await tid("upload").setInputFiles({ name: "x.mp4", mimeType: "video/mp4", buffer: Buffer.from("\x89PNG\r\n\x1a\n" + "0".repeat(50), "latin1") }); await tid("error").waitFor(); ok(/Unsupported file type|image/i.test(await txt("error")), await txt("error"));
    });
    await t("restaurant: sample opens with provenance, then real analysis tracks people", async () => {
      await open("restaurant"); await ready(); await nav("analysis");
      ok(/not a restaurant/i.test(await p.locator("[data-testid=samples]").innerText()) || (await p.locator("[data-testid=samples] details").first().evaluate((d) => { d.open = true; return d.innerText; })).match(/NOT a restaurant/), "sample says it is not a restaurant");
      await tid("open-pedestrians-opencv-vtest").click(); await tid("run").waitFor();
      await p.getByLabel("End (s, optional)").fill("20"); await analyse();
      const rows = await p.locator("[data-testid=tracks] tbody tr").count(); ok(rows >= 3, `${rows} tracks`);
      await tid("scrub").evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, "10"); el.dispatchEvent(new Event("input", { bubbles: true })); }); await p.waitForTimeout(600);
      ok(await canvasHas([22, 131, 74], 70) || await canvasHas([17, 100, 58], 50), "tracked-person boxes are drawn on the video overlay");
    });
    await t("restaurant: area monitoring needs an area; manual drawing works; example area gives events", async () => {
      await nav("area"); ok(await tid("area-card").isVisible(), "area card");
      ok(await tid("close-area").isDisabled(), "cannot close an empty area");
      await tid("clear-area").click({ force: true }).catch(() => 0);
      for (const [x, y] of [[0.2, 0.12], [0.7, 0.12], [0.7, 0.45]]) { const pt = await canvasPoint(x, y); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(250); }
      ok(!(await tid("close-area").isDisabled()), "three points can be closed"); await tid("undo-point").click(); ok(await tid("close-area").isDisabled(), "two points cannot");
      await tid("clear-area").click(); await tid("example-area").click();
      await tid("analyse-area").click(); await tid("events").waitFor();
      const k = Number(await p.locator("[data-testid=k-events]").innerText().then((s) => s.match(/\d+/g)[0])); ok(k >= 1, `events ${k}`);
      const body = await p.locator("[data-testid=events-card]").innerText(); ok(!/break|idle|violation|misconduct/i.test(body.replace(/Potential Extended Area Presence/g, "")), "neutral wording"); ok(/Complete observation|Incomplete observation/.test(body), "observation status");
    });
    await t("restaurant: threshold controls the flags; incomplete observations are labelled", async () => {
      await fillNum("threshold", 1); await tid("analyse-area").click(); await p.waitForTimeout(700); const many = Number((await txt("k-flagged")).match(/\d+/)[0]);
      await fillNum("threshold", 999); await tid("analyse-area").click(); await p.waitForTimeout(700); const none = Number((await txt("k-flagged")).match(/\d+/)[0]);
      ok(many >= 1 && none === 0, `flags at 1 s: ${many}, at 999 s: ${none}`);
      ok(Number((await txt("k-incomplete")).match(/\d+/)[0]) >= 1, "this clip's tracks start or end inside the area, so incomplete observations are expected");
    });
    await t("restaurant: an evidence clip is a real playable video", async () => {
      await p.locator("[data-testid=make-clip]").first().click(); await tid("clips").waitFor({ timeout: 60000 });
      await p.waitForFunction(() => { const v = document.querySelector("[data-testid=clip-video]"); return v && v.readyState >= 1 && (v.duration > 2 || !isFinite(v.duration)); }, null, { timeout: 30000 });
      ok(await p.evaluate(() => document.querySelector("[data-testid=clip-video]").videoWidth) > 100, "clip has video frames");
    });
    await t("restaurant: attendance comparison is labelled simulated, needs manual links and reports Insufficient Data", async () => {
      await nav("attendance"); ok(/Simulated data/.test(await txt("sim-banner")), "simulated banner"); ok(/does not recogni[sz]e people/.test(await txt("sim-banner")), "no recognition statement");
      await p.getByLabel(/^Link track/).first().selectOption({ index: 1 }); await tid("compare").click(); await tid("attendance-table").waitFor();
      const body = await txt("attendance-table"); ok(/Insufficient Data/.test(body), "unlinked people are Insufficient Data"); ok(/fictional/i.test(body), "fictional names");
      ok(!/\b(late|absent|skiving|fired)\b/i.test(body), "neutral wording");
    });
    await t("restaurant: exports (events CSV, PDF) are valid files", async () => {
      await nav("reports"); const csv = await dl(tid("export-events")); const text = csv.buf.toString(); ok(/^Track \(temporary\),Entry \(video s\)/.test(text) && text.split("\r\n").length >= 3, text.slice(0, 120));
      const pdf = await dl(tid("export-pdf")); ok(pdf.buf.slice(0, 5).toString() === "%PDF-" && pdf.buf.length > 1500, "pdf");
    });
    await t("restaurant: settings show the models and privacy, and the video can be deleted", async () => {
      await nav("settings"); ok(/YOLOX/.test(await txt("settings")), "models listed"); await tid("delete-video").click(); await nav("analysis"); await tid("samples").waitFor();
    });
  }
  if (!only.length || only.includes("tt")) {
    await t("table tennis: analysis tracks the ball and players on the composite clip", async () => {
      await open("tt"); await ready(); await nav("analysis");
      await tid("upload").setInputFiles(FIX + "table-tennis-composite.webm"); await tid("run").waitFor(); await p.getByLabel("End (s, optional)").count().catch(() => 0);
      await analyse(300000);
      await tid("scrub").evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, "2.4"); el.dispatchEvent(new Event("input", { bubbles: true })); }); await p.waitForTimeout(700);
      ok(await canvasHas([217, 119, 6], 60), "ball trail is drawn in amber");
    });
    await t("table tennis: a swapped click order is refused; correct corners calibrate with a reported error", async () => {
      await nav("calibration"); 
      const pts = [[0.24, 0.55], [0.75, 0.56], [0.70, 0.43], [0.31, 0.42]]; const bad = [pts[0], pts[2], pts[1], pts[3]];
      for (const [x, y] of bad) { const c = await canvasPoint(x, y); await p.mouse.click(c.x, c.y); }
      await tid("calibrate").click(); await tid("calib-error").waitFor(); ok(/order/i.test(await txt("calib-error")), await txt("calib-error"));
      await tid("clear-corners").click(); for (const [x, y] of pts) { const c = await canvasPoint(x, y); await p.mouse.click(c.x, c.y); await p.waitForTimeout(250); } await tid("calibrate").click(); await tid("calibration-result").waitFor();
      ok(/cm/.test(await txt("rms")), "rms reported");
    });
    await t("table tennis: ball-visible segments, gaps, and the table-plane map", async () => {
      await nav("rallies"); await tid("segments").waitFor(); const n = await p.locator("[data-testid=segments] tbody tr").count(); ok(n >= 1, `${n} segments`);
      const vis = Number((await txt("k-visible")).match(/[\d.]+/)[0]); ok(vis > 20 && vis < 100, `visibility ${vis}`);
      ok(/Experimental/.test(await p.locator("[data-testid=segments-card]").innerText()), "experimental label"); ok(/not an officiated rally/i.test(await p.locator("[data-testid=segments-card]").innerText()), "not-a-rally caveat");
      ok(/gaps/i.test(await txt("visibility")), "gaps explained"); ok(await tid("table-map").isVisible(), "table map");
    });
    await t("table tennis: manual annotation pairs rallies, counts points and exports CSV", async () => {
      await nav("annotation"); ok(/Manual Annotation/.test(await txt("manual-banner")) || /entered by you/.test(await txt("manual-banner")), "manual banner");
      const seek = async (v) => { await tid("scrub").evaluate((el, x) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, x); el.dispatchEvent(new Event("input", { bubbles: true })); }, v); await p.waitForTimeout(200); };
      const add = async (kind) => { await tid("ann-kind").selectOption(kind); await tid("ann-add").click(); };
      await seek("1"); await add("Rally start"); await seek("4"); await add("Point: side A"); await add("Rally end"); await seek("6.2"); await add("Rally start"); await seek("9"); await add("Point: side B"); await seek("9.2"); await add("Rally end");
      ok((await txt("ann-rallies")).includes("2"), "two rallies"); ok(/2\s*–\s*0|1\s*–\s*1/.test(await txt("ann-score")), await txt("ann-score"));
      ok((await p.locator("[data-testid=ann-list] tbody tr").count()) === 6, "six rows"); await p.getByRole("button", { name: /^Delete Rally end at 0:04/ }).click();
      ok(/unpaired marks[\s\S]*1/i.test(await txt("ann-summary")), "an unpaired mark is reported, not guessed");
      const csv = await dl(tid("ann-export")); ok(/Manual Annotation/.test(csv.buf.toString()), "csv source column");
    });
    await t("table tennis: reports export CSV and PDF", async () => { await nav("reports"); const c = await dl(tid("export-segments")); ok(/Segment,Start/.test(c.buf.toString()), "csv"); const f = await dl(tid("export-pdf")); ok(f.buf.slice(0, 5).toString() === "%PDF-", "pdf"); });
  }
  if (!only.length || only.includes("bb")) {
    await t("basketball: analysis tracks players and the orange ball", async () => {
      await open("bb"); await ready(); await nav("analysis"); await tid("upload").setInputFiles(FIX + "basketball-composite.webm"); await tid("run").waitFor(); await analyse(300000);
      await tid("scrub").evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, "6"); el.dispatchEvent(new Event("input", { bubbles: true })); }); await p.waitForTimeout(700);
      ok(await canvasHas([217, 119, 6], 60), "ball trail");
    });
    await t("basketball: court mapping needs four landmarks and reports the error in metres", async () => {
      await nav("court"); await tid("calibrate").isDisabled().then((d) => ok(d, "calibrate disabled without points"));
      await tid("landmark").selectOption({ index: 1 }); const c = await canvasPoint(0.5, 0.5); await p.mouse.click(c.x, c.y); ok((await p.locator("[data-testid=refs] tbody tr").count()) === 1, "one point added");
      await tid("clear-refs").click();
      const L = JSON.parse(readFileSync(FIX + "basketball-composite.truth.json", "utf8")).landmarks_px.filter((x) => x.visible && x.px[1] < 400).slice(0, 7);
      for (const l of L) { await tid("landmark").selectOption(l.name); const c = await canvasPoint(l.px[0] / 960, l.px[1] / 540); await p.mouse.click(c.x, c.y); await p.waitForTimeout(250); }
      ok((await p.locator("[data-testid=refs] tbody tr").count()) >= 4, "landmarks added"); await tid("calibrate").click(); await tid("calibration-result").waitFor();
      const rms = parseFloat((await txt("rms")).replace(/[^\d.]/g, "")); ok(rms < 0.1, `rms ${rms} m`);
    });
    await t("basketball: heat map and distances come from the tracks; possession events are labelled as a rule", async () => {
      await nav("players"); await tid("heat-card").waitFor(); const cells = await p.locator("[data-testid=heat-card] svg rect").count(); ok(cells > 20, `${cells} heat cells`);
      ok(/Seconds each cell/.test(await txt("heat-note")), "heat note"); const rows = await p.locator("[data-testid=players-card] tbody tr").count(); ok(rows >= 1, "players");
      await nav("possession"); await tid("possession").waitFor(); ok(/Potential Possession Event/.test(await txt("possession-card")) || (await p.locator("[data-testid=possession] tbody tr").count()) >= 1, "possession rows"); ok(/geometric rule/.test(await txt("possession-card")), "rule explained");
      ok(/Coming Soon/.test(await p.locator("#app-main").innerText()), "shot detection is Coming Soon");
    });
    await t("basketball: manual shot annotations drive the statistics and are labelled", async () => {
      await nav("annotation"); ok(/entered by you/i.test(await txt("manual-banner")), "banner");
      const add = async (kind, team, pts) => { await tid("ann-kind").selectOption(kind); await tid("ann-team").selectOption(team); if (pts) await tid("ann-points").selectOption(String(pts)); await tid("ann-add").click(); };
      await add("Shot made", "A", 3); await add("Shot made", "A", 2); await add("Shot missed", "A"); await add("Shot made", "B", 2);
      ok((await txt("pts-A")).includes("5") && (await txt("pts-B")).includes("2"), `${await txt("pts-A")} / ${await txt("pts-B")}`);
      ok(/2\/3/.test(await txt("ann-summary")) && /67%|66\.67%/.test(await txt("ann-summary")), "shooting counts");
      const csv = await dl(tid("ann-export")); ok(/Manual Annotation/.test(csv.buf.toString()), "csv source");
    });
    await t("basketball: exports are valid", async () => { await nav("reports"); const c = await dl(tid("export-players")); ok(/^Track \(temporary\)/.test(c.buf.toString()), "players csv"); const f = await dl(tid("export-pdf")); ok(f.buf.slice(0, 5).toString() === "%PDF-", "pdf"); });
  }
}
await t("no console or page errors", async () => ok(errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 500)));
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
