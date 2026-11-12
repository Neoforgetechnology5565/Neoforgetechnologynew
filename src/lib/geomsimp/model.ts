/**
 * Parametric sample building for demo 22: a three-storey commercial building with detailed (layered) geometry.
 * It is generated in the browser. It is NOT a Revit or SketchUp import; it stands in for one so the processing steps can be shown.
 */
import type { Elem, Model, OpeningP, PartP, Side, Solid, Vec3, WallP, ZoneP } from "./types";

export const X0 = -12, X1 = 12, Z0 = -7, Z1 = 7;
export const FH = 3.5;          // floor-to-floor
export const T0 = 0.335;        // base external wall thickness
export const SLAB = 0.3;        // floor slab + build-up below finished floor level
export const PART_H = FH - SLAB; // internal partitions run floor to underside of slab above
export const PART_T = 0.1;
export const elev = (level: number) => level * FH;

/** Local frame of a wall or partition: u along the element, n across it, v up. */
export interface Frame { map: (u: number, n: number) => [number, number]; along: (u: number) => number; nm: number; axis: "x" | "z"; normal: Vec3; len: number; elev: number; h: number }

export function wallFrame(w: WallP): Frame {
  const e = elev(w.level), nm = w.thick / 2;
  switch (w.side) {
    case "S": return { map: (u, n) => [X0 - T0 + u, Z1 + n], along: (u) => X0 - T0 + u, nm, axis: "z", normal: [0, 0, 1], len: 24 + 2 * T0, elev: e, h: FH };
    case "N": return { map: (u, n) => [X1 + T0 - u, Z0 - n], along: (u) => X1 + T0 - u, nm, axis: "z", normal: [0, 0, -1], len: 24 + 2 * T0, elev: e, h: FH };
    case "E": return { map: (u, n) => [X1 + n, Z0 + u], along: (u) => Z0 + u, nm, axis: "x", normal: [1, 0, 0], len: 14, elev: e, h: FH };
    default: return { map: (u, n) => [X0 - n, Z1 - u], along: (u) => Z1 - u, nm, axis: "x", normal: [-1, 0, 0], len: 14, elev: e, h: FH };
  }
}
export function partFrame(p: PartP): Frame {
  const e = elev(p.level);
  return p.axis === "z"
    ? { map: (u, n) => [p.a0 + u, p.off + n], along: (u) => p.a0 + u, nm: 0, axis: "z", normal: [0, 0, 1], len: p.a1 - p.a0, elev: e, h: PART_H }
    : { map: (u, n) => [p.off + n, p.a0 + u], along: (u) => p.a0 + u, nm: 0, axis: "x", normal: [1, 0, 0], len: p.a1 - p.a0, elev: e, h: PART_H };
}

function boxIn(f: Frame, u0: number, u1: number, v0: number, v1: number, n0: number, n1: number, part: string, g: string): Solid {
  const p0 = f.map(u0, n0), p1 = f.map(u1, n1);
  return { k: "box", c: [(p0[0] + p1[0]) / 2, f.elev + (v0 + v1) / 2, (p0[1] + p1[1]) / 2], s: [Math.abs(p1[0] - p0[0]), v1 - v0, Math.abs(p1[1] - p0[1])], part, g };
}
const box = (c: Vec3, s: Vec3, part: string, g: string, rx?: number): Solid => ({ k: "box", c, s, part, g, ...(rx ? { rx } : {}) });

/** Pieces of a wall that tile the whole face once the openings are removed. */
export function tile(len: number, H: number, ops: { u0: number; w: number; sill: number; h: number }[]) {
  const out: { u0: number; u1: number; v0: number; v1: number }[] = [];
  const sorted = [...ops].sort((a, b) => a.u0 - b.u0);
  let cur = 0;
  const pier = (a: number, b: number) => { if (b - a > 1e-6) out.push({ u0: a, u1: b, v0: 0, v1: H }); };
  for (const o of sorted) {
    pier(cur, o.u0);
    if (o.sill > 1e-6) out.push({ u0: o.u0, u1: o.u0 + o.w, v0: 0, v1: o.sill });
    if (o.sill + o.h < H - 1e-6) out.push({ u0: o.u0, u1: o.u0 + o.w, v0: o.sill + o.h, v1: H });
    cur = o.u0 + o.w;
  }
  pier(cur, len);
  return out;
}

