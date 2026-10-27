/** Demonstration 2: CAD drawing analysis & conversion. */
import { parseDxf, type DxfDoc } from "../dxf";
import { parseSvg } from "../svg";
import { analyzeCad, CAD_LIMITATIONS, convertCad, type CadFormat } from "../cadanalysis";
import type { InFile, Stage } from "../pipeline";
import { ROLE_PALETTE } from "./palette";
import { r2, r3, type AnalysisModel, type Issue, type Preview2d, type Table } from "./types";

export const CAD_FORMATS: Record<CadFormat, { label: string; note: string }> = {
  svg: { label: "SVG (vector)", note: "Layers become SVG groups; coordinates are in millimetres, Y flipped for screen. Text is kept as text." },
  geojson: { label: "GeoJSON", note: "LineString/Polygon features with layer and DXF handle; coordinates are metres in the drawing's own coordinate system (not georeferenced)." },
  csv: { label: "Entity table (CSV)", note: "One row per measurable entity with layer, length, area and vertices." },
  "dxf-clean": { label: "Cleaned DXF (R12 ASCII)", note: "Blocks exploded, duplicates and zero-length items removed; units written to $INSUNITS." },
  json: { label: "Analysis (JSON)", note: "Complete analysis result including issues and totals." },
};

export async function loadCadDoc(f: InFile, svgUnitsPerMetre?: number): Promise<{ doc: DxfDoc | null; need?: AnalysisModel["needsInput"][number]; warnings: string[] }> {
  if (f.format === "dxf") return { doc: parseDxf(f.buf), warnings: [] };
  if (f.format === "svg") {
    if (!svgUnitsPerMetre) return { doc: null, warnings: [], need: { field: "svgUnitsPerMetre", question: "SVG has no real-world units. How many SVG user units equal one metre?", options: [{ label: "1000 (millimetres)", value: 1000 }, { label: "100 (centimetres)", value: 100 }, { label: "1 (metres)", value: 1 }] } };
    const r = parseSvg(f.buf.toString("utf8"), svgUnitsPerMetre); return { doc: r.doc, warnings: r.warnings };
  }
  throw new Error(`${f.format.toUpperCase()} is not supported in this application. Upload an ASCII DXF or an SVG${f.format === "dwg" ? " (convert the DWG to DXF first)" : ""}.`);
}

