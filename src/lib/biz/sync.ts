"use client";
/**
 * Optional server persistence for the ERP demos. When a business API (services/biz-api) is configured, every change made through the shared
 * store is diffed per record and sent to it. The server validates and may refuse a change (for example stock below zero); the affected module is
 * then restored from the server and the reason is shown. Without a server the demos stay local-only and the footer says so.
 */
export type Json = Record<string, unknown>;
export type SyncMode = "local" | "connecting" | "synced" | "saving" | "offline" | "error";
export interface SyncStatus { mode: SyncMode; ws: string; message: string }
export interface Ops { upsert?: Record<string, Json[]>; delete?: Record<string, string[]>; order?: Record<string, string[]>; scalars?: Json; drop_scalars?: string[] }

const isRec = (x: unknown): x is Json & { id: string } => !!x && typeof x === "object" && !Array.isArray(x) && typeof (x as Json).id === "string" && !!(x as Json).id;
export const isColl = (v: unknown): v is (Json & { id: string })[] => Array.isArray(v) && v.length > 0 && v.every(isRec);
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Wire form of a slice: the activity log is a plain array in the store, an object on the server. */
export const toWire = (slice: string, v: unknown): Json => (slice === "activity" ? { items: v } : (v as Json));
export const fromWire = (slice: string, v: Json): unknown => (slice === "activity" ? (v.items ?? []) : v);

/** Differences between two versions of one slice as a server batch, or null if nothing changed. */
export function diffSlice(slice: string, prevRaw: unknown, nextRaw: unknown): Ops | null {
  if (prevRaw === nextRaw) return null;
  const prev = toWire(slice, prevRaw) ?? {}, next = toWire(slice, nextRaw) ?? {};
  const ops: Ops = {};
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const a = prev[k], b = next[k];
    if (same(a, b)) continue;
    if (isColl(a) || isColl(b)) {
      const A = isColl(a) ? a : [], B = isColl(b) ? b : [];
      const old = new Map(A.map((r) => [r.id, r]));
      const keep = new Set(B.map((r) => r.id));
      const up = B.filter((r) => !same(old.get(r.id), r));
      const del = A.filter((r) => !keep.has(r.id)).map((r) => r.id);
      if (up.length) (ops.upsert ??= {})[k] = up;
      if (del.length) (ops.delete ??= {})[k] = del;
      const expected = [...A.filter((r) => keep.has(r.id)).map((r) => r.id), ...B.filter((r) => !old.has(r.id)).map((r) => r.id)];
      if (!same(expected, B.map((r) => r.id))) (ops.order ??= {})[k] = B.map((r) => r.id);
    } else if (b === undefined || (Array.isArray(b) && b.length === 0)) {
      (ops.drop_scalars ??= []).push(k);
    } else (ops.scalars ??= {})[k] = b as never;
  }
  return Object.keys(ops).length ? ops : null;
}

/** Restores keys the server omits (an emptied list is not stored) so that a seed list does not come back. */
export function fillMissing(slice: string, serverSlice: Json, shape: unknown): unknown {
  const wire = toWire(slice, shape) ?? {};
  const out: Json = { ...serverSlice };
  for (const [k, v] of Object.entries(wire)) if (!(k in out)) out[k] = Array.isArray(v) ? [] : v;
  return fromWire(slice, out);
}

/* ───────────── runtime ───────────── */
const WS_KEY = "neoforge-erp-ws";
let base = "";
let status: SyncStatus = { mode: "local", ws: "", message: "" };
const listeners = new Set<() => void>();
const notices = new Set<(msg: string) => void>();
export const syncStatus = () => status;
export const subscribeSync = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const onSyncNotice = (f: (msg: string) => void) => { notices.add(f); return () => { notices.delete(f); }; };
const set = (s: Partial<SyncStatus>) => { status = { ...status, ...s }; listeners.forEach((f) => f()); };
const tell = (m: string) => notices.forEach((f) => f(m));
export const serverUrl = () => base;
export const workspaceId = () => status.ws;

function newWs() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join(""); }
function wsId() { try { const s = localStorage.getItem(WS_KEY); if (s && /^[0-9a-f]{16,32}$/.test(s)) return s; const n = newWs(); localStorage.setItem(WS_KEY, n); return n; } catch { return newWs(); } }

