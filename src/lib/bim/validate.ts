/** Content validation for uploads: the file's bytes decide the format, never just the extension. */
import { parseDxf, DxfError } from "./dxf";

export type BimFormat = "dxf" | "dwg" | "ifc" | "svg" | "png" | "jpg" | "pdf" | "las" | "laz" | "ply" | "xyz" | "csv" | "obj" | "json" | "e57" | "unknown";
export interface Validation { ok: boolean; format: BimFormat; support: "native" | "conversion-required" | "image-interpretation" | "unsupported"; errors: string[]; warnings: string[]; info: Record<string, string | number | boolean> }
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_EXT = ["dxf", "dwg", "ifc", "svg", "png", "jpg", "jpeg", "pdf", "las", "laz", "ply", "xyz", "csv", "txt", "obj", "json", "e57", "pts"];
const fmt = (ext: string): BimFormat => ({ jpeg: "jpg", txt: "xyz", pts: "xyz" } as Record<string, BimFormat>)[ext] ?? ((ALLOWED_EXT.includes(ext) ? ext : "unknown") as BimFormat);

export function validateUpload(name: string, buf: Buffer): Validation {
  const ext = (name.split(".").pop() ?? "").toLowerCase(); let format = fmt(ext); const v: Validation = { ok: false, format, support: "unsupported", errors: [], warnings: [], info: { bytes: buf.length } };
  if (!buf.length) { v.errors.push("The file is empty."); return v; } if (buf.length > MAX_UPLOAD_BYTES) { v.errors.push(`File larger than ${MAX_UPLOAD_BYTES / 1048576} MB.`); return v; }
  if (!ALLOWED_EXT.includes(ext)) { v.errors.push(`.${ext || "?"} files are not supported. Supported: DXF, IFC, SVG, PNG/JPG, PDF, LAS/PLY/XYZ/CSV, OBJ (depending on the application).`); return v; }
  const head = buf.subarray(0, 512).toString("latin1");
  if (/^AC10\d\d/.test(head)) { v.format = "dwg"; v.support = "conversion-required"; v.errors.push("This is a DWG file. DWG is a proprietary binary format and is not parsed here. Convert it to ASCII DXF (ODA File Converter, LibreDWG's dwg2dxf or your CAD program) and upload the DXF."); return v; }
  switch (format) {
    case "dxf": { try { const d = parseDxf(buf); v.support = "native"; v.ok = true; v.info = { ...v.info, version: d.version, units: d.unitsKnown ? d.insunits : "not declared", layers: Object.keys(d.layers).length, entities: d.entities.length, blocks: Object.keys(d.blocks).length }; v.warnings.push(...d.warnings.slice(0, 5)); if (!d.unitsKnown) v.warnings.push("The drawing does not declare its units; you will be asked to confirm them."); } catch (e) { v.errors.push(e instanceof DxfError ? e.message : "The DXF could not be parsed."); } return v; }
    case "ifc": { if (!/^ISO-10303-21;/.test(head.trimStart())) { v.errors.push("Not an IFC (STEP) file: the ISO-10303-21 header is missing."); return v; } const sch = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(buf.subarray(0, 8192).toString("latin1")); v.info.schema = sch?.[1] ?? "unknown"; if (!/^IFC(2X3|4)$/i.test(String(v.info.schema))) v.warnings.push(`Schema ${v.info.schema} is not one of the verified schemas (IFC2X3, IFC4).`); v.support = "native"; v.ok = true; return v; }
    case "svg": { const t = buf.toString("utf8", 0, Math.min(buf.length, 4096)); if (!/<svg[\s>]/i.test(t)) { v.errors.push("Not an SVG document."); return v; } if (/<script|onload\s*=|javascript:/i.test(buf.toString("utf8"))) { v.errors.push("SVG files containing scripts are rejected."); return v; } v.support = "native"; v.ok = true; return v; }
    case "png": case "jpg": { const png = buf[0] === 0x89 && buf[1] === 0x50, jpg = buf[0] === 0xff && buf[1] === 0xd8; if (!png && !jpg) { v.errors.push("The file is not a valid PNG or JPEG image."); return v; } v.format = png ? "png" : "jpg"; v.support = "image-interpretation"; v.ok = true; v.warnings.push("Raster plans are interpreted by image processing: results are inferred, not verified CAD geometry."); return v; }
    case "pdf": { if (!/^%PDF-/.test(head)) { v.errors.push("Not a PDF file."); return v; } v.support = "conversion-required"; v.ok = true; v.warnings.push("PDF plans are not converted automatically. Export the sheet as DXF or SVG, or upload an image of the plan."); return v; }
    case "las": case "laz": { if (head.slice(0, 4) !== "LASF") { v.errors.push("Not a LAS/LAZ file: signature LASF missing."); return v; } const laz = ((buf[104] ?? 0) & 0x80) !== 0 || ext === "laz"; if (laz) { v.format = "laz"; v.errors.push("LAZ (compressed) is not supported here. Convert to LAS (e.g. with laszip or PDAL) and upload the LAS."); return v; } v.support = "native"; v.ok = true; return v; }
    case "ply": { if (!/^ply\r?\n/.test(head)) { v.errors.push("Not a PLY file."); return v; } v.support = "native"; v.ok = true; return v; }
    case "xyz": case "csv": { const lines = buf.toString("utf8", 0, 4096).split(/\r?\n/).filter((l) => l.trim() && !/^[#/]/.test(l)); const numeric = lines.filter((l) => l.trim().split(/[\s,;]+/).slice(0, 3).every((x) => Number.isFinite(parseFloat(x)))); if (numeric.length < Math.max(1, lines.length - 2)) { v.errors.push("Expected rows of numeric X Y Z[,R G B] values."); return v; } v.support = "native"; v.ok = true; return v; }
    case "obj": { if (!/^(#|v |o |g |mtllib)/m.test(head)) { v.errors.push("Not a Wavefront OBJ file."); return v; } v.support = "native"; v.ok = true; return v; }
    case "json": { try { JSON.parse(buf.toString("utf8")); v.support = "native"; v.ok = true; } catch { v.errors.push("Invalid JSON."); } return v; }
    case "e57": { v.format = "e57"; v.errors.push("E57 is not supported (no verified E57 reader is installed). Convert to LAS or PLY."); return v; }
    default: v.errors.push("Unsupported file type."); return v;
  }
}
