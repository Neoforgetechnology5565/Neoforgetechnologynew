/**
 * What each tracking event changes. Pure functions: no I/O. `Counters` are nested maps whose number leaves are INCREMENTED in the database.
 * Per-visit breakdowns (region, city, device, source…) count once per visit (session), page views count every view.
 */
import { SESSION_GAP_MS, JOURNEY_MAX, CLICKLOG_MAX } from "./consts";
import { classifyPath, mapKey, pathKey } from "./pages";
import type { Geo } from "./geo";
import type { ClicksBody, ViewBody } from "./schema";
import type { Source } from "./source";
import type { Ua } from "./ua";

export type Counters = { [k: string]: number | Counters };
export type Visitor = Record<string, unknown> & { firstSeen?: number; lastSeen?: number; lastDay?: string; sid?: string; lastPath?: string; sessions?: number; pageViews?: number; clicks?: number; t?: number; journey?: { p: string; t: number }[]; clickLog?: { p: string; l: string; t: number }[] };

export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const pathOnly = (p: string) => p.split(/[?#]/)[0].slice(0, 120) || "/";

export interface ViewPlan { daily: Counters; totals: Counters; visitorSet: Record<string, unknown>; visitorInc: Record<string, number>; isNewVisitor: boolean; newSession: boolean; newDay: boolean }
export function planView(i: { body: ViewBody; geo: Geo; ua: Ua; source: Source; now: number; existing: Visitor | null }): ViewPlan {
  const { body, geo, ua, source, now, existing } = i, day = isoDay(now), path = pathOnly(body.path), pk = pathKey(path), page = classifyPath(path);
  const isNewVisitor = !existing;
  const newSession = !existing || (body.sid ? existing.sid !== body.sid : false) || now - (existing.lastSeen ?? existing.t ?? 0) > SESSION_GAP_MS;
  const newDay = !existing || existing.lastDay !== day;
  const cc = geo.country || "XX";

  const daily: Counters = { views: 1, pages: { [pk]: 1 }, countries: { [cc]: 1 } };
  if (newDay) { daily.visits = 1; daily.visitors = 1; }
  if (isNewVisitor) daily.newVisitors = 1;
  const project = page.kind === "project" ? page.key : body.project;
  if (project) daily.projects = { [mapKey(project.replaceAll("/", "~"))]: 1 };
  if (page.kind === "service") daily.services = { [mapKey(page.key)]: 1 };
  if (page.kind === "demo") daily.demos = { [mapKey(page.key.replaceAll("/", "~"))]: 1 };
  if (page.kind === "blog") daily.blogs = { [mapKey(page.key)]: 1 };
  if (existing && !newSession && existing.lastPath && existing.lastPath !== path) daily.flows = { [`${pathKey(existing.lastPath)}>${pk}`]: 1 };
  if (newSession) {
    daily.sessions = 1; daily.visitsByCountry = { [cc]: 1 }; daily.entries = { [pk]: 1 };
    daily.devices = { [ua.device]: 1 }; daily.browsers = { [mapKey(ua.browser)]: 1 }; daily.os = { [mapKey(ua.os)]: 1 };
    daily.channels = { [source.channel]: 1 }; daily.sources = { [mapKey(source.name.replace(/\./g, "~"))]: 1 };
    if (source.host) daily.referrers = { [mapKey(source.host.replaceAll(".", "_"))]: 1 };
    if (source.campaign) daily.campaigns = { [mapKey(source.campaign)]: 1 };
    if (geo.known && geo.region) daily.regions = { [`${cc}~${mapKey(geo.region)}`]: 1 };
    if (geo.known && geo.city) daily.cities = { [`${cc}~${mapKey(geo.region || "_")}~${mapKey(geo.city)}`]: 1 };
    const tz = body.tz || geo.ipTimezone; if (tz) daily.timezones = { [tz.replace(/[^A-Za-z0-9_+-]/g, "~")]: 1 };
  }
  const totals: Counters = { views: 1 };
  if (newDay) totals.visits = 1;
  if (isNewVisitor) totals.uniqueVisitors = 1;
  if (newSession) totals.sessions = 1;

  const set: Record<string, unknown> = { lastSeen: now, lastDay: day, lastPath: path, device: ua.device, browser: ua.browser, os: ua.os };
  if (body.sid) set.sid = body.sid;
  if (body.lang) set.lang = body.lang;
  if (body.tz) set.tz = body.tz;
  if (geo.known) Object.assign(set, { country: geo.country, region: geo.region, regionName: geo.regionName, city: geo.city, lat: geo.lat, lon: geo.lon, ipTimezone: geo.ipTimezone });
  if (isNewVisitor || existing.firstSeen === undefined) { set.firstSeen = existing?.t ?? now; }
  if (isNewVisitor) Object.assign(set, { landing: path, firstChannel: source.channel, firstSource: source.name, firstReferrer: source.host, firstCampaign: source.campaign });
  if (newSession) Object.assign(set, { lastChannel: source.channel, lastSource: source.name, lastReferrer: source.host, sessionStart: now });
  set.journey = [...(existing?.journey ?? []), { p: path, t: now }].slice(-JOURNEY_MAX);
  return { daily, totals, visitorSet: set, visitorInc: { pageViews: 1, ...(newSession ? { sessions: 1 } : {}) }, isNewVisitor, newSession, newDay };
}

const redact = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "").replace(/\+?\d[\d\s().-]{6,}\d/g, "").replace(/[\u0000-\u001f<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
export interface ClickPlan { daily: Counters; visitorSet: Record<string, unknown>; visitorInc: Record<string, number>; items: { l: string; k: string; h: string }[] }
export function planClicks(i: { body: ClicksBody; existing: Visitor | null; now: number }): ClickPlan {
  const path = pathOnly(i.body.path), pk = pathKey(path), items = i.body.items.map((x) => ({ l: redact(x.l), k: x.k, h: (x.h ?? "").replace(/[\u0000-\u001f\s<>|]/g, "").slice(0, 120) })).filter((x) => x.l);
  const clicks: Counters = {}; for (const x of items) { const k = `${pk}|${mapKey(x.l, 60)}|${x.k}`; clicks[k] = ((clicks[k] as number) ?? 0) + 1; }
  const daily: Counters = { clicks, clickEvents: items.length };
  const log = [...(i.existing?.clickLog ?? []), ...items.map((x) => ({ p: path, l: x.l, t: i.now }))].slice(-CLICKLOG_MAX);
  return { daily, visitorSet: i.existing ? { clickLog: log } : {}, visitorInc: i.existing ? { clicks: items.length } : {}, items };
}

export interface ConversionPlan { daily: Counters; visitorSet: Record<string, unknown>; snapshot: Record<string, unknown> }
export function planConversion(i: { existing: Visitor; inquiryId: string; now: number }): ConversionPlan {
  const v = i.existing, ch = String(v.firstChannel ?? "direct"), cc = String(v.country ?? "XX") || "XX";
  const firstSeen = (v.firstSeen ?? v.t ?? i.now) as number;
  return {
    daily: { inquiries: 1, inquiryChannels: { [ch]: 1 }, inquiryCountries: { [cc]: 1 } },
    visitorSet: { convertedAt: i.now, inquiryId: i.inquiryId },
    snapshot: { country: v.country ?? "", regionName: v.regionName ?? v.region ?? "", city: v.city ?? "", source: v.firstSource ?? "Direct", channel: ch, landing: v.landing ?? "", pages: ((v.pageViews as number) ?? 0), visits: ((v.sessions as number) ?? 1), device: v.device ?? "", firstSeen, daysToContact: Math.max(0, Math.floor((i.now - firstSeen) / 86400000)), approximate: true },
  };
}
