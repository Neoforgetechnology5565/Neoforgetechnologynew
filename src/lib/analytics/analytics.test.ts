import assert from "node:assert/strict";
import { buildReport, summarizeVisitor } from "./aggregate";
import { geoFromHeaders, placeName, regionName, countryName } from "./geo";
import { classifyPath, mapKey, pathKey, unPathKey } from "./pages";
import { deleteVisitor, processTrack, pruneVisitors, recordConversion } from "./process";
import { fakeDb, fakeInc, hdr } from "./testing";
import { clicksSchema, viewSchema } from "./schema";
import { classifySource } from "./source";
import { parseUa } from "./ua";

/* ---------- user agent ---------- */
const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
};
assert.deepEqual(parseUa(UA.chromeWin), { device: "desktop", browser: "Chrome", os: "Windows" });
assert.deepEqual(parseUa(UA.edge), { device: "desktop", browser: "Edge", os: "Windows" });
assert.deepEqual(parseUa(UA.iphone), { device: "mobile", browser: "Safari", os: "iOS" });
assert.deepEqual(parseUa(UA.ipad), { device: "tablet", browser: "Safari", os: "iOS" });
assert.deepEqual(parseUa(UA.androidPhone), { device: "mobile", browser: "Chrome", os: "Android" });
assert.equal(parseUa(UA.androidTablet).device, "tablet");
assert.deepEqual(parseUa(UA.firefoxLinux), { device: "desktop", browser: "Firefox", os: "Linux" });
assert.deepEqual(parseUa(UA.macSafari), { device: "desktop", browser: "Safari", os: "macOS" });
assert.equal(parseUa(UA.samsung).browser, "Samsung Internet"); assert.deepEqual(parseUa(""), { device: "desktop", browser: "Other", os: "Other" });

/* ---------- traffic source ---------- */
const SELF = ["neoforge.example", "www.neoforge.example"];
assert.deepEqual(classifySource({ referrer: "https://www.google.com/" }, SELF), { channel: "search", name: "Google", host: "google.com", campaign: "" });
assert.equal(classifySource({ referrer: "https://www.google.co.uk" }, SELF).name, "Google"); assert.equal(classifySource({ referrer: "https://duckduckgo.com" }).name, "DuckDuckGo");
assert.deepEqual([classifySource({ referrer: "https://l.facebook.com/" }).channel, classifySource({ referrer: "https://l.facebook.com/" }).name], ["social", "Facebook"]);
assert.equal(classifySource({ referrer: "https://www.instagram.com/" }).name, "Instagram"); assert.equal(classifySource({ referrer: "https://www.linkedin.com/feed" }).name, "LinkedIn"); assert.equal(classifySource({ referrer: "https://t.co/abc" }).name, "X");
assert.deepEqual(classifySource({ referrer: "https://www.fiverr.com/someone" }), { channel: "referral", name: "fiverr.com", host: "fiverr.com", campaign: "" });
assert.equal(classifySource({ referrer: "https://neoforge.example/portfolio" }, SELF).channel, "direct", "own site is not a source"); assert.equal(classifySource({ referrer: "https://www.neoforge.example/" }, SELF).channel, "direct");
assert.equal(classifySource({}, SELF).channel, "direct"); assert.equal(classifySource({ referrer: "not a url ::::" }, SELF).channel, "direct");
assert.deepEqual(classifySource({ utmSource: "newsletter", utmMedium: "email", utmCampaign: "spring" }), { channel: "email", name: "newsletter", host: "", campaign: "spring" });
assert.equal(classifySource({ utmSource: "facebook", utmMedium: "cpc" }).channel, "campaign", "paid is a campaign"); assert.equal(classifySource({ utmSource: "linkedin", utmMedium: "social" }).channel, "social");
assert.equal(classifySource({ utmSource: "<script>alert(1)</script>" }).name.includes("<"), false, "utm values are cleaned");

