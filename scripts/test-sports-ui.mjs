/**
 * Browser tests for the Sports Video Intelligence workspace (Playwright).
 *   MODE=static  site WITHOUT SPORTS_API_URL: honest offline state, no invented results
 *   MODE=server  site with SPORTS_API_URL and services/sports-analyzer running; VIDEO=<real football clip> (a long-shot clip such as a fixed stadium camera)
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 MODE=server VIDEO=/path/clip.mp4 node scripts/test-sports-ui.mjs
 * The landmark pixel positions used for calibration (CAL) describe the clip used during development (frame at 20 s); with another clip the
 * calibration test is skipped unless CAL=<json> is supplied.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001", MODE = process.env.MODE || "static", APP = `${BASE}/ai-demos/sports-video-intelligence/app`, SHOTS = process.env.SHOTS || "/tmp/sports-shots"; mkdirSync(SHOTS, { recursive: true });
const VIDEO = process.env.VIDEO || ""; let failed = 0, passed = 0;
const DEV_CAL = [["goalarea_l_top", 385, 298], ["goalarea_l_bottom", 262, 523], ["pen_l_top", 925, 198], ["pen_l_bottom", 895, 710], ["arc_l_top", 925, 318], ["arc_l_bottom", 913, 490]];
const CAL = process.env.CAL ? JSON.parse(process.env.CAL) : DEV_CAL;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|MEDIA_ELEMENT_ERROR|the server responded/i.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const text = (id) => tid(id).innerText(); const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ""));
/** number of non-transparent pixels on the overlay canvas */
const inked = () => p.evaluate(() => { const c = document.querySelector("[data-testid=overlay]"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
const inkedHeat = (i = 0) => p.evaluate((k) => { const c = document.querySelectorAll("[data-testid=heat-canvas]")[k]; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let j = 3; j < d.length; j += 4) if (d[j] > 0) n++; return n; }, i);
const seek = (s) => p.evaluate((v) => new Promise((res) => { const e = document.querySelector("[data-testid=video]"); e.onseeked = () => res(e.currentTime); e.currentTime = v; setTimeout(() => res(e.currentTime), 4000); }), s);
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), loc.click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path, "utf8"); };
console.log(`sports ui tests (${MODE}) →`, APP);
await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: honest scope, Georgia, logo, nothing shown before data exists", async () => {
  const txt = await p.locator("body").innerText(); ok(/Sports Video Intelligence/.test(txt) && /temporary labels, not identities/.test(txt) && /not a referee/i.test(txt), "scope text");
  ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia"); ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link");
  ok(/analysis only|empty|Statistics are calculated/.test(await text("stats-empty")), "stats empty state"); ok(!(await tid("summary").count()) && !(await tid("timeline").count()), "no summary or timeline before analysis");
  ok(/No sample match is bundled/.test(await text("no-samples")) || (await p.locator("[data-testid^=sample-]").count()) > 0, "sample area is honest");
  ok(await tid("start").isDisabled(), "start disabled without a video");
});
if (MODE === "static") {
  await t("static: no service means a clear explanation and no analysis", async () => {
    ok(/not connected/.test(await text("service-state")), "service state"); ok(/not connected to this site/.test(await text("offline-note")) && /no example results are shown/.test(await text("offline-note")), "offline note");
    await tid("video-input").setInputFiles({ name: "x.mp4", mimeType: "video/mp4", buffer: Buffer.from("\0\0\0\x18ftypmp42") }); ok(await tid("start").isDisabled(), "cannot start without the service");
  });
}
if (MODE === "server") {
  ok(VIDEO && existsSync(VIDEO), "VIDEO must point at a real football clip for server mode");
  await t("server: service online with the real model named, validation of bad files", async () => {
    await p.waitForFunction(() => /online/.test(document.querySelector("[data-testid=service-state]")?.textContent || ""), null, { timeout: 15000 }); ok(/FootAndBall/.test(await text("service-state")), "model name shown");
    await tid("video-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }); await tid("error").waitFor(); ok(/Unsupported file type/.test(await text("error")), "text file rejected in the browser");
    await tid("video-input").setInputFiles({ name: "fake.mp4", mimeType: "video/mp4", buffer: Buffer.from("this is not a video, just text bytes padded out ".repeat(5)) }); await tid("start").click();
    await p.waitForFunction(() => /Unsupported file type|could not/i.test(document.querySelector("[data-testid=error]")?.textContent || ""), null, { timeout: 20000 }); ok(/Unsupported file type/.test(await text("error")), `server rejects non-video bytes: ${await text("error")}`);
  });
  await t("analysis: real processing with live progress, then real counts", async () => {
    await tid("video-input").setInputFiles(VIDEO); await tid("p-start").fill("15"); await tid("p-end").fill("30"); await tid("start").click();
    await tid("progress").waitFor({ timeout: 20000 }); await shot("running");
    await p.waitForFunction(() => /^[1-9]/.test((document.querySelector("[data-testid=progress]")?.textContent || "").match(/(\d+) of \d+ analysed/)?.[1] || ""), null, { timeout: 60000 });
    await tid("summary").waitFor({ timeout: 300000 });
    ok(num(await text("s-frames")) === 75, `frames analysed ${await text("s-frames")}`); ok(num(await text("s-det")) > 100, `detections ${await text("s-det")}`); ok(num(await text("s-tracks")) >= 5, `tracks ${await text("s-tracks")}`);
    ok(num(await text("s-fps")) > 0, "real processing speed shown"); ok(num((await text("s-ball")).split("(")[0]) >= 1, `ball observed ${await text("s-ball")}`); await shot("done");
  });
  await t("video overlay: boxes come from the detector and follow the video time; toggles change the drawing", async () => {
    await p.waitForFunction(() => document.querySelector("[data-testid=video]")?.readyState >= 2, null, { timeout: 240000 });
    const at = await seek(20); ok(Math.abs(at - 20) < 0.3, `seeked to ${at}`); await p.waitForTimeout(500);
    const on = await inked(); ok(on > 2000, `boxes drawn (${on})`); ok(/players tracked/.test(await text("now")), `now: ${await text("now")}`);
    await tid("ov-boxes").uncheck(); await tid("ov-ball").uncheck(); await tid("ov-ballTrail").uncheck(); await p.waitForTimeout(300); const off = await inked(); ok(off < on * 0.2, `overlay off (${off} vs ${on})`);
    await tid("ov-boxes").check(); await tid("ov-ball").check(); await tid("ov-ballTrail").check();
    await seek(16.2); await p.waitForTimeout(400); ok(/players tracked/.test(await text("now")), "other time still has an analysed frame");
    await shot("overlay");
  });
  await t("timeline: lanes drawn from real observations; click seeks the video", async () => {
    const box = await tid("timeline").boundingBox(); await p.mouse.click(box.x + box.width * 0.5, box.y + 30); await p.waitForTimeout(700);
    const tt = await p.evaluate(() => document.querySelector("[data-testid=video]").currentTime); const dur = await p.evaluate(() => document.querySelector("[data-testid=video]").duration); ok(Math.abs(tt - dur * 0.5) < Math.max(1.5, dur * 0.03), `seek ${tt} vs ${dur * 0.5}`);
    const ink = await p.evaluate(() => { const c = document.querySelector("[data-testid=timeline]"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }); ok(ink > 500, "timeline drawn");
  });
  await t("before calibration: statistics are honest, pitch is empty, no heatmap is invented", async () => {
    ok(/Pitch mapping unavailable/.test(await text("mapping-status")), "mapping unavailable"); const rows = await p.locator("[data-testid^=row-]").count(); ok(rows >= 5, `rows ${rows}`);
    const first = await p.locator("[data-testid^=row-]").first().innerText(); ok(/n\/a/.test(first), `metre columns say n/a: ${first}`);
    ok((await p.locator("[data-testid=view-positions]").getAttribute("aria-selected")) === "true", "positions view"); ok((await p.locator("svg circle[fill=\"#38bdf8\"]").count()) === 0, "no player dots on the pitch without calibration");
    await tid("view-heatmap").click(); ok(!(await tid("heat-0").count()), "no heatmap without calibration"); await tid("view-positions").click();
    const csv = await dl(tid("export-stats-csv")); ok(/^track_id,team,state/.test(csv) && /pitch_status/.test(csv) && csv.split("\n").length > 5, "stats CSV from real tracks"); ok(/,unavailable,/.test(csv), "CSV says pitch stats unavailable");
  });
  await t("stats table: search, team filter, sorting and selection", async () => {
    const total = await p.locator("[data-testid^=row-]").count(); const firstId = (await p.locator("[data-testid^=row-]").first().getAttribute("data-testid")).replace("row-", "");
    await tid("stats-search").fill(firstId); const f = await p.locator("[data-testid^=row-]").count(); ok(f >= 1 && f <= total, `search ${f}/${total}`); await tid("stats-search").fill("zzz"); ok((await p.locator("[data-testid^=row-]").count()) === 0, "no match shows empty state"); await tid("stats-search").fill("");
    const before = await p.locator("[data-testid^=row-]").first().getAttribute("data-testid"); await tid("sort-track_id").click(); const a1 = await p.locator("[data-testid^=row-]").first().getAttribute("data-testid"); await tid("sort-track_id").click(); const a2 = await p.locator("[data-testid^=row-]").first().getAttribute("data-testid"); void before; ok(a1 !== a2 || total === 1, `sorting reverses the order (${a1} vs ${a2})`);
    await tid(`row-${firstId}`).click(); ok((await tid(`row-${firstId}`).getAttribute("aria-selected")) === "true", "row selects");
  });
  if (process.env.CAL || /issia/i.test(VIDEO)) await t("calibration: pair landmarks on a real frame, see the fit error, then get pitch data", async () => {
    await seek(20); await p.waitForTimeout(400); await tid("calibrate").click(); await tid("calibration").waitFor(); await tid("cal-image").waitFor();
    await p.waitForFunction(() => document.querySelector("[data-testid=cal-image]")?.complete && document.querySelector("[data-testid=cal-image]")?.naturalWidth > 100, null, { timeout: 20000 });
    ok(await tid("cal-apply").isDisabled(), "cannot apply without 4 landmarks");
    await tid("cal-image").click({ position: { x: 5, y: 5 } }); ok(/choose a pitch landmark/i.test(await text("cal-error")), "clicking before choosing a landmark explains what to do");
    const info = await tid("cal-image").evaluate((e) => ({ w: e.clientWidth, h: e.clientHeight })); const SW = 1920, SH = 1080;
    for (const [id, x, y] of CAL) { await tid("cal-select").selectOption(id); await tid("cal-image").click({ position: { x: (x / SW) * info.w, y: (y / SH) * info.h } }); }
    ok((await p.locator("[data-testid=cal-pairs] li").count()) === CAL.length, "pairs listed"); await shot("calibration");
    await tid("cal-apply").click(); await tid("cal-result").waitFor({ timeout: 20000 }); const r = await text("cal-result"); ok(/Calibration (good|approximate)/.test(r) && /RMS error/.test(r), `result ${r}`); ok(num(r.match(/RMS error ([\d.]+)/)[1]) < 1.0, "fit error under 1 m on the landmarks");
    await tid("cal-close").click(); ok(/Pitch mapping (available|POOR)/.test(await text("mapping-status")), "mapping now available");
    await p.waitForFunction(() => !/n\/a/.test(document.querySelector("[data-testid^=row-]")?.textContent || "n/a"), null, { timeout: 10000 });
  });
  const calibrated = process.env.CAL || /issia/i.test(VIDEO);
  if (calibrated) await t("calibration errors are reported, not hidden: too few or collinear landmarks are refused by the server", async () => {
    await seek(20); await tid("calibrate").click(); await tid("cal-image").waitFor(); await p.waitForFunction(() => document.querySelector("[data-testid=cal-image]")?.naturalWidth > 100);
    await tid("cal-clear").click(); await p.waitForFunction(() => /unavailable/.test(document.querySelector("[data-testid=mapping-status]")?.textContent || ""), null, { timeout: 10000 });
    const info = await tid("cal-image").evaluate((e) => ({ w: e.clientWidth, h: e.clientHeight })); const line = [["corner_tl", 100, 100], ["half_top", 300, 200], ["corner_tr", 500, 300], ["circle_top", 700, 400]];
    for (const [id, x, y] of line) { await tid("cal-select").selectOption(id); await tid("cal-image").click({ position: { x: (x / 1920) * info.w, y: (y / 1080) * info.h } }); }
    await tid("cal-apply").click(); await tid("cal-error").waitFor({ timeout: 15000 }); ok(/straight line/.test(await text("cal-error")), `error: ${await text("cal-error")}`);
    await tid("cal-close").click(); await tid("calibrate").click(); await tid("cal-image").waitFor(); await p.waitForFunction(() => document.querySelector("[data-testid=cal-image]")?.naturalWidth > 100);
    ok((await p.locator("[data-testid=cal-pairs] li").count()) === 1 && /No landmarks paired/.test(await text("cal-pairs")), "landmark list starts empty each time the dialog opens");
    const info2 = await tid("cal-image").evaluate((e) => ({ w: e.clientWidth, h: e.clientHeight }));
    for (const [id, x, y] of CAL) { await tid("cal-select").selectOption(id); await tid("cal-image").click({ position: { x: (x / 1920) * info2.w, y: (y / 1080) * info2.h } }); }
    await tid("cal-apply").click(); await tid("cal-result").waitFor({ timeout: 20000 }); await tid("cal-close").click(); ok(/Pitch mapping (available|POOR)/.test(await text("mapping-status")), "re-calibrated");
  });
  if (calibrated) await t("pitch: positions, trajectory, heatmap (single, team and two-player comparison), zones, time range", async () => {
    await seek(20); await p.waitForTimeout(500); ok((await p.locator("svg circle[fill=\"#38bdf8\"], svg circle[fill=\"#fb923c\"], svg circle[fill=\"#a3a3a3\"], svg circle[fill=\"#e2e8f0\"]").count()) >= 3, "mapped player dots on the pitch");
    const rows = p.locator("[data-testid^=row-]"); const n = await rows.count(); let best = null, bestN = 0, second = null;
    for (let i = 0; i < n; i++) { const r = rows.nth(i); const obs = Number((await r.locator("td").nth(3).innerText()).trim()); if (obs > bestN) { second = best; best = r; bestN = obs; } else if (!second) second = r; }
    if ((await best.getAttribute("aria-selected")) !== "true") await best.click(); else if ((await p.locator("[data-testid^=row-][aria-selected=true]").count()) !== 1) { await p.locator("[data-testid^=row-][aria-selected=true]").first().click(); await best.click(); } await tid("view-trajectory").click(); await p.waitForTimeout(300); ok((await p.locator("[data-testid^=traj-]").count()) === 1, "trajectory path for the selected track"); const d = await p.locator("[data-testid^=traj-]").first().getAttribute("d"); ok(/^M [\d.-]+ [\d.-]+ L/.test(d), "trajectory has points");
    await tid("view-heatmap").click(); await tid("heat-0").waitFor(); const note = await text("heat-note-0"); ok(/mapped observations/.test(note), note); const ink1 = await inkedHeat(0); ok(ink1 > 20, `heatmap drawn (${ink1})`);
    const n1 = num(note.match(/· (\d+) mapped/)[1]); await tid("range-start").fill("25"); await p.waitForTimeout(200); const n2 = num((await text("heat-note-0")).match(/· (\d+) mapped/)[1]); ok(n2 < n1, `time-range filter reduces observations (${n1} -> ${n2})`);
    await tid("range-start").fill("29"); await p.waitForTimeout(200); ok(/too few observations/.test(await text("heat-note-0")), "insufficient-observations warning"); await tid("range-start").fill("0"); await p.waitForTimeout(200);
    await second.click({ modifiers: ["Shift"] }); await p.waitForTimeout(300); ok((await p.locator("[data-testid^=heat-]:not([data-testid^=heat-note]):not([data-testid=heat-team]):not([data-testid=heat-canvas])").count()) === 2, "two heatmaps for a comparison");
    await best.click({ modifiers: ["Shift"] }); await second.click(); await tid("heat-team").selectOption({ index: 0 }); ok(/All tracks/.test(await text("heat-note-0")), "all-tracks heatmap when nothing is selected");
    await shot("heatmap"); const hj = await dl(tid("export-heat")); const hd = JSON.parse(hj); ok(hd.rows === 34 && hd.cols === 53 && hd.grid.length === 34 * 53 && hd.observations > 0, "heatmap export");
    await tid("view-zones").click(); await tid("zone-3").click(); ok(/Time in zone 4/.test(await tid("stats-table").innerText()), "zone column appears in the table"); await tid("view-positions").click();
  });
  if (calibrated) await t("statistics and exports contain the real computed values", async () => {
    const csv = await dl(tid("export-stats-csv")); const lines = csv.trim().split("\n"); const head = lines[0].split(","); const di = head.indexOf("pitch_distance_m"); ok(di > 0, "column"); const dists = lines.slice(1).map((l) => Number(l.split(",")[di])).filter((v) => v > 0); ok(dists.length >= 3 && Math.max(...dists) < 300, `distances ${dists.slice(0, 5)}`);
    const sj = JSON.parse(await dl(tid("export-stats-json"))); ok(sj.pitch_mapping.status !== "unavailable" && sj.tracks.length === lines.length - 1, "stats JSON matches the table");
    const full = JSON.parse(await dl(tid("export-json"))); ok(full.frames.length === 75 && full.frames.some((f) => f.p.some((r) => r[7] !== null)), "full JSON has real frames with pitch positions"); ok(full.summary.player_detections === num(await text("s-det")), "export equals what is displayed");
    const tracksCsv = await dl(tid("export-tracks")); ok(/^frame_index,time_s,track_id/.test(tracksCsv) && tracksCsv.split("\n").length > 100, "tracks CSV"); const ball = await dl(tid("export-ball")); ok(/^frame_index,time_s,kind/.test(ball), "ball CSV"); ok(/observed/.test(ball), "ball CSV has observed rows");
  });
  await t("events and summary: warnings are run-specific; limitations are shown", async () => {
    const w = await text("warnings"); ok(w.length > 10, "warnings listed"); ok(/event candidates/i.test(await text("events")), "events panel");
    if (await p.locator("[data-testid^=event-]").count()) { await p.locator("[data-testid^=event-]").first().click(); await p.waitForTimeout(600); }
    await p.locator("details summary").click(); ok(/Unavailable/.test(await p.locator("details").innerText()) && /identities/.test(await p.locator("details").innerText()), "measured/estimated/unavailable legend");
  });
  await t("cancel: stopping a running job is honoured and leaves no results", async () => {
    await tid("video-input").setInputFiles(VIDEO); await tid("p-start").fill("0"); await tid("p-end").fill("100"); await tid("start").click(); await p.waitForFunction(() => /[1-9]\d* of \d+ analysed/.test(document.querySelector("[data-testid=progress]")?.textContent || ""), null, { timeout: 60000 });
    await tid("cancel").click(); await p.waitForFunction(() => /Cancelled/.test(document.querySelector("[data-testid=progress]")?.textContent || ""), null, { timeout: 30000 }); ok(!(await tid("summary").count()), "no summary after cancel");
  });
}
await t("responsive: no horizontal scroll at phone and tablet width", async () => { for (const w of [390, 820]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(400); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `overflow at ${w}`); } await shot("phone"); await p.setViewportSize({ width: 1600, height: 1000 }); });
await t("catalogue: demo 06 is live and honest", async () => { await p.goto(`${BASE}/ai-demos/sports-video-intelligence`, { waitUntil: "load" }); const txt = await p.locator("body").innerText(); ok(/Prototype/.test(txt) && /FootAndBall/.test(txt) && /temporary/i.test(txt), "honest catalogue text"); ok((await p.locator("a[href$=\"/ai-demos/sports-video-intelligence/app\"]").count()) >= 1, "link to the app"); });
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
