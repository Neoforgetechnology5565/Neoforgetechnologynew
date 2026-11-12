/**
 * Geometry extraction, simplification, thermal-zone preparation and incremental caching for demo 22.
 * All numbers come from the sample model's geometry. Times are measured in the browser and are NOT benchmarks of a Revit or SketchUp plug-in.
 */
import { FH, PART_H, X0, X1, Z0, Z1, partFrame, wallFrame } from "./model";
import type { Bound, Cat, Elem, Line, Model, OpeningP, Solid, Surf, UnitResult, Vec3, ZoneP, ZoneResult, Work } from "./types";
import { CATS } from "./types";

/* ---------- small vector helpers ---------- */
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const rv = (v: Vec3): Vec3 => [r3(v[0]), r3(v[1]), r3(v[2])];

/** Newell normal (not normalised) of a polygon; its length is twice the area. */
function newell(v: Vec3[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); }
  return [x, y, z];
}
function oriented(v: Vec3[], want: Vec3): Vec3[] { return dot(newell(v), want) < 0 ? [...v].reverse() : v; }

/* ---------- bounds ---------- */
export interface Aabb { min: Vec3; max: Vec3 }
export function solidBounds(s: Solid): Aabb {
  const [cx, cy, cz] = s.c;
  if (s.k === "box") {
    const h: Vec3 = [s.s[0] / 2, s.s[1] / 2, s.s[2] / 2], co = Math.cos(s.rx ?? 0), si = Math.sin(s.rx ?? 0);
    const min: Vec3 = [cx - h[0], Infinity, Infinity], max: Vec3 = [cx + h[0], -Infinity, -Infinity];
    for (const y of [-h[1], h[1]]) for (const z of [-h[2], h[2]]) { const yy = cy + y * co - z * si, zz = cz + y * si + z * co; min[1] = Math.min(min[1], yy); max[1] = Math.max(max[1], yy); min[2] = Math.min(min[2], zz); max[2] = Math.max(max[2], zz); }
    return { min, max };
  }
  if (s.k === "cyl") return { min: [cx - s.s[0], cy - s.s[1] / 2, cz - s.s[0]], max: [cx + s.s[0], cy + s.s[1] / 2, cz + s.s[0]] };
  return { min: [cx - s.s[0], cy - s.s[0], cz - s.s[0]], max: [cx + s.s[0], cy + s.s[0], cz + s.s[0]] };
}
export function boundsOf(solids: Solid[]): Aabb {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of solids) { const b = solidBounds(s); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); } }
  return { min, max };
}

/* ---------- triangle counts and the naive full-detail pass ---------- */
export const TRIS = { box: 12, cyl: 64, sph: 288 } as const;
export const solidTris = (s: Solid) => TRIS[s.k];
export const countTris = (elems: Elem[]) => elems.reduce((n, e) => n + e.solids.reduce((m, s) => m + solidTris(s), 0), 0);
export const countSolids = (elems: Elem[]) => elems.reduce((n, e) => n + e.solids.length, 0);

/** Walks every triangle of the detailed model and accumulates area and normals. This is the work a preprocessor would do on the unsimplified geometry. */
export function originalPass(elems: Elem[]): { tris: number; area: number; ms: number } {
  const t0 = performance.now();
  let tris = 0, area = 0, nsum = 0;
  const tri = (a: Vec3, b: Vec3, c: Vec3) => { const n = cross(sub(b, a), sub(c, a)); const l = len(n); area += l / 2; nsum += l > 0 ? Math.abs(n[1]) / l : 0; tris++; };
  for (const e of elems) for (const s of e.solids) {
    const [cx, cy, cz] = s.c;
    if (s.k === "box") {
      const co = Math.cos(s.rx ?? 0), si = Math.sin(s.rx ?? 0), p: Vec3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) { const yy = (y * s.s[1]) / 2, zz = (z * s.s[2]) / 2; p.push([cx + (x * s.s[0]) / 2, cy + yy * co - zz * si, cz + yy * si + zz * co]); }
      for (const q of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) { tri(p[q[0]], p[q[1]], p[q[2]]); tri(p[q[0]], p[q[2]], p[q[3]]); }
    } else if (s.k === "cyl") {
      const r = s.s[0], h = s.s[1] / 2, ring = (y: number, i: number): Vec3 => [cx + r * Math.cos((i * Math.PI * 2) / 16), cy + y, cz + r * Math.sin((i * Math.PI * 2) / 16)];
      for (let i = 0; i < 16; i++) { const j = i + 1; tri(ring(-h, i), ring(-h, j), ring(h, j)); tri(ring(-h, i), ring(h, j), ring(h, i)); tri([cx, cy + h, cz], ring(h, i), ring(h, j)); tri([cx, cy - h, cz], ring(-h, j), ring(-h, i)); }
    } else {
      const r = s.s[0], pt = (j: number, i: number): Vec3 => { const la = (Math.PI * j) / 10, lo = (Math.PI * 2 * i) / 16; return [cx + r * Math.sin(la) * Math.cos(lo), cy + r * Math.cos(la), cz + r * Math.sin(la) * Math.sin(lo)]; };
      for (let j = 0; j < 10; j++) for (let i = 0; i < 16; i++) { if (j !== 0) tri(pt(j, i), pt(j + 1, i), pt(j, i + 1)); if (j !== 9) tri(pt(j, i + 1), pt(j + 1, i), pt(j + 1, i + 1)); }
    }
  }
  return { tris, area, ms: performance.now() - t0 + nsum * 0 };
}

