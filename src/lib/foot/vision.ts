/**
 * Calibrated top-view foot measurement. Pure TypeScript, no dependencies: the same code runs in the browser (live capture checks)
 * and on the server (the measurement of record).
 *
 * Method: a sheet of paper of known size (A4 or US Letter) lies on the floor under the foot. The paper is found as the largest bright,
 * low-saturation rectangle; its four corners give a homography from the image to the paper plane in millimetres. The image is rectified to
 * that plane, the foot is segmented from the paper by colour distance, and length and widths are measured on the silhouette.
 *
 * Known limits (also shown to users): a single top view measures the silhouette seen from above, which sits above the paper plane, so
 * the numbers can read larger than the true sole outline (parallax). No girth, instep or arch height is measured.
 */
import { ASSUMED_FOV_DEG, ASSUMED_HEIGHT_UNCERTAINTY_MM, ASSUMED_SILHOUETTE_HEIGHT_MM, PAPER_MM, type Analysis, type Calibration, type FootMeasurement, type Img, type ImageQuality, type PaperKind, type Pt } from "./types";

/* ───────── small numeric helpers ───────── */
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function downscale(img: Img, maxSide: number): Img {
  const k = Math.max(img.w, img.h) / maxSide; if (k <= 1) return img.ch === 3 ? img : toRgb(img);
  const w = Math.max(1, Math.round(img.w / k)), h = Math.max(1, Math.round(img.h / k)); const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) { const y0 = Math.floor(y * k), y1 = Math.min(img.h, Math.max(y0 + 1, Math.floor((y + 1) * k)));
    for (let x = 0; x < w; x++) { const x0 = Math.floor(x * k), x1 = Math.min(img.w, Math.max(x0 + 1, Math.floor((x + 1) * k))); let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * img.w + xx) * img.ch; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
      const o = (y * w + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; } }
  return { w, h, ch: 3, data: out };
}
function toRgb(img: Img): Img { if (img.ch === 3) return img; const out = new Uint8Array(img.w * img.h * 3); for (let i = 0, j = 0; i < img.data.length; i += 4, j += 3) { out[j] = img.data[i]; out[j + 1] = img.data[i + 1]; out[j + 2] = img.data[i + 2]; } return { w: img.w, h: img.h, ch: 3, data: out }; }

function otsu(hist: number[]): number { const total = hist.reduce((a, b) => a + b, 0); let sum = 0; hist.forEach((c, i) => (sum += i * c)); let sB = 0, wB = 0, best = 0, thr = 0;
  for (let t = 0; t < hist.length; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = t; } } return thr; }

/** 4-connected component labelling. Returns labels (0 = background) and per-label area. */
export function label(mask: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(w * h); const areas: number[] = [0]; let next = 0; const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) { if (!mask[s] || labels[s]) continue; next++; let area = 0; stack.push(s); labels[s] = next;
    while (stack.length) { const p = stack.pop()!; area++; const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = next; stack.push(p - 1); } if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = next; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = next; stack.push(p - w); } if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = next; stack.push(p + w); } }
    areas.push(area); }
  return { labels, areas, count: next };
}
function erode(m: Uint8Array, w: number, h: number, r: number) { const o = new Uint8Array(m.length); for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) { let ok = 1; for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) if (!m[(y + dy) * w + x + dx]) { ok = 0; break; } o[y * w + x] = ok; } return o; }
function dilate(m: Uint8Array, w: number, h: number, r: number) { const o = new Uint8Array(m.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!m[y * w + x]) continue; for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) o[yy * w + xx] = 1; } } } return o; }

