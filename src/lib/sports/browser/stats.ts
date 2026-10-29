/** Statistics and cautious event candidates from observed track positions (port of stats.py). Nothing here invents data. */
import { zoneOf } from "./pitch";
export const MAX_SPEED = 12, MARGIN = 3, CELL_M = 2, SIGMA_CELLS = 1.5;
export const inPitch = (x: number, y: number, length: number, width: number) => x >= -MARGIN && x <= length + MARGIN && y >= -MARGIN && y <= width + MARGIN;
type XY = [number, number];
function smooth(xy: XY[], t: number[], windowS = 1): XY[] {
  const n = xy.length; if (n < 3) return xy.map((p) => [...p] as XY);
  return xy.map((_, i) => { const idx: number[] = []; for (let j = 0; j < n; j++) if (Math.abs(t[j] - t[i]) <= windowS / 2) idx.push(j); const use = idx.length < 3 ? [Math.max(0, i - 1), i, Math.min(n - 1, i + 1)].filter((v, k, a) => a.indexOf(v) === k) : idx; return [use.reduce((s, j) => s + xy[j][0], 0) / use.length, use.reduce((s, j) => s + xy[j][1], 0) / use.length] as XY; });
}
export interface PitchStats { status: "ok" | "insufficient"; mapped_observations: number; distance_m?: number; avg_speed_ms?: number | null; max_speed_ms?: number | null; excluded_segments?: number; counted_seconds?: number; reason?: string }
export function trackStats(t: number[], imgXY: XY[], pitchXY: (XY | null)[] | null, dt: number, length: number, width: number) {
  const n = t.length; let imgDist = 0; for (let i = 1; i < n; i++) if (t[i] - t[i - 1] <= 1.5 * dt + 1e-6 && t[i] - t[i - 1] <= 2) imgDist += Math.hypot(imgXY[i][0] - imgXY[i - 1][0], imgXY[i][1] - imgXY[i - 1][1]);
  const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d, st = { observed_seconds: r(n * dt), observations: n, first_seen_s: r(t[0]), last_seen_s: r(t[n - 1]), image_distance_px: r(imgDist, 1), pitch: null as PitchStats | null, zone_seconds: null as number[] | null };
  if (!pitchXY) return st;
  const ok = pitchXY.map((p) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && inPitch(p[0], p[1], length, width)), cnt = ok.filter(Boolean).length;
  if (cnt < 3) { st.pitch = { status: "insufficient", mapped_observations: cnt, reason: "Fewer than 3 observations fell on the calibrated pitch." }; return st; }
  const tt = t.filter((_, i) => ok[i]), pp = pitchXY.filter((_, i) => ok[i]) as XY[], sp = smooth(pp, tt); let dist = 0, dtime = 0, excluded = 0, vmax = 0;
  for (let i = 1; i < tt.length; i++) { const d0 = tt[i] - tt[i - 1]; if (d0 > 1.5 * dt + 1e-6 || d0 > 2) continue; const d = Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]); if (d / d0 > MAX_SPEED) { excluded++; continue; } dist += d; dtime += d0; }
  for (let i = 0; i < tt.length; i++) { let j = i; while (j < tt.length && tt[j] < tt[i] + 1) j++; if (j < tt.length && tt[j] - tt[i] <= 1.6) { let allOk = true; for (let k = i; k < j; k++) if (tt[k + 1] - tt[k] > 1.5 * dt + 1e-6) { allOk = false; break; } if (allOk) { const v = Math.hypot(sp[j][0] - sp[i][0], sp[j][1] - sp[i][1]) / (tt[j] - tt[i]); if (v <= MAX_SPEED) vmax = Math.max(vmax, v); } } }
  const zs = new Array(9).fill(0); for (const p of pp) { const z = zoneOf(Math.min(Math.max(p[0], 0), length), Math.min(Math.max(p[1], 0), width), length, width); if (z !== null) zs[z] += dt; }
  st.pitch = { status: "ok", mapped_observations: cnt, distance_m: r(dist, 1), avg_speed_ms: dtime > 0 ? r(dist / dtime) : null, max_speed_ms: vmax > 0 ? r(vmax) : null, excluded_segments: excluded, counted_seconds: r(dtime) }; st.zone_seconds = zs.map((z) => r(z)); return st;
}
export interface FrameLite { t: number; p: [number, number, number, number, number, number, string, number | null, number | null][]; b: [number, number, number | null, string, number | null, number | null] | null }
export interface EventRec { kind: string; t0: number; t1: number; track_id: number; team: string | null; ball_observations: number; mean_distance_in_heights: number; confidence: "low" | "medium"; basis: string }
/** Candidate ball-possession intervals from image-space proximity; needs an *observed* ball. A candidate needs the nearest person within 0.45 heights and the runner-up at least 1.4× further away; runs of ≥ 2 observations merge. */
export function possessionCandidates(frames: FrameLite[], dt: number): EventRec[] {
  const per: [number, number, number, string | null, number][] = [];
  frames.forEach((f, k) => { const b = f.b; if (!b || b[3] !== "observed" || !f.p.length) return; const ds = f.p.map((p) => { const h = Math.max(p[4] - p[2], 1), cx = (p[1] + p[3]) / 2, fy = p[4] - 0.1 * h; return { d: Math.hypot(b[0] - cx, b[1] - fy) / h, id: p[0], team: p[6] }; }).sort((a, c) => a.d - c.d || a.id - c.id); if (ds[0].d <= 0.45 && (ds.length === 1 || ds[1].d >= 1.4 * ds[0].d)) per.push([k, f.t, ds[0].id, ds[0].team, ds[0].d]); });
  const out: EventRec[] = []; let cur: typeof per | null = null; const cand = (run: typeof per): EventRec => { const d = run.reduce((s, r) => s + r[4], 0) / run.length; return { kind: "possession_candidate", t0: Math.round(run[0][1] * 100) / 100, t1: Math.round((run[run.length - 1][1] + dt) * 100) / 100, track_id: run[0][2], team: run[0][3], ball_observations: run.length, mean_distance_in_heights: Math.round(d * 100) / 100, confidence: run.length >= 4 && d <= 0.3 ? "medium" : "low", basis: "ball observed near this tracked person's feet in the image; proximity only, not validated possession" }; };
  for (const it of per) { if (cur && it[2] === cur[cur.length - 1][2] && it[0] - cur[cur.length - 1][0] <= 2) cur.push(it); else { if (cur && cur.length >= 2) out.push(cand(cur)); cur = [it]; } }
  if (cur && cur.length >= 2) out.push(cand(cur)); return out;
}
