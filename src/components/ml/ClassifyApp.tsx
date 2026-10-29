"use client";
import { useState } from "react";
import type { Branding } from "@/lib/types";
import { BTN, CARD, Dropzone, ErrorBox, H3, MlShell, PreviewFeatures, SamplePicker, StatusChip, useMl, useRun } from "./common";

interface Pred { label: string; probability: number; class_index: number }
interface Res { filename: string; width: number; height: number; predictions: Pred[]; seconds: number; model: { name: string; source: string; licence: string }; note: string }

export default function ClassifyApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, health, samples } = useMl(serviceUrl, "image");
  const { busy, error, result, source, run } = useRun<Res>(api, "/api/classify", /\.(jpe?g|png|webp|tiff?)$|^image\//i, health?.limits.max_image_mb ?? 15);
  const [k, setK] = useState(5);
  return (
    <MlShell branding={branding} title="AI Image Classification & Recognition" project={source?.name ?? "No image selected"} service={service}
      notice="A real MobileNetV2 model labels the whole image with one of 1000 ImageNet classes. Probabilities are the model's own softmax scores: they are not calibrated, and a picture of something outside those classes still receives labels."
      footer="Working: single-image classification with a pretrained ImageNet model. Not implemented: training, batch classification, model comparison, custom categories (shown below as previews). Sample images are public domain or CC0 (scikit-image sample data).">
      <ErrorBox msg={error} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={CARD} aria-label="Image source">
          <h2 className={H3}>1 · Image <StatusChip s="working" /></h2>
          <Dropzone label="Upload a JPEG, PNG, WebP or TIFF image" accept="image/*,.tif,.tiff" disabled={service !== "online" || busy} onFile={(f) => run(f, { top_k: k })} />
          <label className="mt-3 flex items-center justify-between text-xs text-slate-300">Labels to show<input type="number" min={1} max={10} value={k} onChange={(e) => setK(Number(e.target.value))} className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1" /></label>
          <SamplePicker samples={samples} disabled={service !== "online" || busy} onPick={(s) => run(s, { top_k: k })} />
        </section>
        <section className={CARD} aria-label="Result" data-testid="result">
          <h2 className={H3}>2 · Result</h2>
          {busy && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Classifying…</p>}
          {!busy && !result && <p className="mt-3 text-sm text-slate-400" data-testid="empty">Choose or upload an image. Nothing is predicted until you do.</p>}
          {result && source && !busy && (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.url} alt={`Classified image ${source.name}`} className="max-h-[420px] w-full rounded-md bg-black object-contain" data-testid="input-image" />
              <div>
                <p className="text-xs text-slate-400">{result.width}×{result.height}px · {result.seconds} s · {result.model.name}</p>
                <ol className="mt-3 space-y-2" data-testid="predictions">
                  {result.predictions.map((p, i) => (
                    <li key={p.class_index} data-testid="prediction"><div className="flex justify-between text-sm"><span className={i === 0 ? "font-semibold text-white" : "text-slate-200"}>{p.label}</span><span className="tabular-nums text-slate-300">{(p.probability * 100).toFixed(1)}%</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded bg-slate-800"><div className={`h-full ${i === 0 ? "bg-blue-500" : "bg-slate-500"}`} style={{ width: `${Math.max(1, p.probability * 100)}%` }} /></div></li>
                  ))}
                </ol>
                <p className="mt-4 text-xs text-slate-400">{result.note}</p>
                <p className="mt-2 text-xs text-slate-500">Weights: {result.model.source} ({result.model.licence}).</p>
                <button className={`${BTN} mt-3`} onClick={() => api && source && document.querySelector<HTMLInputElement>("[data-testid=file-input]")?.click()}>Classify another image</button>
              </div>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Custom model training", status: "soon", note: "no training pipeline is implemented." },
        { name: "Batch image classification", status: "preview", note: "only one image is classified per request." },
        { name: "Model comparison", status: "preview", note: "only one model (MobileNetV2) is installed." },
        { name: "Custom category management", status: "soon", note: "the label set is the fixed ImageNet-1000 list." },
      ]} />
    </MlShell>
  );
}
