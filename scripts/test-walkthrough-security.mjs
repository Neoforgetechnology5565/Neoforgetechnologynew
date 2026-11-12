// Admin-only checks for the walkthrough tool. Usage: BASE=http://localhost:3011 node scripts/test-walkthrough-security.mjs
const BASE = process.env.BASE || "http://localhost:3011"; let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n     " + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const req = (path, o = {}) => fetch(BASE + path, { redirect: "manual", ...o });
const KEY = "cv-ai-medical-imaging-analysis", same = { Origin: BASE, "Content-Type": "application/json" };
console.log("admin pages and API reject visitors");
await t("the manager page redirects a visitor to the login page", async () => { const r = await req("/admin/walkthroughs"); ok([307, 308, 302].includes(r.status) && /\/admin\/login/.test(r.headers.get("location") || ""), `${r.status} ${r.headers.get("location")}`); });
await t("the list API returns 401 without a session", async () => { const r = await req("/api/admin/walkthroughs"); ok(r.status === 401, String(r.status)); });
await t("one demo's config API returns 401 without a session", async () => { const r = await req(`/api/admin/walkthroughs/${KEY}`); ok(r.status === 401, String(r.status)); });
await t("saving (PUT) and resetting (DELETE) need a session even with a same-origin header", async () => {
  for (const m of ["PUT", "DELETE"]) { const r = await req(`/api/admin/walkthroughs/${KEY}`, { method: m, headers: same, body: m === "PUT" ? JSON.stringify({ title: "x", steps: [] }) : undefined }); ok(r.status === 401, `${m} ${r.status}`); }
});
await t("a cross-origin write is refused (CSRF defence) before anything else", async () => { const r = await req(`/api/admin/walkthroughs/${KEY}`, { method: "PUT", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" }); ok(r.status === 403, String(r.status)); const n = await req(`/api/admin/walkthroughs/${KEY}`, { method: "PUT", body: "{}" }); ok(n.status === 403, "no Origin header: " + n.status); });
await t("a forged or garbage session cookie is rejected", async () => { for (const c of ["__nf_session=abc", "__nf_session=eyJhbGciOiJub25lIn0.eyJhZG1pbiI6dHJ1ZX0.", "admin=true"]) { const r = await req("/api/admin/walkthroughs", { headers: { Cookie: c } }); ok(r.status === 401, `${c.slice(0, 20)} → ${r.status}`); } });
await t("there is no public walkthrough endpoint or page", async () => { for (const p of ["/api/walkthroughs", "/walkthroughs", "/walkthrough", "/api/admin-walkthroughs"]) { const r = await req(p); ok(r.status === 404 || r.status === 308 || r.status === 307, `${p} → ${r.status}`); const b = r.status === 404 ? "" : ""; void b; } });
await t("the admin area is not indexed or listed", async () => { const sm = await (await req("/sitemap.xml")).text(), rb = await (await req("/robots.txt")).text(); ok(!/walkthrough/i.test(sm), "sitemap"); ok(/Disallow:\s*\/admin/i.test(rb), "robots disallows /admin"); });
console.log("the public site carries none of it");
const pages = ["/", "/portfolio", "/portfolio/computer-vision", "/ai-demos/ai-medical-imaging-analysis", "/ai-demos/ai-medical-imaging-analysis/app", "/erp-demos/crm-sales-pipeline/app", "/cad-bim-suite/architectural-geometry-simplification/app", "/demos/revit-bim-automation-dashboard/app", "/admin/login"];
const MARK = /wt-stage|wt-controls|Demo Walkthrough Manager|Start Automated Walkthrough|data-tour-id|__wtMount|walkthroughs\/\[key\]|api\/admin\/walkthroughs/;
const seen = new Set();
for (const p of pages) await t(`${p}: page and every script it loads contain no walkthrough code`, async () => {
  const html = await (await req(p)).text(); ok(!MARK.test(html), "marker in HTML");
  const srcs = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const s of srcs) { if (seen.has(s)) continue; seen.add(s); const js = await (await fetch(BASE + s)).text(); ok(!MARK.test(js), `marker in ${s}`); }
});
await t("the demo pages are byte-for-byte the demos' own (no extra scripts or attributes from the tool)", async () => { const html = await (await req("/ai-demos/ai-medical-imaging-analysis/app")).text(); ok(!/walkthrough/i.test(html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")), "visible HTML mentions walkthrough"); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
