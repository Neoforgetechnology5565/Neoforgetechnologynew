/** Classical image-processing operations for the medical-imaging demo. Pure functions on 8-bit grayscale buffers, no DOM. Nothing here is a trained model. */
export interface Gray { w: number; h: number; d: Uint8ClampedArray }
export const make = (w: number, h: number): Gray => ({ w, h, d: new Uint8ClampedArray(w * h) });
export const clone = (g: Gray): Gray => ({ w: g.w, h: g.h, d: new Uint8ClampedArray(g.d) });

export function histogram(g: Gray): Uint32Array { const h = new Uint32Array(256); for (let i = 0; i < g.d.length; i++) h[g.d[i]]++; return h; }
export function percentile(g: Gray, p: number): number { const h = histogram(g); let c = 0; const t = g.d.length * p; for (let i = 0; i < 256; i++) { c += h[i]; if (c > 0 && c >= t) return i; } return 255; }

/** Linear window / level: output = (v - (level - width/2)) / width * 255. */
export function windowLevel(g: Gray, level: number, width: number): Gray {
  const o = make(g.w, g.h), lo = level - width / 2, k = 255 / Math.max(1, width); const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = Math.round((v - lo) * k);
  for (let i = 0; i < g.d.length; i++) o.d[i] = lut[g.d[i]]; return o;
}
/** Contrast stretch between two percentiles of the image's own histogram. */
export function stretch(g: Gray, loP = 0.01, hiP = 0.99): { out: Gray; lo: number; hi: number } {
  const lo = percentile(g, loP), hi = Math.max(lo + 1, percentile(g, hiP)); return { out: windowLevel(g, (lo + hi) / 2, hi - lo), lo, hi };
}
export function gamma(g: Gray, gm: number): Gray { const o = make(g.w, g.h), lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(v / 255, gm)); for (let i = 0; i < g.d.length; i++) o.d[i] = lut[g.d[i]]; return o; }
export function invert(g: Gray): Gray { const o = make(g.w, g.h); for (let i = 0; i < g.d.length; i++) o.d[i] = 255 - g.d[i]; return o; }

