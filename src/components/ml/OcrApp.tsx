"use client";
import { useState } from "react";
import type { Branding } from "@/lib/types";
import { csvCell, download } from "@/lib/ml/api";
import { BTN, CARD, Dropzone, ErrorBox, H3, MlShell, PreviewFeatures, SamplePicker, StatusChip, useMl, useRun } from "./common";

interface Line { text: string; bbox: number[] | null; confidence: number | null }
interface Page { page: number; source: "pdf_text_layer" | "ocr"; text: string; lines: Line[]; image: string }
interface Field { type: string; value: string; label?: string; page: number; line: string; confidence: number | null; rule: string }
interface Res { filename: string; format: string; pages: Page[]; characters: number; seconds: number; fields: Field[]; ocr: { engine: string; mean_confidence: number | null; lines: number }; message: string | null; note: string }

export default function OcrApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, health, samples } = useMl(serviceUrl, "document");
  const { busy, error, result, source, run } = useRun<Res>(api, "/api/ocr", /\.(pdf|png|jpe?g|webp|tiff?)$|^(application\/pdf|image\/)/i, health?.limits ? 15 : 15);
  const [pg, setPg] = useState(1); const [copied, setCopied] = useState(false); const [force, setForce] = useState(false);
  const page = result?.pages.find((p) => p.page === pg) ?? result?.pages[0];
  const all = result?.pages.map((p) => `--- Page ${p.page} (${p.source === "ocr" ? "OCR" : "PDF text layer"}) ---\n${p.text}`).join("\n\n") ?? "";
  return (
    <MlShell branding={branding} title="OCR & Intelligent Document Extraction" project={source?.name ?? "No document selected"} service={service}
      notice="Text comes from the PDF's own text layer when it has one, otherwise from a real OCR model (RapidOCR / PP-OCR) that can misread characters, especially digits and small print. Fields are matched by simple patterns; anything that does not match is not extracted."
      footer="Working: text extraction from PDFs and images, page boundaries, copy and download, pattern-based fields. Not implemented: handwriting, invoice automation, identity verification, advanced understanding, multilingual workflows (previews below). Sample documents are fictional or Apache-2.0.">
      <ErrorBox msg={error} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className={H3}>1 · Document <StatusChip s="working" /></h2>
          <Dropzone label="Upload a PDF, PNG, JPEG, WebP or TIFF (up to 15 MB, 10 PDF pages)" accept=".pdf,image/*,.tif,.tiff" disabled={service !== "online" || busy} onFile={(f) => { setPg(1); void run(f, { force_ocr: force }); }} />
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} data-testid="force-ocr" />Ignore a PDF&apos;s text layer and run OCR</label>
          <SamplePicker samples={samples} disabled={service !== "online" || busy} onPick={(s) => { setPg(1); void run(s, { force_ocr: force }); }} />
        </section>
        <section className={CARD} data-testid="result">
          <h2 className={H3}>2 · Extracted text</h2>
          {busy && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Reading the document…</p>}
          {!busy && !result && <p className="mt-3 text-sm text-slate-400" data-testid="empty">Choose a document. No text is shown until the service has read it.</p>}
          {result && page && !busy && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-400">{result.pages.length} page(s) · {result.characters} characters · {result.seconds} s · {result.ocr.mean_confidence !== null ? `OCR mean line confidence ${result.ocr.mean_confidence} over ${result.ocr.lines} lines` : "no OCR confidence (text layer)"}</p>
              {result.message && <p className="text-sm text-amber-200" data-testid="no-text">{result.message}</p>}
              <div className="flex flex-wrap gap-2">{result.pages.map((p) => <button key={p.page} className={`${BTN} ${p.page === page.page ? "border-blue-500 text-white" : ""}`} onClick={() => setPg(p.page)} data-testid="page-btn">Page {p.page} · {p.source === "ocr" ? "OCR" : "text layer"}</button>)}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={page.image} alt={`Page ${page.page}`} className="w-full rounded-md bg-white" data-testid="page-image" />
                  {page.lines.filter((l) => l.bbox).map((l, i) => <div key={i} className="pointer-events-none absolute border border-amber-400" style={{ left: `${l.bbox![0] * 100}%`, top: `${l.bbox![1] * 100}%`, width: `${(l.bbox![2] - l.bbox![0]) * 100}%`, height: `${(l.bbox![3] - l.bbox![1]) * 100}%`, borderColor: (l.confidence ?? 1) < 0.85 ? "#ef4444" : "#f59e0b" }} data-testid="line-box" />)}
                </div>
                <div><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-100" data-testid="text">{page.text || "(no text on this page)"}</pre>
                  <div className="mt-2 flex flex-wrap gap-2"><button className={BTN} onClick={async () => { await navigator.clipboard?.writeText(page.text).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }} data-testid="copy">{copied ? "Copied" : "Copy page text"}</button>
                    <button className={BTN} onClick={() => download(`${result.filename}.txt`, all, "text/plain")} data-testid="dl-text">Download all text (.txt)</button></div></div>
              </div>
              <div data-testid="fields"><h3 className="text-xs font-semibold text-slate-300">Fields found by patterns</h3>
                {result.fields.length === 0 ? <p className="mt-1 text-xs text-slate-400" data-testid="no-fields">No dates, e-mail addresses, currency amounts, phone numbers or reference numbers matched. Nothing was inferred.</p> :
                  <><table className="mt-1 w-full text-left text-xs"><thead className="text-slate-400"><tr><th>Type</th><th>Value</th><th>Page</th><th>OCR confidence</th><th>Rule</th></tr></thead><tbody>{result.fields.map((f, i) => <tr key={i} className="border-t border-slate-800"><td className="py-1">{f.label ?? f.type}</td><td className="text-white">{f.value}</td><td>{f.page}</td><td>{f.confidence ?? "–"}</td><td className="text-slate-400">{f.rule}</td></tr>)}</tbody></table>
                    <button className={`${BTN} mt-2`} onClick={() => download(`${result.filename}-fields.csv`, ["type,label,value,page,ocr_confidence,source_line,rule", ...result.fields.map((f) => [f.type, f.label, f.value, f.page, f.confidence, f.line, f.rule].map(csvCell).join(","))].join("\n"))} data-testid="dl-fields">Download fields (CSV)</button></>}
              </div>
              <p className="text-xs text-slate-500">{result.note} Engine: {result.ocr.engine}.</p>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Handwriting recognition", status: "soon", note: "the OCR model is for printed text." },
        { name: "Invoice automation", status: "external", note: "it would need accounting-system integration; see the Document Intelligence demo for rule-parsed fields." },
        { name: "Identity document verification", status: "external", note: "no verification service is connected and none should be inferred from OCR." },
        { name: "Advanced document understanding", status: "soon", note: "no layout or language model is installed." },
        { name: "Multilingual document workflows", status: "preview", note: "only Latin-script and Chinese character sets are covered by the model." },
      ]} />
    </MlShell>
  );
}