/* ---------- approximate location ---------- */
const la = geoFromHeaders(hdr({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "x-vercel-ip-city": "Los%20Angeles", "x-vercel-ip-latitude": "34.0522", "x-vercel-ip-longitude": "-118.2437", "x-vercel-ip-timezone": "America/Los_Angeles" }));
assert.deepEqual(la, { country: "US", region: "CA", regionName: "California", city: "Los Angeles", lat: 34.1, lon: -118.2, ipTimezone: "America/Los_Angeles", known: true }, "coordinates are rounded to 0.1 degree (~11 km)");
assert.equal(placeName(la), "Los Angeles, California, United States");
for (const h of [{}, { "x-vercel-ip-country": "XX" }, { "x-vercel-ip-country": "T1" }, { "x-vercel-ip-country": "zzz" }]) { const g = geoFromHeaders(hdr(h as Record<string, string>)); assert.equal(g.known, false); assert.equal(placeName(g), "Unknown"); assert.equal(g.city, ""); assert.equal(g.lat, null); }
assert.equal(geoFromHeaders(hdr({ "x-vercel-ip-country": "GB", "x-vercel-ip-country-region": "ENG", "x-vercel-ip-city": "London" })).regionName, "England");
assert.equal(geoFromHeaders(hdr({ "x-vercel-ip-country": "NG", "x-vercel-ip-country-region": "LA", "x-vercel-ip-city": "Lagos" })).regionName, "LA", "unknown region names fall back to the code");
assert.equal(geoFromHeaders(hdr({ "x-vercel-ip-country": "DE", "x-vercel-ip-timezone": "Europe/Berlin; DROP" })).ipTimezone, "", "bad timezone dropped"); assert.equal(geoFromHeaders(hdr({ "x-vercel-ip-country": "DE", "x-vercel-ip-city": "%E0%A4%A" })).city, "", "bad encoding handled");
assert.equal(geoFromHeaders(hdr({ "x-vercel-ip-country": "FR", "x-vercel-ip-city": "<b>Paris</b>" })).city, "bParis/b");
assert.equal(regionName("CA", "ON"), "Ontario"); assert.equal(countryName("GB"), "United Kingdom"); assert.equal(countryName("XX"), "Unknown");

/* ---------- pages and keys ---------- */
assert.deepEqual(classifyPath("/services/revit-plugin-development"), { kind: "service", key: "revit-plugin-development" });
assert.deepEqual(classifyPath("/ai-demos/ai-medical-imaging-analysis/app"), { kind: "demo", key: "ai-demos/ai-medical-imaging-analysis" });
assert.deepEqual(classifyPath("/erp-demos/crm-sales-pipeline"), { kind: "demo", key: "erp-demos/crm-sales-pipeline" });
assert.deepEqual(classifyPath("/portfolio/computer-vision/ppe-monitoring"), { kind: "project", key: "computer-vision/ppe-monitoring" }); assert.deepEqual(classifyPath("/cad-bim/structural/some-project"), { kind: "project", key: "cad-bim/some-project" });
assert.deepEqual(classifyPath("/blog/a-post?x=1"), { kind: "blog", key: "a-post" }); assert.deepEqual(classifyPath("/"), { kind: "page", key: "/" }); assert.deepEqual(classifyPath("/pricing/"), { kind: "page", key: "/pricing" });
assert.equal(unPathKey(pathKey("/services/x")), "/services/x"); assert.equal(pathKey("/"), "~"); assert.equal(mapKey("Request a quote!"), "Request_a_quote"); assert.equal(mapKey(""), "_");

/* ---------- payload validation ---------- */
const vid = "v-aaaaaaaa1111";
assert.ok(viewSchema.safeParse({ path: "/", vid }).success); assert.ok(!viewSchema.safeParse({ path: "/admin/x", vid }).success); assert.ok(!viewSchema.safeParse({ path: "/api/x", vid }).success); assert.ok(!viewSchema.safeParse({ path: "//evil.com", vid }).success); assert.ok(!viewSchema.safeParse({ path: "/", vid: "short" }).success);
assert.ok(!viewSchema.safeParse({ path: "/", vid, tz: "Europe/Berlin; x" }).success); assert.ok(!clicksSchema.safeParse({ type: "clicks", vid, path: "/", items: [] }).success); assert.ok(!clicksSchema.safeParse({ type: "clicks", vid, path: "/", items: Array.from({ length: 21 }, () => ({ l: "x", k: "link" })) }).success);

