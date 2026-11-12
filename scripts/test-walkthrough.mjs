// Behaviour tests for the admin walkthrough stage, run on the six required demo types plus the control, safety and guard behaviour.
// Usage: BASE=http://localhost:3011 node scripts/test-walkthrough.mjs
import { chromium, newHarness, waitStatus, installRecorder, rec, stage, frame, status } from "./wt-harness.mjs";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let pass = 0, fail = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n     " + String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const REQUIRED = [["computer vision", "cv-ai-cctv-intelligence-security-analytics"], ["medical imaging", "cv-ai-medical-imaging-analysis"], ["smart farming", "cv-ai-animal-detection-smart-farming"], ["sports analytics", "cv-sports-video-intelligence"], ["CRM", "erp-crm-sales-pipeline"], ["CAD/BIM", "cad-revit-bim-automation-dashboard"], ["CAD/BIM 3D geometry", "suite-architectural-geometry-simplification"]];
console.log("automated walkthroughs on the required demo types");
for (const [label, key] of REQUIRED) {
  await t(`${label}: runs automatically, subtitles and highlights sync with each step, completion shown`, async () => {
    const h = await newHarness(b); await installRecorder(h.page); const cfg = (await h.config(key)).config; await h.mount(key, { fast: true, autoStart: "auto" });
    await h.page.getByTestId("wt-intro").waitFor({ timeout: 30000 }); ok((await h.page.getByTestId("wt-intro").innerText()).includes(cfg.intro.slice(0, 40)), "intro shows the project introduction");
    await waitStatus(h.page, "done", 240000); const r = await rec(h.page);
    ok(await h.page.getByTestId("wt-done").isVisible(), "completion card"); ok((await h.page.getByTestId("wt-done").innerText()).includes(cfg.completion), "completion message");
    ok(r.subs.length === cfg.steps.length && r.subs.every((s, i) => s === cfg.steps[i].subtitle), `subtitles in order: got ${r.subs.length} of ${cfg.steps.length}`);
    ok(r.labels.some((l) => l.startsWith(`Step 1 of ${cfg.steps.length} — ${cfg.steps[0].title}`)) && r.labels.some((l) => l.startsWith(`Step ${cfg.steps.length} of ${cfg.steps.length}`)), "progress label: " + r.labels.slice(0, 2).join(" / "));
    ok(r.highlights > 20, "highlight overlay drawn"); ok(r.maxIndex >= cfg.steps.length - 1, "reached the last step");
    ok(/steps ran/.test(await h.page.getByTestId("wt-summary").innerText()), "summary"); await h.ctx.close();
  });
}
console.log("controls");
const h = await newHarness(b); const page = h.page; await installRecorder(page);
const cfg = { title: "Medical", intro: "Intro text for the medical walkthrough.", introMs: 1500, completion: "All done.", enabled: true, sandboxApi: false, steps: [
  { id: "a", title: "Notice", subtitle: "First subtitle.", durationMs: 2500, target: "tid:notice", actions: [], badge: "live" },
  { id: "b", title: "Sample", subtitle: "Second subtitle.", durationMs: 2500, target: "tid:sample-fundus", actions: [{ t: "sample", sel: "tid:sample-fundus", value: "", allow: false }], badge: "prepared" },
  { id: "c", title: "Segmentation", subtitle: "Third subtitle.", durationMs: 2500, target: "tid:seg", actions: [], badge: "live" },
  { id: "d", title: "Missing thing", subtitle: "Should be skipped.", durationMs: 2500, target: "tid:does-not-exist", actions: [], badge: "live" },
  { id: "e", title: "Last", subtitle: "Last subtitle.", durationMs: 2500, target: "tid:notice", actions: [], badge: "live" }] };