export interface Bridge {
  getState(): Record<string, unknown>;
  seed(): Record<string, unknown>;
  /** Replace these slices with server data without sending anything back. */
  adopt(slices: Record<string, unknown>): void;
}
let bridge: Bridge | null = null;
let chain: Promise<unknown> = Promise.resolve();
const dirty = new Set<string>();
// A downstream write (inventory) is sent before the module that triggered it (procurement), so a refusal leaves nothing half-applied.
const PRIORITY = ["inv", "pay", "hrm", "fin", "crm", "desk", "mkt", "proj", "proc", "exec", "activity"];

export async function api<T = Json>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}/api/biz/${status.ws}${path}`, { cache: "no-store", ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...init?.headers } }); } catch { throw Object.assign(new Error("The business API could not be reached."), { status: 0 }); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(Array.isArray(body.errors) && body.errors.length ? body.errors.slice(0, 3).join("; ") : typeof body.detail === "string" ? body.detail : `Request failed (${r.status})`), { status: r.status, errors: body.errors as string[] | undefined });
  return body as T;
}

export async function connect(url: string, b: Bridge): Promise<void> {
  bridge = b; base = url.replace(/\/+$/, "");
  if (!base) { set({ mode: "local", message: "No business API is configured." }); return; }
  set({ mode: "connecting", ws: wsId(), message: "" });
  try {
    const res = await api<{ slices: Record<string, Json> }>("/state");
    const have = res.slices, local = b.getState(), seed = b.seed(), adopt: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(have)) if (k in seed) adopt[k] = fillMissing(k, v, seed[k]);
    if (Object.keys(adopt).length) b.adopt(adopt);
    for (const k of Object.keys(seed)) if (!(k in have) && Object.values(toWire(k, local[k]) ?? {}).some((v) => !(Array.isArray(v) && v.length === 0))) await api(`/${k}`, { method: "PUT", body: JSON.stringify({ state: toWire(k, local[k]) }) });
    set({ mode: "synced", message: "" });
  } catch (e) { fail(e as Error & { status?: number }); }
}

function fail(e: Error & { status?: number }) { set({ mode: e.status === 0 ? "offline" : "error", message: e.message }); }

/** Called by the store after every change. */
export function push(prev: Record<string, unknown>, next: Record<string, unknown>) {
  if (!base || !bridge || status.mode === "connecting") return;
  const batch: [string, Ops | "replace"][] = [];
  for (const k of PRIORITY) {
    if (dirty.has(k)) batch.push([k, "replace"]);
    else { const d = diffSlice(k, prev[k], next[k]); if (d) batch.push([k, d]); }
  }
  if (!batch.length) return;
  set({ mode: "saving" });
  chain = chain.then(async () => {
    const sent: string[] = [];
    try {
      for (const [k, d] of batch) {
        if (d === "replace") { await api(`/${k}`, { method: "PUT", body: JSON.stringify({ state: toWire(k, bridge!.getState()[k]) }) }); dirty.delete(k); }
        else { const r = await api<{ refresh?: string[]; workflow_runs?: { workflow: string; status: string }[] }>(`/${k}/ops`, { method: "POST", body: JSON.stringify(d) }); sent.push(k); await afterOps(r); }
      }
      if (status.mode !== "error") set({ mode: "synced", message: "" });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 0) { for (const [k] of batch) dirty.add(k); fail(err); return; }
      // The server refused the change: show why, and restore the affected modules from the server's truth.
      tell(`The server did not accept this change: ${err.message}`);
      await restore(batch.map(([k]) => k));
      set({ mode: "synced", message: "" });
    }
  });
}

async function afterOps(r: { refresh?: string[] }) {
  if (r.refresh?.length) { await restore(r.refresh.filter((k) => bridge && k in bridge.seed())); window.dispatchEvent(new Event("erp-flow-changed")); }
}
async function restore(keys: string[]) {
  if (!bridge) return;
  const seed = bridge.seed(), out: Record<string, unknown> = {};
  try {
    const res = await api<{ slices: Record<string, Json> }>("/state");
    for (const k of new Set(keys)) if (k in seed) out[k] = fillMissing(k, res.slices[k] ?? {}, seed[k]);
    bridge.adopt(out);
  } catch (e) { fail(e as Error & { status?: number }); }
}
export const forgetWorkspace = async () => { if (!base) return; try { await api("", { method: "DELETE" }); } catch { /* already gone */ } };
