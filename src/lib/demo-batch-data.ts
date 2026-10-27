/** Sample jobs and the processing engine for the CAD Batch Processing Manager demo. All sample files are invented; uploaded DXF files are parsed for real. */
import { LAYER_RE } from "./demo-cad-data";

export type JobStatus = "pending" | "queued" | "processing" | "paused" | "completed" | "failed" | "cancelled";
export type StepKey = "metadata" | "layers" | "units" | "geometry" | "summary" | "report";
export interface StepDef { key: StepKey; name: string; text: string }
export const STEPS: StepDef[] = [
  { key: "metadata", name: "Inspect drawing metadata", text: "File format, size, header and revision." },
  { key: "layers", name: "Validate layer naming", text: "Layer names must follow DISCIPLINE-ELEMENT." },
  { key: "units", name: "Check drawing units", text: "Drawing units must match the project setting." },
  { key: "geometry", name: "Detect geometry issues", text: "Duplicate objects, wall gaps and micro-segments." },
  { key: "summary", name: "Generate drawing summary", text: "Object, layer and issue counts." },
  { key: "report", name: "Produce processing report", text: "Collects every finding into a downloadable report." },
];
export const UNAVAILABLE = [
  { name: "Purge unused styles and blocks", why: "Needs a native DWG engine." },
  { name: "Convert DWG to PDF", why: "Needs a plotting engine; not available in the browser demo." },
];
export interface Config { order: StepKey[]; enabled: Record<StepKey, boolean>; maxSizeMB: number; units: string; stopOnError: boolean }
export const DEFAULT_CONFIG: Config = { order: STEPS.map((s) => s.key), enabled: { metadata: true, layers: true, units: true, geometry: true, summary: true, report: true }, maxSizeMB: 40, units: "Millimetres", stopOnError: true };

export interface Log { t: string; level: "info" | "warn" | "error"; text: string }
export interface JFinding { step: StepKey; severity: "error" | "warning" | "info"; message: string }
export interface Job {
  id: string; file: string; category: string; rev: string; format: "DWG" | "DXF" | "OTHER"; sizeMB: number; modified: string; objects: number;
  layers: string[]; units: string; geom: { dups: number; gaps: number; tiny: number }; header: "ok" | "corrupt"; source: "sample" | "upload";
  status: JobStatus; step: number; stepStatus: Partial<Record<StepKey, "done" | "skipped" | "failed">>; logs: Log[]; findings: JFinding[]; stats?: { inspected: number; layers: number; issues: number }; reportText?: string; error?: string; runs: number; note?: string; unparsed?: boolean;
}
export const CATEGORIES = ["Architectural", "Structural", "MEP", "Site", "Schedules", "Details"] as const;