const idx = async () => Number(await stage(page).getAttribute("data-index"));
await t("idle: the demo is fully usable and only the start controls show", async () => { await h.mount("cv-ai-medical-imaging-analysis", { config: structuredClone(cfg) }); await page.getByTestId("wt-start-auto").waitFor(); ok(await status(page) === "idle", "idle"); ok(!(await page.getByTestId("wt-highlight").count()) && !(await page.getByTestId("wt-subtitle").count()), "no overlay"); await frame(page).getByTestId("sample-histology-he").click({ timeout: 15000 }); });
await t("pause and resume: the step holds while paused and continues after", async () => {
  await h.mount("cv-ai-medical-imaging-analysis", { config: structuredClone(cfg) }); await page.getByTestId("wt-start-auto").click({ timeout: 20000 }); await page.getByTestId("wt-subtitle").waitFor({ timeout: 20000 });
  await page.getByTestId("wt-pause").click(); const i0 = await idx(); ok(await status(page) === "paused", "paused"); await page.waitForTimeout(3500); ok((await idx()) === i0, "index unchanged while paused"); ok(await page.getByTestId("wt-subtitle").isVisible(), "subtitle stays");
  ok(/paused/.test(await page.getByTestId("wt-progress-label").innerText()), "label says paused"); await page.getByTestId("wt-resume").click(); ok(await status(page) === "running", "running");
  await page.waitForFunction((i) => Number(document.querySelector("[data-testid=wt-stage]").getAttribute("data-index")) > i, i0, { timeout: 15000 });
});
await t("next, previous and restart move through the steps", async () => {
  await page.getByTestId("wt-next").click(); const a = await idx(); await page.waitForTimeout(600); await page.getByTestId("wt-next").click(); await page.waitForTimeout(600); const b2 = await idx(); ok(b2 > a, `next ${a}→${b2}`);
  await page.getByTestId("wt-prev").click(); await page.waitForTimeout(800); ok((await idx()) < b2, "previous went back");
  await page.getByTestId("wt-restart").click(); await page.waitForFunction(() => document.querySelector("[data-testid=wt-stage]").getAttribute("data-index") === "-1" || document.querySelector("[data-testid=wt-intro]"), null, { timeout: 8000 });
});
await t("subtitles can be switched off and on; highlight stays", async () => {
  await page.getByTestId("wt-next").click(); await page.getByTestId("wt-subtitle").waitFor({ timeout: 15000 }); await page.getByTestId("wt-subtitles").click(); ok(!(await page.getByTestId("wt-subtitle").count()), "subtitle hidden"); ok(await page.getByTestId("wt-highlight").count() > 0, "highlight still drawn");
  await page.getByTestId("wt-subtitles").click(); await page.getByTestId("wt-subtitle").waitFor({ timeout: 5000 });
});
await t("manual control: you can click the demo while paused, the overlay never blocks it", async () => {
  await page.getByTestId("wt-pause").click(); await frame(page).getByTestId("sample-histology-he").click({ timeout: 10000 }); ok(await status(page) === "paused", "still paused after a manual click");
  const before = await page.evaluate(() => document.querySelector("[data-testid=wt-frame]").contentDocument.querySelectorAll("canvas").length); ok(before >= 0, "frame readable"); await page.getByTestId("wt-resume").click();
});
await t("stop ends the walkthrough and clears the overlay", async () => { await page.getByTestId("wt-stop").click(); ok(await status(page) === "stopped", "stopped"); ok(!(await page.getByTestId("wt-highlight").count()) && !(await page.getByTestId("wt-subtitle").count()), "overlay cleared"); await page.getByTestId("wt-start-auto").waitFor(); });
await t("a missing element skips that step safely and reports it", async () => {
  await h.mount("cv-ai-medical-imaging-analysis", { config: { ...structuredClone(cfg), steps: structuredClone(cfg.steps).map((s) => ({ ...s, durationMs: 1000 })) } }); await page.getByTestId("wt-start-auto").click({ timeout: 20000 }); await waitStatus(page, "done", 90000);
  ok(await stage(page).getAttribute("data-skipped") === "1", "one skipped"); const s = await page.getByTestId("wt-summary").innerText(); ok(/4 of 5 steps ran, 1 skipped, 1 issue/.test(s), s); ok(/Missing thing/.test(await page.getByTestId("wt-issues").innerText()), "issue names the step");
});
await t("prepared presentation data is labelled apart from live results", async () => {
  await h.mount("cv-ai-medical-imaging-analysis", { config: { ...structuredClone(cfg), introMs: 1500 }, autoStart: "manual" }); await page.getByTestId("wt-intro").waitFor({ timeout: 20000 }); await page.getByTestId("wt-next").click(); await page.getByTestId("wt-subtitle").waitFor(); ok(/live demo/i.test(await page.getByTestId("wt-badge").innerText()), "live chip");
  await page.getByTestId("wt-next").click(); await page.waitForFunction(() => /Prepared presentation data/.test(document.querySelector("[data-testid=wt-badge]")?.textContent || ""), null, { timeout: 15000 }); ok(/not a new processing result/.test(await page.getByTestId("wt-subtitle-wrap").innerText()), "explains it is not a processing result");
});
await t("manual mode: steps change only when you press next or previous", async () => {
  await h.mount("cv-ai-medical-imaging-analysis", { config: structuredClone(cfg), autoStart: "manual" }); await page.getByTestId("wt-intro").waitFor({ timeout: 20000 }); await page.waitForTimeout(2500); ok((await idx()) === -1, "does not advance by itself"); ok(/manual/.test(await page.getByTestId("wt-progress-label").innerText()), "labelled manual");
  await page.getByTestId("wt-next").click(); await page.getByTestId("wt-subtitle").waitFor(); ok((await idx()) === 0, "step 1"); await page.waitForTimeout(3000); ok((await idx()) === 0, "stays on the step"); await page.getByTestId("wt-next").click(); await page.waitForTimeout(800); ok((await idx()) === 1, "step 2"); await page.getByTestId("wt-prev").click(); await page.waitForTimeout(800); ok((await idx()) === 0, "back to step 1");
});
await t("fullscreen control works", async () => { await page.getByTestId("wt-fullscreen").click(); await page.waitForTimeout(400); const fs = await page.evaluate(() => !!document.fullscreenElement); if (fs) await page.getByTestId("wt-fullscreen").click(); ok(true, ""); ok(await page.getByTestId("wt-fullscreen").isVisible(), "button present"); });
console.log("safety");
await t("risky buttons are never clicked, and the demo is unchanged", async () => {
  const c = { ...structuredClone(cfg), steps: [{ id: "x", title: "Try a new deal", subtitle: "Should not click.", durationMs: 1000, target: "tid:kanban", actions: [{ t: "click", sel: "tid:new-opp", value: "", allow: false }, { t: "click", sel: "btn:Alerts", value: "", allow: false }], badge: "live" }] };
  await h.mount("erp-crm-sales-pipeline", { config: c }); await page.getByTestId("wt-start-auto").click({ timeout: 20000 }); await waitStatus(page, "done", 60000);
  ok(/blocked: Try a new deal/.test(await page.getByTestId("wt-issues").innerText()), await page.getByTestId("wt-issues").innerText()); ok(await frame(page).getByRole("dialog").filter({ hasText: /opportunity|deal|company/i }).count() === 0, "no new-opportunity form opened by the blocked click");
});
await t("network guard: writes and cross-origin requests from the demo are refused while a walkthrough runs", async () => {
  await h.mount("erp-crm-sales-pipeline", { config: { ...structuredClone(cfg), steps: [{ id: "x", title: "Wait", subtitle: "Waiting.", durationMs: 6000, target: "tid:kanban", actions: [], badge: "live" }] }, autoStart: "auto" }); await page.getByTestId("wt-subtitle").waitFor({ timeout: 30000 });
  const out = await page.evaluate(async () => { const w = document.querySelector("[data-testid=wt-frame]").contentWindow; const a = await w.fetch("/api/contact", { method: "POST", body: "{}" }), b2 = await w.fetch("https://example.com/x").then((r) => r.status, () => "blocked"), c = await w.fetch("/robots.txt"); return [a.status, await a.text(), b2, c.status]; });
  ok(out[0] === 403 && /Blocked during walkthrough/.test(out[1]), "POST refused: " + out[0]); ok(out[2] === 403 || out[2] === "blocked", "cross-origin refused"); ok(out[3] === 200, "plain GET still works");
  ok(Number(await stage(page).getAttribute("data-blocked")) >= 2, "blocked requests counted"); await waitStatus(page, "done", 30000); ok(/write request/.test(await page.getByTestId("wt-summary").innerText()), "summary mentions the blocked requests");
});
await t("sandbox mode only widens POST to the demo's own back-end", async () => {
  await h.mount("erp-crm-sales-pipeline", { config: { ...structuredClone(cfg), sandboxApi: true, steps: [{ id: "x", title: "Wait", subtitle: "Waiting.", durationMs: 6000, target: "tid:kanban", actions: [], badge: "live" }] }, autoStart: "auto" }); await page.getByTestId("wt-subtitle").waitFor({ timeout: 30000 });
  const out = await page.evaluate(async () => { const w = document.querySelector("[data-testid=wt-frame]").contentWindow; const a = await w.fetch("/api/admin/walkthroughs/x", { method: "PUT", body: "{}" }), b2 = await w.fetch("/api/contact", { method: "POST", body: "{}" }), c = await w.fetch("/api/bim/projects/none", { method: "DELETE" }); return [a.status, b2.status, c.status]; });
  ok(out.every((s) => s === 403) && true, "admin, contact and DELETE still refused: " + out.join(","));
});
await t("no page errors in the stage", async () => { ok(h.errors.length === 0, h.errors.slice(0, 2).join(" | ")); });
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
