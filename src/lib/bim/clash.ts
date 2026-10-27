/**
 * Geometric clash detection between MEP elements and between MEP and architecture.
 * Methods (stated in every result):
 *  - rectangular ducts / trays / equipment / boxes: oriented-box separating-axis test (exact for boxes) and closest-point box distance;
 *  - round pipes / conduits / round ducts vs each other: exact segment-to-segment distance minus the two radii;
 *  - round vs box: the round element is replaced by its bounding box (conservative; flagged in the note);
 *  - slabs: exact segment-vs-prism test (plan polygon x vertical extent).
 * A "hard" clash is a real volume overlap deeper than the tolerance; a "clearance" finding is a gap smaller than the configured clearance.
 * Not detected: curved architecture, openings that are not modelled, elements without geometry, clashes inside imported IFC meshes beyond bounding boxes.
 */
import type { Building, Clash, MepElement, Settings } from "./model";
import { wallPieces } from "./build";
import { LINEAR, segmentsOf } from "./mep";
import { dist3, obbAabb, obbDistance, obbFromBox, obbFromSegment, obbPenetration, pointInPoly, segIntersect, type Obb, type V3 } from "./geom";

export interface Item { id: string; cat: string; tag: string; group: string; mep: boolean; obb?: Obb; seg?: { a: V3; b: V3; r: number }; slab?: { poly: { x: number; y: number }[]; z0: number; z1: number }; aabb: { min: V3; max: V3 }; networkId?: string; ends?: V3[]; round?: boolean }

