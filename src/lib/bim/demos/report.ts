import type { PdfLine } from "../pdf";
import { toCsv } from "../csv";
import type { Ext, Table } from "./types";

export interface ReportMeta { title: string; project: string; sourceFiles: { name: string; format: string; sample: boolean; size: number }[]; sample: boolean; assumptions: string[]; warnings: string[]; limitations: string[]; provenance?: string }
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export function extHtml(ext: Ext, m: ReportMeta): string {
  const t = (tb: Table) => `<h3>${esc(tb.title)}</h3>${tb.note ? `<p class="n">${esc(tb.note)}</p>` : ""}<table><thead><tr>${tb.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${tb.rows.slice(0, 500).map((r) => `<tr>${r.map((c) => `<td>${esc(cell(c))}</td>`).join("")}</tr>`).join("")}</tbody></table>${tb.rows.length > 500 ? `<p class="n">First 500 of ${tb.rows.length} rows.</p>` : ""}`;
  const ul = (a: string[]) => (a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>None.</p>");
  return `<!doctype html><meta charset="utf-8"><title>${esc(m.title)} - ${esc(m.project)}</title><style>body{font:15px/1.5 Georgia,serif;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#1c1917}table{border-collapse:collapse;width:100%;font-size:13px;margin:.5rem 0 1.5rem}th,td{border:1px solid #d6d3d1;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f5f5f4}.n{color:#57534e;font-size:13px}.k{display:inline-block;margin:0 1.5rem .5rem 0}.k b{display:block;font-size:20px}.s{color:#b45309}</style>
<h1>${esc(m.title)}</h1><p>${esc(m.project)} - generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC${m.sample ? " - <b>SAMPLE DATA</b>" : ""}. Automated processing of the provided files; a preliminary aid, not a verified or certified document.</p>
<h2>Source files</h2>${ul(m.sourceFiles.map((f) => `${f.name} (${f.format}, ${(f.size / 1024).toFixed(1)} KB)${f.sample ? " - sample file" : " - user upload"}`))}
<h2>Summary</h2><p>${ext.headline.map((h) => `<span class="k"><b>${esc(h.value)}</b>${esc(h.label)}</span>`).join("")}</p>
${ext.tables.map(t).join("")}
<h2>Findings (${ext.issues.length})</h2>${ext.issues.length ? `<table><thead><tr><th>ID</th><th>Severity</th><th>Rule</th><th>Finding</th><th>Detail</th></tr></thead><tbody>${ext.issues.slice(0, 500).map((i) => `<tr><td>${esc(i.id)}</td><td>${esc(i.severity)}</td><td>${esc(i.rule)}</td><td>${esc(i.title)}</td><td>${esc(i.detail)}</td></tr>`).join("")}</tbody></table>` : "<p>No findings.</p>"}
<h2>Assumptions</h2>${ul(m.assumptions)}<h2>Warnings</h2>${ul(m.warnings)}<h2>Limitations</h2>${ul(m.limitations)}<h2>Notes</h2>${ul(ext.notes)}`;
}
export function extPdfLines(ext: Ext, m: ReportMeta): PdfLine[] {
  const L: PdfLine[] = []; const h = (t: string) => L.push({ text: t, size: 13, bold: true, gap: 10 }); const p = (t: string) => L.push({ text: t }); const li = (t: string) => L.push({ text: `- ${t}` });
  L.push({ text: "Neo Forge Technology - " + m.title, size: 16, bold: true }); L.push({ text: m.project, size: 12, bold: true }); p(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC${m.sample ? " - SAMPLE DATA" : ""}. Automated processing; a preliminary aid, not a verified or certified document.`);
  h("Source files"); m.sourceFiles.forEach((f) => li(`${f.name} (${f.format}, ${(f.size / 1024).toFixed(1)} KB)${f.sample ? " - sample" : " - user upload"}`));
  h("Summary"); ext.headline.forEach((x) => li(`${x.label}: ${x.value}${x.note ? ` (${x.note})` : ""}`));
  for (const tb of ext.tables) { h(tb.title); if (tb.note) p(tb.note); L.push({ text: tb.columns.join(" | "), mono: true, bold: true }); tb.rows.slice(0, 40).forEach((r) => L.push({ text: r.map(cell).join(" | ").slice(0, 150), mono: true })); if (tb.rows.length > 40) p(`... ${tb.rows.length - 40} more rows (see CSV export).`); }
  h(`Findings (${ext.issues.length})`); ext.issues.slice(0, 60).forEach((i) => li(`[${i.severity}] ${i.title} - ${i.detail}`)); if (ext.issues.length > 60) p(`... ${ext.issues.length - 60} more (see CSV export).`);
  h("Assumptions"); (m.assumptions.length ? m.assumptions : ["None recorded."]).forEach(li); h("Warnings"); (m.warnings.length ? m.warnings : ["None."]).forEach(li); h("Limitations"); m.limitations.forEach(li); ext.notes.forEach(li);
  return L;
}
export const tableCsv = (t: Table) => toCsv([t.columns, ...t.rows.map((r) => r.map(cell))]);
export const issuesCsv = (ext: Ext) => toCsv([["ID", "Severity", "Rule", "Finding", "Detail", "Element", "Location"], ...ext.issues.map((i) => [i.id, i.severity, i.rule, i.title, i.detail, i.element ?? "", i.location?.join(" ") ?? ""])]);