const STD = ["A-WALL", "A-DOOR", "A-GLAZ", "A-ANNO-DIMS", "A-ANNO-TEXT"];
const mk = (id: string, file: string, category: string, rev: string, sizeMB: number, modified: string, objects: number, layers: string[], extra: Partial<Job> = {}): Job => ({
  id, file, category, rev, format: "DWG", sizeMB, modified, objects, layers, units: "Millimetres", geom: { dups: 0, gaps: 0, tiny: 0 }, header: "ok", source: "sample",
  status: "pending", step: 0, stepStatus: {}, logs: [], findings: [], runs: 0, ...extra,
});
export function sampleJobs(): Job[] {
  return [
    mk("J-01", "RCB-A101-Ground-Floor-Plan.dwg", "Architectural", "C", 4.8, "2026-09-12", 1840, [...STD, "A-FURN", "walls2"], { geom: { dups: 3, gaps: 1, tiny: 1 } }),
    mk("J-02", "RCB-A102-First-Floor-Plan.dwg", "Architectural", "C", 4.1, "2026-09-12", 1612, [...STD, "A-FURN"], { geom: { dups: 0, gaps: 1, tiny: 0 } }),
    mk("J-03", "RCB-A103-Roof-Plan.dwg", "Architectural", "B", 1.9, "2026-09-05", 604, [...STD, "A-ROOF"]),
    mk("J-04", "RCB-A201-Front-Elevation.dwg", "Architectural", "B", 2.2, "2026-09-05", 733, [...STD, "Elev_old"], { geom: { dups: 2, gaps: 0, tiny: 0 } }),
    mk("J-05", "RCB-A301-Section-A-A.dwg", "Architectural", "A", 1.7, "2026-08-28", 498, [...STD, "A-FLOR-STRS"]),
    mk("J-06", "RCB-S101-Structural-Layout.dwg", "Structural", "B", 3.6, "2026-09-09", 1275, ["S-COLS", "S-BEAM", "S-FNDN", "A-ANNO-DIMS", "A-ANNO-TEXT"], { units: "Inches" }),
    mk("J-07", "RCB-S201-Foundation-Details.dwg", "Details", "A", 2.9, "2026-08-30", 902, ["S-FNDN", "S-REBR", "A-ANNO-DIMS"], { geom: { dups: 1, gaps: 0, tiny: 2 } }),
    mk("J-08", "RCB-M101-Mechanical-Layout.dwg", "MEP", "B", 3.1, "2026-09-10", 1120, ["M-HVAC", "M-DUCT", "A-WALL", "Mech", "A-ANNO-TEXT"]),
    mk("J-09", "RCB-E101-Electrical-Layout.dwg", "MEP", "B", 2.7, "2026-09-10", 0, ["E-POWR", "E-LITE"], { header: "corrupt", note: "Sample file with a damaged header" }),
    mk("J-10", "RCB-C001-Site-Plan.dwg", "Site", "A", 48.2, "2026-08-21", 9420, ["C-PROP", "C-PARK", "C-SITE", "L-PLNT"], { geom: { dups: 6, gaps: 0, tiny: 4 }, note: "Large sample file (48 MB)" }),
    mk("J-11", "RCB-A601-Door-Schedule.dwg", "Schedules", "C", 0.6, "2026-09-14", 212, ["A-ANNO-TABL", "A-ANNO-TEXT"], { units: "Unspecified" }),
    mk("J-12", "RCB-A602-Window-Schedule.dwg", "Schedules", "C", 0.5, "2026-09-14", 187, ["A-ANNO-TABL", "A-ANNO-TEXT"]),
  ];
}

const fmtT = () => new Date().toLocaleTimeString([], { hour12: false });
export interface StepOut { logs: Log[]; findings: JFinding[]; failed?: string; stats?: Job["stats"]; reportText?: string }

