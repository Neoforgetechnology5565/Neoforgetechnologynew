import { parseDxf, type DxfDoc } from "./dxf";
import { analyzeDoc } from "./analysis";
import { assemble } from "./build";
import { interpretPlan } from "./plan";
import { guessMepConfig, extractMep, type MepResult } from "./mep";
import { mepMeshes } from "./mepmesh";
import { detectClashes } from "./clash";
import { ifcClashItems, readIfc, type IfcModel, type IfcEl } from "./ifcread";
import { parseSvg } from "./svg";
import { interpretRaster } from "./raster";
import { DEFAULT_SETTINGS, type MepElement, type MeshEl, type Settings } from "./model";
import { PLAN3D_LIMITATIONS, type NeedsInput, type Plan3dModel } from "./pipeline-types";
import { MeshBuilder } from "./mesh";
import { SYSTEM_LABEL } from "./mep";

export interface InFile { name: string; format: string; support: string; role: string; sample: boolean; buf: Buffer }
export function mergeSettings(raw: Partial<Settings> | Record<string, unknown> | undefined): Settings { return { ...DEFAULT_SETTINGS, ...(raw as Partial<Settings>), layerMap: { ...(raw as Partial<Settings>)?.layerMap }, overrides: { ...(raw as Partial<Settings>)?.overrides }, mep: ((raw as Partial<Settings>)?.mep ?? []) as Settings["mep"] }; }
export type Stage = (name: string, note?: string) => void;

async function loadDoc(f: InFile, st: Settings, needs: NeedsInput[], warnings: string[], rasterInfo: { v?: Plan3dModel["raster"] }): Promise<DxfDoc | null> {
  if (f.format === "dxf") return parseDxf(f.buf);
  if (f.format === "svg") { if (!st.svgUnitsPerMetre) { needs.push({ field: "svgUnitsPerMetre", question: "SVG has no real-world units. How many SVG user units equal one metre?", options: [{ label: "1000 (millimetres)", value: 1000 }, { label: "100 (centimetres)", value: 100 }, { label: "1 (metres)", value: 1 }, { label: "39.37 (inches)", value: 39.3701 }] }); } const r = parseSvg(f.buf.toString("utf8"), st.svgUnitsPerMetre); warnings.push(...r.warnings.filter((w) => !(needs.length && /no real-world units/.test(w)))); return needs.length ? null : r.doc; }
  if (f.format === "png" || f.format === "jpg") { if (!st.rasterPxPerMetre) { needs.push({ field: "rasterPxPerMetre", question: "A raster plan has no scale. How many pixels of this image equal one metre? (Measure a known wall or dimension.)" }); return null; } const r = await interpretRaster(f.buf, st.rasterPxPerMetre); warnings.push(...r.warnings); rasterInfo.v = { wallRects: r.stats.wallRects, thicknessPx: r.stats.thicknessPx, unexplainedShare: r.stats.skippedDiagonalShare }; return r.doc; }
  return null;
}
function ifcAsMep(ifc: IfcModel): MepElement[] {
  const out: MepElement[] = []; for (const e of ifc.elements) { if (!e.cat.startsWith("mep-") || !e.bbox) continue; const [x0, y0, z0] = e.bbox.min, [x1, y1, z1] = e.bbox.max; const cat = e.cat.replace("mep-", "") as MepElement["category"]; const sys = e.sys ?? (cat === "light" ? "electrical-lighting" : "equipment");
    out.push({ id: `#${e.id}`, tag: e.name || e.cls, category: cat === "equipment" || cat === "air-terminal" || cat === "light" || cat === "fitting" ? cat : cat === "duct" || cat === "pipe" || cat === "conduit" || cat === "cable-tray" ? cat : "equipment", system: sys, level: e.storey ?? "L0", path: [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }], section: { shape: "rect", w: x1 - x0, h: y1 - y0 }, size3: { x: x1 - x0, y: y1 - y0, z: z1 - z0, rotation: 0 }, props: { System: e.systemName ?? SYSTEM_LABEL[sys], "IFC class": e.cls, GlobalId: e.guid, Geometry: "axis-aligned bounding box of the IFC mesh (clash checks are bounding-box level)", ...Object.fromEntries(Object.entries(e.props).flatMap(([ps, o]) => Object.entries(o).slice(0, 12).map(([k, v]) => [`${ps}.${k}`, v as string | number]))) }, source: { origin: "ifc", note: "IFC element" }, assumed: [], connections: [] }); }
  return out;
}
function ifcSlim(ifc: IfcModel): Plan3dModel["ifc"] { return { schema: ifc.schema, project: ifc.project, lengthUnit: ifc.lengthUnit, storeys: ifc.storeys, elements: ifc.elements.map((e) => ({ ...e })), tree: ifc.tree, classes: ifc.stats.classes, triangles: ifc.stats.triangles, systems: ifc.systems }; }
const bboxMesh = (e: IfcEl): MeshEl | null => { if (!e.bbox) return null; const b = new MeshBuilder(); const [x0, y0, z0] = e.bbox.min, [x1, y1, z1] = e.bbox.max; b.obb({ c: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, ax: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2] }); return { id: `#${e.id}`, cat: e.cat, sys: e.sys, level: e.storey, name: e.name, ...b.done() }; };
void bboxMesh;

