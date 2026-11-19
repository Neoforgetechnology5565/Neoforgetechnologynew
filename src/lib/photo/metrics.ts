import type { Mesh } from "./types";

/** Closest point on triangle (Ericson, Real-Time Collision Detection). */
export function closestOnTri(px: number, py: number, pz: number, a: number[], b: number[], c: number[]): [number, number, number] {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2], apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz; if (d1 <= 0 && d2 <= 0) return [a[0], a[1], a[2]];
  const bpx = px - b[0], bpy = py - b[1], bpz = pz - b[2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz; if (d3 >= 0 && d4 <= d3) return [b[0], b[1], b[2]];
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * abx, a[1] + v * aby, a[2] + v * abz]; }
  const cpx = px - c[0], cpy = py - c[1], cpz = pz - c[2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz; if (d6 >= 0 && d5 <= d6) return [c[0], c[1], c[2]];
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * acx, a[1] + w * acy, a[2] + w * acz]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [a[0] + abx * v + acx * w, a[1] + aby * v + acy * w, a[2] + abz * v + acz * w];
}
/** Multi-level triangle hash (cell sizes c, 8c, 64c …) so both tiny and very large triangles are found quickly. Query = distance from a point to the surface. */
export class TriIndex {
  private levels: { c: number; map: Map<number, number[]> }[] = []; private mn: number[]; private diag: number;
  constructor(private m: Mesh, base: number) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.pos[i + k]); mx[k] = Math.max(mx[k], m.pos[i + k]); }
    this.mn = mn; this.diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1; for (let c = base; ; c *= 8) { this.levels.push({ c, map: new Map() }); if (c > this.diag) break; }
    for (let t = 0; t < m.idx.length / 3; t++) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let e = 0; e < 3; e++) for (let k = 0; k < 3; k++) { const v = m.pos[m.idx[t * 3 + e] * 3 + k]; lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); }
      const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]); let L = 0; while (L < this.levels.length - 1 && ext > this.levels[L].c * 2) L++; const lv = this.levels[L];
      for (let z = Math.floor((lo[2] - mn[2]) / lv.c); z <= Math.floor((hi[2] - mn[2]) / lv.c); z++) for (let y = Math.floor((lo[1] - mn[1]) / lv.c); y <= Math.floor((hi[1] - mn[1]) / lv.c); y++) for (let x = Math.floor((lo[0] - mn[0]) / lv.c); x <= Math.floor((hi[0] - mn[0]) / lv.c); x++) { const k = x + 65536 * (y + 4096 * z); const l = lv.map.get(k); if (l) l.push(t); else lv.map.set(k, [t]); } }
  }
  closest(px: number, py: number, pz: number, startR: number): { d: number; p: [number, number, number] } {
    let best = Infinity, bp: [number, number, number] = [px, py, pz]; const p = this.m.pos, idx = this.m.idx, tested = new Set<number>();
    for (let r = startR; ; r *= 2) {
      for (const lv of this.levels) { const x0 = Math.floor((px - r - this.mn[0]) / lv.c), x1 = Math.floor((px + r - this.mn[0]) / lv.c), y0 = Math.floor((py - r - this.mn[1]) / lv.c), y1 = Math.floor((py + r - this.mn[1]) / lv.c), z0 = Math.floor((pz - r - this.mn[2]) / lv.c), z1 = Math.floor((pz + r - this.mn[2]) / lv.c);
        for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const l = lv.map.get(x + 65536 * (y + 4096 * z)); if (!l) continue; for (const t of l) { if (tested.has(t)) continue; tested.add(t); const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3; const q = closestOnTri(px, py, pz, [p[a], p[a + 1], p[a + 2]], [p[b], p[b + 1], p[b + 2]], [p[c], p[c + 1], p[c + 2]]); const d = Math.hypot(q[0] - px, q[1] - py, q[2] - pz); if (d < best) { best = d; bp = q; } } } }
      if (best <= r || r > this.diag * 2) return { d: best, p: bp };
    }
  }
}
export interface Stats { mean: number; rms: number; p95: number; max: number; n: number }
export function statsOf(d: number[]): Stats { if (!d.length) return { mean: 0, rms: 0, p95: 0, max: 0, n: 0 }; const s = d.slice().sort((a, b) => a - b); let sum = 0, sq = 0; for (const x of d) { sum += x; sq += x * x; } return { mean: sum / d.length, rms: Math.sqrt(sq / d.length), p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], n: d.length }; }
export function bbox(pos: Float64Array): { min: number[]; max: number[]; size: number[] } { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); } return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] }; }
export const meshArea = (m: Mesh) => { let a = 0; for (let t = 0; t < m.idx.length; t += 3) { const i = m.idx[t] * 3, j = m.idx[t + 1] * 3, k = m.idx[t + 2] * 3, ux = m.pos[j] - m.pos[i], uy = m.pos[j + 1] - m.pos[i + 1], uz = m.pos[j + 2] - m.pos[i + 2], vx = m.pos[k] - m.pos[i], vy = m.pos[k + 1] - m.pos[i + 1], vz = m.pos[k + 2] - m.pos[i + 2]; a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } return a; };
/** Per-vertex distance from the mesh to the reference points (nearest point), used for the deviation colour map. */
export function vertexDeviation(mesh: Mesh, refGridDist: (x: number, y: number, z: number) => number): Float32Array { const n = mesh.pos.length / 3, d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = refGridDist(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]); return d; }
