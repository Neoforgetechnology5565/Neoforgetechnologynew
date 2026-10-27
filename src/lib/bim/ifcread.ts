/**
 * IFC reader built on web-ifc (MPL-2.0, WebAssembly). Reads the real model: spatial hierarchy, element classes, GlobalIds, property sets, quantities and the
 * triangulated geometry that web-ifc produces. Geometry is a rendering of the IFC representation, not the authored BIM semantics themselves.
 * web-ifc outputs coordinates in metres. IFC2X3 and IFC4 are read; IFC4X3 depends on the web-ifc build and is reported as unverified.
 */
import path from "node:path";
import type { MeshEl, MepSystem } from "./model";
import type { Item } from "./clash";
import { obbFromBox, obbAabb } from "./geom";

export interface IfcEl { id: number; guid: string; cls: string; name: string; cat: string; storey?: string; storeyId?: number; sys?: MepSystem; predefined?: string; props: Record<string, Record<string, string | number | boolean>>; quantities: Record<string, number>; bbox?: { min: [number, number, number]; max: [number, number, number] }; triangles: number; systemName?: string }
export interface IfcNode { id: number; cls: string; name: string; children: IfcNode[] }
export interface IfcModel {
  schema: string; project: string; header: { description?: string; fileName?: string; schema?: string }; lengthUnit: string; storeys: { id: number; name: string; elevation: number | null; count: number }[]; elements: IfcEl[]; tree: IfcNode | null; meshes: MeshEl[];
  stats: { classes: Record<string, number>; elements: number; triangles: number; bounds: { min: number[]; max: number[] } | null }; warnings: string[]; systems: { id: number; name: string; count: number }[];
}
const CLASS_CAT: [RegExp, string][] = [[/^IFCWALL/, "wall"], [/^IFCSLAB/, "slab-floor"], [/^IFCROOF/, "roof"], [/^IFCDOOR/, "door"], [/^IFCWINDOW/, "window"], [/^IFCCOLUMN/, "column"], [/^IFCBEAM/, "beam"], [/^IFCSTAIR|^IFCRAMP/, "stair"], [/^IFCSPACE/, "space"], [/^IFCCOVERING/, "covering"], [/^IFCRAILING/, "railing"], [/^IFCFOOTING|^IFCPILE/, "foundation"], [/^IFCCURTAINWALL|^IFCPLATE|^IFCMEMBER/, "member"], [/^IFCFURNISHING|^IFCFURNITURE/, "furniture"],
  [/^IFCDUCTSEGMENT/, "mep-duct"], [/^IFCDUCTFITTING|^IFCPIPEFITTING|^IFCCABLECARRIERFITTING|^IFCCABLEFITTING/, "mep-fitting"], [/^IFCPIPESEGMENT/, "mep-pipe"], [/^IFCCABLECARRIERSEGMENT|^IFCCABLESEGMENT/, "mep-cable-tray"], [/^IFCAIRTERMINAL|^IFCFLOWTERMINAL|^IFCSANITARYTERMINAL|^IFCFIRESUPPRESSIONTERMINAL/, "mep-air-terminal"], [/^IFCLIGHTFIXTURE|^IFCLAMP/, "mep-light"], [/^IFCUNITARYEQUIPMENT|^IFCAIRTOAIRHEATRECOVERY|^IFCBOILER|^IFCCHILLER|^IFCFAN|^IFCPUMP|^IFCTANK|^IFCCOMPRESSOR|^IFCHEATEXCHANGER|^IFCELECTRICDISTRIBUTIONBOARD|^IFCTRANSFORMER|^IFCFLOWMOVINGDEVICE|^IFCFLOWTREATMENTDEVICE|^IFCFLOWSTORAGEDEVICE|^IFCENERGYCONVERSIONDEVICE|^IFCFLOWCONTROLLER|^IFCVALVE|^IFCDAMPER/, "mep-equipment"], [/^IFCFLOWSEGMENT|^IFCFLOWFITTING/, "mep-pipe"], [/^IFCBUILDINGELEMENTPROXY/, "proxy"]];
export const catOf = (cls: string) => CLASS_CAT.find(([re]) => re.test(cls.toUpperCase()))?.[1] ?? "other";
const val = (x: unknown): string | number | boolean | undefined => (x && typeof x === "object" && "value" in (x as object) ? ((x as { value: string | number | boolean }).value) : (typeof x === "string" || typeof x === "number" || typeof x === "boolean" ? x : undefined));

