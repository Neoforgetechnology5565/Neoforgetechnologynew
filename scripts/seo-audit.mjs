// Technical SEO audit (a small, scriptable stand-in for the checks a Screaming Frog crawl does): crawls the sitemap and internal links.
// Usage: BASE=http://localhost:3011 node scripts/seo-audit.mjs   Exit code 1 when problems are found.
const BASE = (process.env.BASE || "http://localhost:3011").replace(/\/$/, "");
const get = async (u) => { const r = await fetch(u, { redirect: "manual" }); return { status: r.status, loc: r.headers.get("location"), robots: r.headers.get("x-robots-tag") || "", body: r.status === 200 && /text\/(html|plain|xml)|application\/xml/.test(r.headers.get("content-type") || "") ? await r.text() : "" }; };
const tag = (h, re) => (h.match(re) || [])[1]?.trim() ?? "";
const sm = await get(BASE + "/sitemap.xml"); const urls = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const seen = new Map(), queue = [...new Set(["/", ...urls])], problems = [], redirects = [];
const norm = (h) => { try { const u = new URL(h, BASE + "/"); return u.origin === new URL(BASE).origin || u.hostname === "www.neoforgetechnologies.com" ? u.pathname.replace(/(.)\/$/, "$1") : null; } catch { return null; } };
while (queue.length && seen.size < 400) {
  const p = queue.shift(); if (seen.has(p)) continue; if (/^\/(admin|api|_next)/.test(p)) continue;
  const r = await get(BASE + p); seen.set(p, r);
  if (r.status >= 300 && r.status < 400) { redirects.push([p, r.status, r.loc]); const n = r.loc && norm(r.loc); if (n && !seen.has(n)) queue.push(n); continue; }
  if (r.status !== 200) { problems.push(`${p}: HTTP ${r.status}`); continue; }
  if (!r.body.includes("<html")) continue;
  for (const m of r.body.matchAll(/<a [^>]*href="([^"#]+)[^"]*"/g)) { const n = norm(m[1]); if (n && !seen.has(n) && !queue.includes(n) && !/\.(png|jpe?g|webp|pdf|svg|zip|ico|xml|json|mp4)$/i.test(n)) queue.push(n); }
}
const meta = new Map(); let pages = 0;
for (const [p, r] of seen) {
  if (r.status !== 200 || !r.body.includes("<html")) continue; pages++;
  const title = tag(r.body, /<title[^>]*>([^<]*)<\/title>/), desc = tag(r.body, /<meta name="description" content="([^"]*)"/), canon = tag(r.body, /<link rel="canonical" href="([^"]*)"/), robots = tag(r.body, /<meta name="robots" content="([^"]*)"/), h1 = [...r.body.matchAll(/<h1[ >]/g)].length;
  const imgs = [...r.body.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]), noAlt = imgs.filter((i) => !/\balt="/.test(i)).length;
  const priv = /^\/(admin|live-chat)/.test(p) || /noindex/i.test(robots + r.robots); // pages kept out of search are not held to the metadata rules
  if (!title) problems.push(`${p}: missing <title>`); else if (title.length > 70 && !priv) problems.push(`${p}: title ${title.length} chars`);
  if (!desc && !priv) problems.push(`${p}: missing meta description`); else if (desc.length > 170) problems.push(`${p}: description ${desc.length} chars`);
  if (!canon && !priv) problems.push(`${p}: missing canonical`); if (h1 !== 1 && !priv) problems.push(`${p}: ${h1} <h1> elements`); if (noAlt) problems.push(`${p}: ${noAlt} image(s) without alt attribute`);
  if (/noindex/i.test(robots + r.robots) && urls.includes(p)) problems.push(`${p}: in sitemap but noindex`);
  for (const [k, v] of [["title", title], ["description", desc]]) if (v && !priv) { const key = k + "|" + v; meta.set(key, [...(meta.get(key) || []), p]); }
}
for (const [k, ps] of meta) if (ps.length > 1) problems.push(`duplicate ${k.split("|")[0]} on ${ps.join(", ")}`);
for (const u of urls) if (seen.get(u)?.status !== 200) problems.push(`sitemap URL ${u} returned ${seen.get(u)?.status}`);
const robots = await get(BASE + "/robots.txt"); if (!/Sitemap:/i.test(robots.body)) problems.push("robots.txt has no Sitemap line");
for (const s of ["/services", "/computer-vision-development", "/ai-development", "/cctv-analytics", "/anpr-software", "/3d-reconstruction", "/cad-bim-development", "/crm-erp-development", "/medical-imaging-ai"]) { if (!urls.includes(s)) problems.push(`${s} missing from sitemap`); }
const hub = seen.get("/services")?.body || ""; for (const s of ["/computer-vision-development", "/ai-development", "/cctv-analytics", "/anpr-software", "/3d-reconstruction", "/cad-bim-development", "/crm-erp-development", "/medical-imaging-ai"]) if (!hub.includes(`href="${s}"`)) problems.push(`/services does not link to ${s}`);
console.log(`crawled ${seen.size} URLs (${pages} HTML pages), ${urls.length} in sitemap, ${redirects.length} redirects`); for (const [a, c, l] of redirects.slice(0, 15)) console.log(`  redirect ${a} -> ${c} ${l}`);
console.log(problems.length ? problems.map((x) => "  ✗ " + x).join("\n") + `\n${problems.length} problem(s)` : "no problems found"); process.exit(problems.length ? 1 : 0);
