/** Small 2D/3D geometry toolkit used by the plan interpreter, model generator, clash engine and exporters. All lengths are in metres unless a function says otherwise. */
export interface V2 { x: number; y: number }
export interface V3 { x: number; y: number; z: number }
export const EPS = 1e-9;
export const v2 = (x: number, y: number): V2 => ({ x, y });
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
export const cross = (a: V2, b: V2) => a.x * b.y - a.y * b.x;
export const len = (a: V2) => Math.hypot(a.x, a.y);
export const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: V2): V2 => { const l = len(a); return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }; };
export const perp = (a: V2): V2 => ({ x: -a.y, y: a.x });
export const lerp = (a: V2, b: V2, t: number): V2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const rot = (a: V2, ang: number): V2 => { const c = Math.cos(ang), s = Math.sin(ang); return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }; };
export const angleOf = (a: V2) => Math.atan2(a.y, a.x);

/** Signed area (counter-clockwise positive). */
export function polyArea(p: V2[]): number { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
export function polyPerimeter(p: V2[]): number { let s = 0; for (let i = 0; i < p.length; i++) s += dist(p[i], p[(i + 1) % p.length]); return s; }
export function polyCentroid(p: V2[]): V2 { const A = polyArea(p); if (Math.abs(A) < EPS) return p[0] ?? { x: 0, y: 0 }; let cx = 0, cy = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; const f = a.x * b.y - b.x * a.y; cx += (a.x + b.x) * f; cy += (a.y + b.y) * f; } return { x: cx / (6 * A), y: cy / (6 * A) }; }
export function pointInPoly(p: V2, poly: V2[]): boolean { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; }
export function bboxOf(pts: V2[]) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; } return { x0, y0, x1, y1 }; }

/** Closest point on segment ab to p, with parameter t in [0,1]. */
export function closestOnSeg(p: V2, a: V2, b: V2): { pt: V2; t: number; d: number } { const ab = sub(b, a), l2 = dot(ab, ab); const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)); const pt = { x: a.x + ab.x * t, y: a.y + ab.y * t }; return { pt, t, d: dist(p, pt) }; }
/** Intersection of two infinite lines; null when parallel. Returns the point and parameters along each segment. */
export function lineIntersect(a: V2, b: V2, c: V2, d: V2): { pt: V2; t: number; u: number } | null { const r = sub(b, a), s = sub(d, c); const den = cross(r, s); if (Math.abs(den) < EPS) return null; const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den; return { pt: { x: a.x + r.x * t, y: a.y + r.y * t }, t, u }; }
export function segIntersect(a: V2, b: V2, c: V2, d: V2): V2 | null { const i = lineIntersect(a, b, c, d); return i && i.t >= -1e-9 && i.t <= 1 + 1e-9 && i.u >= -1e-9 && i.u <= 1 + 1e-9 ? i.pt : null; }

/** Tessellate a bulge arc between p0 and p1 (DXF bulge = tan(θ/4)). */
export function bulgeArc(p0: V2, p1: V2, bulge: number, maxSeg = 0.1): V2[] {
  if (Math.abs(bulge) < 1e-9) return [p0, p1]; const theta = 4 * Math.atan(bulge); const chord = dist(p0, p1); const r = chord / (2 * Math.sin(Math.abs(theta) / 2)); const mid = lerp(p0, p1, 0.5); const h = r * Math.cos(Math.abs(theta) / 2) * Math.sign(bulge); const n = norm(perp(sub(p1, p0))); const c = { x: mid.x - n.x * h, y: mid.y - n.y * h };
  const a0 = Math.atan2(p0.y - c.y, p0.x - c.x); const steps = Math.max(2, Math.ceil(Math.abs(theta) * r / maxSeg)); const out: V2[] = []; for (let i = 0; i <= steps; i++) { const a = a0 + (theta * i) / steps; out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); } out[0] = p0; out[out.length - 1] = p1; return out;
}
export function arcPoints(c: V2, r: number, a0: number, a1: number, maxSeg = 0.1): V2[] { let sweep = a1 - a0; while (sweep <= 0) sweep += Math.PI * 2; const steps = Math.max(4, Math.ceil((sweep * r) / maxSeg)); const out: V2[] = []; for (let i = 0; i <= steps; i++) { const a = a0 + (sweep * i) / steps; out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); } return out; }

