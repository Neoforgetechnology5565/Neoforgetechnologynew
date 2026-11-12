import { countryName } from "./geo";

export const ONLINE_WINDOW_MS = 90_000; // matches the heartbeat in /api/presence
export interface Live { online: number; pages: { path: string; n: number }[]; countries: { code: string; name: string; n: number }[]; updatedAt: number }
/** Summarises the recent heartbeats (one per open page): how many people are on the site now, on which pages, from which countries. */
export function summarizeLive(beats: { path?: unknown; country?: unknown; at?: unknown }[], now = Date.now()): Live {
  const live = beats.filter((b) => typeof b.at === "number" && now - (b.at as number) < ONLINE_WINDOW_MS), pages = new Map<string, number>(), cc = new Map<string, number>();
  for (const b of live) { const p = String(b.path || "/").slice(0, 120), c = /^[A-Z]{2}$/.test(String(b.country)) && b.country !== "XX" ? String(b.country) : "XX"; pages.set(p, (pages.get(p) || 0) + 1); cc.set(c, (cc.get(c) || 0) + 1); }
  const top = <T,>(m: Map<string, number>, f: (k: string, n: number) => T) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => f(k, n));
  return { online: live.length, pages: top(pages, (path, n) => ({ path, n })), countries: top(cc, (code, n) => ({ code, name: code === "XX" ? "Unknown" : countryName(code), n })), updatedAt: now };
}
