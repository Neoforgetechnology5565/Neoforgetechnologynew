/** Sample BIM dataset for the BIM Model Data Explorer demo: invented "Harbour Point Offices" model with deliberately imperfect data. */
import { ELEV, MARK_RE, PREFIX, buildModel, typeDef, type Cat, type El } from "./demo-revit-data";

export type BCat = Cat | "Roof" | "Rooms";
export const BCATS: BCat[] = ["Walls", "Doors", "Windows", "Columns", "Floors", "Roof", "Rooms"];
export const IFC: Record<BCat, string> = { Walls: "IfcWall", Doors: "IfcDoor", Windows: "IfcWindow", Columns: "IfcColumn", Floors: "IfcSlab", Roof: "IfcRoof", Rooms: "IfcSpace" };
export const CLASS_TITLE: Record<string, string> = { B2010: "Exterior walls", C1010: "Interior partitions", C1020: "Interior doors", B2020: "Exterior windows", B1010: "Floor and column structure", "B1010.10": "Floor slabs", B3010: "Roofing" };
export const PROJECT = { name: "Harbour Point Offices", sub: "Two-storey office building · sample BIM data", status: "Coordination model · sample" };
export const LEVEL_NAMES = ["Level 1", "Level 2", "Roof"] as const;
const LEVEL_ELEV: Record<string, number> = { ...ELEV, Roof: 6.4 };

export interface Rel { kind: string; id: string }
export interface BimEl {
  id: string; globalId: string; name: string; cat: BCat; ifc: string; level: string; type: string; material: string;
  mark: string; fire: string; comments: string; classification: string; manufacturer: string;
  width: number; height: number; length: number; thickness: number; area: number; volume: number;
  x: number; y: number; z: number; host?: string; rooms: string[]; exterior: boolean;
  src?: El;
}
const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
const gid = (n: number) => { let s = "", x = n * 2654435761 + 7919; for (let i = 0; i < 22; i++) { s += B64[Math.abs(x) % 64]; x = Math.floor(x / 7) + n * 31 + i * 17; } return s; };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const MFR: Record<string, string> = { Doors: "Forgeline Joinery", Windows: "Clearview Glazing" };

const ZX = [0, 8, 16, 24], ZY = [0, 7, 14];
const ROOM_NAMES: Record<string, string[]> = { "Level 1": ["Reception", "Open Office A", "Open Office B", "Waiting Area", "Meeting Room 1", "Print & Store"], "Level 2": ["Open Office C", "Open Office D", "Boardroom", "Training Room", "Meeting Room 2", "Server Room"] };
export interface Room { id: string; name: string; level: string; x0: number; y0: number; x1: number; y1: number }
export const ROOMS: Room[] = (() => {
  const out: Room[] = []; let n = 0;
  for (const level of ["Level 1", "Level 2"]) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) out.push({ id: `RM-${level === "Level 1" ? 1 : 2}${String(++n % 6 || 6).padStart(2, "0")}`, name: ROOM_NAMES[level][j * 3 + i], level, x0: ZX[i], y0: ZY[j], x1: ZX[i + 1], y1: ZY[j + 1] });
  return out;
})();
const roomsAt = (level: string, x: number, y: number, eps = 0.3) => ROOMS.filter((r) => r.level === level && x >= r.x0 - eps && x <= r.x1 + eps && y >= r.y0 - eps && y <= r.y1 + eps).map((r) => r.id);

