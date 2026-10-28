/** Client-side port of services/roof-analyzer/app/measure.py so that changing a reference, scale or pitch updates every number instantly. Parity is tested against the Python engine (measure.test.ts). */
import type { Georef, Measurements, PitchInfo, PitchSpec, ScaleSpec, XY } from "./types";

export class ScaleError extends Error {}
export interface Scale { kind: string; source: string; meaning: string; note: string; gsdX?: number; gsdY?: number; H?: number[] }

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));
const num = (v: unknown, name: string, lo: number, hi: number) => { const x = Number(v); if (!(Number.isFinite(x) && x > lo && x < hi)) throw new ScaleError(`${name} is out of range.`); return x; };
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Solve the 3×3 homography mapping four source points to four destination points (direct linear transform, 8 unknowns). */
export function homography(src: XY[], dst: XY[]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  const n = 8; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new ScaleError("The four corners are degenerate (three are in a line).");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const h = M.map((r, i) => r[n] / r[i]); return [...h, 1];
}
const apply = (H: number[], p: XY): XY => { const w = H[6] * p[0] + H[7] * p[1] + H[8]; return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w]; };
const area = (p: XY[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(s) / 2; };
function convex(q: XY[]) { let sign = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]; const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (z !== 0) { if (sign && Math.sign(z) !== sign) return false; sign = Math.sign(z); } } return true; }

export function resolveScale(spec: ScaleSpec | null | undefined, georef: Georef | null): Scale | null {
  if (!spec || spec.type === "none") {
    if (georef) return { kind: "geo", source: "GeoTIFF tags", meaning: "Plan-view (horizontal projection) measurements; valid for near-nadir imagery", note: `${georef.note}. Pixels are not exactly square on the ground: x ${georef.gsd_x_m.toFixed(4)} m, y ${georef.gsd_y_m.toFixed(4)} m.`, gsdX: georef.gsd_x_m, gsdY: georef.gsd_y_m };
    return null;
  }
  if (spec.type === "geo") { if (!georef) throw new ScaleError("This image has no georeferencing metadata."); return resolveScale(null, georef); }
  if (spec.type === "gsd") { const g = num(spec.gsd_m, "Ground sample distance", 1e-4, 100); return { kind: "gsd", source: "user", meaning: "Plan-view measurements using the ground sample distance you entered (not verified); valid for near-nadir imagery", note: "User-supplied ground sample distance.", gsdX: g, gsdY: g }; }
  if (spec.type === "reference") {
    const d = dist(spec.p1, spec.p2); if (!(d >= 4)) throw new ScaleError("The two reference points are too close together to define a scale.");
    const g = num(spec.length_m, "Reference length", 1e-3, 1e5) / d;
    return { kind: "reference", source: "user", meaning: "Plan-view measurements from one reference length. Assumes the reference lies in the same plane as what you measure and the view is straight down", note: `Reference ${d.toFixed(1)} px = ${spec.length_m} m. One reference length cannot correct perspective.`, gsdX: g, gsdY: g };
  }
  if (spec.type === "plane_quad") {
    if (spec.quad.length !== 4) throw new ScaleError("plane_quad needs exactly four corner points.");
    const w = num(spec.width_m, "Width", 1e-3, 1e5), h = num(spec.height_m, "Height", 1e-3, 1e5);
    if (area(spec.quad) < 100 || !convex(spec.quad)) throw new ScaleError("The four corners must form a convex quadrilateral with a visible area, in order around the rectangle.");
    const H = homography(spec.quad, [[0, 0], [w, 0], [w, h], [0, h]]);
    return { kind: "plane_quad", source: "user", meaning: "True lengths and areas inside the plane of the rectangle you marked, with perspective corrected. Valid only for points that lie in that plane", note: `Rectangle ${w} m × ${h} m, corners in order top-left, top-right, bottom-right, bottom-left of the rectangle.`, H };
  }
  throw new ScaleError("Unknown scale type.");
}
export function pitchFrom(spec: PitchSpec | null | undefined): PitchInfo | null {
  if (!spec) return null; let deg: number, r: number;
  if (spec.rise_per_12 !== undefined && spec.rise_per_12 !== null && !Number.isNaN(spec.rise_per_12)) { r = spec.rise_per_12; deg = (Math.atan(r / 12) * 180) / Math.PI; }
  else if (spec.degrees !== undefined && spec.degrees !== null && !Number.isNaN(spec.degrees)) { deg = spec.degrees; r = 12 * Math.tan((deg * Math.PI) / 180); } else return null;
  if (!(Number.isFinite(deg) && deg >= 0 && deg <= 80)) throw new ScaleError("Pitch must be between 0 and 80 degrees (0 to about 68 rise per 12).");
  return { status: "supplied", degrees: deg, rise_per_12: r, source: "user", note: "User-supplied. Not measured from the image." };
}
const toMetric = (s: Scale, pts: XY[]): XY[] => (s.H ? pts.map((p) => apply(s.H!, p)) : pts.map((p) => [p[0] * s.gsdX!, p[1] * s.gsdY!] as XY));
const edges = (p: XY[]) => p.map((a, i) => dist(a, p[(i + 1) % p.length]));

