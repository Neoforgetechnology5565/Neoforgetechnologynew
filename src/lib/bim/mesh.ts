import { add3, mul3, norm3, obbCorners, polyArea, sub3, cross3, type Obb, type V2, type V3 } from "./geom";

export class MeshBuilder {
  pos: number[] = []; idx: number[] = [];
  private v(p: V3) { this.pos.push(p.x, p.y, p.z); return this.pos.length / 3 - 1; }
  tri(a: V3, b: V3, c: V3) { const i = this.v(a); this.v(b); this.v(c); this.idx.push(i, i + 1, i + 2); }
  quad(a: V3, b: V3, c: V3, d: V3) { this.tri(a, b, c); this.tri(a, c, d); }
  obb(o: Obb) {
    const [ux, uy, uz] = o.ax; const [hx, hy, hz] = o.h; const P = (i: number, j: number, k: number) => add3(add3(add3(o.c, mul3(ux, i * hx)), mul3(uy, j * hy)), mul3(uz, k * hz));
    // right-handed axes assumed; faces wound outward
    const rh = cross3(ux, uy); const flip = rh.x * uz.x + rh.y * uz.y + rh.z * uz.z < 0;
    const f = (a: V3, b: V3, c: V3, d: V3) => (flip ? this.quad(a, d, c, b) : this.quad(a, b, c, d));
    f(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)); f(P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1));
    f(P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1)); f(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1));
    f(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)); f(P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1));
  }
  /** Vertical prism from a simple polygon between z0 and z1. */
  prism(poly: V2[], z0: number, z1: number) {
    if (poly.length < 3) return; const ccw = polyArea(poly) > 0 ? poly : [...poly].reverse(); const tris = triangulate(ccw);
    for (const [a, b, c] of tris) { this.tri({ ...ccw[a], z: z1 }, { ...ccw[b], z: z1 }, { ...ccw[c], z: z1 }); this.tri({ ...ccw[c], z: z0 }, { ...ccw[b], z: z0 }, { ...ccw[a], z: z0 }); }
    for (let i = 0; i < ccw.length; i++) { const p = ccw[i], q = ccw[(i + 1) % ccw.length]; this.quad({ ...p, z: z0 }, { ...q, z: z0 }, { ...q, z: z1 }, { ...p, z: z1 }); }
  }
  /** Cylinder / round duct along a segment. */
  cylinder(a: V3, b: V3, r: number, seg = 14) {
    const d = sub3(b, a); const u = norm3(d); let s = cross3({ x: 0, y: 0, z: 1 }, u); if (Math.hypot(s.x, s.y, s.z) < 1e-6) s = { x: 0, y: 1, z: 0 }; s = norm3(s); const t = norm3(cross3(u, s));
    const ring = (c: V3, i: number) => { const a0 = (i / seg) * Math.PI * 2; return add3(c, add3(mul3(s, Math.cos(a0) * r), mul3(t, Math.sin(a0) * r))); };
    for (let i = 0; i < seg; i++) { const p0 = ring(a, i), p1 = ring(a, i + 1), q0 = ring(b, i), q1 = ring(b, i + 1); this.quad(p0, p1, q1, q0); this.tri(a, p1, p0); this.tri(b, q0, q1); }
  }
  sphere(c: V3, r: number, seg = 10) { for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) { const pt = (ii: number, jj: number): V3 => { const th = (ii / seg) * Math.PI, ph = (jj / seg) * Math.PI * 2; return { x: c.x + r * Math.sin(th) * Math.cos(ph), y: c.y + r * Math.sin(th) * Math.sin(ph), z: c.z + r * Math.cos(th) }; }; this.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)); } }
  done() { return { pos: this.pos.map((v) => Math.round(v * 10000) / 10000), idx: this.idx }; }
}
/** Ear-clipping triangulation of a simple CCW polygon. */
export function triangulate(p: V2[]): [number, number, number][] {
  const n = p.length; const idx = Array.from({ length: n }, (_, i) => i); const out: [number, number, number][] = []; let guard = 0;
  const area2 = (a: V2, b: V2, c: V2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inTri = (q: V2, a: V2, b: V2, c: V2) => area2(a, b, q) >= -1e-12 && area2(b, c, q) >= -1e-12 && area2(c, a, q) >= -1e-12;
  while (idx.length > 3 && guard++ < n * n) { let clipped = false; for (let i = 0; i < idx.length; i++) { const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length]; if (area2(p[a], p[b], p[c]) <= 1e-12) continue; let ear = true; for (const q of idx) { if (q === a || q === b || q === c) continue; if (inTri(p[q], p[a], p[b], p[c])) { ear = false; break; } } if (ear) { out.push([a, b, c]); idx.splice(i, 1); clipped = true; break; } } if (!clipped) { out.push([idx[0], idx[1], idx[2]]); idx.splice(1, 1); } }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]); return out;
}
export const meshStats = (m: { pos: number[]; idx: number[] }) => ({ vertices: m.pos.length / 3, triangles: m.idx.length / 3 });
void obbCorners;
