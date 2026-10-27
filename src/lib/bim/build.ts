/** Assembles the Building (levels, walls, slabs, roof) from an interpreted plan and generates the render meshes. */
import { interpretPlan, type PlanResult } from "./plan";
import type { DxfDoc } from "./dxf";
import { closestOnSeg, dist, lineIntersect, mul, norm, perp, polyArea, sub, v3, type Obb, type V2, type V3 } from "./geom";
import { MeshBuilder } from "./mesh";
import type { Building, Column, Level, MeshEl, Opening, Settings, Slab, Stair, Wall } from "./model";

export interface WallPiece { box: Obb; kind: "solid" | "below" | "above"; openingId?: string }
const U3 = (a: V2, b: V2) => { const d = norm(sub(b, a)); return { x: d.x, y: d.y, z: 0 } as V3; };

/** Solid pieces of a wall once its openings are cut out (oriented boxes; also used by the clash engine). */
export function wallPieces(w: Wall, base: number): WallPiece[] {
  const L = dist(w.a, w.b); const u = norm(sub(w.b, w.a)); const nrm = perp(u); const ax: [V3, V3, V3] = [{ x: u.x, y: u.y, z: 0 }, { x: nrm.x, y: nrm.y, z: 0 }, { x: 0, y: 0, z: 1 }];
  const piece = (s0: number, s1: number, z0: number, z1: number, kind: WallPiece["kind"], openingId?: string): WallPiece | null => { if (s1 - s0 < 1e-4 || z1 - z0 < 1e-4) return null; const sc = (s0 + s1) / 2; return { box: { c: v3(w.a.x + u.x * sc, w.a.y + u.y * sc, base + (z0 + z1) / 2), ax, h: [(s1 - s0) / 2, w.thickness / 2, (z1 - z0) / 2] }, kind, openingId }; };
  const out: WallPiece[] = []; const ops = [...w.openings].sort((a, b) => a.s - b.s); let cur = 0;
  for (const o of ops) { const s0 = Math.max(cur, o.s - o.width / 2), s1 = Math.min(L, o.s + o.width / 2); const solid = piece(cur, s0, 0, w.height, "solid"); if (solid) out.push(solid); const lo = piece(s0, s1, 0, Math.min(o.sill, w.height), "below", o.id); if (o.sill > 1e-6 && lo) out.push(lo); const top = o.sill + o.height; const hi = piece(s0, s1, Math.min(top, w.height), w.height, "above", o.id); if (top < w.height - 1e-6 && hi) out.push(hi); cur = Math.max(cur, s1); }
  const tail = piece(cur, L, 0, w.height, "solid"); if (tail) out.push(tail); return out;
}

function outsetLoop(loop: V2[], walls: Wall[]): V2[] | null {
  const pts = polyArea(loop) < 0 ? loop : [...loop].reverse(); const n = pts.length; const lines = pts.map((p, i) => { const q = pts[(i + 1) % n]; const u = norm(sub(q, p)); const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; let t = 0.2, best = Infinity; for (const w of walls) { const d = closestOnSeg(m, w.a, w.b).d; if (d < best) { best = d; t = w.thickness; } } const nn = perp(u); const h = t / 2; return { p: { x: p.x + nn.x * h, y: p.y + nn.y * h }, q: { x: q.x + nn.x * h, y: q.y + nn.y * h } }; });
  const out: V2[] = []; for (let i = 0; i < n; i++) { const a = lines[(i - 1 + n) % n], b = lines[i]; const li = lineIntersect(a.p, a.q, b.p, b.q); if (!li) { out.push(b.p); continue; } out.push(li.pt); }
  return Math.abs(polyArea(out)) > Math.abs(polyArea(pts)) ? out : null;
}
/** Remove vertices that sit on a straight line (graph split points). */
function simplify(p: V2[]): V2[] { const out: V2[] = []; const n = p.length; for (let i = 0; i < n; i++) { const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n]; const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x); if (Math.abs(cr) > 1e-6) out.push(b); } return out.length >= 3 ? out : p; }

export interface BuildResult { building: Building; meshes: MeshEl[]; plan: PlanResult }
export function buildFromDxf(doc: DxfDoc, st: Settings): BuildResult {
  const plan = interpretPlan(doc, st, "L0"); return assemble(plan, st);
}
const COLORS: Record<string, string> = {};
void COLORS;