export function buildBim(): BimEl[] {
  const base = buildModel();
  // Make this dataset cleaner than Demo 1's, then add its own deliberate faults.
  for (const e of base) { if (e.cat === "Doors") e.fire = e.host ? (base.find((w) => w.id === e.host)?.fire ?? "None") : e.fire; }
  const walls = base.filter((e) => e.cat === "Walls"), doors = base.filter((e) => e.cat === "Doors"), wins = base.filter((e) => e.cat === "Windows"), cols = base.filter((e) => e.cat === "Columns");
  // reset the Demo 1 faults, then plant this demo's own
  const cnt: Record<string, number> = {};
  for (const e of base) { cnt[e.cat] = (cnt[e.cat] ?? 0) + 1; e.mark = `${PREFIX[e.cat]}-${String(cnt[e.cat]).padStart(3, "0")}`; e.fire = e.cat === "Doors" ? (base.find((w) => w.id === e.host)?.fire ?? e.fire) : typeDef(e.cat, e.type).fire ?? "None"; e.assembly = e.cat === "Walls" ? (e.exterior ? "B2010" : "C1010") : e.cat === "Doors" ? "C1020" : e.cat === "Windows" ? "B2020" : e.cat === "Columns" ? "B1010" : "B1010.10"; }
  doors.filter((d) => !d.exterior).forEach((d) => { const h = base.find((w) => w.id === d.host); if (h) d.fire = h.fire; });
  doors[3].mark = ""; wins[4].mark = "";                               // missing identifier marks
  doors[7].mark = doors[2].mark; wins[9].mark = wins[1].mark;          // duplicate marks
  walls[6].mark = "W7"; wins[5].mark = "WN_6";                         // naming convention
  walls.filter((w) => !w.exterior)[2].fire = "None"; doors[1].fire = "None"; // missing fire ratings
  cols[5].assembly = ""; cols[14].assembly = ""; wins[7].assembly = ""; doors[5].assembly = ""; // unclassified
  doors[9].width = 2.6;                                                // unusual dimension (type is 0.9 m)
  cols[9].width = 0.9;                                                 // unusual dimension (type is 0.4 m)
  walls.filter((w) => !w.exterior)[0].material = "Concrete C30/37";    // material differs from its type
  wins[3].material = "";                                               // no material
  const out: BimEl[] = [];
  let n = 0;
  for (const e of base) {
    n++; const s = e.shape; const cx = s.cx ?? ((s.x1 ?? 0) + (s.x2 ?? 0)) / 2, cy = s.cy ?? ((s.y1 ?? 0) + (s.y2 ?? 0)) / 2, z = ELEV[e.level] ?? 0;
    const L = e.cat === "Walls" ? e.length : e.cat === "Floors" ? e.length : 0;
    const area = e.cat === "Walls" ? L * e.height : e.cat === "Floors" ? e.length * e.width : e.cat === "Doors" || e.cat === "Windows" ? e.width * e.height : 0;
    const vol = e.cat === "Walls" ? L * e.height * e.thickness : e.cat === "Floors" ? e.length * e.width * e.thickness : e.cat === "Columns" ? e.width * e.width * e.height : 0;
    out.push({ id: e.id, globalId: gid(n), name: `${e.type}`, cat: e.cat, ifc: IFC[e.cat], level: e.level, type: e.type, material: e.material, mark: e.mark, fire: e.fire, comments: e.comments, classification: e.assembly, manufacturer: MFR[e.cat] ?? "", width: e.cat === "Floors" ? e.width : e.width, height: e.height, length: r3(L), thickness: e.thickness, area: r3(area), volume: r3(vol), x: r3(cx), y: r3(cy), z, host: e.host, rooms: e.cat === "Floors" ? [] : roomsAt(e.level, cx, cy), exterior: !!e.exterior, src: e });
  }
  // duplicate global id (an element copied between models)
  out[40].globalId = out[12].globalId;
  out.push({ id: "RF-1", globalId: gid(900), name: "Flat roof: 300 mm", cat: "Roof", ifc: "IfcRoof", level: "Roof", type: "Flat Roof 300", material: "Bitumen membrane / insulation", mark: "R-001", fire: "60 min", comments: "", classification: "B3010", manufacturer: "", width: 24.6, height: 0.3, length: 24.6, thickness: 0.3, area: r3(24.6 * 14.6), volume: r3(24.6 * 14.6 * 0.3), x: 12, y: 7, z: 6.4, rooms: [], exterior: true });
  ROOMS.forEach((r, i) => { const w = r.x1 - r.x0 - 0.3, d = r.y1 - r.y0 - 0.3; out.push({ id: r.id, globalId: gid(1000 + i), name: r.name, cat: "Rooms", ifc: "IfcSpace", level: r.level, type: "Occupied space", material: "", mark: r.id.replace("RM-", "RM"), fire: "", comments: "", classification: "", manufacturer: "", width: r3(w), height: 3.0, length: r3(d), thickness: 0, area: r3(w * d), volume: r3(w * d * 3.0), x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, z: LEVEL_ELEV[r.level], rooms: [r.id], exterior: false }); });
  return out;
}

export type Sev = "error" | "warning" | "info";
export interface Finding { check: string; id: string; severity: Sev; message: string }
export const CHECKS = [
  { key: "required", name: "Missing required properties", text: "Marks on all elements; fire rating on doors, walls, columns and slabs; material on all built elements." },
  { key: "unclassified", name: "Unclassified elements", text: "Built elements must carry a classification code." },
  { key: "dimensions", name: "Unusual dimensions", text: "Compares each element with its type definition and flags differences over 50%." },
  { key: "materials", name: "Material assignments", text: "Finds elements whose material differs from the material defined by their type." },
  { key: "duplicates", name: "Duplicate identifiers", text: "Finds marks and global IDs used by more than one element." },
  { key: "naming", name: "Naming conventions", text: "Marks must follow PREFIX-### (for example W-014, D-003)." },
] as const;
export type CheckKey = (typeof CHECKS)[number]["key"];
const built = (e: BimEl) => e.cat !== "Rooms";

