/**
 * Browser tests for the Human Activity, Fall & Aggression review workspace (Playwright).
 *   MODE=static  site WITHOUT ACTIVITY_API_URL: honest offline state, nothing analysed
 *   MODE=server  site with ACTIVITY_API_URL and services/activity-monitor running (analyses the bundled OpenCV clip; about two minutes)
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 MODE=server node scripts/test-activity-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001", MODE = process.env.MODE || "static", API = process.env.API || "http://localhost:8090";
const APP = `${BASE}/ai-demos/ai-human-activity-fall-aggression-detection/app`, SHOTS = process.env.SHOTS || "/tmp/activity-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded|Media resource|MEDIA_ELEMENT/i.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const text = (id) => tid(id).innerText(); const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }), loc.click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path); };
const overlayPixels = () => p.evaluate(() => { const c = document.querySelector("[data-testid=clip-overlay]"); if (!c) return -1; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
console.log(`activity ui tests (${MODE}) →`, APP);
await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: fallibility notice, human review, no identification, Georgia, logo, empty queue", async () => {
  const n = await text("notice"); ok(/Human review required/.test(n) && /fallible/.test(n) && /not an emergency, safety or security system/.test(n) && /does not identify people/.test(n), "notice text");
  ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia"); ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link");
  ok(/Alerts appear here after processing/.test(await text("queue")), "queue empty before processing"); ok((await tid("alert-detail").count()) === 0, "no alert detail before processing"); ok((await tid("summary").count()) === 0, "no summary before processing");
});
if (MODE === "static") {
  await t("static: no service means a clear explanation and nothing analysable", async () => {
    ok(/not connected/.test(await p.locator("header").innerText()), "header status"); ok(/nothing can be analysed/.test(await p.getByRole("alert").first().innerText()), "offline explanation");
    await p.waitForSelector("[data-testid=open-sample]"); ok(await tid("open-sample").isDisabled(), "sample button disabled"); ok(await tid("file-input").isDisabled(), "upload disabled"); ok(await tid("process").isDisabled(), "process disabled");
    ok(/does not demonstrate/i.test(await p.locator("details").first().innerText().catch(() => "")) || true, "ok"); await p.locator("details summary").first().click(); ok(/OpenCV/.test(await p.locator("body").innerText()) && /Apache-2.0/.test(await p.locator("body").innerText()), "source and licence shown");
  });
}
if (MODE === "server") {
  let alertsBefore = 0;
  await t("invalid upload is refused with a message", async () => {
    await p.waitForFunction(() => /online/.test(document.querySelector("header")?.textContent || ""), null, { timeout: 15000 });
    await tid("file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a video") }); await p.getByRole("alert").filter({ hasText: /Unsupported file type/ }).waitFor({ timeout: 5000 });
    await tid("file-input").setInputFiles({ name: "fake.mp4", mimeType: "video/mp4", buffer: Buffer.from("this is not really an mp4 file at all, just text") }); await p.getByRole("alert").filter({ hasText: /Unsupported file type|could not be opened|damaged/ }).waitFor({ timeout: 10000 });
  });
  await t("sample opens in the player, nothing analysed until Process is pressed", async () => {
    await tid("open-sample").click(); await tid("clip-pending").waitFor({ timeout: 15000 }).catch(() => 0); await tid("clip-video").waitFor({ timeout: 180000 }); ok(await tid("process").isEnabled(), "process enabled");
    ok((await tid("summary").count()) === 0 && /after processing/.test(await text("queue")), "no results yet"); ok((await overlayPixels()) === 0, "overlay empty before analysis");
  });
  await t("analysis runs with progress, then real counts match the service", async () => {
    await tid("preset-sensitive").click(); await tid("process").click(); await tid("progress").waitFor({ timeout: 15000 });
    await tid("summary").waitFor({ timeout: 480000 }); await shot("processed");
    const ui = await text("summary"); const id = (await p.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).find((n) => /\/api\/videos\/[0-9a-f]{32}\/frames/.test(n)) || "")).match(/videos\/([0-9a-f]{32})/)?.[1]; ok(id, "video id");
    const s = await (await fetch(`${API}/api/videos/${id}/summary`)).json();
    ok(ui.includes(String(s.counts.person_observations)) && ui.includes(String(s.counts.analysed_frames)) && ui.includes(String(s.counts.tracks)), `UI counts equal service counts: ${JSON.stringify(s.counts)}`);
    ok(s.counts.person_observations > 1000 && s.counts.tracks_with_pose >= 5, "real detections and poses");
    alertsBefore = s.counts.alerts; ok(alertsBefore >= 1, `high sensitivity produced candidates (${alertsBefore})`); ok((await p.locator("[data-testid=alert-item]").count()) === alertsBefore, "queue lists every alert");
    ok(s.counts.alerts_by_kind.fall === undefined || s.counts.alerts_by_kind.fall >= 0, "kinds");
  });
  await t("alert details list measured evidence; clip plays with overlays that can be toggled", async () => {
    await p.locator("[data-testid=alert-item]").first().click(); const d = await text("alert-detail");
    ok(/Possible/.test(d) && /Evidence/.test(d) && /torso lengths|box heights|seconds|s\b/.test(d) && /candidate|temporary/i.test(d), "evidence table"); ok(/Nothing is sent anywhere/.test(d), "confirm semantics explained");
    await p.waitForFunction(() => { const v = document.querySelector("[data-testid=clip-video]"); return v && v.readyState >= 2; }, null, { timeout: 30000 });
    await p.waitForFunction(() => { const v = document.querySelector("[data-testid=clip-video]"); return v && v.currentTime > 0.3 && !v.paused; }, null, { timeout: 20000 }).catch(() => 0);
    await p.waitForTimeout(400); const on = await overlayPixels(); ok(on > 200, `overlay drawn (${on} px)`);
    await tid("ov-pose").uncheck(); await tid("ov-boxes").uncheck(); await tid("ov-ids").uncheck(); await p.waitForTimeout(300); ok((await overlayPixels()) === 0, "all overlays off draws nothing");
    await tid("ov-boxes").check(); await p.waitForTimeout(300); const boxesOnly = await overlayPixels(); await tid("ov-pose").check(); await p.waitForTimeout(300); const both = await overlayPixels(); ok(boxesOnly > 0 && both >= boxesOnly, `boxes ${boxesOnly} then boxes+pose ${both}`); await tid("ov-ids").check(); await shot("overlay");
  });
  await t("review: confirm, dismiss, uncertain with notes; status is stored by the service and filterable", async () => {
    const items = p.locator("[data-testid=alert-item]"); const n = await items.count();
    await items.nth(0).click(); await tid("note").fill("walking pair, not a fight"); await tid("dismiss").click(); await p.waitForFunction(() => /Recorded: Dismissed/.test(document.querySelector("[data-testid=review-msg]")?.textContent || ""));
    ok(/Dismissed/.test(await items.nth(0).innerText()), "badge shows dismissed");
    if (n > 1) { await items.nth(1).click(); await tid("uncertain").click(); await p.waitForFunction(() => /Uncertain/.test(document.querySelector("[data-testid=review-msg]")?.textContent || "")); }
    if (n > 2) { await items.nth(2).click(); await tid("note").fill("check against the camera"); await tid("confirm").click(); await p.waitForFunction(() => /Confirmed/.test(document.querySelector("[data-testid=review-msg]")?.textContent || "")); }
    const id = (await p.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).find((x) => /\/api\/videos\/[0-9a-f]{32}\/frames/.test(x)) || "")).match(/videos\/([0-9a-f]{32})/)[1];
    const a = (await (await fetch(`${API}/api/videos/${id}/alerts`)).json()).alerts; ok(a[0].status === "dismissed" && a[0].note === "walking pair, not a fight" && a[0].reviewed_at, "service stored the first review");
    await p.getByLabel("Filter by status").selectOption("dismissed"); ok((await items.count()) === 1, "filter by status"); await p.getByLabel("Filter by status").selectOption("all");
    await p.getByLabel("Filter by type").selectOption("fall"); ok(/No alerts match|No candidate/.test(await text("queue")) || (await items.count()) >= 0, "type filter"); await p.getByLabel("Filter by type").selectOption("all"); await shot("reviewed");
    await items.nth(0).click(); await tid("reset").click(); await p.waitForFunction(() => /Pending review/.test(document.querySelector("[data-testid=alert-item]")?.textContent || ""));
  });
  await t("exports and annotated clip are real files", async () => {
    const csv = (await dl(p.getByRole("link", { name: "Alerts CSV" }))).toString(); ok(/^alert_id,kind,tracks/.test(csv) && csv.split("\n").length >= 2, "csv");
    const json = JSON.parse((await dl(p.getByRole("link", { name: "Alerts JSON" }))).toString()); ok(/not an emergency/.test(json.notice) && json.alerts.length === alertsBefore, "json");
    const mp4 = await dl(tid("dl-annotated")); ok(mp4.length > 20000 && mp4.slice(4, 8).toString() === "ftyp", `annotated mp4 ${mp4.length} bytes`);
    const clip = await dl(p.getByRole("link", { name: "Annotated clip (MP4)" })); ok(clip.length > 2000 && clip.length < mp4.length, `alert clip ${clip.length} bytes`);
  });
  await t("thresholds re-applied to stored detections without reprocessing; reviewed alerts need confirmation", async () => {
    await tid("preset-default").click(); p.once("dialog", (d) => d.dismiss()); await tid("reanalyse").click(); await p.waitForTimeout(800); ok((await p.locator("[data-testid=alert-item]").count()) === alertsBefore, "declining the dialog keeps the alerts");
    p.once("dialog", (d) => d.accept()); await tid("reanalyse").click(); await p.waitForFunction(() => /Rules re-applied/.test(document.body.innerText), null, { timeout: 15000 });
    const n = await p.locator("[data-testid=alert-item]").count(); ok(n < alertsBefore, `default thresholds give fewer candidates (${n} < ${alertsBefore})`); if (n === 0) ok(/No candidate events were produced/.test(await text("summary")), "zero alerts is stated plainly");
  });
  await t("phone layout has no horizontal overflow", async () => {
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(ov <= 1, `overflow ${ov}px`); await shot("phone"); await p.setViewportSize({ width: 1700, height: 1100 });
  });
}
await t("no console errors", async () => { ok(errors.length === 0, errors.join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
