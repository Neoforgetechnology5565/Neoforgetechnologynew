/** The few OpenCV operations the camera-motion estimator and the pitch calibration need, written out on plain arrays: Shi–Tomasi corners, pyramidal Lucas–Kanade flow, homography by direct linear transform, RANSAC, 3×3 helpers. */
export type M3 = number[]; // row-major 3×3
export const eye3 = (): M3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const mul3 = (a: M3, b: M3): M3 => { const o = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return o; };
export const det3 = (m: M3) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
export function inv3(m: M3): M3 | null { const d = det3(m); if (Math.abs(d) < 1e-14) return null; const [a, b, c, e, f, g, h, i, j] = m; return [(f * j - g * i) / d, (c * i - b * j) / d, (b * g - c * f) / d, (g * h - e * j) / d, (a * j - c * h) / d, (c * e - a * g) / d, (e * i - f * h) / d, (b * h - a * i) / d, (a * f - b * e) / d]; }
export const apply3 = (m: M3, x: number, y: number): [number, number] => { const w = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; };
/** Solve A x = b by Gaussian elimination with partial pivoting; null when singular. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map((r, i) => r[n] / r[i]);
}
type P2 = [number, number];
/** Homography mapping src → dst by least squares on Hartley-normalised points (h33 = 1 after normalisation); exact for 4 points. */
export function homography(src: P2[], dst: P2[]): M3 | null {
  const n = src.length; if (n < 4) return null;
  const norm = (p: P2[]) => { const cx = p.reduce((s, q) => s + q[0], 0) / n, cy = p.reduce((s, q) => s + q[1], 0) / n, d = p.reduce((s, q) => s + Math.hypot(q[0] - cx, q[1] - cy), 0) / n || 1, s = Math.SQRT2 / d; return { T: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1] as M3, pts: p.map((q) => [(q[0] - cx) * s, (q[1] - cy) * s] as P2) }; };
  const A = norm(src), B = norm(dst), AtA = Array.from({ length: 8 }, () => new Array(8).fill(0)), Atb = new Array(8).fill(0);
  for (let i = 0; i < n; i++) { const [x, y] = A.pts[i], [u, v] = B.pts[i], r1 = [x, y, 1, 0, 0, 0, -u * x, -u * y], r2 = [0, 0, 0, x, y, 1, -v * x, -v * y]; for (const [r, t] of [[r1, u], [r2, v]] as [number[], number][]) for (let a = 0; a < 8; a++) { Atb[a] += r[a] * t; for (let b = 0; b < 8; b++) AtA[a][b] += r[a] * r[b]; } }
  const h = solve(AtA, Atb); if (!h) return null; const Hn: M3 = [...h, 1], Ti = inv3(B.T); if (!Ti) return null; const H = mul3(mul3(Ti, Hn), A.T), s = H[8] || 1; return H.map((v) => v / s);
}
/** RANSAC homography (maps src → dst) with a reprojection threshold in dst units; returns the refit on all inliers and the inlier flags. Deterministic (seeded). */
export function ransacHomography(src: P2[], dst: P2[], thr: number, iters = 400): { H: M3; inliers: boolean[] } | null {
  const n = src.length; if (n < 4) return null; let seed = 1234567; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); let best: boolean[] = [], bestN = 0;
  const err = (H: M3, i: number) => { const [x, y] = apply3(H, src[i][0], src[i][1]); return Math.hypot(x - dst[i][0], y - dst[i][1]); };
  for (let it = 0; it < iters; it++) {
    const idx = new Set<number>(); while (idx.size < 4) idx.add(Math.floor(rnd() * n)); const a = [...idx], H = homography(a.map((i) => src[i]), a.map((i) => dst[i])); if (!H || !H.every(Number.isFinite)) continue;
    const fl = src.map((_, i) => err(H, i) <= thr), c = fl.filter(Boolean).length; if (c > bestN) { bestN = c; best = fl; if (c > 0.95 * n) break; }
  }
  if (bestN < 4) return null; const ids = best.map((b, i) => (b ? i : -1)).filter((i) => i >= 0), H = homography(ids.map((i) => src[i]), ids.map((i) => dst[i])); if (!H) return null;
  return { H, inliers: src.map((_, i) => err(H, i) <= thr) };
}
/* ───────── features and optical flow ───────── */
export interface Img { w: number; h: number; d: Float32Array }
export const toImg = (gray: Uint8ClampedArray | Uint8Array, w: number, h: number): Img => ({ w, h, d: Float32Array.from(gray) });
function down(a: Img): Img { const w = Math.max(1, a.w >> 1), h = Math.max(1, a.h >> 1), o = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const x0 = Math.min(a.w - 1, 2 * x), y0 = Math.min(a.h - 1, 2 * y), x1 = Math.min(a.w - 1, x0 + 1), y1 = Math.min(a.h - 1, y0 + 1); o[y * w + x] = (a.d[y0 * a.w + x0] + a.d[y0 * a.w + x1] + a.d[y1 * a.w + x0] + a.d[y1 * a.w + x1]) / 4; } return { w, h, d: o }; }
export const pyramid = (a: Img, levels: number): Img[] => { const p = [a]; for (let i = 0; i < levels; i++) p.push(down(p[p.length - 1])); return p; };
const bil = (a: Img, x: number, y: number) => { if (x < 0 || y < 0 || x > a.w - 1 || y > a.h - 1) return NaN; const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(a.w - 1, x0 + 1), y1 = Math.min(a.h - 1, y0 + 1), fx = x - x0, fy = y - y0; return (a.d[y0 * a.w + x0] * (1 - fx) + a.d[y0 * a.w + x1] * fx) * (1 - fy) + (a.d[y1 * a.w + x0] * (1 - fx) + a.d[y1 * a.w + x1] * fx) * fy; };
/** Shi–Tomasi corners: minimum eigenvalue of the 3×3 structure tensor, local maxima above quality × the image maximum, at least minDist apart, outside the masked-out boxes. */
export function goodFeatures(a: Img, maxCorners: number, quality: number, minDist: number, mask: Uint8Array | null): P2[] {
  const { w, h, d } = a, eig = new Float32Array(w * h), gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = (d[i - w + 1] + 2 * d[i + 1] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - 1] - d[i + w - 1]) / 8; gy[i] = (d[i + w - 1] + 2 * d[i + w] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - w] - d[i - w + 1]) / 8; }
  let mx = 0; for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { let sxx = 0, sxy = 0, syy = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = (y + j) * w + x + i; sxx += gx[k] * gx[k]; sxy += gx[k] * gy[k]; syy += gy[k] * gy[k]; } const e = (sxx + syy - Math.sqrt((sxx - syy) ** 2 + 4 * sxy * sxy)) / 2; eig[y * w + x] = e; if (e > mx) mx = e; }
  const thr = quality * mx, cand: { x: number; y: number; e: number }[] = [];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const e = eig[y * w + x]; if (e < thr || (mask && !mask[y * w + x])) continue; let isMax = true; for (let j = -1; j <= 1 && isMax; j++) for (let i = -1; i <= 1; i++) if ((i || j) && eig[(y + j) * w + x + i] > e) { isMax = false; break; } if (isMax) cand.push({ x, y, e }); }
  cand.sort((p, q) => q.e - p.e); const cell = Math.max(1, minDist), gw = Math.ceil(w / cell), grid = new Map<number, P2[]>(), out: P2[] = [];
  for (const c of cand) { const gx0 = Math.floor(c.x / cell), gy0 = Math.floor(c.y / cell); let ok = true; for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1 && ok; i++) for (const q of grid.get((gy0 + j) * gw + gx0 + i) ?? []) if (Math.hypot(q[0] - c.x, q[1] - c.y) < minDist) { ok = false; break; } if (!ok) continue; const key = gy0 * gw + gx0; (grid.get(key) ?? grid.set(key, []).get(key)!).push([c.x, c.y]); out.push([c.x, c.y]); if (out.length >= maxCorners) break; }
  return out;
}
/** Pyramidal Lucas–Kanade: track points from `prev` to `next`. Returns the new positions and a found flag per point. */
export function lkTrack(prevP: Img[], nextP: Img[], pts: P2[], win = 10, iters = 30, eps = 0.01): { pts: P2[]; ok: boolean[] } {
  const L = prevP.length - 1, out: P2[] = [], ok: boolean[] = [];
  for (const p of pts) {
    let gx = 0, gy = 0, good = true;
    for (let l = L; l >= 0 && good; l--) {
      const A = prevP[l], B = nextP[l], s = 2 ** l, px = p[0] / s, py = p[1] / s; let sxx = 0, sxy = 0, syy = 0; const gxs: number[] = [], gys: number[] = [], ts: number[] = [];
      for (let j = -win; j <= win; j++) for (let i = -win; i <= win; i++) { const x = px + i, y = py + j, a1 = bil(A, x + 1, y), a0 = bil(A, x - 1, y), b1 = bil(A, x, y + 1), b0 = bil(A, x, y - 1), t = bil(A, x, y); if ([a1, a0, b1, b0, t].some(Number.isNaN)) { gxs.push(NaN); gys.push(NaN); ts.push(NaN); continue; } const ix = (a1 - a0) / 2, iy = (b1 - b0) / 2; gxs.push(ix); gys.push(iy); ts.push(t); sxx += ix * ix; sxy += ix * iy; syy += iy * iy; }
      const det = sxx * syy - sxy * sxy, n = (2 * win + 1) ** 2, minEig = (sxx + syy - Math.sqrt((sxx - syy) ** 2 + 4 * sxy * sxy)) / 2 / n; if (det < 1e-9 || minEig < 1e-4) { if (l === 0) good = false; continue; }
      for (let it = 0; it < iters; it++) { let bx = 0, by = 0, k = 0; for (let j = -win; j <= win; j++) for (let i = -win; i <= win; i++, k++) { if (Number.isNaN(ts[k])) continue; const v = bil(B, px + i + gx, py + j + gy); if (Number.isNaN(v)) continue; const dI = ts[k] - v; bx += dI * gxs[k]; by += dI * gys[k]; } const dx = (syy * bx - sxy * by) / det, dy = (sxx * by - sxy * bx) / det; gx += dx; gy += dy; if (dx * dx + dy * dy < eps * eps) break; }
      if (l > 0) { gx *= 2; gy *= 2; }
    }
    const nx = p[0] + gx, ny = p[1] + gy; const inside = nx >= 0 && ny >= 0 && nx <= prevP[0].w - 1 && ny <= prevP[0].h - 1; ok.push(good && inside && Number.isFinite(nx)); out.push([nx, ny]);
  }
  return { pts: out, ok };
}
