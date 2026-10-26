/** Sample building for the Revit BIM Automation Dashboard demo. Invented data; units are metres. */
export type Cat = "Walls" | "Doors" | "Windows" | "Columns" | "Floors";
export const CATS: Cat[] = ["Walls", "Doors", "Windows", "Columns", "Floors"];
export const LEVELS = ["Level 1", "Level 2"] as const;
export const FIRE = ["None", "30 min", "60 min", "90 min", "120 min"] as const;

export interface Shape { x1?: number; y1?: number; x2?: number; y2?: number; cx?: number; cy?: number; horiz?: boolean; w?: number; d?: number }
export interface El {
  id: string; cat: Cat; type: string; level: string; host?: string; exterior?: boolean;
  mark: string; comments: string; fire: string; material: string;
  width: number; height: number; thickness: number; length: number;
  shape: Shape;
}

export interface TypeDef { name: string; material: string; width?: number; height?: number; thickness?: number; fire?: string }
export const TYPES: Record<Cat, TypeDef[]> = {
  Walls: [
    { name: "Exterior – Brick Cavity 300", material: "Brick / insulation", thickness: 0.3, fire: "60 min" },
    { name: "Interior – Partition 100", material: "Plasterboard", thickness: 0.1, fire: "30 min" },
    { name: "Interior – Masonry 200", material: "Concrete block", thickness: 0.2, fire: "90 min" },
  ],
  Doors: [
    { name: "Single Flush 900×2100", material: "Timber", width: 0.9, height: 2.1 },
    { name: "Single Flush 1000×2100", material: "Timber", width: 1.0, height: 2.1 },
    { name: "Double Glazed Entrance 1800×2400", material: "Aluminium / glass", width: 1.8, height: 2.4 },
  ],
  Windows: [
    { name: "Fixed 1200×1500", material: "Aluminium / glass", width: 1.2, height: 1.5 },
    { name: "Casement 1800×1500", material: "Aluminium / glass", width: 1.8, height: 1.5 },
    { name: "Casement 900×1200", material: "Aluminium / glass", width: 0.9, height: 1.2 },
  ],
  Columns: [{ name: "Concrete 400×400", material: "Concrete C30/37", width: 0.4, height: 3.2, fire: "120 min" }],
  Floors: [{ name: "Concrete Slab 250", material: "Concrete C30/37", thickness: 0.25, fire: "90 min" }],
};
export const typeDef = (cat: Cat, name: string) => TYPES[cat].find((t) => t.name === name) ?? TYPES[cat][0];

const GX = [0, 8, 16, 24];
const GY = [0, 7, 14];
const H = 3.2;

export function buildModel(): El[] {
  const out: El[] = [];
  let n = 0;
  const id = () => `EL-${String(1000 + ++n)}`;
  const base = (cat: Cat, type: string, level: string, shape: Shape, extra: Partial<El> = {}): El => {
    const t = typeDef(cat, type);
    return { id: id(), cat, type, level, mark: "", comments: "", fire: t.fire ?? "None", material: t.material, width: t.width ?? 0, height: t.height ?? H, thickness: t.thickness ?? 0, length: 0, shape, ...extra };
  };
  for (const level of LEVELS) {
    out.push(base("Floors", "Concrete Slab 250", level, { x1: 0, y1: 0, x2: 24, y2: 14 }, { length: 24, width: 14, height: 0.25, mark: level === "Level 1" ? "F-01" : "F-02" }));
    for (const x of GX) for (const y of GY) out.push(base("Columns", "Concrete 400×400", level, { cx: x, cy: y }, { mark: `C-${String(out.filter((e) => e.cat === "Columns").length + 1).padStart(2, "0")}` }));
    const walls: [number, number, number, number, boolean][] = [];
    for (let i = 0; i < 3; i++) { walls.push([GX[i], 0, GX[i + 1], 0, true]); walls.push([GX[i], 14, GX[i + 1], 14, true]); }
    for (let i = 0; i < 2; i++) { walls.push([0, GY[i], 0, GY[i + 1], true]); walls.push([24, GY[i], 24, GY[i + 1], true]); }
    walls.push([8, 0, 8, 7, false], [8, 7, 8, 14, false], [16, 0, 16, 7, false], [16, 7, 16, 14, false], [8, 7, 16, 7, false]);
    let wi = 0;
    for (const [x1, y1, x2, y2, ext] of walls) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const w = base("Walls", ext ? "Exterior – Brick Cavity 300" : (wi % 2 ? "Interior – Masonry 200" : "Interior – Partition 100"), level, { x1, y1, x2, y2 }, { exterior: ext, length: len });
      if (!ext) wi++;
      out.push(w);
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, horiz = y1 === y2;
      const entrance = level === "Level 1" && ext && y1 === 14 && x1 === 8;
      if (entrance) out.push(base("Doors", "Double Glazed Entrance 1800×2400", level, { cx, cy, horiz }, { host: w.id, exterior: true }));
      else if (ext) out.push(base("Windows", (out.length % 2 ? "Casement 1800×1500" : "Fixed 1200×1500"), level, { cx, cy, horiz }, { host: w.id, exterior: true }));
      else out.push(base("Doors", w.type.includes("Masonry") ? "Single Flush 1000×2100" : "Single Flush 900×2100", level, { cx, cy, horiz }, { host: w.id }));
    }
  }
  // Walls get marks, doors/windows are left blank so the numbering rule has something to do.
  let k = 0;
  for (const e of out) if (e.cat === "Walls") e.mark = `W-${String(++k).padStart(3, "0")}`;
  // A few deliberate gaps for the validation rule to find.
  out.filter((e) => e.cat === "Walls" && !e.exterior).slice(0, 2).forEach((e) => (e.fire = "None"));
  return out;
}

export const PREFIX: Record<Cat, string> = { Walls: "W", Doors: "D", Windows: "WN", Columns: "C", Floors: "F" };

export interface Issue { id: string; text: string }
export function validate(els: El[]): Issue[] {
  const out: Issue[] = [];
  for (const e of els) {
    if (!e.mark) out.push({ id: e.id, text: `${e.cat.slice(0, -1)} ${e.id} has no mark` });
    if ((e.cat === "Doors" || e.cat === "Walls") && e.fire === "None") out.push({ id: e.id, text: `${e.cat.slice(0, -1)} ${e.id} (${e.level}) has no fire rating` });
  }
  return out;
}

export interface QRow { type: string; count: number; qty: number; unit: string; detail: string }
export function schedule(els: El[], cat: Cat): QRow[] {
  const groups = new Map<string, El[]>();
  for (const e of els.filter((x) => x.cat === cat)) (groups.get(e.type) ?? groups.set(e.type, []).get(e.type)!).push(e);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([type, list]) => {
    const count = list.length;
    if (cat === "Walls") return { type, count, qty: r2(list.reduce((s, e) => s + e.length * e.height, 0)), unit: "m² (gross)", detail: `${r2(list.reduce((s, e) => s + e.length, 0))} m run` };
    if (cat === "Windows" || cat === "Doors") return { type, count, qty: r2(list.reduce((s, e) => s + e.width * e.height, 0)), unit: "m² (openings)", detail: `${list[0].width} × ${list[0].height} m` };
    if (cat === "Columns") return { type, count, qty: r2(list.reduce((s, e) => s + e.width * e.width * e.height, 0)), unit: "m³", detail: `${list[0].height} m high` };
    return { type, count, qty: r2(list.reduce((s, e) => s + e.length * e.width, 0)), unit: "m²", detail: `${list[0].thickness * 1000} mm thick` };
  });
}
