import "server-only";
import { adminDb, isFirebaseConfigured } from "@/lib/firebase-admin";
import { configFor } from "./defaults";
import { listDemos } from "./registry";
import { configSchema, type ConfigRecord, type DemoEntry, type WtConfig } from "./schema";

const COL = "walkthroughs";
export const storageAvailable = () => isFirebaseConfigured();

async function stored(): Promise<Map<string, { config: unknown; updatedAt?: number; updatedBy?: string }>> {
  const m = new Map<string, { config: unknown; updatedAt?: number; updatedBy?: string }>();
  if (!storageAvailable()) return m;
  try { (await adminDb().collection(COL).get()).docs.forEach((d) => m.set(d.id, d.data() as { config: unknown; updatedAt?: number; updatedBy?: string })); } catch (e) { console.error("[walkthrough] read failed", e); }
  return m;
}
function record(d: DemoEntry, s?: { config: unknown; updatedAt?: number; updatedBy?: string }): ConfigRecord {
  const def = configFor(d), parsed = s ? configSchema.safeParse(s.config) : null;
  if (parsed?.success) return { key: d.key, config: parsed.data, source: "custom", quality: def.quality, updatedAt: s?.updatedAt, updatedBy: s?.updatedBy };
  return { key: d.key, config: def.config, source: "default", quality: def.quality };
}
export async function listRecords(): Promise<{ entry: DemoEntry; record: ConfigRecord }[]> {
  const s = await stored(); return listDemos().map((entry) => ({ entry, record: record(entry, s.get(entry.key)) }));
}
export async function getRecord(key: string) {
  const entry = listDemos().find((d) => d.key === key); if (!entry) return null;
  let doc: { config: unknown; updatedAt?: number; updatedBy?: string } | undefined;
  if (storageAvailable()) { try { const snap = await adminDb().collection(COL).doc(key).get(); if (snap.exists) doc = snap.data() as typeof doc; } catch (e) { console.error("[walkthrough] read failed", e); } }
  return { entry, record: record(entry, doc) };
}
export async function saveRecord(key: string, config: WtConfig, by: string) {
  await adminDb().collection(COL).doc(key).set({ config, updatedAt: Date.now(), updatedBy: by });
}
export async function resetRecord(key: string) { await adminDb().collection(COL).doc(key).delete(); }