export function systemFromName(n: string): MepSystem | undefined { const s = n.toLowerCase(); if (/supply|sa\b|zuluft|soufflage/.test(s)) return "supply-air"; if (/return|ra\b|abluft|reprise/.test(s)) return "return-air"; if (/exhaust|extract|ea\b|fortluft/.test(s)) return "exhaust-air"; if (/hot|dhw|warmwasser/.test(s)) return "water-hot"; if (/cold|domestic|kaltwasser|water/.test(s)) return "water-cold"; if (/drain|waste|sewer|abwasser/.test(s)) return "drainage"; if (/vent/.test(s)) return "vent"; if (/fire|sprink/.test(s)) return "fire-protection"; if (/light/.test(s)) return "electrical-lighting"; if (/elec|power|cable/.test(s)) return "electrical-power"; if (/hvac|air|mech/.test(s)) return "supply-air"; return undefined; }

export const MAX_IFC_BYTES = 40 * 1024 * 1024;
export async function readIfc(buf: Buffer, opts: { maxTriangles?: number; withMeshes?: boolean } = {}): Promise<IfcModel> {
  if (buf.length > MAX_IFC_BYTES) throw new Error(`IFC file larger than ${MAX_IFC_BYTES / 1048576} MB.`);
  const head = buf.subarray(0, 64).toString("latin1"); if (!/^ISO-10303-21;/.test(head.trimStart())) throw new Error("Not an IFC (STEP) file: ISO-10303-21 header missing. IFCZIP and IFCXML are not supported.");
  const W = await import("web-ifc"); const api = new W.IfcAPI(); api.SetWasmPath(path.join(process.cwd(), "node_modules/web-ifc") + path.sep, true); await api.Init(undefined, true);
  const warnings: string[] = []; let id = -1;
  try { id = api.OpenModel(new Uint8Array(buf)); } catch (e) { throw new Error(`web-ifc could not open the file: ${(e as Error).message}`); }
  try {
    const schema = api.GetModelSchema(id); if (!/^IFC(2X3|4)$/.test(schema)) warnings.push(`Schema ${schema} is not one of the verified schemas (IFC2X3, IFC4): geometry or properties may be incomplete.`);
    const hdr = (n: number) => { try { const h = api.GetHeaderLine(id, n); return h?.arguments?.[0]?.[0]?.value ?? h?.arguments?.[0]?.value; } catch { return undefined; } };
    const header = { description: hdr(W.FILE_DESCRIPTION), fileName: hdr(W.FILE_NAME), schema };
    const nameOf = (eid: number) => { try { const l = api.GetLine(id, eid); return String(val(l?.Name) ?? val(l?.LongName) ?? ""); } catch { return ""; } };
    const typeName = (eid: number) => String(api.GetNameFromTypeCode(api.GetLineType(id, eid))).toUpperCase();
    // project
    const proj = api.GetLineIDsWithType(id, W.IFCPROJECT); const projectName = proj.size() ? nameOf(proj.get(0)) : "";
    // length unit
    let lengthUnit = "metre (assumed)"; let unitScale = 1; try { const ua = api.GetLineIDsWithType(id, W.IFCSIUNIT); for (let i = 0; i < ua.size(); i++) { const u = api.GetLine(id, ua.get(i)); if (val(u.UnitType) === "LENGTHUNIT") { const pre = String(val(u.Prefix) ?? ""); lengthUnit = `${pre}${val(u.Name) ?? "METRE"}`.toLowerCase(); unitScale = ({ MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000, "": 1 } as Record<string, number>)[pre] ?? 1; } } if (api.GetLineIDsWithType(id, W.IFCCONVERSIONBASEDUNIT).size()) warnings.push("The file declares conversion-based units (e.g. inches/feet); stated property values are shown in the file's own units."); } catch { /* keep default */ }
    // spatial structure
    const parentOf = new Map<number, number>(); const childrenOf = new Map<number, number[]>(); const add = (p: number, c: number) => { parentOf.set(c, p); (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(c); };
    const ag = api.GetLineIDsWithType(id, W.IFCRELAGGREGATES); for (let i = 0; i < ag.size(); i++) { const r = api.GetLine(id, ag.get(i)); const p = r.RelatingObject?.value; for (const c of r.RelatedObjects ?? []) if (p && c?.value) add(p, c.value); }
    const cs = api.GetLineIDsWithType(id, W.IFCRELCONTAINEDINSPATIALSTRUCTURE); const contained = new Map<number, number>(); for (let i = 0; i < cs.size(); i++) { const r = api.GetLine(id, cs.get(i)); const p = r.RelatingStructure?.value; for (const c of r.RelatedElements ?? []) if (p && c?.value) { contained.set(c.value, p); (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(c.value); } }
    // systems
    const sysOf = new Map<number, { id: number; name: string }>(); const sysCount = new Map<number, { id: number; name: string; count: number }>(); const gr = api.GetLineIDsWithType(id, W.IFCRELASSIGNSTOGROUP); for (let i = 0; i < gr.size(); i++) { const r = api.GetLine(id, gr.get(i)); const g = r.RelatingGroup?.value; if (!g) continue; const gt = typeName(g); if (!/SYSTEM/.test(gt)) continue; const nm = nameOf(g); for (const o of r.RelatedObjects ?? []) if (o?.value) { sysOf.set(o.value, { id: g, name: nm }); const e = sysCount.get(g) ?? { id: g, name: nm, count: 0 }; e.count++; sysCount.set(g, e); } }
    // elements = everything with geometry
    const meshAcc = new Map<number, { pos: number[]; idx: number[] }>(); let tris = 0; const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; const maxTri = opts.maxTriangles ?? 2_500_000; let truncated = false;
    api.StreamAllMeshes(id, (m) => {
      if (truncated) return; const acc = meshAcc.get(m.expressID) ?? { pos: [], idx: [] };
      for (let i = 0; i < m.geometries.size(); i++) { const g = m.geometries.get(i); const geo = api.GetGeometry(id, g.geometryExpressID); const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()); const ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize()); const t = g.flatTransformation; const base = acc.pos.length / 3;
        for (let k = 0; k < v.length; k += 6) { const x = v[k], y = v[k + 1], z = v[k + 2]; const Xw = t[0] * x + t[4] * y + t[8] * z + t[12], Yw = t[1] * x + t[5] * y + t[9] * z + t[13], Zw = t[2] * x + t[6] * y + t[10] * z + t[14]; const X = Xw, Y = -Zw, Z = Yw; /* web-ifc returns Y-up; convert back to the IFC Z-up frame */ acc.pos.push(Math.round(X * 1e4) / 1e4, Math.round(Y * 1e4) / 1e4, Math.round(Z * 1e4) / 1e4); const P = [X, Y, Z]; for (let q = 0; q < 3; q++) { if (P[q] < bounds.min[q]) bounds.min[q] = P[q]; if (P[q] > bounds.max[q]) bounds.max[q] = P[q]; } }
        for (let k = 0; k < ix.length; k++) acc.idx.push(ix[k] + base); tris += ix.length / 3; geo.delete(); if (tris > maxTri) { truncated = true; break; } }
      meshAcc.set(m.expressID, acc);
    });
    if (truncated) warnings.push(`Geometry was truncated at ${maxTri.toLocaleString()} triangles (resource limit). Elements after that point have no geometry.`);
    const elements: IfcEl[] = []; const classes: Record<string, number> = {}; const meshes: MeshEl[] = [];
    const storeyOf = (eid: number): number | undefined => { let cur: number | undefined = eid; for (let g = 0; g < 8 && cur !== undefined; g++) { const p: number | undefined = contained.get(cur) ?? parentOf.get(cur); if (p === undefined) return undefined; if (/IFCBUILDINGSTOREY/.test(typeName(p))) return p; cur = p; } return undefined; };
    const storeyInfo = new Map<number, { id: number; name: string; elevation: number | null; count: number }>(); const st = api.GetLineIDsWithType(id, W.IFCBUILDINGSTOREY); for (let i = 0; i < st.size(); i++) { const l = api.GetLine(id, st.get(i)); const el = val(l.Elevation); storeyInfo.set(st.get(i), { id: st.get(i), name: nameOf(st.get(i)), elevation: typeof el === "number" ? Math.round(el * unitScale * 1000) / 1000 : null, count: 0 }); }
    const all = new Set<number>(meshAcc.keys()); const sp = api.GetLineIDsWithType(id, W.IFCSPACE); for (let i = 0; i < sp.size(); i++) all.add(sp.get(i)); for (const k of contained.keys()) all.add(k);
    for (const eid of all) { if (/IFCBUILDINGSTOREY|IFCBUILDING$|IFCSITE|IFCOPENINGELEMENT/.test(typeName(eid))) continue;
      const cls = typeName(eid); classes[cls] = (classes[cls] ?? 0) + 1; const line = api.GetLine(id, eid); const props: IfcEl["props"] = {}; const quantities: Record<string, number> = {};
      try { const psets = await api.properties.getPropertySets(id, eid, true); for (const ps of psets ?? []) { const pn = String(val(ps.Name) ?? "Properties"); if (ps.HasProperties) { const o: Record<string, string | number | boolean> = {}; for (const p of ps.HasProperties) { const k = val(p.Name), v = val(p.NominalValue); if (k !== undefined && v !== undefined) o[String(k)] = v; } if (Object.keys(o).length) props[pn] = o; } if (ps.Quantities) for (const q of ps.Quantities) { const k = val(q.Name); const v = val(q.LengthValue) ?? val(q.AreaValue) ?? val(q.VolumeValue) ?? val(q.WeightValue) ?? val(q.CountValue); if (k !== undefined && typeof v === "number") { const isL = val(q.LengthValue) !== undefined, isA = val(q.AreaValue) !== undefined, isV = val(q.VolumeValue) !== undefined; quantities[`${pn}.${k}`] = Math.round(v * (isL ? unitScale : isA ? unitScale ** 2 : isV ? unitScale ** 3 : 1) * 1e6) / 1e6; } } } } catch { /* some elements have no property sets */ }
      let cat = catOf(cls); if (cat === "wall") cat = props["Pset_WallCommon"]?.IsExternal === true ? "wall-exterior" : "wall-interior"; if (cat === "slab-floor" && String(val(line.PredefinedType) ?? "") === "ROOF") cat = "roof";
      const sid = storeyOf(eid); const si = sid ? storeyInfo.get(sid) : undefined; if (si) si.count++;
      const sy = sysOf.get(eid); const acc = meshAcc.get(eid) ?? { pos: [], idx: [] }; let bb: IfcEl["bbox"]; if (acc.pos.length) { const mn: [number, number, number] = [Infinity, Infinity, Infinity], mx: [number, number, number] = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < acc.pos.length; k += 3) for (let q = 0; q < 3; q++) { const v = acc.pos[k + q]; if (v < mn[q]) mn[q] = v; if (v > mx[q]) mx[q] = v; } bb = { min: mn, max: mx }; }
      const el: IfcEl = { id: eid, guid: String(val(line.GlobalId) ?? ""), cls, name: String(val(line.Name) ?? val(line.LongName) ?? ""), cat, storey: si?.name, storeyId: sid, sys: sy ? systemFromName(sy.name) : undefined, systemName: sy?.name, predefined: val(line.PredefinedType) as string | undefined, props, quantities, bbox: bb, triangles: acc.idx.length / 3 };
      elements.push(el); if (opts.withMeshes !== false && acc.idx.length) meshes.push({ id: `#${eid}`, cat, sys: el.sys, level: si?.name, name: el.name || cls, pos: acc.pos, idx: acc.idx });
    }
    // tree
    const mk = (eid: number, depth: number): IfcNode => ({ id: eid, cls: typeName(eid), name: nameOf(eid), children: depth > 6 ? [] : (childrenOf.get(eid) ?? []).filter((c) => /IFCSITE|IFCBUILDING|IFCBUILDINGSTOREY|IFCSPACE/.test(typeName(c)) || false).map((c) => mk(c, depth + 1)) });
    const tree = proj.size() ? mk(proj.get(0), 0) : null;
    return { schema, project: projectName, header, lengthUnit, storeys: [...storeyInfo.values()].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0)), elements, tree, meshes, stats: { classes, elements: elements.length, triangles: Math.round(tris), bounds: Number.isFinite(bounds.min[0]) ? bounds : null }, warnings, systems: [...sysCount.values()] };
  } finally { try { api.CloseModel(id); } catch { /* ignore */ } }
}

/** Axis-aligned boxes of IFC elements for clash checks. Reported as bounding-box level. */
export function ifcClashItems(els: IfcEl[]): { arch: Item[]; mep: Item[] } {
  const arch: Item[] = [], mep: Item[] = [];
  for (const e of els) { if (!e.bbox) continue; const o = obbFromBox({ x: e.bbox.min[0], y: e.bbox.min[1], z: e.bbox.min[2] }, { x: e.bbox.max[0], y: e.bbox.max[1], z: e.bbox.max[2] }); const item: Item = { id: `#${e.id}`, cat: e.cat, tag: e.name || e.cls, group: `#${e.id}`, mep: e.cat.startsWith("mep-"), obb: o, aabb: obbAabb(o), ends: [] };
    if (item.mep) mep.push(item); else if (/^(wall|slab|roof|column|beam|stair|foundation)/.test(e.cat)) arch.push(item); }
  return { arch, mep };
}
