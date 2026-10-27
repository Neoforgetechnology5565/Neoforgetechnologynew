/** Quantity takeoff and illustrative cost model for the BIM Quantity Takeoff & Cost Estimator demo. All rates are invented sample figures. */
import { ELEV, buildModel, type El } from "./demo-revit-data";

export const PROJECT = { name: "Harbour Point Offices", sub: "Two-storey office building · sample estimate", status: "Preliminary estimate · illustrative", currency: "£" };
export type CostCat = "Structure" | "Walls & partitions" | "Wall finishes" | "Floor finishes" | "Doors & windows" | "Roof";
export const COST_CATS: CostCat[] = ["Structure", "Walls & partitions", "Wall finishes", "Floor finishes", "Doors & windows", "Roof"];
export const UNIT_OPTIONS = ["m²", "m³", "nr", "m", "kg", "item"] as const;
export type Unit = (typeof UNIT_OPTIONS)[number];

export interface Rate { code: string; name: string; unit: Unit; rate: number | null; cost: CostCat }
export const DEFAULT_RATES: Rate[] = [
  { code: "W-EXT", name: "Exterior wall: brick cavity 300", unit: "m²", rate: 135, cost: "Walls & partitions" },
  { code: "W-INT100", name: "Interior partition 100 (plasterboard)", unit: "m²", rate: 62, cost: "Walls & partitions" },
  { code: "W-INT200", name: "Interior wall 200 (blockwork)", unit: "m²", rate: 88, cost: "Walls & partitions" },
  { code: "W-PAINT", name: "Wall finish: paint, per face", unit: "m²", rate: 14, cost: "Wall finishes" },
  { code: "S-SLAB", name: "Concrete slab C30/37, 250 mm", unit: "m³", rate: 215, cost: "Structure" },
  { code: "S-COL", name: "Concrete column C30/37", unit: "m³", rate: 480, cost: "Structure" },
  { code: "FL-FIN", name: "Floor finish: screed and tiles", unit: "m³", rate: 55, cost: "Floor finishes" },
  { code: "D-INT", name: "Internal flush door, fitted", unit: "nr", rate: 420, cost: "Doors & windows" },
  { code: "D-ENT", name: "Double glazed entrance door", unit: "nr", rate: 2650, cost: "Doors & windows" },
  { code: "WN-FIX", name: "Fixed window, aluminium", unit: "nr", rate: 480, cost: "Doors & windows" },
  { code: "WN-CSM", name: "Casement window, aluminium", unit: "nr", rate: 640, cost: "Doors & windows" },
  { code: "RF-SYS", name: "Flat roof system (membrane and insulation)", unit: "m²", rate: 140, cost: "Roof" },
  { code: "RF-DRAIN", name: "Roof drainage allowance", unit: "item", rate: null, cost: "Roof" },
];
export const DEFAULT_WASTE: Record<CostCat, number> = { Structure: 5, "Walls & partitions": 7, "Wall finishes": 8, "Floor finishes": 6, "Doors & windows": 0, Roof: 5 };
export const DEFAULT_CONTINGENCY = 7.5;