export function execStep(key: StepKey, job: Job, cfg: Config, all: JFinding[]): StepOut {
  const L = (level: Log["level"], text: string): Log => ({ t: fmtT(), level, text });
  const logs: Log[] = [], findings: JFinding[] = [];
  const add = (severity: JFinding["severity"], message: string) => { findings.push({ step: key, severity, message }); logs.push(L(severity === "error" ? "error" : severity === "warning" ? "warn" : "info", message)); };
  if (key === "metadata") {
    logs.push(L("info", `Reading ${job.file} (${job.format}, ${job.sizeMB} MB, revision ${job.rev || "none"})`));
    if (job.unparsed) return { logs: [...logs, L("error", "DWG binary parsing is not available in this browser demo")], findings: [{ step: key, severity: "error", message: "DWG files cannot be parsed in the browser demo" }], failed: "DWG binary files cannot be read in this browser demo. Export the drawing as ASCII DXF and upload that instead." };
    if (job.header === "corrupt") return { logs: [...logs, L("error", "Header signature not recognised: the file is damaged")], findings: [{ step: key, severity: "error", message: "Header signature not recognised" }], failed: "Header signature not recognised (damaged sample file). Re-export the drawing and retry." };
    if (job.format === "OTHER") return { logs: [...logs, L("error", "Unsupported file format")], findings: [{ step: key, severity: "error", message: "Unsupported file format" }], failed: "Unsupported file format. Use DWG or DXF." };
    if (job.sizeMB > cfg.maxSizeMB) return { logs: [...logs, L("error", `File size ${job.sizeMB} MB exceeds the ${cfg.maxSizeMB} MB limit`)], findings: [{ step: key, severity: "error", message: `File size exceeds ${cfg.maxSizeMB} MB` }], failed: `Drawing is ${job.sizeMB} MB, above the ${cfg.maxSizeMB} MB limit. Raise the limit in the workflow settings and retry.` };
    if (!job.rev) add("warning", "No revision letter in the file metadata");
    logs.push(L("info", "Metadata read successfully"));
  }
  if (key === "layers") {
    logs.push(L("info", `Checking ${job.layers.length} layer names`));
    const bad = job.layers.filter((l) => l !== "0" && !LAYER_RE.test(l));
    for (const l of bad) add("warning", `Layer “${l}” does not follow the naming standard`);
    logs.push(L("info", bad.length ? `${bad.length} of ${job.layers.length} layers are non-standard` : "All layer names conform"));
  }
  if (key === "units") {
    logs.push(L("info", `Drawing units: ${job.units}; project setting: ${cfg.units}`));
    if (job.units === "Unspecified") add("warning", "Drawing has no unit setting; assuming the project units");
    else if (job.units !== cfg.units) add("error", `Drawing units are ${job.units} but the project uses ${cfg.units}`);
    else logs.push(L("info", "Units match"));
  }
  if (key === "geometry") {
    logs.push(L("info", `Scanning ${job.objects} objects`));
    if (job.geom.dups) add("warning", `${job.geom.dups} duplicate object${job.geom.dups > 1 ? "s" : ""} found`);
    if (job.geom.gaps) add("error", `${job.geom.gaps} wall end${job.geom.gaps > 1 ? "s" : ""} do not meet the neighbouring wall`);
    if (job.geom.tiny) add("warning", `${job.geom.tiny} micro-segment${job.geom.tiny > 1 ? "s" : ""} shorter than 5 mm`);
    if (!job.geom.dups && !job.geom.gaps && !job.geom.tiny) logs.push(L("info", "No geometry issues"));
  }
  if (key === "summary") {
    const issues = all.filter((f) => f.severity !== "info").length;
    const stats = { inspected: job.objects, layers: job.layers.length, issues };
    logs.push(L("info", `Summary: ${stats.inspected} objects on ${stats.layers} layers, ${issues} issue${issues === 1 ? "" : "s"} so far`));
    return { logs, findings, stats };
  }
  if (key === "report") {
    const lines = [`Processing report — ${job.file} (SAMPLE DATA, simulated demonstration)`, `Revision ${job.rev || "—"} · ${job.format} · ${job.sizeMB} MB · ${job.objects} objects`, "", ...(all.length ? all.map((f) => `[${f.severity.toUpperCase()}] (${STEPS.find((s) => s.key === f.step)!.name}) ${f.message}`) : ["No findings."])];
    logs.push(L("info", `Report generated with ${all.length} finding${all.length === 1 ? "" : "s"}`));
    return { logs, findings, reportText: lines.join("\n") };
  }
  return { logs, findings };
}

