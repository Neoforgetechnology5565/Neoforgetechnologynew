/** Sample drawing for the AutoCAD Drawing Automation Studio demo. Invented floor plan; units are metres, y runs downward on screen. */
export type EType = "wall" | "door" | "window" | "room" | "dim" | "text" | "furn" | "col" | "grid" | "ttlb";
export interface Ent {
  id: string; handle: string; type: EType; layer: string;
  x1: number; y1: number; x2?: number; y2?: number; t?: number; w?: number; h?: number;
  horiz?: boolean; dir?: 1 | -1; text?: string; size?: number; name?: string; roomId?: string;
}
export interface Layer { name: string; color: string; dash?: string }
export const DRAWING = { name: "OFFICE-SUITE-GF-A101.dwg", title: "Ground floor plan, Brookside Office Suite", scale: "1:100 (sample)", status: "Issued for review (sample)" };

export const LAYERS: Layer[] = [
  { name: "0", color: "#e5e7eb" }, { name: "Layer1", color: "#94a3b8" },
  { name: "A-WALL", color: "#f1f5f9" }, { name: "Walls_new", color: "#fb923c" },
  { name: "A-DOOR", color: "#fbbf24" }, { name: "A-GLAZ", color: "#5ad1e6" },
  { name: "A-AREA", color: "#55b52b", dash: "0.25 0.15" }, { name: "A-ANNO-DIMS", color: "#a3e635" },
  { name: "A-ANNO-TEXT", color: "#f8fafc" }, { name: "A-ANNO-TTLB", color: "#94a3b8" },
  { name: "A-FURN", color: "#c084fc" }, { name: "S-COLS", color: "#f87171" }, { name: "A-GRID", color: "#64748b", dash: "0.6 0.2 0.1 0.2" },
];
export const EXPECTED: Record<EType, string> = { wall: "A-WALL", door: "A-DOOR", window: "A-GLAZ", room: "A-AREA", dim: "A-ANNO-DIMS", text: "A-ANNO-TEXT", furn: "A-FURN", col: "S-COLS", grid: "A-GRID", ttlb: "A-ANNO-TTLB" };
export const LAYER_RE = /^[A-Z]-[A-Z]+(-[A-Z]+)*$/;

const ROOMS = [
  { id: "R-MTG", name: "Meeting Room", x: 0, y: 0, w: 6, h: 7 },
  { id: "R-OPN", name: "Open Office", x: 6, y: 0, w: 14, h: 7 },
  { id: "R-REC", name: "Reception", x: 0, y: 7, w: 6, h: 5 },
  { id: "R-PAN", name: "Pantry", x: 6, y: 7, w: 4, h: 5 },
  { id: "R-SRV", name: "Server / Store", x: 10, y: 7, w: 4, h: 5 },
  { id: "R-MGR", name: "Manager Office", x: 14, y: 7, w: 6, h: 5 },
];
const T = 0.3;
type Open = { at: number; w: number };

