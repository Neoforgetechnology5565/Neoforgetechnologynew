/** Sample drawing set for the BricsCAD Automation Workbench demo. Invented "Riverside Commercial Block"; units are metres, y runs downward. */
import { LAYER_RE, applyFix as baseFix, area, expectedLayer, len, runCheck as baseRun, titleCase, type CheckKey as BaseKey, type Ent, type Finding, type Layer } from "./demo-cad-data";

export const PROJECT = { name: "Riverside Commercial Block", set: "RCB-A100 drawing set", status: "Draft for coordination (sample)" };
export type DrawingId = "gf" | "ff" | "elev" | "sect" | "site";
export const DRAWINGS: { id: DrawingId; file: string; title: string; scale: string }[] = [
  { id: "gf", file: "RCB-A101-GF-Plan.dwg", title: "Ground Floor Plan", scale: "1:100" },
  { id: "ff", file: "RCB-A102-FF-Plan.dwg", title: "First Floor Plan", scale: "1:100" },
  { id: "elev", file: "RCB-A201-Front-Elevation.dwg", title: "Building Elevation", scale: "1:100" },
  { id: "sect", file: "RCB-A301-Section-A.dwg", title: "Building Section A-A", scale: "1:100" },
  { id: "site", file: "RCB-C001-Site-Layout.dwg", title: "Site Layout", scale: "1:200" },
];
export const FIT: Record<DrawingId, { x: number; y: number; w: number; h: number }> = {
  gf: { x: -3, y: -3.4, w: 30, h: 22 }, ff: { x: -3, y: -3.4, w: 30, h: 22 }, elev: { x: -3, y: 0, w: 30, h: 15 }, sect: { x: -3, y: 0, w: 30, h: 15 }, site: { x: -9, y: -9, w: 44, h: 32 },
};

export interface LayerInfo extends Layer { cat: string; lt: string }
const L = (name: string, color: string, cat: string, dash?: string): LayerInfo => ({ name, color, cat, dash, lt: dash ? "Dashed" : "Continuous" });
export const LAYER_TABLE: LayerInfo[] = [
  L("0", "#e5e7eb", "Default"), L("A-WALL", "#f1f5f9", "Walls"), L("A-DOOR", "#fbbf24", "Doors"), L("A-GLAZ", "#5ad1e6", "Windows"), L("A-AREA", "#55b52b", "Rooms", "0.25 0.15"),
  L("A-ANNO-DIMS", "#a3e635", "Dimensions"), L("A-ANNO-TEXT", "#f8fafc", "Text"), L("A-ANNO-TTLB", "#94a3b8", "Title block"), L("A-FURN", "#c084fc", "Furniture"), L("A-CNTR", "#64748b", "Centerlines", "0.6 0.2 0.1 0.2"),
  L("A-GRID", "#64748b", "Grid", "0.6 0.2 0.1 0.2"), L("S-COLS", "#f87171", "Structural Elements"), L("E-POWR", "#fb7185", "Electrical"), L("M-HVAC", "#38bdf8", "Mechanical", "0.4 0.15"), L("A-FLOR-STRS", "#fcd34d", "Stairs"),
  L("C-PROP", "#f59e0b", "Site boundary", "0.8 0.3"), L("C-PARK", "#94a3b8", "Parking"), L("C-SITE", "#a8a29e", "Site"), L("L-PLNT", "#4ade80", "Landscape"),
  L("walls2", "#fb923c", "Walls (non-standard)"), L("DOORS (old)", "#fb923c", "Doors (non-standard)"), L("Elec", "#fb923c", "Electrical (non-standard)"), L("SECT_TXT", "#fb923c", "Text (non-standard)"), L("Trees_old", "#fb923c", "Landscape (non-standard)"),
];
export const layerInfo = (n: string): LayerInfo => LAYER_TABLE.find((l) => l.name === n) ?? L(n, "#fb923c", "Unknown");