/* ---------- classification (extraction) ---------- */
export interface Classified { id: string; cat: Cat | null; rule: string }
/** Rule-based classification from the source attributes, with a geometry rule for untyped "Generic Models". */
export function classify(e: Elem): Classified {
  const b = boundsOf(e.solids), cat = e.src.category;
  const external = b.min[0] <= X0 + 1e-6 || b.max[0] >= X1 - 1e-6 || b.min[2] <= Z0 + 1e-6 || b.max[2] >= Z1 - 1e-6;
  if (cat === "Walls") return external && e.src.type.startsWith("Ext") ? { id: e.id, cat: "wall", rule: "Category Walls, type Ext., on the building perimeter" } : { id: e.id, cat: "partition", rule: "Category Walls, type Int., inside the perimeter" };
  if (cat === "Windows") return { id: e.id, cat: "window", rule: "Category Windows" };
  if (cat === "Doors") return { id: e.id, cat: "door", rule: "Category Doors" };
  if (cat === "Floors") return { id: e.id, cat: "floor", rule: "Category Floors" };
  if (cat === "Roofs") return { id: e.id, cat: "roof", rule: "Category Roofs" };
  if (cat === "Planting") return { id: e.id, cat: "shading", rule: "Category Planting: tree canopy that can shade the building" };
  if (cat === "Mass") return { id: e.id, cat: "shading", rule: "Category Mass outside the site footprint: neighbouring building" };
  if (cat === "Generic Models") {
    const t = b.max[1] - b.min[1], sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2], outside = b.max[2] > Z1 + 0.05 || b.max[0] > X1 + 0.05;
    if (t < 0.7 && sx > 0.5 && sz > 0.5 && outside) return { id: e.id, cat: "shading", rule: "Generic model: thin, near-horizontal plate projecting beyond the facade (overhang)" };
    return { id: e.id, cat: null, rule: "Generic model not matched by any geometry rule" };
  }
  return { id: e.id, cat: null, rule: "No rule for this source category" };
}

export interface ExtractSummary {
  rows: { cat: Cat | "zone"; label: string; detected: number; extracted: number; rule: string }[];
  zones: number; unclassified: string[]; classified: Classified[]; solids: number; tris: number; ms: number;
}
export function extract(model: Model, elems: Elem[]): ExtractSummary {
  const t0 = performance.now(), classified = elems.map(classify);
  const rows = CATS.map((c) => {
    const n = classified.filter((x) => x.cat === c).length;
    const rule = [...new Set(classified.filter((x) => x.cat === c).map((x) => x.rule))][0] ?? "";
    return { cat: c as Cat | "zone", label: ({ wall: "External walls", window: "Windows", door: "Doors", floor: "Floors", roof: "Roofs", partition: "Internal partitions", shading: "Shading objects" } as Record<Cat, string>)[c], detected: n, extracted: n, rule };
  });
  rows.splice(6, 0, { cat: "zone", label: "Thermal zones", detected: model.zones.length, extracted: model.zones.length, rule: "Rooms bounded by walls, partitions, floor and ceiling" });
  return { rows, zones: model.zones.length, unclassified: classified.filter((c) => !c.cat).map((c) => c.id), classified, solids: countSolids(elems), tris: countTris(elems), ms: performance.now() - t0 };
}

