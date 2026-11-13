// Visits every page in the sitemap (plus the demo app pages linked from them) in a real browser and reports JavaScript errors, console errors,
// failed or 4xx/5xx requests, broken images and horizontal overflow. Usage: BASE=http://localhost:3011 node scripts/site-health.mjs [phone]
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const BASE = (process.env.BASE || "http://localhost:3011").replace(/\/$/, ""), PHONE = process.argv[2] === "phone";
const sm = await (await fetch(BASE + "/sitemap.xml")).text(); const paths = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
for (const extra of ["/contact", "/pricing", "/how-we-work", "/privacy", "/terms", "/404-does-not-exist"]) paths.add(extra);
for (const p of [...paths]) if (/^\/(demos|erp-demos|ai-demos|cad-bim-suite)\/[^/]+$/.test(p)) paths.add(p + "/app");
const list = [...paths], total = list.length, problems = [], b = await chromium.launch();
const ctxOpts = PHONE ? { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 800 } };
async function worker(queue) {
  const ctx = await b.newContext(ctxOpts); await ctx.addInitScript(() => { try { localStorage.setItem("nf_consent", "declined"); } catch {} });
  for (let p; (p = queue.shift()); ) {
    const page = await ctx.newPage(), errs = []; page.on("pageerror", (e) => errs.push("js: " + String(e).slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
    page.on("requestfailed", (r) => { if (!/\.mp4|\.webm|analytics|\/api\/track|presence/.test(r.url()) && r.failure()?.errorText !== "net::ERR_ABORTED") errs.push("failed: " + r.url().slice(0, 100) + " " + r.failure()?.errorText); });
    page.on("response", (r) => { if (r.status() >= 400 && !/\/api\/(track|presence|chat)/.test(r.url()) && new URL(r.url()).origin === BASE) errs.push(`${r.status()}: ${r.url().replace(BASE, "").slice(0, 100)}`); });
    try {
      const r = await page.goto(BASE + p, { waitUntil: "load", timeout: 45000 }); await page.waitForTimeout(600);
      const exp = p === "/404-does-not-exist" ? 404 : 200; if (r.status() !== exp) errs.push(`HTTP ${r.status()} (expected ${exp})`);
      const d = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, imgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => i.src.slice(0, 80)), h1: document.querySelectorAll("h1").length }));
      if (d.over > 1 && !/\/app$/.test(p)) errs.push(`horizontal overflow ${d.over}px`); for (const i of d.imgs) errs.push("broken image " + i);
    } catch (e) { errs.push("load: " + String(e).slice(0, 120)); }
    const seen = [...new Set(errs)].filter((x) => !(p === "/404-does-not-exist" && /^404/.test(x))); if (seen.length) problems.push([p, seen]);
    await page.close();
  }
  await ctx.close();
}
await Promise.all(Array.from({ length: 4 }, () => worker(list)));
await b.close(); console.log(`${total} pages checked (${PHONE ? "phone" : "desktop"})`); for (const [p, e] of problems.sort()) console.log("✗", p, "\n    " + e.join("\n    ")); console.log(problems.length ? `${problems.length} page(s) with problems` : "no problems found"); process.exit(problems.length ? 1 : 0);
