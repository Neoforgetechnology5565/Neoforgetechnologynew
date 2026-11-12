// Visitors cannot read or change analytics data. Usage: BASE=http://localhost:3011 node scripts/test-analytics-security.mjs
const BASE = process.env.BASE || "http://localhost:3011"; let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n     " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const req = (p, o = {}) => fetch(BASE + p, { redirect: "manual", ...o }), same = { Origin: BASE };
const VID = "visitor-aaaaaaaa";
await t("the dashboard page redirects a visitor to the login page", async () => { const r = await req("/admin/analytics"); ok([302, 307, 308].includes(r.status) && /\/admin\/login/.test(r.headers.get("location") || ""), `${r.status} ${r.headers.get("location")}`); });
for (const [m, p] of [["GET", "/api/admin/analytics/alerts"], ["PUT", "/api/admin/analytics/alerts"], ["POST", "/api/admin/analytics/alerts/subscribe"], ["DELETE", "/api/admin/analytics/alerts/subscribe"], ["POST", "/api/admin/analytics/alerts/test"], ["GET", "/api/admin/analytics"], ["GET", "/api/admin/analytics?days=90"], ["GET", "/api/admin/analytics/live"], ["GET", "/api/admin/analytics/visitors"], ["GET", "/api/admin/analytics/visitors?filter=contacted"], ["GET", `/api/admin/analytics/visitors/${VID}`], ["DELETE", `/api/admin/analytics/visitors/${VID}`]])
  await t(`${m} ${p} needs an administrator session`, async () => { const r = await req(p, { method: m, headers: same }); ok(r.status === 401, String(r.status)); const body = await r.text(); ok(!/visitor|country|firstSeen/i.test(body.replace(/Unauthorized/g, "")), "no data in the refusal"); });
await t("a forged session cookie does not unlock it", async () => { for (const c of ["__nf_session=abc", "__nf_session=eyJhbGciOiJub25lIn0.eyJhZG1pbiI6dHJ1ZX0."]) { const r = await req("/api/admin/analytics", { headers: { Cookie: c } }); ok(r.status === 401, `${r.status}`); } });
await t("erasing a visitor from another origin is refused", async () => { const r = await req(`/api/admin/analytics/visitors/${VID}`, { method: "DELETE", headers: { Origin: "https://evil.example" } }); ok(r.status === 403, String(r.status)); });
await t("the collection endpoint accepts events but never returns data, and ignores junk", async () => {
  const g = await req("/api/track"); ok(g.status === 405 || g.status === 404, "GET " + g.status);
  for (const body of ["{", "[]", '{"path":"/admin/x","vid":"visitor-aaaaaaaa"}', '{"type":"clicks","vid":"x","path":"/","items":[]}']) { const r = await req("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body }); ok(r.status === 200 && (await r.text()) === '{"ok":true}', `${body.slice(0, 20)} → ${r.status}`); }
});
await t("a bot user agent and Do-Not-Track are ignored by the server too", async () => { for (const h of [{ "User-Agent": "Googlebot/2.1" }, { DNT: "1" }]) { const r = await req("/api/track", { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: '{"path":"/","vid":"visitor-aaaaaaaa"}' }); ok(r.status === 200, String(r.status)); } });
await t("public pages and their scripts contain none of the dashboard code", async () => {
  const MARK = /AnalyticsDashboard|api\/admin\/analytics|Erase this visitor|Visitors who contacted us/, seen = new Set();
  for (const p of ["/", "/portfolio", "/contact", "/ai-demos/ai-medical-imaging-analysis/app"]) { const html = await (await req(p)).text(); ok(!MARK.test(html), p); for (const s of [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1])) { if (seen.has(s)) continue; seen.add(s); ok(!MARK.test(await (await fetch(BASE + s)).text()), "marker in " + s); } }
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
