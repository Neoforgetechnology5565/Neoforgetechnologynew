/**
 * IFC4 (STEP) writer. Produces an authored model, not a mesh dump: project / site / building / storeys, walls with voids and filled doors/windows,
 * slabs, spaces with base quantities, columns, stairs and MEP distribution elements assigned to distribution systems.
 * Geometry is represented as swept solids (extruded profiles). Every element carries a provenance property set (source layer, handle, assumed values).
 * Not preserved: curved walls, wall joins as boolean unions (walls overlap at corners), door swing/leaf detail, materials and layer sets.
 */
import { createHash } from "node:crypto";
import type { Building, MepElement, MepSystem } from "./model";
import { LINEAR } from "./mep";

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
export function ifcGuid(seed: string): string { const h = createHash("sha1").update(seed).digest(); let n = 0n; for (let i = 0; i < 16; i++) n = (n << 8n) | BigInt(h[i]); let s = B64[Number(n >> 126n)]; for (let i = 20; i >= 0; i--) s += B64[Number((n >> BigInt(i * 6)) & 63n)]; return s; }
const f = (v: number) => { const s = (Math.round(v * 1e6) / 1e6).toString(); return /[.eE]/.test(s) ? s : s + "."; };
const str = (s: unknown) => `'${String(s ?? "").replace(/'/g, "''").replace(/\\/g, "\\\\").replace(/[^\x20-\x7e]/g, (c) => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}\\X0\\`)}'`;
const SYS_ENUM: Record<MepSystem, string> = { "supply-air": "VENTILATION", "return-air": "VENTILATION", "exhaust-air": "VENTILATION", "water-cold": "DOMESTICCOLDWATER", "water-hot": "DOMESTICHOTWATER", drainage: "DRAINAGE", vent: "VENTILATION", "fire-protection": "FIREPROTECTION", "electrical-power": "ELECTRICAL", "electrical-lighting": "LIGHTING", "cable-tray": "ELECTRICAL", "mechanical-pipe": "NOTDEFINED", equipment: "AIRCONDITIONING" };

