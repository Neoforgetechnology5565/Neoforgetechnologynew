/** Sample CAD-to-BIM conversion model: an invented office plan drawn in millimetres, a mapping/transformation engine and validation checks. */
import type { Ent } from "./demo-cad-data";

export type Target = "Walls" | "Doors" | "Windows" | "Rooms" | "Columns" | "Annotations" | "Not mapped";
export const TARGETS: Target[] = ["Walls", "Doors", "Windows", "Rooms", "Columns", "Annotations", "Not mapped"];
export const UNIT_F: Record<string, number> = { Millimetres: 0.001, Centimetres: 0.01, Metres: 1, Inches: 0.0254, Feet: 0.3048 };
export const SRC_UNITS = ["Millimetres", "Centimetres", "Metres", "Inches", "Feet"];
export const RAW = 1000; // the sample file is drawn in millimetres: raw drawing units per internal metre
export const PROJECT = { name: "Lakeside Office Conversion", file: "LKS-A100-Ground-Floor.dwg", sub: "CAD-to-BIM conversion · sample project", declared: "Millimetres" };

export interface Cfg { srcUnits: string; scale: number; tgtUnits: "Metres" | "Millimetres"; storey: number; map: Record<string, Target> }
export const DEFAULT_CFG: Cfg = { srcUnits: "Millimetres", scale: 1, tgtUnits: "Metres", storey: 3, map: { "A-WALL": "Walls", "A-DOOR": "Doors", "A-WIND": "Windows", "A-ROOM": "Rooms", "S-COLS": "Columns", "A-DIMS": "Annotations", "A-TEXT": "Annotations", "A-FURN": "Not mapped", "A-MISC": "Not mapped", "0": "Not mapped" } };
export const LAYER_COLOR: Record<string, string> = { "A-WALL": "#f1f5f9", "A-DOOR": "#fbbf24", "A-WIND": "#5ad1e6", "A-ROOM": "#55b52b", "A-DIMS": "#a3e635", "A-TEXT": "#f8fafc", "S-COLS": "#f87171", "A-FURN": "#c084fc", "A-MISC": "#fb923c", "0": "#94a3b8" };