export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y); if (p.length < 3) return p; const cr = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up: Pt[] = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
const polyArea = (p: Pt[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return a / 2; };
function dp(pts: Pt[], eps: number): Pt[] { if (pts.length < 3) return pts; const a = pts[0], b = pts[pts.length - 1]; let best = 0, idx = 0; const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len; if (d > best) { best = d; idx = i; } }
  if (best <= eps) return [a, b]; const l = dp(pts.slice(0, idx + 1), eps), r = dp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
/** Simplify a closed polygon with Douglas-Peucker. */
export function simplifyClosed(poly: Pt[], eps: number): Pt[] { if (poly.length < 4) return poly; const i0 = 0; let i1 = 0, best = -1; for (let i = 1; i < poly.length; i++) { const d = dist(poly[0], poly[i]); if (d > best) { best = d; i1 = i; } } const A = poly.slice(i0, i1 + 1), B = poly.slice(i1).concat([poly[0]]); return dp(A, eps).slice(0, -1).concat(dp(B, eps).slice(0, -1)); }
function approxQuad(hull: Pt[]): Pt[] | null { const per = hull.reduce((a, p, i) => a + dist(p, hull[(i + 1) % hull.length]), 0); let lo = 0.002 * per, hi = 0.2 * per, res: Pt[] | null = null;
  for (let it = 0; it < 30; it++) { const eps = (lo + hi) / 2; const s = simplifyClosed(hull, eps); if (s.length === 4) { res = s; hi = eps; } else if (s.length > 4) lo = eps; else hi = eps; if (hi - lo < 1e-3 * per) break; }
  return res; }

function tlsLine(pts: Pt[]) { const n = pts.length; let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y; } cx /= n; cy /= n; let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); const d = { x: Math.cos(th), y: Math.sin(th) }; let rss = 0; for (const p of pts) { const e = -(p.x - cx) * d.y + (p.y - cy) * d.x; rss += e * e; } return { c: { x: cx, y: cy }, d, rms: Math.sqrt(rss / n) }; }
function intersect(a: { c: Pt; d: Pt }, b: { c: Pt; d: Pt }): Pt | null { const det = a.d.x * -b.d.y - a.d.y * -b.d.x; if (Math.abs(det) < 1e-9) return null; const rx = b.c.x - a.c.x, ry = b.c.y - a.c.y; const t = (rx * -b.d.y - ry * -b.d.x) / det; return { x: a.c.x + a.d.x * t, y: a.c.y + a.d.y * t }; }

/* ───────── homography ───────── */
export type H3 = number[]; // row-major 3x3
function solve(A: number[][], b: number[]): number[] | null { const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map((r, i) => r[n] / r[i]); }
/** Homography H such that dst ≈ H · src for four point pairs. */
export function homography(src: Pt[], dst: Pt[]): H3 | null { const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) { const { x, y } = src[i], { x: u, y: v } = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  const h = solve(A, b); return h ? [...h, 1] : null; }
export function applyH(H: H3, x: number, y: number): Pt { const w = H[6] * x + H[7] * y + H[8]; return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w }; }
export function invertH(H: H3): H3 { const [a, b, c, d, e, f, g, h, i] = H; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C; return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det]; }

/* ───────── image quality ───────── */
export function gray(img: Img): Float32Array { const g = new Float32Array(img.w * img.h); for (let i = 0, p = 0; p < g.length; p++, i += img.ch) g[p] = lum(img.data[i], img.data[i + 1], img.data[i + 2]); return g; }
export function sharpness(img: Img): number { const s = downscale(img, 480); const g = gray(s); const { w, h } = s; let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]; sum += l; sum2 += l * l; n++; } const m = sum / n; return sum2 / n - m * m; }

/* ───────── paper detection ───────── */
export interface PaperDetection { found: boolean; reason?: string; corners?: Pt[]; paper?: PaperKind; autoChosen?: boolean; tilt?: number; lineFitRmsPx?: number; coverage?: number; brightness?: number; paperBrightness?: number; sharp?: number }
const orderCorners = (q: Pt[]): Pt[] | null => { let p = q; if (polyArea(p) < 0) p = [...p].reverse(); const s = p.map((a, i) => dist(a, p[(i + 1) % 4])); return s[0] + s[2] >= s[1] + s[3] ? p : [p[1], p[2], p[3], p[0]]; };
const tiltOf = (c: Pt[]) => { const s = c.map((a, i) => dist(a, c[(i + 1) % 4])); return Math.max(Math.max(s[0], s[2]) / Math.min(s[0], s[2]), Math.max(s[1], s[3]) / Math.min(s[1], s[3])); };

