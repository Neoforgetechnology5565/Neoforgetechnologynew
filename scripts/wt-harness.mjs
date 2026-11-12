// Shared by the walkthrough tests: bundles the real stage component and serves it from inside the browser at the site's own origin.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
export const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
export const BASE = process.env.BASE || "http://localhost:3011";
const root = path.resolve(import.meta.dirname, "..");
let bundle = null;
export async function bundleJs() {
  if (bundle) return bundle;
  const r = await build({ entryPoints: [path.join(root, "scripts/wt-harness-entry.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser", target: "es2020", minify: false, logLevel: "error",
    alias: { "@": path.join(root, "src") }, define: { "process.env.NODE_ENV": '"production"' }, loader: { ".tsx": "tsx", ".ts": "ts" }, tsconfig: path.join(root, "tsconfig.json") });
  return (bundle = r.outputFiles[0].text);
}
export async function newHarness(browser, { viewport = { width: 1500, height: 1000 } } = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true }), page = await ctx.newPage(), js = await bundleJs();
  const home = await (await fetch(BASE + "/")).text(), css = [...home.matchAll(/\/_next\/static\/css\/[^"']+\.css/g)].map((m) => m[0]);
  await page.route("**/__wt/page", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset=utf-8>${[...new Set(css)].map((c) => `<link rel=stylesheet href="${c}">`).join("")}</head><body class="bg-slate-950"><div id="root"></div><script src="/__wt/bundle.js"></script></body></html>` }));
  await page.route("**/__wt/bundle.js", (r) => r.fulfill({ contentType: "application/javascript", body: js }));
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/__wt/page", { waitUntil: "load" });
  return { ctx, page, errors, mount: (key, opts) => page.evaluate(([k, o]) => window.__wtMount(k, o), [key, opts ?? {}]), keys: () => page.evaluate(() => window.__wtKeys()), config: (key) => page.evaluate((k) => window.__wtConfig(k), key) };
}
export const stage = (page) => page.getByTestId("wt-stage");
export const frame = (page) => page.frameLocator("[data-testid=wt-frame]");
export const status = (page) => stage(page).getAttribute("data-status");
export async function waitStatus(page, want, timeout = 120000) { await page.waitForFunction((w) => document.querySelector("[data-testid=wt-stage]")?.getAttribute("data-status") === w, want, { timeout }); }
/** Records every subtitle, title and highlight that appears while a walkthrough plays. */
export async function installRecorder(page) {
  await page.evaluate(() => { const rec = (window.__rec = { subs: [], titles: [], highlights: 0, labels: [], maxIndex: -1 }); const tick = () => { const s = document.querySelector("[data-testid=wt-subtitle]")?.textContent; if (s && rec.subs[rec.subs.length - 1] !== s) rec.subs.push(s); const l = document.querySelector("[data-testid=wt-progress-label]")?.textContent; if (l && rec.labels[rec.labels.length - 1] !== l) rec.labels.push(l); if (document.querySelector("[data-testid=wt-highlight]")) rec.highlights++; const i = Number(document.querySelector("[data-testid=wt-stage]")?.getAttribute("data-index")); if (i > rec.maxIndex) rec.maxIndex = i; }; setInterval(tick, 50); });
}
export const rec = (page) => page.evaluate(() => window.__rec);
