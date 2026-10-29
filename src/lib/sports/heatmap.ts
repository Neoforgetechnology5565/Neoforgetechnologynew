/** Position heatmap: the same documented method as services/sports-analyzer/app/stats.py (verified against it by shared fixtures).
 *  Time-weighted 2-D histogram of mapped positions on `cell` metre cells, Gaussian-smoothed with zero padding, normalised so the maximum is 1. */
import type { Frame, Team } from "./types";

export const CELL_M = 2.0;
export const SIGMA_CELLS = 1.5;
export const MARGIN_M = 3.0;
export const gridShape = (length: number, width: number, cell = CELL_M): [number, number] => [Math.ceil(width / cell), Math.ceil(length / cell)];
export const inPitch = (x: number, y: number, length: number, width: number) => x >= -MARGIN_M && x <= length + MARGIN_M && y >= -MARGIN_M && y <= width + MARGIN_M;

/** scipy.ndimage.gaussian_filter kernel: radius = int(4 sigma + 0.5), normalised. */
function kernel(sigma: number): number[] {
  if (sigma <= 0) return [1];
  const r = Math.floor(4 * sigma + 0.5);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-0.5 * ((i - r) / sigma) ** 2));
  const s = k.reduce((a, b) => a + b, 0);
  return k.map((v) => v / s);
}

export function heatmap(points: [number, number][], length: number, width: number, cell = CELL_M, sigma = SIGMA_CELLS): { grid: Float64Array; rows: number; cols: number } {
  const [rows, cols] = gridShape(length, width, cell);
  let g = new Float64Array(rows * cols);
  for (const [x, y] of points) {
    const ix = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
    const iy = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
    g[iy * cols + ix] += 1;
  }
  if (points.length) {
    const k = kernel(sigma), r = (k.length - 1) / 2;
    const tmp = new Float64Array(rows * cols);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let s = 0; for (let j = -r; j <= r; j++) { const xx = x + j; if (xx >= 0 && xx < cols) s += g[y * cols + xx] * k[j + r]; } tmp[y * cols + x] = s; }
    const out = new Float64Array(rows * cols);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let s = 0; for (let j = -r; j <= r; j++) { const yy = y + j; if (yy >= 0 && yy < rows) s += tmp[yy * cols + x] * k[j + r]; } out[y * cols + x] = s; }
    let m = 0; for (const v of out) if (v > m) m = v;
    if (m > 0) for (let i = 0; i < out.length; i++) out[i] /= m;
    g = out;
  }
  return { grid: g, rows, cols };
}

export interface PointFilter { tracks?: number[] | null; team?: Team | null; t0: number; t1: number }
/** Mapped, on-pitch observations passing the filter (never unmapped ones). */
export function mappedPoints(frames: Frame[], f: PointFilter, length: number, width: number): [number, number][] {
  const ids = f.tracks && f.tracks.length ? new Set(f.tracks) : null;
  const out: [number, number][] = [];
  for (const fr of frames) {
    if (fr.t < f.t0 || fr.t > f.t1) continue;
    for (const p of fr.p) {
      if (p[7] === null || p[8] === null) continue;
      if (ids && !ids.has(p[0])) continue;
      if (f.team && p[6] !== f.team) continue;
      if (inPitch(p[7], p[8], length, width)) out.push([p[7], p[8]]);
    }
  }
  return out;
}
export const MIN_POINTS = 30;
