/** Applies tracking events to storage. `Db` is the small part of Firestore we use, so the same code runs against an in-memory store in tests. */
import { COL, VISITOR_RETENTION_DAYS } from "./consts";
import { geoFromHeaders, type HeaderLike } from "./geo";
import { isoDay, planClicks, planConversion, planView, type Counters, type Visitor } from "./plan";
import { trackBody } from "./schema";
import { classifySource } from "./source";
import { parseUa } from "./ua";

export interface SnapLike { exists: boolean; data(): Record<string, unknown> | undefined }
export interface DocRef { get(): Promise<SnapLike>; set(d: Record<string, unknown>, o?: { merge: boolean }): Promise<unknown>; delete(): Promise<unknown> }
export interface QueryLike { orderBy(f: string, dir?: "asc" | "desc"): QueryLike; where(f: string, op: "<" | ">" | "==", v: unknown): QueryLike; limit(n: number): QueryLike; get(): Promise<{ docs: { id: string; data(): Record<string, unknown>; ref: { delete(): Promise<unknown> } }[] }> }
export interface Db { collection(name: string): QueryLike & { doc(id: string): DocRef } }
export type Inc = (n: number) => unknown;

/** Turns a nested counters object into one whose numbers are database increments. */
export function withIncrements(c: Counters, inc: Inc): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) out[k] = typeof v === "number" ? inc(v) : withIncrements(v, inc);
  return out;
}
const incFields = (f: Record<string, number>, inc: Inc) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, inc(v)]));

export interface TrackInput { db: Db; inc: Inc; headers: HeaderLike; body: unknown; ua: string; selfHosts: string[]; now?: number }
export async function processTrack(o: TrackInput): Promise<"view" | "clicks" | "ignored"> {
  const parsed = trackBody.safeParse(o.body); if (!parsed.success) return "ignored";
  const now = o.now ?? Date.now(), day = isoDay(now), b = parsed.data, db = o.db;
  const vref = db.collection(COL.visitors).doc(b.vid), snap = await vref.get(), existing = (snap.exists ? snap.data() : null) as Visitor | null;
  if ("items" in b) {
    const p = planClicks({ body: b, existing, now });
    if (!p.items.length) return "ignored";
    await db.collection(COL.daily).doc(day).set(withIncrements(p.daily, o.inc), { merge: true });
    if (existing) await vref.set({ ...p.visitorSet, ...incFields(p.visitorInc, o.inc) }, { merge: true });
    return "clicks";
  }
  const p = planView({ body: b, geo: geoFromHeaders(o.headers), ua: parseUa(o.ua), source: classifySource({ referrer: b.ref, utmSource: b.utm?.s, utmMedium: b.utm?.m, utmCampaign: b.utm?.c }, o.selfHosts), now, existing });
  await db.collection(COL.daily).doc(day).set(withIncrements(p.daily, o.inc), { merge: true });
  await vref.set({ ...p.visitorSet, ...incFields(p.visitorInc, o.inc) }, { merge: true });
  await db.collection(COL.totals).doc("all").set(withIncrements(p.totals, o.inc), { merge: true });
  return "view";
}

/** Links a contact-form submission to the visitor's record (only called when the visitor accepted statistics and sent their id). */
export async function recordConversion(db: Db, inc: Inc, i: { vid: string; inquiryId: string; now?: number }): Promise<Record<string, unknown> | null> {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(i.vid)) return null;
  const now = i.now ?? Date.now(), vref = db.collection(COL.visitors).doc(i.vid), snap = await vref.get(); if (!snap.exists) return null;
  const p = planConversion({ existing: snap.data() as Visitor, inquiryId: i.inquiryId, now });
  await db.collection(COL.daily).doc(isoDay(now)).set(withIncrements(p.daily, inc), { merge: true });
  await vref.set(p.visitorSet, { merge: true });
  return p.snapshot;
}
export const deleteVisitor = (db: Db, vid: string) => db.collection(COL.visitors).doc(vid).delete();
/** Deletes individual visitor records not seen for the retention period. */
export async function pruneVisitors(db: Db, now = Date.now(), batch = 200): Promise<number> {
  const cutoff = now - VISITOR_RETENTION_DAYS * 86400000, old = await db.collection(COL.visitors).where("lastSeen", "<", cutoff).limit(batch).get();
  await Promise.all(old.docs.map((d) => d.ref.delete())); return old.docs.length;
}
