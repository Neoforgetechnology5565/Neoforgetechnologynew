/** Exports for every demonstration. The format list is derived from what the stored result can really produce. */
import { EXPORT_INFO, makeExport, type ExportFormat } from "../exports";
import { writeDxf } from "../dxf";
import { writeGlb } from "../glb";
import { writeIfc } from "../ifcwrite";
import type { Building } from "../model";
import { writePdf } from "../pdf";
import type { InFile } from "../pipeline";
import { cadExport, CAD_FORMATS } from "./cad";
import { cleanedCloud } from "./cloud";
import { extHtml, extPdfLines, issuesCsv, tableCsv, type ReportMeta } from "./report";
import { isPlan3d, type AnyModel } from "./index";
import type { DemoKey } from "../suite-keys";
import { writeLas, writePlyAscii, writeXyz } from "../pointcloud";
import type { CadFormat } from "../cadanalysis";
import type { Ext } from "./types";

export interface ExportItem { format: string; label: string; note: string }
export interface ExportCtx { demo: DemoKey; model: AnyModel; name: string; files: InFile[]; settings: Record<string, unknown> }
const fileMeta = (files: InFile[]) => files.map((f) => ({ name: f.name, format: f.format, sample: f.sample, size: f.buf.length }));
const metaOf = (c: ExportCtx, title: string): ReportMeta => ({ title, project: c.name, sourceFiles: fileMeta(c.files), sample: c.model.sample, assumptions: isPlan3d(c.model) ? [...c.model.assumptions, ...(c.model.building?.assumptions ?? [])] : c.model.assumptions, warnings: c.model.warnings, limitations: isPlan3d(c.model) ? c.model.limitations : c.model.limitations });
const REPORT_TITLE: Record<DemoKey, string> = { plan3d: "Plan to 3D project report", "cad-analysis": "CAD drawing analysis report", "bim-viewer": "BIM model information report", "point-cloud": "Point cloud analysis report", interop: "Interoperability and conversion report", floorplan: "Floor plan analysis report", structural: "Structural drawing analysis report", mep: "MEP coordination report", "bim-qc": "BIM quality control report", qto: "Quantity take-off and cost estimate", collab: "Model review report" };