/** Minimum-area bounding rectangle by rotating calipers over the convex hull (matches cv2.minAreaRect for sizes). */
export function minRectSize(pts: XY[]): [number, number] {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: XY[] = []; for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up: XY[] = []; for (const p of [...P].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const hull = [...lo.slice(0, -1), ...up.slice(0, -1)]; let best: [number, number] = [0, 0], ba = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of hull) { const x = p[0] * c - p[1] * s, y = p[0] * s + p[1] * c; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = x1 - x0, h = y1 - y0; if (w * h < ba) { ba = w * h; best = [Math.max(w, h), Math.min(w, h)]; }
  }
  return best;
}

export function measurePolygon(poly: XY[], scale: Scale | null, pitch: PitchInfo | null): Measurements {
  if (poly.length < 3) throw new ScaleError("A polygon needs at least three points.");
  const e = edges(poly); const pixels = { area_px: area(poly), perimeter_px: e.reduce((a, b) => a + b, 0), edge_lengths_px: e };
  if (!scale) return { pixels, metric: { available: false, reason: "No scale: pixel measurements cannot be converted to metres. Provide a GeoTIFF, a ground sample distance, a known reference length, or a rectangle of known size on the roof plane." }, surface: { available: false, reason: "Needs a scale and a pitch." }, pitch: pitch ?? { status: "not_measurable", reason: "Pitch cannot be measured from a single image without camera or height information." } };
  const m = toMetric(scale, poly), em = edges(m), a = area(m); const [L, W] = minRectSize(m);
  const metric = { available: true, area_m2: a, perimeter_m: em.reduce((x, y) => x + y, 0), edge_lengths_m: em, bounding_rectangle_m: { length: L, width: W }, meaning: scale.meaning, scale_kind: scale.kind, scale_source: scale.source };
  if (scale.kind === "plane_quad") return { pixels, metric, surface: { available: true, area_m2: a, basis: "true area inside the calibrated plane (perspective corrected); no pitch assumption" }, pitch: pitch ?? { status: "not_measurable", reason: "The calibrated plane is metric, but its inclination relative to the horizontal is unknown without camera or gravity information." } };
  if (pitch) { const c = Math.cos(((pitch.degrees ?? 0) * Math.PI) / 180); return { pixels, metric, surface: { available: true, area_m2: a / c, basis: `plan-view area ÷ cos(slope), using the pitch you supplied (${pitch.rise_per_12!.toFixed(2)}:12 = ${pitch.degrees!.toFixed(1)}°) and assuming one uniform slope`, assumption: "uniform user-supplied pitch" }, pitch }; }
  return { pixels, metric, surface: { available: false, reason: "Plan-view area is a horizontal projection. The sloped surface area needs the pitch, which an image alone cannot give; enter it if you know it." }, pitch: { status: "not_measurable", reason: "Pitch cannot be measured from a single nadir image; enter it if you know it." } };
}
export { finite };