export function runCheck(k: CheckKey, els: BimEl[]): { inspected: number; findings: Finding[] } {
  const f: Finding[] = [], scope = els.filter(built);
  const add = (e: BimEl, severity: Sev, message: string) => f.push({ check: k, id: e.id, severity, message });
  if (k === "required") for (const e of scope) { if (!e.mark) add(e, "warning", `${e.id} (${e.cat}) has no Mark`); if (["Doors", "Walls", "Columns", "Floors"].includes(e.cat) && e.fire === "None") add(e, "error", `${e.id} (${e.cat}, ${e.level}) has no Fire Rating`); if (!e.material) add(e, "error", `${e.id} (${e.cat}) has no Material`); }
  if (k === "unclassified") for (const e of scope) if (!e.classification) add(e, "warning", `${e.id} (${e.cat}, ${e.level}) has no classification code`);
  if (k === "dimensions") for (const e of scope) { if (!e.src) continue; const t = typeDef(e.src.cat, e.src.type); const ref = t.width ?? 0; if (ref && (e.cat === "Doors" || e.cat === "Windows" || e.cat === "Columns") && (e.width / ref > 1.5 || e.width / ref < 0.6)) add(e, "warning", `${e.id} (${e.cat}) width is ${e.width} m but its type defines ${ref} m`); }
  if (k === "materials") for (const e of scope) { if (!e.src) continue; const t = typeDef(e.src.cat, e.src.type); if (e.material && e.material !== t.material) add(e, "warning", `${e.id} material “${e.material}” differs from its type (“${t.material}”)`); }
  if (k === "duplicates") {
    const marks = new Map<string, BimEl[]>(), gids = new Map<string, BimEl[]>();
    for (const e of scope) { if (e.mark) (marks.get(e.mark) ?? marks.set(e.mark, []).get(e.mark)!).push(e); (gids.get(e.globalId) ?? gids.set(e.globalId, []).get(e.globalId)!).push(e); }
    for (const [m, l] of marks) if (l.length > 1) l.forEach((e) => add(e, "error", `Mark ${m} is used by ${l.map((x) => x.id).join(" and ")}`));
    for (const [g, l] of gids) if (l.length > 1) l.forEach((e) => add(e, "error", `GlobalId ${g.slice(0, 8)}… is shared by ${l.map((x) => x.id).join(" and ")}`));
  }
  if (k === "naming") for (const e of scope) if (e.mark && e.src && !MARK_RE(e.src.cat).test(e.mark)) add(e, "warning", `Mark “${e.mark}” on ${e.id} does not match ${PREFIX[e.src.cat]}-###`);
  return { inspected: scope.length, findings: f };
}
export const allFindings = (els: BimEl[]) => CHECKS.flatMap((c) => runCheck(c.key, els).findings);

export function metrics(els: BimEl[]) {
  const fs = allFindings(els), bad = new Set(fs.map((f) => f.id));
  return { total: els.length, categories: new Set(els.map((e) => e.cat)).size, levels: new Set(els.map((e) => e.level)).size, complete: els.filter((e) => !bad.has(e.id)).length, findings: fs.length, materials: new Set(els.map((e) => e.material).filter(Boolean)).size, bad };
}
export function relations(e: BimEl, els: BimEl[]): Rel[] {
  const out: Rel[] = [];
  if (e.host) out.push({ kind: "Host wall", id: e.host });
  for (const x of els) if (x.host === e.id) out.push({ kind: x.cat === "Doors" ? "Hosted door" : "Hosted window", id: x.id });
  if (e.cat === "Rooms") { for (const x of els) if (x.cat !== "Rooms" && x.rooms.includes(e.id)) out.push({ kind: `Contains ${x.cat.toLowerCase()}`, id: x.id }); }
  else for (const r of e.rooms) out.push({ kind: "Bounds / in room", id: r });
  return out.slice(0, 40);
}
export const categoryTable = (els: BimEl[]) => BCATS.map((c) => { const l = els.filter((e) => e.cat === c); return { cat: c, ifc: IFC[c], count: l.length, area: r3(l.reduce((s, e) => s + e.area, 0)), volume: r3(l.reduce((s, e) => s + e.volume, 0)) }; });