function available(m: AnyModel): Set<ExportFormat> {
  const out = new Set<ExportFormat>(); if (!isPlan3d(m)) return out;
  if (m.building) ["ifc", "dxf", "csv-rooms", "csv-walls", "csv-openings"].forEach((f) => out.add(f as ExportFormat)); if (m.meshes.length) out.add("glb"); if (m.mep.elements.length) out.add("csv-mep"); if (m.ifc) out.add("csv-ifc-elements"); out.add("csv-clashes"); return out;
}
export function listDemoExports(demo: DemoKey, m: AnyModel): ExportItem[] {
  const L: ExportItem[] = [];
  if (demo === "plan3d" && isPlan3d(m)) return Object.entries(EXPORT_INFO).map(([k, v]) => ({ format: k, label: v.label, note: v.note }));
  if (isPlan3d(m)) for (const f of available(m)) L.push({ format: f, label: EXPORT_INFO[f].label, note: EXPORT_INFO[f].note });
  if (demo === "cad-analysis") for (const [k, v] of Object.entries(CAD_FORMATS)) L.push({ format: `cad-${k}`, label: v.label, note: v.note });
  if (demo === "point-cloud" && !isPlan3d(m)) { L.push({ format: "cloud-ply", label: "Cleaned, reduced cloud (PLY)", note: "Outliers removed and voxel-reduced with the parameters used; ASCII PLY." }, { format: "cloud-xyz", label: "Cleaned, reduced cloud (XYZ)", note: "Space-separated x y z (and r g b)." }, { format: "cloud-las", label: "Cleaned, reduced cloud (LAS 1.2)", note: "Point format 2, 1 mm scale, uncompressed." }, { format: "cloud-dxf", label: "Plane traces (DXF)", note: "Plan-view traces of the vertical planes, in metres, on layer SCAN-VERTICAL." }); if (m.data?.building) L.push({ format: "cloud-ifc", label: "Scan-to-BIM draft (IFC4)", note: "Walls, slab and space of the detected rectangular room; thickness is assumed." }, { format: "cloud-glb", label: "Scan-to-BIM draft (GLB)", note: "Draft wall geometry." }); }
  if (demo === "structural" && !isPlan3d(m) && m.meshes.length) L.push({ format: "glb", label: "Structural extract (GLB)", note: "Extruded columns, beams and footings under the stated assumptions." });
  for (const t of m.ext?.tables ?? []) L.push({ format: `table-${t.id}`, label: `${t.title} (CSV)`, note: t.note ?? "" });
  if (m.ext) L.push({ format: "issues-csv", label: "Findings (CSV)", note: "All findings with severity, rule, element and location." });
  L.push({ format: "report-pdf", label: "Report (PDF)", note: "Summary, tables (first rows), findings, assumptions, limitations." }, { format: "report-html", label: "Report (HTML)", note: "Complete tables, findings, assumptions and limitations." }, { format: "json", label: "Result data (JSON)", note: "Complete analysis result; render meshes omitted." });
  return L;
}
const strip = (m: AnyModel) => { const c = { ...m } as Record<string, unknown>; delete c.meshes; delete c.cloud; delete c.preview2d; return c; };
export async function makeDemoExport(format: string, c: ExportCtx): Promise<{ buf: Buffer; mime: string; fileName: string }> {
  const base = c.name.replace(/[^\w.-]+/g, "_").slice(0, 40) || "project"; const m = c.model; const ext: Ext | undefined = m.ext; const mk = (buf: Buffer | string, mime: string, e: string, tag = "") => ({ buf: Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8"), mime, fileName: `${base}${tag}.${e}` });
  if (c.demo === "plan3d" && isPlan3d(m) && format in EXPORT_INFO) return makeExport(format as ExportFormat, m, c.name, fileMeta(c.files));
  if (format === "report-pdf") { if (!ext) throw new Error("No analysis to report."); return mk(writePdf(`${base} - report`, extPdfLines(ext, metaOf(c, REPORT_TITLE[c.demo]))), "application/pdf", "pdf", "-report"); }
  if (format === "report-html") { if (!ext) throw new Error("No analysis to report."); return mk(extHtml(ext, metaOf(c, REPORT_TITLE[c.demo])), "text/html", "html", "-report"); }
  if (format === "json") return mk(JSON.stringify({ ...strip(m), note: "Render meshes, point positions and 2D preview geometry are omitted. Lengths in metres unless a column says otherwise." }, null, 2), "application/json", "json");
  if (format === "issues-csv") { if (!ext) throw new Error("No findings."); return mk(issuesCsv(ext), "text/csv", "csv", "-findings"); }
  if (format.startsWith("table-")) { const t = ext?.tables.find((x) => x.id === format.slice(6)); if (!t) throw new Error("Unknown table."); return mk(tableCsv(t), "text/csv", "csv", `-${t.id}`); }
  if (isPlan3d(m) && format in EXPORT_INFO) { const r = makeExport(format as ExportFormat, m, c.name, fileMeta(c.files)); return r; }
  if (format.startsWith("cad-")) { const f = c.files.find((x) => x.role === "drawing" || x.role === "plan"); if (!f) throw new Error("Source drawing not found."); const o = await cadExport(format.slice(4) as CadFormat, f, c.settings, m as never); return mk(o.buf, o.mime, o.ext, `-converted`); }
  if (format.startsWith("cloud-")) {
    const f = c.files.find((x) => x.role === "cloud" || x.role === "plan"); if (!f) throw new Error("Source cloud not found."); const am = m as Extract<AnyModel, { kind: "analysis" }>;
    if (format === "cloud-ply") return mk(writePlyAscii(cleanedCloud(f, c.settings, true)), "application/octet-stream", "ply", "-clean"); if (format === "cloud-xyz") return mk(writeXyz(cleanedCloud(f, c.settings, true)), "text/plain", "xyz", "-clean"); if (format === "cloud-las") return mk(writeLas(cleanedCloud(f, c.settings, true)), "application/octet-stream", "las", "-clean");
    if (format === "cloud-ifc") { const b = am.data?.building as Building | null; if (!b) throw new Error("No scan-to-BIM draft was produced for this cloud."); return mk(writeIfc(b, [], { name: c.name, source: f.name }).text, "application/x-step", "ifc", "-draft"); }
    if (format === "cloud-glb") { if (!am.meshes.length) throw new Error("No draft geometry."); return mk(writeGlb(am.meshes, { project: c.name, units: "metres", source: am.provenance }), "model/gltf-binary", "glb", "-draft"); }
    if (format === "cloud-dxf") { const planes = am.cloud?.planes.filter((p) => p.kind === "vertical") ?? []; const lines = planes.map((p) => { const dx = -p.normal[1], dy = p.normal[0], L = Math.hypot(dx, dy) || 1; const h = p.extent[0] / 2; return { t: "LINE" as const, layer: "SCAN-VERTICAL", a: { x: p.centroid[0] - (dx / L) * h, y: p.centroid[1] - (dy / L) * h }, b: { x: p.centroid[0] + (dx / L) * h, y: p.centroid[1] + (dy / L) * h } }; }); const txt = planes.map((p) => ({ t: "TEXT" as const, layer: "SCAN-LABELS", p: { x: p.centroid[0], y: p.centroid[1] }, text: `P${p.id + 1}`, height: 0.15, rotation: 0 })); return mk(writeDxf({ insunits: 6, layers: [{ name: "SCAN-VERTICAL", color: 1 }, { name: "SCAN-LABELS", color: 2 }], entities: [...lines, ...txt] }), "application/dxf", "dxf", "-planes"); }
  }
  if (format === "glb" && !isPlan3d(m)) { if (!m.meshes.length) throw new Error("No geometry."); return mk(writeGlb(m.meshes, { project: c.name, units: "metres", source: m.provenance }), "model/gltf-binary", "glb"); }
  throw new Error("This export is not available for the current result.");
}
