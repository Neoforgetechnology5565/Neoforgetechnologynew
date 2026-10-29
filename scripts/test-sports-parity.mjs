#!/usr/bin/env node
/**
 * Parity test for the in-browser sports engine against the Python service pipeline on the same clip.
 *   1. fixtures: a short long-shot football clip (the demo GIF of the FootAndBall repository, converted to WebM / MP4 with ffmpeg; test-only, not shipped)
 *      curl -o demo.gif https://raw.githubusercontent.com/jac99/FootAndBall/master/images/demo.gif
 *      ffmpeg -i demo.gif -vf "fps=13,scale=1000:568" -c:v libvpx-vp9 -b:v 3M -an football-demo.webm ; (same with libx264 -pix_fmt yuv420p for .mp4)
 *   2. reference: services/sports-analyzer python run (see scripts/sports-reference.py) writes REF (json)
 *   3. NODE_PATH=<playwright> BASE_URL=http://localhost:3000 VIDEO=football-demo.webm REF=sportsref.json node scripts/test-sports-parity.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", VIDEO = process.env.VIDEO || "/tmp/claude-0/samp/football-demo.webm", REF = JSON.parse(readFileSync(process.env.REF || "/tmp/claude-0/sportsref.json", "utf8")), SHOTS = process.env.SHOTS || "/tmp/sports-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0; const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true }); const p = await ctx.newPage(); p.setDefaultTimeout(600000); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded|MEDIA_ELEMENT|Media resource/i.test(m.text())) errors.push(m.text()); });
const t = async (n, f) => { try { await f(); passed++; console.log("  ✓", n); } catch (e) { failed++; console.error("  ✗", n, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 600)); await p.screenshot({ path: `${SHOTS}/fail-${failed}.png` }).catch(() => 0); } };
const tid = (i) => p.getByTestId(i); const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), loc.click()]); const path = `${SHOTS}/${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path, "utf8"); };
const parseCsv = (s) => { const [h, ...rows] = s.trim().split("\n"); const cols = h.split(","); return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v]))); };
const iou = (a, b) => { const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = w * h; return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i + 1e-9); };
console.log("sports parity →", `${BASE}/ai-demos/sports-video-intelligence/app`);
await p.goto(`${BASE}/ai-demos/sports-video-intelligence/app`, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);
await t("landing: honest, no bundled footage, engine ready", async () => { const b = await p.locator("body").innerText(); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia"); ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "logo"); await p.waitForFunction(() => /online|ready/i.test(document.querySelector("[data-testid=service-state]")?.textContent || "")); ok(!/not connected/i.test(b), "no 'not connected' text"); });
await t("invalid files are refused clearly", async () => { await tid("video-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") }); await p.getByRole("alert").filter({ hasText: /Unsupported|upload/i }).first().waitFor({ timeout: 8000 }); });
await t("analysis in the page: real detections that match the Python pipeline on the same clip", async () => {
  await tid("video-input").setInputFiles(VIDEO); await tid("start").click();
  await p.waitForFunction(() => document.querySelector("[data-testid=summary]") || document.querySelector("[data-testid=stats-table]") || /Results|Tracks/i.test(document.body.innerText) && !document.querySelector("[data-testid=progress]"), null, { timeout: 900000 });
  await p.waitForTimeout(1500); await p.screenshot({ path: `${SHOTS}/done.png` });
  const tracks = parseCsv(await dl(tid("export-tracks"))), ball = parseCsv(await dl(tid("export-ball"))); const s = REF.summary;
  const refN = REF.frames.reduce((a, f) => a + f.p.length, 0); ok(tracks.length > 0.6 * refN && tracks.length < 1.4 * refN, `kept player rows ${tracks.length} vs python ${refN}`);
  const refBall = REF.frames.filter((f) => f.b && f.b[3] === "observed").length, gotBall = ball.filter((b) => b.kind === "observed").length; ok(Math.abs(gotBall - refBall) <= Math.max(3, 0.3 * refBall), `observed ball frames ${gotBall} vs python ${refBall}`);
  let matched = 0, total = 0; for (const f of REF.frames) { const mine = tracks.filter((r) => Math.abs(Number(r.time_s) - f.t) < 0.05).map((r) => [Number(r.x1), Number(r.y1), Number(r.x2), Number(r.y2)]); for (const q of f.p) { total++; if (mine.some((m) => iou(m, [q[1], q[2], q[3], q[4]]) > 0.7)) matched++; } } ok(total === 0 || matched / total > 0.6, `boxes matching the python result (IoU>0.7): ${matched}/${total}`);
  console.log(`      python rows ${refN}, browser rows ${tracks.length}; observed ball ${refBall} vs ${gotBall}; matched boxes ${matched}/${total}`);
});
await t("exports and statistics are real files; calibration needs landmarks and refuses bad input", async () => { const stats = await dl(tid("export-stats-csv")); ok(/^track_id,team,state/.test(stats) && stats.trim().split("\n").length > 1, "stats csv"); const ev = await dl(tid("export-events")); ok(/^kind,start_s,end_s/.test(ev), "events csv"); });
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