/* ---------- in-memory store ---------- */
const inc = fakeInc;
async function main() {
const geo = (cc: string, region: string, city: string, lat: string, lon: string, tz: string) => hdr({ "x-vercel-ip-country": cc, "x-vercel-ip-country-region": region, "x-vercel-ip-city": encodeURIComponent(city), "x-vercel-ip-latitude": lat, "x-vercel-ip-longitude": lon, "x-vercel-ip-timezone": tz });
const T0 = Date.UTC(2026, 10, 14, 10, 0, 0), MIN = 60_000, DAY = 86400000;
const db = fakeDb(), run = (b: unknown, ua: string, h: ReturnType<typeof hdr>, now: number) => processTrack({ db, inc, headers: h, body: b, ua, selfHosts: SELF, now });
const A = "visitor-aaaaaaaa", B = "visitor-bbbbbbbb", C = "visitor-cccccccc", LAH = geo("US", "CA", "Los Angeles", "34.0522", "-118.2437", "America/Los_Angeles"), LON = geo("GB", "ENG", "London", "51.5072", "-0.1276", "Europe/London");

// Visitor A: Google search -> home -> a service -> a portfolio project -> clicks -> contacts us
assert.equal(await run({ path: "/", vid: A, sid: "sess-a1", ref: "https://www.google.com", tz: "America/Los_Angeles", lang: "en-US" }, UA.chromeWin, LAH, T0), "view");
await run({ path: "/services/revit-plugin-development", vid: A, sid: "sess-a1", tz: "America/Los_Angeles" }, UA.chromeWin, LAH, T0 + 1 * MIN);
await run({ path: "/portfolio/computer-vision/ppe-monitoring", vid: A, sid: "sess-a1" }, UA.chromeWin, LAH, T0 + 2 * MIN);
assert.equal(await run({ type: "clicks", vid: A, sid: "sess-a1", path: "/portfolio/computer-vision/ppe-monitoring", items: [{ l: "Request a quote", k: "link", h: "/contact" }, { l: "Email jane.doe@example.com now", k: "button" }, { l: "Call +1 (555) 123-4567", k: "link", h: "tel:" }] }, UA.chromeWin, LAH, T0 + 3 * MIN), "clicks");
const snap = await recordConversion(db, inc, { vid: A, inquiryId: "inq1", now: T0 + 6 * MIN });
// Visitor B: Facebook -> home; returns 45 minutes later (a new visit) and opens a demo
await run({ path: "/", vid: B, sid: "sess-b1", ref: "https://l.facebook.com/", tz: "Europe/London" }, UA.iphone, LON, T0 + 10 * MIN);
await run({ path: "/ai-demos/ai-medical-imaging-analysis/app", vid: B, sid: "sess-b2", tz: "Europe/London" }, UA.iphone, LON, T0 + 60 * MIN);
// Visitor C: no location headers, direct
await run({ path: "/pricing", vid: C, sid: "sess-c1" }, UA.firefoxLinux, hdr({}), T0 + 12 * MIN);
// invalid and out-of-scope payloads are ignored
assert.equal(await run({ path: "/admin/analytics", vid: C }, UA.chromeWin, LAH, T0), "ignored"); assert.equal(await run({ nonsense: 1 }, UA.chromeWin, LAH, T0), "ignored"); assert.equal(await run({ type: "clicks", vid: C, path: "/", items: [{ l: "a@b.co", k: "link" }] }, UA.chromeWin, LAH, T0), "ignored", "a label that is only an email is dropped");

const day = db.all.get("analytics_daily")!.get("2026-11-14")!, V = (id: string) => db.all.get("analytics_visitors")!.get(id)!, tot = db.all.get("analytics_totals")!.get("all")!;
assert.equal(day.views, 6); assert.equal(day.sessions, 4, "A, B (two visits) and C"); assert.equal(day.visitors, 3); assert.equal(day.newVisitors, 3); assert.equal(tot.uniqueVisitors, 3); assert.equal(tot.sessions, 4);
assert.deepEqual(day.visitsByCountry, { US: 1, GB: 2, XX: 1 }); assert.deepEqual(day.countries, { US: 3, GB: 2, XX: 1 }, "views by country keep the old meaning");
assert.deepEqual(day.regions, { "US~CA": 1, "GB~ENG": 2 }); assert.deepEqual(day.cities, { "US~CA~Los_Angeles": 1, "GB~ENG~London": 2 }); assert.deepEqual(day.devices, { desktop: 2, mobile: 2 }); assert.deepEqual(day.channels, { search: 1, social: 1, direct: 2 });
assert.deepEqual(day.sources, { Google: 1, Facebook: 1, Direct: 2 }); assert.deepEqual(day.referrers, { google_com: 1, "l_facebook_com": 1 }); assert.deepEqual(day.timezones, { "America~Los_Angeles": 1, "Europe~London": 2 });
assert.deepEqual(day.entries, { "~": 2, "~ai-demos~ai-medical-imaging-analysis~app": 1, "~pricing": 1 }); assert.deepEqual(day.flows, { "~>~services~revit-plugin-development": 1, "~services~revit-plugin-development>~portfolio~computer-vision~ppe-monitoring": 1 }, "navigation within a visit; a new visit does not link to the previous page");
assert.deepEqual(day.services, { "revit-plugin-development": 1 }); assert.deepEqual(day.demos, { "ai-demos~ai-medical-imaging-analysis": 1 }); assert.deepEqual(day.projects, { "computer-vision~ppe-monitoring": 1 });
assert.equal(day.clickEvents, 3); assert.deepEqual(day.clicks, { "~portfolio~computer-vision~ppe-monitoring|Request_a_quote|link": 1, "~portfolio~computer-vision~ppe-monitoring|Email_now|button": 1, "~portfolio~computer-vision~ppe-monitoring|Call|link": 1 }, "email and phone are removed from click labels");
assert.equal(day.inquiries, 1); assert.deepEqual(day.inquiryChannels, { search: 1 }); assert.deepEqual(day.inquiryCountries, { US: 1 });

const a = V(A), b = V(B), c = V(C);
assert.equal(a.pageViews, 3); assert.equal(a.sessions, 1); assert.equal(a.firstSource, "Google"); assert.equal(a.landing, "/"); assert.equal(a.country, "US"); assert.equal(a.regionName, "California"); assert.equal(a.city, "Los Angeles"); assert.equal(a.lat, 34.1); assert.equal(a.tz, "America/Los_Angeles"); assert.equal(a.firstSeen, T0); assert.equal(a.lastSeen, T0 + 2 * MIN); assert.equal(a.clicks, 3);
assert.deepEqual((a.journey as { p: string }[]).map((j) => j.p), ["/", "/services/revit-plugin-development", "/portfolio/computer-vision/ppe-monitoring"]); assert.equal((a.clickLog as unknown[]).length, 3);
assert.equal(a.convertedAt, T0 + 6 * MIN); assert.equal(a.inquiryId, "inq1"); assert.deepEqual(snap, { country: "US", regionName: "California", city: "Los Angeles", source: "Google", channel: "search", landing: "/", pages: 3, visits: 1, device: "desktop", firstSeen: T0, daysToContact: 0, approximate: true });
assert.equal(b.sessions, 2); assert.equal(b.pageViews, 2); assert.equal(b.firstSource, "Facebook"); assert.equal(b.firstChannel, "social"); assert.equal(b.lastChannel, "direct"); assert.equal(b.device, "mobile"); assert.equal(b.browser, "Safari"); assert.equal(b.os, "iOS");
assert.equal(c.country, undefined, "no location headers: nothing guessed"); assert.equal(summarizeVisitor(C, c, placeName({ country: String(c.country ?? "") })).place, "Unknown");
assert.equal(await recordConversion(db, inc, { vid: "visitor-unknown1", inquiryId: "x" }), null, "an unknown visitor is not linked"); assert.equal(await recordConversion(db, inc, { vid: "bad", inquiryId: "x" }), null);

// privacy: nothing identifying is stored
const dump = JSON.stringify([...db.all.values()].map((m) => [...m.values()]));
assert.ok(!/Mozilla|AppleWebKit|Gecko/.test(dump), "no raw user agent"); assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(dump), "no IP address"); assert.ok(!/jane\.doe|example\.com|555/.test(dump), "no email or phone from click labels"); assert.ok(!/34\.0522|118\.2437|51\.5072/.test(dump), "no precise coordinates");
assert.ok(!/google\.com\/|facebook\.com\/(?!$)/.test(JSON.stringify([...db.all.get("analytics_visitors")!.values()])), "only the referrer host is kept, never a full URL");

