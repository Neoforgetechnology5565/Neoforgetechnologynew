/**
 * Synthetic test scenes: a sheet of paper and a parametric foot silhouette of KNOWN size, rendered through a
 * pinhole camera. They exercise the geometry (scale, perspective, axis, left/right) of the measurement engine.
 * They are NOT photographs of feet and say nothing about accuracy on real feet, skin tones, socks or lighting.
 */
import { PAPER_MM, type Img, type PaperKind, type Pt } from "./types";

export interface SceneOpts {
  w?: number; h?: number; paper?: PaperKind; footLengthMm: number; footWidthMm: number; side?: "left" | "right";
  footAngleDeg?: number; footOffset?: Pt; fovDeg?: number; heightMm?: number; pitchDeg?: number; rollDeg?: number; yawDeg?: number;
  noise?: number; blurPx?: number; brightness?: number; footRgb?: [number, number, number]; footHeightMm?: number; seed?: number; paperShift?: Pt;
}
export interface Scene { img: Img; truth: { lengthMm: number; widthMm: number; side: "left" | "right"; corners: Pt[] }; polyMm: Pt[] }

const PROFILE: [number, number][] = [[0, 0], [0.015, 0.3], [0.05, 0.47], [0.12, 0.54], [0.28, 0.5], [0.42, 0.55], [0.56, 0.78], [0.68, 0.98], [0.78, 1], [0.88, 0.86], [0.95, 0.62], [0.985, 0.3], [1, 0]];
const prof = (t: number) => { for (let i = 1; i < PROFILE.length; i++) if (t <= PROFILE[i][0]) { const [t0, v0] = PROFILE[i - 1], [t1, v1] = PROFILE[i]; const u = (t - t0) / (t1 - t0 || 1); const s = (1 - Math.cos(u * Math.PI)) / 2; return v0 + (v1 - v0) * s; } return 0; };

/** Foot outline in mm with the heel at x=0, toe at x=L, lateral edge at +y. The maximum vertical extent equals widthMm. */
export function footPolygon(L: number, W: number, side: "left" | "right"): Pt[] {
  const lat: Pt[] = [], med: Pt[] = []; const N = 90;
  for (let i = 0; i <= N; i++) { const t = i / N; const p = prof(t); lat.push({ x: t * L, y: p * W * 0.56 }); med.push({ x: t * L, y: -p * W * 0.44 }); }
  const poly = [...lat, ...med.reverse().slice(1, -1)];
  return poly.map((p) => ({ x: p.x, y: side === "right" ? p.y : -p.y }));
}
function inPoly(poly: Pt[], x: number, y: number) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; }
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const mul = (A: number[][], B: number[][]) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const rx = (a: number) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const ry = (a: number) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rz = (a: number) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const rad = (d: number) => (d * Math.PI) / 180;

