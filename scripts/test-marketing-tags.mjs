// Consent-gated measurement tags, in a real browser against a build made WITH test IDs.
// MODE=gtm  build with NEXT_PUBLIC_GTM_ID=GTM-TEST123 NEXT_PUBLIC_CLARITY_ID=abcd1234ef
// MODE=gtag build with NEXT_PUBLIC_GA_ID=G-TEST123456 NEXT_PUBLIC_GADS_ID=AW-1234567890 NEXT_PUBLIC_GADS_LEAD_LABEL=LeadLabel1
// Usage: MODE=gtm BASE=http://localhost:3011 node scripts/test-marketing-tags.mjs   (external hosts are stubbed; nothing leaves the machine)
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.BASE || "http://localhost:3011", MODE = process.env.MODE || "gtm";
let pass = 0, fail = 0; const t = async (n, f) => { try { await f(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.log("  ✗ " + n + "\n     " + String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const b = await chromium.launch();
async function open(consent, dnt = false) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: dnt ? { DNT: "1" } : {} });
  if (dnt) await ctx.addInitScript(() => Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }));
  if (consent) await ctx.addInitScript((c) => { try { localStorage.setItem("nf_consent", c); } catch {} }, consent);
  const ext = []; const p = await ctx.newPage();
  await p.route(/googletagmanager\.com|clarity\.ms|google-analytics\.com|doubleclick\.net/, (r) => { ext.push(r.request().url()); r.fulfill({ contentType: "application/javascript", body: "/* stub */" }); });
  await p.route("**/api/meetings", (r) => r.request().method() === "GET" ? r.fulfill({ json: { enabled: true, slots: [], tz: "UTC", durationMin: 30, bookingUrl: "" } }) : r.fallback());
  await p.route("**/api/contact", (r) => r.fulfill({ json: { ok: true, id: "x", token: "y" } }));
  return { ctx, p, ext, layer: () => p.evaluate(() => (window.dataLayer || []).filter((x) => x && x.event && !String(x.event).startsWith("gtm.")).map((x) => ({ ...x }))) };
}
const fill = async (p) => { await p.fill("#name", "Anna Schmidt"); await p.fill("#email", "anna@example.de"); await p.selectOption("#country", "DE"); await p.selectOption("#service", "Other or not sure yet"); await p.selectOption("#budget", "Not sure yet"); await p.fill("#message", "Tracking check message."); await p.waitForTimeout(2700); await p.getByRole("button", { name: "Send inquiry" }).click(); await p.getByText("your inquiry is in", { exact: false }).waitFor({ timeout: 8000 }); };
console.log(`tags (${MODE})`);
await t("no consent: nothing is loaded and nothing is pushed", async () => { const s = await open(null); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await s.p.waitForTimeout(800); ok(s.ext.length === 0, "external requests: " + s.ext); ok((await s.p.evaluate(() => !!document.querySelector("#nf-gtm,#nf-gtag,#nf-clarity"))) === false, "script tags"); await fill(s.p); ok((await s.layer()).length === 0, "events pushed without consent"); await s.ctx.close(); });
await t("declined: nothing is loaded", async () => { const s = await open("declined"); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await s.p.waitForTimeout(800); ok(s.ext.length === 0, "external: " + s.ext); await s.ctx.close(); });
await t("accepted but Do-Not-Track: nothing is loaded", async () => { const s = await open("accepted", true); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await s.p.waitForTimeout(800); ok(s.ext.length === 0, "external: " + s.ext); await s.ctx.close(); });
await t("accepted: only the configured, well-formed tags load", async () => {
  const s = await open("accepted"); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await s.p.waitForTimeout(1000); const u = s.ext.join(" ");
  if (MODE === "gtm") { ok(/gtm\.js\?id=GTM-TEST123/.test(u) && /clarity\.ms\/tag\/abcd1234ef/.test(u) && !/gtag\/js/.test(u), u); } else { ok(/gtag\/js\?id=G-TEST123456/.test(u) && !/gtm\.js/.test(u) && !/clarity/.test(u), u); }
  await s.ctx.close();
});
await t("accepting the notice loads them without a reload", async () => { const s = await open(null); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await s.p.waitForTimeout(500); ok(s.ext.length === 0, "loaded early"); const btn = s.p.getByRole("button", { name: /accept/i }).first(); await btn.click(); await s.p.waitForTimeout(1200); ok(s.ext.length > 0, "not loaded after accept"); await s.ctx.close(); });
await t("a successful inquiry pushes exactly one generate_lead event with no personal data", async () => {
  const s = await open("accepted"); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await fill(s.p); const ev = (await s.layer()).filter((e) => e.event === "generate_lead"); ok(ev.length === 1, JSON.stringify(ev)); const raw = JSON.stringify(await s.layer()); ok(!/Anna|example\.de|Tracking check/.test(raw), "personal data in dataLayer: " + raw); 
  if (MODE === "gtag") { const conv = await s.p.evaluate(() => (window.dataLayer || []).map((x) => Array.from(x)).filter((a) => a[0] === "event" && a[1] === "conversion")); ok(conv.length === 1 && conv[0][2].send_to === "AW-1234567890/LeadLabel1", JSON.stringify(conv)); }
  await s.ctx.close();
});
await t("a failed inquiry does not count as a lead", async () => { const s = await open("accepted"); await s.p.unroute("**/api/contact"); await s.p.route("**/api/contact", (r) => r.fulfill({ status: 400, json: { error: "Validation failed", issues: [{ path: ["phone"], message: "x" }] } })); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await s.p.fill("#name", "A B"); await s.p.fill("#email", "a@b.co"); await s.p.selectOption("#country", "DE"); await s.p.selectOption("#service", "Other or not sure yet"); await s.p.selectOption("#budget", "Not sure yet"); await s.p.fill("#message", "Failure check message."); await s.p.waitForTimeout(2700); await s.p.getByRole("button", { name: "Send inquiry" }).click(); await s.p.waitForTimeout(800); ok((await s.layer()).filter((e) => e.event === "generate_lead").length === 0, "lead counted on failure"); await s.ctx.close(); });
await t("WhatsApp, email and phone link clicks are secondary events; ordinary links are not", async () => {
  const s = await open("accepted"); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await s.p.waitForTimeout(500);
  await s.p.evaluate(() => { for (const [h, id] of [["https://wa.me/2348012345678", "t-wa"], ["mailto:hello@example.com", "t-mail"], ["tel:+2348012345678", "t-tel"], ["/pricing", "t-plain"]]) { const a = document.createElement("a"); a.href = h; a.id = id; a.textContent = id; a.addEventListener("click", (e) => e.preventDefault()); document.body.prepend(a); } });
  for (const id of ["t-wa", "t-mail", "t-tel", "t-plain"]) await s.p.click("#" + id);
  const ev = (await s.layer()).filter((e) => e.event === "contact_click").map((e) => e.method); ok(JSON.stringify(ev) === JSON.stringify(["whatsapp", "email", "phone"]), JSON.stringify(ev)); await s.ctx.close();
});
await t("page views and the contact page visit alone push no conversion", async () => { const s = await open("accepted"); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); await s.p.goto(BASE + "/pricing", { waitUntil: "load" }); ok((await s.layer()).filter((e) => e.event === "generate_lead" || e.event === "meeting_request").length === 0, "conversion on page view"); await s.ctx.close(); });
await t("the inquiry and meeting forms are masked for Clarity", async () => { const s = await open("accepted"); await s.p.goto(BASE + "/contact", { waitUntil: "load" }); ok((await s.p.locator('form[data-clarity-mask="True"]').count()) >= 1, "form not masked"); await s.ctx.close(); });
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
