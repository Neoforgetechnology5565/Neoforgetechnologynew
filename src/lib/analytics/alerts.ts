/**
 * "Someone is on your website" alerts. A new visit (the first page of a visit by a visitor who accepted statistics) can notify you by email
 * and/or a push notification to your own devices, even when you are not logged in or the admin is closed. Throttled so a busy day cannot flood you.
 */
import { z } from "zod";
import type { Db } from "./process";

export interface AlertSettings { enabled: boolean; email: boolean; push: boolean; minGapMinutes: number; newVisitorsOnly: boolean; lastAlertAt?: number; pending?: number }
export const DEFAULT_ALERTS: AlertSettings = { enabled: false, email: false, push: true, minGapMinutes: 10, newVisitorsOnly: false };
export const alertSettingsSchema = z.object({ enabled: z.boolean(), email: z.boolean(), push: z.boolean(), minGapMinutes: z.number().int().min(1).max(1440), newVisitorsOnly: z.boolean() });
export const ALERT_DOC = { collection: "content", id: "visitorAlerts" } as const;

export interface VisitInfo { newVisitor: boolean; place: string; source: string; channel: string; landing: string; device: string }
export interface AlertMessage { title: string; body: string; url: string }
export interface Senders { email(m: AlertMessage): Promise<unknown>; push(m: AlertMessage): Promise<unknown> }

/** Decides whether this visit sends an alert now. Visits suppressed by the gap are counted and reported in the next alert. */
export function decide(s: AlertSettings, v: VisitInfo, now: number): { send: boolean; pending: number } {
  const pending = s.pending ?? 0;
  if (!s.enabled || (!s.email && !s.push)) return { send: false, pending };
  if (s.newVisitorsOnly && !v.newVisitor) return { send: false, pending };
  return !s.lastAlertAt || now - s.lastAlertAt >= s.minGapMinutes * 60_000 ? { send: true, pending } : { send: false, pending: pending + 1 };
}
export function message(v: VisitInfo, pending: number): AlertMessage {
  const more = pending > 0 ? ` · +${pending} more visit${pending === 1 ? "" : "s"} since the last alert` : "";
  return { title: v.newVisitor ? "New visitor on your website" : "Visitor on your website", body: `${v.place === "Unknown" ? "Location unknown" : `${v.place} (approximate)`} · from ${v.source} · opened ${v.landing} · ${v.device}${more}`, url: "/admin/analytics" };
}
export async function readSettings(db: Db): Promise<AlertSettings> { const s = await db.collection(ALERT_DOC.collection).doc(ALERT_DOC.id).get(); return { ...DEFAULT_ALERTS, ...((s.exists ? s.data() : {}) as Partial<AlertSettings>) }; }

/** Called for each new visit. Never throws into the visitor's request. */
export async function runAlert(db: Db, senders: Senders, v: VisitInfo, now = Date.now()): Promise<"sent" | "skipped"> {
  try {
    const s = await readSettings(db), d = decide(s, v, now), ref = db.collection(ALERT_DOC.collection).doc(ALERT_DOC.id);
    if (!d.send) { if (d.pending !== (s.pending ?? 0)) await ref.set({ pending: d.pending }, { merge: true }); return "skipped"; }
    await ref.set({ lastAlertAt: now, pending: 0 }, { merge: true }); // claim the slot first so a burst of visits sends one alert
    const m = message(v, d.pending), jobs: Promise<unknown>[] = [];
    if (s.email) jobs.push(senders.email(m)); if (s.push) jobs.push(senders.push(m));
    await Promise.allSettled(jobs); return "sent";
  } catch { return "skipped"; }
}