export function buildDrawing(): Ent[] {
  const out: Ent[] = [];
  let n = 0;
  const mk = (e: Omit<Ent, "id" | "handle">): Ent => { n++; const x = { ...e, id: `E-${String(n).padStart(4, "0")}`, handle: (0x2a0 + n * 7).toString(16).toUpperCase() } as Ent; out.push(x); return x; };
  const wallWith = (x1: number, y1: number, x2: number, y2: number, ops: Open[], t = T, layer = "A-WALL") => {
    const horiz = y1 === y2, a = horiz ? x1 : y1, b = horiz ? x2 : y2;
    const cuts = ops.slice().sort((p, q) => p.at - q.at);
    let cur = a;
    const seg = (s: number, e: number) => { if (e - s < 0.01) return; mk(horiz ? { type: "wall", layer, x1: s, y1, x2: e, y2: y1, t } : { type: "wall", layer, x1, y1: s, x2: x1, y2: e, t }); };
    for (const c of cuts) { seg(cur, c.at - c.w / 2); cur = c.at + c.w / 2; }
    seg(cur, b);
  };
  const door = (cx: number, cy: number, w: number, horiz: boolean, dir: 1 | -1, layer = "A-DOOR") => mk({ type: "door", layer, x1: cx, y1: cy, w, horiz, dir });
  const win = (cx: number, cy: number, w: number, horiz: boolean) => mk(horiz ? { type: "window", layer: "A-GLAZ", x1: cx - w / 2, y1: cy, x2: cx + w / 2, y2: cy, t: T } : { type: "window", layer: "A-GLAZ", x1: cx, y1: cy - w / 2, x2: cx, y2: cy + w / 2, t: T });

  // Walls (split around their door and window openings)
  wallWith(0, 0, 20, 0, [{ at: 3, w: 2.4 }, { at: 9, w: 2.4 }, { at: 13, w: 2.4 }, { at: 17, w: 2.4 }]);
  wallWith(20, 0, 20, 12, [{ at: 3.5, w: 2.4 }, { at: 9.5, w: 2.4 }]);
  wallWith(0, 12, 20, 12, [{ at: 3, w: 1.8 }, { at: 8, w: 1.2 }, { at: 17, w: 2.4 }]);
  wallWith(0, 0, 0, 12, [{ at: 3.5, w: 2.4 }, { at: 9.5, w: 1.8 }]);
  wallWith(0, 7, 20, 7, [{ at: 3, w: 0.9 }, { at: 8, w: 0.9 }, { at: 12, w: 0.9 }, { at: 17, w: 0.9 }], 0.15);
  wallWith(6, 0, 6, 7, [{ at: 3.5, w: 0.9 }], 0.15);
  wallWith(6, 7, 6, 12, [{ at: 9.5, w: 0.9 }], 0.15);
  wallWith(10, 7, 10, 12, [], 0.15, "Walls_new");
  // Deliberate gap: this wall starts 0.12 m short of the wall above it.
  mk({ type: "wall", layer: "A-WALL", x1: 14, y1: 7.12, x2: 14, y2: 12, t: 0.15 });
  // Doors and windows
  door(3, 12, 1.8, true, -1); door(3, 7, 0.9, true, -1); door(6, 3.5, 0.9, false, 1); door(8, 7, 0.9, true, 1); door(12, 7, 0.9, true, 1); door(17, 7, 0.9, true, 1); door(6, 9.5, 0.9, false, -1);
  [3, 9, 13, 17].forEach((x) => win(x, 0, 2.4, true)); win(20, 3.5, 2.4, false); win(20, 9.5, 2.4, false); win(8, 12, 1.2, true); win(17, 12, 2.4, true); win(0, 3.5, 2.4, false); win(0, 9.5, 1.8, false);
  // Rooms and labels
  for (const r of ROOMS) {
    mk({ type: "room", layer: "A-AREA", x1: r.x + 0.2, y1: r.y + 0.2, w: r.w - 0.4, h: r.h - 0.4, name: r.name, roomId: r.id });
    if (r.id === "R-SRV") continue; // deliberately unlabeled
    const area = r.id === "R-MTG" ? "38.0" : ((r.w - 0.4) * (r.h - 0.4)).toFixed(1); // Meeting Room label carries a stale area
    mk({ type: "text", layer: "A-ANNO-TEXT", x1: r.x + r.w / 2, y1: r.y + r.h / 2 - 0.5, text: `${r.name}\n${area} m²`, size: 0.3, roomId: r.id });
  }
  // Columns
  for (const [x, y] of [[6, 7], [10, 7], [14, 7], [6, 0], [14, 0], [20, 7]] as const) mk({ type: "col", layer: "S-COLS", x1: x - 0.2, y1: y - 0.2, w: 0.4, h: 0.4 });
  // Furniture
  for (const [x, y] of [[7.5, 1.2], [10.2, 1.2], [12.9, 1.2], [15.6, 1.2], [7.5, 4.2], [10.2, 4.2], [12.9, 4.2], [15.6, 4.2]] as const) mk({ type: "furn", layer: "A-FURN", x1: x, y1: y, w: 1.6, h: 0.8, name: "Desk" });
  mk({ type: "furn", layer: "A-FURN", x1: 15.6, y1: 4.2, w: 1.6, h: 0.8, name: "Desk" });         // duplicate desk
  mk({ type: "furn", layer: "A-FURN", x1: 1.5, y1: 2.6, w: 3, h: 1.2, name: "Meeting table" });
  mk({ type: "furn", layer: "A-FURN", x1: 1.8, y1: 8.2, w: 2.4, h: 0.8, name: "Reception desk" });
  mk({ type: "furn", layer: "A-FURN", x1: 15.2, y1: 8.4, w: 1.8, h: 0.8, name: "Desk" });
  mk({ type: "furn", layer: "A-ANNO-TEXT", x1: 6.6, y1: 11.0, w: 2.8, h: 0.6, name: "Counter" });     // furniture on a text layer
  // Dimensions: chains below and beside the plan (the Manager Office and Open Office widths are missing)
  const dim = (x1: number, y1: number, x2: number, y2: number, off: number) => mk({ type: "dim", layer: "A-ANNO-DIMS", x1, y1, x2, y2, h: off });
  dim(0, 12, 6, 12, 1.2); dim(6, 12, 10, 12, 1.2); dim(10, 12, 14, 12, 1.2);
  dim(0, 0, 20, 0, -1.4); dim(20, 0, 20, 7, 1.2); dim(20, 7, 20, 12, 1.2);
  // Annotation on the wrong layer
  mk({ type: "text", layer: "0", x1: 0, y1: -2.2, text: "GROUND FLOOR PLAN", size: 0.5 });
  // Grid lines
  for (const [x, l] of [[0, "A"], [6, "B"], [14, "C"], [20, "D"]] as const) mk({ type: "grid", layer: "A-GRID", x1: x, y1: -0.9, x2: x, y2: 13.1, text: l });
  // Title block
  mk({ type: "ttlb", layer: "A-ANNO-TTLB", x1: 0, y1: 14.8, w: 20, h: 2.6, text: `${DRAWING.title}|Drawing ${DRAWING.name}|Scale ${DRAWING.scale}|Sample data, not a real project` });
  // A stray, near-zero-length line left on a default layer
  mk({ type: "wall", layer: "Layer1", x1: 18.4, y1: 9.4, x2: 18.405, y2: 9.4, t: 0.15 });
  return out;
}