/** Find a sheet of paper. `img` may be any size; work is done on a ≤640 px copy and corners are returned in `img` pixels. */
export function detectPaper(img: Img, paperPref: PaperKind | "auto" = "auto"): PaperDetection {
  const sm = downscale(img, 640); const sc = img.w / sm.w; const { w, h } = sm; const n = w * h; const V = new Uint8Array(n), S = new Float32Array(n); const hist = new Array(256).fill(0);
  for (let i = 0, p = 0; p < n; p++, i += 3) { const r = sm.data[i], g = sm.data[i + 1], b = sm.data[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); V[p] = mx; S[p] = mx ? (mx - mn) / mx : 0; hist[mx]++; }
  const t = Math.max(110, otsu(hist)); const mask0 = new Uint8Array(n); let bright = 0; for (let p = 0; p < n; p++) { const m = V[p] >= t && S[p] <= 0.34 ? 1 : 0; mask0[p] = m; bright += V[p]; }
  const brightness = bright / n; const sharp = sharpness(sm);
  const mask = dilate(erode(mask0, w, h, 2), w, h, 2); const { labels, areas, count } = label(mask, w, h);
  let best: { id: number; score: number; quad: Pt[]; hullArea: number } | null = null;
  for (let id = 1; id <= count; id++) { if (areas[id] < 0.04 * n) continue; const pts: Pt[] = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (labels[p] !== id) continue; if ((x === 0 || labels[p - 1] !== id) || (x === w - 1 || labels[p + 1] !== id) || (y === 0 || labels[p - w] !== id) || (y === h - 1 || labels[p + w] !== id)) pts.push({ x, y }); }
    const hull = convexHull(pts); if (hull.length < 4) continue; const quad = approxQuad(hull); if (!quad) continue; const qa = Math.abs(polyArea(quad)); const fill = areas[id] / qa; const hullFill = Math.abs(polyArea(hull)) / qa;
    if (qa < 0.04 * n || hullFill > 1.12) continue; const score = qa * Math.min(1, fill + 0.15) * (1 - Math.abs(1 - hullFill)); if (!best || score > best.score) best = { id, score, quad, hullArea: qa }; }
  if (!best) return { found: false, reason: "No sheet of paper found. Lay a plain white A4 or US Letter sheet flat on a darker floor, with all four corners visible.", brightness, sharp };
  // refine corners by fitting a line to the boundary pixels of each side
  let pbs = 0, pbn = 0; for (let p = 0; p < n; p++) if (labels[p] === best.id) { pbs += V[p]; pbn++; } const paperBrightness = pbn ? pbs / pbn : brightness;
  const rough = orderCorners(best.quad)!; const lines: { c: Pt; d: Pt; rms: number }[] = []; const diag = Math.hypot(w, h); const tol = Math.max(2.5, 0.012 * diag); const bp: Pt[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (labels[p] !== best.id) continue; if (x === 0 || labels[p - 1] !== best.id || x === w - 1 || labels[p + 1] !== best.id || y === 0 || labels[p - w] !== best.id || y === h - 1 || labels[p + w] !== best.id) bp.push({ x, y }); }
  for (let i = 0; i < 4; i++) { const a = rough[i], b = rough[(i + 1) % 4]; const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); const sel: Pt[] = [];
    for (const q of bp) { const tt = ((q.x - a.x) * dx + (q.y - a.y) * dy) / (len * len); if (tt < 0.12 || tt > 0.88) continue; const e = Math.abs((q.x - a.x) * dy - (q.y - a.y) * dx) / len; if (e <= tol) sel.push(q); }
    if (sel.length < 12) { lines.push({ c: a, d: { x: dx / len, y: dy / len }, rms: 0 }); continue; } lines.push(tlsLine(sel)); }
  const corners: Pt[] = []; for (let i = 0; i < 4; i++) { const p = intersect(lines[(i + 3) % 4], lines[i]); corners.push(p && dist(p, rough[i]) < 0.05 * diag ? p : rough[i]); }
  const ordered = orderCorners(corners)!; const tilt = tiltOf(ordered); const rms = lines.reduce((a, l) => a + l.rms, 0) / 4;
  const s = ordered.map((c, i) => dist(c, ordered[(i + 1) % 4])); const ratio = ((s[0] + s[2]) / 2) / ((s[1] + s[3]) / 2); let paper: PaperKind; let autoChosen = false;
  if (paperPref === "auto") { paper = Math.abs(ratio - 297 / 210) <= Math.abs(ratio - 279.4 / 215.9) ? "a4" : "letter"; autoChosen = true; } else paper = paperPref;
  const out = ordered.map((c) => ({ x: c.x * sc, y: c.y * sc })); const cov = best.hullArea / n;
  if (Math.abs(ratio - PAPER_MM[paper].w / PAPER_MM[paper].h) / (PAPER_MM[paper].w / PAPER_MM[paper].h) > 0.45) return { found: false, reason: "The bright shape found does not look like a sheet of paper of the selected size. Check the paper size setting and the framing.", brightness, sharp };
  return { found: true, corners: out, paper, autoChosen, tilt, lineFitRmsPx: rms * sc, coverage: cov, brightness, paperBrightness, sharp };
}

