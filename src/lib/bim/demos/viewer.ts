/** Demonstration 3: BIM model viewer & information explorer — structured information read from an IFC file. */
import type { Plan3dModel } from "../pipeline-types";
import { r2, r3, type ElementInfo, type Ext, type Issue, type Table } from "./types";

export function viewerExt(m: Plan3dModel): { ext: Ext; elements: Record<string, ElementInfo> } {
  const ifc = m.ifc; const issues: Issue[] = []; const tables: Table[] = [];
  if (!ifc) return { ext: { demo: "bim-viewer", headline: [], tables, issues: [{ id: "V001", severity: "error", rule: "no-ifc", title: "No IFC model", detail: "Upload an IFC file (IFC2X3 or IFC4) to explore it here." }], params: {}, notes: [] }, elements: {} };
  const els = ifc.elements; const classes = Object.entries(ifc.classes).sort((a, b) => b[1] - a[1]);
  tables.push({ id: "storeys", title: "Storeys", columns: ["Storey", "Elevation", "Elements"], rows: ifc.storeys.map((s) => [s.name, s.elevation === null ? null : r3(s.elevation), s.count]), note: `Elevations in ${ifc.lengthUnit}.` });
  tables.push({ id: "classes", title: "IFC classes", columns: ["Class", "Count"], rows: classes });
  tables.push({ id: "systems", title: "Systems", columns: ["System", "Members"], rows: ifc.systems.map((s) => [s.name, s.count]) });
  const ps = new Map<string, { n: number; props: Set<string> }>(); for (const e of els) for (const [k, v] of Object.entries(e.props)) { const x = ps.get(k) ?? { n: 0, props: new Set<string>() }; x.n++; Object.keys(v).forEach((p) => x.props.add(p)); ps.set(k, x); }
  tables.push({ id: "psets", title: "Property sets", columns: ["Property set", "Elements", "Properties"], rows: [...ps.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, x]) => [k, x.n, [...x.props].slice(0, 12).join(", ") + (x.props.size > 12 ? ` … (+${x.props.size - 12})` : "")]) });
  const q = new Map<string, Record<string, number>>(); for (const e of els) { const o = q.get(e.cls) ?? {}; for (const [k, v] of Object.entries(e.quantities)) o[k] = (o[k] ?? 0) + v; if (Object.keys(e.quantities).length) q.set(e.cls, o); }
  tables.push({ id: "quantities", title: "Quantities in the file (summed per class)", columns: ["Class", "Quantity", "Total"], rows: [...q.entries()].flatMap(([c, o]) => Object.entries(o).map(([k, v]) => [c, k, r3(v)])), note: "Only quantities stored in the file (BaseQuantities/Qto sets) are summed. Elements without quantities are not measured." });
  tables.push({ id: "elements", title: "Elements", columns: ["Element", "Class", "Name", "Storey", "GlobalId", "Triangles"], rows: els.slice(0, 3000).map((e) => [`#${e.id}`, e.cls, e.name, e.storey ?? "", e.guid, e.triangles]), elementCol: 0, note: els.length > 3000 ? `First 3000 of ${els.length}; the CSV export lists all.` : undefined });
  const noGeo = els.filter((e) => !e.triangles && !/IFCSPACE/i.test(e.cls)); if (noGeo.length) issues.push({ id: "V001", severity: "info", rule: "no-geometry", title: `${noGeo.length} element(s) without geometry`, detail: `Examples: ${noGeo.slice(0, 5).map((e) => e.name || e.cls).join(", ")}. These appear in the tree but cannot be drawn.` });
  m.warnings.slice(0, 20).forEach((w, i) => issues.push({ id: `V${String(i + 2).padStart(3, "0")}`, severity: "info", rule: "reader", title: "Reader note", detail: w }));
  const b = (m.meshes.length ? m.meshes : []).reduce((a, mm) => { for (let i = 0; i < mm.pos.length; i += 3) { a[0] = Math.min(a[0], mm.pos[i]); a[1] = Math.max(a[1], mm.pos[i]); a[2] = Math.min(a[2], mm.pos[i + 1]); a[3] = Math.max(a[3], mm.pos[i + 1]); a[4] = Math.min(a[4], mm.pos[i + 2]); a[5] = Math.max(a[5], mm.pos[i + 2]); } return a; }, [1e18, -1e18, 1e18, -1e18, 1e18, -1e18]);
  const size = m.meshes.length ? `${r2(b[1] - b[0])} × ${r2(b[3] - b[2])} × ${r2(b[5] - b[4])} m` : "—";
  const headline = [{ label: "Schema", value: ifc.schema }, { label: "Project", value: ifc.project || "—" }, { label: "Elements", value: els.length }, { label: "Storeys", value: ifc.storeys.length }, { label: "Triangles", value: ifc.triangles.toLocaleString("en-US") }, { label: "Bounds", value: size }, { label: "File units", value: ifc.lengthUnit }];
  const elements: Record<string, ElementInfo> = {};
  return { ext: { demo: "bim-viewer", headline, tables, issues, params: {}, notes: ["Properties, quantities and the spatial tree are read directly from the file. Nothing is generated or estimated."] }, elements };
}
