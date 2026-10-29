"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { docsApi } from "@/lib/documents/api";
import { FIELD_STATUS_LABEL, LOW_CONF, REVIEW_LABEL, SOURCE_STYLE, type DocInfo, type DocReview, type Field, type FieldStatus, type Health, type ProcessParams, type Results, type SampleInfo } from "@/lib/documents/types";
import PageViewer, { type Layers } from "./PageViewer";

const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40";
const GO = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40";
const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.tif,.tiff,application/pdf,image/png,image/jpeg,image/tiff";
const EXT = /\.(pdf|png|jpe?g|tiff?)$/i;
const NOTICE = "Text from a PDF text layer is exactly what the file contains. Text from OCR is a model's reading of an image and can be wrong, especially digits, small print and poor scans. Fields are produced by explicit rules, not by a language model, and are not verified. Review before using any value.";
type Tab = "text" | "fields" | "tables" | "summary";

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) { return <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>; }

export default function DocumentApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? docsApi(serviceUrl) : null), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">(serviceUrl ? "unknown" : "offline"); const [health, setHealth] = useState<Health | null>(null); const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [doc, setDoc] = useState<DocInfo | null>(null); const [res, setRes] = useState<Results | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<ProcessParams>({ ocr_mode: "auto", deskew: true, enhance: false, sensitivity: "high" });
  const [pageNo, setPageNo] = useState(1); const [tab, setTab] = useState<Tab>("fields"); const [layers, setLayers] = useState<Layers>({ text: true, tables: true, fields: true });
  const [q, setQ] = useState(""); const [selItem, setSelItem] = useState<string | null>(null); const [selField, setSelField] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(""); const [reviewNote, setReviewNote] = useState("");

  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); api.samples().then((s) => setSamples(s.samples)).catch(() => undefined); }, [api]);
  useEffect(() => { if (service !== "offline") return; fetch("/documents/samples/manifest.json").then((r) => r.json()).then((m) => setSamples(m.samples)).catch(() => undefined); }, [service]);

  const load = useCallback(async (id: string) => { if (!api) return; const r = await api.results(id); setRes(r); setPageNo(r.pages[0]?.page ?? 1); setSelItem(null); setSelField(null); setEdit({}); setReviewNote(r.review.note); setTab(r.fields.length ? "fields" : "text"); }, [api]);
  const id = doc?.document_id;
  useEffect(() => {
    if (!api || !id || !doc || !["queued", "running"].includes(doc.status)) return;
    const t = setInterval(async () => { try { const st = await api.status(id); setDoc(st); if (st.status === "completed") await load(id); } catch (e) { setError(e instanceof Error ? e.message : "Lost contact with the service."); } }, 800);
    return () => clearInterval(t);
  }, [api, id, doc, load]);

  const start = async (src: File | SampleInfo) => {
    if (!api) return; setError(""); setMsg(""); setBusy(true); setRes(null);
    try { if (id) await api.remove(id).catch(() => undefined); setDoc(await api.upload(src instanceof File ? src : { sampleId: src.id })); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); setDoc(null); } finally { setBusy(false); }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!EXT.test(f.name) && !/^(application\/pdf|image\/(png|jpeg|tiff))$/.test(f.type)) { setError("Unsupported file type. Upload a PDF, PNG, JPEG or TIFF file."); return; }
    const lim = (health?.limits.max_file_mb ?? 40) * 1_000_000; if (f.size > lim) { setError(`The file is larger than the ${lim / 1_000_000} MB limit.`); return; }
    void start(f);
  };
  const process = async () => { if (!api || !id) return; setError(""); setBusy(true); try { setDoc(await api.process(id, opts)); setRes(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not start."); } finally { setBusy(false); } };

  const page = res?.pages.find((p) => p.page === pageNo) ?? null;
  const matches = useMemo(() => new Set(q.trim() && page ? page.items.filter((i) => i.text.toLowerCase().includes(q.trim().toLowerCase())).map((i) => i.id) : []), [q, page]);
  const allMatches = useMemo(() => (q.trim() && res ? res.pages.reduce((n, p) => n + p.items.filter((i) => i.text.toLowerCase().includes(q.trim().toLowerCase())).length, 0) : 0), [q, res]);
  const patch = async (f: Field, body: { value?: string; status?: FieldStatus; note?: string }) => {
    if (!api || !id) return; setMsg("");
    try { const n = await api.patchField(id, f.id, body); setRes((r) => (r ? { ...r, fields: r.fields.map((x) => (x.id === n.id ? n : x)) } : r)); setEdit((e) => { const c = { ...e }; delete c[f.id]; return c; }); setMsg(`Saved ${f.label ?? f.type}: ${FIELD_STATUS_LABEL[n.status]}.`); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
  };
  const review = async (status: DocReview) => { if (!api || !id) return; try { const r = await api.review(id, status, reviewNote); setRes((x) => (x ? { ...x, review: r } : x)); setMsg(`Document marked: ${REVIEW_LABEL[status]}.`); } catch (e) { setMsg(e instanceof Error ? e.message : "Could not record the review."); } };
  const jumpItem = (itId: string, p: number) => { setPageNo(p); setSelItem(itId); setSelField(null); };
  const running = !!doc && ["queued", "running"].includes(doc.status);
  const flagged = res?.fields.filter((f) => f.flags.length).length ?? 0;
  const pageFields = res?.fields.filter((f) => f.page === pageNo) ?? [];

  return (
    <DemoShell branding={branding} app="AI Document Intelligence & OCR" project={doc?.filename || "No document selected"} status={service === "online" ? "Service online" : service === "offline" ? "Service not connected" : "Checking service…"} badge="Computer Vision · prototype"
      back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision"
      footer="PDF text-layer text is exact; OCR text is a model's reading and can be wrong. Fields come from explicit rules and are unverified until a person reviews them. Sample documents are fictional, generated for this demonstration, except one Apache-2.0 test image from the Tesseract project.">
      <div className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-4">
        <div role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[13px] leading-snug text-amber-100" data-testid="notice"><strong>Check before you rely on it.</strong> {NOTICE}</div>
        {service === "offline" && <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300" role="alert">The document service is not connected, so nothing can be read. Start <code>services/document-ocr</code> and set <code>DOCS_API_URL</code>. No results are shown without it.</div>}
        {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_440px]">
          {/* left */}
          <div className="space-y-4">
            <section className={CARD} aria-label="Document source">
              <h2 className={H3}>1 · Document</h2>
              <label className="mt-3 block cursor-pointer rounded-md border border-dashed border-slate-600 p-3 text-center text-sm text-slate-300 hover:border-blue-500">
                Upload a PDF, PNG, JPEG or TIFF{health ? ` (up to ${health.limits.max_file_mb} MB, ${health.limits.max_pages} pages)` : ""}
                <input type="file" accept={ACCEPT} className="sr-only" data-testid="file-input" disabled={service !== "online" || busy || running} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <div className="mt-3 space-y-2">
                {samples.map((s) => (
                  <div key={s.id} className="rounded-md border border-slate-800 p-2 text-xs text-slate-300">
                    <p className="font-semibold text-slate-100">{s.title}</p><p className="mt-1">{s.description}</p>
                    <details className="mt-1 text-slate-400"><summary className="cursor-pointer">Source and licence</summary><p className="mt-1">{s.provenance}</p><p className="mt-1">{s.licence}</p><p className="mt-1">Does not demonstrate: {s.does_not_demonstrate.join("; ")}.</p></details>
                    <button className={`${BTN} mt-2`} disabled={service !== "online" || busy || running} onClick={() => start(s)} data-testid={`sample-${s.id}`}>Open this sample</button>
                  </div>
                ))}
              </div>
            </section>
            <section className={CARD} aria-label="Processing options">
              <h2 className={H3}>2 · Read it</h2>
              <div className="mt-3 space-y-3 text-xs text-slate-300">
                <label className="block">Text source
                  <select value={opts.ocr_mode} onChange={(e) => setOpts({ ...opts, ocr_mode: e.target.value as ProcessParams["ocr_mode"] })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" data-testid="opt-mode">
                    <option value="auto">Automatic: PDF text layer if there is one, OCR otherwise</option><option value="ocr">OCR every page (ignore any text layer)</option><option value="embedded">PDF text layer only (no OCR)</option>
                  </select></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={opts.deskew} onChange={(e) => setOpts({ ...opts, deskew: e.target.checked })} />Correct skew (OCR pages, up to 8°)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={opts.enhance} onChange={(e) => setOpts({ ...opts, enhance: e.target.checked })} />Enhance contrast and denoise first (slower)</label>
                <label className="block">OCR sensitivity
                  <select value={opts.sensitivity} onChange={(e) => setOpts({ ...opts, sensitivity: e.target.value as ProcessParams["sensitivity"] })} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"><option value="high">High: finds small and faint text, may add noise</option><option value="standard">Standard engine defaults</option></select></label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2"><button className={GO} disabled={!id || busy || running || service !== "online"} onClick={process} data-testid="process">{res ? "Read again" : "Read document"}</button>{running && <button className={BTN} onClick={() => api && id && api.cancel(id)}>Cancel</button>}</div>
              {doc && running && <div className="mt-3" data-testid="progress"><div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{ width: `${Math.round(doc.progress.fraction * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-400">{doc.status === "queued" ? "Queued…" : `${doc.stage} · ${doc.progress.pages_done}/${doc.progress.pages_total} pages · ${doc.progress.elapsed_seconds.toFixed(0)} s`}</p></div>}
              {doc?.status === "failed" && <p className="mt-3 text-xs text-red-300" role="alert">{doc.error}</p>}
              {doc?.status === "cancelled" && <p className="mt-3 text-xs text-slate-400">Cancelled. No results were kept.</p>}
            </section>
            {res && (
              <section className={CARD} aria-label="Pages">
                <h2 className={H3}>Pages</h2>
                <ul className="mt-3 space-y-1">{res.pages.map((p) => <li key={p.page}><button onClick={() => { setPageNo(p.page); setSelItem(null); }} data-testid="page-btn" className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-xs ${p.page === pageNo ? "border-blue-500 bg-slate-800 text-white" : "border-slate-800 text-slate-300 hover:border-slate-600"}`}><span>Page {p.page}</span><Chip cls={SOURCE_STYLE[p.source].chip}>{p.source_label}</Chip></button></li>)}</ul>
              </section>
            )}
            {res && (
              <section className={CARD} aria-label="Document review" data-testid="doc-review">
                <h2 className={H3}>Document review</h2>
                <p className="mt-2 text-xs text-slate-400">Status: <strong className="text-slate-100" data-testid="doc-review-status">{REVIEW_LABEL[res.review.status]}</strong> · {flagged} of {res.fields.length} fields flagged for attention · {res.fields.filter((f) => f.status === "unreviewed").length} unreviewed</p>
                <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} maxLength={1000} rows={2} aria-label="Review note" className="mt-2 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100" />
                <div className="mt-2 flex flex-wrap gap-2">{(["approved", "needs_rework", "rejected"] as const).map((s) => <button key={s} className={BTN} onClick={() => review(s)} data-testid={`doc-${s}`}>{s === "approved" ? "Approve" : s === "needs_rework" ? "Needs rework" : "Reject"}</button>)}</div>
                <p className="mt-2 text-[11px] text-slate-500">Records your decision here only; nothing is sent to any other system.</p>
              </section>
            )}
          </div>

          {/* centre */}
          <div className="min-w-0 space-y-3">
            {page && api && id ? (
              <>
                <PageViewer page={page} src={api.url(page.image_url)} layers={layers} fields={res!.fields} selItem={selItem} selField={selField} matches={matches}
                  onItem={(i) => { setSelItem(i); setSelField(null); setTab("text"); }} onField={(f) => { setSelField(f); setSelItem(null); setTab("fields"); }} />
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                  {(["text", "tables", "fields"] as const).map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} data-testid={`layer-${k}`} />{k === "text" ? "Text lines" : k === "tables" ? "Tables" : "Fields"}</label>)}
                  <span className="ml-auto flex flex-wrap gap-2">{(["txt", "json", "csv", "tables.csv", "pdf"] as const).map((k) => <a key={k} className={BTN} href={api.exportUrl(id, k)} data-testid={`export-${k}`}>{k === "csv" ? "Fields CSV" : k === "tables.csv" ? "Tables CSV" : k === "pdf" ? "Searchable PDF" : k.toUpperCase()}</a>)}</span>
                </div>
                {page.warnings.map((w) => <p key={w} className="text-xs text-amber-300">{w}</p>)}
              </>
            ) : <div className={`${CARD} grid min-h-[360px] place-items-center text-center text-sm text-slate-400`} data-testid="viewer-empty">Choose a document and press “Read document”. Nothing is shown until the service has read it.</div>}
          </div>

          {/* right */}
          <div className="space-y-3 lg:col-span-2 xl:col-span-1">
            <div className={CARD}>
              <div role="tablist" className="flex flex-wrap gap-1 text-xs">{(["fields", "text", "tables", "summary"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`} className={`rounded-md border px-3 py-1.5 font-medium ${tab === t ? "border-blue-500 text-white" : "border-slate-700 text-slate-300 hover:border-slate-500"}`}>{t === "fields" ? `Fields${res ? ` (${res.fields.length})` : ""}` : t === "text" ? "Text" : t === "tables" ? `Tables${res ? ` (${res.summary.tables})` : ""}` : "Summary"}</button>)}</div>
              {!res && <p className="mt-4 text-sm text-slate-400" data-testid="empty-panel">Fields, text, tables and the summary appear here after the document has been read.</p>}

              {res && tab === "fields" && (
                <div className="mt-3" data-testid="fields-panel">
                  <p className="text-xs text-slate-400">Each value was derived by a rule from the text shown in the page view. “Corrected” values are yours and are kept next to the original.</p>
                  {res.fields.length === 0 && <p className="mt-3 text-sm text-slate-300" data-testid="no-fields">No fields were found by the rules in this document.</p>}
                  <ul className="mt-3 max-h-[62vh] space-y-2 overflow-auto pr-1">
                    {res.fields.map((f) => (
                      <li key={f.id} data-testid="field-row" className={`rounded-md border p-2 text-xs ${f.id === selField ? "border-purple-500 bg-slate-800" : "border-slate-800"}`}>
                        <div className="flex flex-wrap items-center gap-2"><button className="font-semibold text-slate-100 hover:underline" onClick={() => { setSelField(f.id); setPageNo(f.page); }}>{f.label ?? f.type}</button><Chip cls="border-slate-600 text-slate-300">{f.type}{f.currency ? ` ${f.currency}` : ""}</Chip><Chip cls={f.origin === "manual" ? "border-green-500/50 bg-green-500/10 text-green-300" : "border-purple-500/50 bg-purple-500/10 text-purple-300"}>{f.origin === "manual" ? "typed by you" : "rule-parsed"}</Chip><Chip cls={SOURCE_STYLE[f.based_on].chip}>from {SOURCE_STYLE[f.based_on].label}</Chip><span className="ml-auto text-slate-500">p.{f.page}</span></div>
                        <div className="mt-2 flex gap-2"><input aria-label={`Value of ${f.label ?? f.type}`} value={edit[f.id] ?? f.current_value} onChange={(e) => setEdit({ ...edit, [f.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && edit[f.id] !== undefined && edit[f.id] !== f.current_value) void patch(f, { value: edit[f.id] }); }} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" data-testid="field-input" />
                          <button className={BTN} disabled={edit[f.id] === undefined || edit[f.id] === f.current_value} onClick={() => patch(f, { value: edit[f.id] })} data-testid="field-save">Save</button></div>
                        {f.current_value !== f.original_value && <p className="mt-1 text-slate-400">Original: <span className="text-slate-300" data-testid="field-original">{f.original_value}</span></p>}
                        <p className="mt-1 text-slate-500">Rule: {f.rule}{f.ocr_confidence !== null ? ` · OCR confidence ${f.ocr_confidence.toFixed(2)}` : ""}</p>
                        {f.flags.map((x) => <p key={x} className={x.startsWith("low OCR") || x.startsWith("arithmetic") || x.startsWith("ambiguous") ? "mt-1 text-amber-300" : "mt-1 text-slate-400"}>⚑ {x}</p>)}
                        <div className="mt-2 flex flex-wrap items-center gap-2"><Chip cls="border-slate-600 text-slate-200"><span data-testid="field-status">{FIELD_STATUS_LABEL[f.status]}</span></Chip>
                          <button className={BTN} onClick={() => patch(f, { status: "confirmed" })} data-testid="field-confirm">Confirm</button><button className={BTN} onClick={() => patch(f, { status: "rejected" })} data-testid="field-reject">Reject</button>{f.status !== "unreviewed" && <button className={BTN} onClick={() => patch(f, { status: "unreviewed" })}>Reset</button>}</div>
                      </li>
                    ))}
                  </ul>
                  {msg && <p className="mt-2 text-xs text-slate-300" role="status" data-testid="msg">{msg}</p>}
                </div>
              )}

              {res && tab === "text" && (
                <div className="mt-3" data-testid="text-panel">
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this document…" aria-label="Search text" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100" data-testid="search" />
                  {q.trim() && <p className="mt-1 text-xs text-slate-400" data-testid="search-count">{allMatches} matching line{allMatches === 1 ? "" : "s"} in the document; {matches.size} on this page.</p>}
                  <ul className="mt-2 max-h-[62vh] space-y-1 overflow-auto pr-1">
                    {res.pages.flatMap((p) => p.items.filter((i) => !q.trim() || i.text.toLowerCase().includes(q.trim().toLowerCase())).map((i) => ({ p: p.page, i }))).map(({ p, i }) => (
                      <li key={i.id}><button data-testid="text-line" onClick={() => jumpItem(i.id, p)} className={`flex w-full items-start gap-2 rounded border px-2 py-1 text-left text-xs ${i.id === selItem ? "border-yellow-400 bg-slate-800" : "border-slate-800 hover:border-slate-600"}`}>
                        <span className="shrink-0 text-slate-500">p{p}</span><span className="min-w-0 flex-1 break-words text-slate-100">{i.text}</span>
                        <span className={`shrink-0 ${i.conf !== null && i.conf < LOW_CONF ? "text-red-400" : "text-slate-500"}`}>{i.conf === null ? "text layer" : i.conf.toFixed(2)}</span></button></li>
                    ))}
                  </ul>
                </div>
              )}

              {res && tab === "tables" && (
                <div className="mt-3 space-y-4" data-testid="tables-panel">
                  {res.summary.tables === 0 && <p className="text-sm text-slate-300" data-testid="no-tables">No ruled tables were found. Tables without ruling lines are not detected.</p>}
                  {res.pages.flatMap((p) => p.tables).map((t) => (
                    <div key={t.id} className="text-xs"><p className="font-semibold text-slate-100">Table {t.id} · page {t.page} · {t.rows} rows × {t.cols} columns</p><p className="text-slate-400">{t.method}. The first row is assumed to be the header. {t.empty_cells} empty cell(s).</p>
                      <div className="mt-1 max-h-72 overflow-auto"><table className="w-full border-collapse text-left" data-testid="table-grid"><tbody>{t.cells.map((row, r) => <tr key={r} className={r === 0 ? "bg-slate-800 font-semibold" : ""}>{row.map((c, k) => <td key={k} className="border border-slate-700 px-2 py-1 text-slate-100">{c || <span className="text-slate-600">∅</span>}</td>)}</tr>)}</tbody></table></div></div>
                  ))}
                </div>
              )}

              {res && tab === "summary" && (
                <div className="mt-3 space-y-3 text-xs text-slate-300" data-testid="summary">
                  <div><p className="font-semibold text-slate-100">Document type: <span data-testid="class-label">{res.classification.label}</span></p><p className="text-slate-400">{res.classification.method}. {res.classification.note}</p>
                    {Object.entries(res.classification.matched).map(([c, k]) => <p key={c}>{c}: {k.join(", ")}</p>)}</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1">{[["Pages", res.summary.pages], ["Text items", res.summary.text_items], ["From PDF text layer", res.summary.items_by_source.embedded_text ?? 0], ["From OCR", res.summary.ocr_lines], ["Tables", res.summary.tables], ["Fields", res.summary.fields], ["Fields flagged", res.summary.fields_flagged], ["Processing time", `${res.summary.seconds.total} s`]].map(([k, v]) => <div key={String(k)}><dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt><dd className="font-semibold text-white">{v}</dd></div>)}</dl>
                  {res.summary.ocr_confidence ? <p>OCR line confidence: mean {res.summary.ocr_confidence.mean}, lowest {res.summary.ocr_confidence.min}; {res.summary.ocr_confidence["lines_below_0.85"]} line(s) below {LOW_CONF}. This is the engine’s own score, not the probability the text is right.</p> : <p>No OCR was used, so there are no confidence scores: the text is exactly what the PDF contains.</p>}
                  <div><p className="font-semibold text-slate-100">Checks between values</p>{res.validations.length === 0 ? <p className="text-slate-400">None could be run (the needed amounts or table columns were not found).</p> : <ul className="space-y-1" data-testid="validations">{res.validations.map((v) => <li key={v.rule} className={v.passed ? "text-green-400" : "text-amber-300"}>{v.passed ? "✓" : "✗"} {v.rule}: <span className="text-slate-300">{v.detail}</span></li>)}</ul>}</div>
                  <div><p className="font-semibold text-slate-100">Per page</p><ul className="space-y-1" data-testid="page-info">{res.pages.map((p) => <li key={p.page}>Page {p.page}: {p.source_label}, {p.items.length} text items, {p.tables.length} table(s){p.ocr ? `, OCR ${p.ocr.seconds} s (${p.ocr.sensitivity} sensitivity)` : ""}{p.preprocessing.deskew ? (p.preprocessing.deskew.applied ? `, skew corrected by ${p.preprocessing.deskew.correction_degrees}°` : `, no skew correction needed (estimated ${p.preprocessing.deskew.estimated_degrees}°)`) : ""}{p.preprocessing.enhance ? ", contrast enhanced" : ""}</li>)}</ul></div>
                  {res.warnings.map((w) => <p key={w} className="text-amber-300">{w}</p>)}
                  <details><summary className="cursor-pointer text-slate-200">What the labels mean</summary><ul className="mt-1 list-disc space-y-1 pl-5">{Object.entries(res.legend).map(([k, v]) => <li key={k}><strong>{k.replace("_", " ")}</strong>: {v}</li>)}</ul></details>
                  <details><summary className="cursor-pointer text-slate-200">Limitations</summary><ul className="mt-1 list-disc space-y-1 pl-5">{res.limitations.map((l) => <li key={l}>{l}</li>)}</ul></details>
                  <p className="text-slate-500">Engine: {res.ocr_engine.name} ({res.ocr_engine.licence}). {res.ocr_engine.languages}.</p>
                </div>
              )}
              {res && pageFields.length > 0 && tab !== "fields" && <p className="mt-3 text-xs text-slate-500">{pageFields.length} field(s) on this page. Open the Fields tab to review them.</p>}
            </div>
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