export function renderScene(o: SceneOpts): Scene {
  const w = o.w ?? 1600, h = o.h ?? 1200, paper = PAPER_MM[o.paper ?? "a4"], side = o.side ?? "right"; const fov = rad(o.fovDeg ?? 65); const f = w / (2 * Math.tan(fov / 2));
  const dist = o.heightMm ?? 520; const R = mul(mul(mul(rz(rad(o.yawDeg ?? 0)), rx(rad(o.pitchDeg ?? 0))), ry(rad(o.rollDeg ?? 0))), [[1, 0, 0], [0, -1, 0], [0, 0, -1]]);
  const C = [(o.paperShift?.x ?? 0), (o.paperShift?.y ?? 0), dist]; const Rt = [0, 1, 2].map((i) => [R[0][i], R[1][i], R[2][i]]); // R^T
  const col = (v: number[]) => Rt.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]); const r1 = col([1, 0, 0]), r2 = col([0, 1, 0]), t = col(C).map((v) => -v);
  const K = [[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]]; const Hm = mul(K, [[r1[0], r2[0], t[0]], [r1[1], r2[1], t[1]], [r1[2], r2[2], t[2]]]);
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(Hm); const inv = [[Hm[1][1] * Hm[2][2] - Hm[1][2] * Hm[2][1], Hm[0][2] * Hm[2][1] - Hm[0][1] * Hm[2][2], Hm[0][1] * Hm[1][2] - Hm[0][2] * Hm[1][1]], [Hm[1][2] * Hm[2][0] - Hm[1][0] * Hm[2][2], Hm[0][0] * Hm[2][2] - Hm[0][2] * Hm[2][0], Hm[0][2] * Hm[1][0] - Hm[0][0] * Hm[1][2]], [Hm[1][0] * Hm[2][1] - Hm[1][1] * Hm[2][0], Hm[0][1] * Hm[2][0] - Hm[0][0] * Hm[2][1], Hm[0][0] * Hm[1][1] - Hm[0][1] * Hm[1][0]]].map((r) => r.map((v) => v / d));
  const proj = (X: number, Y: number): Pt => { const a = Hm[0][0] * X + Hm[0][1] * Y + Hm[0][2], b = Hm[1][0] * X + Hm[1][1] * Y + Hm[1][2], c = Hm[2][0] * X + Hm[2][1] * Y + Hm[2][2]; return { x: a / c, y: b / c }; };
  const hw = paper.w / 2, hh = paper.h / 2; const corners = [proj(-hw, -hh), proj(hw, -hh), proj(hw, hh), proj(-hw, hh)];
  const poly0 = footPolygon(o.footLengthMm, o.footWidthMm, side); const ang = rad(o.footAngleDeg ?? 6); const off = o.footOffset ?? { x: 0, y: 0 };
  const cx = o.footLengthMm / 2, polyP = poly0.map((p) => ({ x: (p.x - cx) * Math.cos(ang) - p.y * Math.sin(ang) + off.x, y: (p.x - cx) * Math.sin(ang) + p.y * Math.cos(ang) + off.y }));
  // Optional: the foot's silhouette sits above the paper. Points at height z project like plane points pushed away from the nadir.
  const zh = o.footHeightMm ?? 0; const poly = zh ? polyP.map((p) => { const k = dist / (dist - zh); return { x: (p.x - C[0]) * k + C[0], y: (p.y - C[1]) * k + C[1] }; }) : polyP;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of poly) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const rnd = rng(o.seed ?? 7); const data = new Uint8Array(w * h * 3); const br = o.brightness ?? 1; const fc = o.footRgb ?? [150, 108, 88]; const noise = o.noise ?? 3;
  const floor = (X: number, Y: number): [number, number, number] => { const g = 0.5 + 0.5 * Math.sin(X * 0.021) * Math.cos(Y * 0.017); return [52 + 20 * g, 44 + 16 * g, 40 + 14 * g]; };
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const a = inv[0][0] * px + inv[0][1] * py + inv[0][2], b = inv[1][0] * px + inv[1][1] * py + inv[1][2], c = inv[2][0] * px + inv[2][1] * py + inv[2][2]; const X = a / c, Y = b / c; let rgb: [number, number, number];
    const onPaper = Math.abs(X) <= hw && Math.abs(Y) <= hh;
    if (onPaper) { const shade = 244 - 6 * (X / paper.w) + 4 * (Y / paper.h); rgb = [shade, shade - 1, shade - 4]; } else rgb = floor(X, Y);
    if (X >= x0 && X <= x1 && Y >= y0 && Y <= y1 && inPoly(poly, X, Y)) { const sh = 1 - 0.18 * Math.abs((Y - (y0 + y1) / 2) / ((y1 - y0) / 2 || 1)); rgb = [fc[0] * sh, fc[1] * sh, fc[2] * sh]; }
    const o3 = (py * w + px) * 3; const nz = (rnd() + rnd() + rnd() - 1.5) * noise * 2;
    data[o3] = Math.max(0, Math.min(255, rgb[0] * br + nz)); data[o3 + 1] = Math.max(0, Math.min(255, rgb[1] * br + nz)); data[o3 + 2] = Math.max(0, Math.min(255, rgb[2] * br + nz));
  }
  let img: Img = { w, h, ch: 3, data };
  if (o.blurPx && o.blurPx > 0) img = boxBlur(img, Math.round(o.blurPx));
  return { img, truth: { lengthMm: o.footLengthMm, widthMm: o.footWidthMm, side, corners }, polyMm: polyP };
}
export function boxBlur(img: Img, r: number): Img {
  const { w, h } = img; const out = new Uint8Array(img.data.length); const tmp = new Float32Array(img.data.length);
  for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) { let s = 0; for (let x = -r; x <= r; x++) s += img.data[(y * w + Math.min(w - 1, Math.max(0, x))) * 3 + c]; for (let x = 0; x < w; x++) { tmp[(y * w + x) * 3 + c] = s / (2 * r + 1); s += img.data[(y * w + Math.min(w - 1, x + r + 1)) * 3 + c] - img.data[(y * w + Math.max(0, x - r)) * 3 + c]; } }
  for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + c]; for (let y = 0; y < h; y++) { out[(y * w + x) * 3 + c] = s / (2 * r + 1); s += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] - tmp[(Math.max(0, y - r) * w + x) * 3 + c]; } }
  return { w, h, ch: 3, data: out };
}
