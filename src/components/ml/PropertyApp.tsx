"use client";
import { useState } from "react";
import type { Branding } from "@/lib/types";
import { BTN, CARD, Dropzone, ErrorBox, H3, MlShell, SamplePicker, StatusChip, useMl, useRun } from "./common";

interface ClassScore { key: string; label: string; probability: number; cosine: number }
interface Det { label: string; score: number; class_index: number; box: number[] }
interface Factor { key: string; label: string; kind: "observed" | "assumption"; points: number; observed: string; meaning: string }
interface Res {
  filename: string; width: number; height: number;
  classification: { label: string; label_text: string; probability: number; margin: number; scores: ClassScore[] };
  detection: { detections: Det[]; counts: Record<string, number>; threshold: number; annotated: string };
  measurements: { green_percent: number; sharpness: number; brightness: number };
  score: { value: number; band: string; baseline: number; factors: Factor[]; explanation: string[]; evidence_strength: string; evidence_notes: string[]; cannot_see: string[]; disclaimer: string };
  seconds: { classification: number; detection: number; scoring: number; total: number };
  models: { classification: { name: string; source: string; licence: string }; detection: { name: string; source: string; licence: string } | null; scoring: { name: string; source: string; licence: string } };
  note: string;
}
const pct = (v: number) => `${(v * 100).toFixed(v >= 0.995 || v < 0.01 ? 1 : 0)}%`;
const BADGE = { observed: "border-green-500/50 bg-green-500/10 text-green-300", assumption: "border-amber-500/50 bg-amber-500/10 text-amber-300" };