/* ───────── rectification and segmentation ───────── */
function rectify(img: Img, Hpi: H3, wMm: number, hMm: number, S: number): Img { const W = Math.round(wMm * S), Hh = Math.round(hMm * S); const out = new Uint8Array(W * Hh * 3);
  for (let v = 0; v < Hh; v++) for (let u = 0; u < W; u++) { const p = applyH(Hpi, (u + 0.5) / S, (v + 0.5) / S); const x = p.x - 0.5, y = p.y - 0.5; const x0 = Math.floor(x), y0 = Math.floor(y); const o = (v * W + u) * 3;
    if (x0 < 0 || y0 < 0 || x0 >= img.w - 1 || y0 >= img.h - 1) { out[o] = out[o + 1] = out[o + 2] = 0; continue; } const fx = x - x0, fy = y - y0;
    for (let c = 0; c < 3; c++) { const i00 = (y0 * img.w + x0) * img.ch + c, i10 = i00 + img.ch, i01 = i00 + img.w * img.ch, i11 = i01 + img.ch; out[o + c] = img.data[i00] * (1 - fx) * (1 - fy) + img.data[i10] * fx * (1 - fy) + img.data[i01] * (1 - fx) * fy + img.data[i11] * fx * fy; } }
  return { w: W, h: Hh, ch: 3, data: out }; }

function fillHoles(m: Uint8Array, w: number, h: number) { const inv = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1; const { labels, count } = label(inv, w, h); const border = new Set<number>(); for (let x = 0; x < w; x++) { border.add(labels[x]); border.add(labels[(h - 1) * w + x]); } for (let y = 0; y < h; y++) { border.add(labels[y * w]); border.add(labels[y * w + w - 1]); }
  const o = new Uint8Array(m); for (let p = 0; p < m.length; p++) if (!m[p] && labels[p] && !border.has(labels[p])) o[p] = 1; void count; return o; }

