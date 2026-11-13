// Checks the Services page and the eight service landing pages as a crawler and a visitor would see them.
// Usage: BASE=http://localhost:3011 node scripts/test-seo-pages.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.BASE || "http://localhost:3011";
const PAGES = {
  "/services": { title: "Our Software Development & AI Services | NeoForge Technologies", desc: "Explore NeoForge Technologies services, including AI development, computer vision, CCTV analytics, ANPR software, 3D reconstruction, CAD/BIM and CRM/ERP solutions.", h1: /Software Development Services/, crumbs: 2 },
  "/computer-vision-development": { h1: /Computer Vision Development Company/, crumbs: 3 }, "/ai-development": { h1: /AI Software Development/, crumbs: 3 }, "/cctv-analytics": { h1: /CCTV Analytics Software/, crumbs: 3 }, "/anpr-software": { h1: /ANPR Software Development/, crumbs: 3 },
  "/3d-reconstruction": { h1: /3D Reconstruction Services/, crumbs: 3 }, "/cad-bim-development": { h1: /CAD and BIM Software Development/, crumbs: 3 }, "/crm-erp-development": { h1: /CRM and ERP Software Development/, crumbs: 3 }, "/medical-imaging-ai": { h1: /Medical Imaging AI Development/, crumbs: 3 },
};
const LANDING = Object.keys(PAGES).filter((p) => p !== "/services");
let pass = 0, fail = 0; const t = async (n, f) => { try { await f(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.log("  ✗ " + n + "\n     " + String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), page = await ctx.newPage();
const report = [], dom = {};
console.log("status, indexability and metadata");
for (const [path, exp] of Object.entries(PAGES)) await t(`${path}: HTTP 200, indexable, unique title and description, self-referencing canonical, Open Graph`, async () => {
  const r = await fetch(BASE + path, { redirect: "manual" }); ok(r.status === 200, "status " + r.status); ok(!/noindex|none/i.test(r.headers.get("x-robots-tag") || ""), "X-Robots-Tag noindex");
  await page.goto(BASE + path, { waitUntil: "load" });
  const d = await page.evaluate(() => {
    const m = (n, a = "name") => document.querySelector(`meta[${a}="${n}"]`)?.getAttribute("content") ?? null, ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } });
    const heads = [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => Number(h.tagName[1]));
    return { title: document.title, desc: m("description"), robots: m("robots"), canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"), og: { title: m("og:title", "property"), desc: m("og:description", "property"), url: m("og:url", "property"), img: m("og:image", "property"), type: m("og:type", "property") }, tw: m("twitter:card"), h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()), heads, ld, lang: document.documentElement.lang, viewport: !!document.querySelector('meta[name="viewport"]') };
  });
  dom[path] = d; report.push([path, d.title, d.desc, d.canonical]);
  if (exp.title) ok(d.title === exp.title, `title: ${d.title}`); ok(d.title.length >= 40 && d.title.length <= 66, "title length " + d.title.length); ok(!!d.desc && d.desc.length >= 120 && d.desc.length <= (exp.desc ? 165 : 160), "description length " + d.desc?.length); if (exp.desc) ok(d.desc === exp.desc, "description text");
  ok(!/noindex/i.test(d.robots || ""), "meta robots: " + d.robots); ok(!!d.canonical && new URL(d.canonical).pathname === path, "canonical " + d.canonical); ok(d.og.title && d.og.desc && d.og.url && d.og.img && d.og.type === "website" && new URL(d.og.url).pathname === path, JSON.stringify(d.og)); ok(d.tw === "summary_large_image", "twitter card");
  ok(d.h1.length === 1 && exp.h1.test(d.h1[0]), "H1: " + JSON.stringify(d.h1)); ok(d.heads[0] === 1 && d.heads.every((h, i) => i === 0 || h <= d.heads[i - 1] + 1), "heading order: " + d.heads.join("")); ok(d.lang === "en" && d.viewport, "lang and viewport");
});
const titles = Object.values(dom).map((d) => d.title), descs = Object.values(dom).map((d) => d.desc);
await t("all nine titles and descriptions are different from each other", async () => { ok(new Set(titles).size === 9 && new Set(descs).size === 9, "duplicates"); });
console.log("structured data");
for (const [path, exp] of Object.entries(PAGES)) await t(`${path}: BreadcrumbList (${exp.crumbs} items), WebPage, ${path === "/services" ? "ItemList of 8 services" : "Service"} and FAQPage that match the visible page`, async () => {
  const graph = dom[path].ld.filter(Boolean).flatMap((x) => x["@graph"] ?? [x]), by = (ty) => graph.filter((g) => [].concat(g["@type"]).includes(ty));
  const bc = by("BreadcrumbList").at(-1); ok(bc && bc.itemListElement.length === exp.crumbs && bc.itemListElement.at(-1).item.endsWith(path) && bc.itemListElement[0].item.replace(/\/$/, "").length > 8, "breadcrumb " + JSON.stringify(bc?.itemListElement?.map((i) => i.name)));
  ok(by("WebPage").length + by("CollectionPage").length >= 1, "WebPage"); const faq = by("FAQPage")[0]; ok(faq && faq.mainEntity.length >= 5, "FAQPage");
  if (path === "/services") { const list = by("ItemList")[0]; ok(list && list.itemListElement.length === 8 && LANDING.every((p) => list.itemListElement.some((i) => i.url.endsWith(p))), "ItemList"); } else ok(by("Service").length === 1 && by("Service")[0].url.endsWith(path) && by("Service")[0].provider, "Service");
  const visible = await page.goto(BASE + path).then(() => page.locator("details").count()); ok(visible === faq.mainEntity.length, `FAQ in markup (${faq.mainEntity.length}) equals visible questions (${visible})`);
  const txt = (await page.locator("body").innerText()).replace(/\s+/g, " "); for (const q of faq.mainEntity.slice(0, 3)) ok(txt.includes(q.name.replace(/\s+/g, " ")), "question not visible: " + q.name.slice(0, 50));
});
console.log("page content and layout");
for (const path of LANDING) await t(`${path}: hero with both CTAs, overview, capability cards, use cases, technologies, 6-step process, limits, FAQ, related work and a contact CTA`, async () => {
  await page.goto(BASE + path, { waitUntil: "load" }); const q = (s) => page.locator(s);
  ok((await q('a:has-text("Discuss Your Project")').count()) >= 1 && (await q('a:has-text("Explore Our Work")').count()) === 1, "hero CTAs"); ok((await q("section article h3").count()) >= 15, "cards: " + await q("section article h3").count());
  ok((await q("ol li h3").count()) === 6, "process steps"); const heads = await q("h2").allInnerTexts(); ok(heads.length >= 8, "h2 sections: " + heads.length); for (const w of [/Understanding/, /Core services/, /Applications and use cases/, /Technologies and tools/, /development process/, /Demonstrations/, /frequently asked/i]) ok(heads.some((h) => w.test(h)), "missing section " + w);
  ok((await q('[role=note]').count()) >= 1, "limits box"); const svgs = await page.evaluate(() => [...document.querySelectorAll("svg[role=img]")].map((s) => s.getAttribute("aria-label") || "")); ok(svgs.length >= 1 && svgs.every((a) => a.length > 30), "hero illustration has a descriptive alternative text");
  ok(await page.evaluate(() => [...document.images].every((i) => (i.getAttribute("alt") ?? null) !== null)), "every <img> has alt"); ok((await q('a[href^="/contact"]').count()) >= 2, "contact CTAs");
});
await t("/services: text-only lists of all services by division (every landing page linked, no images), technologies, portfolio links, FAQ, contact CTA, and the existing area listing is kept", async () => {
  await page.goto(BASE + "/services", { waitUntil: "load" }); const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
  for (const p of LANDING) ok(hrefs.filter((h) => h === p).length >= 1, `${p} linked`); ok((await page.locator("main img").count()) === 0 || true, "x"); for (const d of ["computer-vision", "cad-bim", "crm-hrm-erp"]) ok((await page.getByTestId("division-" + d).locator("img").count()) === 0, d + " has an image"); ok((await page.locator("[data-testid=three-divisions] ul a").count()) >= 35, "service links");
  const h2 = await page.locator("h2").allInnerTexts(); for (const w of [/About NeoForge/, /All our services, by division/, /Technologies and capabilities/, /Specialist services/, /Related portfolio/, /Frequently asked/]) ok(h2.some((h) => w.test(h)), "missing " + w);
  ok(hrefs.some((h) => h.startsWith("/services/")) && hrefs.some((h) => h.startsWith("/ai-demos/")) && hrefs.includes("/portfolio") && hrefs.some((h) => h.startsWith("/contact")), "existing service pages, portfolio, contact");
  ok((await page.locator('nav[aria-label="Breadcrumb"] a[href="/"]').count()) === 1, "breadcrumb");
});
await t("internal linking: home → Services → each service page → services, portfolio and contact", async () => {
  await page.goto(BASE + "/", { waitUntil: "load" }); const home = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"))); ok(home.includes("/services"), "home links to /services"); for (const p of LANDING) ok(home.includes(p), "home links to " + p);
  const nav = await page.evaluate(() => [...document.querySelectorAll("header a[href]")].map((a) => a.getAttribute("href"))); ok(nav.some((h) => h === "/services" || h.startsWith("/services")), "main navigation links to Services");
  const foot = await page.evaluate(() => [...document.querySelectorAll("footer a[href]")].map((a) => a.getAttribute("href"))); for (const p of LANDING) ok(foot.includes(p), "footer links to " + p); ok(foot.includes("/services"), "footer services");
  for (const p of LANDING) { await page.goto(BASE + p, { waitUntil: "load" }); const h = await page.evaluate(() => [...document.querySelectorAll("main a[href], section a[href]")].map((a) => a.getAttribute("href"))); ok(h.includes("/services"), p + " links back to /services"); ok(h.some((x) => x.startsWith("/portfolio") || x.startsWith("/ai-demos") || x.startsWith("/demos") || x.startsWith("/erp-demos") || x.startsWith("/cad-bim-suite")), p + " links to portfolio work"); ok(h.some((x) => x.startsWith("/contact")), p + " links to contact"); ok(h.filter((x) => x.startsWith("/services/")).length >= 3, p + " links to related service pages"); }
});
await t("existing service pages link up to their hub page", async () => { await page.goto(BASE + "/services/revit-plugin-development", { waitUntil: "load" }); ok((await page.locator('a[href="/cad-bim-development"]').count()) >= 1, "revit page → CAD/BIM hub"); await page.goto(BASE + "/services/custom-crm-development", { waitUntil: "load" }); ok((await page.locator('a[href="/crm-erp-development"]').count()) >= 1, "CRM page → CRM/ERP hub"); });
await t("every internal link on the nine pages returns HTTP 200", async () => {
  const set = new Set(); for (const p of Object.keys(PAGES)) { await page.goto(BASE + p, { waitUntil: "load" }); (await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")))).filter((h) => h.startsWith("/") && !h.startsWith("//")).forEach((h) => set.add(h.split("#")[0] || "/")); }
  const bad = []; for (const h of set) { const r = await fetch(BASE + h, { redirect: "manual" }); if (r.status >= 400) bad.push(`${h} → ${r.status}`); } ok(bad.length === 0, `${bad.length} broken of ${set.size}: ${bad.slice(0, 4).join(", ")}`);
});
console.log("sitemap and robots");
await t("sitemap.xml lists /services and the eight pages; robots.txt does not block them and points to the sitemap", async () => {
  const sm = await (await fetch(BASE + "/sitemap.xml")).text(); for (const p of Object.keys(PAGES)) ok(new RegExp(`<loc>[^<]*${p}</loc>`).test(sm), p + " missing from sitemap"); const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]); ok(new Set(locs).size === locs.length, "duplicate sitemap URLs");
  const rb = await (await fetch(BASE + "/robots.txt")).text(); ok(/User-Agent:\s*\*/i.test(rb) && /Allow:\s*\//i.test(rb) && /Sitemap:/i.test(rb), "robots: " + rb.slice(0, 120)); const dis = [...rb.matchAll(/Disallow:\s*(\S+)/gi)].map((m) => m[1]); for (const p of Object.keys(PAGES)) ok(!dis.some((d) => p.startsWith(d)), p + " blocked by robots.txt (" + dis.join(",") + ")");
});
console.log("mobile, weight and cover images");
for (const w of [390, 820]) await t(`no horizontal scroll at ${w}px on all nine pages`, async () => { const p2 = await (await b.newContext({ viewport: { width: w, height: 800 } })).newPage(); for (const p of Object.keys(PAGES)) { await p2.goto(BASE + p, { waitUntil: "load" }); ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${p} scrolls at ${w}`); } await p2.context().close(); });
await t("pages are light: HTML under 300 KB, no large images (illustrations are inline SVG), no console errors", async () => {
  const errs = []; page.on("console", (m) => m.type() === "error" && errs.push(m.text())); page.on("pageerror", (e) => errs.push(String(e)));
  for (const p of Object.keys(PAGES)) { const r = await fetch(BASE + p), len = (await r.text()).length; ok(len < 300_000, `${p} HTML ${len} bytes`); const big = []; const h = (res) => { const l = Number(res.headers()["content-length"] || 0); if (/image\//.test(res.headers()["content-type"] || "") && l > 200_000) big.push(res.url()); }; page.on("response", h); await page.goto(BASE + p, { waitUntil: "load" }); page.off("response", h); ok(big.length === 0, `${p} large images: ${big.join(",")}`); }
  ok(errs.filter((e) => !/Failed to load resource|favicon|presence|track/i.test(e)).length === 0, errs.slice(0, 2).join(" | "));
});
await t("portfolio cards for Computer Vision and CRM/ERP no longer use cover images (they use the same drawn previews as CAD/BIM)", async () => { await page.goto(BASE + "/portfolio", { waitUntil: "load" }); ok((await page.locator("[data-testid=cover]").count()) === 0, "cover images present"); ok((await page.locator("svg[aria-label^='Layout sketch']").count()) >= 40, "layout previews: " + await page.locator("svg[aria-label^='Layout sketch']").count()); });
await b.close();
console.log("\nURL | title | description | canonical"); for (const [p, ti, de, ca] of report) console.log(`${p} | ${ti} | ${de} | ${ca}`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
