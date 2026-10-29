"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { InspectApiError, inspectApi } from "@/lib/defects/api";
import { browserInspect } from "@/lib/defects/browser";
import { DECISION_LABEL, DECISION_STYLE, DEFAULT_RULES, type Decision, type Health, type Inspection, type ReferenceInfo, type Region, type Rules, type SampleImage, type Summary } from "@/lib/defects/types";
import ImageViewer, { type ViewerHandle } from "./ImageViewer";

const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500 hover:text-white disabled:opacity-40";
const GO = "rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40";
const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const INPUT = "rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100";
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const when = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
type Pending = { key: string; name: string; state: "inspecting" | "failed"; error?: string };

function Badge({ d, pre }: { d: Decision; pre?: string }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${DECISION_STYLE[d]}`}>{pre}{DECISION_LABEL[d]}</span>;
}

export default function DefectApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? inspectApi(serviceUrl) : browserInspect()), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">("unknown"); const [health, setHealth] = useState<Health | null>(null);
  const [refs, setRefs] = useState<ReferenceInfo[]>([]); const [refId, setRefId] = useState(""); const [samples, setSamples] = useState<SampleImage[]>([]);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES); const [list, setList] = useState<Summary[]>([]); const [pending, setPending] = useState<Pending[]>([]);
  const [cur, setCur] = useState<Inspection | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"original" | "annotated">("original"); const [heat, setHeat] = useState(true); const [heatOpacity, setHeatOpacity] = useState(0.7); const [boxes, setBoxes] = useState(true); const [dataset, setDataset] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(new Set()); const [sel, setSel] = useState<number | null>(null); const [regionReview, setRegionReview] = useState<Record<string, "confirmed" | "dismissed" | "pending">>({});
  const [notes, setNotes] = useState(""); const [reviewer, setReviewer] = useState(""); const [reviewMsg, setReviewMsg] = useState(""); const [tab, setTab] = useState<"gallery" | "history">("gallery");
  const [refName, setRefName] = useState(""); const [refFiles, setRefFiles] = useState<File[]>([]); const [refBuilding, setRefBuilding] = useState<string | null>(null);
  const viewer = useRef<ViewerHandle>(null);
  const ref = refs.find((r) => r.id === refId);

  const refreshList = useCallback(() => { if (api) api.list().then((r) => setList(r.inspections)).catch(() => undefined); }, [api]);
  useEffect(() => {
    if (!api) return;
    api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline"));
    api.references().then((r) => { setRefs(r.references); setRefId((id) => id || r.references[0]?.id || ""); }).catch(() => undefined);
    api.samples().then((s) => setSamples(s.samples)).catch(() => undefined); refreshList();
  }, [api, refreshList]);
  useEffect(() => { // static sample thumbnails do not need the service; keep the list visible when it is offline
    if (service !== "offline") return; fetch("/defects/samples/manifest.json").then((r) => r.json()).then((m) => setSamples(m.samples.map((s: SampleImage) => ({ ...s, image_url: `/defects/samples/${s.file}` })))).catch(() => undefined);
  }, [service]);

  const open = useCallback(async (id: string) => {
    if (!api) return; setError(""); setReviewMsg("");
    try { const m = await api.get(id); setCur(m); setHidden(new Set()); setSel(null); setNotes(m.review.current?.notes ?? ""); setReviewer(m.review.current?.reviewer ?? ""); setRegionReview(m.review.current?.region_reviews ?? {}); setMode("original"); setDataset(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open the inspection."); }
  }, [api]);

  const run = async (src: File | SampleImage, key: string, name: string) => {
    if (!api || !refId) return; setPending((p) => [...p, { key, name, state: "inspecting" }]);
    try {
      const m = await api.inspect(src instanceof File ? src : { sampleId: src.id }, refId, rules);
      setPending((p) => p.filter((x) => x.key !== key)); refreshList(); setCur(m); setHidden(new Set()); setSel(null); setNotes(""); setReviewer(""); setRegionReview({}); setMode("original"); setDataset(false); setReviewMsg("");
    } catch (e) { setPending((p) => p.map((x) => (x.key === key ? { ...x, state: "failed", error: e instanceof Error ? e.message : "Inspection failed." } : x))); }
  };
  const upload = async (files: FileList | null) => {
    if (!files || !api) return; setError("");
    const limit = (health?.limits.max_image_mb ?? 20) * 1_000_000;
    for (const f of Array.from(files)) {
      const key = `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`;
      if (!IMG_EXT.test(f.name) && !f.type.startsWith("image/")) { setPending((p) => [...p, { key, name: f.name, state: "failed", error: "Unsupported file type. Upload a JPEG, PNG or WebP image." }]); continue; }
      if (f.size > limit) { setPending((p) => [...p, { key, name: f.name, state: "failed", error: `Larger than the ${limit / 1_000_000} MB limit.` }]); continue; }
      await run(f, key, f.name);
    }
  };

  const setRule = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules((r) => ({ ...r, [k]: v }));
  const reeval = async () => { if (!api || !cur) return; setBusy(true); setError(""); try { const m = await api.reevaluate(cur.id, rules); setCur(m); refreshList(); } catch (e) { setError(e instanceof Error ? e.message : "Could not re-evaluate."); } finally { setBusy(false); } };
  const submitReview = async (action: "confirm" | "override", decision?: Decision) => {
    if (!api || !cur) return; setBusy(true); setReviewMsg("");
    try { const m = await api.review(cur.id, { action, decision, notes, reviewer, region_reviews: regionReview }); setCur(m); refreshList(); setReviewMsg(`Recorded: ${DECISION_LABEL[m.review.current!.decision]}${m.review.current!.agrees_with_recommendation ? " (agrees with the recommendation)" : " (overrides the recommendation)"}.`); }
    catch (e) { setReviewMsg(e instanceof Error ? e.message : "Could not record the review."); } finally { setBusy(false); }
  };
  const buildRef = async () => {
    if (!api) return; setError(""); setBusy(true);
    try { const i = await api.buildReference(refName || "Custom part", refFiles); setRefBuilding(i.id); setRefs((r) => [...r, i]);
      const poll = window.setInterval(async () => { try { const s = await api.reference(i.id); setRefs((r) => r.map((x) => (x.id === i.id ? s : x))); if (s.status !== "building") { window.clearInterval(poll); setRefBuilding(null); if (s.status === "ready") setRefId(s.id); else setError(s.error || "The reference could not be built."); } } catch { window.clearInterval(poll); setRefBuilding(null); } }, 1200);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not build the reference."); } finally { setBusy(false); }
  };
  const del = async () => { if (!api || !cur) return; await api.remove(cur.id).catch(() => undefined); setCur(null); refreshList(); };
  const historyCsv = () => {
    const rows = [["id", "time", "file", "reference", "score_ratio", "flagged_regions", "recommendation", "human_decision"], ...list.map((s) => [s.id, new Date(s.created_at * 1000).toISOString(), s.filename, s.reference, s.score_ratio, s.flagged_regions, s.recommendation, s.human_decision ?? ""])];
    const u = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" })); const a = document.createElement("a"); a.href = u; a.download = "inspection-history.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
  };

  const flagged = cur?.model_output.regions.filter((r) => r.status === "flagged") ?? [];
  const sampleRefs = samples.filter((s) => !refId || s.reference_id === refId);
  const rv = cur?.review.current ?? null;
  const stale = !!rv && rv.recommendation_at_review !== cur?.recommendation.decision;

  return (
    <DemoShell branding={branding} app="AI Visual Inspection & Defect Detection" project={cur?.filename || "No part selected"} status={service === "online" ? "Service online" : service === "offline" ? "Service not connected" : "Checking service…"} badge="Computer Vision · prototype"
      back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision"
      footer="The model finds where a part looks unusual compared with good examples of the same part; it does not name defect types. Scores are distances, not probabilities. Recommendations follow the configured rules and are not certified quality assurance: a person decides. Sample images are from the VisA dataset (CC BY 4.0).">
      <div className="mx-auto max-w-[112rem] space-y-3 p-3 sm:p-4">
        {/* ---------- part type, rules ---------- */}
        <section className={CARD} aria-label="Part type and rules">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-300">Part type (reference of good parts)
              <select className={`${INPUT} mt-1 block min-w-60`} value={refId} onChange={(e) => setRefId(e.target.value)} data-testid="ref-select" disabled={service !== "online"}>
                {refs.map((r) => <option key={r.id} value={r.id} disabled={r.status !== "ready"}>{r.name}{r.kind === "custom" ? " (custom)" : ""}{r.status === "building" ? " — building…" : ""}</option>)}
              </select>
            </label>
            <label className={`${GO} cursor-pointer ${service !== "online" || !refId || ref?.status !== "ready" ? "pointer-events-none opacity-40" : ""}`}>Inspect images…<input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" data-testid="upload" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label>
            {service === "online" && <details className="w-full min-w-0 text-xs text-slate-300 sm:w-auto"><summary className="cursor-pointer rounded-md border border-slate-600 px-3 py-1.5 hover:border-amber-500" data-testid="build-ref-toggle">Build a reference from my good images</summary>
              <div className="mt-1 w-full max-w-full rounded-lg sm:w-[26rem] border border-slate-700 bg-slate-950 p-3">
                <p className="text-[11px] leading-snug text-slate-400">Upload {health?.limits.min_reference_images ?? 10}–{health?.limits.max_reference_images ?? 60} photos of GOOD parts of one kind, taken the same way you will inspect them. 30 or more covering normal variation gives a trustworthy threshold; fewer are marked unvalidated and can never auto-PASS.</p>
                <input className={`${INPUT} mt-2 w-full`} placeholder="Name of the part" value={refName} onChange={(e) => setRefName(e.target.value)} maxLength={60} aria-label="Reference name" data-testid="ref-name" />
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="mt-2 block text-xs" onChange={(e) => setRefFiles(Array.from(e.target.files ?? []))} data-testid="ref-files" />
                <div className="mt-2 flex items-center gap-2"><button type="button" className={BTN} disabled={busy || !!refBuilding || refFiles.length < (health?.limits.min_reference_images ?? 10)} onClick={() => void buildRef()} data-testid="ref-build">{refBuilding ? "Building…" : `Build from ${refFiles.length} image(s)`}</button>
                  {ref?.kind === "custom" && <button type="button" className={BTN} onClick={() => { void api!.deleteReference(ref.id).then(() => { setRefs((r) => r.filter((x) => x.id !== ref.id)); setRefId(refs.find((x) => x.kind === "builtin")?.id ?? ""); }); }}>Delete this custom reference</button>}</div>
              </div></details>}
            <span className="ml-auto text-xs text-slate-500" data-testid="service-state">{service === "online" ? `${health?.builtin_references} built-in references · ${health?.backbone}` : service === "unknown" ? "checking…" : "inspection service not connected"}</span>
          </div>
          {ref && <p className="mt-2 text-[11px] leading-snug text-slate-400" data-testid="ref-info">
            {ref.kind === "builtin" ? "Built from VisA good images (CC BY 4.0)." : "Built from your images."} {ref.good_images} good images · flag threshold {ref.threshold} (distance units).{" "}
            {ref.evaluation ? <>On VisA’s held-out test images: image AUROC <b className="text-slate-200">{ref.evaluation.image_auroc}</b>, pixel AUROC {ref.evaluation.pixel_auroc}; at the threshold it flagged {(ref.evaluation.at_threshold.true_positive_rate * 100).toFixed(0)}% of {ref.evaluation.test_anomalous} anomalous and {(ref.evaluation.at_threshold.false_positive_rate * 100).toFixed(0)}% of {ref.evaluation.test_normal} good parts.</> : null}{ref.notes.map((n) => ` ${n}`)}</p>}
          <details className="mt-3 text-xs text-slate-300" open><summary className="cursor-pointer text-slate-400">Quality rules (applied to new inspections; “Apply to this inspection” re-evaluates the stored result)</summary>
            <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2" data-testid="rules">
              <label>Max flagged defects<input className={`${INPUT} ml-2 w-16`} type="number" min={0} max={100} value={rules.max_defects} onChange={(e) => setRule("max_defects", Number(e.target.value))} data-testid="r-max" /></label>
              <label title="A region is flagged when its peak score divided by the reference threshold reaches this value">Min score ratio to flag<input className={`${INPUT} ml-2 w-16`} type="number" step={0.05} min={0.3} max={5} value={rules.min_score_ratio} onChange={(e) => setRule("min_score_ratio", Number(e.target.value))} data-testid="r-min" /></label>
              <label title="Between this ratio and the flag ratio the part goes to manual review">Review band from<input className={`${INPUT} ml-2 w-16`} type="number" step={0.05} min={0.3} max={5} value={rules.review_band} onChange={(e) => setRule("review_band", Number(e.target.value))} data-testid="r-band" /></label>
              <label>Ignore regions under (% of image)<input className={`${INPUT} ml-2 w-20`} type="number" step={0.005} min={0} max={50} value={rules.min_region_area_pct} onChange={(e) => setRule("min_region_area_pct", Number(e.target.value))} /></label>
              <label title="Optional severity rule. Empty = severity not configured">“Major” from (% of image)<input className={`${INPUT} ml-2 w-20`} type="number" step={0.1} min={0} max={100} value={rules.major_area_pct ?? ""} placeholder="off" onChange={(e) => setRule("major_area_pct", e.target.value === "" ? null : Number(e.target.value))} data-testid="r-major" /></label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={rules.fail_on_major_only} disabled={rules.major_area_pct === null} onChange={(e) => setRule("fail_on_major_only", e.target.checked)} />Only major count</label>
              <label>Auto-PASS needs ≥ good images<input className={`${INPUT} ml-2 w-16`} type="number" min={1} value={rules.min_reference_images} onChange={(e) => setRule("min_reference_images", Number(e.target.value))} /></label>
              <button type="button" className={BTN} onClick={() => setRules(DEFAULT_RULES)}>Defaults</button>
              <button type="button" className={BTN} disabled={!cur || busy} onClick={() => void reeval()} data-testid="reeval">Apply to this inspection</button>
            </div>
          </details>
          {error && <p role="alert" className="mt-3 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200" data-testid="error">{error}</p>}
          {service === "offline" && <p className="mt-3 rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300" data-testid="offline-note">Inspection needs the Python service (<code>services/defect-inspector</code>), which runs the anomaly-detection model. It is not connected to this site, so nothing can be inspected here and no example results are shown in its place. See <code>docs/defects/DEPLOYMENT.md</code> and set <code>DEFECT_API_URL</code>.</p>}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[17rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)_28rem]">
          {/* ---------- gallery / history ---------- */}
          <section className={`${CARD} min-w-0`} aria-label="Parts">
            <div role="tablist" aria-label="Parts view" className="mb-2 flex gap-1">
              {([["gallery", "Part gallery"], ["history", "History"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} type="button" className={`${BTN} ${tab === k ? "border-amber-500 text-white" : ""}`} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{l}</button>)}
            </div>
            {tab === "gallery" ? (
              <div className="space-y-2" data-testid="gallery">
                {pending.map((p) => <div key={p.key} className="rounded border border-slate-700 bg-slate-950 p-2 text-xs" data-testid="pending-card"><p className="truncate text-slate-200">{p.name}</p><p className={p.state === "failed" ? "text-red-300" : "text-amber-300"}>{p.state === "failed" ? p.error : "Inspecting…"}</p>{p.state === "failed" && <button type="button" className="mt-1 text-slate-400 underline" onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}>dismiss</button>}</div>)}
                {list.map((s) => (
                  <button key={s.id} type="button" onClick={() => void open(s.id)} className={`flex w-full gap-2 rounded border p-2 text-left text-xs ${cur?.id === s.id ? "border-amber-500 bg-amber-500/10" : "border-slate-700 bg-slate-950 hover:border-slate-500"}`} data-testid={`card-${s.id.slice(0, 8)}`} aria-current={cur?.id === s.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={api!.url(s.thumb_url)} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                    <span className="min-w-0"><span className="block truncate text-slate-100">{s.filename}</span><span className="block text-[11px] text-slate-500">{when(s.created_at)}</span>
                      <span className="mt-1 flex flex-wrap gap-1"><Badge d={s.recommendation} />{s.human_decision && <Badge d={s.human_decision} pre="✓ " />}</span></span>
                  </button>
                ))}
                {!list.length && !pending.length && <p className="text-xs text-slate-500" data-testid="gallery-empty">No parts inspected yet. Upload images or open a sample below.</p>}
                <div className="border-t border-slate-800 pt-2"><h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sample parts (VisA, CC BY 4.0)</h3>
                  <ul className="space-y-1" data-testid="samples">
                    {sampleRefs.map((s) => (
                      <li key={s.id}><button type="button" className="flex w-full items-center gap-2 rounded border border-slate-800 p-1 text-left text-[11px] text-slate-300 hover:border-amber-500 disabled:opacity-40" disabled={service !== "online" || ref?.status !== "ready"} onClick={() => void run(s, `sample-${s.id}-${Date.now()}`, s.title)} data-testid={`sample-${s.id}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.image_url.startsWith("http") || s.image_url.startsWith("/defects") ? s.image_url : api!.url(s.image_url)} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /><span className="min-w-0 truncate">{s.title}</span></button></li>
                    ))}
                    {!sampleRefs.length && <li className="text-[11px] text-slate-500">No sample for this part type.</li>}
                  </ul>
                  {samples[0] && <p className="mt-1 text-[10px] leading-snug text-slate-500">{samples[0].attribution}. {samples[0].modification}.</p>}
                </div>
              </div>
            ) : (
              <div data-testid="history"><div className="mb-2 flex items-center justify-between text-xs text-slate-400"><span>{list.length} inspection(s) this session (kept {Math.round((health?.limits.inspection_ttl_seconds ?? 86400) / 3600)} h, then deleted)</span><button type="button" className={BTN} onClick={historyCsv} disabled={!list.length} data-testid="history-csv">CSV</button></div>
                <div className="max-h-[32rem] overflow-auto"><table className="w-full text-[11px] text-slate-300"><thead className="text-left text-slate-500"><tr><th>Part</th><th>Auto</th><th>Human</th></tr></thead><tbody>
                  {list.map((s) => <tr key={s.id} className="cursor-pointer border-t border-slate-800 hover:bg-slate-800/60" onClick={() => { void open(s.id); setTab("gallery"); }}><td className="max-w-[7rem] truncate py-1">{s.filename}</td><td><Badge d={s.recommendation} /></td><td>{s.human_decision ? <Badge d={s.human_decision} /> : <span className="text-slate-600">—</span>}</td></tr>)}
                </tbody></table></div></div>
            )}
          </section>

          {/* ---------- viewer ---------- */}
          <section className={`${CARD} min-w-0`} aria-label="Inspection viewer">
            {cur ? (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                  <h2 className={H3}>Viewer</h2>
                  <div role="tablist" aria-label="Image view" className="flex gap-1">
                    {([["original", "Original + overlays"], ["annotated", "Annotated render"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} type="button" className={`${BTN} ${mode === k ? "border-amber-500 text-white" : ""}`} onClick={() => setMode(k)} data-testid={`mode-${k}`}>{l}</button>)}
                  </div>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} data-testid="ov-heat" />Anomaly heat</label>
                  <input type="range" min={0.1} max={1} step={0.05} value={heatOpacity} onChange={(e) => setHeatOpacity(Number(e.target.value))} aria-label="Heat opacity" className="w-20" />
                  <label className="flex items-center gap-1"><input type="checkbox" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} data-testid="ov-boxes" />Regions</label>
                  {cur.dataset_annotation && <label className="flex items-center gap-1" title="The dataset's own ground-truth annotation, for comparison. It is not model output."><input type="checkbox" checked={dataset} onChange={(e) => setDataset(e.target.checked)} data-testid="ov-dataset" />Dataset annotation</label>}
                </div>
                <ImageViewer ref={viewer} width={cur.model_output.image.width} height={cur.model_output.image.height} originalUrl={api!.image(cur.id, "original")} annotatedUrl={api!.image(cur.id, "annotated")} heatUrl={api!.image(cur.id, "heatmap")}
                  datasetUrl={cur.dataset_annotation && cur.dataset_annotation.label === "anomalous" ? api!.image(cur.id, "dataset_annotation") : null} mode={mode} heat={heat} heatOpacity={heatOpacity} boxes={boxes} dataset={dataset} regions={cur.model_output.regions} hidden={hidden} selected={sel} onSelect={(id) => { setSel(id); const r = cur.model_output.regions.find((x) => x.id === id); if (r) viewer.current?.focus(r); }} />
                <p className="mt-2 text-[11px] leading-snug text-slate-500">Scroll to zoom, drag to pan, double-click to fit. Heat shows where the part differs from good examples (red = further from anything seen in good parts). Boxes: red = flagged, amber = borderline. {cur.dataset_annotation && <span data-testid="dataset-note">Dataset label for this sample: <b className="text-slate-300">{cur.dataset_annotation.label}</b> (from the VisA annotation, not the model).</span>}</p>
              </>
            ) : <div className="grid h-[28rem] place-items-center text-center text-sm text-slate-500" data-testid="viewer-empty"><p>Select a part from the gallery, or upload an image / open a sample, to see the model’s result.<br />Nothing is shown before a real inspection has run.</p></div>}
          </section>

          {/* ---------- decision + defects ---------- */}
          <section className="min-w-0 space-y-3 lg:col-span-2 2xl:col-span-1" aria-label="Decision">
            {cur && (
              <>
                <div className={CARD} data-testid="decision-panel">
                  <h2 className={`${H3} mb-2`}>Quality decision</h2>
                  <div className="space-y-3 text-xs text-slate-300">
                    <div><p className="text-[11px] uppercase tracking-wider text-slate-500">1 · Model output</p>
                      <p>Anomaly score <b className="text-slate-100" data-testid="m-score">{cur.model_output.anomaly_score}</b> · threshold {cur.model_output.reference_threshold} · ratio <b className="text-slate-100" data-testid="m-ratio">{cur.model_output.score_ratio}×</b> · {flagged.length} flagged / {cur.model_output.regions.length - flagged.length} borderline region(s)</p>
                      <p className="text-[11px] text-slate-500">{cur.model_output.score_meaning}</p>
                      {cur.model_output.condition_checks.map((c) => <p key={c.code} className="mt-1 text-amber-200" data-testid="condition-check">{c.text}</p>)}</div>
                    <div><p className="text-[11px] uppercase tracking-wider text-slate-500">2 · Automated recommendation</p>
                      <div className="flex items-center gap-2"><span data-testid="recommendation"><Badge d={cur.recommendation.decision} /></span><span className="text-[11px] text-slate-500">Acceptance: ≤ {cur.recommendation.rules.max_defects} flagged region(s) at ratio ≥ {cur.recommendation.rules.min_score_ratio}; review band from {cur.recommendation.rules.review_band}</span></div>
                      <ul className="mt-1 list-disc pl-4" data-testid="reasons">{cur.recommendation.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                      <details className="mt-1 text-[11px] text-slate-500"><summary className="cursor-pointer">Rule trace</summary><ol className="list-decimal pl-4">{cur.recommendation.rule_trace.map((t) => <li key={t}>{t}</li>)}</ol><p className="mt-1">{cur.recommendation.disclaimer}</p></details></div>
                    <div><p className="text-[11px] uppercase tracking-wider text-slate-500">3 · Human reviewer decision</p>
                      {rv ? <p data-testid="human-decision"><Badge d={rv.decision} /> by {rv.reviewer || "reviewer"} · {when(rv.at)} · {rv.agrees_with_recommendation ? "agrees with the recommendation" : "overrides the recommendation"}{stale && <span className="text-amber-300"> · the recommendation has since changed from {DECISION_LABEL[rv.recommendation_at_review]} to {DECISION_LABEL[cur.recommendation.decision]} (rules changed)</span>}</p> : <p className="text-slate-500" data-testid="human-none">Not reviewed. The recommendation above has not been confirmed by a person.</p>}
                      <input className={`${INPUT} mt-2 w-full`} placeholder="Reviewer name (optional)" value={reviewer} maxLength={60} onChange={(e) => setReviewer(e.target.value)} aria-label="Reviewer name" data-testid="reviewer" />
                      <textarea className={`${INPUT} mt-2 h-16 w-full`} placeholder="Review notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} aria-label="Review notes" data-testid="notes" />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className={BTN} disabled={busy || cur.recommendation.decision === "MANUAL_REVIEW"} onClick={() => void submitReview("confirm")} title={cur.recommendation.decision === "MANUAL_REVIEW" ? "The recommendation is MANUAL REVIEW: choose PASS or FAIL yourself" : ""} data-testid="confirm">Confirm recommendation</button>
                        {(["PASS", "FAIL", "MANUAL_REVIEW"] as Decision[]).map((d) => <button key={d} type="button" className={BTN} disabled={busy} onClick={() => void submitReview("override", d)} data-testid={`override-${d}`}>Mark {DECISION_LABEL[d]}</button>)}
                      </div>
                      {reviewMsg && <p className="mt-2 text-emerald-300" role="status" data-testid="review-msg">{reviewMsg}</p>}
                      {cur.review.history.length > 1 && <details className="mt-2 text-[11px] text-slate-500"><summary className="cursor-pointer">{cur.review.history.length} review entries</summary><ul>{cur.review.history.map((h) => <li key={h.at}>{when(h.at)} · {DECISION_LABEL[h.decision]} · {h.notes || "no notes"}</li>)}</ul></details>}
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-2"><a className={BTN} href={api!.pdf(cur.id)} download={`inspection-${cur.id.slice(0, 8)}.pdf`} data-testid="report-pdf">Report (PDF)</a><a className={BTN} href={api!.reportJson(cur.id)} download={`inspection-${cur.id.slice(0, 8)}.json`} data-testid="report-json">Report (JSON)</a><button type="button" className={BTN} onClick={() => void del()}>Delete inspection</button></div>
                  </div>
                </div>

                <div className={CARD} data-testid="defect-panel">
                  <h2 className={`${H3} mb-2`}>Detected regions</h2>
                  {cur.model_output.regions.length ? (
                    <ul className="space-y-2 text-xs text-slate-300">
                      {cur.model_output.regions.map((r: Region) => (
                        <li key={r.id} className={`rounded border p-2 ${sel === r.id ? "border-amber-500 bg-amber-500/10" : "border-slate-700 bg-slate-950"}`} data-testid={`region-${r.id}`}>
                          <div className="flex items-center gap-2"><input type="checkbox" checked={!hidden.has(r.id)} aria-label={`Show region ${r.id}`} onChange={(e) => setHidden((h) => { const n = new Set(h); if (e.target.checked) n.delete(r.id); else n.add(r.id); return n; })} data-testid={`show-${r.id}`} />
                            <button type="button" className="font-semibold text-slate-100 hover:underline" onClick={() => { setSel(r.id); viewer.current?.focus(r); }}>#{r.id}</button>
                            <span className={r.status === "flagged" ? "text-red-300" : "text-amber-300"}>{r.status}</span><span className="text-slate-500">score {r.score_ratio.toFixed(2)}× threshold</span></div>
                          <p className="mt-1 text-[11px] text-slate-400">{r.category} · box x,y,w,h = {r.bbox.join(", ")} · {r.area_pct}% of image · severity: {r.severity}</p>
                          <label className="mt-1 block text-[11px]">Review <select className={`${INPUT} ml-1`} value={regionReview[String(r.id)] ?? "pending"} onChange={(e) => setRegionReview((m) => ({ ...m, [String(r.id)]: e.target.value as "confirmed" | "dismissed" | "pending" }))} data-testid={`rr-${r.id}`}><option value="pending">pending</option><option value="confirmed">confirmed defect</option><option value="dismissed">dismissed (not a defect)</option></select></label>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-slate-500" data-testid="no-regions">No region reached the review band for this part.</p>}
                  <p className="mt-2 text-[11px] leading-snug text-slate-500">Defect categories are not available: {cur.model_output.regions[0]?.category_note ?? "this model detects where a part differs from good examples, not what kind of defect it is."} Region review marks are saved with your decision.</p>
                </div>
              </>
            )}
            {!cur && <div className={CARD}><h2 className={`${H3} mb-2`}>Quality decision</h2><p className="text-xs text-slate-500" data-testid="decision-empty">The recommendation, your acceptance criteria and the reviewer controls appear here after an inspection.</p></div>}
          </section>
        </div>
      </div>
    </DemoShell>
  );
}
