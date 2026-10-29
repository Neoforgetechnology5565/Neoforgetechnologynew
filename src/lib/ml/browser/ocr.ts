"use client";
/** OCR and simple field extraction in the browser: PDF text layers via pdf.js, scanned pages and images via Tesseract.js (LSTM, English). All assets are served from this site. */
import { cleanName, decodeImage, err, fileOf, LIMITS, numOf, readUpload, sampleBlob, scaled, sniff, strOf, toUrl, type Cvs } from "./core";
import { openPdf, pageText, renderPage } from "./pdf";

const RE_DATE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s*\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/gi;
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, RE_AMOUNT = /[£$€]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*\.\d{2}\s?(?:USD|EUR|GBP)\b/g, RE_PHONE = /(?<![\w/])\+\d[\d\s().-]{6,16}\d/g;
const RE_KV = /^\s*(invoice\s*(?:no|number|#)|order\s*(?:no|number|#)|po\s*(?:no|number|#)|reference|ref)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-/_.]{2,})\s*$/i;
interface Line { text: string; bbox: number[] | null; confidence: number | null }
interface Page { page: number; source: string; text: string; lines: Line[]; image: string }
function findFields(pages: Page[]) {
  const out: Record<string, unknown>[] = [];
  for (const p of pages) for (const ln of p.lines) {
    for (const [typ, rx] of [["date", RE_DATE], ["email", RE_EMAIL], ["amount", RE_AMOUNT], ["phone", RE_PHONE]] as const) for (const m of ln.text.matchAll(rx)) out.push({ type: typ, value: m[0].trim(), page: p.page, line: ln.text, confidence: ln.confidence, rule: `${typ} pattern` });
    const m = ln.text.match(RE_KV); if (m) out.push({ type: "reference", label: m[1], value: m[2], page: p.page, line: ln.text, confidence: ln.confidence, rule: "reference label followed by an id" });
  }
  return out;
}
let workerP: Promise<import("tesseract.js").Worker> | null = null;
const worker = () => (workerP ??= import("tesseract.js").then((T) => T.createWorker("eng", 1, { workerPath: "/ml/ocr/worker.min.js", corePath: "/ml/ocr/", langPath: "/ml/ocr/lang", gzip: true })).catch((e) => { workerP = null; throw e; }));
async function runOcr(c: Cvs): Promise<Line[]> {
  let w; try { w = await worker(); } catch { return err(503, "The OCR engine could not be loaded in this browser. Check your connection and try again."); }
  const { data } = await w.recognize(c, {}, { blocks: true }), lines: Line[] = [];
  const raw = (data as unknown as { lines?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[]; blocks?: { paragraphs: { lines: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] });
  const all = raw.lines ?? raw.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)) ?? [];
  for (const l of all) { const t = l.text.trim(); if (t) lines.push({ text: t, bbox: [l.bbox.x0 / c.width, l.bbox.y0 / c.height, l.bbox.x1 / c.width, l.bbox.y1 / c.height].map((v) => Math.round(v * 10000) / 10000), confidence: Math.round((l.confidence / 100) * 1000) / 1000 }); }
  return lines;
}
const thumb = (c: Cvs) => toUrl(c.width > 1100 ? scaled(c, 1100, Math.round((c.height * 1100) / c.width)) : c, "image/jpeg", 0.8);
export async function ocr(f: FormData) {
  const file = fileOf(f, "file"), sid = strOf(f, "sample_id"), force = strOf(f, "force_ocr") === "true"; if ((file === null) === (sid === null)) err(400, "Send either a file or a sample_id.");
  let blob: Blob, name: string;
  if (sid !== null) { const r = await sampleBlob(sid, "document"); blob = r.blob; name = r.item.file; } else { const u = await readUpload(file!, LIMITS.max_doc_mb, ["jpg", "png", "webp", "tiff", "pdf"], "a PDF, PNG, JPEG, WebP or TIFF file"); blob = u.blob; name = cleanName(file!.name); }
  const kind = (await sniff(blob)) ?? "image", t0 = performance.now(), pages: Page[] = [];
  if (kind === "pdf") {
    const doc = await openPdf(await blob.arrayBuffer(), 10);
    for (let i = 1; i <= doc.numPages; i++) {
      const txt = (await pageText(doc, i)).trim(), img = await renderPage(doc, i);
      if (txt.length >= 20 && !force) pages.push({ page: i, source: "pdf_text_layer", text: txt, lines: txt.split("\n").filter((l) => l.trim()).map((l) => ({ text: l, bbox: null, confidence: null })), image: thumb(img) });
      else { const lines = await runOcr(img); pages.push({ page: i, source: "ocr", text: lines.map((l) => l.text).join("\n"), lines, image: thumb(img) }); }
    }
  } else { const img = await decodeImage(blob), lines = await runOcr(img); pages.push({ page: 1, source: "ocr", text: lines.map((l) => l.text).join("\n"), lines, image: thumb(img) }); }
  const chars = pages.reduce((a, p) => a + p.text.length, 0), confs = pages.flatMap((p) => p.lines.map((l) => l.confidence)).filter((x): x is number => x !== null);
  void numOf;
  return { filename: name, format: kind, pages, characters: chars, seconds: Math.round((performance.now() - t0) / 10) / 100, fields: findFields(pages), ocr: { engine: "Tesseract.js 5 (LSTM, English, running in your browser)", mean_confidence: confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 1000) / 1000 : null, lines: confs.length },
    message: chars === 0 ? "No text was found in this document." : null, note: "OCR text can contain mistakes, especially digits and small print; the confidence is the engine's own score. Fields come from simple patterns (dates, e-mail addresses, currency amounts, +phone numbers, reference numbers); anything that does not match a pattern is not extracted." };
}
