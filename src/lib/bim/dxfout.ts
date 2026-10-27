/** 2D DXF export of the generated building and MEP layout (millimetres, R12 ASCII). Walls are exported as closed outlines of their solid segments; openings appear as gaps with symbols. */
import { writeDxf, type DxfEntity } from "./dxf";
import { dist, norm, perp, sub } from "./geom";
import type { Building, MepElement } from "./model";

const mm = (v: number) => Math.round(v * 1000 * 1000) / 1000;
export function exportDxf(b: Building, mep: MepElement[], level = "L0"): string {
  const ents: DxfEntity[] = []; const layers = new Set<string>(["A-WALL", "A-DOOR", "A-GLAZ", "A-ROOM", "A-ROOM-NAME", "A-COLS", "A-STAIR"]);
  const pl = (layer: string, pts: { x: number; y: number }[], closed = true) => ents.push({ t: "POLY", layer, closed, pts: pts.map((p) => ({ x: mm(p.x), y: mm(p.y) })) });
  for (const w of b.walls.filter((x) => x.level === level)) {
    const L = dist(w.a, w.b); const u = norm(sub(w.b, w.a)); const n = perp(u); const h = w.thickness / 2; const at = (s: number, off: number) => ({ x: w.a.x + u.x * s + n.x * off, y: w.a.y + u.y * s + n.y * off });
    const cuts = [...w.openings].sort((p, q) => p.s - q.s); let cur = 0; const solid = (s0: number, s1: number) => { if (s1 - s0 > 1e-4) pl("A-WALL", [at(s0, -h), at(s1, -h), at(s1, h), at(s0, h)]); };
    for (const o of cuts) { solid(cur, o.s - o.width / 2); cur = o.s + o.width / 2; const s0 = o.s - o.width / 2, s1 = o.s + o.width / 2;
      if (o.kind === "window") pl("A-GLAZ", [at(s0, -h), at(s1, -h), at(s1, h), at(s0, h)]); else if (o.kind === "door") { ents.push({ t: "LINE", layer: "A-DOOR", a: { x: mm(at(s0, 0).x), y: mm(at(s0, 0).y) }, b: { x: mm(at(s0, 0).x + n.x * o.width), y: mm(at(s0, 0).y + n.y * o.width) } }); const c = at(s0, 0); const ang = Math.atan2(u.y, u.x); ents.push({ t: "ARC", layer: "A-DOOR", c: { x: mm(c.x), y: mm(c.y) }, r: mm(o.width), a0: ang, a1: ang + Math.PI / 2 }); } }
    solid(cur, L);
  }
  for (const r of b.rooms.filter((x) => x.level === level)) { pl("A-ROOM", r.polygon); ents.push({ t: "TEXT", layer: "A-ROOM-NAME", p: { x: mm(r.centroid.x), y: mm(r.centroid.y) }, text: `${r.name} ${r.area.toFixed(2)} m2`, height: 200, rotation: 0 }); }
  for (const c of b.columns.filter((x) => x.level === level)) pl("A-COLS", [{ x: c.c.x - c.w / 2, y: c.c.y - c.d / 2 }, { x: c.c.x + c.w / 2, y: c.c.y - c.d / 2 }, { x: c.c.x + c.w / 2, y: c.c.y + c.d / 2 }, { x: c.c.x - c.w / 2, y: c.c.y + c.d / 2 }]);
  for (const s of b.stairs.filter((x) => x.level === level)) pl("A-STAIR", s.polygon);
  for (const e of mep) { const layer = `M-${e.system.toUpperCase()}`; layers.add(layer); if (e.path.length > 1) pl(layer, e.path, false); else if (e.size3) { const c = e.path[0]; pl(layer, [{ x: c.x - e.size3.x / 2, y: c.y - e.size3.y / 2 }, { x: c.x + e.size3.x / 2, y: c.y - e.size3.y / 2 }, { x: c.x + e.size3.x / 2, y: c.y + e.size3.y / 2 }, { x: c.x - e.size3.x / 2, y: c.y + e.size3.y / 2 }]); } }
  return writeDxf({ layers: [...layers].map((name, i) => ({ name, color: 1 + (i % 7) })), entities: ents, insunits: 4 });
}
