import { toCsv, roomSchedule, wallSchedule, openingSchedule, mepSchedule, clashSchedule } from "./csv";
import { exportDxf } from "./dxfout";
import { writeGlb } from "./glb";
import { writeIfc } from "./ifcwrite";
import { writePdf } from "./pdf";
import { reportHtml, reportLines, type ReportInput } from "./report";
import type { Plan3dModel } from "./pipeline-types";

export type ExportFormat = "ifc" | "glb" | "dxf" | "csv-rooms" | "csv-walls" | "csv-openings" | "csv-mep" | "csv-clashes" | "csv-ifc-elements" | "json" | "pdf" | "html";
export const EXPORT_INFO: Record<ExportFormat, { label: string; mime: string; ext: string; needs: "building" | "meshes" | "mep" | "any"; note: string }> = {
  ifc: { label: "IFC4 model", mime: "application/x-step", ext: "ifc", needs: "building", note: "Authored IFC4: spatial structure, walls with voids, doors/windows, slabs, spaces with quantities, columns, stairs (simplified block), MEP segments and systems, provenance property sets. Not preserved: curved walls, wall-join booleans, materials." },
  glb: { label: "GLB (3D visualisation)", mime: "model/gltf-binary", ext: "glb", needs: "meshes", note: "Geometry, colours and element ids only. GLB does not carry BIM semantics; use IFC for that." },
  dxf: { label: "DXF (2D plan)", mime: "application/dxf", ext: "dxf", needs: "building", note: "Ground-floor plan in mm: wall outlines with opening gaps, door/window symbols, rooms with area labels, columns, stairs and MEP centrelines on layers." },
  "csv-rooms": { label: "Room schedule (CSV)", mime: "text/csv", ext: "csv", needs: "building", note: "Net area, gross area to centrelines, perimeter, name source." },
  "csv-walls": { label: "Wall schedule (CSV)", mime: "text/csv", ext: "csv", needs: "building", note: "Lengths, thickness, heights, openings, source layer and assumptions." },
  "csv-openings": { label: "Door/window schedule (CSV)", mime: "text/csv", ext: "csv", needs: "building", note: "Widths, heights, sills, positions, source and assumptions." },
  "csv-mep": { label: "MEP schedule (CSV)", mime: "text/csv", ext: "csv", needs: "mep", note: "Every MEP element with size, elevation, network and which values were assumed." },
  "csv-clashes": { label: "Clash report (CSV)", mime: "text/csv", ext: "csv", needs: "any", note: "Findings with severity, depth/gap, location and detection method." },
  "csv-ifc-elements": { label: "IFC element list (CSV)", mime: "text/csv", ext: "csv", needs: "any", note: "Elements read from the IFC file with class, storey, system and quantities." },
  json: { label: "Project metadata (JSON)", mime: "application/json", ext: "json", needs: "any", note: "Structured model without render meshes: building, MEP, clashes, settings, warnings." },
  pdf: { label: "Project report (PDF)", mime: "application/pdf", ext: "pdf", needs: "any", note: "Source files, units, rooms, assumptions, MEP summary, clash findings, warnings, limitations." },
  html: { label: "Project report (HTML)", mime: "text/html", ext: "html", needs: "any", note: "Same content as the PDF report." },
};
export function reportInput(m: Plan3dModel, name: string, files: { name: string; format: string; sample: boolean; size: number }[], outputs: string[]): ReportInput { return { projectName: name, sourceFiles: files, building: m.building, mep: m.mep.elements, clashes: m.clashes, clashInfo: { tested: m.clashInfo.tested, method: m.clashInfo.method, clearance: m.clashInfo.clearance, tolerance: m.clashInfo.tolerance }, outputs, limitations: m.limitations, extra: m.ifc ? [`IFC model: schema ${m.ifc.schema}, ${m.ifc.elements.length} elements, ${m.ifc.triangles.toLocaleString()} triangles.`] : [] }; }
export function makeExport(format: ExportFormat, m: Plan3dModel, name: string, files: { name: string; format: string; sample: boolean; size: number }[]): { buf: Buffer; mime: string; fileName: string } {
  const info = EXPORT_INFO[format]; const base = name.replace(/[^\w.-]+/g, "_").slice(0, 40) || "project"; const fileName = `${base}.${format.startsWith("csv") ? format.replace("csv-", "") + ".csv" : info.ext}`; let buf: Buffer;
  const need = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };
  switch (format) {
    case "ifc": need(m.building, "IFC export needs a generated building (from a DXF/SVG/image plan). IFC input files are already IFC."); buf = Buffer.from(writeIfc(m.building!, m.mep.source === "dxf" ? m.mep.elements : [], { name, source: m.inputs.plan?.name }).text, "utf8"); break;
    case "glb": need(m.meshes.length, "No geometry to export."); buf = writeGlb(m.meshes, { project: name, units: "metres", source: m.provenance.architecture }); break;
    case "dxf": need(m.building, "DXF export needs a generated building."); buf = Buffer.from(exportDxf(m.building!, m.mep.source === "dxf" ? m.mep.elements : []), "latin1"); break;
    case "csv-rooms": need(m.building, "No building."); buf = Buffer.from(roomSchedule(m.building!)); break;
    case "csv-walls": need(m.building, "No building."); buf = Buffer.from(wallSchedule(m.building!)); break;
    case "csv-openings": need(m.building, "No building."); buf = Buffer.from(openingSchedule(m.building!)); break;
    case "csv-mep": need(m.mep.elements.length, "No MEP elements."); buf = Buffer.from(mepSchedule(m.mep.elements)); break;
    case "csv-clashes": buf = Buffer.from(clashSchedule(m.clashes)); break;
    case "csv-ifc-elements": need(m.ifc, "No IFC model."); buf = Buffer.from(toCsv([["Express ID", "GlobalId", "Class", "Name", "Category", "Storey", "System", "Triangles", "Quantities"], ...m.ifc!.elements.map((e) => [e.id, e.guid, e.cls, e.name, e.cat, e.storey, e.sys ?? e.systemName, e.triangles, JSON.stringify(e.quantities)])])); break;
    case "json": { const { meshes: _m, ...rest } = m; void _m; buf = Buffer.from(JSON.stringify({ ...rest, ifc: m.ifc ? { ...m.ifc, elements: m.ifc.elements.length } : null, note: "Render meshes are omitted. Lengths in metres." }, null, 2)); break; }
    case "pdf": buf = writePdf(`${name} - report`, reportLines(reportInput(m, name, files, Object.keys(EXPORT_INFO).filter((k) => k !== "pdf").slice(0, 3).map((k) => EXPORT_INFO[k as ExportFormat].label)))); break;
    case "html": buf = Buffer.from(reportHtml(reportInput(m, name, files, []))); break;
  }
  return { buf, mime: info.mime, fileName };
}