/* ------------------------------------------------------------------ DXF */
export function parseDxf(text: string, name: string, sizeBytes: number): Job | { error: string } {
  const raw = text.split(/\r?\n/); const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) { const c = parseInt(raw[i].trim(), 10); if (Number.isNaN(c)) return { error: "This does not look like an ASCII DXF file (group codes are not numeric)." }; pairs.push([c, raw[i + 1].trim()]); }
  if (!pairs.some(([c, v]) => c === 0 && v === "SECTION")) return { error: "No SECTION found: not a valid ASCII DXF file." };
  const layers = new Set<string>(); const types = new Map<string, number>(); const seen = new Set<string>(); let dups = 0, tiny = 0, units = "Unspecified";
  const UNITS: Record<string, string> = { "1": "Inches", "2": "Feet", "4": "Millimetres", "5": "Centimetres", "6": "Metres" };
  let section = "", inLayerTable = false, cur: { type: string; vals: Record<number, string> } | null = null;
  const flush = () => { if (!cur) return; if (section === "ENTITIES") { types.set(cur.type, (types.get(cur.type) ?? 0) + 1); if (cur.vals[8]) layers.add(cur.vals[8]); if (cur.type === "LINE") { const key = [10, 20, 11, 21].map((c) => cur!.vals[c]).join("|"); if (seen.has(key)) dups++; else seen.add(key); const dx = +(cur.vals[11] ?? 0) - +(cur.vals[10] ?? 0), dy = +(cur.vals[21] ?? 0) - +(cur.vals[20] ?? 0); if (Math.hypot(dx, dy) < 0.005) tiny++; } } cur = null; };
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 9 && v === "$INSUNITS" && pairs[i + 1]) units = UNITS[pairs[i + 1][1]] ?? "Other";
    if (c === 0 && v === "SECTION" && pairs[i + 1]) { flush(); section = pairs[i + 1][1]; inLayerTable = false; continue; }
    if (c === 0 && v === "ENDSEC") { flush(); section = ""; continue; }
    if (section === "TABLES" && c === 2 && v === "LAYER" && pairs[i - 1]?.[1] === "TABLE") inLayerTable = true;
    if (section === "TABLES" && c === 0 && v === "ENDTAB") inLayerTable = false;
    if (section === "TABLES" && inLayerTable && c === 0 && v === "LAYER" && pairs[i + 1]) { const n = pairs.slice(i + 1, i + 12).find(([cc]) => cc === 2); if (n) layers.add(n[1]); }
    if (section === "ENTITIES") { if (c === 0) { flush(); cur = { type: v, vals: {} }; } else if (cur) cur.vals[c] = v; }
  }
  flush();
  const objects = [...types.values()].reduce((a, b) => a + b, 0);
  if (!objects) return { error: "The DXF file contains no drawing entities." };
  return { id: `U-${Date.now() % 100000}`, file: name, category: "Details", rev: "", format: "DXF", sizeMB: Math.round((sizeBytes / 1e6) * 100) / 100, modified: new Date().toISOString().slice(0, 10), objects, layers: [...layers], units, geom: { dups, gaps: 0, tiny }, header: "ok", source: "upload", status: "pending", step: 0, stepStatus: {}, logs: [], findings: [], runs: 0, note: `Parsed from your DXF: ${[...types.entries()].map(([t, n]) => `${n} ${t}`).join(", ")}` };
}
export function sampleDxf(): string {
  const p: string[] = [];
  const pair = (c: number | string, v: string | number) => p.push(String(c), String(v));
  pair(0, "SECTION"); pair(2, "HEADER"); pair(9, "$INSUNITS"); pair(70, 4); pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "TABLES"); pair(0, "TABLE"); pair(2, "LAYER"); for (const l of ["A-WALL", "A-DOOR", "walls_new"]) { pair(0, "LAYER"); pair(2, l); pair(70, 0); pair(62, 7); pair(6, "CONTINUOUS"); } pair(0, "ENDTAB"); pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "ENTITIES");
  const line = (l: string, x1: number, y1: number, x2: number, y2: number) => { pair(0, "LINE"); pair(8, l); pair(10, x1); pair(20, y1); pair(30, 0); pair(11, x2); pair(21, y2); pair(31, 0); };
  line("A-WALL", 0, 0, 6000, 0); line("A-WALL", 6000, 0, 6000, 4000); line("A-WALL", 6000, 4000, 0, 4000); line("A-WALL", 0, 4000, 0, 0); line("A-WALL", 0, 0, 6000, 0); line("walls_new", 3000, 0, 3000, 4000); line("A-DOOR", 1000, 0, 1900, 0); line("A-DOOR", 2000, 2000, 2000.001, 2000);
  pair(0, "ENDSEC"); pair(0, "EOF");
  return p.join("\n");
}