const wallLayers = (T: number) => { const ins = T - 0.015 - 0.1 - 0.1; return [{ n0: 0, n1: 0.015, part: "plaster" }, { n0: 0.015, n1: 0.115, part: "block" }, { n0: 0.115, n1: 0.115 + ins, part: "insulation" }, { n0: T - 0.1, n1: T, part: "brick" }]; };
const PART_LAYERS = [{ n0: -0.05, n1: -0.0375, part: "board" }, { n0: -0.0375, n1: 0.0375, part: "stud" }, { n0: 0.0375, n1: 0.05, part: "board" }];

function openingSolids(f: Frame, o: OpeningP, id: string): Solid[] {
  const nm = f.nm, u1 = o.u0 + o.w, v0 = o.sill, v1 = o.sill + o.h, fw = 0.07, d = o.kind === "window" ? 0.06 : 0.07;
  if (o.kind === "window") {
    const uc = (o.u0 + u1) / 2;
    return [
      boxIn(f, o.u0 + fw, u1 - fw, v0 + fw, v1 - fw, nm - 0.012, nm + 0.012, "glass", id),
      boxIn(f, o.u0, o.u0 + fw, v0, v1, nm - d, nm + d, "frame", id), boxIn(f, u1 - fw, u1, v0, v1, nm - d, nm + d, "frame", id),
      boxIn(f, o.u0 + fw, u1 - fw, v0, v0 + fw, nm - d, nm + d, "frame", id), boxIn(f, o.u0 + fw, u1 - fw, v1 - fw, v1, nm - d, nm + d, "frame", id),
      boxIn(f, uc - 0.025, uc + 0.025, v0 + fw, v1 - fw, nm - 0.04, nm + 0.04, "mullion", id),
      boxIn(f, o.u0 - 0.03, u1 + 0.03, v0 - 0.03, v0, nm - 0.2, nm + 0.02, "sill", id),
    ];
  }
  const s = [
    boxIn(f, o.u0 + fw, u1 - fw, v0 + 0.02, v1 - fw, nm - 0.0225, nm + 0.0225, "leaf", id),
    boxIn(f, o.u0, o.u0 + fw, v0, v1, nm - d, nm + d, "frame", id), boxIn(f, u1 - fw, u1, v0, v1, nm - d, nm + d, "frame", id),
    boxIn(f, o.u0 + fw, u1 - fw, v1 - fw, v1, nm - d, nm + d, "frame", id),
    boxIn(f, u1 - 0.2, u1 - 0.12, 0.95, 1.0, nm + 0.0225, nm + 0.07, "handle", id),
  ];
  if (f.nm > 0.1) s.push(boxIn(f, o.u0, u1, 0, 0.02, nm - 0.15, nm + 0.15, "threshold", id));
  return s;
}

const SRC = {
  wall: { category: "Walls", family: "Basic Wall", type: "Ext. Brick on Block 335" },
  part: { category: "Walls", family: "Basic Wall", type: "Int. Stud Partition 100" },
  window: { category: "Windows", family: "Fixed Window with Mullion", type: "1800 x 1500" },
  door: { category: "Doors", family: "Single-Flush", type: "Door" },
  floor: { category: "Floors", family: "Floor", type: "Concrete 300 + Screed" },
  roof: { category: "Roofs", family: "Basic Roof", type: "Flat roof, insulated" },
};