export function buildSource(): Ent[] {
  const out: Ent[] = []; let n = 0;
  const mk = (e: Partial<Ent> & Pick<Ent, "type" | "layer" | "x1" | "y1">) => { n++; const x = { ...e, id: `S-${String(n).padStart(3, "0")}`, handle: (0x2f0 + n * 13).toString(16).toUpperCase() } as Ent; out.push(x); return x; };
  const wall = (x1: number, y1: number, x2: number, y2: number, ops: { at: number; w: number }[], t = 0.3) => {
    const horiz = y1 === y2, a = horiz ? x1 : y1, b = horiz ? x2 : y2; let cur = a;
    const seg = (s: number, e: number) => { if (e - s > 0.01) mk(horiz ? { type: "wall", layer: "A-WALL", x1: s, y1, x2: e, y2: y1, t } : { type: "wall", layer: "A-WALL", x1, y1: s, x2: x1, y2: e, t }); };
    for (const c of ops.slice().sort((p, q) => p.at - q.at)) { seg(cur, c.at - c.w / 2); cur = c.at + c.w / 2; }
    seg(cur, b);
  };
  wall(0, 0, 20, 0, [3, 10, 16.5].map((at) => ({ at, w: 2 })));
  wall(20, 0, 20, 12, [{ at: 3, w: 2 }, { at: 9, w: 2 }]);
  wall(0, 12, 20, 12, [{ at: 4, w: 1.8 }, { at: 10, w: 2 }, { at: 16.5, w: 2 }]);
  wall(0, 0, 0, 12, [{ at: 3, w: 2 }, { at: 9, w: 2 }]);
  wall(7, 0, 7, 12, [{ at: 3, w: 0.9 }, { at: 9, w: 0.9 }], 0.15); wall(13, 0, 13, 12, [{ at: 3, w: 0.9 }, { at: 9, w: 0.9 }], 0.15); wall(0, 6, 20, 6, [{ at: 3.5, w: 0.9 }, { at: 10, w: 0.9 }, { at: 16.5, w: 0.9 }], 0.15);
  [[3, 0], [10, 0], [16.5, 0], [10, 12], [16.5, 12]].forEach(([x, y]) => mk({ type: "window", layer: "A-WIND", x1: x - 1, y1: y, x2: x + 1, y2: y, t: 0.3 }));
  [[20, 3], [20, 9], [0, 3], [0, 9]].forEach(([x, y]) => mk({ type: "window", layer: "A-WIND", x1: x, y1: y - 1, x2: x, y2: y + 1, t: 0.3 }));
  mk({ type: "door", layer: "A-DOOR", x1: 4, y1: 12, w: 1.8, horiz: true, dir: -1 });
  [[7, 3], [7, 9], [13, 3], [13, 9]].forEach(([x, y]) => mk({ type: "door", layer: "A-DOOR", x1: x, y1: y, w: 0.9, horiz: false, dir: 1 }));
  mk({ type: "door", layer: "A-WALL", x1: 3.5, y1: 6, w: 0.9, horiz: true, dir: 1 });     // door drawn on the wall layer (ambiguous)
  [10, 16.5].forEach((x) => mk({ type: "door", layer: "A-DOOR", x1: x, y1: 6, w: 0.9, horiz: true, dir: 1 }));
  const rooms: [string, string, number, number, number, number][] = [["Office 1", "R1", 0, 0, 7, 6], ["Office 2", "R2", 7, 0, 6, 6], ["Office 3", "R3", 13, 0, 7, 6], ["Reception", "R4", 0, 6, 7, 6], ["Meeting Room", "R5", 7, 6, 6, 6], ["Server Room", "R6", 13, 6, 7, 6]];
  for (const [name, id, x, y, w, h] of rooms) { mk({ type: "room", layer: "A-ROOM", x1: x + 0.15, y1: y + 0.15, w: w - 0.3, h: h - 0.3, name, roomId: id }); mk({ type: "text", layer: "A-TEXT", x1: x + w / 2, y1: y + h / 2, text: name, size: 0.3, roomId: id }); }
  [[7, 6], [13, 6], [7, 0], [13, 12]].forEach(([x, y]) => mk({ type: "col", layer: "S-COLS", x1: x - 0.2, y1: y - 0.2, w: 0.4, h: 0.4 }));
  [[1, 1], [8, 1], [14, 1], [1, 7.5], [8.5, 8], [15, 8]].forEach(([x, y], i) => mk({ type: "rect", layer: "A-FURN", x1: x, y1: y, w: i === 4 ? 3 : 1.6, h: i === 4 ? 1.2 : 0.8, name: "furniture", text: i === 4 ? "Table" : "Desk" }));
  const d = (x1: number, y1: number, x2: number, y2: number, off: number) => mk({ type: "dim", layer: "A-DIMS", x1, y1, x2, y2, h: off });
  d(0, 0, 7, 0, -1); d(7, 0, 13, 0, -1); d(0, 0, 0, 6, -1); d(0, 6, 0, 12, -1); d(0, 12, 7, 12, 1);
  // deliberate flaws in the source
  mk({ type: "wall", layer: "A-WALL", x1: 15, y1: 4, x2: 15.004, y2: 4, t: 0.15 });           // zero-length wall
  mk({ type: "wall", layer: "A-WALL", x1: 0.006, y1: 0.004, x2: 0.012, y2: 0.004, t: 0.15 });   // drawn in the wrong units, near the origin
  mk({ type: "line", layer: "0", x1: 2, y1: 2.5, x2: 5, y2: 2.5 }); mk({ type: "text", layer: "0", x1: 0, y1: -1.8, text: "GROUND FLOOR", size: 0.5 });
  mk({ type: "line", layer: "A-MISC", x1: 9, y1: 14, x2: 12, y2: 14 });
  out[7].handle = out[6].handle;                                                                // duplicate source identifier
  return out;
}