export interface Segmentation { ok: boolean; reason?: string; mask?: Uint8Array; w: number; h: number; touchesEdge: boolean; separation: number; areaRatio: number }
export function segmentFoot(rect: Img, S: number): Segmentation {
  const { w, h } = rect; const m = Math.round(6 * S); const n = w * h; const L = new Float32Array(n); for (let i = 0, p = 0; p < n; p++, i += 3) L[p] = lum(rect.data[i], rect.data[i + 1], rect.data[i + 2]);
  const inner: number[] = []; for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) inner.push(L[y * w + x]); const sorted = Float32Array.from(inner).sort(); const p65 = sorted[Math.floor(sorted.length * 0.65)];
  const rs: number[] = [], gs: number[] = [], bs: number[] = []; for (let y = m; y < h - m; y += 2) for (let x = m; x < w - m; x += 2) { const p = y * w + x; if (L[p] >= p65) { rs.push(rect.data[p * 3]); gs.push(rect.data[p * 3 + 1]); bs.push(rect.data[p * 3 + 2]); } }
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0; const pr = med(rs), pg = med(gs), pb = med(bs); const pl = lum(pr, pg, pb) || 1; const pcR = pr - pl, pcB = pb - pl;
  const score = new Uint8Array(n); const hist = new Array(256).fill(0);
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) { const p = y * w + x; const r = rect.data[p * 3], g = rect.data[p * 3 + 1], b = rect.data[p * 3 + 2]; const l = lum(r, g, b); const dL = Math.max(0, (pl - l) / pl); const dC = Math.hypot(r - l - pcR, b - l - pcB);
    let s: number; if (dL > 0.45) s = dL * 255; else if (dC < 10) s = dL * 255 * 0.5; else s = Math.max(dL * 255, dC * 1.6); s = Math.min(255, s); score[p] = s; hist[Math.round(s)]++; }
  const thr = Math.max(otsu(hist), 22); let fgN = 0, fgS = 0, bgN = 0, bgS = 0; const mask0 = new Uint8Array(n); for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) { const p = y * w + x; if (score[p] > thr) { mask0[p] = 1; fgN++; fgS += score[p]; } else { bgN++; bgS += score[p]; } }
  const separation = fgN && bgN ? fgS / fgN - bgS / bgN : 0; const areaRatio = fgN / n;
  if (areaRatio < 0.05 || separation < 25) return { ok: false, reason: "The foot could not be told apart from the paper. Use a bare foot or a dark sock (white socks vanish on white paper), and avoid strong shadows.", w, h, touchesEdge: false, separation, areaRatio };
  if (areaRatio > 0.5) return { ok: false, reason: "Too much of the sheet was detected as foot. Check that only the foot (and no shoes, bags or shadows) is on the paper.", w, h, touchesEdge: false, separation, areaRatio };
  let mk = dilate(erode(mask0, w, h, 1), w, h, 1); mk = erode(dilate(mk, w, h, 1), w, h, 1); const { labels, areas, count } = label(mk, w, h); let bi = 0; for (let i = 1; i <= count; i++) if (areas[i] > (areas[bi] || 0)) bi = i;
  if (!bi) return { ok: false, reason: "No foot-sized region was found on the paper.", w, h, touchesEdge: false, separation, areaRatio };
  let out = new Uint8Array(n); for (let p = 0; p < n; p++) if (labels[p] === bi) out[p] = 1; out = fillHoles(out, w, h);
  const e = m + Math.round(3 * S); let touches = false; for (let y = 0; y < h && !touches; y++) for (let x = 0; x < w; x++) { if (!out[y * w + x]) continue; if (x <= e || y <= e || x >= w - 1 - e || y >= h - 1 - e) { touches = true; break; } }
  return { ok: true, mask: out, w, h, touchesEdge: touches, separation, areaRatio: out.reduce((a, v) => a + v, 0) / n };
}

function traceContour(mask: Uint8Array, w: number, h: number): Pt[] { let sx = -1, sy = -1; for (let y = 0; y < h && sx < 0; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { sx = x; sy = y; break; } if (sx < 0) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0); const pts: Pt[] = []; let x = sx, y = sy, d = 7; let guard = 0;
  do { pts.push({ x, y }); let found = false; for (let k = 0; k < 8; k++) { const nd = (d + 6 + k) % 8; const nx = x + dirs[nd][0], ny = y + dirs[nd][1]; if (at(nx, ny)) { x = nx; y = ny; d = nd; found = true; break; } } if (!found) break; } while ((x !== sx || y !== sy) && ++guard < w * h * 4);
  return pts; }