class D {
  out: Ent[] = []; n = 0;
  mk(e: Partial<Ent> & Pick<Ent, "type" | "layer" | "x1" | "y1">): Ent { this.n++; const x = { ...e, id: `E-${String(this.n).padStart(4, "0")}`, handle: (0x1c0 + this.n * 11).toString(16).toUpperCase() } as Ent; this.out.push(x); return x; }
  wall(x1: number, y1: number, x2: number, y2: number, ops: { at: number; w: number }[], t = 0.3, layer = "A-WALL") {
    const horiz = y1 === y2, a = horiz ? x1 : y1, b = horiz ? x2 : y2; let cur = a;
    const seg = (s: number, e: number) => { if (e - s < 0.01) return; this.mk(horiz ? { type: "wall", layer, x1: s, y1, x2: e, y2: y1, t } : { type: "wall", layer, x1, y1: s, x2: x1, y2: e, t }); };
    for (const c of ops.slice().sort((p, q) => p.at - q.at)) { seg(cur, c.at - c.w / 2); cur = c.at + c.w / 2; }
    seg(cur, b);
  }
  door(cx: number, cy: number, w: number, horiz: boolean, dir: 1 | -1, layer = "A-DOOR") { return this.mk({ type: "door", layer, x1: cx, y1: cy, w, horiz, dir, std: "A-DOOR" }); }
  win(cx: number, cy: number, w: number, horiz: boolean, layer = "A-GLAZ") { return this.mk(horiz ? { type: "window", layer, x1: cx - w / 2, y1: cy, x2: cx + w / 2, y2: cy, t: 0.3, std: "A-GLAZ" } : { type: "window", layer, x1: cx, y1: cy - w / 2, x2: cx, y2: cy + w / 2, t: 0.3, std: "A-GLAZ" }); }
  dim(x1: number, y1: number, x2: number, y2: number, off: number) { return this.mk({ type: "dim", layer: "A-ANNO-DIMS", x1, y1, x2, y2, h: off }); }
  text(x: number, y: number, text: string, size = 0.3, layer = "A-ANNO-TEXT", extra: Partial<Ent> = {}) { return this.mk({ type: "text", layer, x1: x, y1: y, text, size, std: "A-ANNO-TEXT", ...extra }); }
  room(name: string, id: string, x: number, y: number, w: number, h: number) { return this.mk({ type: "room", layer: "A-AREA", x1: x + 0.2, y1: y + 0.2, w: w - 0.4, h: h - 0.4, name, roomId: id }); }
  rect(x: number, y: number, w: number, h: number, layer: string, std: string, name?: string, text?: string) { return this.mk({ type: "rect", layer, x1: x, y1: y, w, h, std, name, text }); }
  line(x1: number, y1: number, x2: number, y2: number, layer: string, std: string, name?: string) { return this.mk({ type: "line", layer, x1, y1, x2, y2, std, name }); }
  circle(x: number, y: number, r: number, layer: string, std: string) { return this.mk({ type: "circle", layer, x1: x, y1: y, w: r, std }); }
}

