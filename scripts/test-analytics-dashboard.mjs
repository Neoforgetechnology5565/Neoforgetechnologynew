// Renders the real admin analytics dashboard against a realistic dataset produced by the real tracking code, with the admin API mocked
// (no admin login exists in the test environment; server-side access control is checked in test-analytics-security.mjs).
// Usage: BASE=http://localhost:3011 node scripts/test-analytics-dashboard.mjs
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.BASE || "http://localhost:3011", root = path.resolve(import.meta.dirname, "..");
const fx = JSON.parse(execFileSync("npx", ["tsx", "scripts/make-analytics-fixture.ts"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }));
const js = (await build({ entryPoints: [path.join(root, "scripts/admin-harness-entry.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser", target: "es2020", logLevel: "error", alias: { "@": path.join(root, "src") }, define: { "process.env.NODE_ENV": '"production"' }, tsconfig: path.join(root, "tsconfig.json") })).outputFiles[0].text;
const home = await (await fetch(BASE + "/")).text(), css = [...new Set([...home.matchAll(/\/_next\/static\/css\/[^"']+\.css/g)].map((m) => m[0]))];
const b = await chromium.launch(); let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n     " + String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const page = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(), id = (x) => page.getByTestId(x), errors = []; page.on("pageerror", (e) => errors.push(String(e)));
const calls = [], erased = [];
await page.route("**/__t/page", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset=utf-8>${css.map((c) => `<link rel=stylesheet href="${c}">`).join("")}</head><body class="bg-ink-950 text-paper p-6"><div id="root"></div><script src="/__t/bundle.js"></script></body></html>` }));
await page.route("**/__t/bundle.js", (r) => r.fulfill({ contentType: "application/javascript", body: js }));
await page.route("**/api/admin/analytics**", (route) => {
  const r = route.request(), u = new URL(r.url()), parts = u.pathname.split("/").filter(Boolean), json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) }); calls.push(`${r.method()} ${u.pathname}${u.search}`);
  if (parts.length === 3) return json(fx.reports[u.searchParams.get("days") || "30"]);
  if (parts[3] === "visitors" && parts.length === 4) return json({ items: u.searchParams.get("filter") === "contacted" ? fx.contacted : fx.visitors });
  if (parts[3] === "visitors") { const v = fx.details[parts[4]]; if (r.method() === "DELETE") { erased.push(parts[4]); return json({ ok: true }); } return v ? json(v) : json({ error: "Not found" }, 404); }
  return json({ error: "x" }, 404);
});
await page.goto(BASE + "/__t/page", { waitUntil: "load" }); await page.evaluate(() => window.__mountAnalytics());
const R = fx.reports["30"], num = (s) => Number(s.replace(/[^0-9.]/g, ""));
const kpi = async (k) => (await id(k).locator("p").nth(1).innerText()).trim();
console.log(`dataset: ${R.kpis.visits} visits, ${R.kpis.pageViews} page views, ${fx.visitors.length} visitors, ${R.countries.length} countries`);
await t("overview: every headline number matches the data", async () => {
  await id("k-visits").waitFor({ timeout: 20000 });
  ok(num(await kpi("k-visits")) === R.kpis.visits && num(await kpi("k-views")) === R.kpis.pageViews && (await kpi("k-ppv")) === String(R.kpis.pagesPerVisit) && num(await kpi("k-new")) === R.kpis.newVisitors && num(await kpi("k-inq")) === R.kpis.inquiries && (await kpi("k-conv")) === String(R.kpis.conversionPct) && num(await kpi("k-clicks")) === R.kpis.clicks, "KPIs");
  ok(await id("chart").isVisible() && (await id("chart").locator("div").count()) >= 30, "30 bars"); ok(/Do-Not-Track is respected/.test(await id("range-label").innerText()), "consent note"); ok(await id("ov-channels").isVisible() && await id("ov-countries").isVisible() && await id("ov-pages").isVisible(), "quick panels");
});
await t("locations: approximate wording, countries, states/regions, cities, time zones, and Unknown", async () => {
  await id("tab-locations").click(); ok(/Approximate/.test(await id("approx-note").innerText()) && /Unknown/.test(await id("approx-note").innerText()) && /GPS/.test(await id("approx-note").innerText()), await id("approx-note").innerText());
  const c = await id("loc-countries").innerText(); for (const x of R.countries) ok(c.includes(x.label), "country " + x.label); ok(c.includes("Unknown"), "Unknown row");
  const reg = await id("loc-regions").innerText(); ok(/California/.test(reg) && /England/.test(reg) && /United States/.test(reg), "named states with their country"); ok(/MH/.test(reg), "code shown where no name is known");
  ok(/Los Angeles/.test(await id("loc-cities").innerText()) && /London/.test(await id("loc-cities").innerText()), "cities"); ok(/UTC/.test(await id("loc-timezones").innerText()), "time zones");
  const top = R.countries[0]; ok(new RegExp(`${top.label}[\\s\\S]*${top.n}`).test(c), "top country count");
});
await t("sources and devices: channels, named sources, referring hosts, campaigns, device, browser, OS", async () => {
  await id("tab-sources").click(); const s = await id("src-sources").innerText(); for (const x of ["Google", "Facebook", "LinkedIn", "newsletter"]) ok(s.includes(x), x); ok((await id("src-referrers").innerText()).includes("fiverr.com"), "referring host fiverr.com"); ok(/spring-launch/.test(await id("src-campaigns").innerText()), "utm campaign");
  ok(/Direct/.test(await id("src-channels").innerText()) && /Search engines/.test(await id("src-channels").innerText()) && /Social media/.test(await id("src-channels").innerText()), "channels"); ok(/Desktop/.test(await id("dev-devices").innerText()) && /Mobile/.test(await id("dev-devices").innerText()) && /Chrome/.test(await id("dev-browsers").innerText()) && /Windows/.test(await id("dev-os").innerText()), "device, browser, OS");
});
await t("pages and interest: services and demos show their real names", async () => {
  await id("tab-pages").click(); ok(/IFC Data Validation|Revit Plugin Development/.test(await id("in-services").innerText()), "service names"); ok(/Medical Imaging AI & Analysis/.test(await id("in-demos").innerText()), "demo name"); ok(await id("pg-entries").isVisible() && (await id("pg-pages").innerText()).includes("/"), "pages and entry pages");
});
await t("clicks: what visitors click, with type and page", async () => {
  await id("tab-clicks").click(); const tb = await id("clicks-table").innerText(); ok(/Request a quote/.test(tb) && /Services/.test(tb) && /link/.test(tb) && /button/.test(tb), "labels and types"); ok(!/@|\+\d{6}/.test(tb), "no emails or phone numbers"); ok((await id("clicks-table").locator("tbody tr").count()) >= 5, "rows");
});
await t("navigation: page-to-page flows and entry pages", async () => { await id("tab-navigation").click(); const f = await id("flows").innerText(); ok(f.includes("→") && f.includes("/"), "flows"); ok((await id("flows").locator("li").count()) >= 5, "several flows"); ok(await id("nav-entries").isVisible(), "entry pages"); });
await t("visitors: table, filter, and the approximate-location caveat", async () => {
  await id("tab-visitors").click(); await id("visitors-table").waitFor(); ok((await id("visitors-table").locator("tbody tr").count()) === fx.visitors.length, "all visitors listed"); ok(/Approximate/.test(await page.locator("body").innerText()), "caveat on the table");
  const body = await id("visitors-table").innerText(); ok(/Unknown/.test(body) && /Los Angeles, California, United States/.test(body), "places, with Unknown for visitors without a location"); ok(/Contacted/.test(body) && /Yes/.test(body), "contacted column");
  await id("visitor-filter").fill("London"); const n = await id("visitors-table").locator("tbody tr").count(); ok(n > 0 && n < fx.visitors.length, "filtered " + n); await id("visitor-filter").fill("zzzz"); ok(await id("no-visitors").isVisible(), "empty state"); await id("visitor-filter").fill("");
});
await t("visitor detail: first and last visit, source, device, journey, clicks", async () => {
  const v = fx.visitors.find((x) => x.clicks > 0 && x.pages > 2 && x.place !== "Unknown"); await id(`visitor-${v.id}`).click(); await id("visitor-detail").waitFor(); const d = await id("visitor-detail").innerText();
  ok(d.includes(v.place) && /Approximate location/.test(d) && /First visit/.test(d) && /Last visit/.test(d) && d.includes(v.source), "summary"); ok((await id("journey").locator("li").count()) >= 2, "pages viewed"); ok(await id("clicklog").isVisible(), "clicks"); ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(d), "no IP address shown");
  await id("detail-close").click(); ok(await id("visitor-detail").count() === 0, "closes");
});
await t("erasing a visitor sends a DELETE and removes the row", async () => {
  const v = fx.visitors.at(-1); await id(`visitor-${v.id}`).click(); await id("visitor-detail").waitFor(); page.once("dialog", (d) => d.accept()); await id("erase-visitor").click(); await page.waitForFunction((x) => !document.querySelector(`[data-testid=visitor-${x}]`), v.id, { timeout: 5000 });
  ok(erased.includes(v.id), "DELETE sent"); ok((await id("visitors-table").locator("tbody tr").count()) === fx.visitors.length - 1, "row removed"); ok(/erased/.test(await page.locator("body").innerText()), "confirmation");
});
await t("contacts: visitors who submitted an enquiry, with their path and channel breakdown", async () => {
  await id("tab-contacts").click(); await id("contacts-table").waitFor(); ok((await id("contacts-table").locator("tbody tr").count()) === fx.contacted.length, "contacted visitors"); const c = await id("contacts-table").innerText(); ok(/Came from/.test(c) && /Landing page/.test(c), "columns");
  ok(R.conversions.total === 4 && /4 in this period/.test(await id("cv-channels").innerText()), "channel panel"); ok((await id("cv-countries").innerText()).length > 10, "country panel");
});
await t("the time range switches between 7, 30 and 90 days and reloads the report", async () => {
  await id("tab-overview").click(); await id("range").selectOption("7"); await page.waitForFunction((v) => document.querySelector("[data-testid=k-views] p:nth-of-type(2)")?.textContent?.replace(/[^0-9]/g, "") === String(v), fx.reports["7"].kpis.pageViews, { timeout: 8000 }); ok(calls.some((c) => c.includes("days=7")), "requested days=7");
  ok((await id("chart").locator("div").count()) < 12, "7 bars"); await id("range").selectOption("90"); await page.waitForFunction((v) => document.querySelector("[data-testid=k-views] p:nth-of-type(2)")?.textContent?.replace(/[^0-9]/g, "") === String(v), fx.reports["90"].kpis.pageViews, { timeout: 8000 });
});
await t("no data: an honest empty state, not zeros dressed up as results", async () => {
  await page.route("**/api/admin/analytics?days=*", (r) => { const e = JSON.parse(JSON.stringify(fx.reports["30"])); Object.assign(e, { hasData: false, countries: [], regions: [], cities: [], clicks: [], flows: [], pages: [] }); e.kpis = { visits: 0, pageViews: 0, pagesPerVisit: 0, newVisitors: 0, uniqueVisitorsAllTime: 0, inquiries: 0, conversionPct: 0, clicks: 0 }; return r.fulfill({ contentType: "application/json", body: JSON.stringify(e) }); });
  await id("range").selectOption("30"); await id("no-data").waitFor({ timeout: 8000 }); await id("tab-locations").click(); ok(/No regions yet/.test(await id("loc-regions").innerText()), "regions empty"); await id("tab-clicks").click(); ok(await id("no-clicks").isVisible(), "clicks empty"); await id("tab-navigation").click(); ok(await id("no-flows").isVisible(), "flows empty");
});
await t("responsive: no horizontal page scroll at tablet and phone width", async () => { for (const w of [820, 390]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(300); ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "scroll at " + w); } });
await t("the data that was stored contains no IP address and no raw user agent", async () => { ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(fx.stored) && !/Mozilla|AppleWebKit|Gecko/.test(fx.stored), "privacy of stored documents"); });
await t("no page errors", async () => { ok(errors.length === 0, errors.slice(0, 2).join(" | ")); });
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