export const roomOf = (ents: Ent[], id: string) => ents.find((e) => e.type === "room" && e.roomId === id);
export const area = (r: Ent) => (r.w ?? 0) * (r.h ?? 0);
export const len = (e: Ent) => Math.hypot((e.x2 ?? e.x1) - e.x1, (e.y2 ?? e.y1) - e.y1);
export const bbox = (e: Ent) => {
  if (e.type === "wall" || e.type === "window" || e.type === "grid" || e.type === "dim") { const xs = [e.x1, e.x2!], ys = [e.y1, e.y2!]; return { x: Math.min(...xs) - 0.3, y: Math.min(...ys) - 0.3, w: Math.abs(xs[0] - xs[1]) + 0.6, h: Math.abs(ys[0] - ys[1]) + 0.6 }; }
  if (e.type === "door") return { x: e.x1 - (e.w ?? 1), y: e.y1 - (e.w ?? 1), w: (e.w ?? 1) * 2, h: (e.w ?? 1) * 2 };
  if (e.type === "text") return { x: e.x1 - 1.5, y: e.y1 - 0.6, w: 3, h: 1.4 };
  return { x: e.x1 - 0.3, y: e.y1 - 0.3, w: (e.w ?? 0.4) + 0.6, h: (e.h ?? 0.4) + 0.6 };
};

export type Severity = "error" | "warning" | "info";
export interface Finding { check: string; ids: string[]; severity: Severity; message: string; action: string; fix?: "move" | "delete" | "rename" | "snap" | "label" | "area" | "dim" | "layer" }
export const CHECKS = [
  { key: "layername", name: "Layer naming convention", text: "Layer names must follow DISCIPLINE-ELEMENT (for example A-WALL, A-ANNO-DIMS). Layer 0 is reserved." },
  { key: "layerassign", name: "Objects on unexpected layers", text: "Every object type has a standard layer. Finds objects that sit somewhere else." },
  { key: "duplicates", name: "Duplicate and overlapping objects", text: "Finds objects of the same type drawn on top of each other." },
  { key: "dims", name: "Missing dimensions", text: "Every room needs a width and a depth dimension that matches its walls." },
  { key: "rooms", name: "Room label review", text: "Each room needs a label, and the area in the label must match the room boundary." },
  { key: "geometry", name: "Geometry validation", text: "Finds wall ends that miss their neighbour and tiny stray segments." },
  { key: "summary", name: "Drawing summary", text: "Counts objects by layer and type, wall length and room areas." },
] as const;
export type CheckKey = (typeof CHECKS)[number]["key"];

const key = (e: Ent) => [e.type, e.x1, e.y1, e.x2 ?? "", e.y2 ?? "", e.w ?? "", e.h ?? ""].map((v) => (typeof v === "number" ? v.toFixed(3) : v)).join("|");
const near = (a: number, b: number, tol = 0.06) => Math.abs(a - b) <= tol;
function distToSeg(px: number, py: number, e: Ent) {
  const x1 = e.x1, y1 = e.y1, x2 = e.x2!, y2 = e.y2!, dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy));
}