export function assemble(plan: PlanResult, st: Settings): BuildResult {
  const warnings = [...plan.warnings]; const assumptions = [...plan.assumptions]; const storeyH = st.wallHeight + st.floorThickness;
  const levels: Level[] = Array.from({ length: Math.max(1, Math.min(st.storeys, 20)) }, (_, i) => ({ id: `L${i}`, name: i === 0 ? "Ground floor" : `Level ${i}`, elevation: i * storeyH, height: st.wallHeight }));
  if (levels.length > 1) assumptions.push(`${levels.length} storeys: the uploaded plan is repeated on every level (the file describes one level only). Storey height ${storeyH.toFixed(2)} m = wall height + ${st.floorThickness} m slab.`);
  const walls: Wall[] = [], rooms = [] as Building["rooms"], columns: Column[] = [], stairs: Stair[] = [], slabs: Slab[] = []; const meshes: MeshEl[] = [];
  const footLoops = plan.outerLoops.map((l) => ({ l, a: Math.abs(polyArea(l)) })).sort((a, b) => b.a - a.a); const loop = footLoops[0]?.l; let footprint = loop ? outsetLoop(loop, plan.walls) : null; if (footprint) footprint = simplify(footprint);
  if (!footprint) warnings.push("No closed outer boundary was found, so floor slabs and the roof could not be generated.");
  if (footLoops.length > 1) warnings.push(`${footLoops.length} separate outer boundaries were found; slabs use the largest one.`);
  const sfx = (id: string, lv: Level) => (lv.id === "L0" ? id : `${id}-${lv.id}`);
  for (const lv of levels) {
    const z0 = lv.elevation;
    for (const w of plan.walls) { const nw: Wall = { ...w, id: sfx(w.id, lv), level: lv.id, openings: w.openings.map((o) => ({ ...o, id: sfx(o.id, lv) })) }; walls.push(nw); }
    for (const r of plan.rooms) rooms.push({ ...r, id: sfx(r.id, lv), level: lv.id, wallIds: r.wallIds.map((x) => sfx(x, lv)) });
    for (const c of plan.columns) columns.push({ ...c, id: sfx(c.id, lv), level: lv.id });
    for (const s of plan.stairs) if (lv.id !== levels[levels.length - 1].id || levels.length === 1) stairs.push({ ...s, id: sfx(s.id, lv), level: lv.id });
    if (footprint) { slabs.push({ id: `SL-${lv.id}`, level: lv.id, kind: "floor", polygon: footprint, z: z0 - st.floorThickness, thickness: st.floorThickness, source: { origin: "derived", note: "outer wall boundary" }, assumed: ["thickness (setting)"] }); }
  }
  let roof: Building["roof"] = { type: st.roofType, note: "" };
  const top = levels[levels.length - 1]; const topZ = top.elevation + st.wallHeight;
  if (footprint && st.roofType !== "none") {
    if (st.roofType === "flat") { slabs.push({ id: "RF-01", level: top.id, kind: "roof", polygon: footprint, z: topZ, thickness: st.floorThickness, source: { origin: "assumed", note: "flat roof over the outer boundary" }, assumed: ["roof type (setting)", "thickness (setting)"] }); roof = { type: "flat", note: "Flat roof slab generated over the outer boundary; the plan carries no roof information." }; }
    else { const isRect = footprint.length === 4; if (!isRect) { warnings.push("A gable roof needs a rectangular footprint; this footprint is not rectangular, so a flat roof was generated instead."); slabs.push({ id: "RF-01", level: top.id, kind: "roof", polygon: footprint, z: topZ, thickness: st.floorThickness, source: { origin: "assumed" }, assumed: ["roof type (fallback)"] }); roof = { type: "flat", note: "Gable roof not possible on this footprint; flat roof generated." }; } else roof = { type: "gable", pitchDeg: st.roofPitchDeg, note: `Gable roof (${st.roofPitchDeg}°) generated over the bounding rectangle; the plan carries no roof information.` }; }
    assumptions.push(roof.note);
  }
  const building: Building = { units: { name: plan.units.name, toM: plan.units.toM, declared: plan.units.declared, ambiguous: plan.units.ambiguous, note: plan.units.note }, levels, walls, rooms, columns, stairs, slabs, roof, extents: plan.extents, warnings, assumptions, stats: { walls: walls.length, doors: walls.reduce((s, w) => s + w.openings.filter((o) => o.kind === "door").length, 0), windows: walls.reduce((s, w) => s + w.openings.filter((o) => o.kind === "window").length, 0), rooms: rooms.length, columns: columns.length, stairs: stairs.length }, scaleCheck: plan.scaleCheck };
  meshes.push(...buildMeshes(building, st, footprint));
  return { building, meshes, plan };
}

