"use client";
import { useCallback, useSyncExternalStore } from "react";
import { SEEDS, type DB, type SliceKey } from "./seeds";
import { DEMO_TODAY } from "./util";

/**
 * One local, browser-only data store shared by all ten demos. Each demo owns a slice (crm, fin, hrm, …); some demos read
 * or write another slice on purpose (a procurement goods receipt adds stock to inventory). Persisted in localStorage.
 * No server, no network. Reset restores the original seed for one slice or for everything.
 */
const KEY = "neoforge-erp-demos-v1";
let state: DB = SEEDS();
let hydrated = false;
const subs = new Set<() => void>();

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable or full */ } }
function hydrate() {
  if (hydrated) return; hydrated = true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const saved = JSON.parse(raw) as Partial<DB>; state = { ...state, ...saved }; subs.forEach((f) => f()); } } catch { /* corrupt storage: keep the seed */ }
}
const subscribe = (f: () => void) => { subs.add(f); queueMicrotask(hydrate); return () => { subs.delete(f); }; };
const get = () => state;
const getServer = () => SERVER;
const SERVER = state;

/** Debug/test hook: lets browser tests read the live in-memory store. */
if (typeof window !== "undefined") (window as unknown as { __erpDb: () => DB }).__erpDb = () => state;

export function setDb(fn: (d: DB) => DB) { state = fn(state); persist(); subs.forEach((f) => f()); }
export function resetDb(keys?: SliceKey[]) {
  const fresh = SEEDS();
  state = keys ? ({ ...state, ...Object.fromEntries(keys.map((k) => [k, fresh[k]])) } as DB) : fresh;
  persist(); subs.forEach((f) => f());
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