/* ---------- surface builders ---------- */
type Axis = "x" | "y" | "z";
function rectQuad(axis: Axis, d: number, a0: number, a1: number, b0: number, b1: number): Vec3[] {
  if (axis === "z") return [[a0, b0, d], [a1, b0, d], [a1, b1, d], [a0, b1, d]];
  if (axis === "x") return [[d, b0, a0], [d, b0, a1], [d, b1, a1], [d, b1, a0]];
  return [[a0, d, b0], [a1, d, b0], [a1, d, b1], [a0, d, b1]];
}
function mkSurf(base: Pick<Surf, "id" | "elem" | "cat" | "kind" | "level" | "boundary" | "source"> & Partial<Surf>, verts: Vec3[], want: Vec3): Surf {
  const v = oriented(verts, want).map(rv) as Vec3[], nw = newell(v), l = len(nw), n: Vec3 = [nw[0] / l, nw[1] / l, nw[2] / l];
  const horizontal = Math.abs(n[1]) > 0.999;
  const az = horizontal ? null : base.boundary === "internal" ? null : Math.round(((Math.atan2(n[0], -n[2]) * 180) / Math.PI + 360) % 360 * 10) / 10;
  return { children: [], zones: [], thickness: 0, ...base, verts: v, normal: [r3(n[0]), r3(n[1]), r3(n[2])], area: r3(l / 2), azimuth: az, tilt: Math.round((Math.acos(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI * 10) / 10 };
}
const work = (el: Elem, surfaces: number, merged = 0, lines = 0): Work => ({ solids: el.solids.length, faces: el.solids.length * 6, tris: el.solids.reduce((n, s) => n + solidTris(s), 0), removed: Math.max(0, el.solids.length - surfaces - lines), merged });

interface Ctx { model: Model; byId: Map<string, Elem> }
export const makeCtx = (model: Model, elems: Elem[]): Ctx => ({ model, byId: new Map(elems.map((e) => [e.id, e])) });

/** In-plane rectangle [a0,a1,y0,y1] and plane offset d of a group of plate solids whose normal is `axis`. */
function planeRect(solids: Solid[], axis: "x" | "z") {
  const b = boundsOf(solids), h = axis === "z" ? 0 : 2;
  return { a0: b.min[h], a1: b.max[h], y0: b.min[1], y1: b.max[1], d: (b.min[axis === "z" ? 2 : 0] + b.max[axis === "z" ? 2 : 0]) / 2 };
}
function openingRect(el: Elem, axis: "x" | "z") { return planeRect(el.solids.filter((s) => s.part !== "sill" && s.part !== "handle" && s.part !== "threshold"), axis); }

/** Wall or partition: solid layers and pieces → one mid-plane per piece → merged with the openings into one gross surface. */
function computePlate(ctx: Ctx, el: Elem): UnitResult {
  const warnings: string[] = [], axis = el.axis as "x" | "z";
  const groups = new Map<string, Solid[]>(); for (const s of el.solids) groups.set(s.g, [...(groups.get(s.g) ?? []), s]);
  const rects = [...groups.values()].map((g) => planeRect(g, axis));
  const hosted = ctx.model.openings.filter((o) => o.host === el.id).map((o) => ({ o, r: openingRect(ctx.byId.get(o.id)!, axis) }));
  const all = [...rects, ...hosted.map((h) => h.r)];
  const a0 = Math.min(...all.map((r) => r.a0)), a1 = Math.max(...all.map((r) => r.a1)), y0 = Math.min(...all.map((r) => r.y0)), y1 = Math.max(...all.map((r) => r.y1));
  const covered = all.reduce((n, r) => n + (r.a1 - r.a0) * (r.y1 - r.y0), 0), whole = (a1 - a0) * (y1 - y0);
  if (Math.abs(covered - whole) > 1e-4) warnings.push(`${el.id}: pieces and openings do not tile the face (covered ${covered.toFixed(3)} of ${whole.toFixed(3)} m²)`);
  const d = rects[0].d, isWall = el.cat === "wall";
  const wall = ctx.model.walls.find((w) => w.id === el.id), f = wall ? wallFrame(wall) : partFrame(ctx.model.parts.find((p) => p.id === el.id)!);
  const s = mkSurf({ id: el.id, elem: el.id, cat: el.cat, kind: isWall ? "External wall (gross)" : "Internal partition (gross)", level: el.level, boundary: isWall ? "external" : "internal", source: el.src, children: hosted.map((h) => h.o.id) }, rectQuad(axis, d, a0, a1, y0, y1), f.normal);
  return { surfaces: [s], lines: [], work: work(el, 1, rects.length + hosted.length), warnings };
}

function computeOpening(ctx: Ctx, el: Elem, o: OpeningP): UnitResult {
  const wall = ctx.model.walls.find((w) => w.id === o.host), host = ctx.byId.get(o.host)!, axis = host.axis as "x" | "z";
  const f = wall ? wallFrame(wall) : partFrame(ctx.model.parts.find((p) => p.id === o.host)!), r = openingRect(el, axis);
  const s = mkSurf({ id: el.id, elem: el.id, cat: el.cat, kind: o.kind === "window" ? "Window (opening incl. frame)" : "Door (opening incl. frame)", level: el.level, boundary: wall ? "external" : "internal", source: el.src, parent: o.host }, rectQuad(axis, r.d, r.a0, r.a1, r.y0, r.y1), f.normal);
  return { surfaces: [s], lines: [], work: work(el, 1), warnings: [] };
}

function computeFloor(el: Elem): UnitResult {
  const b = boundsOf(el.solids), y = (b.min[1] + b.max[1]) / 2;
  const s = mkSurf({ id: el.id, elem: el.id, cat: "floor", kind: "Floor (mid-plane of slab assembly)", level: el.level, boundary: el.level === 0 ? "ground" : "internal", source: el.src }, rectQuad("y", y, b.min[0], b.max[0], b.min[2], b.max[2]), [0, -1, 0]);
  return { surfaces: [s], lines: [], work: work(el, 1, el.solids.length), warnings: [] };
}

function computeRoof(el: Elem): UnitResult {
  const body = el.solids.filter((s) => s.part !== "parapet"), b = boundsOf(body), y = (b.min[1] + b.max[1]) / 2;
  const s = mkSurf({ id: el.id, elem: el.id, cat: "roof", kind: "Roof (mid-plane of build-up)", level: 3, boundary: "roof", source: el.src }, rectQuad("y", y, b.min[0], b.max[0], b.min[2], b.max[2]), [0, 1, 0]);
  const lines: Line[] = el.solids.filter((x) => x.part === "parapet").map((p, i) => {
    const bb = solidBounds(p), top = bb.max[1], alongX = bb.max[0] - bb.min[0] > bb.max[2] - bb.min[2], a: Vec3 = alongX ? [bb.min[0], top, p.c[2]] : [p.c[0], top, bb.min[2]], c: Vec3 = alongX ? [bb.max[0], top, p.c[2]] : [p.c[0], top, bb.max[2]];
    return { id: `${el.id}-PAR${i + 1}`, elem: el.id, kind: "Parapet top edge (line)", a: rv(a), b: rv(c), length: r3(len(sub(c, a))) };
  });
  return { surfaces: [s], lines, work: work(el, 1, el.solids.length - lines.length, lines.length), warnings: [] };
}

function computeShade(ctx: Ctx, el: Elem): UnitResult {
  const p = ctx.model.shades.find((x) => x.id === el.id)!;
  if (p.sk === "overhang") {
    const [sx, , sz] = p.size, co = Math.cos(p.rx), si = Math.sin(p.rx);
    const v: Vec3[] = [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]].map(([x, z]) => [p.c[0] + x, p.c[1] - z * si, p.c[2] + z * co] as Vec3);
    return { surfaces: [mkSurf({ id: el.id, elem: el.id, cat: "shading", kind: "Overhang (mid-plane)", level: el.level, boundary: "shading", source: el.src }, v, [0, co, si])], lines: [], work: work(el, 1), warnings: [] };
  }
  if (p.sk === "tree") {
    const cy = p.trunk + p.r * 0.8, l = Math.hypot(p.x, p.z) || 1, n: Vec3 = [-p.x / l, 0, -p.z / l], t: Vec3 = [-n[2], 0, n[0]];
    const v: Vec3[] = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4 + Math.PI / 8; return [p.x + p.r * Math.cos(a) * t[0], cy + p.r * Math.sin(a), p.z + p.r * Math.cos(a) * t[2]] as Vec3; });
    const trunk: Line = { id: `${el.id}-TRUNK`, elem: el.id, kind: "Trunk axis (line)", a: [p.x, 0, p.z], b: [p.x, r3(p.trunk), p.z], length: p.trunk };
    return { surfaces: [mkSurf({ id: el.id, elem: el.id, cat: "shading", kind: "Tree canopy (billboard facing the building)", level: -1, boundary: "shading", source: el.src }, v, n)], lines: [trunk], work: work(el, 1, 0, 1), warnings: [] };
  }
  const b = solidBounds(el.solids[0]);
  const faceAxis: "x" | "z" = p.face === "W" ? "x" : "z", d = p.face === "W" ? b.min[0] : b.max[2], n: Vec3 = p.face === "W" ? [-1, 0, 0] : [0, 0, 1];
  const facade = faceAxis === "x" ? rectQuad("x", d, b.min[2], b.max[2], 0, b.max[1]) : rectQuad("z", d, b.min[0], b.max[0], 0, b.max[1]);
  return {
    surfaces: [
      mkSurf({ id: `${el.id}-F`, elem: el.id, cat: "shading", kind: "Neighbour facade facing the building", level: -1, boundary: "shading", source: el.src }, facade, n),
      mkSurf({ id: `${el.id}-T`, elem: el.id, cat: "shading", kind: "Neighbour roof", level: -1, boundary: "shading", source: el.src }, rectQuad("y", b.max[1], b.min[0], b.max[0], b.min[2], b.max[2]), [0, 1, 0]),
    ],
    lines: [], work: work(el, 2), warnings: [],
  };
}