export function buildElems(m: Model): Elem[] {
  const out: Elem[] = [];
  for (const fl of m.floors) {
    const e = elev(fl.level), g = fl.id, mk = (y0: number, y1: number, part: string) => box([0, (y0 + y1) / 2, 0], [X1 - X0, y1 - y0, Z1 - Z0], part, g);
    out.push({ id: fl.id, cat: "floor", name: `Floor slab · Level ${fl.level + 1}`, level: fl.level, src: SRC.floor, axis: "y", solids: [mk(e - SLAB, e - 0.05, "slab"), mk(e - 0.05, e - 0.01, "screed"), mk(e - 0.01, e, "finish")] });
  }
  for (const w of m.walls) {
    const f = wallFrame(w), ops = m.openings.filter((o) => o.host === w.id), solids: Solid[] = [];
    tile(f.len, f.h, ops).forEach((p, i) => { const g = `${w.id}-p${i}`; for (const l of wallLayers(w.thick)) solids.push(boxIn(f, p.u0, p.u1, p.v0, p.v1, l.n0, l.n1, l.part, g)); });
    out.push({ id: w.id, cat: "wall", name: `External wall ${w.side} · Level ${w.level + 1}`, level: w.level, src: SRC.wall, axis: f.axis, solids });
  }
  for (const p of m.parts) {
    const f = partFrame(p), ops = m.openings.filter((o) => o.host === p.id), solids: Solid[] = [];
    tile(f.len, f.h, ops).forEach((pc, i) => { const g = `${p.id}-p${i}`; for (const l of PART_LAYERS) solids.push(boxIn(f, pc.u0, pc.u1, pc.v0, pc.v1, l.n0, l.n1, l.part, g)); });
    out.push({ id: p.id, cat: "partition", name: `Internal partition ${p.id.split("-").pop()} · Level ${p.level + 1}`, level: p.level, src: SRC.part, axis: f.axis, solids });
  }
  for (const o of m.openings) {
    const w = m.walls.find((x) => x.id === o.host), p = m.parts.find((x) => x.id === o.host), f = w ? wallFrame(w) : partFrame(p!), level = (w ?? p)!.level;
    out.push({ id: o.id, cat: o.kind, name: `${o.kind === "window" ? "Window" : "Door"} ${o.id} · Level ${level + 1}`, level, src: SRC[o.kind], axis: f.axis, solids: openingSolids(f, o, o.id) });
  }
  { // roof
    const top = 10.5 + m.roof.insul + 0.02, fx = 24 + 2 * T0, fz = 14 + 2 * T0, g = m.roof.id;
    const solids: Solid[] = [
      box([0, 10.35, 0], [24, 0.3, 14], "deck", g), box([0, 10.5 + m.roof.insul / 2, 0], [fx, m.roof.insul, fz], "insulation", g), box([0, 10.5 + m.roof.insul + 0.01, 0], [fx, 0.02, fz], "membrane", g),
      box([0, top + 0.3, -(fz / 2) + 0.1], [fx, 0.6, 0.2], "parapet", g), box([0, top + 0.3, fz / 2 - 0.1], [fx, 0.6, 0.2], "parapet", g),
      box([-(fx / 2) + 0.1, top + 0.3, 0], [0.2, 0.6, fz - 0.4], "parapet", g), box([fx / 2 - 0.1, top + 0.3, 0], [0.2, 0.6, fz - 0.4], "parapet", g),
    ];
    out.push({ id: g, cat: "roof", name: "Roof · flat, insulated, with parapet", level: 3, src: SRC.roof, axis: "y", solids });
  }
  for (const s of m.shades) {
    if (s.sk === "overhang") {
      out.push({ id: s.id, cat: "shading", sub: "overhang", name: s.name, level: Math.min(3, Math.floor(s.c[1] / FH)), src: { category: "Generic Models", family: "Sunshade / canopy", type: s.type }, solids: [box(s.c, s.size, "overhang", s.id, s.rx)] });
    } else if (s.sk === "tree") {
      out.push({ id: s.id, cat: "shading", sub: "tree", name: `Tree ${s.id.split("-").pop()}`, level: -1, src: { category: "Planting", family: "RPC Tree", type: "Deciduous" },
        solids: [{ k: "cyl", c: [s.x, s.trunk / 2, s.z], s: [0.25, s.trunk, 0.25], part: "trunk", g: s.id }, { k: "sph", c: [s.x, s.trunk + s.r * 0.8, s.z], s: [s.r, s.r, s.r], part: "canopy", g: s.id }] });
    } else {
      const sx = s.x1 - s.x0, sz = s.z1 - s.z0, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      const solids: Solid[] = [box([cx, s.h / 2, cz], [sx, s.h, sz], "body", s.id), box([cx, s.h + 1.2, cz], [Math.min(sx, 8), 2.4, Math.min(sz, 6)], "plant", s.id)];
      const n = Math.floor(s.h / 3.2);
      for (let i = 0; i < n; i++) {
        const y = 1.8 + 3.2 * i;
        solids.push(s.face === "W" ? box([s.x0 - 0.03, y, cz], [0.06, 1.2, sz - 1], "band", s.id) : box([cx, y, s.z1 + 0.03], [sx - 1, 1.2, 0.06], "band", s.id));
      }
      out.push({ id: s.id, cat: "shading", sub: "neighbour", name: `Neighbouring building ${s.id.split("-").pop()}`, level: -1, src: { category: "Mass", family: "Neighbour mass", type: "Context building" }, solids });
    }
  }
  return out;
}

