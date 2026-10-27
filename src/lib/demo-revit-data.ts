/** Sample building for the Revit BIM Automation Studio demo. Invented data; units are metres. */
export type Cat = "Walls" | "Doors" | "Windows" | "Columns" | "Floors";
export const CATS: Cat[] = ["Walls", "Doors", "Windows", "Columns", "Floors"];
export const LEVELS = ["Level 1", "Level 2"] as const;
export const ELEV: Record<string, number> = { "Level 1": 0, "Level 2": 3.2 };
export const FIRE = ["None", "30 min", "60 min", "90 min", "120 min"] as const;
export const PROJECT = { name: "Harbour Point Offices", sub: "Two-storey office building · sample project", gfa: 672, status: "Design Development" };

export interface Shape { x1?: number; y1?: number; x2?: number; y2?: number; cx?: number; cy?: number; horiz?: boolean }
export interface El {
  id: string; cat: Cat; type: string; level: string; host?: string; exterior?: boolean;
  mark: string; comments: string; fire: string; material: string; assembly: string;
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
export const PREFIX: Record<Cat, string> = { Walls: "W", Doors: "D", Windows: "WN", Columns: "C", Floors: "F" };
export const ASSEMBLY: Record<string, string> = { ext: "B2010", int: "C1010", Doors: "C1020", Windows: "B2020", Columns: "B1010", Floors: "B1010.10" };
const asm = (cat: Cat, ext?: boolean) => (cat === "Walls" ? (ext ? ASSEMBLY.ext : ASSEMBLY.int) : ASSEMBLY[cat]);
export const MARK_RE = (cat: Cat) => new RegExp(`^${PREFIX[cat]}-\\d{3}$`);
const rank = (f: string) => (f === "None" ? 0 : parseInt(f, 10) || 0);

const GX = [0, 8, 16, 24];
const GY = [0, 7, 14];
const H = 3.2;

export function buildModel(): El[] {
  const out: El[] = [];
  let n = 0;
  const id = () => `EL-${String(1000 + ++n)}`;
  const base = (cat: Cat, type: string, level: string, shape: Shape, extra: Partial<El> = {}): El => {
    const t = typeDef(cat, type);
    return { id: id(), cat, type, level, mark: "", comments: "", fire: t.fire ?? "None", material: t.material, assembly: asm(cat, extra.exterior), width: t.width ?? 0, height: t.height ?? H, thickness: t.thickness ?? 0, length: 0, shape, ...extra };
  };
  for (const level of LEVELS) {
    out.push(base("Floors", "Concrete Slab 250", level, { x1: 0, y1: 0, x2: 24, y2: 14 }, { length: 24, width: 14, height: 0.25 }));
    for (const x of GX) for (const y of GY) out.push(base("Columns", "Concrete 400×400", level, { cx: x, cy: y }));
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
      if (entrance) out.push(base("Doors", "Double Glazed Entrance 1800×2400", level, { cx, cy, horiz }, { host: w.id, exterior: true, fire: "30 min" }));
      else if (ext) out.push(base("Windows", (out.length % 2 ? "Casement 1800×1500" : "Fixed 1200×1500"), level, { cx, cy, horiz }, { host: w.id, exterior: true }));
      else out.push(base("Doors", w.type.includes("Masonry") ? "Single Flush 1000×2100" : "Single Flush 900×2100", level, { cx, cy, horiz }, { host: w.id, fire: w.fire }));
    }
  }
  // Sequential marks per category, then a handful of deliberate gaps and mistakes for the checks to find.
  const count: Record<string, number> = {};
  for (const e of out) { count[e.cat] = (count[e.cat] ?? 0) + 1; e.mark = `${PREFIX[e.cat]}-${String(count[e.cat]).padStart(3, "0")}`; }
  const of = (c: Cat) => out.filter((e) => e.cat === c);
  const doors = of("Doors"), windows = of("Windows"), walls = of("Walls"), cols = of("Columns");
  doors[3].mark = ""; windows[2].mark = ""; windows[11].mark = "";                   // missing marks
  walls[6].mark = "W7"; doors[6].mark = "door 12"; windows[5].mark = "WN_6";          // marks that break the convention
  walls.filter((w) => !w.exterior)[1].fire = "None"; walls.filter((w) => !w.exterior)[6].fire = "None"; // missing fire rating (walls)
  doors[1].fire = "None"; doors[8].fire = "None";                                     // missing fire rating (doors)
  doors[4].fire = "30 min"; doors[9].fire = "60 min";                                 // door rated below its host wall
  cols[5].assembly = ""; cols[14].assembly = ""; windows[7].assembly = ""; doors[2].assembly = ""; of("Floors")[1].assembly = ""; // missing assembly code
  return out;
}

