/**
 * Raster floor-plan interpretation (PNG/JPG). INFERRED geometry, not CAD geometry: thick dark strokes are taken as walls.
 * Limits: axis-aligned (horizontal/vertical) walls only; thin lines, hatches and text are filtered out; doors/windows are not recognised
 * (gaps in walls become unlabelled openings); the scale (pixels per metre) must be supplied by the user. Diagonal or curved walls are missed and reported.
 */
import sharp from "sharp";
import type { DxfDoc, DxfEntity } from "./dxf";

export interface RasterResult { doc: DxfDoc; warnings: string[]; stats: { width: number; height: number; wallRects: number; thicknessPx: number; inkRatio: number; skippedDiagonalShare: number } }
export async function interpretRaster(buf: Buffer, pxPerMetre: number): Promise<RasterResult> {
  if (!(pxPerMetre > 0)) throw new Error("A scale (pixels per metre) is required to interpret a raster plan.");
  const meta = await sharp(buf, { limitInputPixels: 60_000_000 }).metadata(); const maxSide = 2400; const k = Math.min(1, maxSide / Math.max(meta.width ?? 1, meta.height ?? 1));
  const { data, info } = await sharp(buf, { limitInputPixels: 60_000_000 }).flatten({ background: "#ffffff" }).grayscale().resize({ width: Math.round((meta.width ?? 1) * k), height: Math.round((meta.height ?? 1) * k) }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height; const ppm = pxPerMetre * k; const warnings: string[] = [];
  const hist = new Array(256).fill(0); for (let i = 0; i < data.length; i++) hist[data[i]]++; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let sB = 0, wB = 0, best = 0, thr = 128; for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = data.length - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = t; } }
  let ink: Uint8Array = new Uint8Array(W * H); let n = 0; for (let i = 0; i < ink.length; i++) if (data[i] <= thr) { ink[i] = 1; n++; }
  const inkRatio = n / ink.length; if (inkRatio > 0.5) warnings.push("More than half of the image is dark; the plan may be inverted (white lines on dark). Results are unreliable.");
  // wall thickness range from the scale: 5 cm … 60 cm
  const tMin = Math.max(2, Math.round(0.07 * ppm)), tMax = Math.max(tMin + 1, Math.round(0.6 * ppm)), Lmin = Math.max(tMin * 3, Math.round(0.4 * ppm));
  ink = boxOpen(ink, W, H, Math.max(1, Math.floor(tMin / 2) - 1));
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const runsToRects = (mask: Uint8Array, w: number, h: number, minLen: number): Rect[] => { // horizontal runs merged across rows
    const rects: Rect[] = []; let open2: Map<string, Rect> = new Map(); for (let y = 0; y <= h; y++) { const now = new Map<string, Rect>(); if (y < h) { let x = 0; while (x < w) { if (mask[y * w + x]) { let x1 = x; while (x1 + 1 < w && mask[y * w + x1 + 1]) x1++; if (x1 - x + 1 >= minLen) { const key = `${x}:${x1}`; const prev = open2.get(key) ?? [...open2.values()].find((r) => Math.abs(r.x0 - x) <= 1 && Math.abs(r.x1 - x1) <= 1); if (prev) { prev.y1 = y; now.set(`${prev.x0}:${prev.x1}`, prev); open2.delete(`${prev.x0}:${prev.x1}`); } else now.set(key, { x0: x, y0: y, x1, y1: y }); } x = x1 + 1; } else x++; } } for (const r of open2.values()) rects.push(r); open2 = now; } return rects; };
  const hRects = runsToRects(ink, W, H, Lmin).filter((r) => r.y1 - r.y0 + 1 >= tMin && r.y1 - r.y0 + 1 <= tMax);
  const T = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) T[x * H + y] = ink[y * W + x];
  const vRectsT = runsToRects(T, H, W, Lmin).filter((r) => r.y1 - r.y0 + 1 >= tMin && r.y1 - r.y0 + 1 <= tMax); const vRects: Rect[] = vRectsT.map((r) => ({ x0: r.y0, x1: r.y1, y0: r.x0, y1: r.x1 }));
  // keep a vertical rect only if it is not already explained by the horizontal ones
  const area = (r: Rect) => (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1); const inter = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1);
  const keepV = vRects.filter((v) => hRects.every((h) => inter(h, v) < 0.6 * area(v))); const rects = [...hRects.filter((h) => keepV.every((v) => inter(h, v) < 0.6 * area(h))), ...keepV].filter((r, i, a) => a.findIndex((q) => Math.abs(q.x0 - r.x0) < 3 && Math.abs(q.x1 - r.x1) < 3 && Math.abs(q.y0 - r.y0) < 3 && Math.abs(q.y1 - r.y1) < 3) === i);
  let wallPx = 0; for (const r of rects) wallPx += area(r); const unexplained = Math.max(0, n - wallPx) / Math.max(1, n);
  if (unexplained > 0.35) warnings.push(`About ${Math.round(unexplained * 100)}% of the dark pixels were not recognised as horizontal/vertical walls (text, furniture, diagonal or curved walls). Check the result against the image.`);
  if (!rects.length) warnings.push("No wall-like thick strokes were found. Check the scale and that walls are drawn as thick dark bands.");
  const toM = (px: number) => px / ppm; const ents: DxfEntity[] = []; const layer = "WALL"; const Y = (py: number) => -toM(py); const line = (x0: number, y0: number, x1: number, y1: number) => ents.push({ t: "LINE", layer, a: { x: toM(x0), y: Y(y0) }, b: { x: toM(x1), y: Y(y1) } });
  for (const r of rects) { const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1; if (w >= h) { line(r.x0, r.y0, r.x1 + 1, r.y0); line(r.x0, r.y1 + 1, r.x1 + 1, r.y1 + 1); } else { line(r.x0, r.y0, r.x0, r.y1 + 1); line(r.x1 + 1, r.y0, r.x1 + 1, r.y1 + 1); } }
  const avgT = rects.length ? rects.reduce((s, r) => s + Math.min(r.x1 - r.x0 + 1, r.y1 - r.y0 + 1), 0) / rects.length : 0;
  const layers = { WALL: { name: "WALL", color: 7, off: false, frozen: false } };
  return { doc: { version: "RASTER", insunits: 6, unitsKnown: true, layers, blocks: {}, entities: ents, warnings: [], counts: { LINE: ents.length } }, warnings, stats: { width: W, height: H, wallRects: rects.length, thicknessPx: Math.round(avgT * 10) / 10, inkRatio: Math.round(inkRatio * 1000) / 1000, skippedDiagonalShare: Math.round(unexplained * 1000) / 1000 } };
}
/** Opening by a (2r+1) square: erosion then dilation using separable running minima/maxima. */
function boxOpen(mask: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const sep = (src: Uint8Array, erode: boolean) => { const a = new Uint8Array(src.length), b = new Uint8Array(src.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = erode ? 1 : 0; for (let q = -r; q <= r; q++) { const xx = x + q; const s = xx < 0 || xx >= W ? (erode ? 0 : 0) : src[y * W + xx]; if (erode ? !s : s) { v = erode ? 0 : 1; break; } } a[y * W + x] = v; } for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = erode ? 1 : 0; for (let q = -r; q <= r; q++) { const yy = y + q; const s = yy < 0 || yy >= H ? 0 : a[yy * W + x]; if (erode ? !s : s) { v = erode ? 0 : 1; break; } } b[y * W + x] = v; } return b; };
  return sep(sep(mask, true), false);
}
