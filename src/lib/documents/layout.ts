/** Page structure from positioned text items: reading order, headings and ruled tables (port of services/document-ocr/app/layout.py, plus the OpenCV line morphology it uses, written out on plain arrays). Rule-based and labelled as such. */
import { gaussian, type Gray } from "@/lib/med/ops";
import type { RawItem } from "./extract";

export type Box = [number, number, number, number];
export interface Item extends RawItem { id: string; source: string; conf: number | null; row?: number; in_table?: boolean }
const height = (i: RawItem) => i.bbox[3] - i.bbox[1], cy = (i: RawItem) => (i.bbox[1] + i.bbox[3]) / 2, cx = (i: RawItem) => (i.bbox[0] + i.bbox[2]) / 2;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
/** Group items that share a text line (vertical overlap), top to bottom and left to right. */
export function rows<T extends RawItem>(items: T[]): T[][] {
  const out: T[][] = [];
  for (const it of [...items].sort((a, b) => cy(a) - cy(b))) { const c = cy(it); const r = out.find((r) => Math.abs(c - mean(r.map(cy))) <= 0.5 * Math.min(height(it), Math.min(...r.map(height)))); if (r) r.push(it); else out.push([it]); }
  for (const r of out) r.sort((a, b) => a.bbox[0] - b.bbox[0]); out.sort((a, b) => mean(a.map(cy)) - mean(b.map(cy))); return out;
}
export const rowText = (r: RawItem[]) => r.map((i) => i.text).join("  ");