/* ───────── measurement ───────── */
export function measureMask(mask: Uint8Array, w: number, h: number, S: number, camDistMm: number): FootMeasurement | null {
  let n = 0, mx = 0, my = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { n++; mx += x; my += y; } if (n < 50) return null; mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { const dx = x - mx, dy = y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); const ax = { x: Math.cos(th), y: Math.sin(th) }, nx = { x: -ax.y, y: ax.x };
  let aMin = Infinity, aMax = -Infinity; const bins = new Map<number, { lo: number; hi: number }>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!mask[y * w + x]) continue; const a = ((x + 0.5 - mx) * ax.x + (y + 0.5 - my) * ax.y) / S, b = ((x + 0.5 - mx) * nx.x + (y + 0.5 - my) * nx.y) / S; if (a < aMin) aMin = a; if (a > aMax) aMax = a; const k = Math.floor(a); const e = bins.get(k); if (!e) bins.set(k, { lo: b, hi: b }); else { if (b < e.lo) e.lo = b; if (b > e.hi) e.hi = b; } }
  const length = aMax - aMin; const keys = [...bins.keys()].sort((a, b) => a - b); const widthAt = (a: number) => { const e = bins.get(Math.floor(a)); return e ? e.hi - e.lo : 0; };
  // which end is the toe? the forefoot is the wider part
  const w25 = avgW(bins, aMin + 0.2 * length, aMin + 0.3 * length), w75 = avgW(bins, aMin + 0.7 * length, aMin + 0.8 * length); const toeAtMax = w75 >= w25;
  const t = (frac: number) => (toeAtMax ? aMin + frac * length : aMax - frac * length); // frac from heel
  let wMaxV = 0, wMaxA = 0; for (const k of keys) { const a = k + 0.5; const f = (a - aMin) / length; if (f < 0.1 || f > 0.97) continue; const ww = widthAt(a); if (ww > wMaxV) { wMaxV = ww; wMaxA = a; } }
  let ball = 0; for (const k of keys) { const f = toeAtMax ? (k + 0.5 - aMin) / length : (aMax - k - 0.5) / length; if (f >= 0.55 && f <= 0.85) ball = Math.max(ball, widthAt(k + 0.5)); }
  const heel = avgW(bins, Math.min(t(0.1), t(0.22)), Math.max(t(0.1), t(0.22)));
  const bAt = bins.get(Math.floor(wMaxA))!; const mid = (bAt.lo + bAt.hi) / 2; void mid; const toPlane = (a: number, b: number): Pt => ({ x: mx / S + ax.x * a + nx.x * b, y: my / S + ax.y * a + nx.y * b });
  const heelEnd = toeAtMax ? aMin : aMax, toeEnd = toeAtMax ? aMax : aMin; const cb = (a: number) => { const e = bins.get(Math.floor(a)); return e ? (e.lo + e.hi) / 2 : 0; };
  const contour = traceContour(mask, w, h).map((p) => ({ x: (p.x + 0.5) / S, y: (p.y + 0.5) / S })); const outline = simplifyClosed(contour, 0.6);
  const d = camDistMm > 0 ? camDistMm : 600; const sc = 1; const bound = (ASSUMED_HEIGHT_UNCERTAINTY_MM / d) * length;
  const cxm = 0, cym = 0; const sp = (p: Pt): Pt => p; void cxm; void cym;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { lengthMm: r1(length * sc), widthMm: r1(wMaxV * sc), ballWidthMm: r1(ball * sc), heelWidthMm: r1(heel * sc), areaCm2: r1((n / (S * S) / 100) * sc * sc), rawLengthMm: r1(length), rawWidthMm: r1(wMaxV), parallaxScale: 1, widthLengthRatio: Math.round((wMaxV / length) * 1000) / 1000, parallaxBoundMm: r1(bound), resolutionMm: r1(1 / S),
    axis: { angleDeg: Math.round(th * 18000 / Math.PI) / 100, toe: sp(toPlane(toeEnd, cb(toeEnd))), heel: sp(toPlane(heelEnd, cb(heelEnd))), widestAt: r1(Math.abs(wMaxA - heelEnd) * sc), widestA: sp(toPlane(wMaxA, bAt.lo)), widestB: sp(toPlane(wMaxA, bAt.hi)) }, outlineMm: outline.map((p) => { const q = sp(p); return { x: r1(q.x), y: r1(q.y) }; }), rawOutlineMm: [] };
}
function avgW(bins: Map<number, { lo: number; hi: number }>, a0: number, a1: number) { let s = 0, c = 0; for (let a = Math.floor(a0); a <= Math.floor(a1); a++) { const e = bins.get(a); if (e) { s += e.hi - e.lo; c++; } } return c ? s / c : 0; }