function plan(ground: boolean): Ent[] {
  const d = new D();
  const win = (x: number, y: number, w: number, h: boolean, layer = "A-GLAZ") => d.win(x, y, w, h, layer);
  d.wall(0, 0, 24, 0, [3, 9, 15, 21].map((at) => ({ at, w: 2 })));
  d.wall(24, 0, 24, 14, [{ at: 3, w: 2 }, { at: 11, w: 2 }]);
  d.wall(0, 14, 24, 14, ground ? [{ at: 5, w: 1.8 }, { at: 16, w: 0.9 }, { at: 21, w: 2 }] : [{ at: 5, w: 2 }, { at: 16, w: 0.9 }, { at: 21, w: 2 }]);
  d.wall(0, 0, 0, 14, [{ at: 3, w: 2 }, { at: 11, w: 2 }]);
  d.wall(0, 6, 24, 6, [3, 9, 15, 21].map((at) => ({ at, w: 0.9 })), 0.15);
  d.wall(0, 8, 24, 8, [{ at: 5, w: 1.8 }, { at: 12, w: 0.9 }, { at: 16, w: 0.9 }, { at: 21, w: 0.9 }], 0.15);
  for (const x of [6, 12, 18]) d.wall(x, 0, x, 6, [], 0.15, ground && x === 12 ? "walls2" : "A-WALL");
  for (const x of [10, 14, 18]) d.wall(x, 8, x, 14, [], 0.15, ground && x === 14 ? "walls2" : "A-WALL");
  // windows (9,0) is on layer 0 on the ground floor
  [3, 9, 15, 21].forEach((x) => win(x, 0, 2, true, ground && x === 9 ? "0" : "A-GLAZ"));
  win(24, 3, 2, false); win(24, 11, 2, false); win(0, 3, 2, false); win(0, 11, 2, false); win(16, 14, 0.9, true); win(21, 14, 2, true);
  if (!ground) win(5, 14, 2, true);
  // doors
  [3, 9, 15, 21].forEach((x) => d.door(x, 6, 0.9, true, 1, ground && x === 21 ? "DOORS (old)" : "A-DOOR"));
  d.door(5, 8, 1.8, true, -1); d.door(12, 8, 0.9, true, -1); d.door(16, 8, 0.9, true, -1); d.door(21, 8, 0.9, true, -1);
  if (ground) d.door(5, 14, 1.8, true, -1);
  // rooms and labels
  const rooms: [string, string, number, number, number, number][] = ground
    ? [["Office 1", "R1", 0, 0, 6, 6], ["Office 2", "R2", 6, 0, 6, 6], ["Office 3", "R3", 12, 0, 6, 6], ["Meeting Room", "R4", 18, 0, 6, 6], ["Corridor", "R5", 0, 6, 24, 2], ["Lobby", "R6", 0, 8, 10, 6], ["Stair Core", "R7", 10, 8, 4, 6], ["WC", "R8", 14, 8, 4, 6], ["Plant Room", "R9", 18, 8, 6, 6]]
    : [["Open Office", "R1", 0, 0, 12, 6], ["Office 3", "R3", 12, 0, 6, 6], ["Boardroom", "R4", 18, 0, 6, 6], ["Corridor", "R5", 0, 6, 24, 2], ["Training Room", "R6", 0, 8, 10, 6], ["Stair Core", "R7", 10, 8, 4, 6], ["WC", "R8", 14, 8, 4, 6], ["Storage", "R9", 18, 8, 6, 6]];
  for (const [name, id, x, y, w, h] of rooms) {
    const r = d.room(name, id, x, y, w, h); const a = area(r);
    if (ground && id === "R9") continue; // Plant Room: no label
    let txt = `${name}\n${a.toFixed(1)} m²`, size = 0.3;
    if (ground && id === "R2") { txt = `OFFICE 2\n${a.toFixed(1)} m²`; size = 0.22; }
    if (ground && id === "R8") txt = "WC";
    if (ground && id === "R4") txt = `Meeting Room\n${(a + 1.6).toFixed(1)} m²`;
    d.text(x + w / 2, y + h / 2 - 0.3, txt, size, "A-ANNO-TEXT", { roomId: id });
  }
  for (const [x, y] of [[6, 6], [12, 6], [18, 6], [10, 8], [14, 8], [18, 8]] as const) d.mk({ type: "col", layer: "S-COLS", x1: x - 0.2, y1: y - 0.2, w: 0.4, h: 0.4 });
  for (const x of [6, 12, 18]) d.line(x, -1.2, x, 15.2, "A-CNTR", "A-CNTR", "center");
  for (const [x, l] of [[0, "A"], [6, "B"], [12, "C"], [18, "D"], [24, "E"]] as const) d.mk({ type: "grid", layer: "A-GRID", x1: x, y1: -0.9, x2: x, y2: 15.1, text: l });
  // furniture
  for (const [x, y] of [[1.2, 1.2], [7.2, 1.2], [13.2, 1.2], [1.2, 3.8], [7.2, 3.8], [13.2, 3.8]] as const) d.rect(x, y, 1.6, 0.8, "A-FURN", "A-FURN", undefined, "Desk");
  d.rect(19.5, 2, 3, 1.4, "A-FURN", "A-FURN", undefined, "Table");
  d.rect(1.5, 10.5, 2.4, 0.8, ground ? "0" : "A-FURN", "A-FURN", undefined, ground ? "Reception" : "Table");
  // electrical and mechanical
  for (const [x, y] of [[0.4, 5], [6.4, 5], [12.4, 5], [18.4, 5], [23.6, 5]] as const) d.circle(x, y, 0.12, "E-POWR", "E-POWR");
  if (ground) { for (const [x, y] of [[0.4, 10], [9.6, 10], [23.6, 10]] as const) d.circle(x, y, 0.12, "Elec", "E-POWR"); d.circle(6.4, 5, 0.12, "E-POWR", "E-POWR"); }
  d.rect(2, 6.55, 8, 0.4, "M-HVAC", "M-HVAC", undefined, "Duct 400×300"); d.rect(13, 6.55, 9, 0.4, "M-HVAC", "M-HVAC", undefined, "Duct 400×300");
  // dimensions
  d.dim(0, 0, 24, 0, -1.4);
  const tops: [number, number][] = ground ? [[0, 6], [6, 12]] : [[0, 12], [12, 18]];
  for (const [a, b] of tops) d.dim(a, 0, b, 0, -0.7);
  d.dim(0, 0, 0, 6, -1.2); d.dim(0, 6, 0, 8, -1.2); d.dim(0, 8, 0, 14, -1.2);
  const bottoms: [number, number][] = ground ? [[0, 10], [10, 14]] : [[0, 10], [10, 14], [14, 18], [18, 24]];
  for (const [a, b] of bottoms) d.dim(a, 14, b, 14, 1.2);
  // flaws: duplicates, gap, stray segment
  const w6 = d.out.find((e) => e.type === "wall" && e.x1 === 6 && e.y1 === 0)!; if (ground) d.mk({ ...w6 });
  const sock = d.out.find((e) => e.type === "circle" && e.layer === "E-POWR")!; if (ground) d.mk({ ...sock });
  if (ground) { const w = d.out.filter((e) => e.type === "wall" && e.x1 === 18 && e.y1 === 8)[0]; if (w) w.y1 = 8.14; d.mk({ type: "wall", layer: "A-WALL", x1: 22.5, y1: 10, x2: 22.504, y2: 10, t: 0.15 }); }
  else { const w = d.out.filter((e) => e.type === "wall" && e.x1 === 10 && e.y1 === 8)[0]; if (w) w.y1 = 8.12; }
  d.text(0, -2.4, ground ? "GROUND FLOOR PLAN" : "FIRST FLOOR PLAN", 0.5, ground ? "0" : "A-ANNO-TEXT");
  d.mk({ type: "ttlb", layer: "A-ANNO-TTLB", x1: 0, y1: 16.6, w: 24, h: 2.4, text: `${PROJECT.name}|${ground ? "RCB-A101 Ground Floor Plan" : "RCB-A102 First Floor Plan"}|Scale 1:100 (sample)|Sample data, not a real project` });
  return d.out;
}