export interface Bim {
  id: string; src: string | null; srcHandle: string; cat: "Walls" | "Doors" | "Windows" | "Rooms" | "Columns" | "Floors";
  name: string; level: string; x1: number; y1: number; x2: number; y2: number; cx: number; cy: number;
  width: number; height: number; thickness: number; length: number; area: number; material: string; classification: string;
  host?: string; exterior?: boolean; inferred?: string; sill?: number;
}
export const rawOf = (v: number) => v * RAW;
export const toModel = (internal: number, cfg: Cfg) => internal * RAW * UNIT_F[cfg.srcUnits] * cfg.scale;
export function validateCfg(cfg: Cfg): string[] {
  const e: string[] = [];
  if (!(cfg.scale > 0) || cfg.scale > 1000) e.push("Scale must be a number above 0 and no more than 1000.");
  if (!(cfg.storey >= 2 && cfg.storey <= 6)) e.push("Storey height must be between 2 and 6 metres.");
  if (UNIT_F[cfg.srcUnits] === undefined) e.push(`Unsupported source unit “${cfg.srcUnits}”.`);
  return e;
}
export function extents(ents: Ent[], cfg: Cfg) {
  const xs: number[] = [], ys: number[] = [];
  for (const e of ents) if (e.layer === "A-WALL" && e.type === "wall" && Math.hypot((e.x2 ?? e.x1) - e.x1, (e.y2 ?? e.y1) - e.y1) > 0.05) { xs.push(e.x1, e.x2 ?? e.x1); ys.push(e.y1, e.y2 ?? e.y1); }
  const k = RAW * UNIT_F[cfg.srcUnits] * cfg.scale;
  return { w: (Math.max(...xs) - Math.min(...xs)) * k, d: (Math.max(...ys) - Math.min(...ys)) * k };
}

/** Which source object types can become which BIM categories. */
const CAN: Record<string, Target[]> = { wall: ["Walls", "Doors", "Windows"], door: ["Doors", "Windows"], window: ["Windows", "Doors"], room: ["Rooms"], col: ["Columns"], rect: ["Columns", "Rooms"], line: ["Walls"], dim: ["Annotations"], text: ["Annotations"] };
export const canConvert = (type: string, t: Target) => t === "Annotations" ? type === "dim" || type === "text" : (CAN[type] ?? []).includes(t);

