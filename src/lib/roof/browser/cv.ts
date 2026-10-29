/** The small amount of image geometry the roof engine needs (the OpenCV calls of services/roof-analyzer/app/geometry.py written out on plain arrays): morphology, connected components, external contours, polygon simplification, convex hull, minimum-area rectangle, Canny + Hough segments. */
export type Pt = [number, number];
export function boxFilter(m: Uint8Array, w: number, h: number, rx: number, ry: number, dilate: boolean): Uint8Array {
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h), init = dilate ? 0 : 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = init; for (let i = -rx; i <= rx; i++) { const xx = x + i; const s = xx < 0 || xx >= w ? (dilate ? 0 : 1) : m[y * w + xx]; if (dilate ? s : !s) { v = dilate ? 1 : 0; break; } } t[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = init; for (let j = -ry; j <= ry; j++) { const yy = y + j; const s = yy < 0 || yy >= h ? (dilate ? 0 : 1) : t[yy * w + x]; if (dilate ? s : !s) { v = dilate ? 1 : 0; break; } } o[y * w + x] = v; }
  return o;
}
export const open = (m: Uint8Array, w: number, h: number, r: number) => boxFilter(boxFilter(m, w, h, r, r, false), w, h, r, r, true);
export const close = (m: Uint8Array, w: number, h: number, r: number) => boxFilter(boxFilter(m, w, h, r, r, true), w, h, r, r, false);
export interface Comp { id: number; area: number; x: number; y: number; w: number; h: number }
/** 8-connected components of a binary mask (labels 1..n) with area and bounding boxes. */
export function components(m: Uint8Array, w: number, h: number): { labels: Int32Array; comps: Comp[] } {
  const labels = new Int32Array(w * h), comps: Comp[] = [], st: number[] = []; let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || labels[s]) continue; id++; labels[s] = id; st.length = 0; st.push(s); let area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (st.length) { const p = st.pop()!, x = p % w, y = (p / w) | 0; area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (m[q] && !labels[q]) { labels[q] = id; st.push(q); } } }
    comps.push({ id, area, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return { labels, comps };
}
const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
/** Outer boundary of the component with this label (Moore-neighbour tracing, 8-connected boundary pixels, like cv2.findContours with CHAIN_APPROX_NONE). */
export function outerContour(labels: Int32Array, w: number, h: number, id: number, bx: number, by: number, bw: number, bh: number): Pt[] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === id ? 1 : 0); let sx = -1, sy = -1;
  outer: for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (at(x, y)) { sx = x; sy = y; break outer; } if (sx < 0) return [];
  const pts: Pt[] = [[sx, sy]]; let cx = sx, cy = sy, dir = 7; const limit = 4 * (bw + bh) * (bw + bh) + 16; // start by looking back to the west neighbour
  for (let n = 0; n < limit; n++) {
    let found = false; const start = (dir + 6) % 8;
    for (let k = 0; k < 8; k++) { const d = (start + k) % 8, nx = cx + DX[d], ny = cy + DY[d]; if (at(nx, ny)) { cx = nx; cy = ny; dir = d; found = true; break; } }
    if (!found) break; if (cx === sx && cy === sy) break; pts.push([cx, cy]);
  }
  return pts;
}
export const arcLength = (p: Pt[], closed = true) => { let s = 0; for (let i = 0; i < p.length - (closed ? 0 : 1); i++) { const a = p[i], b = p[(i + 1) % p.length]; s += Math.hypot(a[0] - b[0], a[1] - b[1]); } return s; };
export const polyArea = (p: Pt[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
function dp(p: Pt[], lo: number, hi: number, eps: number, keep: boolean[]) {
  if (hi <= lo + 1) return; const a = p[lo], b = p[hi], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); let best = -1, bi = -1;
  for (let i = lo + 1; i < hi; i++) { const d = len > 0 ? Math.abs(dy * (p[i][0] - a[0]) - dx * (p[i][1] - a[1])) / len : Math.hypot(p[i][0] - a[0], p[i][1] - a[1]); if (d > best) { best = d; bi = i; } }
  if (best > eps) { keep[bi] = true; dp(p, lo, bi, eps, keep); dp(p, bi, hi, eps, keep); }
}
/** Douglas–Peucker simplification of a closed contour (split at the point farthest from the first point). */
export function approxPolyDP(p: Pt[], eps: number): Pt[] {
  const n = p.length; if (n < 4) return p.slice(); let far = 0, fd = -1; for (let i = 1; i < n; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > fd) { fd = d; far = i; } }
  const q = [...p, p[0]], keep = new Array(n + 1).fill(false); keep[0] = keep[far] = keep[n] = true; dp(q, 0, far, eps, keep); dp(q, far, n, eps, keep);
  return q.slice(0, n).filter((_, i) => keep[i]);
}
export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
/** Minimum-area bounding rectangle by rotating calipers: centre, [width, height] and the angle (degrees) of the first side. */
export function minAreaRect(pts: Pt[]): { center: Pt; size: [number, number]; angle: number } {
  const h = convexHull(pts); if (h.length < 3) { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], size: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], angle: 0 }; }
  let best = { area: Infinity, center: [0, 0] as Pt, size: [0, 0] as [number, number], angle: 0 };
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of h) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
    const area = (x1 - x0) * (y1 - y0); if (area < best.area) { const cu = (x0 + x1) / 2, cv = (y0 + y1) / 2; best = { area, center: [cu * c - cv * s, cu * s + cv * c], size: [x1 - x0, y1 - y0], angle: (ang * 180) / Math.PI }; }
  }
  return { center: best.center, size: best.size, angle: ((best.angle % 90) + 90) % 90 };
}
export function percentile(a: number[], q: number): number { const s = [...a].sort((x, y) => x - y); if (!s.length) return 0; const k = (q / 100) * (s.length - 1), f = Math.floor(k), c = Math.min(s.length - 1, f + 1); return s[f] + (s[c] - s[f]) * (k - f); }
/** Fill a polygon (even-odd scanline) into a mask. */
export function fillPoly(poly: Pt[], w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const xs: number[] = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); } xs.sort((p, q) => p - q); for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])); x <= Math.min(w - 1, Math.round(xs[k + 1])); x++) m[y * w + x] = 1; }
  for (const [px, py] of poly) { const x = Math.round(px), y = Math.round(py); if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1; } return m;
}
/** Canny-style edge map: Sobel gradient, non-maximum suppression, hysteresis (low, high as fractions of the strongest gradient). */
export function edges(gray: Uint8Array, w: number, h: number, lowF = 0.1, highF = 0.25): Uint8Array {
  const mag = new Float32Array(w * h), dir = new Uint8Array(w * h); let mx = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1], gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1], m = Math.hypot(gx, gy); mag[i] = m; if (m > mx) mx = m; const a = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180; dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3; }
  const nms = new Uint8Array(w * h); const lo = lowF * mx, hi = highF * mx, out = new Uint8Array(w * h), st: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, m = mag[i]; if (m < lo) continue; const d = dir[i], [a, b] = d === 0 ? [i - 1, i + 1] : d === 1 ? [i - w + 1, i + w - 1] : d === 2 ? [i - w, i + w] : [i - w - 1, i + w + 1]; if (m >= mag[a] && m >= mag[b]) { nms[i] = 1; if (m >= hi) { out[i] = 1; st.push(i); } } }
  while (st.length) { const p = st.pop()!; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const q = p + j * w + i; if (nms[q] && !out[q]) { out[q] = 1; st.push(q); } } }
  return out;
}
export interface Seg { p1: Pt; p2: Pt; len: number }
/** Straight segments from an edge map: Hough transform for the strongest lines, then runs of edge pixels along each line (gaps up to maxGap px). */
export function houghSegments(edge: Uint8Array, w: number, h: number, minLen: number, maxGap = 4, maxLines = 120): Seg[] {
  const nA = 180, diag = Math.ceil(Math.hypot(w, h)), nR = 2 * diag + 1, acc = new Int32Array(nA * nR), cs = new Float32Array(nA), sn = new Float32Array(nA); for (let a = 0; a < nA; a++) { cs[a] = Math.cos((a * Math.PI) / nA); sn[a] = Math.sin((a * Math.PI) / nA); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (edge[y * w + x]) for (let a = 0; a < nA; a++) acc[a * nR + Math.round(x * cs[a] + y * sn[a]) + diag]++;
  const peaks: { a: number; r: number; v: number }[] = []; const thr = Math.max(minLen * 0.8, 20);
  for (let a = 0; a < nA; a++) for (let r = 1; r < nR - 1; r++) { const v = acc[a * nR + r]; if (v < thr) continue; let isMax = true; for (let da = -2; da <= 2 && isMax; da++) for (let dr = -3; dr <= 3; dr++) { if (!da && !dr) continue; const aa = (a + da + nA) % nA, rr = r + dr; if (rr < 0 || rr >= nR) continue; const o = acc[aa * nR + rr]; if (o > v || (o === v && (aa < a || (aa === a && rr < r)))) { isMax = false; break; } } if (isMax) peaks.push({ a, r: r - diag, v }); }
  peaks.sort((p, q) => q.v - p.v); const segs: Seg[] = [];
  for (const pk of peaks.slice(0, maxLines)) {
    const c = cs[pk.a], s = sn[pk.a], dx = -s, dy = c, x0 = c * pk.r, y0 = s * pk.r; // a point on the line and its direction
    const tmin = -diag * 2, tmax = diag * 2; let run0 = NaN, last = NaN;
    const flush = () => { if (!Number.isNaN(run0) && last - run0 >= minLen) segs.push({ p1: [x0 + dx * run0, y0 + dy * run0], p2: [x0 + dx * last, y0 + dy * last], len: last - run0 }); run0 = NaN; };
    for (let t = tmin; t <= tmax; t += 1) { const x = Math.round(x0 + dx * t), y = Math.round(y0 + dy * t); if (x < 0 || y < 0 || x >= w || y >= h) { if (!Number.isNaN(run0)) flush(); continue; } let hit = false; for (let j = -1; j <= 1 && !hit; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w && yy < h && edge[yy * w + xx]) { hit = true; break; } } if (hit) { if (Number.isNaN(run0)) run0 = t; last = t; } else if (!Number.isNaN(run0) && t - last > maxGap) flush(); }
    flush();
  }
  return segs;
}
