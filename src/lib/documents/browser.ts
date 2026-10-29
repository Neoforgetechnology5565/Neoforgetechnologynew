"use client";
/** In-browser engine for the document-intelligence demo: same API shape as docsApi (the FastAPI service), so the UI is unchanged. PDF text layers via pdf.js, scans and images via Tesseract.js, then the same rule-based layout, field, check and classification logic as the service (layout.ts, extract.ts). Nothing is uploaded. */
import { decodeImage, mk, ctx2, sniff, type Cvs } from "@/lib/ml/browser/core";
import { ocrWorker } from "@/lib/ml/browser/ocr";
import { openPdf } from "@/lib/ml/browser/pdf";
import type { Gray } from "@/lib/med/ops";
import { DocsApiError } from "./api";
import { classify, extractFields, LOW_CONF, validations, type FieldOut, type Validation } from "./extract";
import { estimateSkew, fillGrid, findGrids, headings, ruleMask, rowText, rows, type Item, type Table } from "./layout";
import type { DocInfo, DocReview, Field, FieldStatus, Health, Page, ProcessParams, Results, SampleInfo } from "./types";

const NOTICE = "OCR and field extraction are fallible. Review every value before relying on it.";
const LIMITS_TEXT = [
  "OCR is imperfect (digits, small print, dropped spaces, poor scans); its confidence is the engine's own score, not the probability that the text is right.",
  "Fields come from regular expressions and a short label list, not a language model, and stay unverified until a person reviews them; ambiguous dates are flagged instead of guessed.",
  "Tables are found only when they are drawn with ruling lines. No named-entity recognition, handwriting or non-Latin scripts. The class label is a keyword vote.",
  "This browser engine reads text from PDFs with pdf.js (positions are per text run, so field boxes inside a run are approximate) and recognises scans with Tesseract.js (English), a different OCR engine from the one the server uses.",
  "Skew correction is by projection profile (up to ±8°); pages rotated by 90° are not corrected.",
];
const OCR_ENGINE: Health["ocr"] = { name: "Tesseract.js 5 (LSTM, English, running in your browser)", licence: "Apache-2.0", languages: "English", note: "Gives a confidence for every recognised word; it is the engine's own score, not the probability that the text is right." };
const MAX_MB = 15, MAX_PAGES = 10, MAX_MP = 25;
const SOURCE_LABEL: Record<string, string> = { embedded_text: "PDF text layer", ocr_model: "OCR" };
const fail = (s: number, m: string): never => { throw new DocsApiError(s, m); };
const r3 = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

interface Page2 extends Page { image_url: string; text: string }
interface Doc {
  id: string; filename: string; format: string; size: number; source: string; blob: Blob; kind: "pdf" | "image"; status: DocInfo["status"]; stage: string; error: string | null; pagesCount: number | null; done: number; total: number; started: number; finished: number; cancel: boolean;
  review: DocInfo["review"]; params: ProcessParams; pages: Page2[]; fields: Field[]; validations: Validation[]; classification: ReturnType<typeof classify>; warnings: string[]; summary: Results["summary"] | null; pageImages: Cvs[]; pdfUrl: string | null; pageSizePt: [number, number][];
}
const store = new Map<string, Doc>(); const need = (id: string) => store.get(id) ?? fail(404, "Document not found or expired.");
let manifest: (SampleInfo & { file_web?: string })[] | null = null;
const getManifest = async () => (manifest ??= (await (await fetch("/documents/samples/manifest.json")).json()).samples as (SampleInfo & { file_web?: string })[]);
const docJson = (d: Doc): DocInfo => ({ document_id: d.id, filename: d.filename, format: d.format, size_bytes: d.size, source: d.source, status: d.status, stage: d.stage, error: d.error, pages: d.pagesCount, progress: { pages_done: d.done, pages_total: d.total, fraction: d.status === "completed" ? 1 : d.total ? Math.min(0.99, d.done / d.total) : 0, elapsed_seconds: r3(((d.finished || Date.now()) - (d.started || Date.now())) / 1000, 2) }, review: d.review });