/* ---------- thermal zones ---------- */
interface EdgeSpec { src: string; kind: "external-wall" | "partition"; edge: "W" | "E" | "N" | "S"; overlap: [number, number]; h: number; thick?: number; off?: number; opens: { id: string; kind: "window" | "door"; u0: number; w: number; sill: number; h: number; az: number | null }[] }
const AZ: Record<string, number> = { S: 180, N: 0, E: 90, W: 270 };

/** The model-only description of what bounds a zone. It is the input of the zone calculation and of the cache key. */
export function zoneSpec(m: Model, z: ZoneP): EdgeSpec[] {
  const out: EdgeSpec[] = [], ov = (a0: number, a1: number, b0: number, b1: number): [number, number] | null => { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); return hi - lo > 1e-6 ? [lo, hi] : null; };
  const edges: { e: "W" | "E" | "N" | "S"; ext: boolean; at: number; lo: number; hi: number; axis: "x" | "z" }[] = [
    { e: "W", ext: z.x0 <= X0 + 1e-6, at: z.x0, lo: z.z0, hi: z.z1, axis: "x" }, { e: "E", ext: z.x1 >= X1 - 1e-6, at: z.x1, lo: z.z0, hi: z.z1, axis: "x" },
    { e: "N", ext: z.z0 <= Z0 + 1e-6, at: z.z0, lo: z.x0, hi: z.x1, axis: "z" }, { e: "S", ext: z.z1 >= Z1 - 1e-6, at: z.z1, lo: z.x0, hi: z.x1, axis: "z" },
  ];
  for (const ed of edges) {
    if (ed.ext) {
      const w = m.walls.find((x) => x.level === z.level && x.side === ed.e)!, f = wallFrame(w), a = f.along(0), b = f.along(f.len), o = ov(Math.min(a, b), Math.max(a, b), ed.lo, ed.hi);
      if (o) out.push({ src: w.id, kind: "external-wall", edge: ed.e, overlap: o, h: FH, thick: w.thick, opens: m.openings.filter((x) => x.host === w.id).filter((x) => { const c = f.along(x.u0 + x.w / 2); return c > o[0] && c < o[1]; }).map((x) => ({ id: x.id, kind: x.kind, u0: x.u0, w: x.w, sill: x.sill, h: x.h, az: AZ[w.side] })) });
    }
    for (const p of m.parts.filter((x) => x.level === z.level && x.axis === ed.axis && Math.abs(x.off - ed.at) < 1e-6)) {
      const o = ov(p.a0, p.a1, ed.lo, ed.hi), f = partFrame(p);
      if (o) out.push({ src: p.id, kind: "partition", edge: ed.e, overlap: o, h: PART_H, off: p.off, opens: m.openings.filter((x) => x.host === p.id).filter((x) => { const c = f.along(x.u0 + x.w / 2); return c > o[0] && c < o[1]; }).map((x) => ({ id: x.id, kind: x.kind, u0: x.u0, w: x.w, sill: x.sill, h: x.h, az: null })) });
    }
  }
  return out;
}