/* ───────── 3D oriented boxes, segments (clash engine) ───────── */
export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
export const add3 = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul3 = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const norm3 = (a: V3): V3 => { const l = len3(a); return l < EPS ? { x: 0, y: 0, z: 0 } : mul3(a, 1 / l); };
export const dist3 = (a: V3, b: V3) => len3(sub3(a, b));
/** Oriented bounding box: centre, three orthonormal axes, half extents. */
export interface Obb { c: V3; ax: [V3, V3, V3]; h: [number, number, number] }
/** Box from a segment with a rectangular/round cross-section, `w` horizontal and `h` vertical (round: both = diameter). */
export function obbFromSegment(a: V3, b: V3, w: number, h: number): Obb {
  const d = sub3(b, a), L = len3(d); const u = L < EPS ? { x: 1, y: 0, z: 0 } : mul3(d, 1 / L); let side = cross3({ x: 0, y: 0, z: 1 }, u); if (len3(side) < 1e-6) side = { x: 0, y: 1, z: 0 }; side = norm3(side); const up = norm3(cross3(u, side));
  return { c: mul3(add3(a, b), 0.5), ax: [u, side, up], h: [L / 2, w / 2, h / 2] };
}
export function obbFromBox(min: V3, max: V3): Obb { return { c: mul3(add3(min, max), 0.5), ax: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }], h: [(max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2] }; }
export function obbCorners(o: Obb): V3[] { const out: V3[] = []; for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) out.push(add3(add3(add3(o.c, mul3(o.ax[0], i * o.h[0])), mul3(o.ax[1], j * o.h[1])), mul3(o.ax[2], k * o.h[2]))); return out; }
export function obbAabb(o: Obb) { const cs = obbCorners(o); return { min: { x: Math.min(...cs.map((p) => p.x)), y: Math.min(...cs.map((p) => p.y)), z: Math.min(...cs.map((p) => p.z)) }, max: { x: Math.max(...cs.map((p) => p.x)), y: Math.max(...cs.map((p) => p.y)), z: Math.max(...cs.map((p) => p.z)) } }; }
/** Separating-axis test. Returns the penetration depth (>0 means the boxes overlap, the value is the smallest overlap along any separating axis) or the negative separation gap along the best axis (an approximation of the clearance between boxes; exact distance is available through `obbDistance`). */
export function obbPenetration(A: Obb, B: Obb): number {
  const axes: V3[] = [...A.ax, ...B.ax]; for (const a of A.ax) for (const b of B.ax) { const c = cross3(a, b); if (len3(c) > 1e-9) axes.push(norm3(c)); }
  const T = sub3(B.c, A.c); let best = Infinity;
  for (const ax of axes) { const ra = A.h[0] * Math.abs(dot3(A.ax[0], ax)) + A.h[1] * Math.abs(dot3(A.ax[1], ax)) + A.h[2] * Math.abs(dot3(A.ax[2], ax)); const rb = B.h[0] * Math.abs(dot3(B.ax[0], ax)) + B.h[1] * Math.abs(dot3(B.ax[1], ax)) + B.h[2] * Math.abs(dot3(B.ax[2], ax)); const ov = ra + rb - Math.abs(dot3(T, ax)); if (ov < best) best = ov; }
  return best;
}
/** Minimum distance between two boxes (0 when they overlap): iterative closest-point refinement on the surfaces via corner/edge sampling — exact for separated boxes up to 1e-4 m. */
export function obbDistance(A: Obb, B: Obb): number {
  if (obbPenetration(A, B) > 0) return 0;
  const clampIn = (o: Obb, p: V3): V3 => { const d = sub3(p, o.c); let r = o.c; for (let i = 0; i < 3; i++) { const t = Math.max(-o.h[i], Math.min(o.h[i], dot3(d, o.ax[i]))); r = add3(r, mul3(o.ax[i], t)); } return r; };
  let p = A.c, q = B.c, best = Infinity;
  for (let it = 0; it < 60; it++) { const pa = clampIn(A, q); const qb = clampIn(B, pa); const dd = dist3(pa, qb); if (Math.abs(best - dd) < 1e-9) { best = dd; break; } best = dd; p = pa; q = qb; }
  // convex-set alternating projection converges to a minimiser; refine from a few seeds to avoid local stalls
  for (const cs of obbCorners(A)) { let a = cs, b = clampIn(B, cs); for (let it = 0; it < 30; it++) { a = clampIn(A, b); b = clampIn(B, a); } best = Math.min(best, dist3(a, b)); }
  for (const cs of obbCorners(B)) { let b = cs, a = clampIn(A, cs); for (let it = 0; it < 30; it++) { b = clampIn(B, a); a = clampIn(A, b); } best = Math.min(best, dist3(a, b)); }
  void p; void q; return best;
}
