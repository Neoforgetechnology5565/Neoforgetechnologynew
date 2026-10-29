"use client";
import { useState } from "react";
import type { Branding } from "@/lib/types";
import { saveData } from "@/lib/ml/api";
import { BTN, CARD, Dropzone, ErrorBox, H3, MlShell, PreviewFeatures, SamplePicker, StatusChip, useMl, useRun } from "./common";

interface Cls { index: number; label: string; pixels: number; share: number; colour: string }
interface Res { filename: string; width: number; height: number; classes: Cls[]; known_classes: string[]; seconds: number; model: { name: string; source: string; licence: string }; mask_png: string; overlay: string; original: string; note: string }
const dl = (name: string, href: string) => { void saveData(name, href); };

export default function SegmentApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, health, samples } = useMl(serviceUrl, "image");
  const { busy, error, result, source, run } = useRun<Res>(api, "/api/segment", /\.(jpe?g|png|webp|tiff?)$|^image\//i, health?.limits.max_image_mb ?? 15);
  const [opacity, setOpacity] = useState(0.5); const [view, setView] = useState<"overlay" | "side" | "mask">("overlay");
  return (
    <MlShell branding={branding} title="AI Image Segmentation & Scene Understanding" project={source?.name ?? "No image selected"} service={service}
      notice="A real DeepLabV3 model assigns every pixel to one of 21 PASCAL VOC classes (20 object classes and background). It runs at 257×257 and the mask is enlarged, so edges are coarse; things outside those classes are not recognised."
      footer="Working: semantic segmentation with masks, overlay and downloads. Not implemented: custom categories, medical or 3D segmentation, training (previews below).">
      <ErrorBox msg={error} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className={H3}>1 · Image <StatusChip s="working" /></h2>
          <Dropzone label="Upload a JPEG, PNG, WebP or TIFF image" accept="image/*,.tif,.tiff" disabled={service !== "online" || busy} onFile={(f) => run(f, { opacity })} />
          <SamplePicker samples={samples} disabled={service !== "online" || busy} onPick={(s) => run(s, { opacity })} />
        </section>
        <section className={CARD} data-testid="result">
          <h2 className={H3}>2 · Segmentation</h2>
          {busy && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Segmenting…</p>}
          {!busy && !result && <p className="mt-3 text-sm text-slate-400" data-testid="empty">Choose or upload an image. No mask is shown until the model has produced one.</p>}
          {result && !busy && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                {(["overlay", "side", "mask"] as const).map((v) => <button key={v} className={`${BTN} ${view === v ? "border-blue-500 text-white" : ""}`} onClick={() => setView(v)} data-testid={`view-${v}`}>{v === "overlay" ? "Overlay" : v === "side" ? "Side by side" : "Mask only"}</button>)}
                <label className="flex items-center gap-2">Opacity {Math.round(opacity * 100)}%<input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Overlay opacity" data-testid="opacity" /></label>
              </div>
              <div className={view === "side" ? "grid gap-2 md:grid-cols-2" : ""} data-testid="views">
                {/* eslint-disable @next/next/no-img-element */}
                {(view === "side" || view === "overlay") && <div className="relative">
                  <img src={result.original} alt="Original" className="w-full rounded-md bg-black object-contain" />
                  {view === "overlay" && <img src={result.mask_png} alt="Segmentation mask overlay" className="absolute inset-0 h-full w-full rounded-md object-contain" style={{ opacity, mixBlendMode: "normal" }} data-testid="mask-overlay" />}
                </div>}
                {(view === "side" || view === "mask") && <img src={result.mask_png} alt="Segmentation mask" className="w-full rounded-md bg-black object-contain" data-testid="mask-image" />}
              </div>
              <div className="flex flex-wrap gap-2"><button className={BTN} onClick={() => dl("mask.png", result.mask_png)} data-testid="dl-mask">Download mask (PNG)</button><button className={BTN} onClick={() => dl("overlay.jpg", result.overlay)} data-testid="dl-overlay">Download overlay (JPEG, opacity as chosen when run)</button></div>
              <table className="w-full text-left text-xs" data-testid="classes"><thead className="text-slate-400"><tr><th>Class</th><th>Share of pixels</th></tr></thead>
                <tbody>{result.classes.map((c) => <tr key={c.index} className="border-t border-slate-800"><td className="py-1"><span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: c.colour }} />{c.label}</td><td className="tabular-nums">{(c.share * 100).toFixed(1)}%</td></tr>)}</tbody></table>
              <p className="text-xs text-slate-400">{result.seconds} s · {result.model.name} ({result.model.licence}). {result.note}</p>
              <details className="text-xs text-slate-400"><summary className="cursor-pointer">The 21 classes this model can recognise</summary><p className="mt-1">{result.known_classes.join(", ")}</p></details>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Custom segmentation categories", status: "soon", note: "the class list is fixed to PASCAL VOC." },
        { name: "Medical image segmentation", status: "preview", note: "this model was not trained on medical images and must not be used on them." },
        { name: "Advanced 3D segmentation", status: "soon", note: "only 2-D images are supported." },
        { name: "Model training and fine-tuning", status: "soon", note: "no training pipeline is implemented." },
      ]} />
    </MlShell>
  );
}