export function writeIfc(b: Building, mep: MepElement[], opts: { name?: string; source?: string } = {}): { text: string; counts: Record<string, number> } {
  const lines: string[] = []; let n = 0; const counts: Record<string, number> = {};
  const E = (s: string) => { n++; lines.push(`#${n}= ${s};`); const k = s.slice(0, s.indexOf("(")); counts[k] = (counts[k] ?? 0) + 1; return n; };
  const P3 = (x: number, y: number, z: number) => E(`IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}))`); const P2 = (x: number, y: number) => E(`IFCCARTESIANPOINT((${f(x)},${f(y)}))`); const D3 = (x: number, y: number, z: number) => E(`IFCDIRECTION((${f(x)},${f(y)},${f(z)}))`);
  const A3 = (loc: [number, number, number], axis?: [number, number, number], ref?: [number, number, number]) => E(`IFCAXIS2PLACEMENT3D(#${P3(...loc)},${axis ? "#" + D3(...axis) : "$"},${ref ? "#" + D3(...ref) : "$"})`);
  const LP = (rel: number | null, ax: number) => E(`IFCLOCALPLACEMENT(${rel ? "#" + rel : "$"},#${ax})`);
  const nowS = Math.floor(Date.now() / 1000);
  const origin = A3([0, 0, 0]); const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${origin},$)`); const body = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${ctx},$,.MODEL_VIEW.,$)`);
  const uL = E(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`), uA = E(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`), uV = E(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`), uR = E(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`); const units = E(`IFCUNITASSIGNMENT((#${uL},#${uA},#${uV},#${uR}))`);
  const project = E(`IFCPROJECT('${ifcGuid("project")}',$,${str(opts.name ?? "Neo Forge project")},${str(opts.source ? `Generated from ${opts.source}` : "")},$,$,$,(#${ctx}),#${units})`);
  const sitePl = LP(null, A3([0, 0, 0])); const site = E(`IFCSITE('${ifcGuid("site")}',$,'Site',$,$,#${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = LP(sitePl, A3([0, 0, 0])); const bld = E(`IFCBUILDING('${ifcGuid("building")}',$,${str(opts.name ?? "Building")},$,$,#${bldPl},$,$,.ELEMENT.,$,$,$)`);
  E(`IFCRELAGGREGATES('${ifcGuid("agg-project")}',$,$,$,#${project},(#${site}))`); E(`IFCRELAGGREGATES('${ifcGuid("agg-site")}',$,$,$,#${site},(#${bld}))`);
  const storeys = new Map<string, { id: number; pl: number; elev: number; els: number[]; spaces: number[] }>();
  for (const lv of b.levels) { const pl = LP(bldPl, A3([0, 0, lv.elevation])); const id = E(`IFCBUILDINGSTOREY('${ifcGuid("storey-" + lv.id)}',$,${str(lv.name)},$,$,#${pl},$,$,.ELEMENT.,${f(lv.elevation)})`); storeys.set(lv.id, { id, pl, elev: lv.elevation, els: [], spaces: [] }); }
  E(`IFCRELAGGREGATES('${ifcGuid("agg-building")}',$,$,$,#${bld},(${[...storeys.values()].map((s) => "#" + s.id).join(",")}))`);
  const rep = (solid: number) => { const r = E(`IFCSHAPEREPRESENTATION(#${body},'Body','SweptSolid',(#${solid}))`); return E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${r}))`); };
  const rectSolid = (w: number, h: number, depth: number, pos?: number) => { const prof = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${E(`IFCAXIS2PLACEMENT2D(#${P2(0, 0)},$)`)},${f(w)},${f(h)})`); return E(`IFCEXTRUDEDAREASOLID(#${prof},#${pos ?? A3([0, 0, 0])},#${D3(0, 0, 1)},${f(depth)})`); };
  const circSolid = (r: number, depth: number) => { const prof = E(`IFCCIRCLEPROFILEDEF(.AREA.,$,#${E(`IFCAXIS2PLACEMENT2D(#${P2(0, 0)},$)`)},${f(r)})`); return E(`IFCEXTRUDEDAREASOLID(#${prof},#${A3([0, 0, 0])},#${D3(0, 0, 1)},${f(depth)})`); };
  const polySolid = (poly: { x: number; y: number }[], depth: number) => { const pts = poly.map((p) => P2(p.x, p.y)); const pl = E(`IFCPOLYLINE((${[...pts, pts[0]].map((i) => "#" + i).join(",")}))`); const prof = E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${pl})`); return E(`IFCEXTRUDEDAREASOLID(#${prof},#${A3([0, 0, 0])},#${D3(0, 0, 1)},${f(depth)})`); };
  const pset = (el: number, name: string, props: Record<string, string | number | boolean | undefined>, seed: string) => { const ids = Object.entries(props).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => E(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${typeof v === "number" ? `IFCREAL(${f(v)})` : typeof v === "boolean" ? `IFCBOOLEAN(${v ? ".T." : ".F."})` : `IFCTEXT(${str(v)})`},$)`)); if (!ids.length) return; const ps = E(`IFCPROPERTYSET('${ifcGuid(seed + name)}',$,${str(name)},$,(${ids.map((i) => "#" + i).join(",")}))`); E(`IFCRELDEFINESBYPROPERTIES('${ifcGuid(seed + name + "rel")}',$,$,$,(#${el}),#${ps})`); };
  const qto = (el: number, q: Record<string, [number, "L" | "A" | "V"]>, seed: string) => { const ids = Object.entries(q).map(([k, [v, t]]) => E(t === "L" ? `IFCQUANTITYLENGTH(${str(k)},$,$,${f(v)},$)` : t === "A" ? `IFCQUANTITYAREA(${str(k)},$,$,${f(v)},$)` : `IFCQUANTITYVOLUME(${str(k)},$,$,${f(v)},$)`)); const eq = E(`IFCELEMENTQUANTITY('${ifcGuid(seed + "q")}',$,'BaseQuantities',$,$,(${ids.map((i) => "#" + i).join(",")}))`); E(`IFCRELDEFINESBYPROPERTIES('${ifcGuid(seed + "qrel")}',$,$,$,(#${el}),#${eq})`); };
  const prov = (el: number, o: { origin: string; layer?: string; handle?: string; note?: string }, assumed: string[], level: string, seed: string) => pset(el, "NeoForge_Provenance", { Origin: o.origin, SourceLayer: o.layer, SourceHandle: o.handle, Note: o.note, AssumedValues: assumed.join("; "), Level: level }, seed);
  const add = (lv: string, id: number) => storeys.get(lv)!.els.push(id);
  const unit = (dx: number, dy: number) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l] as const; };

  for (const w of b.walls) {
    const st = storeys.get(w.level)!; const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); const [ux, uy] = unit(w.b.x - w.a.x, w.b.y - w.a.y); const cx = (w.a.x + w.b.x) / 2, cy = (w.a.y + w.b.y) / 2;
    const pl = LP(st.pl, A3([cx, cy, 0], [0, 0, 1], [ux, uy, 0])); const wall = E(`IFCWALL('${ifcGuid("wall" + w.id)}',$,${str(w.id)},${str(`${w.kind} wall`)},$,#${pl},#${rep(rectSolid(L, w.thickness, w.height))},${str(w.id)},.STANDARD.)`); add(w.level, wall);
    prov(wall, w.source, w.assumed, w.level, w.id); qto(wall, { Length: [L, "L"], Width: [w.thickness, "L"], Height: [w.height, "L"], GrossSideArea: [L * w.height, "A"] }, w.id);
    pset(wall, "Pset_WallCommon", { IsExternal: w.kind === "exterior", Reference: w.id }, w.id);
    for (const o of w.openings) {
      const opl = LP(pl, A3([o.s - L / 2, 0, o.sill])); const op = E(`IFCOPENINGELEMENT('${ifcGuid("open" + o.id)}',$,${str(o.id + "-opening")},$,$,#${opl},#${rep(rectSolid(o.width, w.thickness * 1.2, o.height))},$,.OPENING.)`); E(`IFCRELVOIDSELEMENT('${ifcGuid("void" + o.id)}',$,$,$,#${wall},#${op})`);
      if (o.kind === "opening") continue; const fl = E(`IFCLOCALPLACEMENT(#${pl},#${A3([o.s - L / 2, 0, o.sill])})`); const geo = rep(rectSolid(o.width - 0.06, o.kind === "door" ? 0.04 : 0.03, o.height - 0.02, A3([0, 0, 0.01])));
      const el = o.kind === "door" ? E(`IFCDOOR('${ifcGuid("door" + o.id)}',$,${str(o.id)},$,$,#${fl},#${geo},${str(o.id)},${f(o.height)},${f(o.width)},.DOOR.,.NOTDEFINED.,$)`) : E(`IFCWINDOW('${ifcGuid("win" + o.id)}',$,${str(o.id)},$,$,#${fl},#${geo},${str(o.id)},${f(o.height)},${f(o.width)},.WINDOW.,.NOTDEFINED.,$)`);
      E(`IFCRELFILLSELEMENT('${ifcGuid("fill" + o.id)}',$,$,$,#${op},#${el})`); add(w.level, el); prov(el, o.source, o.assumed, w.level, o.id); pset(el, o.kind === "door" ? "Pset_DoorCommon" : "Pset_WindowCommon", { Reference: o.id }, o.id);
    }
  }
  for (const s of b.slabs) { const st = storeys.get(s.level)!; const pl = LP(st.pl, A3([0, 0, s.z - st.elev])); const sl = E(`IFCSLAB('${ifcGuid("slab" + s.id)}',$,${str(s.id)},${str(s.kind + " slab")},$,#${pl},#${rep(polySolid(s.polygon, s.thickness))},${str(s.id)},.${s.kind === "roof" ? "ROOF" : "FLOOR"}.)`); add(s.level, sl); prov(sl, s.source, s.assumed, s.level, s.id); }
  for (const r of b.rooms) { const st = storeys.get(r.level)!; const pl = LP(st.pl, A3([0, 0, 0])); const h = b.levels.find((l) => l.id === r.level)!.height; const sp = E(`IFCSPACE('${ifcGuid("space" + r.id)}',$,${str(r.name)},${str(r.id)},$,#${pl},#${rep(polySolid(r.polygon, h))},${str(r.name)},.ELEMENT.,.INTERNAL.,$)`); storeys.get(r.level)!.spaces.push(sp); qto(sp, { NetFloorArea: [r.area, "A"], GrossFloorArea: [r.grossArea, "A"], NetPerimeter: [r.perimeter, "L"], Height: [h, "L"] }, r.id); prov(sp, r.source, [], r.level, r.id); pset(sp, "NeoForge_Room", { NameSource: r.nameSource, NetAreaValid: r.netValid }, r.id); }
  for (const c of b.columns) { const st = storeys.get(c.level)!; const pl = LP(st.pl, A3([c.c.x, c.c.y, 0])); const el = E(`IFCCOLUMN('${ifcGuid("col" + c.id)}',$,${str(c.id)},$,$,#${pl},#${rep(c.round ? circSolid(c.w / 2, c.height) : rectSolid(c.w, c.d, c.height))},${str(c.id)},.COLUMN.)`); add(c.level, el); prov(el, c.source, c.assumed, c.level, c.id); }
  for (const s of b.stairs) { const st = storeys.get(s.level)!; const pl = LP(st.pl, A3([0, 0, 0])); const el = E(`IFCSTAIR('${ifcGuid("stair" + s.id)}',$,${str(s.id)},${str("Simplified stair: footprint block, not individual treads")},$,#${pl},#${rep(polySolid(s.polygon, s.rise))},${str(s.id)},.STRAIGHT_RUN_STAIR.)`); add(s.level, el); prov(el, s.source, s.assumed, s.level, s.id); pset(el, "NeoForge_Stair", { Treads: s.treads, TotalRise: s.rise, Width: s.width }, s.id); }
  // MEP
  const sysGroups = new Map<MepSystem, number[]>(); const lvl0 = b.levels[0]?.id ?? "L0";
  for (const e of mep) {
    const lvId = storeys.has(e.level) ? e.level : lvl0; const st = storeys.get(lvId)!; const z = (e.path[0]?.z ?? 0) - st.elev; let ent: number | null = null; const tag = str(e.tag);
    if (LINEAR.includes(e.category)) {
      for (let i = 0; i + 1 < e.path.length; i++) {
        const a = e.path[i], c = e.path[i + 1]; const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z; const Lg = Math.hypot(dx, dy, dz); if (Lg < 1e-6) continue; const ax: [number, number, number] = [dx / Lg, dy / Lg, dz / Lg]; let ref: [number, number, number] = [-ax[1], ax[0], 0]; const rl = Math.hypot(ref[0], ref[1]); ref = rl < 1e-6 ? [1, 0, 0] : [ref[0] / rl, ref[1] / rl, 0];
        const pl = LP(st.pl, A3([a.x, a.y, a.z - st.elev], ax, ref)); const solid = e.section.shape === "round" ? circSolid(e.section.w / 2, Lg) : rectSolid(e.section.w, e.section.h, Lg); const sid = `${e.id}-${i}`;
        const cls = e.category === "duct" ? `IFCDUCTSEGMENT('${ifcGuid("mep" + sid)}',$,${str(e.tag)},${str(e.props.System)},$,#${pl},#${rep(solid)},${tag},.RIGIDSEGMENT.)` : e.category === "pipe" ? `IFCPIPESEGMENT('${ifcGuid("mep" + sid)}',$,${str(e.tag)},${str(e.props.System)},$,#${pl},#${rep(solid)},${tag},.RIGIDSEGMENT.)` : `IFCCABLECARRIERSEGMENT('${ifcGuid("mep" + sid)}',$,${str(e.tag)},${str(e.props.System)},$,#${pl},#${rep(solid)},${tag},.${e.category === "cable-tray" ? "CABLETRAYSEGMENT" : "CONDUITSEGMENT"}.)`;
        const el = E(cls); ent = el; add(lvId, el); (sysGroups.get(e.system) ?? sysGroups.set(e.system, []).get(e.system)!).push(el);
        const nm = { System: String(e.props.System), Category: e.category, Shape: e.section.shape, ...(e.section.shape === "rect" ? { WidthMm: e.section.w * 1000, HeightMm: e.section.h * 1000 } : { DiameterMm: e.section.w * 1000 }), ElevationStartM: a.z, ElevationEndM: c.z, SegmentLengthM: Lg, NetworkId: e.networkId, ElementId: e.id };
        pset(el, "NeoForge_MEP", nm, sid); prov(el, e.source, e.assumed, lvId, sid); qto(el, { Length: [Lg, "L"] }, sid);
      }
    } else {
      const s = e.size3 ?? { x: e.section.w, y: e.section.h, z: 0.15, rotation: 0 }; const pl = LP(st.pl, A3([e.path[0].x, e.path[0].y, z - s.z / 2], [0, 0, 1], [Math.cos(s.rotation), Math.sin(s.rotation), 0])); const solid = e.section.shape === "round" ? circSolid(s.x / 2, s.z) : rectSolid(s.x, s.y, s.z); const g = `'${ifcGuid("mep" + e.id)}',$,${str(e.tag)},${str(e.props.System)},$,#${pl},#${rep(solid)},${tag}`;
      const cls = e.category === "equipment" ? `IFCUNITARYEQUIPMENT(${g},.AIRHANDLER.)` : e.category === "air-terminal" ? `IFCAIRTERMINAL(${g},.${/grille/i.test(String(e.props.Layer)) || e.system === "return-air" ? "GRILLE" : "DIFFUSER"}.)` : e.category === "light" ? `IFCLIGHTFIXTURE(${g},.NOTDEFINED.)` : e.category === "fitting" ? (/pipe|water|drain|vent/.test(e.system) ? `IFCPIPEFITTING(${g},.${e.props["Fitting type"] === "tee" ? "JUNCTION" : "BEND"}.)` : `IFCDUCTFITTING(${g},.${e.props["Fitting type"] === "tee" ? "JUNCTION" : "BEND"}.)`) : `IFCFLOWTERMINAL(${g},.NOTDEFINED.)`;
      const el = E(cls); ent = el; add(lvId, el); (sysGroups.get(e.system) ?? sysGroups.set(e.system, []).get(e.system)!).push(el);
      pset(el, "NeoForge_MEP", { System: String(e.props.System), Category: e.category, PlanSizeMm: String(e.props["Plan size (mm)"] ?? ""), HeightMm: s.z * 1000, ElevationCentreM: e.path[0].z, ElementId: e.id, ...Object.fromEntries(Object.entries(e.props).filter(([k]) => k === "Equipment identifier" || k === "Fitting type" || k === "Note")) }, e.id); prov(el, e.source, e.assumed, lvId, e.id);
    }
    void ent;
  }
  for (const [sys, els] of sysGroups) { const g = E(`IFCDISTRIBUTIONSYSTEM('${ifcGuid("sys" + sys)}',$,${str(sys)},$,$,$,.${SYS_ENUM[sys]}.)`); E(`IFCRELASSIGNSTOGROUP('${ifcGuid("grp" + sys)}',$,$,$,(${els.map((i) => "#" + i).join(",")}),$,#${g})`); }
  for (const [lv, s] of storeys) if (s.spaces.length) E(`IFCRELAGGREGATES('${ifcGuid("aggsp" + lv)}',$,$,$,#${s.id},(${s.spaces.map((i) => "#" + i).join(",")}))`);
  for (const [lv, s] of storeys) if (s.els.length) E(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid("contain" + lv)}',$,$,$,(${s.els.map((i) => "#" + i).join(",")}),#${s.id})`);
  const header = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME(${str((opts.name ?? "model") + ".ifc")},'${new Date(nowS * 1000).toISOString().slice(0, 19)}',(''),(''),'Neo Forge BIM suite','Neo Forge BIM suite','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n`;
  return { text: header + lines.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n", counts };
}