export type Severity = "error" | "warning" | "info";
export interface Finding { check: string; id: string; severity: Severity; message: string; action: string; fix?: "mark" | "fire" | "assembly" | "doorfire" }
export const CHECKS = [
  { key: "params", name: "Parameter audit", text: "Finds elements with a missing mark, fire rating or assembly code." },
  { key: "naming", name: "Naming convention check", text: "Marks must follow the pattern PREFIX-### (for example W-014, D-003, WN-021)." },
  { key: "consistency", name: "Model consistency review", text: "Doors in interior walls must be rated at least as high as their host wall." },
] as const;
export type CheckKey = (typeof CHECKS)[number]["key"];

export function nextMark(els: El[], cat: Cat) {
  let max = 0;
  for (const e of els) if (e.cat === cat) { const m = e.mark.match(new RegExp(`^${PREFIX[cat]}-(\\d{3})$`)); if (m) max = Math.max(max, +m[1]); }
  return `${PREFIX[cat]}-${String(max + 1).padStart(3, "0")}`;
}

export function runCheck(key: CheckKey, els: El[], cat?: Cat | "All"): { inspected: number; findings: Finding[] } {
  const scope = els.filter((e) => !cat || cat === "All" || e.cat === cat);
  const f: Finding[] = [];
  const byId = new Map(els.map((e) => [e.id, e]));
  for (const e of scope) {
    if (key === "params") {
      if (!e.mark) f.push({ check: key, id: e.id, severity: "warning", message: `${e.cat.slice(0, -1)} ${e.id} (${e.level}) has no Mark`, action: "Assign the next free mark for the category.", fix: "mark" });
      if (e.cat !== "Windows" && e.fire === "None") f.push({ check: key, id: e.id, severity: "error", message: `${e.cat.slice(0, -1)} ${e.id} (${e.level}) has no Fire Rating`, action: e.cat === "Doors" ? "Match the fire rating of the host wall." : "Apply the default rating for its type.", fix: e.cat === "Doors" ? "doorfire" : "fire" });
      if (!e.assembly) f.push({ check: key, id: e.id, severity: "warning", message: `${e.cat.slice(0, -1)} ${e.id} (${e.level}) has no Assembly Code`, action: `Set the default code (${ASSEMBLY[e.cat === "Walls" ? (e.exterior ? "ext" : "int") : e.cat]}).`, fix: "assembly" });
    } else if (key === "naming") {
      if (e.mark && !MARK_RE(e.cat).test(e.mark)) f.push({ check: key, id: e.id, severity: "warning", message: `Mark “${e.mark}” on ${e.id} does not match ${PREFIX[e.cat]}-###`, action: "Replace it with the next free mark.", fix: "mark" });
    } else if (key === "consistency") {
      const host = e.cat === "Doors" && e.host ? byId.get(e.host) : undefined;
      if (host && !host.exterior && e.fire !== "None" && rank(e.fire) < rank(host.fire)) f.push({ check: key, id: e.id, severity: "error", message: `Door ${e.id} is rated ${e.fire} but its host wall ${host.id} is rated ${host.fire}`, action: `Raise the door rating to ${host.fire}.`, fix: "doorfire" });
    }
  }
  return { inspected: scope.length, findings: f };
}

export function applyFix(els: El[], f: Finding): El[] {
  const map = new Map(els.map((e) => [e.id, e]));
  const e = map.get(f.id);
  if (!e || !f.fix) return els;
  let patch: Partial<El> = {};
  if (f.fix === "mark") patch = { mark: nextMark(els, e.cat) };
  if (f.fix === "assembly") patch = { assembly: asm(e.cat, e.exterior) };
  if (f.fix === "fire") patch = { fire: typeDef(e.cat, e.type).fire ?? "30 min" };
  if (f.fix === "doorfire") { const h = e.host ? map.get(e.host) : undefined; patch = { fire: h && h.fire !== "None" ? h.fire : "60 min" }; }
  return els.map((x) => (x.id === f.id ? { ...x, ...patch } : x));
}

export function applyAll(els: El[], findings: Finding[]) {
  let cur = els, n = 0;
  for (const f of findings) if (f.fix) { const before = cur; cur = applyFix(cur, f); if (cur !== before) n++; }
  return { els: cur, fixed: n };
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

/** All checks across the whole model. Used for the health score and the overview. */
export function allFindings(els: El[]): Finding[] {
  return CHECKS.flatMap((c) => runCheck(c.key, els).findings);
}
export const health = (fs: Finding[]) => Math.max(0, Math.round(100 - fs.filter((f) => f.severity === "error").length * 3 - fs.filter((f) => f.severity === "warning").length * 1.5));
