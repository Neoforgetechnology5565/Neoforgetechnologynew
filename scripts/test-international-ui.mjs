// International inquiry form, in a real browser against the production build.
// Usage: BASE=http://localhost:3011 node scripts/test-international-ui.mjs
// Validation errors come from the real /api/contact (it rejects before touching the database); successful submissions and
// successful submissions are mocked because this machine has no Firestore. The server's own logic is covered by `npm run test:inquiry`.
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.PW_PATH || "/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.BASE || "http://localhost:3011";
let pass = 0, fail = 0; const t = async (n, f) => { try { await f(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.log("  ✗ " + n + "\n     " + String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const b = await chromium.launch();
const SLOT = Date.UTC(2026, 9, 14, 8, 0); // Wed 14 Oct 2026 08:00Z = 09:00 London (BST)
const offer = (o = {}) => ({ enabled: true, slots: [SLOT, SLOT + 1800e3, SLOT + 86400e3], tz: "Europe/London", durationMin: 30, bookingUrl: "", now: Date.UTC(2026, 9, 12), ...o });
const dismissCookies = async (p) => { const c = p.getByRole("button", { name: /accept|decline|reject|necessary/i }).first(); if (await c.isVisible().catch(() => false)) await c.click().catch(() => {}); };

console.log("inquiry form");
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Europe/Berlin" }), p = await ctx.newPage();
  
  await p.goto(BASE + "/contact", { waitUntil: "load" }); await dismissCookies(p);
  await t("shows the international fields", async () => { for (const l of ["Full name", "Business email", "Company", "Country", "Phone (with country code)", "Service required", "Estimated budget", "Expected timeline", "Preferred communication method", "Project description"]) ok(await p.getByText(l, { exact: false }).first().isVisible(), "missing " + l); ok(await p.getByLabel("Attachments (optional)", { exact: false }).count() + await p.getByText("Attachments (optional)").count() > 0, "attachments"); });
  await t("country list: 200+ countries, priority markets first, valid dial codes", async () => {
    const o = await p.$$eval("#country option", (x) => x.map((e) => [e.value, e.textContent])); ok(o.length > 200, "count " + o.length); ok(o[1][0] === "US", "first is " + o[1]); ok(o.some(([v, n]) => v === "NG" && n === "Nigeria") && o.some(([v]) => v === "NZ"), "NG/NZ");
    const d = await p.$$eval('select[aria-label="Country dial code"] option', (x) => x.map((e) => e.textContent)); ok(d.includes("US +1") && d.includes("GB +44") && d.includes("NG +234") && d.includes("IN +91"), "dial codes");
  });
  await t("choosing a country selects its dial code and updates the phone hint", async () => { await p.selectOption("#country", "DE"); ok((await p.inputValue('select[aria-label="Country dial code"]')) === "DE", "dial not synced"); ok((await p.getAttribute("#phone", "placeholder")).includes("+49"), "placeholder"); });
  await t("service, currency and communication choices are present; currency defaults to USD", async () => { ok((await p.inputValue("#currency")) === "USD", "currency"); const sv = await p.$$eval("#service option", (x) => x.map((e) => e.textContent)); ok(sv.some((x) => /Computer vision/.test(x)) && sv.some((x) => /ANPR/.test(x)) && sv.some((x) => /CAD and BIM/.test(x)), "services"); const cm = await p.$$eval("#preferredContact option", (x) => x.map((e) => e.value)); ok(["email", "video", "phone", "whatsapp"].every((v) => cm.includes(v)), "methods " + cm); });
  let sent = null;
  await p.route("**/api/contact", async (r) => { sent = JSON.parse(r.request().postData()); await r.fulfill({ json: { ok: true, id: "x", token: "y" } }); });
  const fill = async (o = {}) => { await p.fill("#name", "Anna Schmidt"); await p.fill("#email", "anna@example.de"); await p.fill("#company", "Schmidt GmbH"); await p.selectOption("#country", o.country || "DE"); await p.selectOption("#service", "ANPR / licence plate recognition"); await p.fill("#phone", o.phone ?? "030 123456"); await p.fill("#message", "We need plate recognition at three gates."); };
  await t("a valid submission sends country, phone country, service, currency, contact method, timezone, intent and timing", async () => {
    await fill(); await p.selectOption("#currency", "EUR"); await p.selectOption("#budget", "$15k – $50k"); await p.selectOption("#preferredContact", "phone"); await p.check('input[name="intent"][value="quote"]');
    await p.waitForTimeout(2700); await p.getByRole("button", { name: "Send inquiry" }).click(); await p.getByText("your inquiry is in", { exact: false }).waitFor({ timeout: 8000 });
    ok(sent.country === "DE" && sent.phoneCountry === "DE" && sent.phone === "030 123456" && sent.service.includes("ANPR") && sent.currency === "EUR" && sent.preferredContact === "phone" && sent.intent === "quote" && sent.tz === "Europe/Berlin" && typeof sent.startedAt === "number" && sent.division === "", JSON.stringify(sent));
  });
  await t("budget is compulsory: asterisk shown, empty submit is blocked in the browser with a clear message and nothing is sent", async () => {
    await p.reload({ waitUntil: "load" }); await dismissCookies(p); sent = null; ok((await p.locator('label[for="budget"]').textContent()).includes("*"), "no asterisk");
    await p.fill("#name", "Anna Schmidt"); await p.fill("#email", "anna@example.de"); await p.selectOption("#country", "DE"); await p.selectOption("#service", "Other or not sure yet"); await p.fill("#message", "Budget validation check text.");
    await p.waitForTimeout(2700); await p.getByRole("button", { name: "Send inquiry" }).click(); await p.waitForTimeout(500);
    ok(sent === null, "request was sent without a budget"); const v = await p.$eval("#budget", (e) => [e.validity.valueMissing, e.validationMessage]); ok(v[0] === true && /select a budget/i.test(v[1]), JSON.stringify(v));
  });
  await t("all existing budget options are still offered, in the original order", async () => { const o = await p.$$eval("#budget option", (x) => x.map((e) => e.textContent)); ok(JSON.stringify(o.slice(1)) === JSON.stringify(["Prefer to discuss", "Under $5k", "$5k – $15k", "$15k – $50k", "$50k – $150k", "$150k+", "Not sure yet"]), JSON.stringify(o)); });
  for (const b of ["Prefer to discuss", "Under $5k", "$5k – $15k", "$15k – $50k", "$50k – $150k", "$150k+", "Not sure yet"]) await t(`budget "${b}" submits and is sent unchanged`, async () => { sent = null; await p.selectOption("#budget", b); await p.waitForTimeout(2700); await p.getByRole("button", { name: "Send inquiry" }).click(); await p.getByText("your inquiry is in", { exact: false }).waitFor({ timeout: 8000 }); ok(sent.budget === b, "sent " + sent.budget); await p.reload({ waitUntil: "load" }); await dismissCookies(p); await p.fill("#name", "Anna Schmidt"); await p.fill("#email", "anna@example.de"); await p.selectOption("#country", "DE"); await p.selectOption("#service", "Other or not sure yet"); await p.fill("#message", "Budget validation check text."); });
  await ctx.close();
  const c2 = await b.newContext({ viewport: { width: 1280, height: 900 } }), q = await c2.newPage();
  
  await q.goto(BASE + "/contact", { waitUntil: "load" }); await dismissCookies(q);
  const f2 = async (phone, pc) => { await q.fill("#name", "Test Person"); await q.fill("#email", "t@example.com"); await q.selectOption("#country", "GB"); await q.selectOption("#service", "Other or not sure yet"); await q.selectOption("#budget", "Not sure yet"); await q.fill("#phone", phone); if (pc) await q.selectOption("#preferredContact", pc); await q.fill("#message", "Validation check message text."); await q.waitForTimeout(2600); await q.getByRole("button", { name: "Send inquiry" }).click(); };
  await t("real server rejects an invalid phone number with a clear message beside the field", async () => { await f2("123"); await q.getByText("Enter a valid phone number for the selected country").waitFor({ timeout: 8000 }); ok(await q.getByText("Please fix: phone number.").isVisible(), "summary"); });
  await t("real server requires a phone number when WhatsApp or phone is the preferred method", async () => { await q.fill("#phone", ""); await q.selectOption("#preferredContact", "whatsapp"); await q.getByRole("button", { name: "Send inquiry" }).click(); await q.getByText("Add a phone number so we can use your preferred contact method").waitFor({ timeout: 8000 }); });
  await t("a network failure shows a retry message and keeps the typed details", async () => { await q.route("**/api/contact", (r) => r.abort()); await q.getByRole("button", { name: "Send inquiry" }).click(); await q.getByText("couldn't reach the server", { exact: false }).waitFor({ timeout: 8000 }); ok((await q.inputValue("#name")) === "Test Person", "form reset"); });
  await c2.close();
}

console.log("mobile layout");
await t("no horizontal scroll at 375px on the contact page", async () => {
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 } }), p = await ctx.newPage(); await p.goto(BASE + "/contact", { waitUntil: "load" });
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(w[0] <= w[1], `scrollWidth ${w[0]} > ${w[1]}`); await ctx.close();
});
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
