/** Builds the admin dashboard's report from daily counter documents. Pure. */
import { serviceLabel } from "./intl";
import { countryName, regionName } from "./geo";
import { unPathKey } from "./pages";

type M = Record<string, number>;
export interface Row { key: string; label: string; n: number; sub?: string; n2?: number }
export interface Titles { service(slug: string): string; demo(key: string): string; project(key: string): string }
export interface Report {
  days: number; from: string; to: string; hasData: boolean;
  kpis: { visits: number; pageViews: number; pagesPerVisit: number; newVisitors: number; uniqueVisitorsAllTime: number; inquiries: number; conversionPct: number; clicks: number };
  series: { day: string; views: number; visits: number; inquiries: number }[];
  countries: Row[]; regions: Row[]; cities: Row[]; timezones: Row[];
  channels: Row[]; sources: Row[]; referrers: Row[]; campaigns: Row[];
  devices: Row[]; browsers: Row[]; os: Row[];
  pages: Row[]; entries: Row[]; flows: { from: string; to: string; n: number }[];
  services: Row[]; projects: Row[]; demos: Row[]; blogs: Row[];
  clicks: { path: string; label: string; kind: string; n: number }[];
  conversions: { total: number; channels: Row[]; countries: Row[] };
  /** Built from the inquiry and meeting forms themselves (country the person chose), so it does not depend on the statistics consent. */
  /** Added by the API route (needs the inquiries collection): first-reply times for inquiries received in the period */
  response?: { answered: number; unanswered: number; medianHours: number | null; within24hPct: number | null };
  international: { inquiries: number; meetings: number; countries: Row[]; meetingCountries: Row[]; services: Row[]; intents: Row[]; methods: Row[]; currencies: Row[]; meetingPurposes: Row[]; distinctCountries: number };
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const map = (v: unknown): M => (v && typeof v === "object" ? (v as M) : {});
const add = (acc: M, m: M) => { for (const [k, v] of Object.entries(m)) acc[k] = (acc[k] || 0) + num(v); };
const rows = (m: M, label: (k: string) => string, n = 12): Row[] => Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, label: label(k), n: v }));
const spaces = (s: string) => s.replace(/_/g, " ");

