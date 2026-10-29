"use client";
import { useEffect, useMemo, useState } from "react";
import type { Branding } from "@/lib/types";
import { inspectApi } from "@/lib/defects/api";
import { browserInspect } from "@/lib/defects/browser";
import { DEFAULT_RULES, type Health, type Inspection, type ReferenceInfo, type SampleImage } from "@/lib/defects/types";
import { BTN, CARD, Dropzone, ErrorBox, H3, MlShell, PreviewFeatures, StatusChip } from "./common";

const LABEL = { FAIL: "Potential anomaly", PASS: "Normal prediction", MANUAL_REVIEW: "Manual review" } as const;
const STYLE = { FAIL: "border-red-500/60 bg-red-500/10 text-red-200", PASS: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200", MANUAL_REVIEW: "border-amber-500/60 bg-amber-500/10 text-amber-200" } as const;

export default function AnomalyApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? inspectApi(serviceUrl) : browserInspect()), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">("unknown"); const [health, setHealth] = useState<Health | null>(null);
  const [refs, setRefs] = useState<ReferenceInfo[]>([]); const [ref, setRef] = useState(""); const [samples, setSamples] = useState<SampleImage[]>([]);
  const [cur, setCur] = useState<Inspection | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [thr, setThr] = useState(DEFAULT_RULES.min_score_ratio); const [opacity, setOpacity] = useState(0.7); const [view, setView] = useState<"annotated" | "heatmap" | "original">("heatmap");
  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); api.references().then((r) => { setRefs(r.references); setRef(r.references[0]?.id ?? ""); }).catch(() => undefined); api.samples().then((s) => setSamples(s.samples)).catch(() => undefined); }, [api]);
  const rules = { ...DEFAULT_RULES, min_score_ratio: thr, review_band: Math.min(0.85, thr * 0.85) };
  const run = async (src: File | SampleImage) => {
    if (!api || !ref) return; setError(""); setBusy(true);
    try { if (src instanceof File && !/\.(jpe?g|png|webp)$/i.test(src.name)) throw new Error("Unsupported file type. Upload a JPEG, PNG or WebP image."); setCur(await api.inspect(src instanceof File ? src : { sampleId: src.id }, src instanceof File ? ref : src.reference_id, rules)); if (!(src instanceof File)) setRef(src.reference_id); }
    catch (e) { setError(e instanceof Error ? e.message : "Inspection failed."); setCur(null); } finally { setBusy(false); }
  };
  const reeval = async (t: number) => { if (!api || !cur) return; try { setCur(await api.reevaluate(cur.id, { ...DEFAULT_RULES, min_score_ratio: t, review_band: Math.min(0.85, t * 0.85) })); } catch (e) { setError(e instanceof Error ? e.message : "Could not re-evaluate."); } };
  const mo = cur?.model_output; const rec = cur?.recommendation; const r = refs.find((x) => x.id === ref);
  return (
    <MlShell branding={branding} title="AI Image Anomaly & Defect Detection" project={cur?.filename ?? "No image selected"} service={service}
      notice="A real PatchCore-style model (frozen ResNet-50 features compared with a memory of good parts) scores how unusual a part looks. It does not name defect types, its score is a distance rather than a probability, and a reference only works for the part and imaging setup it was built from."
      footer="Working: anomaly scoring and maps with a demonstration threshold on the VisA reference parts. Not implemented: production-line integration, severity grading, automatic rejection, PLC links, inspection history (previews below). This demo uses the same inspection service as the Visual Inspection demo. Sample images: VisA (CC BY 4.0).">
      <ErrorBox msg={error} />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className={H3}>1 · Part and image <StatusChip s="working" /></h2>
          <label className="mt-3 block text-xs text-slate-300">Part type (reference of good parts)
            <select value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" data-testid="ref-select">{refs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          {r?.evaluation && <p className="mt-2 text-[11px] text-slate-400" data-testid="ref-info">Measured on held-out VisA images: image AUROC {r.evaluation.image_auroc.toFixed(3)}, {(r.evaluation.at_threshold.true_positive_rate * 100).toFixed(0)}% of anomalous and {(r.evaluation.at_threshold.false_positive_rate * 100).toFixed(0)}% of normal test images flagged at the default threshold.</p>}
          <Dropzone label="Upload an image of this part (JPEG, PNG, WebP)" accept="image/*" disabled={service !== "online" || busy || !ref} onFile={run} />
          <p className="mt-3 text-xs text-slate-400">Samples for this part</p>
          <div className="mt-2 flex flex-wrap gap-2">{samples.filter((s) => s.reference_id === ref).slice(0, 8).map((s) => <button key={s.id} className={`${BTN} ${s.label === "anomalous" ? "" : ""}`} disabled={service !== "online" || busy} onClick={() => run(s)} data-testid={`sample-${s.id}`}>{s.title}</button>)}</div>
          <label className="mt-4 block text-xs text-slate-300">Demonstration threshold: flag when score ÷ calibrated threshold ≥ {thr.toFixed(2)}
            <input type="range" min={0.5} max={2} step={0.05} value={thr} onChange={(e) => setThr(Number(e.target.value))} onPointerUp={() => reeval(thr)} onKeyUp={() => reeval(thr)} className="mt-1 w-full" aria-label="Threshold" data-testid="threshold" /></label>
          <p className="mt-1 text-[11px] text-slate-500">1.00 is the threshold calibrated on good images of this part. Lower values flag more (more false alarms); higher values flag less (more misses).</p>
        </section>
        <section className={CARD} data-testid="result">
          <h2 className={H3}>2 · Result</h2>
          {busy && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Inspecting…</p>}
          {!busy && !cur && <p className="mt-3 text-sm text-slate-400" data-testid="empty">Choose a part and an image. Nothing is scored until you do.</p>}
          {cur && mo && rec && api && !busy && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3"><span className={`rounded-full border px-3 py-1 text-sm font-semibold ${STYLE[rec.decision]}`} data-testid="verdict">{LABEL[rec.decision]}</span>
                <span className="text-sm text-slate-200">score ratio <strong className="text-white" data-testid="ratio">{mo.score_ratio.toFixed(2)}×</strong> the calibrated threshold · {mo.regions.length} unusual region(s) · {cur.inference_ms} ms</span></div>
              <div className="flex flex-wrap gap-2">{(["heatmap", "annotated", "original"] as const).map((v) => <button key={v} className={`${BTN} ${view === v ? "border-blue-500 text-white" : ""}`} onClick={() => setView(v)} data-testid={`view-${v}`}>{v === "heatmap" ? "Anomaly map" : v === "annotated" ? "Regions" : "Original"}</button>)}
                {view === "heatmap" && <label className="flex items-center gap-2 text-xs text-slate-300">Opacity<input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Map opacity" /></label>}</div>
              <div className="relative max-w-xl">
                {/* eslint-disable @next/next/no-img-element */}
                <img src={api.image(cur.id, view === "annotated" ? "annotated" : "original")} alt={`${view} view`} className="w-full rounded-md bg-black" data-testid="viewer-image" />
                {view === "heatmap" && <img src={api.image(cur.id, "heatmap")} alt="Anomaly map" className="absolute inset-0 h-full w-full rounded-md" style={{ opacity }} data-testid="heat" />}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">{rec.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
              {cur.dataset_annotation && <p className="text-xs text-slate-400" data-testid="dataset-note">Dataset label for this sample: {cur.dataset_annotation.label} (from the data provider, not the model).</p>}
              <p className="text-xs text-slate-500">{cur.method}</p>
              <details className="text-xs text-slate-400"><summary className="cursor-pointer">Limitations</summary><ul className="mt-1 list-disc space-y-1 pl-5">{cur.limitations.map((l) => <li key={l}>{l}</li>)}{health?.limitations?.map((l) => <li key={l}>{l}</li>)}</ul></details>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Production-line integration", status: "hardware", note: "no cameras or conveyors are connected." },
        { name: "Defect severity grading", status: "soon", note: "regions are unclassified; severity needs labelled defect data." },
        { name: "Automated rejection system", status: "hardware", note: "no actuator or reject mechanism exists." },
        { name: "Industrial PLC integration", status: "external", note: "no PLC or fieldbus link is implemented." },
        { name: "Inspection history and advanced reporting", status: "preview", note: "the full Visual Inspection demo has history, PDF reports and human review." },
      ]} />
    </MlShell>
  );
}
