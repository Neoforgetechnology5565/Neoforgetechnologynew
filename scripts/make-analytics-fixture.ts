// Builds a realistic multi-visitor dataset through the REAL tracking code (processTrack, recordConversion) and the real report builder.
// Output: JSON for the dashboard UI test. Usage: npx tsx scripts/make-analytics-fixture.ts > /tmp/analytics-fixture.json
import { buildReport, summarizeVisitor } from "../src/lib/analytics/aggregate";
import { placeName } from "../src/lib/analytics/geo";
import { processTrack, recordConversion } from "../src/lib/analytics/process";
import { fakeDb, fakeInc, hdr } from "../src/lib/analytics/testing";

const db = fakeDb(), NOW = Date.now(), DAY = 86400000, MIN = 60000;
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296), pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const geo = (cc: string, region: string, city: string, lat: string, lon: string, tz: string) => hdr({ "x-vercel-ip-country": cc, "x-vercel-ip-country-region": region, "x-vercel-ip-city": encodeURIComponent(city), "x-vercel-ip-latitude": lat, "x-vercel-ip-longitude": lon, "x-vercel-ip-timezone": tz });
const PLACES = [geo("US", "CA", "Los Angeles", "34.05", "-118.24", "America/Los_Angeles"), geo("US", "TX", "Austin", "30.27", "-97.74", "America/Chicago"), geo("US", "NY", "New York", "40.71", "-74.0", "America/New_York"), geo("GB", "ENG", "London", "51.5", "-0.12", "Europe/London"), geo("GB", "SCT", "Edinburgh", "55.95", "-3.19", "Europe/London"), geo("DE", "BE", "Berlin", "52.52", "13.4", "Europe/Berlin"), geo("NG", "LA", "Lagos", "6.52", "3.37", "Africa/Lagos"), geo("IN", "MH", "Mumbai", "19.07", "72.87", "Asia/Kolkata"), geo("AU", "NSW", "Sydney", "-33.87", "151.2", "Australia/Sydney"), hdr({})];
const UAS = ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36", "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0", "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"];
const REFS: [string | undefined, { s?: string; m?: string; c?: string } | undefined][] = [["https://www.google.com", undefined], ["https://www.google.com", undefined], ["https://www.bing.com", undefined], ["https://www.linkedin.com", undefined], ["https://l.facebook.com", undefined], ["https://l.instagram.com", undefined], ["https://www.fiverr.com", undefined], [undefined, undefined], [undefined, undefined], [undefined, { s: "newsletter", m: "email", c: "spring-launch" }]];
const PAGES = ["/", "/services", "/services/revit-plugin-development", "/services/ifc-data-validation-tool", "/portfolio", "/portfolio/computer-vision", "/ai-demos/ai-medical-imaging-analysis", "/ai-demos/ai-animal-detection-smart-farming", "/erp-demos/crm-sales-pipeline", "/cad-bim-suite/architectural-geometry-simplification/app", "/pricing", "/about", "/contact", "/blog"];
const LABELS: [string, "link" | "button", string][] = [["Request a quote", "link", "/contact"], ["View portfolio", "link", "/portfolio"], ["See the demo", "link", "/ai-demos/ai-medical-imaging-analysis"], ["Services", "link", "/services"], ["Contact", "link", "/contact"], ["Open menu", "button", ""], ["Visit on LinkedIn", "link", "www.linkedin.com"]];
async function main() {
const visitors: string[] = [], contacted: string[] = [];
for (let i = 0; i < 40; i++) {
  const vid = `vis${String(i).padStart(2, "0")}-${Math.floor(rnd() * 1e9).toString(36)}-aaaa`, place = PLACES[i % PLACES.length], ua = pick(UAS), ref = pick(REFS), sessions = 1 + Math.floor(rnd() * 3);
  visitors.push(vid);
  for (let s = 0; s < sessions; s++) {
    let t = NOW - Math.floor(rnd() * 12) * DAY - Math.floor(rnd() * 600) * MIN - s * 3 * DAY; const sid = `sess-${i}-${s}`, n = 1 + Math.floor(rnd() * 5);
    for (let p = 0; p < n; p++) { await processTrack({ db, inc: fakeInc, headers: place, ua, selfHosts: ["neoforge.example"], now: t, body: { path: p === 0 ? pick(PAGES.slice(0, 8)) : pick(PAGES), vid, sid, ...(p === 0 && s === 0 ? { ref: ref[0], utm: ref[1] } : {}), tz: "UTC", lang: "en-GB" } }); t += (1 + Math.floor(rnd() * 3)) * MIN; }
    if (rnd() < 0.7) { const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => { const [l, k, h] = pick(LABELS); return { l, k, ...(h ? { h } : {}) }; }); await processTrack({ db, inc: fakeInc, headers: place, ua, selfHosts: [], now: t, body: { type: "clicks", vid, sid, path: "/", items } }); }
  }
  if (i % 9 === 4) { await recordConversion(db, fakeInc, { vid, inquiryId: `inq-${i}`, now: NOW - Math.floor(rnd() * 2) * DAY }); contacted.push(vid); }
}
const daily = db.all.get("analytics_daily")!, totals = db.all.get("analytics_totals")!.get("all");
const titles = { service: (s: string) => ({ "revit-plugin-development": "Revit Plugin Development", "ifc-data-validation-tool": "IFC Data Validation" } as Record<string, string>)[s] ?? s, demo: (k: string) => ({ "ai-demos/ai-medical-imaging-analysis": "Medical Imaging AI & Analysis", "ai-demos/ai-animal-detection-smart-farming": "Animal Detection & Monitoring for Smart Farming", "erp-demos/crm-sales-pipeline": "CRM & Sales Pipeline Management", "cad-bim-suite/architectural-geometry-simplification": "Architectural Geometry Intelligence" } as Record<string, string>)[k] ?? k, project: (k: string) => k };
const report = (n: number) => buildReport(Array.from({ length: n }, (_, i) => { const d = new Date(NOW - (n - 1 - i) * DAY).toISOString().slice(0, 10); return { day: d, data: daily.get(d) }; }), totals, titles);
const vdocs = db.all.get("analytics_visitors")!, sum = (id: string) => { const v = vdocs.get(id)!; return summarizeVisitor(id, v, placeName({ country: String(v.country ?? ""), regionName: String(v.regionName ?? ""), region: String(v.region ?? ""), city: String(v.city ?? "") })); };
const all = [...vdocs.keys()].map(sum).sort((a, b) => b.lastSeen - a.lastSeen), con = all.filter((v) => v.converted).sort((a, b) => (b.convertedAt ?? 0) - (a.convertedAt ?? 0));
const details = Object.fromEntries(all.map((v) => [v.id, { ...v, journey: vdocs.get(v.id)!.journey ?? [], clickLog: vdocs.get(v.id)!.clickLog ?? [], language: "en-GB", ipTimezone: String(vdocs.get(v.id)!.ipTimezone ?? "") }]));
console.log(JSON.stringify({ reports: { 7: report(7), 30: report(30), 90: report(90) }, visitors: all, contacted: con, details, stored: JSON.stringify([...db.all.values()].map((m) => [...m.values()])) }));
}
main().catch((e) => { console.error(e); process.exit(1); });
