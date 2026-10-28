#!/usr/bin/env node
/**
 * End-to-end UI tests of the factory workforce / PPE monitoring demonstration (Playwright).
 *   MODE=static  site WITHOUT PPE_API_URL: stored result of the bundled sample, uploads disabled with a clear message
 *   MODE=server  site with PPE_API_URL=http://localhost:8020 and services/ppe-monitor running: live processing
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 MODE=static SHOTS=/tmp/shots node scripts/test-ppe-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", MODE = process.env.MODE || "static", APP = `${BASE}/ai-demos/ai-factory-workforce-ppe-compliance/app`, SHOTS = process.env.SHOTS || "/tmp/ppe-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const num = async (id) => Number((await tid(id).innerText()).replace(/[^0-9.]/g, ""));
const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const seek = async (s) => { await p.evaluate((x) => { const v = document.querySelector("video"); v.pause(); v.currentTime = x; }, s); await p.waitForTimeout(900); };
const px = () => p.evaluate(() => { const c = document.querySelector("[data-testid=overlay-canvas]"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
const SAMPLE = "factory-corridor-ppe", VIOLATION_T = 21.7;
console.log(`ppe ui tests (${MODE}) →`, APP);
await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: honest scope, Georgia, logo, sample with licence and scenario description, service state", async () => {
  const txt = await p.locator("body").innerText(); ok(/automated visual assessment/i.test(txt) && /computer vision/i.test(txt) && /Factory Workforce & PPE Monitoring/.test(txt), "scope text"); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia");
  await tid(`sample-${SAMPLE}`).waitFor(); await tid(`sample-${SAMPLE}`).click(); const c = await tid("sample-credit").innerText(); ok(/Intel/.test(c) && /BSD/.test(c) && /without a vest/.test(c) && /Nothing was staged or edited/.test(c), "credit, licence and what the sample contains");
  await tid("overlay-pane").waitFor(); ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link in the header");
  const state = await tid("engine-state").innerText(); if (MODE === "static") ok(/not connected/.test(state) && /Load stored result/.test(await tid("start").innerText()), `static state: ${state}`); else { await p.waitForFunction(() => /online/.test(document.querySelector("[data-testid=engine-state]")?.textContent || ""), null, { timeout: 15000 }); ok(/Start processing/.test(await tid("start").innerText()), "server start label"); }
  ok(!(await tid("start").isDisabled()) && await tid("stop").isDisabled(), "start enabled, stop disabled before a run");
});
if (MODE === "server") {
  await t("server: live progress, live statistics, real overlays; stride 5 to keep the test short", async () => {
    await p.getByLabel("Frame stride").selectOption("5"); await tid("start").click(); await p.waitForFunction(() => /Processing|Queued|Uploading/.test(document.querySelector("[data-testid=status]")?.textContent || ""), null, { timeout: 30000 });
    await p.waitForFunction(() => Number(document.querySelector("[data-testid=stat-instances]")?.textContent?.replace(/\D/g, "")) > 0, null, { timeout: 90000 }); await shot("live");
    ok(await tid("stop").isEnabled(), "stop enabled while running"); await p.waitForFunction(() => /Completed/.test(document.querySelector("[data-testid=status]")?.textContent || ""), null, { timeout: 240000 });
    ok((await num("sum-frames")) === 390 && (await num("sum-fps")) > 0 && (await num("sum-duration")) > 0, "390 frames, measured fps and duration");
    ok(!(await tid("precomputed-note").count()), "server result is not labelled as stored");
  });
} else {
  await t("static: loads the stored result, labelled as such, with measured numbers from that run", async () => {
    await tid("start").click(); await p.waitForFunction(() => /Completed/.test(document.querySelector("[data-testid=status]")?.textContent || ""), null, { timeout: 60000 });
    ok(/real run of the service/.test(await tid("precomputed-note").innerText()) && /not computed in your browser/.test(await tid("precomputed-note").innerText()), "stored-result note");
    ok((await num("sum-frames")) === 1950 && (await num("sum-fps")) > 0 && (await num("sum-duration")) > 0, "frames, measured fps and duration come from the stored run"); await shot("loaded");
  });
}
await t("statistics at a frame with a worker without a vest: current-frame and cumulative values, assessment table", async () => {
  await seek(VIOLATION_T); ok((await num("stat-visible")) >= 2, `workers visible ${await num("stat-visible")}`); ok((await num("stat-violations")) >= 1, "potential violation in this frame"); ok((await num("stat-compliant")) >= 1, "a compliant worker in the same frame");
  ok((await num("stat-hats")) >= 1 && (await num("stat-vests")) >= 1, "hats and vests detected"); const rows = await tid("worker-table").innerText(); ok(/Potential PPE violation/.test(rows) && /Compliant/.test(rows) && /not detected/.test(rows), `table: ${rows}`);
  ok((await num("stat-instances")) > (await num("stat-unique")) && (await num("stat-unique")) >= 1, "instances exceed unique tracks"); ok(/not a safety determination|automated visual assessment/.test(await tid("count-note").innerText()) && /not identities|not a headcount/.test(await tid("count-note").innerText()), "explanation shown"); await shot("violation-frame");
});
await t("overlay is drawn from real results and every kind can be toggled", async () => {
  const all = await px(); ok(all > 500, `overlay pixels ${all}`);
  await tid("toggle-ppe").uncheck(); await p.waitForTimeout(300); const noPpe = await px(); ok(noPpe < all && noPpe > 100, `ppe off: ${noPpe} < ${all}`); await tid("toggle-ppe").check();
  await tid("toggle-workers").uncheck(); await p.waitForTimeout(300); const noWorkers = await px(); ok(noWorkers < all && noWorkers > 50, `workers off: ${noWorkers} < ${all}`); await tid("toggle-ppe").uncheck(); await p.waitForTimeout(300); ok((await px()) < 50, "nothing drawn when both are off"); await tid("toggle-workers").check(); await tid("toggle-ppe").check();
  await tid("toggle-ids").uncheck(); await tid("toggle-confidence").uncheck(); await tid("toggle-assessment").uncheck(); await p.waitForTimeout(300); const bare = await px(); ok(bare < all, `labels off: ${bare} < ${all}`); await tid("toggle-ids").check(); await tid("toggle-confidence").check(); await tid("toggle-assessment").check();
  ok(await tid("legend").isVisible() && /Potential PPE violation/.test(await tid("legend").innerText()), "legend distinguishes worker, PPE and uncertain");
});
await t("statistics follow the playhead: cumulative values only grow, frame number follows", async () => {
  await seek(25); const late = { i: await num("stat-instances"), u: await num("stat-unique"), f: await num("stat-frame") }; await seek(8); const early = { i: await num("stat-instances"), u: await num("stat-unique"), f: await num("stat-frame") };
  ok(early.f < late.f && early.i < late.i && early.u <= late.u, JSON.stringify({ early, late })); await seek(2); ok((await num("stat-visible")) === 0 && /No workers detected/.test(await tid("no-workers").innerText()), "empty corridor: no workers, no violations"); ok((await num("stat-violations")) === 0, "no violations without workers");
});
await t("transport controls: play/pause, speed, frame step, timeline", async () => {
  await tid("speed").selectOption("2"); await tid("play").click(); await p.waitForTimeout(800); ok(/Pause/.test(await tid("play").innerText()), "playing"); await tid("play").click();
  const f0 = await num("stat-frame"); await p.getByRole("button", { name: "Next frame" }).click(); await p.getByRole("button", { name: "Next frame" }).click(); await p.waitForTimeout(500); ok((await num("stat-frame")) >= f0, "frame stepping moves forward");
  await tid("timeline").fill("5"); await p.waitForTimeout(1000); ok(Math.abs((await num("stat-time")) - 5) < 0.3, `timeline seek updates timestamp (${await tid("stat-time").innerText()})`);
});
await t("comparison views: annotated video and side-by-side both play", async () => {
  await tid("mode-processed").click(); await p.waitForFunction(() => document.querySelector("video")?.readyState >= 2, null, { timeout: 20000 }); ok((await p.locator("video").count()) === 1 && (await tid("plain-pane").count()) === 1, "annotated pane");
  await tid("mode-side").click(); await p.waitForFunction(() => [...document.querySelectorAll("video")].length === 2 && [...document.querySelectorAll("video")].every((v) => v.readyState >= 2), null, { timeout: 20000 });
  await p.evaluate(() => { document.querySelector("video").currentTime = 21.7; }); await p.waitForTimeout(1500); const d = await p.evaluate(() => { const v = [...document.querySelectorAll("video")]; return Math.abs(v[0].currentTime - v[1].currentTime); }); ok(d < 0.3, `panes stay in sync (${d})`); await shot("side"); await tid("mode-overlay").click(); await tid("overlay-pane").waitFor();
});
await t("downloads: annotated video, JSON and CSV are real files with the expected content", async () => {
  const dl = async (id) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), tid(id).click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return { name: d.suggestedFilename(), path }; };
  const j = await dl("download-json"); const js = JSON.parse(readFileSync(j.path, "utf8")); ok(js.frames.length === (MODE === "static" ? 1950 : 390) && js.summary.frames_processed === js.frames.length, "json frames");
  ok(js.frames.some((f) => f.detections.some((d) => d.class === "worker" && d.ppe_assessment.status === "potential_violation")), "json carries assessments");
  const c = await dl("download-csv"); const rows = readFileSync(c.path, "utf8").trim().split("\n"); ok(rows[0].startsWith("frame_number,timestamp_seconds,class,worker_track_id") && rows.length - 1 === js.frames.reduce((n, f) => n + f.detections.length, 0), "csv rows = detections");
  const v = await dl("download-video"); ok(/annotated\.(mp4|webm)$/.test(v.name) && readFileSync(v.path).length > 100000, `video ${v.name}`);
});
if (MODE === "server") {
  await t("monitoring zone: drawing a rectangle adds a zone count that is separate and bounded by workers visible", async () => {
    await p.getByLabel("Frame stride").selectOption("5"); await tid("draw-zone").click(); const box = await tid("overlay-canvas").boundingBox(); await p.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2); await p.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.995);
    await p.waitForFunction(() => /Clear zone/.test(document.body.innerText), null, { timeout: 5000 }); await tid("start").click(); await p.waitForFunction(() => /Completed/.test(document.querySelector("[data-testid=status]")?.textContent || ""), null, { timeout: 240000 });
    await seek(VIOLATION_T); await tid("stat-zone").waitFor(); ok((await num("stat-zone")) <= (await num("stat-visible")) && (await num("stat-zone")) >= 1, `zone ${await num("stat-zone")} of ${await num("stat-visible")}`); await shot("zone");
  });
  await t("required PPE is configurable: with only the hard hat required, the vest-less worker is no longer a violation", async () => {
    await tid("require-safety_vest").uncheck(); await p.getByLabel("Frame stride").selectOption("5"); await tid("start").click(); await p.waitForFunction(() => /Completed/.test(document.querySelector("[data-testid=status]")?.textContent || ""), null, { timeout: 240000 });
    await seek(VIOLATION_T); ok((await num("stat-violations")) === 0, `violations with hat-only requirement: ${await num("stat-violations")}`); await tid("require-safety_vest").check();
    await tid("require-hard_hat").uncheck(); await tid("require-safety_vest").uncheck(); ok(await tid("start").isDisabled(), "start disabled when nothing is required"); await tid("require-hard_hat").check(); await tid("require-safety_vest").check();
  });
  await t("stop: a running job can be stopped and keeps its partial results", async () => {
    await tid("start").click(); await p.waitForFunction(() => Number(document.querySelector("[data-testid=stat-instances]")?.textContent?.replace(/\D/g, "")) > 0, null, { timeout: 90000 }); await tid("stop").click();
    await p.waitForFunction(() => /Stopped/.test(document.querySelector("[data-testid=status]")?.textContent || ""), null, { timeout: 60000 }); ok((await num("sum-frames")) > 0 && (await num("sum-frames")) < 1950, "partial frames kept");
  });
  await t("image: a single frame is analysed on the server, drawn, and exported", async () => {
    const jpg = `${SHOTS}/frame.jpg`; execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(VIOLATION_T), "-i", "public/ppe/samples/factory-corridor-ppe.mp4", "-frames:v", "1", jpg]);
    await p.locator("[data-testid=file-input]").setInputFiles(jpg); await tid("start").click(); await tid("img-count").waitFor({ timeout: 60000 }); ok((await num("img-count")) >= 2, "workers found in the image"); await tid("image-canvas").waitFor(); await shot("image");
  });
} else {
  await t("static: image upload explains that the service is needed instead of failing silently", async () => {
    const jpg = `${SHOTS}/frame.jpg`; execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(VIOLATION_T), "-i", "public/ppe/samples/factory-corridor-ppe.mp4", "-frames:v", "1", jpg]);
    await p.locator("[data-testid=file-input]").setInputFiles(jpg); await tid("start").click(); await tid("error").waitFor({ timeout: 10000 }); ok(/needs the processing service/.test(await tid("error").innerText()), "clear message");
  });
  await t("static: a video upload says the service is needed", async () => {
    await p.locator("[data-testid=file-input]").setInputFiles("public/ppe/samples/factory-corridor-ppe.mp4"); await tid("start").click(); await tid("error").waitFor({ timeout: 10000 }); ok(/service/.test(await tid("error").innerText()), "clear message");
  });
}
await t("invalid file type is rejected with a clear message", async () => {
  const f = `${SHOTS}/notes.txt`; writeFileSync(f, "hello"); await p.locator("[data-testid=file-input]").setInputFiles(f); await tid("error").waitFor(); ok(/Unsupported file type/.test(await tid("error").innerText()), "message");
});
await t("responsive: no horizontal scroll at phone width, controls reachable", async () => {
  await p.getByTestId(`sample-${SAMPLE}`).click(); await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(400); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "no horizontal overflow"); await tid("start").scrollIntoViewIfNeeded(); await shot("phone"); await p.setViewportSize({ width: 1600, height: 1000 });
});
await t("catalogue and portfolio: demo 02 is live and links to the app", async () => {
  await p.goto(`${BASE}/ai-demos/ai-factory-workforce-ppe-compliance`, { waitUntil: "load" }); const txt = await p.locator("body").innerText(); ok(/PPE/.test(txt) && /Prototype/.test(txt) && /not a safety determination/.test(txt), "landing text"); ok((await p.locator('a[href$="/ai-demos/ai-factory-workforce-ppe-compliance/app"]').count()) >= 1, "link to app");
});
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