function elevation(): Ent[] {
  const d = new D();
  d.rect(0, 3, 24, 7, "A-WALL", "A-WALL"); d.rect(-0.2, 2.6, 24.4, 0.4, "A-WALL", "A-WALL", "solid");
  d.line(-3, 10, 27, 10, "C-SITE", "C-SITE"); d.line(-1, 6.4, 25, 6.4, "A-CNTR", "A-CNTR", "center"); d.line(-1, 3, 25, 3, "A-CNTR", "A-CNTR", "center");
  for (const x of [2, 8, 14, 20]) { d.rect(x, 7.4, 2, 1.8, x === 8 ? "walls2" : "A-GLAZ", "A-GLAZ"); d.rect(x, 4, 2, 1.8, "A-GLAZ", "A-GLAZ"); }
  d.rect(4.1, 7.6, 1.8, 2.4, "A-DOOR", "A-DOOR", undefined, "Entrance");
  d.rect(14, 4, 2, 1.8, "A-GLAZ", "A-GLAZ"); // duplicate window
  d.text(26, 6.2, "+3.600 FF", 0.3); d.text(26, 2.8, "+6.800 ROOF", 0.3); d.text(26, 9.8, "±0.000 GF", 0.3);
  d.dim(0, 10, 24, 10, 1.2); d.dim(24, 3, 24, 10, 1.4); d.dim(24, 6.4, 24, 10, 0.7);
  d.text(0, 1.4, "FRONT ELEVATION", 0.5, "0");
  d.mk({ type: "ttlb", layer: "A-ANNO-TTLB", x1: 0, y1: 12.6, w: 24, h: 2.2, text: `${PROJECT.name}|RCB-A201 Front Elevation|Scale 1:100 (sample)|Sample data, not a real project` });
  return d.out;
}