function computeZone(m: Model, z: ZoneP): UnitResult {
  const spec = zoneSpec(m, z), area = (z.x1 - z.x0) * (z.z1 - z.z0), bounds: Bound[] = [];
  const cover: Record<"W" | "E" | "N" | "S", number> = { W: 0, E: 0, N: 0, S: 0 };
  const byAz = { N: 0, E: 0, S: 0, W: 0 }; let win = 0, door = 0, ext = 0;
  for (const e of spec) {
    const l = e.overlap[1] - e.overlap[0], gross = l * e.h, openings = e.opens.map((o) => ({ id: o.id, kind: o.kind, area: r3(o.w * o.h), azimuth: o.az }));
    cover[e.edge] += l;
    const oa = openings.reduce((n, o) => n + o.area, 0);
    bounds.push({ src: e.src, kind: e.kind, edge: e.edge, overlap: [r3(e.overlap[0]), r3(e.overlap[1])], gross: r3(gross), openings, net: r3(gross - oa) });
    if (e.kind === "external-wall") { ext += gross; for (const o of openings) { if (o.kind === "window") { win += o.area; if (o.azimuth !== null) byAz[({ 0: "N", 90: "E", 180: "S", 270: "W" } as Record<number, "N" | "E" | "S" | "W">)[o.azimuth]] += o.area; } else door += o.area; } }
  }
  const lens = { W: z.z1 - z.z0, E: z.z1 - z.z0, N: z.x1 - z.x0, S: z.x1 - z.x0 };
  const closed = (["W", "E", "N", "S"] as const).every((k) => Math.abs(cover[k] - lens[k]) < 0.02);
  const res: ZoneResult = {
    id: z.id, name: z.name, use: z.use, level: z.level, area: r3(area), height: PART_H, volume: r3(area * PART_H), floor: `F-L${z.level + 1}`, ceiling: z.level < 2 ? `F-L${z.level + 2}` : m.roof.id,
    bounds, windowArea: r3(win), doorArea: r3(door), externalWallGross: r3(ext), windowByAzimuth: { N: r3(byAz.N), E: r3(byAz.E), S: r3(byAz.S), W: r3(byAz.W) }, closed, coverage: { W: r3(cover.W), E: r3(cover.E), N: r3(cover.N), S: r3(cover.S) },
  };
  return { surfaces: [], lines: [], zone: res, work: { solids: 0, faces: bounds.length + 2, tris: 0, removed: 0, merged: 0 }, warnings: closed ? [] : [`${z.id}: footprint is not fully enclosed by wall and partition surfaces`] };
}