export function buildMeshes(b: Building, st: Settings, footprint: V2[] | null): MeshEl[] {
  const out: MeshEl[] = []; const lvl = (id: string) => b.levels.find((l) => l.id === id)!;
  for (const w of b.walls) { const base = lvl(w.level).elevation; const mb = new MeshBuilder(); for (const p of wallPieces(w, base)) mb.obb(p.box); out.push({ id: w.id, cat: w.kind === "exterior" ? "wall-exterior" : "wall-interior", level: w.level, name: `${w.kind} wall`, ...mb.done() });
    const L = dist(w.a, w.b); const u = norm(sub(w.b, w.a)); const nrm = perp(u); const ax: [V3, V3, V3] = [{ x: u.x, y: u.y, z: 0 }, { x: nrm.x, y: nrm.y, z: 0 }, { x: 0, y: 0, z: 1 }];
    for (const o of w.openings) { const c = v3(w.a.x + u.x * o.s, w.a.y + u.y * o.s, 0); const m2 = new MeshBuilder();
      if (o.kind === "window") { m2.obb({ c: { ...c, z: base + o.sill + o.height / 2 }, ax, h: [o.width / 2 - 0.03, 0.01, o.height / 2 - 0.03] }); const fr = 0.04; const mk = (dx: number, dz: number, hx: number, hz: number) => m2.obb({ c: { x: c.x + u.x * dx, y: c.y + u.y * dx, z: base + o.sill + o.height / 2 + dz }, ax, h: [hx, w.thickness / 2 - 0.01, hz] }); mk(0, o.height / 2 - fr / 2, o.width / 2, fr / 2); mk(0, -o.height / 2 + fr / 2, o.width / 2, fr / 2); mk(-o.width / 2 + fr / 2, 0, fr / 2, o.height / 2); mk(o.width / 2 - fr / 2, 0, fr / 2, o.height / 2); }
      else if (o.kind === "door") { m2.obb({ c: { ...c, z: base + (o.height - 0.02) / 2 }, ax, h: [o.width / 2 - 0.03, 0.02, (o.height - 0.02) / 2] }); }
      else continue; out.push({ id: o.id, cat: o.kind, level: w.level, name: o.kind, ...m2.done() }); } }
  for (const s of b.slabs) { const mb = new MeshBuilder(); mb.prism(s.polygon, s.z, s.z + s.thickness); out.push({ id: s.id, cat: s.kind === "roof" ? "roof" : "slab-floor", level: s.level, name: `${s.kind} slab`, ...mb.done() }); }
  if (b.roof.type === "gable" && footprint && footprint.length === 4) { const xs = footprint.map((p) => p.x), ys = footprint.map((p) => p.y); void xs; void ys;
    const e0 = dist(footprint[0], footprint[1]), e1 = dist(footprint[1], footprint[2]); const long = e0 >= e1; const A = long ? footprint[0] : footprint[1], B = long ? footprint[1] : footprint[2], C = long ? footprint[2] : footprint[3], D = long ? footprint[3] : footprint[0];
    const span = long ? e1 : e0; const rise = (span / 2) * Math.tan(((b.roof.pitchDeg ?? 25) * Math.PI) / 180); const topLv = b.levels[b.levels.length - 1]; const z = topLv.elevation + st.wallHeight; const mid = (p: V2, q: V2): V2 => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }); const r0 = mid(A, D), r1 = mid(B, C); const mb = new MeshBuilder();
    const P = (p: V2, h: number): V3 => ({ x: p.x, y: p.y, z: z + h }); mb.quad(P(A, 0), P(B, 0), P(r1, rise), P(r0, rise)); mb.quad(P(C, 0), P(D, 0), P(r0, rise), P(r1, rise)); mb.tri(P(B, 0), P(C, 0), P(r1, rise)); mb.tri(P(D, 0), P(A, 0), P(r0, rise)); mb.quad(P(A, 0), P(D, 0), P(C, 0), P(B, 0));
    out.push({ id: "RF-01", cat: "roof", level: topLv.id, name: "gable roof", ...mb.done() }); b.roof.ridge = { a: v3(r0.x, r0.y, z + rise), b: v3(r1.x, r1.y, z + rise) }; }
  for (const c of b.columns) { const base = lvl(c.level).elevation; const mb = new MeshBuilder(); if (c.round) mb.cylinder(v3(c.c.x, c.c.y, base), v3(c.c.x, c.c.y, base + c.height), c.w / 2, 16); else mb.obb({ c: v3(c.c.x, c.c.y, base + c.height / 2), ax: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }], h: [c.w / 2, c.d / 2, c.height / 2] }); out.push({ id: c.id, cat: "column", level: c.level, name: "column", ...mb.done() }); }
  for (const s of b.stairs) { const base = lvl(s.level).elevation; const mb = new MeshBuilder(); const xs = s.polygon.map((p) => p.x), ys = s.polygon.map((p) => p.y); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); const alongY = Math.abs(s.dir.y) > 0.5; const n = s.treads + 1; const run = alongY ? y1 - y0 : x1 - x0;
    for (let i = 0; i < n; i++) { const h = (s.rise * (i + 1)) / n; const a0 = (run * i) / n, a1 = (run * (i + 1)) / n; mb.obb({ c: v3(alongY ? (x0 + x1) / 2 : x0 + (a0 + a1) / 2, alongY ? y0 + (a0 + a1) / 2 : (y0 + y1) / 2, base + h / 2), ax: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }], h: [alongY ? (x1 - x0) / 2 : (a1 - a0) / 2, alongY ? (a1 - a0) / 2 : (y1 - y0) / 2, h / 2] }); }
    out.push({ id: s.id, cat: "stair", level: s.level, name: "stair", ...mb.done() }); }
  for (const r of b.rooms) { const base = lvl(r.level).elevation; const mb = new MeshBuilder(); mb.prism(r.polygon, base + 0.005, base + 0.02); out.push({ id: r.id, cat: "space", level: r.level, name: r.name, ...mb.done() }); }
  void mul; void st; return out;
}
export type { Opening };