export async function runCadAnalysis(files: InFile[], settings: Record<string, unknown>, stage: Stage, version: number): Promise<AnalysisModel> {
  const f = files.find((x) => x.role === "drawing" || x.role === "plan"); stage("Validating", `${files.length} file(s)`); if (!f) throw new Error("Upload a DXF or SVG drawing, or open a sample.");
  stage("Parsing drawing", `${f.format.toUpperCase()} ${f.name}`); const { doc, need, warnings: lw } = await loadCadDoc(f, settings.svgUnitsPerMetre as number | undefined);
  const base = { kind: "analysis" as const, demo: "cad-analysis" as const, generatedAt: Date.now(), version, sample: files.every((x) => x.sample), inputs: [{ name: f.name, format: f.format, support: f.support, role: f.role }], limitations: CAD_LIMITATIONS, provenance: `${f.format.toUpperCase()} file "${f.name}"${f.sample ? " (sample project)" : " (user upload)"}` };
  if (!doc) return { ...base, ext: { demo: "cad-analysis", headline: [], tables: [], issues: [], params: settings, notes: [] }, meshes: [], elements: {}, needsInput: need ? [need] : [], warnings: [], assumptions: [] };
  const p = (settings.params ?? {}) as { outUnit?: "mm" | "m" }; void p;
  stage("Analysing geometry", "layers, entities, units"); const m = analyzeCad(doc, { unitsOverride: settings.unitsOverride as number | undefined }, { name: f.name, format: f.format }, base.sample, version);
  stage("Validating geometry", `${m.issues.length} finding(s)`);
  const a = m.analysis; const ex = a.extents; const lenTotal = Object.values(m.totals.lengthByLayer).reduce((s, v) => s + v, 0); const areaTotal = Object.values(m.totals.closedAreaByLayer).reduce((s, v) => s + v, 0);
  const tables: Table[] = [
    { id: "layers", title: "Layers", columns: ["Layer", "Entities", "Types", "Total length (m)", "Closed area (m²)", "ACI colour", "Off/frozen"], rows: a.layers.map((l) => [l.name, l.entities, Object.entries(l.types).map(([k, v]) => `${k}×${v}`).join(", "), r2(m.totals.lengthByLayer[l.name] ?? 0), r2(m.totals.closedAreaByLayer[l.name] ?? 0), l.color, l.off ? "yes" : ""]) },
    { id: "types", title: "Entity types", columns: ["Type", "Count"], rows: Object.entries(a.entityCounts).sort((x, y) => y[1] - x[1]) },
    { id: "blocks", title: "Blocks", columns: ["Block", "Entities", "Inserts"], rows: a.blocks.map((b) => [b.name, b.entities, b.inserts]), note: "Blocks are exploded for measurement; insert scale and rotation are applied." },
    { id: "texts", title: "Text and annotation", columns: ["Text", "Layer", "X (m)", "Y (m)"], rows: a.texts.slice(0, 300).map((t) => [t.text, t.layer, r2(t.x), r2(t.y)]), note: a.texts.length > 300 ? `First 300 of ${a.texts.length}.` : undefined },
    { id: "entities", title: "Measured entities", columns: ["Entity", "Type", "Layer", "Length (m)", "Area (m²)", "Vertices", "Handle"], rows: m.entities.slice(0, 1500).map((e) => [e.id, e.type, e.layer, e.length, e.area ?? null, e.vertices, e.handle ?? null]), note: m.entities.length > 1500 ? `First 1500 of ${m.entities.length}; the CSV export contains all.` : undefined },
  ];
  const issues: Issue[] = m.issues.map((i) => ({ id: i.id, severity: i.severity, rule: i.type, title: `${i.type} (${i.layer})`, detail: i.message, element: i.handle, location: i.at ? [i.at.x, i.at.y] : undefined }));
  const layers: Preview2d["layers"] = Object.entries(a.geometry).map(([name, ps], i) => ({ name, color: ROLE_PALETTE[i % ROLE_PALETTE.length], paths: ps }));
  const preview2d: Preview2d | undefined = ex ? { extents: { x0: ex.x0, y0: ex.y0, x1: ex.x1, y1: ex.y1 }, layers, marks: m.issues.filter((i) => i.at).slice(0, 80).map((i) => ({ x: i.at!.x, y: i.at!.y, label: i.type, severity: i.severity })) } : undefined;
  const headline = [{ label: "Entities", value: m.entities.length }, { label: "Layers", value: a.layers.length }, { label: "Extents", value: ex ? `${r2(ex.width)} × ${r2(ex.height)} m` : "—" }, { label: "Units", value: a.units.name + (a.units.declared ? "" : " (assumed)") }, { label: "Total length", value: `${r2(lenTotal)} m` }, { label: "Closed area", value: `${r2(areaTotal)} m²` }, { label: "Findings", value: `${issues.filter((i) => i.severity !== "info").length} (+${issues.filter((i) => i.severity === "info").length} info)` }];
  const assumptions: string[] = []; if (!a.units.declared) assumptions.push(`Units not declared in the file: ${a.units.name} was assumed. Check the extents against a known dimension.`); if (f.format === "svg") assumptions.push(`SVG scale: ${settings.svgUnitsPerMetre} user units per metre (supplied by the user).`);
  stage("Packaging"); void r3;
  return { ...base, ext: { demo: "cad-analysis", headline, tables, issues, params: settings, notes: [`${m.entities.length} measurable entities of ${Object.values(a.entityCounts).reduce((s, v) => s + v, 0)} total.`], extra: { units: a.units, dimensions: a.dimensions } }, preview2d, meshes: [], elements: {}, needsInput: [], warnings: [...m.warnings, ...lw], assumptions };
}
export async function cadExport(format: CadFormat, f: InFile, settings: Record<string, unknown>, model: AnalysisModel) {
  const { doc } = await loadCadDoc(f, settings.svgUnitsPerMetre as number | undefined); if (!doc) throw new Error("The drawing could not be loaded.");
  if (format === "json") return { buf: Buffer.from(JSON.stringify({ ...model, preview2d: undefined }, null, 2)), mime: "application/json", ext: "json", report: undefined };
  return convertCad(doc, format, { unitsOverride: settings.unitsOverride as number | undefined });
}