export function buildReport(days: { day: string; data: Record<string, unknown> | undefined }[], totals: Record<string, unknown> | undefined, titles: Titles): Report {
  const intl = { inquiries: 0, meetings: 0 }, acc: Record<string, M> = {}, get = (k: string) => (acc[k] ??= {}), sum = { views: 0, visits: 0, sessions: 0, newVisitors: 0, clicks: 0, inquiries: 0 };
  const series = days.map(({ day, data }) => {
    const d = data ?? {}; sum.views += num(d.views); sum.visits += num(d.visits); sum.sessions += num(d.sessions); sum.newVisitors += num(d.newVisitors); sum.clicks += num(d.clickEvents); sum.inquiries += num(d.inquiries); intl.inquiries += num(d.intlInquiries); intl.meetings += num(d.meetingRequests);
    for (const k of ["pages", "countries", "visitsByCountry", "regions", "cities", "timezones", "devices", "browsers", "os", "channels", "sources", "referrers", "campaigns", "entries", "flows", "services", "projects", "demos", "blogs", "clicks", "inquiryChannels", "inquiryCountries", "intlCountries", "intlServices", "intlIntents", "intlMethods", "intlCurrencies", "meetingCountries", "meetingPurposes"]) add(get(k), map(d[k]));
    return { day, views: num(d.views), visits: num(d.sessions) || num(d.visits), inquiries: num(d.inquiries) };
  });
  const visits = sum.sessions || sum.visits, a = (k: string) => get(k);
  const country = (cc: string) => (cc === "XX" ? "Unknown" : countryName(cc));
  const countryKeys = new Set([...Object.keys(a("visitsByCountry")), ...Object.keys(a("countries"))]);
  const countries: Row[] = [...countryKeys].map((cc) => ({ key: cc, label: country(cc), n: a("visitsByCountry")[cc] || 0, n2: a("countries")[cc] || 0 })).sort((x, y) => y.n - x.n || (y.n2 ?? 0) - (x.n2 ?? 0)).slice(0, 25);
  const regions = rows(a("regions"), (k) => { const [cc, r] = k.split("~"); return regionName(cc, r); }, 20).map((r) => ({ ...r, sub: country(r.key.split("~")[0]) }));
  const cities = rows(a("cities"), (k) => spaces(k.split("~")[2] ?? k), 20).map((r) => { const [cc, reg] = r.key.split("~"); return { ...r, sub: [reg && reg !== "_" ? regionName(cc, reg) : "", country(cc)].filter(Boolean).join(", ") }; });
  const clicks = Object.entries(a("clicks")).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, n]) => { const [p, l, kind] = k.split("|"); return { path: unPathKey(p), label: spaces(l ?? ""), kind: kind ?? "other", n }; });
  const flows = Object.entries(a("flows")).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, n]) => { const [f, t] = k.split(">"); return { from: unPathKey(f), to: unPathKey(t ?? "~"), n }; });
  const to = days.at(-1)?.day ?? "", from = days[0]?.day ?? "";
  return {
    days: days.length, from, to, hasData: sum.views > 0,
    kpis: { visits, pageViews: sum.views, pagesPerVisit: visits ? Math.round((sum.views / visits) * 10) / 10 : 0, newVisitors: sum.newVisitors, uniqueVisitorsAllTime: num(totals?.uniqueVisitors), inquiries: sum.inquiries, conversionPct: visits ? Math.round((sum.inquiries / visits) * 1000) / 10 : 0, clicks: sum.clicks },
    series, countries, regions, cities, timezones: rows(a("timezones"), (k) => k.replaceAll("~", "/"), 12),
    channels: rows(a("channels"), (k) => ({ direct: "Direct", search: "Search engines", social: "Social media", email: "Email", campaign: "Campaigns", referral: "Other websites" } as Record<string, string>)[k] ?? k),
    sources: rows(a("sources"), (k) => spaces(k).replace(/~/g, ".")), referrers: rows(a("referrers"), (k) => k.replace(/_/g, ".")), campaigns: rows(a("campaigns"), spaces),
    devices: rows(a("devices"), (k) => k[0].toUpperCase() + k.slice(1)), browsers: rows(a("browsers"), spaces), os: rows(a("os"), spaces),
    pages: rows(a("pages"), unPathKey, 15), entries: rows(a("entries"), unPathKey, 10), flows,
    services: rows(a("services"), (k) => titles.service(k)), projects: rows(a("projects"), (k) => titles.project(k)), demos: rows(a("demos"), (k) => titles.demo(k.replace("~", "/"))), blogs: rows(a("blogs"), (k) => k.replace(/-/g, " ")),
    international: { inquiries: intl.inquiries, meetings: intl.meetings, countries: rows(a("intlCountries"), country, 25), meetingCountries: rows(a("meetingCountries"), country, 25), services: rows(a("intlServices"), serviceLabel, 15), intents: rows(a("intlIntents"), (k) => (k === "quote" ? "Customised quotation" : "Project inquiry")), methods: rows(a("intlMethods"), (k) => ({ email: "Email", phone: "Phone call", whatsapp: "WhatsApp", video: "Video call" } as Record<string, string>)[k] ?? k), currencies: rows(a("intlCurrencies"), (k) => k), meetingPurposes: rows(a("meetingPurposes"), spaces), distinctCountries: Object.keys(a("intlCountries")).filter((k) => k !== "XX" && a("intlCountries")[k] > 0).length },
    clicks, conversions: { total: sum.inquiries, channels: rows(a("inquiryChannels"), (k) => k), countries: rows(a("inquiryCountries"), country) },
  };
}

export interface VisitorSummary { id: string; firstSeen: number; lastSeen: number; place: string; country: string; approximate: true; timezone: string; device: string; browser: string; os: string; source: string; channel: string; landing: string; pages: number; visits: number; clicks: number; converted: boolean; convertedAt: number | null; inquiryId: string }
export function summarizeVisitor(id: string, v: Record<string, unknown>, place: string): VisitorSummary {
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : ""), n = (k: string) => num(v[k]);
  return { id, firstSeen: n("firstSeen") || n("t"), lastSeen: n("lastSeen") || n("t"), place, country: s("country"), approximate: true, timezone: s("tz") || s("ipTimezone"), device: s("device"), browser: s("browser"), os: s("os"), source: s("firstSource") || "Direct", channel: s("firstChannel") || "direct", landing: s("landing"), pages: n("pageViews"), visits: n("sessions"), clicks: n("clicks"), converted: n("convertedAt") > 0, convertedAt: n("convertedAt") || null, inquiryId: s("inquiryId") };
}