export function runCheck(k: CheckKey, ents: Ent[], layers: Layer[]): { inspected: number; findings: Finding[] } {
  const f: Finding[] = [];
  if (k === "layername") {
    for (const l of layers) if (l.name !== "0" && !LAYER_RE.test(l.name)) {
      const on = ents.filter((e) => e.layer === l.name);
      f.push({ check: k, ids: on.map((e) => e.id), severity: "warning", message: `Layer “${l.name}” does not follow the naming standard (${on.length} object${on.length === 1 ? "" : "s"} on it)`, action: `Merge into the standard layer for its objects (${on[0] ? EXPECTED[on[0].type] : "A-WALL"}) and purge “${l.name}”.`, fix: "rename" });
    }
    return { inspected: layers.length, findings: f };
  }
  if (k === "layerassign") {
    for (const e of ents) if (e.layer !== EXPECTED[e.type]) f.push({ check: k, ids: [e.id], severity: e.layer === "0" ? "warning" : "error", message: `${e.type} ${e.id} is on layer “${e.layer}”, expected ${EXPECTED[e.type]}`, action: `Move to ${EXPECTED[e.type]}.`, fix: "move" });
    return { inspected: ents.length, findings: f };
  }
  if (k === "duplicates") {
    const seen = new Map<string, Ent>();
    for (const e of ents) { const kk = key(e); const first = seen.get(kk); if (first) f.push({ check: k, ids: [e.id, first.id], severity: "warning", message: `${e.type} ${e.id} duplicates ${first.id} (same position and size)`, action: `Delete ${e.id}.`, fix: "delete" }); else seen.set(kk, e); }
    return { inspected: ents.length, findings: f };
  }
  if (k === "dims") {
    const dims = ents.filter((e) => e.type === "dim");
    const hs = dims.filter((d) => near(d.y1, d.y2!)), vs = dims.filter((d) => near(d.x1, d.x2!));
    const rooms = ents.filter((e) => e.type === "room");
    for (const r of rooms) {
      const full = { x: r.x1 - 0.2, y: r.y1 - 0.2, w: r.w! + 0.4, h: r.h! + 0.4 };
      const okW = hs.some((d) => near(Math.abs(d.x2! - d.x1), full.w) && near(Math.min(d.x1, d.x2!), full.x));
      const okH = vs.some((d) => near(Math.abs(d.y2! - d.y1), full.h) && near(Math.min(d.y1, d.y2!), full.y));
      if (!okW) f.push({ check: k, ids: [r.id], severity: "warning", message: `${r.name} has no width dimension (${full.w.toFixed(1)} m)`, action: "Add a horizontal dimension across the room.", fix: "dim" });
      if (!okH) f.push({ check: k, ids: [r.id], severity: "warning", message: `${r.name} has no depth dimension (${full.h.toFixed(1)} m)`, action: "Add a vertical dimension along the room.", fix: "dim" });
    }
    return { inspected: rooms.length, findings: f.filter((x, i, a) => a.findIndex((y) => y.message === x.message) === i) };
  }
  if (k === "rooms") {
    const rooms = ents.filter((e) => e.type === "room");
    for (const r of rooms) {
      const label = ents.find((e) => e.type === "text" && e.roomId === r.roomId);
      if (!label) { f.push({ check: k, ids: [r.id], severity: "error", message: `${r.name} (${r.id}) has no room label`, action: "Add a label with the room name and area.", fix: "label" }); continue; }
      const m = label.text?.match(/([\d.]+) m²/);
      if (m && Math.abs(+m[1] - area(r)) > 0.15) f.push({ check: k, ids: [label.id, r.id], severity: "warning", message: `${r.name} label says ${m[1]} m² but the boundary measures ${area(r).toFixed(1)} m²`, action: `Update the label to ${area(r).toFixed(1)} m².`, fix: "area" });
    }
    return { inspected: rooms.length, findings: f };
  }
  if (k === "geometry") {
    const walls = ents.filter((e) => e.type === "wall");
    const open = ents.filter((e) => e.type === "door" || e.type === "window");
    const atOpening = (x: number, y: number) => open.some((o) => (o.type === "door" ? Math.hypot(o.x1 - x, o.y1 - y) <= (o.w ?? 1) / 2 + 0.08 : (distToSeg(x, y, o) <= 0.08)));
    for (const w of walls) {
      if (len(w) < 0.05) { f.push({ check: k, ids: [w.id], severity: "error", message: `Wall ${w.id} is only ${(len(w) * 1000).toFixed(0)} mm long (stray segment)`, action: "Delete the segment.", fix: "delete" }); continue; }
      for (const [px, py, end] of [[w.x1, w.y1, 1], [w.x2!, w.y2!, 2]] as const) {
        const others = walls.filter((o) => o.id !== w.id && len(o) >= 0.05);
        const d = Math.min(...others.map((o) => distToSeg(px, py, o)));
        if (d > 0.01 && d <= 0.3 && !atOpening(px, py)) f.push({ check: k, ids: [w.id], severity: "error", message: `Wall ${w.id} ends ${(d * 1000).toFixed(0)} mm short of the neighbouring wall (end ${end})`, action: "Snap the end point to the wall.", fix: "snap" });
      }
    }
    return { inspected: walls.length, findings: f };
  }
  // summary
  const byLayer = new Map<string, number>(), byType = new Map<string, number>();
  for (const e of ents) { byLayer.set(e.layer, (byLayer.get(e.layer) ?? 0) + 1); byType.set(e.type, (byType.get(e.type) ?? 0) + 1); }
  const wallLen = ents.filter((e) => e.type === "wall").reduce((s, e) => s + len(e), 0);
  const areas = ents.filter((e) => e.type === "room").reduce((s, e) => s + area(e), 0);
  const info = (message: string): Finding => ({ check: k, ids: [], severity: "info", message, action: "" });
  f.push(info(`${ents.length} objects on ${byLayer.size} layers`), info([...byType.entries()].map(([t, n]) => `${n} ${t}`).join(", ")), info(`Total wall length ${wallLen.toFixed(1)} m · room area ${areas.toFixed(1)} m² across ${byType.get("room")} rooms`), ...[...byLayer.entries()].sort().map(([l, n]) => info(`Layer ${l}: ${n} objects`)));
  return { inspected: ents.length, findings: f };
}

