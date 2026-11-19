/** Sparse spatial hash over points (indexes into a Float64Array of xyz). */
export class PointGrid {
  readonly cell: number; private min: [number, number, number]; private ny: number; private nz: number; private start = new Map<number, number>(); private count = new Map<number, number>(); private order: Uint32Array;
  constructor(readonly pos: Float64Array, cell: number, subset?: Uint32Array) {
    this.cell = cell; const n = subset ? subset.length : pos.length / 3, id = (i: number) => (subset ? subset[i] : i);
    const mn: [number, number, number] = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) { const p = id(i) * 3; for (let k = 0; k < 3; k++) { const v = pos[p + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; } }
    this.min = mn; this.ny = Math.floor((mx[1] - mn[1]) / cell) + 3; this.nz = Math.floor((mx[2] - mn[2]) / cell) + 3;
    const keys = new Float64Array(n); for (let i = 0; i < n; i++) { const p = id(i) * 3; keys[i] = this.key(Math.floor((pos[p] - mn[0]) / cell) + 1, Math.floor((pos[p + 1] - mn[1]) / cell) + 1, Math.floor((pos[p + 2] - mn[2]) / cell) + 1); }
    const ord = new Uint32Array(n); for (let i = 0; i < n; i++) ord[i] = i; ord.sort((a, b) => keys[a] - keys[b]);
    this.order = new Uint32Array(n); for (let i = 0; i < n; i++) { const o = ord[i]; this.order[i] = id(o); const k = keys[o]; if (!this.start.has(k)) { this.start.set(k, i); this.count.set(k, 0); } this.count.set(k, this.count.get(k)! + 1); }
  }
  private key(ix: number, iy: number, iz: number) { return ix + 4194304 * (iy + 2048 * iz) + 0; }
  /** Calls f(index, squaredDistance) for every point within radius r of (x, y, z). */
  near(x: number, y: number, z: number, r: number, f: (i: number, d2: number) => void) {
    if (((2 * r) / this.cell + 2) ** 3 > 40000) return; // search window too large to be useful: treated as "no neighbours" by callers
    const c = this.cell, [mx, my, mz] = this.min, r2 = r * r, x0 = Math.floor((x - r - mx) / c) + 1, x1 = Math.floor((x + r - mx) / c) + 1, y0 = Math.floor((y - r - my) / c) + 1, y1 = Math.floor((y + r - my) / c) + 1, z0 = Math.floor((z - r - mz) / c) + 1, z1 = Math.floor((z + r - mz) / c) + 1, p = this.pos;
    for (let iz = z0; iz <= z1; iz++) for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      if (ix < 0 || iy < 0 || iz < 0 || iy >= this.ny || iz >= this.nz) continue; const k = this.key(ix, iy, iz), s = this.start.get(k); if (s === undefined) continue;
      for (let j = s, e = s + this.count.get(k)!; j < e; j++) { const i = this.order[j], dx = p[i * 3] - x, dy = p[i * 3 + 1] - y, dz = p[i * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 <= r2) f(i, d2); }
    }
  }
  /** Mean distance to the k nearest other points (searching outwards in rings until k are found). */
  knnMean(i: number, k: number): number {
    const p = this.pos, x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]; let r = this.cell;
    for (let t = 0; t < 3; t++, r *= 2) { const d: number[] = []; this.near(x, y, z, r, (j, d2) => { if (j !== i) d.push(d2); }); if (d.length >= k) { d.sort((a, b) => a - b); let s = 0; for (let q = 0; q < k; q++) s += Math.sqrt(d[q]); return s / k; } }
    return Infinity;
  }
}
/** Robust estimate of the typical spacing between neighbouring points (median nearest-neighbour distance over a sample). */
export function medianSpacing(pos: Float64Array, sample = 2000): number {
  const n = pos.length / 3; if (n < 4) return 1; const lo = [0, 0, 0], hi = [0, 0, 0];
  for (let k = 0; k < 3; k++) { const a = new Float64Array(Math.min(n, 5000)); for (let i = 0; i < a.length; i++) a[i] = pos[Math.floor((i * n) / a.length) * 3 + k]; a.sort(); lo[k] = a[Math.floor(a.length * 0.02)]; hi[k] = a[Math.floor(a.length * 0.98)]; }
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].sort((a, b) => b - a), area = Math.max(ext[0] * ext[1], 1e-12), g = new PointGrid(pos, Math.max(Math.sqrt(area / n) * 3, 1e-9)), d: number[] = [];
  for (let s = 0; s < Math.min(sample, n); s++) { const i = Math.floor((s * n) / Math.min(sample, n)); let r = g.cell, best = Infinity; for (let t = 0; t < 6 && best === Infinity; t++, r *= 2) g.near(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], r, (j, d2) => { if (j !== i && d2 < best) best = d2; }); if (best < Infinity) d.push(Math.sqrt(best)); }
  d.sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : 1;
}
