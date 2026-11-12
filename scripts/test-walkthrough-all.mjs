// Runs every built-in walkthrough against its real demo (fast timings) and fails if a built-in step cannot find its element or is blocked.
// Usage: BASE=http://localhost:3011 [ONLY=substring] [WORKERS=3] node scripts/test-walkthrough-all.mjs
import { chromium, newHarness, waitStatus, installRecorder, rec } from "./wt-harness.mjs";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const probe = await newHarness(b), all = (await probe.keys()).filter((k) => !process.env.ONLY || k.includes(process.env.ONLY));
const PARTIAL = await probe.page.evaluate(async () => { const out = {}; for (const k of window.__wtKeys()) { const c = window.__wtConfig(k); out[k] = c.quality; } return out; });
await probe.ctx.close();
let fail = 0, done = 0; const queue = [...all], results = [];
async function worker() {
  const h = await newHarness(b);
  while (queue.length) {
    const key = queue.shift(), cfg = await h.config(key), n = cfg.config.steps.length; let line;
    try {
      await h.page.reload({ waitUntil: "load" }); await installRecorder(h.page); await h.mount(key, { fast: true, autoStart: "auto" });
      await waitStatus(h.page, "done", 300000);
      const r = await rec(h.page), issues = await h.page.getByTestId("wt-issues").allInnerTexts().then((a) => (a[0] ? a[0].split("\n") : [])).catch(() => []);
      const limit = cfg.quality === "partial" ? cfg.config.steps.findIndex((s) => s.title === "Open the sample") + 1 : n;
      const bad = issues.filter((i) => { const idx = cfg.config.steps.findIndex((s) => i.includes(`: ${s.title}: `)); return idx < 0 || idx < limit; });
      const skipped = Number(await h.page.getByTestId("wt-stage").getAttribute("data-skipped"));
      const ok = bad.length === 0 && r.subs.length >= Math.min(limit, n) - (cfg.quality === "partial" ? 0 : 0) && r.highlights > 0;
      line = `${ok ? "✓" : "✗"} ${key} [${cfg.quality}] ${n} steps, ${r.subs.length} subtitles, highlight frames ${r.highlights}${skipped ? `, skipped ${skipped}` : ""}${cfg.quality === "partial" ? ` (checked first ${limit})` : ""}`;
      if (!ok) { fail++; line += "\n     " + (bad.length ? bad.join("\n     ") : `subtitles ${r.subs.length} / highlights ${r.highlights}`); }
    } catch (e) { fail++; line = `✗ ${key}: ${String(e.message).split("\n")[0]}`; }
    results.push(line); console.log(line); done++;
  }
  await h.ctx.close();
}
console.log(`walkthrough coverage: ${all.length} demos`);
await Promise.all(Array.from({ length: Number(process.env.WORKERS || 3) }, worker));
await b.close(); console.log(`\n${all.length - fail} of ${all.length} walkthroughs ran clean${fail ? `, ${fail} need fixes` : ""}`); process.exit(fail ? 1 : 0);