export function applyFix(ents: Ent[], layers: Layer[], f: Finding): { ents: Ent[]; layers: Layer[] } {
  const next = ents.map((e) => ({ ...e }));
  const by = (id: string) => next.find((e) => e.id === id);
  let ls = layers;
  if (f.fix === "move") f.ids.forEach((id) => { const e = by(id); if (e) e.layer = EXPECTED[e.type]; });
  if (f.fix === "rename") {
    const bad = layers.find((l) => f.message.includes(`“${l.name}”`))?.name;
    f.ids.forEach((id) => { const e = by(id); if (e) e.layer = EXPECTED[e.type]; });
    if (bad) ls = layers.filter((l) => l.name !== bad);
  }
  if (f.fix === "delete") { const rm = f.ids[0]; return { ents: next.filter((e) => e.id !== rm), layers: ls }; }
  if (f.fix === "snap") {
    const w = by(f.ids[0]); if (w) { const end2 = f.message.includes("end 2"); const horiz = near(w.y1, w.y2!);
      if (horiz) { if (end2) w.x2 = Math.round(w.x2!); else w.x1 = Math.round(w.x1); } else if (end2) w.y2 = Math.round(w.y2!); else w.y1 = Math.round(w.y1); }
  }
  if (f.fix === "area") { const t = by(f.ids[0]); const r = by(f.ids[1]); if (t && r) t.text = t.text!.replace(/[\d.]+ m²/, `${area(r).toFixed(1)} m²`); }
  if (f.fix === "label") {
    const r = by(f.ids[0]); if (r) next.push({ id: `E-${String(900 + next.length).padStart(4, "0")}`, handle: (0x900 + next.length).toString(16).toUpperCase(), type: "text", layer: "A-ANNO-TEXT", x1: r.x1 + r.w! / 2, y1: r.y1 + r.h! / 2 - 0.3, text: `${r.name}\n${area(r).toFixed(1)} m²`, size: 0.3, roomId: r.roomId });
  }
  if (f.fix === "dim") {
    const r = by(f.ids[0]);
    if (r) { const wide = f.message.includes("width"); const id = `E-${String(900 + next.length).padStart(4, "0")}`;
      next.push(wide ? { id, handle: (0xa00 + next.length).toString(16).toUpperCase(), type: "dim", layer: "A-ANNO-DIMS", x1: r.x1 - 0.2, y1: r.y1 + r.h! + 0.2, x2: r.x1 + r.w! + 0.2, y2: r.y1 + r.h! + 0.2, h: 2.4 } : { id, handle: (0xa00 + next.length).toString(16).toUpperCase(), type: "dim", layer: "A-ANNO-DIMS", x1: r.x1 - 0.2, y1: r.y1 - 0.2, x2: r.x1 - 0.2, y2: r.y1 + r.h! + 0.2, h: -1.4 }); }
  }
  return { ents: next, layers: ls };
}