/* ---------- units, cache, run ---------- */
export interface Unit { id: string; kind: "elem" | "zone"; cat: Cat | "zone"; own: string; dep: string; compute: () => UnitResult }
const J = JSON.stringify;

/** One cacheable unit per model element, plus one per thermal zone. `own` is the element's own parameters; `dep` is what it reads from other elements. */
export function planUnits(m: Model, elems: Elem[]): Unit[] {
  const ctx = makeCtx(m, elems), units: Unit[] = [];
  const opens = (host: string) => m.openings.filter((o) => o.host === host).map((o) => [o.u0, o.w, o.sill, o.h]);
  for (const el of elems) {
    if (el.cat === "wall") { const w = m.walls.find((x) => x.id === el.id)!; units.push({ id: el.id, kind: "elem", cat: "wall", own: J(w), dep: J(opens(el.id)), compute: () => computePlate(ctx, el) }); }
    else if (el.cat === "partition") { const p = m.parts.find((x) => x.id === el.id)!; units.push({ id: el.id, kind: "elem", cat: "partition", own: J(p), dep: J(opens(el.id)), compute: () => computePlate(ctx, el) }); }
    else if (el.cat === "window" || el.cat === "door") {
      const o = m.openings.find((x) => x.id === el.id)!, host = m.walls.find((x) => x.id === o.host) ?? m.parts.find((x) => x.id === o.host);
      units.push({ id: el.id, kind: "elem", cat: el.cat, own: J(o), dep: J(host), compute: () => computeOpening(ctx, el, o) });
    }
    else if (el.cat === "floor") units.push({ id: el.id, kind: "elem", cat: "floor", own: J(m.floors.find((x) => x.id === el.id)), dep: "", compute: () => computeFloor(el) });
    else if (el.cat === "roof") units.push({ id: el.id, kind: "elem", cat: "roof", own: J(m.roof), dep: "", compute: () => computeRoof(el) });
    else units.push({ id: el.id, kind: "elem", cat: "shading", own: J(m.shades.find((x) => x.id === el.id)), dep: "", compute: () => computeShade(ctx, el) });
  }
  for (const z of m.zones) units.push({ id: z.id, kind: "zone", cat: "zone", own: J(z), dep: J([zoneSpec(m, z), z.level === 2 ? m.roof.insul : 0]), compute: () => computeZone(m, z) });
  return units;
}

export interface CacheEntry { own: string; dep: string; res: UnitResult }
export type Cache = Map<string, CacheEntry>;
export interface Recompute { id: string; cat: Cat | "zone"; reason: "new" | "modified" | "dependent"; ms: number; work: Work }
export interface RunStats { mode: "full" | "incremental"; total: number; hits: number; recomputed: Recompute[]; dropped: string[]; ms: number; faces: number }