/** Full 2D-plan → 3D-model pipeline. Stages are reported as they really happen. */
export async function runPlan3d(files: InFile[], settingsRaw: Record<string, unknown>, stage: Stage, version: number): Promise<Plan3dModel> {
  const st = mergeSettings(settingsRaw as Partial<Settings>); const warnings: string[] = []; const needs: NeedsInput[] = []; const raster: { v?: Plan3dModel["raster"] } = {};
  const plan = files.find((f) => f.role === "plan"), mepF = files.find((f) => f.role === "mep");
  stage("Validating", `${files.length} file(s)`); if (!plan && !mepF) throw new Error("Upload a plan (DXF, SVG, PNG/JPG or IFC) first, or open a sample project.");
  let building: Plan3dModel["building"] = null; const meshes: MeshEl[] = []; let planAnalysis: Plan3dModel["planAnalysis"] = null; let mepAnalysis: Plan3dModel["mepAnalysis"] = null; let ifcModel: IfcModel | null = null; let planDoc: DxfDoc | null = null; const assumptions: string[] = []; 
  if (plan) {
    if (plan.format === "ifc") { stage("Parsing IFC", plan.name); ifcModel = await readIfc(plan.buf); warnings.push(...ifcModel.warnings); meshes.push(...ifcModel.meshes); }
    else {
      stage("Parsing drawing", `${plan.format.toUpperCase()} ${plan.name}`); planDoc = await loadDoc(plan, st, needs, warnings, raster);
      if (plan.format === "png" || plan.format === "jpg") assumptions.push(`Plan geometry was inferred from image pixels at ${st.rasterPxPerMetre ?? "an unconfirmed number of"} px per metre (axis-aligned thick strokes only). It is an interpretation of an image, not verified CAD geometry.`);
      if (planDoc) { planAnalysis = analyzeDoc(planDoc, st); stage("Interpreting plan", `${planAnalysis.layers.length} layers, ${Object.values(planAnalysis.entityCounts).reduce((a, b) => a + b, 0)} entities`); const res = assemble(interpretPlan(planDoc, st), st); building = res.building; stage("Generating 3D geometry", `${building.stats.walls} walls, ${building.stats.rooms} rooms`); meshes.push(...res.meshes); assumptions.push(...building.assumptions); warnings.push(...building.warnings); }
    }
  }
  // MEP
  let mep: MepResult | null = null; let mepConfig = st.mep; let guessed = false; let mepSource: "dxf" | "ifc" | "none" = "none"; let mepDoc: DxfDoc | null = null; let mepIfcElements: MepElement[] = [];
  if (mepF) {
    if (mepF.format === "ifc") { stage("Reading MEP IFC", mepF.name); const m = await readIfc(mepF.buf); warnings.push(...m.warnings); ifcModel ??= m; if (ifcModel !== m) { meshes.push(...m.meshes.filter((x) => x.cat.startsWith("mep-"))); ifcModel.elements.push(...m.elements.filter((e) => e.cat.startsWith("mep-"))); } mepIfcElements = ifcAsMep(m); mepSource = "ifc"; }
    else { mepDoc = parseDxf(mepF.buf); mepAnalysis = analyzeDoc(mepDoc, st); }
  } else if (planDoc && plan?.format === "dxf") { const g = guessMepConfig(Object.keys(planDoc.layers)); if (g.length) { mepDoc = planDoc; } }
  if (!mepF && ifcModel && plan?.format === "ifc") { mepIfcElements = ifcAsMep(ifcModel); if (mepIfcElements.length) mepSource = "ifc"; }
  if (mepDoc) { if (!mepConfig.length) { mepConfig = guessMepConfig(Object.keys(mepDoc.layers)); guessed = true; } if (mepConfig.length) { stage("Extracting MEP", `${mepConfig.length} configured layers`); mep = extractMep(mepDoc, mepConfig, st); warnings.push(...mep.warnings); assumptions.push(...mep.assumptions); mepSource = "dxf"; if (guessed) warnings.push("MEP layer configuration was GUESSED from layer names (elevations and sizes are defaults). Review it in the MEP configuration."); } else warnings.push("No MEP layers were recognised. Configure the layer mapping to create MEP geometry."); }
  const mepEls = mep?.elements ?? mepIfcElements;
  stage("Meshing", `${meshes.length} architectural + ${mepEls.length} MEP elements`); if (mep) meshes.push(...mepMeshes(mep.elements));
  // clashes
  stage("Clash detection"); const extra = ifcModel ? ifcClashItems(ifcModel.elements) : undefined; const cl = detectClashes(building, mep ? mep.elements : [], st, ifcModel ? { arch: extra!.arch, mep: mep ? [] : extra!.mep } : undefined);
  stage("Packaging");
  const model: Plan3dModel = { kind: "plan3d", generatedAt: Date.now(), version, sample: files.every((f) => f.sample), inputs: { plan: plan && { name: plan.name, format: plan.format, support: plan.support }, mep: mepF && { name: mepF.name, format: mepF.format, support: mepF.support } }, settings: st, needsInput: needs, building, planAnalysis, mepAnalysis: mepAnalysis ?? (mepDoc && mepDoc === planDoc ? planAnalysis : null), raster: raster.v,
    mep: { elements: mepEls, networks: mep?.networks ?? [], config: mepConfig, guessed, annotationsUsed: mep?.annotationsUsed ?? 0, source: mepSource }, ifc: ifcModel ? ifcSlim(ifcModel) : null, meshes, clashes: cl.clashes, clashInfo: { tested: cl.tested, method: cl.method, clearance: st.clearance, tolerance: st.clashTolerance, level: ifcModel && !mep ? "bounding-box (IFC)" : "geometry" },
    warnings: [...new Set(warnings)], assumptions: [...new Set(assumptions)], limitations: PLAN3D_LIMITATIONS, provenance: { architecture: plan ? `${plan.format.toUpperCase()} file "${plan.name}"${plan.sample ? " (sample project)" : " (user upload)"}` : "none", mep: mepF ? `${mepF.format.toUpperCase()} file "${mepF.name}"${mepF.sample ? " (sample)" : " (user upload)"}` : mepSource === "dxf" ? "layers inside the plan file" : mepSource === "ifc" ? "IFC model" : "none" } };
  return model;
}