export function segSegDist(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z }, d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z }, r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
  const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z; const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r); let s: number, t: number; const EPS = 1e-12;
  if (a <= EPS && e <= EPS) return dist3(p1, p2);
  if (a <= EPS) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else { const c = dot(d1, r); if (e <= EPS) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else { const b = dot(d1, d2), den = a * e - b * b; s = den > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0; t = (b * s + f) / e; if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); } } }
  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s }, c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t }; return dist3(c1, c2);
}
/** Segment (inflated by radius r) against a vertical prism: returns the vertical overlap depth (0 when disjoint). */
export function segVsPrism(a: V3, b: V3, r: number, poly: { x: number; y: number }[], z0: number, z1: number): number {
  const zlo = Math.min(a.z, b.z) - r, zhi = Math.max(a.z, b.z) + r; const ov = Math.min(zhi, z1) - Math.max(zlo, z0); if (ov <= 0) return 0;
  const steps = Math.max(2, Math.ceil(dist3(a, b) / 0.1)); let inside = false;
  for (let i = 0; i <= steps && !inside; i++) { const t = i / steps; if (pointInPoly({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, poly)) inside = true; }
  if (!inside) for (let i = 0; i < poly.length && !inside; i++) if (segIntersect(a, b, poly[i], poly[(i + 1) % poly.length])) inside = true;
  return inside ? ov : 0;
}

export function mepItems(els: MepElement[]): Item[] {
  const out: Item[] = [];
  for (const e of els) {
    if (LINEAR.includes(e.category)) {
      const segs = segmentsOf(e);
      segs.forEach(([a, b], i) => { const round = e.section.shape === "round"; const obb = obbFromSegment(a, b, e.section.w, e.section.h); out.push({ id: e.id, cat: e.category, tag: e.tag, group: e.id, mep: true, obb, seg: round ? { a, b, r: e.section.w / 2 } : undefined, aabb: obbAabb(obb), networkId: e.networkId, ends: i === 0 && i === segs.length - 1 ? [a, b] : i === 0 ? [a] : i === segs.length - 1 ? [b] : [], round }); });
    } else {
      const s = e.size3 ?? { x: e.section.w, y: e.section.h, z: 0.2, rotation: 0 }; const c = e.path[0]; const cr = Math.cos(s.rotation), sr = Math.sin(s.rotation);
      const obb: Obb = { c, ax: [{ x: cr, y: sr, z: 0 }, { x: -sr, y: cr, z: 0 }, { x: 0, y: 0, z: 1 }], h: [s.x / 2, s.y / 2, s.z / 2] };
      out.push({ id: e.id, cat: e.category, tag: e.tag, group: e.id, mep: true, obb, aabb: obbAabb(obb), networkId: e.networkId, ends: [c] });
    }
  }
  return out;
}
export function archItems(b: Building): Item[] {
  const out: Item[] = [];
  for (const w of b.walls) { const base = b.levels.find((l) => l.id === w.level)!.elevation; wallPieces(w, base).forEach((p) => out.push({ id: w.id, cat: `wall-${w.kind}`, tag: w.id, group: w.id, mep: false, obb: p.box, aabb: obbAabb(p.box) })); }
  for (const c of b.columns) { const base = b.levels.find((l) => l.id === c.level)!.elevation; const o = obbFromBox({ x: c.c.x - c.w / 2, y: c.c.y - c.d / 2, z: base }, { x: c.c.x + c.w / 2, y: c.c.y + c.d / 2, z: base + c.height }); out.push({ id: c.id, cat: "column", tag: c.id, group: c.id, mep: false, obb: o, aabb: obbAabb(o) }); }
  for (const s of b.slabs) { const xs = s.polygon.map((p) => p.x), ys = s.polygon.map((p) => p.y); out.push({ id: s.id, cat: s.kind === "roof" ? "roof" : "slab-floor", tag: s.id, group: s.id, mep: false, slab: { poly: s.polygon, z0: s.z, z1: s.z + s.thickness }, aabb: { min: { x: Math.min(...xs), y: Math.min(...ys), z: s.z }, max: { x: Math.max(...xs), y: Math.max(...ys), z: s.z + s.thickness } } }); }
  return out;
}

const POINTY = ["equipment", "air-terminal", "light", "fitting"];
export function detectClashes(b: Building | null, els: MepElement[], st: Pick<Settings, "clearance" | "clashTolerance">): { clashes: Clash[]; tested: number; method: string[] } {
  const items = [...mepItems(els), ...(b ? archItems(b) : [])]; const cl = st.clearance, tol = st.clashTolerance; const best = new Map<string, Clash>(); let tested = 0;
  const rank = { high: 4, medium: 3, low: 2, warning: 1 } as const; const order = items.map((_, i) => i).sort((p, q) => items[p].aabb.min.x - items[q].aabb.min.x);
  for (let oi = 0; oi < order.length; oi++) {
    const A = items[order[oi]];
    for (let oj = oi + 1; oj < order.length; oj++) {
      const B = items[order[oj]]; if (B.aabb.min.x > A.aabb.max.x + cl) break;
      if (!A.mep && !B.mep) continue; if (A.group === B.group) continue;
      if (A.aabb.min.y > B.aabb.max.y + cl || B.aabb.min.y > A.aabb.max.y + cl || A.aabb.min.z > B.aabb.max.z + cl || B.aabb.min.z > A.aabb.max.z + cl) continue;
      if (A.mep && B.mep && A.ends && B.ends && A.ends.some((p) => B.ends!.some((q) => dist3(p, q) < 0.08))) continue; // connected ends are not clashes
      if (A.mep && B.mep && (POINTY.includes(A.cat) || POINTY.includes(B.cat)) && A.networkId && A.networkId === B.networkId) continue; // intentional connection
      tested++; let hard = 0, gap = Infinity, method: Clash["method"] = "oriented-box SAT", note: string | undefined;
      const slab = A.slab ? A : B.slab ? B : null; const other = slab === A ? B : A;
      if (slab) {
        let m: { a: V3; b: V3; r: number } | null = other.seg ?? null;
        if (!m && other.obb) { const o = other.obb; const ex = { x: o.ax[0].x * o.h[0], y: o.ax[0].y * o.h[0], z: o.ax[0].z * o.h[0] }; m = { a: { x: o.c.x - ex.x, y: o.c.y - ex.y, z: o.c.z - ex.z }, b: { x: o.c.x + ex.x, y: o.c.y + ex.y, z: o.c.z + ex.z }, r: Math.max(o.h[1], o.h[2]) }; }
        if (!m) continue; const sl = slab.slab!; const ov = segVsPrism(m.a, m.b, m.r, sl.poly, sl.z0, sl.z1); method = "segment vs slab prism";
        if (ov > tol) hard = ov; else { const inPlan = segVsPrism(m.a, m.b, m.r, sl.poly, sl.z0 - 10, sl.z1 + 10) > 0; const top = Math.max(m.a.z, m.b.z) + m.r, bot = Math.min(m.a.z, m.b.z) - m.r; const g = bot >= sl.z1 ? bot - sl.z1 : top <= sl.z0 ? sl.z0 - top : 0; if (inPlan && g < cl) gap = g; }
      } else if (A.seg && B.seg) { const d = segSegDist(A.seg.a, A.seg.b, B.seg.a, B.seg.b) - A.seg.r - B.seg.r; method = "segment distance (round)"; if (d < -tol) hard = -d; else if (d < cl) gap = Math.max(0, d); }
      else if (A.obb && B.obb) { const pen = obbPenetration(A.obb, B.obb); if (pen > tol) hard = pen; else gap = obbDistance(A.obb, B.obb); if (A.round || B.round) note = "round element approximated by its bounding box"; }
      if (hard <= 0 && !(gap < cl)) continue;
      const lo = { x: Math.max(A.aabb.min.x, B.aabb.min.x), y: Math.max(A.aabb.min.y, B.aabb.min.y), z: Math.max(A.aabb.min.z, B.aabb.min.z) }, hi = { x: Math.min(A.aabb.max.x, B.aabb.max.x), y: Math.min(A.aabb.max.y, B.aabb.max.y), z: Math.min(A.aabb.max.z, B.aabb.max.z) };
      const min = { x: Math.min(lo.x, hi.x), y: Math.min(lo.y, hi.y), z: Math.min(lo.z, hi.z) }, max = { x: Math.max(lo.x, hi.x), y: Math.max(lo.y, hi.y), z: Math.max(lo.z, hi.z) };
      const type: Clash["type"] = hard > 0 ? "hard" : "clearance"; const severity: Clash["severity"] = type === "hard" ? (hard >= 0.1 ? "high" : hard >= 0.03 ? "medium" : "low") : "warning";
      const key = [A.group, B.group].sort().join("|");
      const c: Clash = { id: "", type, a: { id: A.id, cat: A.cat, tag: A.tag }, b: { id: B.id, cat: B.cat, tag: B.tag }, depth: Math.round(hard * 1000) / 1000, distance: type === "hard" ? 0 : Math.round(gap * 1000) / 1000, point: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }, box: { min, max }, severity, method, note };
      const prev = best.get(key); if (!prev || rank[c.severity] > rank[prev.severity] || (c.severity === prev.severity && (c.depth > prev.depth || c.distance < prev.distance))) best.set(key, c);
    }
  }
  const ord = { high: 0, medium: 1, low: 2, warning: 3 } as const;
  const clashes = [...best.values()].sort((p, q) => ord[p.severity] - ord[q.severity] || q.depth - p.depth).map((c, i) => ({ ...c, id: `CL${String(i + 1).padStart(3, "0")}` }));
  return { clashes, tested, method: ["oriented-box SAT (boxes)", "segment distance minus radii (round vs round)", "segment vs slab prism", "round vs box uses the bounding box"] };
}
