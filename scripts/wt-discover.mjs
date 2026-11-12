// Lists the interface hooks of every demo (test ids, tabs, buttons, file inputs, selects). Used to author and verify walkthrough configs.
// Usage: BASE=http://localhost:3011 node scripts/wt-discover.mjs > /tmp/hooks.json
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.BASE || "http://localhost:3011";
const keys = JSON.parse(execFileSync("npx", ["tsx", "-e", 'import { listDemos } from "./src/lib/walkthrough/registry"; console.log(JSON.stringify(listDemos().map(d=>({key:d.key,path:d.appPath,family:d.family}))))'], { encoding: "utf8" }).trim().split("\n").pop());
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }); const out = {};
for (const d of keys) {
  const p = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  try {
    await p.goto(BASE + d.path, { waitUntil: "load", timeout: 30000 }); await p.waitForTimeout(2500);
    out[d.key] = await p.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
      const txt = (e) => (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      return {
        h1: txt(document.querySelector("h1") || document.body), testids: [...document.querySelectorAll("[data-testid]")].filter(vis).map((e) => e.getAttribute("data-testid")).slice(0, 60),
        tabs: [...document.querySelectorAll("[role=tab]")].filter(vis).map(txt).slice(0, 20), buttons: [...document.querySelectorAll("button")].filter(vis).map(txt).filter(Boolean).slice(0, 40),
        files: [...document.querySelectorAll("input[type=file]")].map((e) => e.getAttribute("data-testid") || e.id || "file"), selects: [...document.querySelectorAll("select")].map((e) => e.getAttribute("data-testid") || e.id || e.getAttribute("aria-label") || "select"),
        navs: [...document.querySelectorAll("nav a, nav button, header a")].filter(vis).map(txt).filter(Boolean).slice(0, 30),
      };
    });
  } catch (e) { out[d.key] = { error: String(e.message).slice(0, 100) }; }
  await p.context().close();
}
await b.close(); console.log(JSON.stringify(out, null, 1));