/** Camera height above the paper and the point of the paper directly under the camera, from the homography and an ASSUMED field of view (principal point = image centre, square pixels). */
export function cameraPose(Hpi: H3, imgW: number, imgH: number, fovDeg: number): { height: number; nadir: Pt } | null {
  const f = imgW / (2 * Math.tan((fovDeg * Math.PI) / 360)); const cx = imgW / 2, cy = imgH / 2;
  const m = [0, 1, 2].map((c) => [(Hpi[c] - cx * Hpi[6 + c]) / f, (Hpi[3 + c] - cy * Hpi[6 + c]) / f, Hpi[6 + c]]); // columns m1,m2,m3 of K^-1 H
  const n1 = Math.hypot(m[0][0], m[0][1], m[0][2]); if (!n1) return null; let lam = 1 / n1; if (lam * m[2][2] < 0) lam = -lam;
  const r1 = m[0].map((v) => v * lam), r2 = m[1].map((v) => v * lam), t = m[2].map((v) => v * lam); const r3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const C = [-dot(r1, t), -dot(r2, t), -dot(r3, t)]; const height = Math.abs(C[2]);
  return Number.isFinite(height) && height > 50 ? { height, nadir: { x: C[0], y: C[1] } } : null;
}
/** Undo top-view parallax: a silhouette at height h looks pushed away from the camera nadir by d/(d−h). Returns a mask on the same grid with that scaling removed. */
export function parallaxCorrect(mask: Uint8Array, w: number, h: number, S: number, pose: { height: number; nadir: Pt }, hMm: number): Uint8Array {
  const k = pose.height / (pose.height - hMm); const out = new Uint8Array(mask.length); const nx = pose.nadir.x * S, ny = pose.nadir.y * S;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.round(nx + (x + 0.5 - nx) * k - 0.5), sy = Math.round(ny + (y + 0.5 - ny) * k - 0.5); if (sx >= 0 && sy >= 0 && sx < w && sy < h && mask[sy * w + sx]) out[y * w + x] = 1; }
  return out;
}

/* ───────── full pipeline ───────── */
export interface AnalyzeOptions { paper?: PaperKind | "auto"; corners?: Pt[]; pxPerMmOut?: number; onStage?: (stage: "calibrating" | "measuring") => void }
export interface AnalyzeResult { analysis: Analysis; rectified?: Img; mask?: Uint8Array; H?: H3 }