/** CLAHE (contrast-limited adaptive histogram equalisation) on a tiles×tiles grid with bilinear blending between tile mappings. clip is a multiple of the uniform bin height. */
export function clahe(g: Gray, tiles = 8, clip = 3): Gray {
  const { w, h } = g, tw = w / tiles, th = h / tiles, maps: Uint8Array[] = [];
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const x0 = Math.floor(tx * tw), x1 = Math.floor((tx + 1) * tw), y0 = Math.floor(ty * th), y1 = Math.floor((ty + 1) * th), hist = new Float64Array(256);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[g.d[y * w + x]]++;
    const n = Math.max(1, (x1 - x0) * (y1 - y0)), limit = Math.max(1, (clip * n) / 256); let excess = 0;
    for (let i = 0; i < 256; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
    const add = excess / 256; for (let i = 0; i < 256; i++) hist[i] += add;
    const m = new Uint8Array(256); let c = 0; for (let i = 0; i < 256; i++) { c += hist[i]; m[i] = Math.round((255 * c) / n); } maps.push(m);
  }
  const o = make(w, h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(tiles - 1, Math.max(0, y / th - 0.5)), y0 = Math.floor(fy), y1 = Math.min(tiles - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(tiles - 1, Math.max(0, x / tw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(tiles - 1, x0 + 1), wx = fx - x0, v = g.d[y * w + x];
      const a = maps[y0 * tiles + x0][v], b = maps[y0 * tiles + x1][v], c = maps[y1 * tiles + x0][v], d = maps[y1 * tiles + x1][v];
      o.d[y * w + x] = Math.round((a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy);
    }
  }
  return o;
}

function kernel1d(sigma: number): Float32Array { const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1); let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; } for (let i = 0; i < k.length; i++) k[i] /= s; return k; }
export function gaussian(g: Gray, sigma: number): Gray {
  if (sigma <= 0) return clone(g); const { w, h } = g, k = kernel1d(sigma), r = (k.length - 1) / 2, tmp = new Float32Array(w * h), o = make(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * g.d[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; o.d[y * w + x] = Math.round(s); }
  return o;
}
/** Median filter with a (2r+1)² window (edge pixels use the clamped neighbourhood). */
export function median(g: Gray, r = 1): Gray {
  const { w, h } = g, o = make(w, h), n = (2 * r + 1) ** 2, hist = new Uint16Array(256);
  for (let y = 0; y < h; y++) {
    hist.fill(0); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) hist[g.d[Math.min(h - 1, Math.max(0, y + j)) * w + Math.min(w - 1, Math.max(0, i))]]++;
    for (let x = 0; x < w; x++) {
      let c = 0, v = 0; const half = (n + 1) >> 1; for (; v < 256; v++) { c += hist[v]; if (c >= half) break; } o.d[y * w + x] = v;
      for (let j = -r; j <= r; j++) { const yy = Math.min(h - 1, Math.max(0, y + j)); hist[g.d[yy * w + Math.min(w - 1, Math.max(0, x - r))]]--; hist[g.d[yy * w + Math.min(w - 1, Math.max(0, x + r + 1))]]++; }
    }
  }
  return o;
}
export function unsharp(g: Gray, sigma = 1.5, amount = 1): Gray { const b = gaussian(g, sigma), o = make(g.w, g.h); for (let i = 0; i < g.d.length; i++) o.d[i] = g.d[i] + amount * (g.d[i] - b.d[i]); return o; }

/** Otsu's threshold: the level that maximises between-class variance of the histogram. */
export function otsu(g: Gray): number {
  const h = histogram(g), n = g.d.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
  let wb = 0, sb = 0, best = 0, bt = 0; for (let t = 0; t < 256; t++) { wb += h[t]; if (!wb) continue; const wf = n - wb; if (!wf) break; sb += t * h[t]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2; if (v > best) { best = v; bt = t; } }
  return bt;
}
/** Two-threshold (three-class) Otsu by exhaustive search over the histogram. */
export function otsu3(g: Gray): [number, number] {
  const h = histogram(g), n = g.d.length, P = new Float64Array(257), S = new Float64Array(257); for (let i = 0; i < 256; i++) { P[i + 1] = P[i] + h[i] / n; S[i + 1] = S[i] + (i * h[i]) / n; }
  const cls = (a: number, b: number) => { const w = P[b] - P[a]; return w > 0 ? (S[b] - S[a]) ** 2 / w : 0; }; let best = -1, r: [number, number] = [85, 170];
  for (let t1 = 1; t1 < 255; t1++) for (let t2 = t1 + 1; t2 < 256; t2++) { const v = cls(0, t1 + 1) + cls(t1 + 1, t2 + 1) + cls(t2 + 1, 256); if (v > best) { best = v; r = [t1, t2]; } }
  return r;
}

export interface Mask { w: number; h: number; d: Uint8Array }
export const threshold = (g: Gray, lo: number, hi = 255): Mask => { const m: Mask = { w: g.w, h: g.h, d: new Uint8Array(g.d.length) }; for (let i = 0; i < g.d.length; i++) m.d[i] = g.d[i] >= lo && g.d[i] <= hi ? 1 : 0; return m; };
export const maskInvert = (m: Mask): Mask => ({ w: m.w, h: m.h, d: m.d.map((v) => 1 - v) as Uint8Array });
export function dilate(m: Mask, r = 1): Mask { const o: Mask = { w: m.w, h: m.h, d: new Uint8Array(m.d.length) }; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { let v = 0; for (let j = -r; j <= r && !v; j++) for (let i = -r; i <= r; i++) { if (i * i + j * j > r * r + r) continue; const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h && m.d[yy * m.w + xx]) { v = 1; break; } } o.d[y * m.w + x] = v; } return o; }
export function erode(m: Mask, r = 1): Mask { return maskInvert(dilate(maskInvert(m), r)); }
export const open = (m: Mask, r = 1) => dilate(erode(m, r), r);
export const close = (m: Mask, r = 1) => erode(dilate(m, r), r);

