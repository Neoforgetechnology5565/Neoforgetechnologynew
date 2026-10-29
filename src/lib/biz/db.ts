"use client";
import { useCallback, useSyncExternalStore } from "react";
import { SEEDS, type DB, type SliceKey } from "./seeds";
import { DEMO_TODAY } from "./util";
import { connect, push } from "./sync";

/**
 * One local, browser-only data store shared by all ten demos. Each demo owns a slice (crm, fin, hrm, …); some demos read
 * or write another slice on purpose (a procurement goods receipt adds stock to inventory). Persisted in localStorage.
 * Without a configured business API there is no network. With one (see sync.ts) every change is also validated and stored by the server.
 * Reset restores the original seed for one slice or for everything.
 */
const KEY = "neoforge-erp-demos-v1";
let state: DB = SEEDS();
let hydrated = false;
const subs = new Set<() => void>();

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable or full */ } }
/** Saved slices from an older build may lack newer fields: fill them from the seed instead of dropping the whole slice. */
function mergeSlices(seed: DB, saved: Partial<DB>): Partial<DB> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(saved)) { const base = (seed as unknown as Record<string, unknown>)[k]; out[k] = base && v && typeof base === "object" && !Array.isArray(base) && typeof v === "object" && !Array.isArray(v) ? { ...(base as object), ...(v as object) } : v; }
  return out as Partial<DB>;
}
/** Renamed values from earlier builds. */
function migrate(d: DB): DB {
  if (d.crm.opps.some((o) => (o.stage as string) === "Qualification")) d = { ...d, crm: { ...d.crm, opps: d.crm.opps.map((o) => ((o.stage as string) === "Qualification" ? { ...o, stage: "Qualified" as const } : o)) } };
  return d;
}
function hydrate() {
  if (hydrated) return; hydrated = true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const saved = JSON.parse(raw) as Partial<DB>; state = migrate({ ...state, ...mergeSlices(state, saved) }); subs.forEach((f) => f()); } } catch { /* corrupt storage: keep the seed */ }
}
const subscribe = (f: () => void) => { subs.add(f); queueMicrotask(hydrate); return () => { subs.delete(f); }; };
const get = () => state;
const getServer = () => SERVER;
const SERVER = state;

/** Debug/test hook: lets browser tests read (and change) the live in-memory store, through the same path the screens use. */
if (typeof window !== "undefined") { const w = window as unknown as { __erpDb: () => DB; __erpSetDb: (fn: (d: DB) => DB) => void }; w.__erpDb = () => state; w.__erpSetDb = (fn) => setDb(fn); }

export function setDb(fn: (d: DB) => DB) { const prev = state; state = fn(state); persist(); subs.forEach((f) => f()); push(prev as never, state as never); }
/** Connects the store to the business API (once per page load). Slices already on the server replace the local copy. */
let connected = "";
export function connectServer(url: string) {
  if (connected === url) return; connected = url;
  hydrate();
  void connect(url, { getState: () => state as never, seed: () => SEEDS() as never, adopt: (s) => { state = migrate({ ...state, ...(s as Partial<DB>) }); persist(); subs.forEach((f) => f()); } });
}
export function resetDb(keys?: SliceKey[]) {
  const prev = state;
  const fresh = SEEDS();
  state = keys ? ({ ...state, ...Object.fromEntries(keys.map((k) => [k, fresh[k]])) } as DB) : fresh;
  persist(); subs.forEach((f) => f()); push(prev as never, state as never);
}
export const useDb = () => useSyncExternalStore(subscribe, get, getServer);

export function useSlice<K extends SliceKey>(k: K) {
  const db = useDb();
  const update = useCallback((fn: (s: DB[K]) => DB[K]) => setDb((d) => ({ ...d, [k]: fn(d[k]) })), [k]);
  return [db[k], update] as const;
}
/** Append to the shared activity history that the executive demo displays. */
export function logActivity(demo: string, text: string) {
  setDb((d) => ({ ...d, activity: [{ id: `a${Date.now()}${Math.floor(Math.random() * 999)}`, at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`, demo, text }, ...d.activity].slice(0, 200) }));
}
