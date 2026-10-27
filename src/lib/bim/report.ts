import type { Building, Clash, MepElement } from "./model";
import { SYSTEM_LABEL } from "./mep";
import type { PdfLine } from "./pdf";

export interface ReportInput { projectName: string; sourceFiles: { name: string; format: string; sample: boolean; size: number }[]; building: Building | null; mep: MepElement[]; clashes: Clash[]; clashInfo?: { tested: number; method: string[]; clearance: number; tolerance: number }; outputs: string[]; limitations: string[]; extra?: string[]; generatedAt?: string }
export function reportLines(r: ReportInput): PdfLine[] {
  const L: PdfLine[] = []; const h = (t: string) => L.push({ text: t, size: 13, bold: true, gap: 10 }); const p = (t: string) => L.push({ text: t }); const li = (t: string) => L.push({ text: `- ${t}` });
  L.push({ text: "Neo Forge Technology - Project report", size: 16, bold: true }); L.push({ text: r.projectName, size: 12, bold: true }); p(`Generated ${r.generatedAt ?? new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Automated processing of the uploaded files; not a certified or verified design document.`);
  h("1. Source files"); for (const f of r.sourceFiles) li(`${f.name} (${f.format}, ${(f.size / 1024).toFixed(1)} KB)${f.sample ? " - SAMPLE FILE" : " - user upload"}`);
  const b = r.building;
  if (b) {
    h("2. Units and processing summary"); p(`Units: ${b.units.name} (${b.units.note}).`); p(`Levels ${b.levels.length}, walls ${b.stats.walls}, doors ${b.stats.doors}, windows ${b.stats.windows}, rooms ${b.stats.rooms}, columns ${b.stats.columns}, stairs ${b.stats.stairs}.`); if (b.scaleCheck) p(`Scale check: ${b.scaleCheck.agreeing} of ${b.scaleCheck.checked} drawn dimensions agree with the geometry (median ratio ${b.scaleCheck.medianRatio}).`);
    h("3. Rooms"); for (const x of b.rooms.filter((q) => q.level === "L0")) L.push({ text: `${x.name.padEnd(22)} net ${x.area.toFixed(2).padStart(8)} m2   perimeter ${x.perimeter.toFixed(2).padStart(7)} m   ${x.nameSource === "text-label" ? "named from drawing text" : "generated name"}`, mono: true, size: 8.5 });
    if (b.levels.length > 1) p("Upper levels repeat the ground-floor plan (assumption).");
    h("4. Assumptions (configurable, not from the source)"); for (const a of b.assumptions) li(a);
  }
  if (r.mep.length) { h("5. MEP / HVAC"); const by: Record<string, number> = {}; for (const e of r.mep) by[e.system] = (by[e.system] ?? 0) + 1; for (const [s, n] of Object.entries(by)) li(`${SYSTEM_LABEL[s as keyof typeof SYSTEM_LABEL] ?? s}: ${n} elements`); const ass = r.mep.filter((e) => e.assumed.length).length; p(`${ass} of ${r.mep.length} elements use at least one configured (assumed) value; those values are labelled "assumed" in the model and exports.`); p("No airflow, pressure, load or capacity values are calculated or shown."); }
  if (r.clashInfo) { h("6. Clash detection"); p(`Tested ${r.clashInfo.tested} candidate element pairs. Clearance ${r.clashInfo.clearance} m, hard-clash tolerance ${r.clashInfo.tolerance} m. Methods: ${r.clashInfo.method.join("; ")}.`); const hard = r.clashes.filter((c) => c.type === "hard").length; p(`${hard} hard clashes, ${r.clashes.length - hard} clearance findings. This does not prove the model is clash-free: only the geometry types above are tested.`); for (const c of r.clashes.slice(0, 40)) L.push({ text: `${c.id} ${c.type.padEnd(9)} ${c.severity.padEnd(7)} ${c.a.tag} x ${c.b.tag}  depth ${c.depth.toFixed(3)} m  gap ${c.distance.toFixed(3)} m`, mono: true, size: 8 }); if (r.clashes.length > 40) p(`... ${r.clashes.length - 40} more in the CSV export.`); }
  const w = [...(b?.warnings ?? [])]; if (w.length) { h("7. Validation warnings"); for (const x of w) li(x); }
  for (const t of r.extra ?? []) p(t);
  h("8. Output files"); for (const o of r.outputs) li(o); h("9. Known limitations"); for (const x of r.limitations) li(x);
  return L;
}
export function reportHtml(r: ReportInput): string {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<!doctype html><meta charset="utf-8"><title>${esc(r.projectName)} - report</title><style>body{font:15px/1.5 Georgia,serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#1c1917}pre{background:#f5f5f4;padding:.75rem;overflow:auto;font-size:13px}h1,h2{font-weight:600}</style><h1>${esc(r.projectName)}</h1><pre>${esc(reportLines(r).map((l) => l.text).join("\n"))}</pre>`;
}