export interface Region { id: number; area: number; cx: number; cy: number; x0: number; y0: number; x1: number; y1: number; mean: number; min: number; max: number }
/** 4-connected components with per-region statistics. Returns the label image (0 = background). */
export function components(m: Mask, g: Gray, minArea = 1): { labels: Int32Array; regions: Region[] } {
  const { w, h } = m, labels = new Int32Array(w * h), regions: Region[] = [], stack: number[] = []; let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!m.d[s] || labels[s]) continue; const mine = ++id; labels[s] = mine; stack.length = 0; stack.push(s); let area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sum = 0, mn = 255, mx = 0; const px: number[] = [];
    while (stack.length) { const p = stack.pop()!, x = p % w, y = (p / w) | 0; px.push(p); area++; sx += x; sy += y; const v = g.d[p]; sum += v; if (v < mn) mn = v; if (v > mx) mx = v; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && m.d[p - 1] && !labels[p - 1]) { labels[p - 1] = mine; stack.push(p - 1); } if (x < w - 1 && m.d[p + 1] && !labels[p + 1]) { labels[p + 1] = mine; stack.push(p + 1); }
      if (y > 0 && m.d[p - w] && !labels[p - w]) { labels[p - w] = mine; stack.push(p - w); } if (y < h - 1 && m.d[p + w] && !labels[p + w]) { labels[p + w] = mine; stack.push(p + w); } }
    if (area < minArea) { for (const p of px) labels[p] = 0; id--; continue; }
    regions.push({ id: mine, area, cx: sx / area, cy: sy / area, x0, y0, x1, y1, mean: sum / area, min: mn, max: mx });
  }
  // relabel consecutively
  const remap = new Map<number, number>(); regions.forEach((r, i) => { remap.set(r.id, i + 1); r.id = i + 1; }); for (let i = 0; i < labels.length; i++) if (labels[i]) labels[i] = remap.get(labels[i]) ?? 0;
  return { labels, regions };
}
/** Fill background pixels that are not connected to the image border (holes inside regions). */
export function fillHoles(m: Mask): Mask {
  const { w, h } = m, seen = new Uint8Array(w * h), st: number[] = [];
  const push = (p: number) => { if (!m.d[p] && !seen[p]) { seen[p] = 1; st.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (st.length) { const p = st.pop()!, x = p % w, y = (p / w) | 0; if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w); }
  return { w, h, d: m.d.map((v, i) => (v || !seen[i] ? 1 : 0)) as Uint8Array };
}
/** Seeded region growing: 4-connected pixels whose value is within ±tol of the running mean of the region (seed neighbourhood start). */
export function regionGrow(g: Gray, sx: number, sy: number, tol: number): Mask {
  const { w, h } = g, m: Mask = { w, h, d: new Uint8Array(w * h) }; if (sx < 0 || sy < 0 || sx >= w || sy >= h) return m;
  let sum = 0, n = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const x = sx + i, y = sy + j; if (x >= 0 && y >= 0 && x < w && y < h) { sum += g.d[y * w + x]; n++; } }
  const mean = sum / n, st = [sy * w + sx]; m.d[st[0]] = 1;
  while (st.length) { const p = st.pop()!, x = p % w, y = (p / w) | 0; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !m.d[q] && Math.abs(g.d[q] - mean) <= tol) { m.d[q] = 1; st.push(q); } }
  return m;
}
/** Local noise estimate: standard deviation of the difference between the image and its 3×3 median (robust to edges). */
export function noiseSigma(g: Gray): number { const m = median(g, 1); let s = 0; for (let i = 0; i < g.d.length; i++) s += (g.d[i] - m.d[i]) ** 2; return Math.sqrt(s / g.d.length); }