function section(): Ent[] {
  const d = new D();
  d.rect(0, 10, 24, 0.3, "A-WALL", "A-WALL", "solid"); d.rect(0, 6.4, 24, 0.3, "A-WALL", "A-WALL", "solid"); d.rect(0, 3, 24, 0.3, "A-WALL", "A-WALL", "solid");
  d.rect(0, 3.3, 0.3, 6.7, "A-WALL", "A-WALL", "solid"); d.rect(23.7, 3.3, 0.3, 6.7, "A-WALL", "A-WALL", "solid"); d.rect(12, 6.7, 0.15, 3.3, "A-WALL", "A-WALL", "solid");
  for (let i = 0; i < 20; i++) { const x = 14 + i * 0.2, y = 10 - i * 0.18; d.line(x, y, x + 0.2, y, i === 7 ? "walls2" : "A-FLOR-STRS", "A-FLOR-STRS"); d.line(x + 0.2, y, x + 0.2, y - 0.18, "A-FLOR-STRS", "A-FLOR-STRS"); }
  d.line(-3, 10.3, 27, 10.3, "C-SITE", "C-SITE"); d.line(-1, 6.4, 25, 6.4, "A-CNTR", "A-CNTR", "center");
  d.text(26, 6.4, "+3.600 FF", 0.3, "SECT_TXT", { std: "A-ANNO-TEXT" }); d.text(26, 3, "+6.800 ROOF", 0.3); d.text(26, 10, "±0.000 GF", 0.3);
  d.dim(0, 10, 0, 6.4, -1.2); d.dim(0, 6.4, 0, 3, -1.2);
  d.text(0, 1.4, "SECTION A-A", 0.5);
  d.mk({ type: "ttlb", layer: "A-ANNO-TTLB", x1: 0, y1: 12.6, w: 24, h: 2.2, text: `${PROJECT.name}|RCB-A301 Section A-A|Scale 1:100 (sample)|Sample data, not a real project` });
  return d.out;
}

function site(): Ent[] {
  const d = new D();
  const P: [number, number, number, number][] = [[-6, -5, 34, -5], [34, -5, 34, 22], [34, 22, -6, 22], [-6, 22, -6, -5]];
  for (const [a, b, c, e] of P) d.line(a, b, c, e, "C-PROP", "C-PROP");
  d.rect(2, 1, 24, 14, "A-WALL", "A-WALL", "solid", "Riverside Commercial Block");
  for (let i = 0; i < 6; i++) d.rect(1 + i * 2.6, 17, 2.5, 5, "C-PARK", "C-PARK");
  d.rect(1 + 2 * 2.6, 17, 2.5, 5, "C-PARK", "C-PARK"); // duplicate bay
  d.line(-6, 15.5, 34, 15.5, "C-SITE", "C-SITE"); d.line(-6, 24, 34, 24, "C-SITE", "C-SITE");
  [[-3, 2], [30, 4], [30, 14], [-3, 12]].forEach(([x, y], i) => d.circle(x, y, 1.2, i === 3 ? "Trees_old" : "L-PLNT", "L-PLNT"));
  d.dim(-6, -5, 34, -5, -1.5); d.dim(34, -5, 34, 22, 1.5);
  d.text(-4, -7, "SITE LAYOUT", 0.6, "0"); d.text(4, 8.4, "Riverside Commercial Block\n24.0 × 14.0 m", 0.4); d.text(28, 20, "N ↑", 0.5);
  d.mk({ type: "wall", layer: "C-SITE", x1: 14.9, y1: 14.9, x2: 14.903, y2: 14.9, t: 0.1, std: "C-SITE" });
  d.mk({ type: "ttlb", layer: "A-ANNO-TTLB", x1: -6, y1: 25.5, w: 40, h: 2.6, text: `${PROJECT.name}|RCB-C001 Site Layout|Scale 1:200 (sample)|Sample data, not a real project` });
  return d.out;
}