/* ---------- report ---------- */
const days = ["2026-11-13", "2026-11-14", "2026-11-15"].map((d) => ({ day: d, data: db.all.get("analytics_daily")!.get(d) }));
const titles = { service: (s: string) => s === "revit-plugin-development" ? "Revit Plugin Development" : s, demo: (k: string) => k === "ai-demos/ai-medical-imaging-analysis" ? "Medical Imaging AI & Analysis" : k, project: (k: string) => k };
const r = buildReport(days, tot, titles);
assert.equal(r.hasData, true); assert.equal(r.kpis.visits, 4); assert.equal(r.kpis.pageViews, 6); assert.equal(r.kpis.pagesPerVisit, 1.5); assert.equal(r.kpis.inquiries, 1); assert.equal(r.kpis.conversionPct, 25); assert.equal(r.kpis.newVisitors, 3); assert.equal(r.kpis.uniqueVisitorsAllTime, 3); assert.equal(r.kpis.clicks, 3);
assert.deepEqual(r.countries.map((x) => [x.label, x.n, x.n2]), [["United Kingdom", 2, 2], ["United States", 1, 3], ["Unknown", 1, 1]]);
assert.deepEqual(r.regions.map((x) => [x.label, x.sub, x.n]), [["England", "United Kingdom", 2], ["California", "United States", 1]]); assert.deepEqual(r.cities.map((x) => [x.label, x.sub, x.n]), [["London", "England, United Kingdom", 2], ["Los Angeles", "California, United States", 1]]);
assert.deepEqual(r.channels.map((x) => [x.label, x.n]), [["Direct", 2], ["Search engines", 1], ["Social media", 1]]); assert.deepEqual(r.sources.map((x) => x.label).sort(), ["Direct", "Facebook", "Google"]); assert.deepEqual(r.referrers.map((x) => x.label).sort(), ["google.com", "l.facebook.com"]);
assert.deepEqual(r.devices.map((x) => [x.label, x.n]).sort(), [["Desktop", 2], ["Mobile", 2]]); assert.deepEqual(r.services, [{ key: "revit-plugin-development", label: "Revit Plugin Development", n: 1 }]); assert.equal(r.demos[0].label, "Medical Imaging AI & Analysis");
assert.deepEqual(r.flows[0], { from: "/", to: "/services/revit-plugin-development", n: 1 }); assert.equal(r.clicks[0].path, "/portfolio/computer-vision/ppe-monitoring"); assert.ok(r.clicks.some((x) => x.label === "Request a quote" && x.kind === "link")); assert.ok(r.clicks.some((x) => x.label === "Email now"));
assert.deepEqual(r.conversions.channels.map((x) => [x.label, x.n]), [["search", 1]]); assert.equal(r.conversions.countries[0].label, "United States"); assert.deepEqual(r.series.map((s) => s.views), [0, 6, 0]); assert.equal(buildReport([], undefined, titles).hasData, false);

// a referring website keeps its dot in the label
{ const ref = classifySource({ referrer: "https://www.fiverr.com/x" }); const d = { views: 1, sessions: 1, sources: { [ref.name.replace(/\./g, "~")]: 2 } }; assert.equal(buildReport([{ day: "2026-11-14", data: d }], undefined, titles).sources[0].label, "fiverr.com"); }
/* ---------- erase and retention ---------- */
await deleteVisitor(db, C); assert.equal(db.all.get("analytics_visitors")!.has(C), false);
await processTrack({ db, inc, headers: LAH, body: { path: "/", vid: "visitor-oldoldol" }, ua: UA.chromeWin, selfHosts: SELF, now: T0 - 200 * DAY });
assert.equal(await pruneVisitors(db, T0), 1, "a visitor not seen for more than 180 days is removed"); assert.equal(db.all.get("analytics_visitors")!.has("visitor-oldoldol"), false); assert.ok(db.all.get("analytics_visitors")!.has(A), "recent visitors stay");
console.log("analytics: all tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