export interface Grid { ys: number[]; xs: number[]; w: number; h: number }
function clusters(idx: number[], gap = 3): [number, number][] { if (!idx.length) return []; const out: [number, number][] = []; let s = idx[0], p = idx[0]; for (const v of idx.slice(1)) { if (v - p > gap) { out.push([s, p]); s = v; } p = v; } out.push([s, p]); return out; }
/** Keep only runs of set pixels at least k long along one axis (equivalent to a morphological opening with a 1×k rectangle). */
function keepRuns(m: Uint8Array, w: number, h: number, k: number, horizontal: boolean): Uint8Array {
  const o = new Uint8Array(w * h), n1 = horizontal ? h : w, n2 = horizontal ? w : h;
  for (let a = 0; a < n1; a++) { let s = -1; for (let b = 0; b <= n2; b++) { const set = b < n2 && m[horizontal ? a * w + b : b * w + a] === 1; if (set && s < 0) s = b; else if (!set && s >= 0) { if (b - s >= k) for (let q = s; q < b; q++) o[horizontal ? a * w + q : q * w + a] = 1; s = -1; } } }
  return o;
}
function dilate5(m: Uint8Array, w: number, h: number): Uint8Array {
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -2; i <= 2 && !v; i++) { const xx = x + i; if (xx >= 0 && xx < w && m[y * w + xx]) v = 1; } t[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let j = -2; j <= 2 && !v; j++) { const yy = y + j; if (yy >= 0 && yy < h && t[yy * w + x]) v = 1; } o[y * w + x] = v; }
  return o;
}
/** Adaptive threshold (Gaussian-weighted mean, block 25, C 12, inverted): 1 where the pixel is darker than its neighbourhood by more than C. */
export function binarise(g: Gray, block = 25, c = 12): Uint8Array { const sigma = 0.3 * ((block - 1) * 0.5 - 1) + 0.8, b = gaussian(g, sigma), o = new Uint8Array(g.d.length); for (let i = 0; i < o.length; i++) o[i] = g.d[i] < b.d[i] - c ? 1 : 0; return o; }
/** Tables drawn with ruling lines: binarise, keep long horizontal and vertical strokes, find the connected line structures, read row and column boundaries from where the strokes lie. Tables without ruling lines are not found. */
export function findGrids(g: Gray): Grid[] {
  const { w, h } = g, bw = binarise(g), hm = keepRuns(bw, w, h, Math.max(25, Math.floor(w / 22)), true), vm = keepRuns(bw, w, h, Math.max(25, Math.floor(h / 40)), false), both = new Uint8Array(w * h);
  for (let i = 0; i < both.length; i++) both[i] = hm[i] | vm[i]; const d = dilate5(both, w, h), lab = new Int32Array(w * h), grids: Grid[] = [], st: number[] = []; let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!d[s] || lab[s]) continue; lab[s] = ++id; st.length = 0; st.push(s); let x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (st.length) { const p = st.pop()!, x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (d[q] && !lab[q]) { lab[q] = id; st.push(q); } } }
    const bwd = x1 - x0 + 1, bh = y1 - y0 + 1; if (bwd < 0.2 * w || bh < 0.025 * h) continue;
    const rowSum: number[] = [], colSum: number[] = []; for (let y = 0; y < bh; y++) { let s2 = 0; for (let x = 0; x < bwd; x++) s2 += hm[(y0 + y) * w + x0 + x]; rowSum.push(s2); } for (let x = 0; x < bwd; x++) { let s2 = 0; for (let y = 0; y < bh; y++) s2 += vm[(y0 + y) * w + x0 + x]; colSum.push(s2); }
    const ys = clusters(rowSum.flatMap((v, i) => (v > 0.6 * bwd ? [i] : []))).map(([a, b]) => Math.round((a + b) / 2) + y0), xs = clusters(colSum.flatMap((v, i) => (v > 0.6 * bh ? [i] : []))).map(([a, b]) => Math.round((a + b) / 2) + x0);
    if (ys.length >= 3 && xs.length >= 3) grids.push({ ys, xs, w, h });
  }
  return grids.sort((a, b) => a.ys[0] - b.ys[0]);
}
/** Pixels belonging to long horizontal or vertical ruling strokes (before dilation). Painting them white before OCR stops table rules from being read as text. */
export function ruleMask(g: Gray): Uint8Array { const { w, h } = g, bw = binarise(g), hm = keepRuns(bw, w, h, Math.max(25, Math.floor(w / 22)), true), vm = keepRuns(bw, w, h, Math.max(25, Math.floor(h / 40)), false), o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = hm[i] | vm[i]; return o; }
const searchsorted = (a: number[], v: number) => { let i = 0; while (i < a.length && a[i] < v) i++; return i; };
export interface Table { id: string; page: number; bbox: Box; rows: number; cols: number; cells: string[][]; row_edges: number[]; col_edges: number[]; method: string; header_row_assumed: boolean; empty_cells: number }
/** Assign items to the cells their centres fall in; a cell's text joins its items in reading order. */
export function fillGrid(g: Grid, items: Item[], tid: number, page: number): { table: Table; used: Set<Item> } {
  const { ys, xs, w: W, h: H } = g, nr = ys.length - 1, nc = xs.length - 1, cells: Item[][][] = Array.from({ length: nr }, () => Array.from({ length: nc }, () => [])), used = new Set<Item>();
  for (const it of items) { const px = cx(it) * W, py = cy(it) * H; if (!(px >= xs[0] && px <= xs[xs.length - 1] && py >= ys[0] && py <= ys[ys.length - 1])) continue; const r = Math.max(0, Math.min(nr - 1, searchsorted(ys, py) - 1)), c = Math.max(0, Math.min(nc - 1, searchsorted(xs, px) - 1)); cells[r][c].push(it); used.add(it); }
  const grid = cells.map((row) => row.map((cell) => [...cell].sort((a, b) => Math.round(cy(a) * 100) - Math.round(cy(b) * 100) || a.bbox[0] - b.bbox[0]).map((i) => i.text).join(" "))), r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  return { table: { id: `t${page}-${tid}`, page, bbox: [r5(xs[0] / W), r5(ys[0] / H), r5(xs[xs.length - 1] / W), r5(ys[ys.length - 1] / H)], rows: nr, cols: nc, cells: grid, row_edges: ys.map((v) => r5(v / H)), col_edges: xs.map((v) => r5(v / W)), method: "ruled-grid detection (line morphology on the page image) with text assigned to cells by position", header_row_assumed: true, empty_cells: grid.flat().filter((c) => !c).length }, used };
}
export interface Heading { item_id: string | null; text: string; level: number; rule: string }
/** Items set in clearly larger type than the page's typical text (at least 1.35× the median height), short, and not inside a table. */
export function headings(items: Item[], exclude: Set<Item>): Heading[] {
  const cand = items.filter((i) => !exclude.has(i)); if (cand.length < 4) return [];
  const med = median(cand.map(height)), big = cand.filter((i) => height(i) >= 1.35 * med && i.text.length <= 90), sizes = [...new Set(big.map((i) => Math.round(height(i) * 1000) / 1000))].sort((a, b) => b - a);
  return big.map((i) => { const k = sizes.findIndex((s) => Math.abs(s - Math.round(height(i) * 1000) / 1000) < 1e-9); return { item_id: i.id ?? null, text: i.text, level: Math.min(1 + Math.max(k, 0), 3), rule: `text height ${(height(i) / med).toFixed(2)}x the page median (>= 1.35x)` }; });
}
/** Skew estimate by projection profile: the correction angle in degrees (OpenCV convention: positive rotates counter-clockwise) and a sharpness gain relative to 0°. */
export function estimateSkew(g: Gray, maxAngle = 8): { angle: number; gain: number } {
  const s = Math.min(1, 800 / Math.max(g.w, g.h)), w = Math.max(1, Math.round(g.w * s)), h = Math.max(1, Math.round(g.h * s)); const small: Gray = { w, h, d: new Uint8ClampedArray(w * h) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(g.w - 1, Math.floor(x / s)), sy = Math.min(g.h - 1, Math.floor(y / s)); small.d[y * w + x] = g.d[sy * g.w + sx]; }
  const bw = binarise(small, 31, 15), cxm = w / 2, cym = h / 2;
  const score = (deg: number) => {
    const a = (deg * Math.PI) / 180, al = Math.cos(a), be = Math.sin(a), p = new Float64Array(h);
    // OpenCV rotation matrix M = [[al, be, (1-al)cx - be cy], [-be, al, be cx + (1-al) cy]]; warpAffine samples the source at M^-1 (x, y)
    const tx = (1 - al) * cxm - be * cym, ty = be * cxm + (1 - al) * cym, det = al * al + be * be;
    for (let y = 0; y < h; y++) { let sum = 0; for (let x = 0; x < w; x++) { const dx = x - tx, dy = y - ty, sx = Math.round((al * dx - be * dy) / det), sy = Math.round((be * dx + al * dy) / det); if (sx >= 0 && sy >= 0 && sx < w && sy < h) sum += bw[sy * w + sx]; } p[y] = sum; }
    let m = 0; for (let y = 1; y < h; y++) m += p[y] - p[y - 1]; m /= Math.max(1, h - 1); let v = 0; for (let y = 1; y < h; y++) v += (p[y] - p[y - 1] - m) ** 2; return v / Math.max(1, h - 1);
  };
  let best = 0, bs = -1; for (let a = -maxAngle; a <= maxAngle + 0.01; a += 0.5) { const sc = score(a); if (sc > bs) { bs = sc; best = a; } }
  let angle = best, fs = -1; for (let a = best - 0.5; a <= best + 0.51; a += 0.1) { const sc = score(a); if (sc > fs) { fs = sc; angle = a; } }
  const base = score(0); return { angle, gain: base > 0 ? fs / base : 1 };
}