export function buildSet(): Record<DrawingId, { ents: Ent[]; layers: LayerInfo[] }> {
  const raw: Record<DrawingId, Ent[]> = { gf: plan(true), ff: plan(false), elev: elevation(), sect: section(), site: site() };
  const out = {} as Record<DrawingId, { ents: Ent[]; layers: LayerInfo[] }>;
  (Object.keys(raw) as DrawingId[]).forEach((id) => { const used = new Set(raw[id].map((e) => e.layer)); used.add("0"); out[id] = { ents: raw[id], layers: LAYER_TABLE.filter((l) => used.has(l.name)) }; });
  return out;
}

/* ------------------------------------------------------------ automation */
export type ActionKey = "layername" | "duplicates" | "dims" | "annotations" | "classify" | "geometry" | "summary" | "cleanup" | "organize" | "standards";
export const ACTIONS: { key: ActionKey; name: string; text: string; changes?: boolean }[] = [
  { key: "layername", name: "Layer naming audit", text: "Checks every layer against the NCS-style pattern DISCIPLINE-ELEMENT." },
  { key: "duplicates", name: "Duplicate-object detection", text: "Compares geometry records and finds objects drawn twice." },
  { key: "dims", name: "Missing-dimension inspection", text: "Finds rooms without a matching width or depth dimension." },
  { key: "annotations", name: "Annotation consistency check", text: "Room labels must use Title Case, 0.30 m text and include the area." },
  { key: "classify", name: "Object classification", text: "Classifies objects on layer 0 by type and proposes the correct layer." },
  { key: "geometry", name: "Geometry validation", text: "Finds wall ends that miss their neighbour and stray micro-segments." },
  { key: "summary", name: "Drawing summary", text: "Counts objects by layer and type, wall length and room areas." },
  { key: "cleanup", name: "Sample drawing cleanup", text: "Removes duplicates and stray segments, snaps gaps, reclassifies layer-0 objects, purges unused layers.", changes: true },
  { key: "organize", name: "Layer organization", text: "Merges non-standard layers into their standard layer and sorts the layer list.", changes: true },
  { key: "standards", name: "Drawing standards validation", text: "Runs every rule and returns a pass/fail scorecard for this drawing." },
];

export function annotationCheck(ents: Ent[]): { inspected: number; findings: Finding[] } {
  const f: Finding[] = []; const labels = ents.filter((e) => e.type === "text" && e.roomId); const rooms = ents.filter((e) => e.type === "room");
  for (const t of labels) {
    const r = rooms.find((x) => x.roomId === t.roomId); const name = (t.text ?? "").split("\n")[0]; const issues: string[] = [];
    if (name !== titleCase(name) && name === name.toUpperCase() && name.length > 3) issues.push("is in capitals");
    if ((t.size ?? 0.3) !== 0.3) issues.push(`uses ${((t.size ?? 0) * 1000).toFixed(0)} mm text instead of 300 mm`);
    if (!/m²/.test(t.text ?? "")) issues.push("has no area line");
    if (issues.length) f.push({ check: "annotations", ids: [t.id, ...(r ? [r.id] : [])], severity: "warning", message: `Label “${name}” ${issues.join(" and ")}`, action: "Restyle to Title Case, 300 mm text with the computed area.", fix: "restyle" });
  }
  return { inspected: labels.length, findings: f };
}
export function classifyCheck(ents: Ent[]): { inspected: number; findings: Finding[] } {
  const on0 = ents.filter((e) => e.layer === "0" && expectedLayer(e) !== "0");
  return { inspected: ents.length, findings: on0.map((e) => ({ check: "classify", ids: [e.id], severity: "warning" as const, message: `${e.type} ${e.id} is on layer 0 and classifies as ${expectedLayer(e)}`, action: `Move to ${expectedLayer(e)}.`, fix: "move" as const })) };
}