const L = (l: number) => `L${l + 1}`;
export function buildModel(): Model {
  const walls: WallP[] = [], openings: OpeningP[] = [], parts: PartP[] = [], zones: ZoneP[] = [];
  const uOf = (side: Side, a0: number, a1: number) => side === "S" ? a0 - (X0 - T0) : side === "N" ? X1 + T0 - a1 : side === "E" ? a0 - Z0 : Z1 - a1;
  for (let l = 0; l < 3; l++) {
    for (const side of ["S", "N", "E", "W"] as Side[]) {
      const id = `W-${L(l)}-${side}`; walls.push({ id, level: l, side, thick: T0 });
      const centres = side === "S" || side === "N" ? [-10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, 10.5] : [-5.25, -1.75, 1.75, 5.25];
      centres.forEach((c, i) => {
        if (l === 0 && side === "S" && (i === 3 || i === 4)) return; // main entrance sits here
        openings.push({ id: `WIN-${L(l)}-${side}${String(i + 1).padStart(2, "0")}`, kind: "window", host: id, u0: uOf(side, c - 0.9, c + 0.9), w: 1.8, sill: 0.9, h: 1.5 });
      });
      if (l === 0 && side === "S") openings.push({ id: "DR-L1-S01", kind: "door", host: id, u0: uOf("S", -0.9, 0.9), w: 1.8, sill: 0, h: 2.4 });
      if (l === 0 && side === "E") openings.push({ id: "DR-L1-E01", kind: "door", host: id, u0: uOf("E", -0.5, 0.5), w: 1.0, sill: 0, h: 2.2 });
    }
    const p = (n: number, axis: "x" | "z", off: number, a0: number, a1: number) => { parts.push({ id: `P-${L(l)}-${n}`, level: l, axis, off, a0, a1, thick: PART_T }); };
    p(1, "x", 0, 1.5, 7); p(2, "z", 1.5, -12, 12); p(3, "z", -1.5, -12, 12); p(4, "x", -1, -7, -1.5);
    const door = (id: string, host: string, centre: number, a0: number) => openings.push({ id, kind: "door", host, u0: centre - 0.45 - a0, w: 0.9, sill: 0, h: 2.1 });
    door(`DR-${L(l)}-P2a`, `P-${L(l)}-2`, -6, -12); door(`DR-${L(l)}-P2b`, `P-${L(l)}-2`, 6, -12); door(`DR-${L(l)}-P3a`, `P-${L(l)}-3`, -6.5, -12); door(`DR-${L(l)}-P3b`, `P-${L(l)}-3`, 6, -12);
    const names = l === 0 ? ["Reception", "Showroom", "Circulation & Core", "Meeting Room 01", "Open Office"] : [`Open Office ${l}A`, `Open Office ${l}B`, "Circulation & Core", `Meeting Rooms ${l}`, `Open Office ${l}C`];
    const uses = l === 0 ? ["Reception", "Showroom", "Circulation", "Meeting", "Office"] : ["Office", "Office", "Circulation", "Meeting", "Office"];
    const rects: [number, number, number, number][] = [[-12, 0, 1.5, 7], [0, 12, 1.5, 7], [-12, 12, -1.5, 1.5], [-12, -1, -7, -1.5], [-1, 12, -7, -1.5]];
    rects.forEach((r, i) => zones.push({ id: `Z-${L(l)}-${"ABCDE"[i]}`, name: names[i], use: uses[i], level: l, x0: r[0], x1: r[1], z0: r[2], z1: r[3] }));
  }
  const bandY = (l: number) => elev(l) + 2.55;
  return {
    name: "Commercial Building – Sample Model", walls, openings, parts, zones,
    floors: [0, 1, 2].map((l) => ({ id: `F-${L(l)}`, level: l })),
    roof: { id: "ROOF-1", insul: 0.15 },
    shades: [
      { id: "SH-OH-S2", sk: "overhang", name: "Sunshade · south · Level 2", c: [0, bandY(1), Z1 + T0 + 0.45], size: [22, 0.06, 0.9], rx: 0, type: "Fixed sunshade" },
      { id: "SH-OH-S3", sk: "overhang", name: "Sunshade · south · Level 3", c: [0, bandY(2), Z1 + T0 + 0.45], size: [22, 0.06, 0.9], rx: 0, type: "Fixed sunshade" },
      { id: "SH-OH-CAN", sk: "overhang", name: "Entrance canopy (tilted)", c: [0, 3.0, Z1 + T0 + 1.3], size: [6, 0.12, 2.5], rx: -0.12, type: "Entrance canopy" },
      { id: "SH-OH-EAVE", sk: "overhang", name: "Roof overhang · east", c: [X1 + T0 + 0.5, 10.62, 0], size: [1.0, 0.08, 14.7], rx: 0, type: "Roof eave" },
      { id: "TREE-1", sk: "tree", x: -18, z: 13, trunk: 2.6, r: 2.4 }, { id: "TREE-2", sk: "tree", x: -7, z: 17, trunk: 2.8, r: 2.6 },
      { id: "TREE-3", sk: "tree", x: 7, z: 18, trunk: 2.4, r: 2.2 }, { id: "TREE-4", sk: "tree", x: 18, z: 12, trunk: 2.8, r: 2.5 },
      { id: "TREE-5", sk: "tree", x: -19, z: -3, trunk: 2.6, r: 2.3 },
      { id: "NB-A", sk: "neighbour", x0: 22, x1: 34, z0: -8, z1: 9, h: 12.8, face: "W" },
      { id: "NB-B", sk: "neighbour", x0: -10, x1: 8, z0: -26, z1: -15, h: 16, face: "S" },
    ],
  };
}

