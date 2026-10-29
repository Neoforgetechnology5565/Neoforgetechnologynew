/** A small dependency-free PDF writer: headings, wrapped text, bullet lines and simple tables as aligned text rows (Times, A4). */
export interface PdfSection { heading: string; text?: string; lines?: string[]; rows?: string[][] }
const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
function wrap(s: string, n: number): string[] { const out: string[] = []; let cur = ""; for (const w of s.split(/\s+/)) { if ((cur + " " + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); } if (cur) out.push(cur); return out.length ? out : [""]; }
export function buildPdf(title: string, subtitle: string, sections: PdfSection[], footer: string): Blob {
  type L = { t: string; size: number; bold?: boolean; gap?: number; color?: string }; const lines: L[] = [{ t: title, size: 20, bold: true, color: "0.086 0.514 0.29" }];
  if (subtitle) lines.push({ t: subtitle, size: 9, gap: 4 });
  for (const s of sections) {
    lines.push({ t: s.heading, size: 13, bold: true, gap: 10, color: "0.067 0.392 0.227" });
    if (s.text) for (const w of wrap(s.text, 100)) lines.push({ t: w, size: 10.5 });
    for (const l of s.lines ?? []) wrap(l, 98).forEach((w, i) => lines.push({ t: (i ? "  " : "- ") + w, size: 10.5 }));
    if (s.rows?.length) { const cols = Math.max(...s.rows.map((r) => r.length)), w = Math.max(10, Math.floor(104 / cols)); s.rows.slice(0, 150).forEach((r, i) => lines.push({ t: r.map((c) => (c.length > w - 1 ? c.slice(0, w - 2) + "~" : c).padEnd(w)).join(""), size: 8, bold: i === 0 })); }
  }
  if (footer) wrap(footer, 110).forEach((w, i) => lines.push({ t: w, size: 8.5, gap: i ? 0 : 10 }));
  const pages: string[] = []; let y = 800, cur = "";
  for (const l of lines) { const h = l.size * 1.4 + (l.gap ?? 0); if (y - h < 50) { pages.push(cur); cur = ""; y = 800; } y -= h; cur += `BT /${l.bold ? "F2" : "F1"} ${l.size} Tf ${l.color ?? "0.11 0.16 0.13"} rg 50 ${y.toFixed(1)} Td (${esc(l.t)}) Tj ET\n`; }
  pages.push(cur);
  const objs: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>"];
  pages.forEach((c, i) => { objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`); objs.push(`<< /Length ${c.length} >>\nstream\n${c}endstream`); });
  let out = "%PDF-1.4\n"; const off: number[] = []; objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Title (${esc(title)}) >> >>\nstartxref\n${x}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}