export default function PropertyApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, health, samples } = useMl(serviceUrl, "property");
  const { busy, error, result, source, run } = useRun<Res>(api, "/api/property/analyze", /\.(jpe?g|png|webp)$|^image\//i, health?.limits.max_image_mb ?? 15);
  const [thr, setThr] = useState(0.35);
  const svc = serviceUrl ? service : "offline";
  const clipMissing = svc === "online" && health && !health.available.property_clip;
  const ready = svc === "online" && !clipMissing;
  const maxScore = result ? Math.max(...result.classification.scores.map((s) => s.probability)) : 0;
  return (
    <MlShell branding={branding} title="PropertyVision AI" project={source?.name ?? "No photo selected"} service={svc}
      notice="Experimental demonstration by Neo Forge Technology. A pretrained CLIP model picks the most likely of four property types; a pretrained YOLOX detector finds the everyday objects it was trained on (COCO's 80 classes: it has no tree, fence, roof or crack class); a small Python scoring engine combines their real outputs into a 0–100 score. The score is not validated, is not a valuation or inspection, and generic object detection cannot prove that a property is distressed."
      footer="Working: CLIP zero-shot classification, YOLOX object detection with boxes and confidences, rule-based condition scoring with observed evidence kept separate from assumptions. Not implemented: model training, damage or crack detection, valuation, history across sessions. Sample photographs are real; their sources and licences are shown with each.">
      <ErrorBox msg={error} />
      {!serviceUrl && <div className={CARD} role="alert" data-testid="needs-service"><p className="text-sm text-slate-200">PropertyVision AI needs the Python service (CLIP and YOLO run on the server). Set <code>ML_API_URL</code> to a running <code>services/ml-lab</code> and run <code>python scripts/fetch_clip.py</code> there once to download the CLIP weights.</p></div>}
      {clipMissing && <div className={CARD} role="alert" data-testid="clip-missing"><p className="text-sm text-slate-200">The service is running but the CLIP weights are not installed. Run <code>python scripts/fetch_clip.py</code> in <code>services/ml-lab</code> and restart it.</p></div>}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={CARD} aria-label="Photo source">
          <h2 className={H3}>Property photo <StatusChip s="working" /></h2>
          <Dropzone label="Upload a JPEG, PNG or WebP photograph" accept="image/*" disabled={!ready || busy} onFile={(f) => run(f, { threshold: thr })} />
          <label className="mt-3 flex items-center justify-between text-xs text-slate-300">Detection threshold
            <input type="number" min={0.05} max={0.95} step={0.05} value={thr} onChange={(e) => setThr(Math.min(0.95, Math.max(0.05, Number(e.target.value) || 0.35)))} className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" data-testid="threshold" /></label>
          <SamplePicker samples={samples} disabled={!ready || busy} onPick={(s) => run(s, { threshold: thr })} />
        </section>
        <div className="space-y-4" data-testid="result">
          {busy && <p className={CARD} data-testid="loading">Running CLIP, YOLOX and the scoring engine…</p>}
          {!busy && !result && <p className={`${CARD} text-sm text-slate-400`} data-testid="empty">Choose a sample or upload a photograph. Nothing is analysed until you do.</p>}
          {result && !busy && (<>
            <p className="text-xs text-slate-400" data-testid="timing">{result.width}×{result.height}px · classification {result.seconds.classification}s · detection {result.seconds.detection}s · scoring {result.seconds.scoring}s</p>
            <section className={CARD} aria-label="Module 1: property classification" data-testid="module-classify">
              <h2 className={H3}>1 · Property image classification <StatusChip s="working" /></h2>
              <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {source && <img src={source.url} alt={`Property photograph ${source.name}`} className="max-h-64 w-full rounded-md bg-black object-contain" data-testid="input-image" />}
                <div>
                  <p className="text-lg font-semibold text-white" data-testid="predicted-class">{result.classification.label_text} <span className="text-sm font-normal text-slate-300">({pct(result.classification.probability)} confidence)</span></p>
                  <p className="mt-1 text-xs text-slate-400">{result.classification.probability < 0.5 || result.classification.margin < 0.15 ? "The model is not sure: the top two categories are close or the top score is under 50%." : "The top category is clearly ahead of the others."} Zero-shot CLIP: it compares the photo with text descriptions of the four categories; it was not trained on property data.</p>
                  <ol className="mt-3 space-y-2" data-testid="class-scores">
                    {result.classification.scores.map((p, i) => (
                      <li key={p.key} data-testid="class-score" data-key={p.key}><div className="flex justify-between text-sm"><span className={i === 0 ? "font-semibold text-white" : "text-slate-200"}>{p.label}</span><span className="tabular-nums text-slate-300">{pct(p.probability)}</span></div>
                        <div className="mt-1 h-2 overflow-hidden rounded bg-slate-800"><div className={`h-full ${i === 0 ? "bg-blue-500" : "bg-slate-500"}`} style={{ width: `${Math.max(1, (p.probability / (maxScore || 1)) * 100)}%` }} /></div></li>))}
                  </ol>
                </div>
              </div>
            </section>
            <section className={CARD} aria-label="Module 2: visual object detection" data-testid="module-detect">
              <h2 className={H3}>2 · Property visual object detection <StatusChip s="working" /></h2>
              <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.detection.annotated} alt="Photograph with detected objects outlined" className="max-h-[460px] w-full rounded-md bg-black object-contain" data-testid="annotated" />
                <div>
                  <p className="text-sm text-slate-200" data-testid="detect-summary">{result.detection.detections.length ? `${result.detection.detections.length} object(s) at ≥ ${pct(result.detection.threshold)} confidence` : `No objects at ≥ ${pct(result.detection.threshold)} confidence. Try a lower threshold.`}</p>
                  <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs" data-testid="detections">
                    {result.detection.detections.map((d, i) => <li key={i} className="flex justify-between gap-2 border-b border-slate-800 pb-1" data-testid="detection"><span className="text-slate-100">{d.label}</span><span className="tabular-nums text-slate-300">{pct(d.score)}</span></li>)}
                  </ul>
                  <p className="mt-3 text-xs text-slate-400">Detects only COCO&apos;s 80 object classes (cars, people, potted plants, furniture…). It does not detect trees, fences, roofs, damage or cracks, and can mistake objects in aerial photographs.</p>
                </div>
              </div>
            </section>
            <section className={CARD} aria-label="Module 3: property condition scoring" data-testid="module-score">
              <h2 className={H3}>3 · Property condition scoring <span className="ml-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">Experimental</span></h2>
              <div className="mt-3 grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
                <div className="rounded-md border border-slate-700 p-4 text-center">
                  <p className="text-5xl font-semibold tabular-nums text-white" data-testid="score-value">{result.score.value}</p><p className="text-xs text-slate-400">out of 100</p>
                  <p className="mt-2 text-sm text-slate-200" data-testid="score-band">{result.score.band}</p>
                  <p className="mt-2 text-xs text-slate-400" data-testid="evidence-strength">Evidence strength: <b className="text-slate-100">{result.score.evidence_strength}</b></p>
                  {result.score.evidence_notes.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Weaker because {result.score.evidence_notes.join("; ")}.</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-400">The score starts at a neutral {result.score.baseline} (&ldquo;no evidence either way&rdquo;) and moves only for the factors below, built from the real classifier and detector outputs and three image measurements.</p>
                  <ul className="mt-3 space-y-2" data-testid="factors">
                    {result.score.factors.map((f) => (
                      <li key={f.key} className="rounded-md border border-slate-800 p-3 text-xs" data-testid="factor" data-kind={f.kind}>
                        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-100">{f.label}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BADGE[f.kind]}`}>{f.kind === "observed" ? "Observed" : "Assumption"}</span><span className="ml-auto tabular-nums text-slate-200">{f.points > 0 ? "+" : ""}{f.points} points</span></div>
                        <p className="mt-1 text-slate-300"><b>Seen:</b> {f.observed}</p><p className="mt-1 text-slate-400">{f.meaning}</p>
                      </li>))}
                  </ul>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">In plain English</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-200" data-testid="explanation">{result.score.explanation.map((x) => <li key={x}>{x}</li>)}</ul>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">What this score cannot see</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-300" data-testid="cannot-see">{result.score.cannot_see.map((x) => <li key={x}>{x}</li>)}</ul>
                  <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-100" data-testid="disclaimer">{result.score.disclaimer}</p>
                </div>
              </div>
            </section>
            <p className="text-xs text-slate-500">Models: {result.models.classification.name} ({result.models.classification.licence}); {result.models.detection?.name} ({result.models.detection?.licence}); {result.models.scoring.name}.</p>
            <button className={BTN} onClick={() => document.querySelector<HTMLInputElement>("[data-testid=file-input]")?.click()}>Analyse another photo</button>
          </>)}
        </div>
      </div>
    </MlShell>
  );
}