export function runUnits(units: Unit[], cache: Cache, mode: "full" | "incremental", prune = true): RunStats {
  const t0 = performance.now(), recomputed: Recompute[] = [], ids = new Set(units.map((u) => u.id));
  let hits = 0, faces = 0;
  for (const u of units) {
    const c = cache.get(u.id);
    if (c && c.own === u.own && c.dep === u.dep) { hits++; continue; }
    const a = performance.now(), res = u.compute(), ms = performance.now() - a;
    cache.set(u.id, { own: u.own, dep: u.dep, res }); faces += res.work.faces;
    recomputed.push({ id: u.id, cat: u.cat, reason: !c ? "new" : c.own !== u.own ? "modified" : "dependent", ms, work: res.work });
  }
  const dropped = prune ? [...cache.keys()].filter((k) => !ids.has(k)) : []; dropped.forEach((k) => cache.delete(k));
  return { mode, total: units.length, hits, recomputed, dropped, ms: performance.now() - t0, faces };
}

/** Which units would be recomputed, without computing them (shown as "outdated" before an incremental run). */
export function outdated(units: Unit[], cache: Cache): { id: string; reason: "new" | "modified" | "dependent"; cat: Cat | "zone" }[] {
  return units.flatMap((u) => { const c = cache.get(u.id); return c && c.own === u.own && c.dep === u.dep ? [] : [{ id: u.id, cat: u.cat, reason: (!c ? "new" : c.own !== u.own ? "modified" : "dependent") as "new" | "modified" | "dependent" }]; });
}

export interface Aggregate { surfaces: Surf[]; lines: Line[]; zones: ZoneResult[]; warnings: string[]; work: Work }
export function aggregate(units: Unit[], cache: Cache): Aggregate {
  const surfaces: Surf[] = [], lines: Line[] = [], zones: ZoneResult[] = [], warnings: string[] = [], w: Work = { solids: 0, faces: 0, tris: 0, removed: 0, merged: 0 };
  for (const u of units) {
    const r = cache.get(u.id)?.res; if (!r) continue;
    surfaces.push(...r.surfaces.map((s) => ({ ...s, zones: [] as string[] }))); lines.push(...r.lines); if (r.zone) zones.push(r.zone); warnings.push(...r.warnings);
    w.solids += r.work.solids; w.faces += r.work.faces; w.tris += r.work.tris; w.removed += r.work.removed; w.merged += r.work.merged;
  }
  const by = new Map(surfaces.map((s) => [s.id, s])), add = (id: string, z: string) => { const s = by.get(id); if (s && !s.zones.includes(z)) s.zones.push(z); };
  for (const z of zones) { for (const b of z.bounds) { add(b.src, z.id); b.openings.forEach((o) => add(o.id, z.id)); } add(z.floor, z.id); add(z.ceiling, z.id); }
  return { surfaces, lines, zones, warnings, work: w };
}

/* ---------- validation ---------- */
export interface Check { name: string; ok: boolean; detail: string }
export function validate(m: Model, agg: Aggregate): Check[] {
  const ids = new Set(agg.surfaces.map((s) => s.id)), ok = (n: string, c: boolean, d: string): Check => ({ name: n, ok: c, detail: d });
  const bad = agg.surfaces.filter((s) => !(s.area > 0) || s.thickness !== 0 || Math.abs(Math.hypot(...s.normal) - 1) > 0.002);
  const orphans = agg.surfaces.filter((s) => s.parent && !ids.has(s.parent));
  const overfull = agg.surfaces.filter((s) => s.children.length && s.children.reduce((n, c) => n + (agg.surfaces.find((x) => x.id === c)?.area ?? 0), 0) >= s.area);
  const open = agg.zones.filter((z) => !z.closed);
  const noFloor = agg.zones.filter((z) => !ids.has(z.floor) || !ids.has(z.ceiling));
  return [
    ok("Zero-thickness surfaces with positive area and unit normals", bad.length === 0, bad.length ? `${bad.length} invalid: ${bad.slice(0, 3).map((s) => s.id).join(", ")}` : `${agg.surfaces.length} surfaces checked`),
    ok("Every window and door has a host surface", orphans.length === 0, orphans.length ? `${orphans.length} without host` : "all hosted"),
    ok("Openings are smaller than the wall that hosts them", overfull.length === 0, overfull.length ? `${overfull.length} walls fully consumed` : "net areas are positive"),
    ok("Wall pieces and openings tile each wall face (coplanar merge is exact)", !agg.warnings.some((w) => w.includes("tile")), agg.warnings.filter((w) => w.includes("tile")).join("; ") || "no gaps or overlaps"),
    ok("Every thermal zone is enclosed by wall and partition surfaces", open.length === 0, open.length ? `${open.length} open: ${open.slice(0, 3).map((z) => z.id).join(", ")}` : `${agg.zones.length} zones enclosed`),
    ok("Every zone has a floor and a ceiling surface", noFloor.length === 0, noFloor.length ? `${noFloor.length} missing` : "floor and ceiling found"),
    ok("Model has the expected zone count", agg.zones.length === m.zones.length, `${agg.zones.length} of ${m.zones.length}`),
  ];
}

