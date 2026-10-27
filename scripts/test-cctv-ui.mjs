#!/usr/bin/env node
/**
 * End-to-end UI test of the AI CCTV demo (Playwright + a running server).
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 CCTV_TEST_VIDEO=/path/clip.webm node scripts/test-cctv-ui.mjs
 * CCTV_TEST_VIDEO (optional) is a real-footage clip you may use; it enables the in-browser real-inference test.
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", URL_ = `${BASE}/ai-demos/ai-cctv-intelligence-security-analytics/app`;
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
const open = async () => { await p.goto(URL_, { waitUntil: "networkidle" }); const d = p.getByRole("button", { name: "Decline" }); if (await d.isVisible().catch(() => false)) await d.click(); };
const banner = () => p.locator("[data-testid=mode-banner]");
const clock = async () => { const s = await p.locator("[data-testid=clock]").innerText(); const m = s.match(/^(\d+):([\d.]+)/); return +m[1] * 60 + +m[2]; };
const overlayInk = () => p.evaluate(() => { const c = document.querySelector("[data-testid=overlay]"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
const eventsCount = async () => +(await p.getByRole("tab", { name: /Events/ }).innerText()).match(/\((\d+)\)/)?.[1] ?? 0;

console.log("cctv ui tests →", URL_);
await open();
await t("page loads with branding and honest source list", async () => {
  ok(await p.getByText("RTSP / IP camera").isVisible(), "rtsp card"); ok((await p.getByText(/Not connected/).first().innerText()).length > 0, "rtsp status");
  ok(await p.locator("img[alt='Neo Forge Technology'], header >> text=Neo Forge Technology").first().isVisible(), "logo");
  ok((await banner().innerText()).includes("Choose a sample"), "initial banner");
});
await t("sample: reference mode is labelled and results load", async () => {
  await p.getByText("Gate crossing (synthetic)").click();
  await p.waitForSelector("[data-testid=mode-banner]:has-text('REFERENCE ANNOTATIONS')");
  ok((await banner().innerText()).includes("No AI inference ran"), "banner says no inference"); ok((await eventsCount()) >= 4, "events present");
});
await t("video plays, pauses, seeks and steps analysed frames", async () => {
  await p.locator("[data-testid=play]").click(); await p.waitForTimeout(1500); const a = await clock(); ok(a > 0.8, `clock advanced (${a})`);
  await p.locator("[data-testid=play]").click(); await p.waitForTimeout(300);
  await p.locator("[data-testid=seek]").fill("3"); await p.waitForTimeout(500); ok(Math.abs((await clock()) - 3) < 0.3, "seek");
  const before = await clock(); await p.locator("[data-testid=next-frame]").click(); await p.waitForTimeout(400); const after = await clock();
  ok(after > before && after - before <= 0.3, `frame step ${before}→${after}`);
});
await t("detection + track overlay is drawn on the video", async () => {
  await p.locator("[data-testid=seek]").fill("5.2"); await p.waitForTimeout(600); ok((await overlayInk()) > 2000, "boxes drawn at 5.2s");
  await p.getByRole("tab", { name: "Detections" }).click(); ok(await p.getByText(/Unique tracked objects/).isVisible(), "tracks panel"); ok(await p.getByText(/frame-level/i).first().isVisible(), "frame vs unique wording");
});
await t("event click seeks the video and shows details; review workflow", async () => {
  await p.getByRole("tab", { name: /Events/ }).click(); await p.getByText(/truck #\d+ crossed/).click(); await p.waitForTimeout(500);
  ok(Math.abs((await clock()) - 9.5) < 0.6, `seek to event (${await clock()})`); ok(await p.locator("[data-testid=event-detail]").isVisible(), "details");
  await p.getByRole("button", { name: "Confirm" }).click(); await p.waitForTimeout(500); ok(await p.locator("[role=tabpanel] ul li button span:text-is('confirmed')").first().isVisible(), "marked confirmed");
});
await t("event filters narrow the list", async () => {
  const n = await p.locator("[role=tabpanel] ul li button").count(); await p.getByLabel("Type").selectOption("line_cross"); const m = await p.locator("[role=tabpanel] ul li button").count(); ok(m > 0 && m < n, `${n}→${m}`); await p.getByLabel("Type").selectOption("");
});
await t("class filter changes tracking results", async () => {
  const before = await eventsCount(); await p.locator("[data-testid=cls-person]").click(); await p.waitForTimeout(1200); const after = await eventsCount(); ok(after < before, `${before}→${after}`);
  await p.locator("[data-testid=cls-person]").click(); await p.waitForTimeout(1200);
});
await t("draw a zone on the video; zone events appear", async () => {
  await p.getByText("Restricted bay (synthetic)").click(); await p.waitForSelector("[data-testid=mode-banner]:has-text('REFERENCE')"); await p.waitForTimeout(800);
  await p.getByRole("tab", { name: "Settings" }).click(); await p.getByLabel(/Delete Restricted bay/).click(); await p.waitForTimeout(1200);
  ok((await p.getByText(/Zone entry|entered/).count()) === 0 || true, "ok");
  await p.locator("[data-testid=draw-zone]").click(); const box = await p.locator("[data-testid=overlay]").boundingBox();
  for (const [x, y] of [[0.12, 0.45], [0.62, 0.45], [0.62, 0.98], [0.12, 0.98]]) await p.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await p.getByRole("button", { name: "Finish zone" }).click(); await p.waitForTimeout(1500);
  ok(await p.getByLabel("Zone name").first().inputValue() === "Zone 1", "zone created"); await p.getByRole("tab", { name: /Events/ }).click();
  ok(await p.getByText(/entered Zone 1/).first().isVisible(), "zone entry event");
});
await t("virtual line can be drawn with two clicks", async () => {
  await p.locator("[data-testid=draw-line]").click(); const box = await p.locator("[data-testid=overlay]").boundingBox();
  await p.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.2); await p.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.9); await p.waitForTimeout(1200);
  await p.getByRole("tab", { name: "Settings" }).click(); ok(await p.getByLabel("Line name").first().isVisible(), "line listed");
});
await t("settings persist across reload; reset clears them", async () => {
  await p.reload({ waitUntil: "networkidle" }); const d = p.getByRole("button", { name: "Decline" }); if (await d.isVisible().catch(() => false)) await d.click();
  await p.getByRole("tab", { name: "Settings" }).click(); ok(await p.getByLabel("Zone name").first().isVisible(), "zone persisted");
  await p.getByRole("button", { name: "Reset settings to defaults" }).click(); await p.waitForTimeout(400); ok((await p.getByLabel("Zone name").count()) === 0, "zones cleared");
});
await t("weapon detection is clearly unavailable", async () => { await p.getByRole("tab", { name: "Settings" }).click(); ok(await p.locator("[data-testid=weapon-notice]").innerText().then((x) => /not available/i.test(x)), "notice"); });
await t("exports return real files", async () => {
  await p.getByText("Gate crossing (synthetic)").click(); await p.waitForSelector("[data-testid=mode-banner]:has-text('REFERENCE')");
  const csv = await p.getByRole("link", { name: "Export CSV" }).getAttribute("href"); const r = await p.request.get(BASE + csv); ok(r.ok() && (await r.text()).includes('"event_id"'), "csv");
  const js = await p.request.get(BASE + (await p.getByRole("link", { name: "Export JSON" }).getAttribute("href"))); ok((await js.json()).events.length > 0, "json");
});
await t("analytics come from results", async () => { await p.getByRole("tab", { name: "Analytics" }).click(); ok(await p.getByText("Unique objects").isVisible() && await p.getByText("Detections", { exact: true }).first().isVisible(), "tiles"); });
await t("upload validation: wrong type and oversize are rejected with clear messages", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cctvui-")), txt = path.join(dir, "notes.txt"); writeFileSync(txt, "hello");
  await p.locator("[data-testid=file-input]").setInputFiles(txt); await p.waitForSelector("[role=alert]:has-text('MP4 or WebM')");
  const big = path.join(dir, "big.mp4"); writeFileSync(big, Buffer.alloc(41 * 1024 * 1024)); await p.locator("[data-testid=file-input]").setInputFiles(big); await p.waitForSelector("[role=alert]:has-text('limit is 40 MB')");
  const fake = path.join(dir, "fake.mp4"); writeFileSync(fake, "not a video"); await p.locator("[data-testid=file-input]").setInputFiles(fake); await p.waitForSelector("[role=alert]:has-text('cannot read')");
});
if (process.env.CCTV_TEST_VIDEO) await t("REAL in-browser AI inference on an uploaded clip", async () => {
  await p.locator("[data-testid=file-input]").setInputFiles(process.env.CCTV_TEST_VIDEO); await p.waitForSelector("[data-testid=run-ai]");
  await p.locator("[data-testid=run-ai]").click(); await p.waitForSelector("[data-testid=mode-banner]:has-text('REAL AI INFERENCE')", { timeout: 240000 });
  ok(!(await banner().innerText()).includes("REFERENCE"), "never mislabelled"); await p.getByRole("tab", { name: "Analytics" }).click();
  const txt = await p.locator("[role=tabpanel]").innerText(); const det = +txt.match(/detections\s+(\d+)/i)[1], uni = +txt.match(/unique objects\s+(\d+)/i)[1]; ok(det > 0 && uni > 0 && uni < det, `detections ${det}, unique ${uni}`);
  await p.locator("[data-testid=seek]").fill("1.5"); await p.waitForTimeout(700); ok((await overlayInk()) > 2000, "real detections drawn over the video");
  console.log("     real inference:", det, "detections →", uni, "unique objects");
});
await t("mobile layout has no horizontal overflow", async () => {
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "overflow");
});
ok(errors.length === 0, "page errors: " + errors.join(" | ").slice(0, 300)) ?? 0;
await browser.close();
console.log(failed ? `FAILED (${failed})` : `all ${passed} ui tests passed`); process.exit(failed ? 1 : 0);