/* ───────── image helpers ───────── */
const grayOf = (c: Cvs): Gray => { const { width: w, height: h } = c, px = ctx2(c).getImageData(0, 0, w, h).data, g: Gray = { w, h, d: new Uint8ClampedArray(w * h) }; for (let i = 0; i < w * h; i++) g.d[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]); return g; };
/** A copy of the page with table ruling lines painted white, so the OCR engine reads the text in the cells and not the rules. */
function eraseRules(c: Cvs): Cvs {
  const { width: w, height: h } = c, m = ruleMask(grayOf(c)), o = mk(w, h), g = ctx2(o); g.drawImage(c, 0, 0); const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { const k = (yy * w + xx) * 4; d[k] = d[k + 1] = d[k + 2] = 255; } }
  g.putImageData(im, 0, 0); return o;
}
function rotateCanvas(c: Cvs, deg: number): Cvs { const o = mk(c.width, c.height), g = ctx2(o); g.fillStyle = "#fff"; g.fillRect(0, 0, o.width, o.height); g.translate(o.width / 2, o.height / 2); g.rotate((-deg * Math.PI) / 180); g.drawImage(c, -c.width / 2, -c.height / 2); return o; } // canvas rotate is clockwise; the correction angle is counter-clockwise
async function enhanceCanvas(c: Cvs): Promise<Cvs> {
  const { clahe, median, make } = await import("@/lib/med/ops"), { width: w, height: h } = c, g = ctx2(c), im = g.getImageData(0, 0, w, h), L = make(w, h); for (let i = 0; i < w * h; i++) L.d[i] = Math.round(0.299 * im.data[i * 4] + 0.587 * im.data[i * 4 + 1] + 0.114 * im.data[i * 4 + 2]);
  const E = median(clahe(L, 8, 2), 1); for (let i = 0; i < w * h; i++) { const k = (E.d[i] + 1) / (L.d[i] + 1); for (let q = 0; q < 3; q++) im.data[i * 4 + q] = Math.min(255, im.data[i * 4 + q] * k); } const o = mk(w, h); ctx2(o).putImageData(im, 0, 0); return o;
}
/* ───────── text sources ───────── */
interface RawWord { text: string; bbox: [number, number, number, number]; conf: number }
/** Words of one text line are merged into items, splitting at wide gaps so table columns stay separate items (same rule as the PDF text-layer reader). */
function segments(line: RawWord[], lh: number, hasSpaceBetween: (a: RawWord, b: RawWord) => boolean, W: number): { text: string; bbox: [number, number, number, number]; conf: number | null }[] {
  const out: RawWord[][] = [[line[0]]];
  for (let i = 1; i < line.length; i++) { const prev = line[i - 1], cur = line[i], gap = (cur.bbox[0] - prev.bbox[2]) * W; if (gap > 1.0 * lh || (gap > 0.3 * lh && !hasSpaceBetween(prev, cur))) out.push([cur]); else out[out.length - 1].push(cur); }
  return out.map((s) => ({ text: s.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(), bbox: [Math.min(...s.map((w) => w.bbox[0])), Math.min(...s.map((w) => w.bbox[1])), Math.max(...s.map((w) => w.bbox[2])), Math.max(...s.map((w) => w.bbox[3]))] as [number, number, number, number], conf: null as number | null })).filter((s) => s.text);
}
async function pdfItems(page: import("pdfjs-dist").PDFPageProxy): Promise<{ text: string; bbox: [number, number, number, number]; conf: null }[]> {
  const vp = page.getViewport({ scale: 1 }), W = vp.width, H = vp.height, tc = await page.getTextContent(), runs: { str: string; x0: number; x1: number; y0: number; y1: number; h: number }[] = [];
  for (const it of tc.items as { str: string; transform: number[]; width: number; height: number }[]) {
    if (!it.str || !it.str.trim()) continue; const [a, b, , d, e, f] = it.transform, hh = Math.max(Math.abs(d), Math.hypot(a, b), it.height || 0); if (hh <= 0 || Math.abs(b) > 0.2 * Math.abs(a)) continue; // skip rotated runs
    runs.push({ str: it.str, x0: e / W, x1: (e + it.width) / W, y0: 1 - (f + 0.8 * hh) / H, y1: 1 - (f - 0.2 * hh) / H, h: hh });
  }
  if (!runs.length) return [];
  const lines: typeof runs[] = []; for (const r of [...runs].sort((p, q) => (p.y0 + p.y1) / 2 - (q.y0 + q.y1) / 2)) { const c = (r.y0 + r.y1) / 2, ln = lines.find((l) => Math.abs(c - l.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / l.length) <= 0.5 * Math.max(r.y1 - r.y0, 0.02)); if (ln) ln.push(r); else lines.push([r]); }
  const out: { text: string; bbox: [number, number, number, number]; conf: null }[] = [];
  for (const ln of lines) {
    ln.sort((p, q) => p.x0 - q.x0); const lh = ln.map((r) => r.h).sort((p, q) => p - q)[Math.floor(ln.length / 2)]; let cur = [ln[0]]; const flush = () => { const txt = cur.map((r) => r.str).join("").trim(); if (txt) out.push({ text: txt, bbox: [Math.min(...cur.map((r) => r.x0)), Math.min(...cur.map((r) => r.y0)), Math.max(...cur.map((r) => r.x1)), Math.max(...cur.map((r) => r.y1))].map((v) => r3(v, 5)) as [number, number, number, number], conf: null }); };
    for (let i = 1; i < ln.length; i++) { const prev = ln[i - 1], r = ln[i], gap = (r.x0 - prev.x1) * W; if (gap > 1.0 * lh || (gap > 0.3 * lh && !/\s$/.test(prev.str) && !/^\s/.test(r.str))) { flush(); cur = [r]; } else cur.push(r); } flush();
  }
  return out;
}
async function ocrItems(c: Cvs): Promise<{ text: string; bbox: [number, number, number, number]; conf: number | null }[]> {
  let w; try { w = await ocrWorker(); } catch { return fail(503, "The OCR engine could not be loaded in this browser. Check your connection and try again."); }
  const { data } = await w.recognize(c, {}, { blocks: true }) as unknown as { data: { blocks?: { paragraphs: { lines: { words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] }[]; lines?: { words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] } };
  const lines = data.lines ?? data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)) ?? [], items: { text: string; bbox: [number, number, number, number]; conf: number | null }[] = [];
  for (const l of lines) {
    const words: RawWord[] = l.words.filter((x) => x.text.trim()).map((x) => ({ text: x.text.trim(), bbox: [x.bbox.x0 / c.width, x.bbox.y0 / c.height, x.bbox.x1 / c.width, x.bbox.y1 / c.height] as [number, number, number, number], conf: x.confidence / 100 })); if (!words.length) continue;
    const lh = Math.max(...words.map((x) => (x.bbox[3] - x.bbox[1]) * c.height)), segs = segments(words, lh, () => true, c.width);
    for (const s of segs) { const inside = words.filter((x) => x.bbox[0] >= s.bbox[0] - 1e-6 && x.bbox[2] <= s.bbox[2] + 1e-6); s.conf = inside.length ? r3(inside.reduce((a, x) => a + x.conf, 0) / inside.length) : null; items.push({ ...s, bbox: s.bbox.map((v) => r3(v, 5)) as [number, number, number, number] }); }
  }
  return items;
}
/* ───────── searchable PDF export ───────── */
async function searchablePdf(d: Doc): Promise<string> {
  const chunks: (string | Uint8Array)[] = [], offs: number[] = []; let len = 0; const enc = new TextEncoder(); const put = (s: string | Uint8Array) => { chunks.push(s); len += typeof s === "string" ? enc.encode(s).length : s.length; };
  const obj = (n: number, body: string | (string | Uint8Array)[]) => { offs[n] = len; put(`${n} 0 obj\n`); for (const b of Array.isArray(body) ? body : [body]) put(b); put("\nendobj\n"); };
  put("%PDF-1.4\n"); const np = d.pages.length; // objects: 1 catalog, 2 pages, 3 font, then per page: page, content, image
  const jpgs: Uint8Array[] = []; for (const c of d.pageImages) jpgs.push(new Uint8Array(await (await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.88))).arrayBuffer()));
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>"); obj(2, `<< /Type /Pages /Kids [${d.pages.map((_, i) => `${4 + i * 3} 0 R`).join(" ")}] /Count ${np} >>`); obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  let replaced = 0;
  d.pages.forEach((p, i) => {
    const [W, H] = d.pageSizePt[i], base = 4 + i * 3; let cs = `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q\n`;
    for (const it of p.items) { const [x0, y0, x1, y1] = it.bbox, bh = (y1 - y0) * H, bw = (x1 - x0) * W, fs = Math.max(2, bh * 0.8), raw = it.text, txt = raw.replace(/[^\x20-\x7e]/g, () => { replaced++; return "?"; }).replace(/([\\()])/g, "\\$1"), est = txt.length * fs * 0.5; if (bw <= 0 || est <= 0) continue; cs += `BT 3 Tr /F1 ${fs.toFixed(2)} Tf ${Math.max(10, Math.min(400, (bw / est) * 100)).toFixed(1)} Tz ${(x0 * W).toFixed(2)} ${(H - y1 * H + bh * 0.2).toFixed(2)} Td (${txt}) Tj ET\n`; }
    obj(base, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`); obj(base + 1, `<< /Length ${enc.encode(cs).length} >>\nstream\n${cs}endstream`);
    obj(base + 2, [`<< /Type /XObject /Subtype /Image /Width ${d.pageImages[i].width} /Height ${d.pageImages[i].height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgs[i].length} >>\nstream\n`, jpgs[i], "\nendstream"]);
  });
  const total = 3 + np * 3, xref = len; put(`xref\n0 ${total + 1}\n0000000000 65535 f \n${Array.from({ length: total }, (_, k) => String(offs[k + 1]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  void replaced; return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "application/pdf" }));
}
/* ───────── analysis ───────── */
async function run(d: Doc, p: ProcessParams & { pages?: [number, number] | null }) {
  const t0 = performance.now(), stageT = { render: 0, text_layer: 0, preprocess: 0, ocr: 0, layout: 0, fields: 0 }; d.pages = []; d.pageImages = []; d.pageSizePt = []; d.fields = []; d.warnings = [];
  try {
    d.status = "running"; d.stage = "opening"; let pdf: Awaited<ReturnType<typeof openPdf>> | null = null, n = 1;
    if (d.kind === "pdf") { pdf = await openPdf(await d.blob.arrayBuffer(), MAX_PAGES); n = pdf.numPages; } if (p.ocr_mode === "embedded" && d.kind !== "pdf") fail(400, "Images have no text layer. Use ocr_mode auto or ocr.");
    const lo = Math.max(1, p.pages?.[0] ?? 1), hi = Math.min(n, p.pages?.[1] ?? n); if (lo > hi) fail(400, "The page range is outside the document."); d.total = hi - lo + 1; d.done = 0; d.pagesCount = n;
    const allTables: Table[] = [], texts: string[] = [];
    for (let pno = lo; pno <= hi; pno++) {
      if (d.cancel) { d.status = "cancelled"; d.stage = "cancelled"; d.finished = Date.now(); return; }
      let t = performance.now(), img: Cvs, sizePt: [number, number], pg: import("pdfjs-dist").PDFPageProxy | null = null;
      if (pdf) { pg = await pdf.getPage(pno); const v1 = pg.getViewport({ scale: 1 }), s = Math.min(150 / 72, 2200 / Math.max(v1.width, v1.height)), vp = pg.getViewport({ scale: s }); img = mk(vp.width, vp.height); const g = ctx2(img); g.fillStyle = "#fff"; g.fillRect(0, 0, img.width, img.height); await pg.render({ canvasContext: g, viewport: vp }).promise; sizePt = [v1.width, v1.height]; }
      else { img = await decodeImage(d.blob, MAX_MP); const s = Math.min(1, 2200 / Math.max(img.width, img.height)); if (s < 1) { const o = mk(img.width * s, img.height * s); ctx2(o).drawImage(img, 0, 0, o.width, o.height); img = o; } sizePt = [(img.width * 72) / 150, (img.height * 72) / 150]; }
      stageT.render += performance.now() - t; const warn: string[] = [], pre: Page["preprocessing"] = { deskew: null, enhance: false }; let raw: { text: string; bbox: [number, number, number, number]; conf: number | null }[] = [], origin = "ocr_model", ocrInfo: Page["ocr"] = null;
      const rotated = !!pg && pg.rotate % 360 !== 0;
      if (pg && p.ocr_mode !== "ocr" && !rotated) { t = performance.now(); raw = await pdfItems(pg); stageT.text_layer += performance.now() - t; origin = "embedded_text"; if (raw.reduce((s, i) => s + i.text.length, 0) < 20 && p.ocr_mode === "auto") { raw = []; origin = "ocr_model"; } else if (!raw.length && p.ocr_mode === "embedded") warn.push("This page has no text layer and OCR was switched off, so no text was read."); }
      else if (pg && rotated && p.ocr_mode !== "ocr") warn.push(`The page is rotated by ${pg.rotate} degrees in the PDF; the text layer was not used and OCR was applied instead.`);
      if (origin === "ocr_model" && !(p.ocr_mode === "embedded" && !raw.length && pg)) {
        t = performance.now(); d.stage = `page ${pno}: preparing`;
        if (p.deskew) { await new Promise((r) => setTimeout(r, 0)); const { angle, gain } = estimateSkew(grayOf(img)); if (Math.abs(angle) >= 0.3 && gain >= 1.05) { img = rotateCanvas(img, angle); pre.deskew = { applied: true, correction_degrees: r3(angle, 2), evidence_gain: r3(gain, 2) }; } else pre.deskew = { applied: false, estimated_degrees: r3(angle, 2), evidence_gain: r3(gain, 2) }; }
        let ocrIn = eraseRules(img); if (p.enhance) { ocrIn = await enhanceCanvas(ocrIn); pre.enhance = true; } stageT.preprocess += performance.now() - t;
        d.stage = `page ${pno}: recognising text`; t = performance.now(); raw = await ocrItems(ocrIn); const dt = performance.now() - t; stageT.ocr += dt; ocrInfo = { engine: OCR_ENGINE.name, seconds: r3(dt / 1000, 2), lines: raw.length, sensitivity: p.sensitivity };
        const tall = raw.filter((i) => i.text.length > 3 && (i.bbox[3] - i.bbox[1]) * img.height > 2 * (i.bbox[2] - i.bbox[0]) * img.width).length; if (raw.length && tall > 0.5 * raw.length) warn.push("Most recognised lines are vertical: the page may be rotated by 90 degrees, which this engine does not correct."); if (!raw.length) warn.push("No text was recognised on this page.");
      }
      const items: Item[] = raw.map((r, k) => ({ ...r, id: `p${pno}-l${k + 1}`, source: origin, conf: r.conf })); t = performance.now(); d.stage = `page ${pno}: layout`;
      const grids = findGrids(grayOf(img)), tables: Table[] = [], inTable = new Set<Item>(); grids.forEach((g, k) => { const { table, used } = fillGrid(g, items, k + 1, pno); tables.push(table); used.forEach((u) => inTable.add(u)); });
      for (const it of items) it.in_table = inTable.has(it); const rws = rows(items); rws.forEach((r, ri) => r.forEach((it) => (it.row = ri))); const heads = headings(items, inTable); stageT.layout += performance.now() - t;
      t = performance.now(); const flds = extractFields(pno, rws, inTable, (it) => it.source ?? "ocr_model") as unknown as Field[]; stageT.fields += performance.now() - t; d.fields.push(...flds); allTables.push(...tables); const pageText = rws.map((r) => rowText(r)).join("\n"); texts.push(pageText);
      const blob = await new Promise<Blob>((res) => img.toBlob((b) => res(b!), "image/png")); d.pageImages.push(img); d.pageSizePt.push(sizePt);
      d.pages.push({ page: pno, width_px: img.width, height_px: img.height, source: origin as Page["source"], source_label: SOURCE_LABEL[origin], items: items.map((it) => ({ id: it.id, text: it.text, bbox: it.bbox, source: it.source as Page["source"], conf: it.conf, row: it.row ?? 0, in_table: !!it.in_table })), tables, headings: heads, preprocessing: pre, ocr: ocrInfo, warnings: warn, image_url: URL.createObjectURL(blob), text: pageText } as Page2);
      d.done = pno - lo + 1;
    }
    for (const pg of d.pages) d.warnings.push(...pg.warnings.map((w) => `Page ${pg.page}: ${w}`));
    d.validations = validations(d.fields as unknown as FieldOut[], allTables); d.classification = classify(texts.join("\n"), allTables.length);
    const confs = d.pages.flatMap((pg) => pg.items.map((i) => i.conf)).filter((c): c is number => c !== null), bySrc: Record<string, number> = {}; for (const pg of d.pages) bySrc[pg.source] = (bySrc[pg.source] ?? 0) + pg.items.length;
    d.summary = { pages: d.pages.length, text_items: Object.values(bySrc).reduce((a, b) => a + b, 0), items_by_source: bySrc, ocr_lines: bySrc.ocr_model ?? 0, ocr_confidence: confs.length ? { mean: r3(confs.reduce((a, b) => a + b, 0) / confs.length), min: r3(Math.min(...confs)), "lines_below_0.85": confs.filter((c) => c < LOW_CONF).length } : null, tables: allTables.length, fields: d.fields.length, fields_by_type: Object.fromEntries([...new Set(d.fields.map((f) => f.type))].sort().map((t) => [t, d.fields.filter((f) => f.type === t).length])), fields_flagged: d.fields.filter((f) => f.flags.length).length, validations: { run: d.validations.length, failed: d.validations.filter((v) => !v.passed).length }, seconds: { render: r3(stageT.render / 1000, 2), text_layer: r3(stageT.text_layer / 1000, 2), preprocess: r3(stageT.preprocess / 1000, 2), ocr: r3(stageT.ocr / 1000, 2), layout: r3(stageT.layout / 1000, 2), fields: r3(stageT.fields / 1000, 2), total: r3((performance.now() - t0) / 1000, 2) } };
    if (d.pages.some((x) => x.source === "embedded_text")) d.warnings.push("Pages read from a PDF text layer show what the file contains; whoever made the PDF (or an earlier OCR run) decided that text, and it can differ from what the page image shows.");
    d.stage = "exporting"; d.pdfUrl = await searchablePdf(d).catch(() => null); d.status = "completed"; d.stage = "done"; d.finished = Date.now();
  } catch (e) { d.status = "failed"; d.error = e instanceof Error ? e.message : "Processing failed."; d.finished = Date.now(); }
}
function results(d: Doc): Results {
  if (d.status === "queued" || d.status === "running") fail(409, "Processing is still running."); if (d.status !== "completed" || !d.summary) fail(409, `No results: the document is ${d.status}.`);
  return { ...docJson(d), pages: d.pages as unknown as Results["pages"], summary: d.summary, classification: d.classification, fields: d.fields, validations: d.validations, warnings: d.warnings, params: { ocr_mode: d.params.ocr_mode, deskew: d.params.deskew, enhance: d.params.enhance, sensitivity: d.params.sensitivity, pages: null }, ocr_engine: OCR_ENGINE, limitations: LIMITS_TEXT,
    legend: { embedded_text: "text read from the PDF's own text layer (exact; no recognition)", ocr_model: "text recognised from the page image by the OCR model (can be wrong)", rule_parsed: "a value derived from that text by an explicit rule", manual: "a value you typed" } } as unknown as Results;
}
const csvq = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
const stem = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[^\w-]/g, "_").slice(0, 40) || "document";
export function browserDocs() {
  return {
    url: (p: string) => p,
    health: async (): Promise<Health> => ({ ok: true, notice: NOTICE, limitations: LIMITS_TEXT, ocr: OCR_ENGINE, limits: { max_file_mb: MAX_MB, max_pages: MAX_PAGES, max_megapixels: MAX_MP, render_dpi: 150, max_concurrent_jobs: 1 } }),
    samples: async () => ({ samples: await getManifest() }),
    upload: async (src: File | { sampleId: string }): Promise<DocInfo> => {
      let blob: Blob, name: string, source: string;
      if (src instanceof File) { if (!src.size) fail(400, "The file is empty."); if (src.size > MAX_MB * 1e6) fail(413, `The file is larger than the ${MAX_MB} MB limit.`); blob = src; name = src.name.replace(/[^\w.\- ]/g, "_").slice(-80); source = "upload"; }
      else { const s = (await getManifest()).find((x) => x.id === src.sampleId) ?? fail(404, "Unknown sample."), r = await fetch(`/documents/samples/${s.file_web ?? s.file}`); if (!r.ok) fail(404, "The sample could not be loaded."); blob = await r.blob(); name = s.file_web ?? s.file; source = `sample: ${s.title}`; }
      const kind0 = await sniff(blob); if (!kind0 || !["pdf", "png", "jpg", "webp", "tiff"].includes(kind0)) fail(415, "Unsupported file. Upload a PDF, PNG, JPEG or WebP image."); if (kind0 === "tiff") fail(422, "This browser cannot open TIFF images. Convert the image to PNG or JPEG and try again.");
      const kind = kind0 === "pdf" ? "pdf" : "image", id = crypto.randomUUID().replace(/-/g, ""); let pages: number | null = null;
      if (kind === "pdf") { pages = (await openPdf(await blob.arrayBuffer(), MAX_PAGES)).numPages; } else await decodeImage(blob, MAX_MP).then(() => (pages = 1));
      const d: Doc = { id, filename: name, format: kind0 as string, size: blob.size, source, blob, kind, status: "uploaded", stage: "uploaded", error: null, pagesCount: pages, done: 0, total: 0, started: 0, finished: 0, cancel: false, review: { status: "unreviewed", note: "", reviewed_at: null }, params: { ocr_mode: "auto", deskew: true, enhance: false, sensitivity: "high" }, pages: [], fields: [], validations: [], classification: classify("", 0), warnings: [], summary: null, pageImages: [], pdfUrl: null, pageSizePt: [] };
      store.set(id, d); return docJson(d);
    },
    process: async (id: string, p: ProcessParams): Promise<DocInfo> => {
      const d = need(id), mode = p.ocr_mode ?? "auto", sens = p.sensitivity ?? "high"; if (!["auto", "ocr", "embedded"].includes(mode)) fail(400, "ocr_mode must be auto, ocr or embedded."); if (!["standard", "high"].includes(sens)) fail(400, "sensitivity must be standard or high.");
      if (d.kind !== "pdf" && mode === "embedded") fail(400, "Images have no text layer; use ocr_mode auto or ocr."); if ([...store.values()].some((x) => x.status === "running")) fail(503, "Another document is being read in this page. Wait for it or cancel it.");
      d.params = { ocr_mode: mode, deskew: p.deskew ?? true, enhance: p.enhance ?? false, sensitivity: sens }; d.status = "queued"; d.stage = "queued"; d.cancel = false; d.error = null; d.started = Date.now(); d.finished = 0; d.summary = null; if (d.pdfUrl) URL.revokeObjectURL(d.pdfUrl); d.pdfUrl = null; void run(d, d.params); return docJson(d);
    },
    status: async (id: string) => docJson(need(id)),
    cancel: async (id: string) => { const d = need(id); if (d.status === "queued" || d.status === "running") d.cancel = true; return { status: d.status }; },
    remove: async (id: string) => { const d = store.get(id); if (d) { d.pages.forEach((p) => URL.revokeObjectURL(p.image_url)); if (d.pdfUrl) URL.revokeObjectURL(d.pdfUrl); store.delete(id); } return { deleted: true }; },
    results: async (id: string) => results(need(id)),
    patchField: async (id: string, fid: string, body: { value?: string; status?: FieldStatus; note?: string }): Promise<Field> => {
      const d = need(id); results(d); const f = d.fields.find((x) => x.id === fid) ?? fail(404, "Field not found."); if (!body || !Object.keys(body).length || Object.keys(body).some((k) => !["value", "status", "note"].includes(k))) fail(400, "Send value, status and/or note.");
      let st = body.status; if (st !== undefined && !["unreviewed", "confirmed", "corrected", "rejected"].includes(st)) fail(400, "status must be one of: unreviewed, confirmed, corrected, rejected.");
      if ("note" in body) { if (typeof body.note !== "string") fail(400, "note must be text."); f.note = body.note!.trim().slice(0, 500); }
      if ("value" in body) { const v = body.value; if (typeof v !== "string" || v.length > 500) fail(400, "value must be text of at most 500 characters."); f.current_value = (v as string).trim(); if (st === undefined) st = f.current_value !== f.original_value ? "corrected" : "unreviewed"; f.origin = f.current_value !== f.original_value ? "manual" : "rule_parsed"; }
      if (st !== undefined) { if (st === "corrected" && f.current_value === f.original_value) fail(400, "The value has not been changed, so it cannot be marked corrected."); f.status = st; } return { ...f };
    },
    review: async (id: string, status: DocReview, note: string) => { const d = need(id); results(d); if (!["unreviewed", "approved", "needs_rework", "rejected"].includes(status)) fail(400, "status must be one of: unreviewed, approved, needs_rework, rejected."); d.review = { status, note: (note ?? "").trim().slice(0, 1000), reviewed_at: status === "unreviewed" ? null : Date.now() / 1000 }; return d.review; },
    exportUrl: (id: string, kind: "txt" | "json" | "csv" | "tables.csv" | "pdf") => {
      const d = store.get(id); if (!d || d.status !== "completed") return ""; const data = (mime: string, s: string) => `data:${mime};charset=utf-8,${encodeURIComponent(s)}`;
      if (kind === "pdf") return d.pdfUrl ?? "";
      if (kind === "txt") return data("text/plain", [`${d.filename}\nExtracted ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by the Neo Forge document intelligence demo.\n${NOTICE}\n`, ...d.pages.map((p) => `\n--- Page ${p.page} (${p.source_label}) ---\n${p.text}`)].join("\n"));
      if (kind === "json") return data("application/json", JSON.stringify(results(d), (k, v) => (k === "image_url" ? undefined : v), 1));
      if (kind === "csv") return data("text/csv", [["field_id", "page", "type", "label", "original_value", "current_value", "status", "origin_of_current_value", "text_source", "rule", "ocr_confidence", "flags", "bbox_x0", "bbox_y0", "bbox_x1", "bbox_y1", "note"].join(","), ...d.fields.map((f) => [f.id, f.page, f.type, csvq(f.label), csvq(f.original_value), csvq(f.current_value), f.status, f.origin, f.based_on, csvq(f.rule), f.ocr_confidence ?? "", csvq(f.flags.join("; ")), ...f.bbox, csvq(f.note)].join(","))].join("\n"));
      return data("text/csv", ["table_id,page,row,col,text", ...d.pages.flatMap((p) => p.tables.flatMap((t) => t.cells.flatMap((row, ri) => row.map((c, ci) => [t.id, p.page, ri + 1, ci + 1, csvq(c)].join(",")))))].join("\n"));
    },
    exportName: (id: string, kind: "txt" | "json" | "csv" | "tables.csv" | "pdf") => { const d = store.get(id); const s = stem(d?.filename ?? "document"); return kind === "csv" ? `${s}-fields.csv` : kind === "tables.csv" ? `${s}-tables.csv` : kind === "pdf" ? `${s}-searchable.pdf` : `${s}.${kind}`; },
  };
}