/* ---------- metrics ---------- */
export interface Metrics { origSolids: number; origTris: number; origFaces: number; origElements: number; simpSurfaces: number; simpLines: number; simpTris: number; simpVerts: number; reductionPct: number; removedSolids: number; merged: number }
export function metrics(elems: Elem[], agg: Aggregate): Metrics {
  const simpTris = agg.surfaces.reduce((n, s) => n + s.verts.length - 2, 0), origTris = countTris(elems);
  return { origSolids: countSolids(elems), origTris, origFaces: countSolids(elems) * 6, origElements: elems.length, simpSurfaces: agg.surfaces.length, simpLines: agg.lines.length, simpTris, simpVerts: agg.surfaces.reduce((n, s) => n + s.verts.length, 0) + agg.lines.length * 2, reductionPct: origTris ? (1 - simpTris / origTris) * 100 : 0, removedSolids: agg.work.removed, merged: agg.work.merged };
}

/* ---------- export ---------- */
export interface ExportSel { surfaces: boolean; zones: boolean; classification: boolean; shading: boolean; ids: boolean; metadata: boolean }
export function buildExport(m: Model, agg: Aggregate, mt: Metrics, sel: ExportSel) {
  const shading = (s: Surf) => s.cat === "shading";
  const surf = (s: Surf) => ({ ...(sel.ids ? { id: s.id, elementId: s.elem, parent: s.parent ?? null, children: s.children } : {}), ...(sel.classification ? { class: s.cat, kind: s.kind, boundary: s.boundary, source: s.source } : {}), vertices: s.verts, normal: s.normal, area_m2: s.area, azimuth_deg: s.azimuth, tilt_deg: s.tilt, thickness_m: 0, zones: s.zones });
  return {
    schema: "neoforge.analytical-geometry/0.1 (draft, demo only)",
    note: "Generated in the browser from a SAMPLE building. Not exported from Revit or SketchUp. The schema is a proposal to be agreed with the analysis-engine owner.",
    units: "m", coordinateSystem: "X east, Y up, Z south (north = -Z)", model: m.name,
    ...(sel.metadata ? { metadata: { generatedAt: new Date().toISOString(), originalSolids: mt.origSolids, originalTriangles: mt.origTris, analyticalSurfaces: mt.simpSurfaces, analyticalLines: mt.simpLines, triangleReductionPct: +mt.reductionPct.toFixed(2) } } : {}),
    ...(sel.surfaces ? { surfaces: agg.surfaces.filter((s) => !shading(s)).map(surf), lines: agg.lines.filter((l) => !l.id.includes("TRUNK")).map((l) => ({ ...(sel.ids ? { id: l.id } : {}), kind: l.kind, a: l.a, b: l.b, length_m: l.length })) } : {}),
    ...(sel.zones ? { thermalZones: agg.zones.map((z) => ({ ...(sel.ids ? { id: z.id } : {}), name: z.name, use: z.use, level: z.level + 1, area_m2: z.area, height_m: z.height, volume_m3: z.volume, floorSurface: z.floor, ceilingSurface: z.ceiling, enclosed: z.closed, windowArea_m2: z.windowArea, windowAreaByAzimuth_m2: z.windowByAzimuth, bounds: z.bounds.map((b) => ({ surface: b.src, type: b.kind, edge: b.edge, gross_m2: b.gross, net_m2: b.net, openings: b.openings })) })) } : {}),
    ...(sel.shading ? { shadingGeometry: { surfaces: agg.surfaces.filter(shading).map(surf), lines: agg.lines.filter((l) => l.id.includes("TRUNK")).map((l) => ({ ...(sel.ids ? { id: l.id } : {}), kind: l.kind, a: l.a, b: l.b, length_m: l.length })) } } : {}),
  };
}