export interface Skipped { id: string; reason: string; kind: "annotation" | "unmapped" | "unsupported" | "invalid" }
export interface Conv { bim: Bim[]; skipped: Skipped[]; trace: Map<string, string> }
export function convert(ents: Ent[], cfg: Cfg): Conv {
  const bim: Bim[] = [], skipped: Skipped[] = [], trace = new Map<string, string>(); let n = 0;
  const k = RAW * UNIT_F[cfg.srcUnits] * cfg.scale;
  const nid = () => `B-${String(++n).padStart(4, "0")}`;
  for (const e of ents) {
    const t = cfg.map[e.layer] ?? "Not mapped";
    if (t === "Annotations") { skipped.push({ id: e.id, reason: "Annotation: kept in the drawing, not converted to a BIM element", kind: "annotation" }); continue; }
    if (t === "Not mapped") { skipped.push({ id: e.id, reason: `Layer “${e.layer}” is not mapped to a BIM category`, kind: "unmapped" }); continue; }
    if (!canConvert(e.type, t)) { skipped.push({ id: e.id, reason: `A ${e.type === "rect" ? "furniture rectangle" : e.type} object cannot be converted to ${t}`, kind: "unsupported" }); continue; }
    const mid = { x: ((e.x2 ?? e.x1) + e.x1) / 2, y: ((e.y2 ?? e.y1) + e.y1) / 2 };
    const L = Math.hypot((e.x2 ?? e.x1) - e.x1, (e.y2 ?? e.y1) - e.y1) * k;
    const base = { src: e.id, srcHandle: e.handle, level: "Level 1" };
    if (t === "Walls") {
      if (L < 0.01) { skipped.push({ id: e.id, reason: `Zero-length wall (${(L * 1000).toFixed(1)} mm): invalid geometry`, kind: "invalid" }); continue; }
      const id = nid(); const w: Bim = { id, ...base, cat: "Walls", name: `Wall ${(e.t ?? 0.3) >= 0.25 ? "300" : "150"}`, x1: e.x1 * k, y1: e.y1 * k, x2: (e.x2 ?? e.x1) * k, y2: (e.y2 ?? e.y1) * k, cx: mid.x * k, cy: mid.y * k, width: 0, height: cfg.storey, thickness: (e.t ?? 0.3) * k, length: L, area: L * cfg.storey, material: (e.t ?? 0.3) >= 0.25 ? "Brick / insulation" : "Plasterboard", classification: (e.t ?? 0.3) >= 0.25 ? "B2010" : "C1010" };
      bim.push(w); trace.set(e.id, id);
    } else if (t === "Doors" || t === "Windows") {
      const w = (e.type === "door" ? e.w! : L / k * k) * (e.type === "door" ? k : 1); const horiz = e.type === "door" ? !!e.horiz : (e.y1 === (e.y2 ?? e.y1));
      const id = nid(); const door = t === "Doors";
      bim.push({ id, ...base, cat: t, name: door ? (w > 1.5 ? "Double door" : "Single door") : "Window", x1: mid.x * k, y1: mid.y * k, x2: mid.x * k, y2: mid.y * k, cx: mid.x * k, cy: mid.y * k, width: w, height: door ? 2.1 : 1.5, thickness: 0.05, length: horiz ? w : 0, area: w * (door ? 2.1 : 1.5), material: door ? "Timber" : "Aluminium / glass", classification: door ? "C1020" : "B2020", sill: door ? 0 : 0.9, inferred: e.type === "wall" ? "Created from a line on a door/window layer" : e.type !== (door ? "door" : "window") ? `Converted from a ${e.type} object` : undefined });
      (bim[bim.length - 1] as Bim & { horiz?: boolean }).horiz = horiz; trace.set(e.id, id);
    } else if (t === "Rooms") {
      const rw = e.w! * k, rh = e.h! * k; const id = nid();
      bim.push({ id, ...base, cat: "Rooms", name: e.name && e.type === "room" ? e.name : "Space", x1: e.x1 * k, y1: e.y1 * k, x2: (e.x1 + e.w!) * k, y2: (e.y1 + e.h!) * k, cx: (e.x1 + e.w! / 2) * k, cy: (e.y1 + e.h! / 2) * k, width: rw, height: cfg.storey, thickness: 0, length: rh, area: rw * rh, material: "", classification: "", inferred: e.type === "rect" ? "Inferred from a furniture rectangle" : undefined }); trace.set(e.id, id);
    } else if (t === "Columns") {
      const cw = e.w! * k, ch = e.h! * k; const id = nid();
      bim.push({ id, ...base, cat: "Columns", name: e.type === "col" ? "Column" : "Pier", x1: (e.x1 + e.w! / 2) * k, y1: (e.y1 + e.h! / 2) * k, x2: (e.x1 + e.w! / 2) * k, y2: (e.y1 + e.h! / 2) * k, cx: (e.x1 + e.w! / 2) * k, cy: (e.y1 + e.h! / 2) * k, width: cw, height: cfg.storey, thickness: ch, length: cw, area: cw * ch, material: e.type === "col" ? "Concrete C30/37" : "", classification: e.type === "col" ? "B1010" : "", inferred: e.type === "rect" ? "Inferred from a furniture rectangle" : undefined }); trace.set(e.id, id);
    }
  }
  // exterior walls and hosts
  const walls = bim.filter((b) => b.cat === "Walls");
  if (walls.length) {
    const minX = Math.min(...walls.map((w) => Math.min(w.x1, w.x2))), maxX = Math.max(...walls.map((w) => Math.max(w.x1, w.x2))), minY = Math.min(...walls.map((w) => Math.min(w.y1, w.y2))), maxY = Math.max(...walls.map((w) => Math.max(w.y1, w.y2)));
    const tol = 0.05 * Math.max(maxX - minX, 1);
    for (const w of walls) w.exterior = (Math.abs(w.x1 - w.x2) < tol && (Math.abs(w.x1 - minX) < tol || Math.abs(w.x1 - maxX) < tol)) || (Math.abs(w.y1 - w.y2) < tol && (Math.abs(w.y1 - minY) < tol || Math.abs(w.y1 - maxY) < tol));
    for (const o of bim.filter((b) => b.cat === "Doors" || b.cat === "Windows")) {
      const r = o.width / 2 + 0.25; const near = walls.filter((w) => Math.min(Math.hypot(w.x1 - o.cx, w.y1 - o.cy), Math.hypot(w.x2 - o.cx, w.y2 - o.cy)) <= r + 0.05).sort((a, b) => Math.hypot(a.cx - o.cx, a.cy - o.cy) - Math.hypot(b.cx - o.cx, b.cy - o.cy));
      if (near[0]) o.host = near[0].id;
    }
    const pad = 0, id = nid();
    bim.push({ id, src: null, srcHandle: "(generated)", level: "Level 1", cat: "Floors", name: "Slab 250", x1: minX - pad, y1: minY - pad, x2: maxX + pad, y2: maxY + pad, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width: maxX - minX, height: 0.25, thickness: 0.25, length: maxY - minY, area: (maxX - minX) * (maxY - minY), material: "Concrete C30/37", classification: "B1010.10", inferred: "Generated from the outline of the converted walls" });
  }
  return { bim, skipped, trace };
}

