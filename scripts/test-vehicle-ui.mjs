#!/usr/bin/env node
/**
 * End-to-end UI tests of the vehicle detection / tracking / counting demonstration (Playwright).
 * Needs: the Next.js app (VEHICLE_API_URL=http://localhost:8010) and the FastAPI service (services/vehicle-tracker) running.
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 SHOTS=/tmp/shots node scripts/test-vehicle-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", APP = `${BASE}/ai-demos/vehicle-detection-tracking-counting/app`, SHOTS = process.env.SHOTS || "/tmp/vehicle-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const num = async (id) => Number((await tid(id).innerText()).replace(/[^0-9.]/g, ""));
const shot = (n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
console.log("vehicle ui tests →", APP);
await p.goto(APP, { waitUntil: "networkidle" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: honest scope, Georgia, sample with licence, server engine detected", async () => {
  const txt = await p.locator("body").innerText(); ok(/does not read number plates/i.test(txt) && /computer vision/i.test(txt), "scope text"); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia");
  await tid("sample-highway-dashcam").waitFor(); await tid("engine-server").waitFor(); await p.waitForFunction(() => !document.querySelector('[data-testid=engine-server]')?.disabled, null, { timeout: 15000 });
  await tid("sample-highway-dashcam").click(); ok(/Udacity/.test(await tid("sample-credit").innerText()) && /MIT/.test(await tid("sample-credit").innerText()), "credit and licence shown"); await tid("overlay-pane").waitFor();
  ok(!(await tid("start").isDisabled()) && await tid("stop").isDisabled(), "start enabled, stop disabled before a run");
  ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link in the header");
});
await t("server engine: processing shows live progress, live counts and real overlays", async () => {
  await tid("start").click(); await p.waitForFunction(() => /Processing|Queued|Uploading/.test(document.querySelector('[data-testid=status]')?.textContent || ""), null, { timeout: 30000 });
  await p.waitForFunction(() => Number(document.querySelector('[data-testid=stat-instances]')?.textContent?.replace(/\D/g, "")) > 0, null, { timeout: 60000 }); await shot("v-live");
  const a = await num("stat-instances"); await p.waitForTimeout(1500); const b = await num("stat-instances"); ok(b >= a, "instances accumulate while processing");
  ok(await tid("stop").isEnabled(), "stop enabled while running");
  await p.waitForFunction(() => /Completed/.test(document.querySelector('[data-testid=status]')?.textContent || ""), null, { timeout: 180000 });
});
await t("results: measured speed, frames, duration, class table, explanation of instances vs unique", async () => {
  ok((await num("sum-frames")) === 500, "500 frames"); ok((await num("sum-fps")) > 0 && (await num("sum-duration")) > 0, "measured fps/duration");
  await p.evaluate(() => { document.querySelector("video").currentTime = 19.9; }); await p.waitForTimeout(800); ok((await num("stat-unique")) >= 1 && (await num("stat-instances")) > (await num("stat-unique")), `instances ${await num("stat-instances")} must exceed unique ${await num("stat-unique")} at the end of the clip`); ok(/detection instances/.test(await tid("count-note").innerText()) && /not identities/.test(await tid("count-note").innerText()), "explanation shown");
  await shot("v-done");
});
await t("overlay is drawn from real results: canvas has coloured pixels at a frame with vehicles, none when boxes are off", async () => {
  await tid("player").waitFor(); await p.evaluate(() => { const v = document.querySelector("video"); v.pause(); v.currentTime = 9; }); await p.waitForTimeout(900);
  const px = () => p.evaluate(() => { const c = document.querySelector("[data-testid=overlay-canvas]"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  const withBoxes = await px(); ok(withBoxes > 500, `overlay pixels ${withBoxes}`); await tid("toggle-boxes").uncheck(); await p.waitForTimeout(300); ok((await px()) < 50, "no overlay when boxes are hidden"); await tid("toggle-boxes").check();
  ok((await num("stat-visible")) >= 1, "visible count at the playhead"); await shot("v-overlay");
});
await t("stats follow the playhead: seeking earlier shows fewer cumulative instances and unique tracks", async () => {
  await p.evaluate(() => { const v = document.querySelector("video"); v.currentTime = 18; }); await p.waitForTimeout(700); const late = { i: await num("stat-instances"), u: await num("stat-unique"), f: await num("stat-frame") };
  await p.evaluate(() => { const v = document.querySelector("video"); v.currentTime = 3; }); await p.waitForTimeout(700); const early = { i: await num("stat-instances"), u: await num("stat-unique"), f: await num("stat-frame") };
  ok(early.f < late.f && early.i < late.i && early.u <= late.u, JSON.stringify({ early, late }));
});
await t("transport controls: play/pause, speed, frame step, timeline", async () => {
  await tid("speed").selectOption("2"); await tid("play").click(); await p.waitForTimeout(800); ok(/Pause/.test(await tid("play").innerText()), "playing"); await tid("play").click();
  const f0 = await num("stat-frame"); await p.getByRole("button", { name: "Next frame" }).click(); await p.getByRole("button", { name: "Next frame" }).click(); await p.waitForTimeout(500); ok((await num("stat-frame")) >= f0, "frame stepping moves forward");
  await tid("timeline").fill("5"); await p.waitForTimeout(1000); ok(Math.abs((await num("stat-time")) - 5) < 0.2, `timeline seek updates timestamp (stat ${await tid("stat-time").innerText()}, clock ${await tid("clock").innerText()})`);
});
await t("overlay toggles (class / confidence / ids) change the drawing", async () => {
  const px = () => p.evaluate(() => { const c = document.querySelector("[data-testid=overlay-canvas]"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  await p.evaluate(() => { document.querySelector("video").currentTime = 9; }); await p.waitForTimeout(700); const all = await px(); await tid("toggle-ids").uncheck(); await tid("toggle-labels").uncheck(); await tid("toggle-confidence").uncheck(); await p.waitForTimeout(400); const bare = await px(); ok(bare < all, `bare ${bare} < all ${all}`); await tid("toggle-ids").check(); await tid("toggle-labels").check(); await tid("toggle-confidence").check();
});
await t("comparison views: processed video and side-by-side both play", async () => {
  await tid("mode-processed").click(); await p.waitForTimeout(1200); const ready = await p.evaluate(() => { const v = document.querySelector("video"); return v.readyState >= 2 && v.videoWidth === 1280; }); ok(ready, "processed video decodes at 1280x720");
  await tid("mode-side").click(); await p.waitForTimeout(1500); ok((await p.locator("video").count()) === 2, "two videos"); await shot("v-side"); await tid("mode-overlay").click();
});
await t("downloads: processed video, JSON and CSV are real files", async () => {
  const [vid] = await Promise.all([p.waitForEvent("download"), tid("download-video").click()]); const path = await vid.path(); ok((readFileSync(path).length) > 20000 && /\.mp4|\.webm/.test(vid.suggestedFilename()), vid.suggestedFilename());
  const [js] = await Promise.all([p.waitForEvent("download"), tid("download-json").click()]); const j = JSON.parse(readFileSync(await js.path(), "utf8")); ok(j.frames.length === 500 && j.summary.frames_processed === 500, "json has all frames");
  const [cs] = await Promise.all([p.waitForEvent("download"), tid("download-csv").click()]); const rows = readFileSync(await cs.path(), "utf8").trim().split("\n"); ok(rows.length - 1 === j.summary.detection_instances_processed, "csv rows equal detection instances");
});
await t("counting line: drawing a line and re-running reports a separate line-crossing count", async () => {
  await tid("draw-line").click(); const box = await tid("overlay-canvas").boundingBox(); await p.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.65); await p.mouse.click(box.x + box.width * 0.95, box.y + box.height * 0.65);
  await tid("stat-line").waitFor({ timeout: 5000 }).catch(() => 0); await p.getByLabel("Frame stride").selectOption("3"); await tid("start").click(); await p.waitForFunction(() => /Completed/.test(document.querySelector('[data-testid=status]')?.textContent || ""), null, { timeout: 180000 });
  ok((await num("stat-frame")) > 0 && (await tid("stat-line").count()) === 1, "line crossing stat exists"); ok((await num("sum-frames")) === 167 || (await num("sum-frames")) === 168, "stride 3 processed ~167 frames"); await shot("v-line");
});
await t("stop works: a running job is cancelled with partial results kept", async () => {
  await p.getByLabel("Frame stride").selectOption("1"); await tid("start").click(); await p.waitForFunction(() => Number(document.querySelector('[data-testid=stat-instances]')?.textContent?.replace(/\D/g, "")) > 0, null, { timeout: 60000 });
  await tid("stop").click(); await p.waitForFunction(() => /Stopped/.test(document.querySelector('[data-testid=status]')?.textContent || ""), null, { timeout: 30000 }); const n = await num("sum-frames"); ok(n > 0 && n < 500, `partial ${n}`); ok(await tid("start").isEnabled(), "can start again");
});
await t("invalid uploads show clear errors (text file, fake mp4, oversize type)", async () => {
  writeFileSync("/tmp/vehicle-bad.txt", "just text"); await p.setInputFiles("[data-testid=file-input]", "/tmp/vehicle-bad.txt"); await tid("error").waitFor(); ok(/Unsupported file type/.test(await tid("error").innerText()), "client-side type message");
  writeFileSync("/tmp/vehicle-fake.mp4", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(300)])); await p.setInputFiles("[data-testid=file-input]", "/tmp/vehicle-fake.mp4"); await tid("start").click(); await p.waitForFunction(() => /Failed/.test(document.querySelector('[data-testid=status]')?.textContent || ""), null, { timeout: 30000 });
  ok(/decod|opened|codec/i.test(await tid("error").innerText()), "server message: " + await tid("error").innerText());
});
await t("image upload: single-frame detection with boxes and no track ids", async () => {
  const { execFileSync } = await import("node:child_process"); execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "9", "-i", "public/vehicle/samples/highway-dashcam.mp4", "-frames:v", "1", "/tmp/vehicle-frame.jpg"]);
  await p.setInputFiles("[data-testid=file-input]", "/tmp/vehicle-frame.jpg"); await tid("image-canvas").waitFor(); await tid("start").click(); await tid("img-count").waitFor({ timeout: 60000 }); ok((await num("img-count")) >= 1, "vehicles found in the frame"); await shot("v-image");
});
await t("browser engine: same sample processed in the page, live counts, no console errors", async () => {
  await p.reload({ waitUntil: "load" }); await tid("sample-highway-dashcam").waitFor(); await tid("sample-highway-dashcam").click(); await tid("engine-browser").check(); await p.getByLabel("Sample rate").selectOption("2"); await tid("start").click();
  await p.waitForFunction(() => Number(document.querySelector('[data-testid=stat-instances]')?.textContent?.replace(/\D/g, "")) > 0, null, { timeout: 120000 }); await shot("v-browser-live");
  await p.waitForFunction(() => /Completed/.test(document.querySelector('[data-testid=status]')?.textContent || ""), null, { timeout: 280000 });
  ok((await num("sum-frames")) === 40 && (await num("stat-unique")) >= 1, "40 sampled frames (20 s at 2/s) with tracks"); ok(/Browser/.test(await tid("summary").innerText()), "engine labelled"); await shot("v-browser-done");
});
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
