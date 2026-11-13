// The real tracker on the production build, with /api/track and /api/contact intercepted so the payloads can be inspected.
// Usage: BASE=http://localhost:3011 node scripts/test-analytics-tracker.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.BASE || "http://localhost:3011";
const b = await chromium.launch(); let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n     " + String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
async function open({ consent, dnt, init } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Berlin", locale: "de-DE" }), page = await ctx.newPage(), hits = [], contacts = [];
  await page.addInitScript(([c, d]) => { try { if (c) localStorage.setItem("nf_consent", c); } catch {} if (d) Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }); }, [consent, dnt]);
  await page.route("**/api/track", async (r) => { try { hits.push(JSON.parse(r.request().postData() || "{}")); } catch { hits.push({ bad: true }); } await r.fulfill({ contentType: "application/json", body: '{"ok":true}' }); });
  await page.route("**/api/contact", async (r) => { contacts.push(JSON.parse(r.request().postData() || "{}")); await r.fulfill({ contentType: "application/json", body: '{"ok":true}' }); });
  await page.route("**/api/presence**", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  return { ctx, page, hits, contacts };
}
const form = (p) => p.locator("form", { has: p.locator("select[name=service]") });
const views = (h) => h.filter((x) => !x.type || x.type === "view"), clicks = (h) => h.filter((x) => x.type === "clicks");
console.log("consent and Do-Not-Track");
await t("nothing is sent before the visitor chooses, and the notice describes what is collected", async () => {
  const s = await open(); await s.page.goto(BASE + "/", { waitUntil: "load" }); await s.page.waitForTimeout(1500); await s.page.getByRole("link", { name: /portfolio/i }).first().click().catch(() => {}); await s.page.waitForTimeout(5000);
  ok(s.hits.length === 0, "requests before consent: " + JSON.stringify(s.hits)); const n = await s.page.getByRole("dialog", { name: "Privacy notice" }).innerText(); ok(/approximate location/i.test(n) && /never your exact location/i.test(n) && /clicks/i.test(n) && /contact us/i.test(n), n); await s.ctx.close();
});
await t("declining sends nothing, ever", async () => { const s = await open({ consent: "declined" }); await s.page.goto(BASE + "/", { waitUntil: "load" }); await s.page.getByRole("link").first().click().catch(() => {}); await s.page.waitForTimeout(5500); ok(s.hits.length === 0, JSON.stringify(s.hits)); await s.ctx.close(); });
await t("Do-Not-Track blocks tracking even after accepting", async () => { const s = await open({ consent: "accepted", dnt: true }); await s.page.goto(BASE + "/", { waitUntil: "load" }); await s.page.getByRole("link").first().click().catch(() => {}); await s.page.waitForTimeout(5500); ok(s.hits.length === 0, JSON.stringify(s.hits)); await s.ctx.close(); });
await t("accepting in the notice starts tracking from that moment", async () => { const s = await open(); await s.page.goto(BASE + "/", { waitUntil: "load" }); await s.page.getByRole("button", { name: "Accept" }).click(); await s.page.waitForFunction(() => true); await s.page.waitForTimeout(1200); ok(views(s.hits).length === 1 && views(s.hits)[0].path === "/", JSON.stringify(s.hits)); await s.ctx.close(); });
console.log("what a visit sends");
const S = await open({ consent: "accepted" });
await t("first page: path, visitor id, visit id, browser time zone and language; no referrer", async () => {
  await S.page.goto(BASE + "/", { waitUntil: "load" }); await S.page.waitForFunction(() => true); await S.page.waitForTimeout(1200); const v = views(S.hits)[0];
  ok(v && v.path === "/" && /^[a-zA-Z0-9_-]{8,}$/.test(v.vid) && /^[a-zA-Z0-9_-]{6,40}$/.test(v.sid), JSON.stringify(v)); ok(v.tz === "Europe/Berlin" && /^de/.test(v.lang), "tz/lang " + v.tz + " " + v.lang); ok(v.ref === undefined && v.utm === undefined, "no referrer on a direct visit");
  ok(Object.keys(v).every((k) => ["path", "vid", "sid", "project", "tz", "lang", "ref", "utm"].includes(k)), "unexpected fields: " + Object.keys(v).join(","));
});
await t("moving to another page sends another view with the same visitor and visit, without re-sending the referrer", async () => {
  await S.page.getByRole("link", { name: /portfolio/i }).first().click(); await S.page.waitForURL(/portfolio/); await S.page.waitForTimeout(1200); const [a, c] = views(S.hits).slice(-2); ok(a.vid === c.vid && a.sid === c.sid && /portfolio/.test(c.path), JSON.stringify(c)); ok(c.ref === undefined && c.utm === undefined, "no repeated referrer");
});
await t("clicks are batched and sent with the label, kind and destination path only", async () => {
  await S.page.waitForTimeout(4800); const cl = clicks(S.hits); ok(cl.length >= 1, "no click batch: " + JSON.stringify(S.hits.map((x) => x.type || "view"))); const items = cl.flatMap((x) => x.items); const link = items.find((i) => /portfolio/i.test(i.l)); ok(link && link.k === "link" && link.h?.startsWith("/portfolio"), JSON.stringify(items));
  ok(cl[0].path === "/" && cl[0].vid === views(S.hits)[0].vid && cl[0].sid === views(S.hits)[0].sid, "click carries the page it happened on and the visit ids"); ok(items.every((i) => Object.keys(i).every((k) => ["l", "k", "h"].includes(k)) && i.l.length <= 80), "fields");
});
await t("anything typed into a form is never read; email and phone links are reduced to their scheme", async () => {
  await S.page.goto(BASE + "/contact", { waitUntil: "load" }); await S.page.getByRole("button", { name: "Accept" }).click({ timeout: 1500 }).catch(() => {});
  await form(S.page).locator("input[name=name]").fill("Jane Secret"); await form(S.page).locator("input[name=email]").fill("jane.secret@example.com"); await form(S.page).locator("textarea[name=message]").fill("My private message about a project");
  await form(S.page).locator("input[name=name]").click(); await form(S.page).locator("textarea[name=message]").click();
  await S.page.evaluate(() => { const a = document.createElement("a"); a.href = "mailto:someone@example.com"; a.textContent = "Email us"; a.addEventListener("click", (e) => e.preventDefault()); document.body.appendChild(a); const p = document.createElement("a"); p.href = "tel:+15551234567"; p.textContent = "Call us"; p.addEventListener("click", (e) => e.preventDefault()); document.body.appendChild(p); });
  await S.page.getByText("Email us").click(); await S.page.getByText("Call us").click(); await S.page.waitForTimeout(5000);
  const raw = JSON.stringify(S.hits); ok(!/Jane|secret|example\.com|555|private message/i.test(raw), "typed or personal text leaked: " + raw.slice(0, 300)); const items = clicks(S.hits).flatMap((x) => x.items); ok(items.some((i) => i.l === "Email us" && i.h === "mailto:") && items.some((i) => i.l === "Call us" && i.h === "tel:"), JSON.stringify(items.slice(-3)));
});
await t("submitting the contact form links the message to the visit; declining or Do-Not-Track does not", async () => {
  await form(S.page).locator("select[name=service]").selectOption({ index: 1 }); await form(S.page).locator("select[name=country]").selectOption({ index: 1 }); await form(S.page).locator("select[name=budget]").selectOption({ index: 1 }); await form(S.page).locator("button[type=submit], button:has-text(\"Send\")").first().click(); await S.page.waitForTimeout(1200);
  ok(S.contacts.length === 1 && /^[a-zA-Z0-9_-]{8,}$/.test(S.contacts[0].vid || ""), "vid in contact: " + JSON.stringify(S.contacts[0] || {}).slice(0, 200)); ok(S.contacts[0].vid === views(S.hits)[0].vid, "same visitor id");
  for (const o of [{ consent: "declined" }, { consent: "accepted", dnt: true }]) { const s = await open(o); await s.page.goto(BASE + "/contact", { waitUntil: "load" }); await form(s.page).locator("input[name=name]").fill("A B"); await form(s.page).locator("input[name=email]").fill("a@b.co"); await form(s.page).locator("textarea[name=message]").fill("A message with enough length"); await form(s.page).locator("select[name=service]").selectOption({ index: 1 }); await form(s.page).locator("select[name=country]").selectOption({ index: 1 }); await form(s.page).locator("select[name=budget]").selectOption({ index: 1 }); await form(s.page).locator("button[type=submit], button:has-text(\"Send\")").first().click(); await s.page.waitForTimeout(1000); ok(s.contacts.length === 1 && s.contacts[0].vid === undefined, "no visitor link: " + JSON.stringify(s.contacts[0] || {})); await s.ctx.close(); }
});
await S.ctx.close();
console.log("sources, visits and exclusions");
await t("referrer (origin only) and utm tags are sent on the first page of a visit", async () => {
  const s = await open({ consent: "accepted" }); await s.page.goto(BASE + "/?utm_source=newsletter&utm_medium=email&utm_campaign=spring-launch", { waitUntil: "load", referer: "https://www.linkedin.com/feed/update/secret-id?x=1#frag" }); await s.page.waitForTimeout(1200); const v = views(s.hits)[0];
  ok(v.ref === "https://www.linkedin.com", "ref: " + v.ref); ok(JSON.stringify(v.utm) === JSON.stringify({ s: "newsletter", m: "email", c: "spring-launch" }), JSON.stringify(v.utm)); ok(!/secret-id|\?x=1|frag/.test(JSON.stringify(s.hits)), "no path or query from the referrer"); ok(v.path === "/", "the query string is not part of the page path"); await s.ctx.close();
});
await t("a visit ends after 30 minutes of inactivity: the next page gets a new visit id and the referrer again", async () => {
  const s = await open({ consent: "accepted" }); await s.page.goto(BASE + "/", { waitUntil: "load" }); await s.page.waitForTimeout(1000); const first = views(s.hits)[0].sid;
  await s.page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem("nf_sid")); sessionStorage.setItem("nf_sid", JSON.stringify({ id: o.id, t: Date.now() - 31 * 60000 })); });
  await s.page.goto(BASE + "/pricing", { waitUntil: "load", referer: "https://www.google.com/" }); await s.page.waitForTimeout(1200); const v = views(s.hits).at(-1); ok(v.sid !== first && v.ref === "https://www.google.com", JSON.stringify(v)); await s.ctx.close();
});
await t("the admin area is never tracked", async () => { const s = await open({ consent: "accepted" }); await s.page.goto(BASE + "/admin/login", { waitUntil: "load" }); await s.page.waitForTimeout(1500); ok(s.hits.length === 0, JSON.stringify(s.hits)); await s.ctx.close(); });
await t("demo workspaces count the visit but their buttons are not click-tracked", async () => {
  const s = await open({ consent: "accepted" }); await s.page.goto(BASE + "/ai-demos/ai-medical-imaging-analysis/app", { waitUntil: "load" }); await s.page.waitForTimeout(1200); ok(views(s.hits).some((v) => /ai-medical-imaging-analysis\/app/.test(v.path)), "visit counted");
  await s.page.getByTestId("sample-fundus").click(); await s.page.waitForTimeout(5200); ok(clicks(s.hits).length === 0, "clicks sent from inside a demo: " + JSON.stringify(clicks(s.hits))); await s.ctx.close();
});
await t("closing or hiding the page flushes pending clicks", async () => {
  const s = await open({ consent: "accepted" }); await s.page.goto(BASE + "/", { waitUntil: "load" }); await s.page.waitForTimeout(800); await s.page.getByRole("link", { name: /services/i }).first().click(); await s.page.waitForURL(/services/);
  await s.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }); await s.page.waitForTimeout(500); ok(clicks(s.hits).length >= 1, "no flush on hide"); await s.ctx.close();
});
await t("a failing analytics endpoint never breaks the page", async () => {
  const ctx = await b.newContext(), p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e))); await p.addInitScript(() => localStorage.setItem("nf_consent", "accepted")); await p.route("**/api/track", (r) => r.abort()); await p.goto(BASE + "/", { waitUntil: "load" }); await p.getByRole("link").first().click().catch(() => {}); await p.waitForTimeout(4800); ok(errs.length === 0, errs.join(" | ")); await ctx.close();
});
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