export function runKey(k: Exclude<ActionKey, "cleanup" | "organize" | "standards">, ents: Ent[], layers: Layer[]) {
  if (k === "annotations") return annotationCheck(ents);
  if (k === "classify") return classifyCheck(ents);
  return baseRun(k as BaseKey, ents, layers);
}
export const STANDARD_RULES: { key: Exclude<ActionKey, "cleanup" | "organize" | "standards" | "summary">; rule: string }[] = [
  { key: "layername", rule: "Layer names follow the standard" }, { key: "classify", rule: "No objects left on layer 0" }, { key: "duplicates", rule: "No duplicate objects" },
  { key: "dims", rule: "Every room is dimensioned" }, { key: "annotations", rule: "Room labels are consistent" }, { key: "geometry", rule: "Geometry is clean" },
];
export const allIssues = (ents: Ent[], layers: Layer[]) => STANDARD_RULES.reduce((n, r) => n + runKey(r.key, ents, layers).findings.length, 0) + baseRun("layerassign", ents, layers).findings.filter((f) => !runKey("classify", ents, layers).findings.some((c) => c.ids[0] === f.ids[0])).length;

export function cleanup(ents: Ent[], layers: Layer[]) {
  let e = ents.map((x) => ({ ...x })), l = layers.slice(); const lines: string[] = []; const sizeBefore = e.length;
  const loop = (key: "duplicates" | "geometry" | "classify", label: string, filter?: (f: Finding) => boolean) => {
    let n = 0;
    for (let i = 0; i < 40; i++) { const fs = runKey(key, e, l).findings.filter((f) => f.fix && (!filter || filter(f))); if (!fs.length) break; const r = baseFix(e, l, fs[0]); e = r.ents; l = r.layers; n++; }
    lines.push(`${label}: ${n}`);
  };
  loop("duplicates", "Duplicate objects removed"); loop("geometry", "Stray segments removed and gaps snapped"); loop("classify", "Layer-0 objects reclassified");
  const used = new Set(e.map((x) => x.layer)); const purged = l.filter((x) => x.name !== "0" && !used.has(x.name)); l = l.filter((x) => x.name === "0" || used.has(x.name));
  lines.push(`Unused layers purged: ${purged.length}${purged.length ? ` (${purged.map((x) => x.name).join(", ")})` : ""}`, `Objects: ${sizeBefore} → ${e.length}`);
  return { ents: e, layers: l, lines };
}
export function organize(ents: Ent[], layers: LayerInfo[]) {
  const e = ents.map((x) => ({ ...x })); const lines: string[] = [];
  for (const lay of layers) if (lay.name !== "0" && !LAYER_RE.test(lay.name)) {
    const on = e.filter((x) => x.layer === lay.name); on.forEach((x) => (x.layer = expectedLayer(x)));
    lines.push(`${lay.name} → ${on[0] ? expectedLayer(on[0]) : "(empty, purged)"} (${on.length} object${on.length === 1 ? "" : "s"})`);
  }
  const used = new Set(e.map((x) => x.layer)); used.add("0");
  const next = LAYER_TABLE.filter((x) => used.has(x.name)).sort((a, b) => (a.name === "0" ? -1 : b.name === "0" ? 1 : a.name.localeCompare(b.name)));
  lines.push(`Layers: ${layers.length} → ${next.length}, sorted A–Z`);
  return { ents: e, layers: next, lines };
}
export { len };
