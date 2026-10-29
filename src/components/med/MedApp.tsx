"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Branding } from "@/lib/types";
import LightShell, { L_BTN, L_CARD, L_GO, L_H3 } from "@/components/light/LightShell";
import * as o from "@/lib/med/ops";

interface Sample { id: string; title: string; modality: string; file: string; width: number; height: number; licence: string; note: string }
const MAX_MB = 25, MAX_SIDE = 2000;
const COLORS = ["#16834A", "#e11d48", "#2563eb", "#d97706", "#7c3aed", "#0891b2", "#be185d", "#65a30d"];
const save = (blob: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const toCanvas = (g: o.Gray) => { const c = document.createElement("canvas"); c.width = g.w; c.height = g.h; const ctx = c.getContext("2d")!, im = ctx.createImageData(g.w, g.h); for (let i = 0; i < g.d.length; i++) { im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = g.d[i]; im.data[i * 4 + 3] = 255; } ctx.putImageData(im, 0, 0); return c; };
const blobOf = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"));

type Denoise = "none" | "median" | "gaussian"; type Contrast = "none" | "stretch" | "window" | "clahe"; type Seg = "none" | "otsu" | "multi" | "manual" | "grow";
interface P { denoise: Denoise; dR: number; dS: number; contrast: Contrast; lo: number; hi: number; level: number; width: number; clip: number; sharpen: number; gamma: number; invert: boolean;
  seg: Seg; cls: 0 | 1 | 2; thr: number; seed: [number, number] | null; tol: number; open: number; close: number; fill: boolean; minArea: number; bright: boolean }
const DEF: P = { denoise: "none", dR: 1, dS: 1.2, contrast: "none", lo: 1, hi: 99, level: 128, width: 200, clip: 3, sharpen: 0, gamma: 1, invert: false, seg: "none", cls: 2, thr: 128, seed: null, tol: 20, open: 0, close: 0, fill: false, minArea: 30, bright: true };

function pipeline(src: o.Gray, p: P) {
  const log: string[] = []; let g = o.clone(src);
  if (p.denoise === "median") { g = o.median(g, p.dR); log.push(`Median filter, ${2 * p.dR + 1}×${2 * p.dR + 1} window`); } else if (p.denoise === "gaussian") { g = o.gaussian(g, p.dS); log.push(`Gaussian blur, σ = ${p.dS}`); }
  if (p.contrast === "stretch") { const r = o.stretch(g, p.lo / 100, p.hi / 100); g = r.out; log.push(`Contrast stretch from the ${p.lo}th–${p.hi}th percentile (grey levels ${r.lo}–${r.hi} → 0–255)`); }
  else if (p.contrast === "window") { g = o.windowLevel(g, p.level, p.width); log.push(`Window / level, level ${p.level}, width ${p.width} (on 8-bit grey levels)`); }
  else if (p.contrast === "clahe") { g = o.clahe(g, 8, p.clip); log.push(`CLAHE, 8×8 tiles, clip limit ${p.clip}`); }
  if (p.sharpen > 0) { g = o.unsharp(g, 1.5, p.sharpen); log.push(`Unsharp mask, σ 1.5, amount ${p.sharpen}`); }
  if (p.gamma !== 1) { g = o.gamma(g, p.gamma); log.push(`Gamma ${p.gamma}`); }
  if (p.invert) { g = o.invert(g); log.push("Inverted grey levels"); }
  let mask: o.Mask | null = null, labels: Int32Array | null = null, regions: o.Region[] = [];
  if (p.seg !== "none") {
    if (p.seg === "otsu") { const t = o.otsu(g); mask = o.threshold(g, p.bright ? t + 1 : 0, p.bright ? 255 : t); log.push(`Otsu threshold ${t}; keeping ${p.bright ? "brighter" : "darker"} pixels`); }
    else if (p.seg === "multi") { const [a, b] = o.otsu3(g); mask = p.cls === 0 ? o.threshold(g, 0, a) : p.cls === 1 ? o.threshold(g, a + 1, b) : o.threshold(g, b + 1, 255); log.push(`Three-class Otsu thresholds ${a} and ${b}; class ${["dark", "middle", "bright"][p.cls]}`); }
    else if (p.seg === "manual") { mask = p.bright ? o.threshold(g, p.thr, 255) : o.threshold(g, 0, p.thr); log.push(`Manual threshold ${p.thr}; keeping ${p.bright ? "≥" : "≤"} it`); }
    else if (p.seg === "grow" && p.seed) { mask = o.regionGrow(g, Math.round(p.seed[0] * g.w), Math.round(p.seed[1] * g.h), p.tol); log.push(`Region growing from seed (${Math.round(p.seed[0] * g.w)}, ${Math.round(p.seed[1] * g.h)}), tolerance ±${p.tol}`); }
    if (mask) {
      if (p.open > 0) { mask = o.open(mask, p.open); log.push(`Morphological opening, radius ${p.open}`); } if (p.close > 0) { mask = o.close(mask, p.close); log.push(`Morphological closing, radius ${p.close}`); }
      if (p.fill) { mask = o.fillHoles(mask); log.push("Holes filled"); }
      const c = o.components(mask, g, p.minArea); labels = c.labels; regions = c.regions; log.push(`Connected components; regions under ${p.minArea} px removed`);
    }
  }
  return { out: g, mask, labels, regions, log };
}

export default function MedApp({ branding }: { branding: Branding }) {
  const [samples, setSamples] = useState<Sample[]>([]); const [name, setName] = useState(""); const [info, setInfo] = useState<Sample | null>(null); const [error, setError] = useState("");
  const [src, setSrc] = useState<o.Gray | null>(null); const [colour, setColour] = useState(false); const [scaled, setScaled] = useState(""); const [orig, setOrig] = useState<HTMLCanvasElement | null>(null);
  const [p, setP] = useState<P>(DEF); const [mm, setMm] = useState(""); const [swipe, setSwipe] = useState(50); const [layout, setLayout] = useState<"side" | "swipe">("side"); const [opacity, setOpacity] = useState(0.5); const [showMask, setShowMask] = useState(true); const [sel, setSel] = useState<number | null>(null);
  const cOrig = useRef<HTMLCanvasElement>(null), cProc = useRef<HTMLCanvasElement>(null), cSwipe = useRef<HTMLCanvasElement>(null);
  useEffect(() => { fetch("/med/samples/manifest.json").then((r) => r.json()).then((m) => setSamples(m.samples)).catch(() => undefined); }, []);

  const loadBlob = async (blob: Blob, n: string, meta: Sample | null) => {
    setError(""); try {
      const bmp = await createImageBitmap(blob).catch(() => { throw new Error("This file could not be decoded as an image."); });
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(bmp, 0, 0, w, h); const px = ctx.getImageData(0, 0, w, h).data, g = o.make(w, h); let col = false;
      for (let i = 0; i < w * h; i++) { const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2]; if (Math.abs(r - gg) > 6 || Math.abs(gg - b) > 6) col = true; g.d[i] = Math.round(0.299 * r + 0.587 * gg + 0.114 * b); }
      setSrc(g); setOrig(c); setColour(col); setName(n); setInfo(meta); setP(DEF); setSel(null); setScaled(k < 1 ? `Working copy reduced from ${bmp.width}×${bmp.height} to ${w}×${h} px.` : "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open the image."); }
  };
  const onFile = async (f: File) => {
    setError(""); if (!f.size) { setError("That file is empty."); return; }
    if (/\.(dcm|dicom)$/i.test(f.name)) { setError("DICOM is not supported. Export a PNG or JPEG from your viewer first."); return; }
    if (/\.(tiff?|nii|gz|mha|svs)$/i.test(f.name)) { setError("This format is not supported. Use a PNG or JPEG image."); return; }
    if (!/\.(png|jpe?g)$/i.test(f.name) && !/^image\/(png|jpeg)$/.test(f.type)) { setError("Unsupported file. Upload a PNG or JPEG image."); return; }
    if (f.size > MAX_MB * 1e6) { setError(`Images are limited to ${MAX_MB} MB.`); return; }
    await loadBlob(f, f.name, null);
  };
  const openSample = async (s: Sample) => { try { const r = await fetch(`/med/samples/${s.file}`); if (!r.ok) throw new Error("The sample could not be loaded."); await loadBlob(await r.blob(), s.title, s); } catch (e) { setError(e instanceof Error ? e.message : "The sample could not be loaded."); } };

  const [res, setRes] = useState<ReturnType<typeof pipeline> | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!src) { setRes(null); return; } setBusy(true); const t = setTimeout(() => { try { setRes(pipeline(src, p)); setError((e) => (e.startsWith("Processing") ? "" : e)); } catch (e) { setError(`Processing failed: ${e instanceof Error ? e.message : "unknown error"}`); } setBusy(false); }, 120); return () => clearTimeout(t); }, [src, p]);

  const procCanvas = useMemo(() => (res ? toCanvas(res.out) : null), [res]);
  const draw = (cv: HTMLCanvasElement | null, base: HTMLCanvasElement | null, overlay: boolean) => {
    if (!cv || !base) return; cv.width = base.width; cv.height = base.height; const ctx = cv.getContext("2d")!; ctx.drawImage(base, 0, 0);
    if (overlay && res?.labels && showMask) { const im = ctx.getImageData(0, 0, cv.width, cv.height), L = res.labels; for (let i = 0; i < L.length; i++) if (L[i]) { const col = COLORS[(L[i] - 1) % COLORS.length], r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16), a = sel === null || sel === L[i] ? opacity : opacity * 0.25; im.data[i * 4] = im.data[i * 4] * (1 - a) + r * a; im.data[i * 4 + 1] = im.data[i * 4 + 1] * (1 - a) + g * a; im.data[i * 4 + 2] = im.data[i * 4 + 2] * (1 - a) + b * a; } ctx.putImageData(im, 0, 0); }
  };
  useEffect(() => { draw(cOrig.current, orig, false); draw(cProc.current, procCanvas, true); if (layout === "swipe") draw(cSwipe.current, procCanvas, true); }, [orig, procCanvas, res, opacity, showMask, sel, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSeed = (e: React.MouseEvent<HTMLCanvasElement>) => { if (p.seg !== "grow") return; const r = e.currentTarget.getBoundingClientRect(); setP({ ...p, seed: [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] }); };
  const set = <K extends keyof P>(k: K, v: P[K]) => setP((q) => ({ ...q, [k]: v }));
  const px = parseFloat(mm); const hasPx = isFinite(px) && px > 0;
  const report = res && src ? { file: name, working_size_px: [src.w, src.h], source_was_colour: colour, processed_as: "8-bit grayscale (luma)", operations_in_order: res.log, regions: res.regions.map((r) => ({ id: r.id, area_px: r.area, area_mm2: hasPx ? +(r.area * px * px).toFixed(2) : null, centroid_px: [+r.cx.toFixed(1), +r.cy.toFixed(1)], bbox_px: [r.x0, r.y0, r.x1, r.y1], mean_grey: +r.mean.toFixed(1), min_grey: r.min, max_grey: r.max })), pixel_size_mm: hasPx ? px : null, notice: "Image-processing output only. No diagnosis, finding or abnormality label is produced." } : null;
  const dlProcessed = async () => procCanvas && save(await blobOf(procCanvas), `${name.replace(/\.[^.]+$/, "")}-processed.png`);
  const dlMask = async () => { if (!res?.labels || !src) return; const m = o.make(src.w, src.h); res.labels.forEach((v, i) => (m.d[i] = v ? 255 : 0)); save(await blobOf(toCanvas(m)), `${name.replace(/\.[^.]+$/, "")}-mask.png`); };
  const dlOverlay = async () => { if (!cProc.current) return; save(await blobOf(cProc.current), `${name.replace(/\.[^.]+$/, "")}-overlay.png`); };

  const Slider = ({ label, k, min, max, step = 1, id }: { label: string; k: keyof P; min: number; max: number; step?: number; id: string }) => <label className="flex items-center gap-2 text-[14px]">{label}<input data-testid={id} type="range" min={min} max={max} step={step} value={p[k] as number} onChange={(e) => set(k, +e.target.value as never)} /><b>{p[k] as number}</b></label>;
  const SEL = "rounded border border-emerald-300 bg-white px-1.5 py-1 text-[14px]";
  return (
    <LightShell branding={branding} title="Medical Imaging AI & Analysis" project={name || "No image selected"} status={busy ? "Processing…" : res ? "Result ready" : "Ready"}
      notice="Prototype for image processing and teaching, not a medical device and not for diagnosis. Enhancement and segmentation here are classical image-processing algorithms, not a trained medical AI model. The app never names a disease, finding or abnormality and produces no diagnostic confidence. PNG and JPEG only (processed as 8-bit grayscale). Everything runs in your browser; nothing is uploaded."
      footer="Algorithms: median / Gaussian filtering, window-level, contrast stretch, CLAHE, unsharp mask, Otsu and multi-level Otsu thresholding, region growing, morphology, connected components.">
      <div className={L_CARD}>
        <h2 className={L_H3}>1 · Choose an image</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${L_GO} cursor-pointer`}>Upload PNG or JPEG<input data-testid="file-input" type="file" accept="image/png,image/jpeg,.dcm,.tif,.tiff" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} /></label>
          {samples.map((s) => <button key={s.id} type="button" data-testid={`sample-${s.id}`} className={L_BTN} onClick={() => void openSample(s)}>{s.title}</button>)}
        </div>
        <p className="mt-2 text-[13px] text-slate-600" data-testid="modalities">Modalities in the bundled samples: fundus photography, H&amp;E and IHC histology, fluorescence and phase microscopy. No radiology (X-ray, CT, MRI) sample is bundled; you can upload your own PNG / JPEG exports of those. Limit {MAX_MB} MB; larger than {MAX_SIDE}px is reduced.</p>
        {info && <p className="mt-1 text-[13px] text-slate-600" data-testid="provenance"><b>{info.modality}.</b> {info.licence}. {info.note}</p>}
        {scaled && <p className="mt-1 text-[13px] text-slate-600">{scaled}</p>}
        {colour && src && <p className="mt-1 text-[13px] text-slate-600" data-testid="colour-note">This is a colour image; processing is done on its grayscale (luma) version.</p>}
        {error && <div role="alert" data-testid="error" className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-[14px] text-red-700">{error}</div>}
      </div>
      {!src ? <div className={L_CARD + " text-slate-600"} data-testid="empty">Nothing is shown before an image is chosen. Upload a PNG or JPEG or open a sample.</div> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className={L_CARD}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className={L_H3 + " !mb-0"}>2 · Compare</h2>
              <div className="inline-flex overflow-hidden rounded border border-emerald-300 text-[13px]">{(["side", "swipe"] as const).map((v) => <button key={v} type="button" data-testid={`layout-${v}`} onClick={() => setLayout(v)} className={`px-3 py-1 ${layout === v ? "bg-[#16834A] text-white" : "bg-white text-[#11643A]"}`}>{v === "side" ? "Side by side" : "Swipe"}</button>)}</div>
              {res?.labels && <label className="flex items-center gap-1 text-[13px]"><input data-testid="mask-toggle" type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} />Mask overlay</label>}
              {res?.labels && <label className="flex items-center gap-1 text-[13px]">Opacity<input type="range" min={0.1} max={0.9} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></label>}
            </div>
            {layout === "side" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <figure><canvas ref={cOrig} data-testid="canvas-original" className="w-full rounded border border-emerald-200 bg-slate-100" /><figcaption className="text-center text-[13px] text-slate-600">Original</figcaption></figure>
                <figure><canvas ref={cProc} data-testid="canvas-processed" onClick={pickSeed} className={`w-full rounded border border-emerald-200 bg-slate-100 ${p.seg === "grow" ? "cursor-crosshair" : ""}`} /><figcaption className="text-center text-[13px] text-slate-600">Processed{res?.labels ? " with segmentation" : ""}{p.seg === "grow" && !p.seed ? " — click the image to place the seed" : ""}</figcaption></figure>
              </div>
            ) : (
              <div className="relative mx-auto" style={{ maxWidth: 900 }}>
                <canvas ref={cOrig} data-testid="canvas-original" className="w-full rounded border border-emerald-200" />
                <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}><canvas ref={cSwipe} data-testid="canvas-swipe" onClick={pickSeed} className="h-full w-full rounded" /></div>
                <input aria-label="Swipe position" data-testid="swipe" type="range" min={0} max={100} value={swipe} onChange={(e) => setSwipe(+e.target.value)} className="absolute bottom-2 left-1/2 w-2/3 -translate-x-1/2" />
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" data-testid="dl-processed" className={L_BTN} onClick={() => void dlProcessed()}>Processed image (PNG)</button>
              <button type="button" data-testid="dl-mask" className={L_BTN} disabled={!res?.labels} onClick={() => void dlMask()}>Mask (PNG)</button>
              <button type="button" data-testid="dl-overlay" className={L_BTN} disabled={!res?.labels} onClick={() => void dlOverlay()}>Overlay (PNG)</button>
              <button type="button" data-testid="dl-json" className={L_BTN} onClick={() => report && save(new Blob([JSON.stringify(report, null, 1)], { type: "application/json" }), "analysis-report.json")}>Analysis report (JSON)</button></div>
          </section>
          <aside className="space-y-3">
            <div className={L_CARD}><h2 className={L_H3}>Enhancement</h2><div className="space-y-2">
              <label className="flex items-center gap-2 text-[14px]">Noise reduction <select data-testid="denoise" className={SEL} value={p.denoise} onChange={(e) => set("denoise", e.target.value as Denoise)}><option value="none">None</option><option value="median">Median</option><option value="gaussian">Gaussian</option></select></label>
              {p.denoise === "median" && <Slider label="Radius" k="dR" min={1} max={4} id="dr" />}{p.denoise === "gaussian" && <Slider label="σ" k="dS" min={0.5} max={5} step={0.5} id="ds" />}
              <label className="flex items-center gap-2 text-[14px]">Contrast <select data-testid="contrast" className={SEL} value={p.contrast} onChange={(e) => set("contrast", e.target.value as Contrast)}><option value="none">None</option><option value="stretch">Percentile stretch</option><option value="window">Window / level</option><option value="clahe">CLAHE</option></select></label>
              {p.contrast === "stretch" && <><Slider label="Low %" k="lo" min={0} max={20} id="lo" /><Slider label="High %" k="hi" min={80} max={100} id="hi" /></>}
              {p.contrast === "window" && <><Slider label="Level" k="level" min={0} max={255} id="level" /><Slider label="Width" k="width" min={10} max={255} id="width" /></>}
              {p.contrast === "clahe" && <Slider label="Clip limit" k="clip" min={1} max={8} id="clip" />}
              <Slider label="Sharpen" k="sharpen" min={0} max={3} step={0.5} id="sharpen" /><Slider label="Gamma" k="gamma" min={0.4} max={2.5} step={0.1} id="gamma" />
              <label className="flex items-center gap-2 text-[14px]"><input data-testid="invert" type="checkbox" checked={p.invert} onChange={(e) => set("invert", e.target.checked)} />Invert grey levels</label>
              <button type="button" className={L_BTN} onClick={() => setP(DEF)}>Reset all</button></div></div>
            <div className={L_CARD}><h2 className={L_H3}>Segmentation (classical)</h2><div className="space-y-2">
              <label className="flex items-center gap-2 text-[14px]">Method <select data-testid="seg" className={SEL} value={p.seg} onChange={(e) => set("seg", e.target.value as Seg)}><option value="none">None</option><option value="otsu">Otsu threshold</option><option value="multi">Multi-level Otsu (3 classes)</option><option value="manual">Manual threshold</option><option value="grow">Region growing (click a seed)</option></select></label>
              {(p.seg === "otsu" || p.seg === "manual") && <label className="flex items-center gap-2 text-[14px]"><input data-testid="bright" type="checkbox" checked={p.bright} onChange={(e) => set("bright", e.target.checked)} />Keep the brighter side</label>}
              {p.seg === "multi" && <label className="flex items-center gap-2 text-[14px]">Class <select data-testid="cls" className={SEL} value={p.cls} onChange={(e) => set("cls", +e.target.value as 0 | 1 | 2)}><option value={0}>Dark</option><option value={1}>Middle</option><option value={2}>Bright</option></select></label>}
              {p.seg === "manual" && <Slider label="Threshold" k="thr" min={0} max={255} id="thr" />}{p.seg === "grow" && <Slider label="Tolerance ±" k="tol" min={2} max={80} id="tol" />}
              {p.seg !== "none" && <><Slider label="Open radius" k="open" min={0} max={5} id="open" /><Slider label="Close radius" k="close" min={0} max={5} id="close" /><Slider label="Min region px" k="minArea" min={1} max={500} id="minarea" />
                <label className="flex items-center gap-2 text-[14px]"><input data-testid="fill" type="checkbox" checked={p.fill} onChange={(e) => set("fill", e.target.checked)} />Fill holes</label></>}
            </div></div>
            <div className={L_CARD} data-testid="ops"><h2 className={L_H3}>Operations performed</h2>
              <ol className="list-decimal pl-5 text-[14px]" data-testid="ops-list"><li>Decoded {name} to 8-bit grayscale ({src.w}×{src.h} px)</li>{res?.log.map((l, i) => <li key={i}>{l}</li>)}</ol>
              {res && !res.log.length && <p className="text-[13px] text-slate-600">No enhancement or segmentation selected: the processed image equals the grayscale original.</p>}</div>
            {res && p.seg !== "none" && <div className={L_CARD} data-testid="regions"><h2 className={L_H3}>Regions</h2>
              <label className="mb-2 flex items-center gap-2 text-[13px]">Pixel size (mm) <input data-testid="pixel-size" className="w-20 rounded border border-emerald-300 px-1" value={mm} onChange={(e) => setMm(e.target.value)} placeholder="optional" /></label>
              {res.regions.length === 0 ? <p className="text-[14px] text-slate-600" data-testid="no-regions">{p.seg === "grow" && !p.seed ? "Click the processed image to place a seed." : "No region met these settings."}</p> :
                <table className="w-full text-[13px]"><thead><tr className="border-b border-emerald-200 text-left text-[#11643A]"><th>#</th><th className="text-right">Area {hasPx ? "mm²" : "px"}</th><th className="text-right">Mean grey</th><th className="text-right">BBox</th></tr></thead>
                  <tbody>{res.regions.slice(0, 60).map((r) => <tr key={r.id} data-testid="region-row" onClick={() => setSel(sel === r.id ? null : r.id)} className={`cursor-pointer border-b border-emerald-50 ${sel === r.id ? "bg-[#E9F7EF]" : ""}`}><td><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[(r.id - 1) % COLORS.length] }} />{r.id}</td><td className="text-right">{hasPx ? (r.area * px * px).toFixed(1) : r.area}</td><td className="text-right">{r.mean.toFixed(0)}</td><td className="text-right">{r.x1 - r.x0 + 1}×{r.y1 - r.y0 + 1}</td></tr>)}</tbody></table>}
              {res.regions.length > 60 && <p className="text-[12px] text-slate-500">Showing 60 of {res.regions.length}; the JSON report lists all.</p>}
              <p className="mt-2 text-[12px] text-slate-500">Areas are pixel counts unless you enter a pixel size. Regions are intensity-based and carry no anatomical or diagnostic label.</p></div>}
            <div className={L_CARD}><h2 className={L_H3}>Limitations</h2><p className="text-[13px] text-slate-600">Threshold and region-growing segmentation find areas by brightness only; they do not know anatomy and will include or miss structures with similar brightness. No trained medical segmentation network is included. Window / level here acts on 8-bit PNG / JPEG values, not on DICOM Hounsfield units. Nothing here is validated for clinical use.</p></div>
          </aside>
        </div>)}
    </LightShell>
  );
}
