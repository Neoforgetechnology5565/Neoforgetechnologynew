"use client";
/** PDF text layers and page rendering in the browser (pdf.js). */
import { err, mk, ctx2, type Cvs } from "./core";
type Pdfjs = typeof import("pdfjs-dist");
let lib: Promise<Pdfjs> | null = null;
const pdfjs = () => (lib ??= import("pdfjs-dist").then((m) => { m.GlobalWorkerOptions.workerSrc = "/ml/ocr/pdf.worker.min.mjs"; return m; }));
export async function openPdf(data: ArrayBuffer, maxPages: number) {
  const m = await pdfjs(); let doc;
  try { doc = await m.getDocument({ data: new Uint8Array(data.slice(0)) }).promise; } catch (e) { return err(422, /password/i.test(String((e as Error).message)) ? "The PDF is password-protected." : "The PDF could not be opened. The file may be damaged."); }
  if (doc.numPages > maxPages) err(422, `The PDF has ${doc.numPages} pages; this demo reads up to ${maxPages}.`); return doc;
}
export async function pageText(doc: Awaited<ReturnType<typeof openPdf>>, n: number): Promise<string> {
  const tc = await (await doc.getPage(n)).getTextContent(); let out = "", lastY: number | null = null;
  for (const it of tc.items as { str: string; transform: number[]; hasEOL?: boolean }[]) { const y = it.transform[5]; if (lastY !== null && Math.abs(y - lastY) > 2) out += "\n"; out += it.str; if (it.hasEOL) out += "\n"; lastY = y; }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export async function renderPage(doc: Awaited<ReturnType<typeof openPdf>>, n: number, maxSide = 2200): Promise<Cvs> {
  const pg = await doc.getPage(n), v1 = pg.getViewport({ scale: 1 }), s = Math.min(200 / 72, maxSide / Math.max(v1.width, v1.height)), vp = pg.getViewport({ scale: s }), c = mk(vp.width, vp.height), g = ctx2(c);
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: g, viewport: vp }).promise; return c;
}
