import { createRequire } from "node:module"; const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const b = await chromium.launch(); let fail = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };
for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 800 }]]) {
  const p = await b.newPage({ viewport: vp }); await p.goto("http://localhost:3011/", { waitUntil: "load" });
  const sec = p.locator("section[aria-labelledby=clients-say]"); await sec.scrollIntoViewIfNeeded();
  ok(await sec.getByRole("heading", { name: "What Our Clients Say" }).isVisible(), name + ": heading");
  ok(await sec.getByText("Illustrative Testimonials").first().isVisible(), name + ": section label");
  ok(/not independently verified customer reviews/.test(await sec.innerText()), name + ": disclosure");
  ok((await sec.locator("li").count()) === 6, name + ": 6 shown first");
  const btn = sec.getByRole("button", { name: /load more/i });
  while (await btn.count()) await btn.click();
  ok((await sec.locator("li").count()) === 20, name + ": all 20 after Load more");
  ok(/Showing 20 of 20/.test(await sec.innerText()), name + ": counter");
  const t = await sec.innerText();
  ok(!/Fiverr|Upwork|Google|Facebook|Instagram|Local Market|Remote Work/.test(t), name + ": no platform attribution");
  ok((await sec.locator("a, img, svg").count()) === 0 && !/[★]|average/i.test(t), name + ": no links, logos, stars or average");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ": no horizontal scroll");
  ok(/Georgia/.test(await sec.evaluate((e) => getComputedStyle(e).fontFamily)), name + ": Georgia");
  await p.close();
}
await b.close(); console.log(fail ? fail + " failed" : "all passed"); process.exit(fail ? 1 : 0);