export interface Line {
  id: string; elId: string; name: string; cat: string; level: string; material: string; work: string; qty: number; unit: Unit; method: string[];
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildLines(): { lines: Line[]; els: El[] } {
  const els = buildModel();
  const lines: Line[] = []; let n = 0;
  const add = (e: { id: string; cat: string; level: string; material: string }, name: string, work: string, qty: number, unit: Unit, method: string[]) => lines.push({ id: `TK-${String(++n).padStart(4, "0")}`, elId: e.id, name, cat: e.cat, level: e.level, material: e.material, work, qty: r3(qty), unit, method });
  for (const e of els) {
    if (e.cat === "Walls") {
      const hosted = els.filter((x) => x.host === e.id), gross = e.length * e.height, open = hosted.reduce((s, x) => s + x.width * x.height, 0), net = gross - open;
      const work = e.exterior ? "W-EXT" : e.type.includes("200") ? "W-INT200" : "W-INT100";
      add(e, e.type, work, net, "m²", [`Gross area = length × height = ${r3(e.length)} × ${e.height} = ${r3(gross)} m²`, `Deductions = hosted openings: ${hosted.map((x) => `${x.id} (${x.width} × ${x.height})`).join(", ") || "none"} = ${r3(open)} m²`, `Net area = ${r3(net)} m²`, `Thickness ${e.thickness * 1000} mm → volume ${r3(net * e.thickness)} m³`]);
      const faces = e.exterior ? 1 : 2;
      add(e, `Paint finish to ${e.id}`, "W-PAINT", net * faces, "m²", [`Net wall area ${r3(net)} m² × ${faces} painted face${faces > 1 ? "s" : ""} (${e.exterior ? "inside face only" : "both faces"}) = ${r3(net * faces)} m²`]);
    } else if (e.cat === "Doors") add(e, e.type, e.exterior ? "D-ENT" : "D-INT", 1, "nr", [`One door of ${e.width} × ${e.height} m`, `Opening area ${r3(e.width * e.height)} m²`]);
    else if (e.cat === "Windows") add(e, e.type, e.type.startsWith("Fixed") ? "WN-FIX" : "WN-CSM", 1, "nr", [`One window of ${e.width} × ${e.height} m`, `Glazed area ${r3(e.width * e.height)} m²`]);
    else if (e.cat === "Columns") add(e, e.type, "S-COL", e.width * e.width * e.height, "m³", [`Volume = b × d × h = ${e.width} × ${e.width} × ${e.height} = ${r3(e.width * e.width * e.height)} m³`]);
    else if (e.cat === "Floors") {
      add(e, e.type, "S-SLAB", e.length * e.width * e.thickness, "m³", [`Plan area = ${e.length} × ${e.width} = ${r3(e.length * e.width)} m²`, `Volume = area × thickness = ${r3(e.length * e.width)} × ${e.thickness} = ${r3(e.length * e.width * e.thickness)} m³`]);
      add(e, `Floor finish to ${e.id}`, "FL-FIN", e.length * e.width, "m²", [`Finished floor area = ${e.length} × ${e.width} = ${r3(e.length * e.width)} m²`]);
    }
  }
  const roof = { id: "RF-1", cat: "Roof", level: "Roof", material: "Bitumen membrane / insulation" };
  add(roof, "Flat roof 300", "RF-SYS", 24.6 * 14.6, "m²", ["Roof area including 0.3 m overhang = 24.6 × 14.6 = 359.16 m²"]);
  add(roof, "Roof drainage allowance", "RF-DRAIN", 1, "item", ["One lump-sum drainage allowance for the roof"]);
  return { lines, els };
}

export type Status = "priced" | "missing" | "mismatch" | "noqty";
export interface Priced extends Line { rate: number | null; rateUnit: Unit; cost: CostCat; subtotal: number; status: Status; issue?: string }
export interface Allow { waste: Record<CostCat, number>; contingency: number }

export function price(lines: Line[], rates: Rate[]): Priced[] {
  const map = new Map(rates.map((r) => [r.code, r]));
  return lines.map((l) => {
    const r = map.get(l.work)!;
    let status: Status = "priced", issue: string | undefined, sub = 0;
    if (!(l.qty >= 0) || !Number.isFinite(l.qty)) { status = "noqty"; issue = "Quantity is missing or negative"; }
    else if (l.qty === 0) { status = "noqty"; issue = "Quantity is zero"; }
    else if (r.rate === null || !Number.isFinite(r.rate)) { status = "missing"; issue = `No unit rate set for ${r.name}`; }
    else if (r.unit !== l.unit) { status = "mismatch"; issue = `Quantity is in ${l.unit} but the rate is per ${r.unit}`; }
    else sub = l.qty * r.rate;
    return { ...l, rate: r.rate, rateUnit: r.unit, cost: r.cost, subtotal: sub, status, issue };
  });
}
export function summarize(rows: Priced[], a: Allow) {
  const cats = COST_CATS.map((c) => { const net = rows.filter((r) => r.cost === c).reduce((s, r) => s + r.subtotal, 0), waste = net * (a.waste[c] / 100); return { cat: c, net, waste, total: net + waste, lines: rows.filter((r) => r.cost === c).length, bad: rows.filter((r) => r.cost === c && r.status !== "priced").length }; });
  const net = cats.reduce((s, c) => s + c.net, 0), waste = cats.reduce((s, c) => s + c.waste, 0), base = net + waste, cont = base * (a.contingency / 100);
  const issues = rows.filter((r) => r.status !== "priced");
  return { cats, net, waste, base, contingency: cont, total: base + cont, issues, complete: issues.length === 0 };
}
export function allowanceErrors(a: Allow): string[] {
  const e: string[] = [];
  if (!(a.contingency >= 0 && a.contingency <= 30)) e.push("Contingency must be between 0 and 30 %.");
  for (const c of COST_CATS) if (!(a.waste[c] >= 0 && a.waste[c] <= 30)) e.push(`Waste for ${c} must be between 0 and 30 %.`);
  return e;
}
export { ELEV };
