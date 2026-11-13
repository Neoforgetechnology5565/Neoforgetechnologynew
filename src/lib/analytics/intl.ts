/**
 * International inquiry statistics. These are anonymous aggregate counters built from what a person chose in the inquiry or
 * inquiry form (country, service, contact method): no name, email, phone or IP, and not tied to the statistics-consent cookie,
 * because the form data itself is already stored when someone writes to us.
 */
import { SERVICE_OPTIONS } from "../inquiry-options";
import { COL } from "./consts";
import { mapKey } from "./pages";
import { isoDay, type Counters } from "./plan";
import { withIncrements, type Db, type Inc } from "./process";

export interface InquiryStatsInput { country: string; service: string; intent: string; preferredContact: string; currency: string }
/** Stable counter key for a service (its position in the options list), because service names contain characters Firestore map keys cannot. */
export const serviceKey = (v: string) => { const n = SERVICE_OPTIONS.findIndex((o) => o.value === v); return n < 0 ? "none" : `svc${n}`; };
export const serviceLabel = (k: string) => SERVICE_OPTIONS[Number(k.slice(3))]?.value ?? "Not specified";
export function planInquiryStats(i: InquiryStatsInput): Counters {
  const cc = /^[A-Z]{2}$/.test(i.country) ? i.country : "XX";
  return { intlInquiries: 1, intlCountries: { [cc]: 1 }, intlServices: { [serviceKey(i.service)]: 1 }, intlIntents: { [i.intent === "quote" ? "quote" : "project"]: 1 }, intlMethods: { [mapKey(i.preferredContact || "email", 20)]: 1 }, intlCurrencies: { [mapKey(i.currency || "USD", 6)]: 1 } };
}
export async function recordStats(db: Db, inc: Inc, plan: Counters, now = Date.now()): Promise<void> {
  await db.collection(COL.daily).doc(isoDay(now)).set(withIncrements(plan, inc), { merge: true });
}

export interface ResponseStats { answered: number; unanswered: number; medianHours: number | null; within24hPct: number | null }
/** How quickly inquiries get a first emailed reply, from the inquiries' own timestamps (createdAt and replies[0].at). */
export function responseStats(items: { createdAt: number; replies?: { at: number }[] }[]): ResponseStats {
  const hrs = items.filter((i) => i.replies?.length).map((i) => Math.max(0, (Math.min(...i.replies!.map((r) => r.at)) - i.createdAt) / 3600_000)).sort((a, b) => a - b);
  const m = hrs.length ? (hrs.length % 2 ? hrs[(hrs.length - 1) / 2] : (hrs[hrs.length / 2 - 1] + hrs[hrs.length / 2]) / 2) : null;
  return { answered: hrs.length, unanswered: items.length - hrs.length, medianHours: m === null ? null : Math.round(m * 10) / 10, within24hPct: hrs.length ? Math.round((hrs.filter((h) => h <= 24).length / hrs.length) * 100) : null };
}