/* ------------------------------------------------------------ checks */
export type Sev = "error" | "warning" | "info";
export interface Finding { check: string; severity: Sev; message: string; src?: string[]; bim?: string[] }
export function inspectSource(ents: Ent[], cfg: Cfg): Finding[] {
  const f: Finding[] = []; const count = new Map<string, number>(); ents.forEach((e) => count.set(e.layer, (count.get(e.layer) ?? 0) + 1));
  for (const [layer, nn] of count) if ((cfg.map[layer] ?? "Not mapped") === "Not mapped") f.push({ check: "Missing layer mappings", severity: "warning", message: `Layer “${layer}” (${nn} object${nn > 1 ? "s" : ""}) is not mapped, so those objects will not be converted`, src: ents.filter((e) => e.layer === layer).map((e) => e.id) });
  for (const e of ents) { const t = cfg.map[e.layer] ?? "Not mapped"; if (t !== "Not mapped" && !canConvert(e.type, t)) f.push({ check: "Unsupported objects", severity: "error", message: `${e.id}: a ${e.type === "rect" ? "furniture rectangle" : e.type} on layer “${e.layer}” cannot be converted to ${t}`, src: [e.id] }); }
  for (const e of ents) if (e.type === "wall" && Math.hypot((e.x2 ?? 0) - e.x1, (e.y2 ?? 0) - e.y1) < 0.01 && e.x1 > 1) f.push({ check: "Invalid geometry", severity: "error", message: `${e.id}: zero-length wall (${(Math.hypot((e.x2 ?? 0) - e.x1, (e.y2 ?? 0) - e.y1) * RAW).toFixed(1)} mm)`, src: [e.id] });
  for (const e of ents) if (e.type === "wall" && e.x1 < 0.05 && e.y1 < 0.05 && e.x1 > 0) f.push({ check: "Inconsistent units", severity: "error", message: `${e.id}: a wall at ${(e.x1 * RAW).toFixed(0)}, ${(e.y1 * RAW).toFixed(0)} units sits next to the origin, far from the plan. It was probably drawn in metres`, src: [e.id] });
  const seen = new Map<string, string>(); for (const e of ents) { const first = seen.get(e.handle); if (first) f.push({ check: "Duplicate source identifiers", severity: "error", message: `${e.id} and ${first} share the handle ${e.handle}`, src: [e.id, first] }); else seen.set(e.handle, e.id); }
  const dims = ents.filter((e) => e.type === "dim"), near = (a: number, b: number) => Math.abs(a - b) < 0.06;
  for (const r of ents.filter((e) => e.type === "room")) { const full = { x: r.x1 - 0.15, y: r.y1 - 0.15, w: r.w! + 0.3, h: r.h! + 0.3 }; const okW = dims.some((d) => near(d.y1, d.y2!) && near(Math.abs(d.x2! - d.x1), full.w) && near(Math.min(d.x1, d.x2!), full.x)), okH = dims.some((d) => near(d.x1, d.x2!) && near(Math.abs(d.y2! - d.y1), full.h) && near(Math.min(d.y1, d.y2!), full.y)); if (!okW || !okH) f.push({ check: "Missing dimensions", severity: "warning", message: `${r.name}: no ${!okW && !okH ? "width or depth" : !okW ? "width" : "depth"} dimension`, src: [r.id] }); }
  for (const e of ents) if (e.layer === "0" && e.type !== "text") f.push({ check: "Unclassified entities", severity: "warning", message: `${e.id}: ${e.type} on layer 0 has no discipline classification`, src: [e.id] });
  return f;
}
export function validateModel(c: Conv, ents: Ent[], cfg: Cfg): Finding[] {
  const f: Finding[] = [], bim = c.bim;
  for (const b of bim) { if (b.cat !== "Rooms" && b.cat !== "Floors" && (!b.material || !b.classification)) f.push({ check: "Required properties", severity: "error", message: `${b.id} (${b.cat}, ${b.name}) is incomplete: ${[!b.material && "no material", !b.classification && "no classification"].filter(Boolean).join(" and ")}${b.inferred ? ` (${b.inferred.toLowerCase()})` : ""}`, bim: [b.id], src: b.src ? [b.src] : [] }); if (b.cat === "Rooms" && b.inferred) f.push({ check: "Required properties", severity: "warning", message: `${b.id} is a space inferred from a furniture rectangle and has no classification`, bim: [b.id], src: b.src ? [b.src] : [] }); }
  const ids = new Map<string, number>(); bim.forEach((b) => ids.set(b.id, (ids.get(b.id) ?? 0) + 1)); for (const [id, nn] of ids) if (nn > 1) f.push({ check: "Unique identifiers", severity: "error", message: `Element id ${id} is used ${nn} times`, bim: [id] });
  const byHandle = new Map<string, Bim[]>(); bim.filter((b) => b.src).forEach((b) => (byHandle.get(b.srcHandle) ?? byHandle.set(b.srcHandle, []).get(b.srcHandle)!).push(b)); for (const [h, l] of byHandle) if (l.length > 1) f.push({ check: "Unique identifiers", severity: "error", message: `${l.map((b) => b.id).join(" and ")} trace to the same source handle ${h}`, bim: l.map((b) => b.id), src: l.map((b) => b.src!) });
  const R: Record<string, [number, number, string]> = { Walls: [0.05, 1.5, "thickness"], Doors: [0.6, 3, "width"], Windows: [0.4, 4, "width"], Columns: [0.15, 1.5, "width"] };
  for (const b of bim) { if (b.cat === "Walls") { if (b.height < 2 || b.height > 6) f.push({ check: "Valid dimensions", severity: "error", message: `${b.id}: wall height ${b.height.toFixed(2)} m is outside 2 to 6 m`, bim: [b.id], src: b.src ? [b.src] : [] }); if (b.thickness < 0.05 || b.thickness > 1.5 || b.length > 80) f.push({ check: "Valid dimensions", severity: "error", message: `${b.id}: wall ${b.length.toFixed(2)} m long × ${(b.thickness * 1000).toFixed(0)} mm thick is implausible (check units and scale)`, bim: [b.id], src: b.src ? [b.src] : [] }); } else if (R[b.cat]) { const [lo, hi, label] = R[b.cat]; const v = b.cat === "Columns" ? b.width : b.width; if (v < lo || v > hi) f.push({ check: "Valid dimensions", severity: "error", message: `${b.id}: ${b.cat.toLowerCase().slice(0, -1)} ${label} ${v.toFixed(2)} m is outside ${lo} to ${hi} m`, bim: [b.id], src: b.src ? [b.src] : [] }); } }
  for (const b of bim) if (!b.level) f.push({ check: "Level assignments", severity: "error", message: `${b.id} has no level`, bim: [b.id] });
  for (const o of bim.filter((b) => b.cat === "Doors" || b.cat === "Windows")) if (!o.host) f.push({ check: "Opening hosts", severity: "warning", message: `${o.id} (${o.cat.toLowerCase().slice(0, -1)}) has no adjacent wall`, bim: [o.id], src: o.src ? [o.src] : [] });
  const converted = ents.filter((e) => c.trace.has(e.id)).length, skipped = c.skipped.filter((s) => s.kind !== "annotation");
  const gen = bim.filter((b) => b.src).length;
  if (gen !== converted) f.push({ check: "Source/target consistency", severity: "error", message: `${converted} source objects converted but ${gen} elements trace to a source object` });
  if (skipped.length) f.push({ check: "Source/target consistency", severity: "warning", message: `${skipped.length} source object${skipped.length > 1 ? "s were" : " was"} not converted: ${[...new Set(skipped.map((s) => s.kind))].join(", ")}`, src: skipped.map((s) => s.id) });
  const walls = bim.filter((b) => b.cat === "Walls"); if (!walls.length) f.push({ check: "Required properties", severity: "error", message: "No walls were generated: check the layer mapping" });
  void cfg; return f;
}
