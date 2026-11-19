import { medianSpacing, PointGrid } from "./grid";

export interface CleanResult { keep: Uint32Array; spacing: number; stages: { name: string; removed: number; detail: string }[] }
/**
 * Point cloud cleaning in three steps, each reported separately:
 *  1. statistical outlier removal: mean distance to the k nearest neighbours; points whose mean distance is more than `std` standard deviations above the average are removed;
 *  2. floating-geometry removal: occupied voxels are grouped into 26-connected components and components smaller than `frac` of the largest are removed;
 * Only points are deleted. No point is moved, so scale and coordinates are untouched.
 */
export function cleanCloud(pos: Float64Array, k: number, std: number, frac: number): CleanResult {
  const n = pos.length / 3, spacing = medianSpacing(pos), stages: CleanResult["stages"] = [];
  const grid = new PointGrid(pos, Math.max(spacing * 3, 1e-9)), md = new Float64Array(n); let sum = 0, cnt = 0;
  for (let i = 0; i < n; i++) { const d = grid.knnMean(i, Math.min(k, n - 1)); md[i] = d; if (Number.isFinite(d)) { sum += d; cnt++; } }
  const mean = sum / Math.max(1, cnt); let v = 0; for (let i = 0; i < n; i++) if (Number.isFinite(md[i])) v += (md[i] - mean) ** 2; const sd = Math.sqrt(v / Math.max(1, cnt)), thr = mean + std * sd;
  const keep: number[] = []; for (let i = 0; i < n; i++) if (md[i] <= thr) keep.push(i);
  stages.push({ name: "Outlier removal", removed: n - keep.length, detail: `mean neighbour distance ${(mean * 1000).toFixed(1)} mm, limit ${(thr * 1000).toFixed(1)} mm (mean + ${std}σ, k=${k})` });
  // floating components on a voxel grid of 3x spacing
  const vs = spacing * 3, mn = [Infinity, Infinity, Infinity]; for (const i of keep) for (let a = 0; a < 3; a++) mn[a] = Math.min(mn[a], pos[i * 3 + a]);
  const key = (x: number, y: number, z: number) => x + 1048576 * (y + 4096 * z), vox = new Map<number, number[]>();
  for (const i of keep) { const x = Math.floor((pos[i * 3] - mn[0]) / vs), y = Math.floor((pos[i * 3 + 1] - mn[1]) / vs), z = Math.floor((pos[i * 3 + 2] - mn[2]) / vs), kk = key(x + 1, y + 1, z + 1); (vox.get(kk) ?? vox.set(kk, []).get(kk)!).push(i); }
  const comp = new Map<number, number>(), sizes: number[] = []; let nc = 0;
  for (const start of vox.keys()) { if (comp.has(start)) continue; const stack = [start]; comp.set(start, nc); let size = 0; while (stack.length) { const c = stack.pop()!; size += vox.get(c)!.length; const x = c % 1048576, rest = (c - x) / 1048576, y = rest % 4096, z = (rest - y) / 4096;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy && !dz) continue; const nk = key(x + dx, y + dy, z + dz); if (vox.has(nk) && !comp.has(nk)) { comp.set(nk, nc); stack.push(nk); } } }
    sizes.push(size); nc++; }
  const big = Math.max(0, ...sizes), ok = sizes.map((s) => s >= big * frac), before = keep.length; const keep2: number[] = [];
  for (const [kk, list] of vox) if (ok[comp.get(kk)!]) for (const i of list) keep2.push(i);
  keep2.sort((a, b) => a - b); stages.push({ name: "Floating geometry", removed: before - keep2.length, detail: `${nc} connected group(s); groups under ${(frac * 100).toFixed(1)}% of the largest (${big.toLocaleString()} points) removed` });
  return { keep: Uint32Array.from(keep2), spacing, stages };
}
export const subsetCloud = (pos: Float64Array, keep: Uint32Array, colors?: Uint8Array) => { const p = new Float64Array(keep.length * 3), c = colors ? new Uint8Array(keep.length * 3) : undefined; keep.forEach((i, j) => { p[j * 3] = pos[i * 3]; p[j * 3 + 1] = pos[i * 3 + 1]; p[j * 3 + 2] = pos[i * 3 + 2]; if (c) { c[j * 3] = colors![i * 3]; c[j * 3 + 1] = colors![i * 3 + 1]; c[j * 3 + 2] = colors![i * 3 + 2]; } }); return { pos: p, colors: c }; };