export interface ModOption { op: string; label: string }
export function modOptions(m: Model, id: string): ModOption[] {
  if (m.openings.some((o) => o.id === id && o.kind === "window")) return [{ op: "widen", label: "Widen by 0.6 m" }, { op: "taller", label: "Make 0.3 m taller" }, { op: "lower-sill", label: "Lower the sill by 0.3 m" }];
  if (m.openings.some((o) => o.id === id)) return [{ op: "taller", label: "Raise the head by 0.1 m" }];
  if (m.walls.some((w) => w.id === id)) return [{ op: "thicken", label: "Thicken by 0.10 m (extra insulation)" }];
  if (m.parts.some((p) => p.id === id)) return m.parts.find((p) => p.id === id)!.axis === "x" ? [{ op: "move", label: "Move 0.5 m" }] : [{ op: "move", label: "Move 0.25 m" }];
  if (m.roof.id === id) return [{ op: "insulate", label: "Add 0.10 m roof insulation" }];
  const s = m.shades.find((x) => x.id === id);
  if (s?.sk === "overhang") return [{ op: "deeper", label: "Make 0.5 m deeper" }];
  if (s?.sk === "tree") return [{ op: "grow", label: "Grow the canopy by 0.5 m" }];
  return [];
}

/** Returns a modified copy of the model; the input is not changed. */
export function applyMod(m: Model, id: string, op: string): Model {
  const n: Model = structuredClone(m);
  const o = n.openings.find((x) => x.id === id);
  if (o) { if (op === "widen") { o.u0 -= 0.3; o.w += 0.6; } else if (op === "taller") o.h += op === "taller" && o.kind === "window" ? 0.3 : 0.1; else if (op === "lower-sill") { o.sill -= 0.3; o.h += 0.3; } return n; }
  const w = n.walls.find((x) => x.id === id); if (w && op === "thicken") { w.thick = +(w.thick + 0.1).toFixed(3); return n; }
  const p = n.parts.find((x) => x.id === id);
  if (p && op === "move") {
    const d = p.axis === "x" ? 0.5 : 0.25, old = p.off; p.off = +(p.off + d).toFixed(3);
    for (const z of n.zones) {
      if (z.level !== p.level) continue;
      if (p.axis === "x") { if (Math.abs(z.x1 - old) < 1e-6 && z.z0 >= p.a0 - 1e-6 && z.z1 <= p.a1 + 1e-6) z.x1 = p.off; if (Math.abs(z.x0 - old) < 1e-6 && z.z0 >= p.a0 - 1e-6 && z.z1 <= p.a1 + 1e-6) z.x0 = p.off; }
      else { if (Math.abs(z.z1 - old) < 1e-6) z.z1 = p.off; if (Math.abs(z.z0 - old) < 1e-6) z.z0 = p.off; }
    }
    return n;
  }
  if (n.roof.id === id && op === "insulate") { n.roof.insul = +(n.roof.insul + 0.1).toFixed(3); return n; }
  const s = n.shades.find((x) => x.id === id);
  if (s?.sk === "overhang" && op === "deeper") { s.size = [s.size[0], s.size[1], s.size[2] + 0.5]; s.c = [s.c[0], s.c[1], s.c[2] + 0.25]; }
  if (s?.sk === "tree" && op === "grow") s.r += 0.5;
  return n;
}