export function analyzeFootImage(img: Img, opt: AnalyzeOptions = {}): AnalyzeResult {
  const size = { w: img.w, h: img.h }; const warnings: string[] = []; const fail = (stage: Analysis["stage"], reason: string, quality?: ImageQuality, calibration?: Calibration): AnalyzeResult => ({ analysis: { ok: false, stage, reason, warnings, grade: "unusable", quality, calibration, imageSize: size } });
  if (img.w < 600 || img.h < 600) return fail("decoded", "The image is too small (minimum 600 px on each side). Take the photo at the phone's normal resolution.");
  const S = opt.pxPerMmOut ?? 2; let paper: PaperKind; let corners: Pt[]; let method: Calibration["method"]; let autoChosen = false; let tilt: number, rms = 0, cover = 0, bright = 0, sharp = 0;
  opt.onStage?.("calibrating"); const det = detectPaper(img, opt.paper ?? "auto"); bright = det.paperBrightness ?? det.brightness ?? 0; sharp = det.sharp ?? sharpness(img);
  if (opt.corners && opt.corners.length === 4) { const c = orderCorners(opt.corners); if (!c) return fail("paper", "The corner positions are not a valid four-sided shape."); corners = c; paper = opt.paper && opt.paper !== "auto" ? opt.paper : det.paper ?? "a4"; method = "manual-corners"; tilt = tiltOf(c); cover = Math.abs(polyArea(c)) / (img.w * img.h); }
  else { const q0: ImageQuality = quality(sharp, bright, 0); if (!det.found || !det.corners) return fail("paper", det.reason ?? "No sheet of paper found.", q0); corners = det.corners; paper = det.paper!; autoChosen = !!det.autoChosen; method = "auto-paper"; tilt = det.tilt!; rms = det.lineFitRmsPx ?? 0; cover = det.coverage ?? 0; }
  const P = PAPER_MM[paper]; const Hpi = homography([{ x: 0, y: 0 }, { x: P.w, y: 0 }, { x: P.w, y: P.h }, { x: 0, y: P.h }], corners); if (!Hpi) return fail("paper", "The paper corners could not be used for calibration.");
  const sides = corners.map((c, i) => dist(c, corners[(i + 1) % 4])); const pxPerMm = ((sides[0] + sides[2]) / 2) / P.w; const fov = (ASSUMED_FOV_DEG * Math.PI) / 180; const pose = cameraPose(Hpi, img.w, img.h, ASSUMED_FOV_DEG); const camDist = pose ? pose.height : (img.w / (2 * Math.tan(fov / 2))) / pxPerMm;
  const cal: Calibration = { method, paper, paperAutoChosen: autoChosen, corners, tilt: Math.round(tilt * 1000) / 1000, lineFitRmsPx: Math.round(rms * 100) / 100, pxPerMm: Math.round(pxPerMm * 1000) / 1000, estCameraDistanceMm: Math.round(camDist), assumedFovDeg: ASSUMED_FOV_DEG };
  const q = quality(sharp, bright, cover); if (q.sharpnessLabel === "blurry") warnings.push("The photo is blurry; hold the phone steady and tap to focus before capturing."); else if (q.sharpnessLabel === "soft") warnings.push("The photo is slightly soft; a sharper photo gives a cleaner outline.");
  if (q.lighting === "dark") warnings.push("The photo is dark; use brighter, even light."); if (q.lighting === "overexposed") warnings.push("The paper is overexposed; reduce glare.");
  if (tilt > 1.35) warnings.push("The phone was held at a strong angle; keep it pointing straight down for better accuracy."); if (cover < 0.12) warnings.push("The paper fills little of the frame; move closer (without zooming) so the sheet is larger.");
  if (camDist < 450) warnings.push("The camera looks very close to the paper, which magnifies the foot's height (parallax). Hold the phone higher if you can."); if (method === "auto-paper" && rms > 3) warnings.push("The paper edges look curved or uneven; flatten the sheet.");
  opt.onStage?.("measuring"); const rect = rectify(img, Hpi, P.w, P.h, S); const seg = segmentFoot(rect, S);
  if (!seg.ok || !seg.mask) return { analysis: { ok: false, stage: "segmentation", reason: seg.reason, warnings, grade: "unusable", quality: q, calibration: cal, imageSize: size }, rectified: rect, H: Hpi };
  if (seg.touchesEdge) warnings.push("The foot reaches the edge of the paper, so its length may be cut short. Use a larger sheet or place the foot fully inside.");
  const raw = measureMask(seg.mask, seg.w, seg.h, S, camDist); const cmask = pose ? parallaxCorrect(seg.mask, seg.w, seg.h, S, pose, ASSUMED_SILHOUETTE_HEIGHT_MM) : seg.mask; const meas = raw && pose ? measureMask(cmask, seg.w, seg.h, S, camDist) : raw; if (raw && meas) { if (!pose) meas.rawOutlineMm = raw.outlineMm; meas.rawOutlineMm = raw.outlineMm; meas.rawLengthMm = raw.lengthMm; meas.rawWidthMm = raw.widthMm; meas.parallaxScale = Math.round((meas.lengthMm / raw.lengthMm) * 10000) / 10000; } if (!meas) return { analysis: { ok: false, stage: "segmentation", reason: "The foot region was too small to measure.", warnings, grade: "unusable", quality: q, calibration: cal, imageSize: size }, rectified: rect, H: Hpi };
  if (meas.lengthMm < 120 || meas.lengthMm > 340) warnings.push(`The measured length (${meas.lengthMm} mm) is outside the usual adult range; check the paper size setting and that only one foot is on the paper.`);
  if (meas.parallaxBoundMm > 7) warnings.push(`At this camera distance the parallax correction is uncertain by up to about ${meas.parallaxBoundMm} mm. Hold the phone higher for a tighter result.`);
  const major = seg.touchesEdge || q.sharpnessLabel === "blurry" || q.lighting !== "ok"; const grade: Analysis["grade"] = major || warnings.length >= 3 ? "poor" : warnings.length >= 1 ? "fair" : "good";
  return { analysis: { ok: true, stage: "measured", warnings, grade, quality: q, calibration: cal, measurement: meas, imageSize: size }, rectified: rect, mask: cmask, H: Hpi };
}
export function quality(sharp: number, brightness: number, coverage: number): ImageQuality { return { sharpness: Math.round(sharp), sharpnessLabel: sharp < 25 ? "blurry" : sharp < 70 ? "soft" : "sharp", brightness: Math.round(brightness), lighting: brightness < 110 ? "dark" : brightness > 250 ? "overexposed" : "ok", paperCoverage: Math.round(coverage * 1000) / 1000 }; }
