import type { Cloud } from "./types";

/** Deterministic PRNG (mulberry32) and Gaussian helper so the sample is identical on every run. */
export const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());

/** Ground-truth facade (metres): 12.0 x 8.0 wall, 10 window recesses 1.2 x 1.6 (0.25 deep), a door recess 1.4 x 2.4 (0.20 deep), two pilasters 0.4 wide (0.15 proud), cornice 0.4 high (0.30 proud). */
export const TRUTH = { width: 12, height: 8, windowW: 1.2, windowH: 1.6, windowDepth: 0.25, doorW: 1.4, doorH: 2.4, doorDepth: 0.2, pilasterW: 0.4, pilasterOut: 0.15, corniceH: 0.4, corniceOut: 0.3, windowCols: [1.6, 3.8, 6.0, 8.2, 10.4], windowRows: [3.2, 5.6] /* bottom edges */ };
export function truthDepth(x: number, y: number): number {
  const T = TRUTH; if (y >= T.height - T.corniceH) return T.corniceOut;
  if (Math.abs(x - 6.0) <= T.doorW / 2 && y <= T.doorH) return -T.doorDepth;
  for (const cx of T.windowCols) for (const by of T.windowRows) if (Math.abs(x - cx) <= T.windowW / 2 && y >= by && y <= by + T.windowH) return -T.windowDepth;
  if (x <= T.pilasterW || x >= T.width - T.pilasterW) return T.pilasterOut; return 0;
}
export interface SynthOptions { points: number; noiseMm: number; outlierFraction: number; seed: number; origin: [number, number, number] }
export const PRESETS: Record<string, { label: string; opt: SynthOptions }> = {
  light: { label: "Light noise (σ 3 mm)", opt: { points: 200000, noiseMm: 3, outlierFraction: 0.004, seed: 11, origin: [532100, 35, 4180200] } },
  typical: { label: "Typical phone scan (σ 6 mm)", opt: { points: 200000, noiseMm: 6, outlierFraction: 0.01, seed: 12, origin: [532100, 35, 4180200] } },
  heavy: { label: "Heavy noise (σ 12 mm)", opt: { points: 200000, noiseMm: 12, outlierFraction: 0.02, seed: 13, origin: [532100, 35, 4180200] } },
};
/** A noisy, incomplete facade scan generated from the ground-truth model: depth noise, small lateral jitter, a slow ripple, uneven density, occlusion holes (a tree, a lamp post), scattered outliers and three floating blobs. Y is up, the facade faces +Z, coordinates carry a large world offset to prove precision is kept. */
export function synthFacade(o: SynthOptions): Cloud {
  const r = rng(o.seed), T = TRUTH, pos: number[] = [], col: number[] = [], [ox, oy, oz] = o.origin, sd = o.noiseMm / 1000;
  const holes = [[8.2, 9.4, 0, 3.1], [3.0, 3.25, 0, 8.0], [10.8, 11.6, 5.4, 6.6]];
  while (pos.length / 3 < o.points) {
    const x = r() * T.width, y = r() * T.height; if (r() > 0.45 + 0.55 * (1 - y / T.height)) continue; if (holes.some((h) => x > h[0] && x < h[1] && y > h[2] && y < h[3])) continue;
    const d = truthDepth(x, y), ripple = 0.003 * Math.sin(x * 1.7) * Math.cos(y * 2.3);
    pos.push(ox + x + 0.002 * gauss(r), oy + y + 0.002 * gauss(r), oz + d + sd * gauss(r) + ripple); const base = d < -0.01 ? 70 : d > 0.01 ? 190 : 165, j = Math.round(8 * gauss(r)); col.push(base + j, base + j - 4, base + j - 10);
  }
  const no = Math.round(o.points * o.outlierFraction); for (let i = 0; i < no; i++) { pos.push(ox - 1 + r() * (T.width + 2), oy - 1 + r() * (T.height + 2), oz - 1 + r() * 2.5); col.push(150, 150, 150); }
  for (const [bx, by, bz] of [[2, 3, 2.2], [9, 6, 1.5], [5, 8.5, 1.8]]) for (let i = 0; i < 400; i++) { pos.push(ox + bx + 0.12 * gauss(r), oy + by + 0.12 * gauss(r), oz + bz + 0.12 * gauss(r)); col.push(120, 120, 120); }
  return { pos: Float64Array.from(pos), colors: Uint8Array.from(col) };
}
/** Depth (Z) of a mesh at plane position (x, y): vertical ray cast along Z through a 2D triangle hash. Used to measure features of an axis-aligned facade in world coordinates. */
export class ZSampler {
  private map = new Map<number, number[]>(); constructor(private pos: Float64Array, private idx: Uint32Array, private cell = 0.05) {
    for (let t = 0; t < idx.length / 3; t++) { const xs = [0, 1, 2].map((k) => pos[idx[t * 3 + k] * 3]), ys = [0, 1, 2].map((k) => pos[idx[t * 3 + k] * 3 + 1]); for (let y = Math.floor(Math.min(...ys) / cell); y <= Math.floor(Math.max(...ys) / cell); y++) for (let x = Math.floor(Math.min(...xs) / cell); x <= Math.floor(Math.max(...xs) / cell); x++) { const k = x * 1e7 + y; const l = this.map.get(k); if (l) l.push(t); else this.map.set(k, [t]); } } }
  z(x: number, y: number): number {
    const l = this.map.get(Math.floor(x / this.cell) * 1e7 + Math.floor(y / this.cell)); if (!l) return NaN; const p = this.pos, id = this.idx;
    for (const t of l) { const a = id[t * 3] * 3, b = id[t * 3 + 1] * 3, c = id[t * 3 + 2] * 3, d = (p[b + 1] - p[c + 1]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 1] - p[c + 1]); if (Math.abs(d) < 1e-14) continue; const u = ((p[b + 1] - p[c + 1]) * (x - p[c]) + (p[c] - p[b]) * (y - p[c + 1])) / d, v = ((p[c + 1] - p[a + 1]) * (x - p[c]) + (p[a] - p[c]) * (y - p[c + 1])) / d, w = 1 - u - v; if (u >= -1e-9 && v >= -1e-9 && w >= -1e-9) return u * p[a + 2] + v * p[b + 2] + w * p[c + 2]; }
    return NaN;
  }
}
export interface TruthCheck { name: string; truth: number; measured: number; error: number }
/** Measures the processed facade against the known truth. `wallZ` is the world Z of the plain wall; all values in metres. */
export function truthChecks(pos: Float64Array, idx: Uint32Array, origin: [number, number, number]): TruthCheck[] {
  const [ox, oy, oz] = origin, T = TRUTH, zs = new ZSampler(pos, idx), out: TruthCheck[] = []; let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { if (pos[i] < mnx) mnx = pos[i]; if (pos[i] > mxx) mxx = pos[i]; if (pos[i + 1] < mny) mny = pos[i + 1]; if (pos[i + 1] > mxy) mxy = pos[i + 1]; }
  const add = (name: string, truth: number, measured: number) => out.push({ name, truth, measured, error: measured - truth });
  add("Overall width", T.width, mxx - mnx); add("Overall height", T.height, mxy - mny);
  const wallZ = oz, run = (y: number, below: number) => { const iv: [number, number][] = []; let s: number | null = null; for (let x = ox + 0.02; x < ox + T.width - 0.02; x += 0.005) { const z = zs.z(x, oy + y), inside = Number.isFinite(z) && z < wallZ - below; if (inside && s === null) s = x; if (!inside && s !== null) { iv.push([s, x]); s = null; } } return iv; };
  // an interval counts only if both of its edges were actually seen (a hole in the scan next to a window must not be read as a short window)
  const spans = (y: number, below: number) => { const iv: [number, number][] = []; let st: number | null = null, prevFinite = false; for (let x = ox + 0.02; x < ox + T.width - 0.02; x += 0.005) { const z = zs.z(x, oy + y), fin = Number.isFinite(z), inside = fin && z < wallZ - below; if (inside && st === null && prevFinite) st = x; if (!inside && st !== null) { if (fin) iv.push([st, x]); st = null; } if (!fin && st !== null) st = null; prevFinite = fin; } const merged: [number, number][] = []; for (const g of iv) { const l = merged[merged.length - 1]; if (l && g[0] - l[1] < 0.03) l[1] = g[1]; else merged.push([g[0], g[1]]); } return merged; };
  const w1 = spans(T.windowRows[0] + T.windowH / 2, 0.12); add("Window width (average of complete windows)", T.windowW, w1.reduce((a, b) => a + (b[1] - b[0]), 0) / Math.max(1, w1.length));
  const col: [number, number][] = []; let s: number | null = null; for (let y = oy + T.windowRows[0] - 0.4; y < oy + T.windowRows[0] + T.windowH + 0.4; y += 0.005) { const z = zs.z(ox + T.windowCols[2], y), inside = Number.isFinite(z) && z < wallZ - 0.12; if (inside && s === null) s = y; if (!inside && s !== null) { col.push([s, y]); s = null; } } if (col.length) add("Window height", T.windowH, col[0][1] - col[0][0]);
  const door = spans(1.2, 0.1).filter((i) => Math.abs((i[0] + i[1]) / 2 - (ox + 6)) < 0.5); if (door.length) add("Door width", T.doorW, door[0][1] - door[0][0]);
  const zc = zs.z(ox + 6.0, oy + 4.0); if (Number.isFinite(zc)) add("Window recess depth", T.windowDepth, wallZ - zc);
  const zk = zs.z(ox + 5.0, oy + 7.8); if (Number.isFinite(zk)) add("Cornice projection", T.corniceOut, zk - wallZ);
  return out;
}
