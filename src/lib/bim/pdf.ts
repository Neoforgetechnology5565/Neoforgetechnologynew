/** Minimal text-only PDF 1.4 writer (Helvetica / Courier, A4, automatic pagination). Enough for engineering reports; no images or fonts are embedded. */
const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c).replace(/[^\x20-\x7e]/g, (c) => ({ "²": "2", "³": "3", "°": " deg", "±": "+/-", "×": "x", "–": "-", "—": "-", "’": "'", "“": '"', "”": '"', "Ø": "dia", "≥": ">=", "≤": "<=", "→": "->" } as Record<string, string>)[c] ?? "?");
export type PdfLine = { text: string; size?: number; bold?: boolean; mono?: boolean; gap?: number };
export function writePdf(title: string, lines: PdfLine[]): Buffer {
  const W = 595, H = 842, M = 50, usable = H - 2 * M; const pages: string[] = []; let cur: string[] = []; let y = H - M; const flush = () => { pages.push(cur.join("\n")); cur = []; y = H - M; };
  const wrap = (t: string, size: number, mono: boolean) => { const cw = size * (mono ? 0.6 : 0.5); const max = Math.floor((W - 2 * M) / cw); const out: string[] = []; for (const para of t.split("\n")) { let s = para; while (s.length > max) { let cut = s.lastIndexOf(" ", max); if (cut < max * 0.5) cut = max; out.push(s.slice(0, cut)); s = s.slice(cut).trimStart(); } out.push(s); } return out; };
  for (const l of lines) { const size = l.size ?? 10; const lh = size * 1.35; if (l.gap) y -= l.gap; for (const part of wrap(l.text, size, !!l.mono)) { if (y - lh < M) flush(); y -= lh; cur.push(`BT /${l.mono ? "F3" : l.bold ? "F2" : "F1"} ${size} Tf ${M} ${y.toFixed(1)} Td (${esc(part)}) Tj ET`); } }
  if (cur.length || !pages.length) flush(); void usable;
  const objs: string[] = []; const add = (s: string) => objs.push(s) && objs.length;
  add("<< /Type /Catalog /Pages 2 0 R >>"); add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"); add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"); add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  pages.forEach((p, i) => { add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${7 + i * 2} 0 R >>`); add(`<< /Length ${Buffer.byteLength(p)} >>\nstream\n${p}\nendstream`); });
  let out = "%PDF-1.4\n"; const offs: number[] = []; objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; }); const xr = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, "0") + " 00000 n ").join("\n")}\ntrailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Title (${esc(title)}) >> >>\nstartxref\n${xr}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
