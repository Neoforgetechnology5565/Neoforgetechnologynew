"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Branding } from "@/lib/types";
import LightShell, { L_BTN, L_CARD, L_GO, L_H3 } from "@/components/light/LightShell";
import { AnimalDetector } from "@/lib/farm/detector";
import { LIMITS, FarmProcessor, drawFrame, eventsCsv, labelOf, runVideo } from "@/lib/farm/engine";
import { groundPoint, inPolygon } from "@/lib/farm/geometry";
import { ANIMALS, BY_KEY, type FrameOut, type Pt, type Summary } from "@/lib/farm/types";

const SAMPLES = [{ id: "chelsea", title: "Domestic cat (skimage sample, CC0)", url: "/ml/samples/chelsea.jpg", note: "A cat, not a farm scene: it shows detection, labelling, counting and the zone check on a real photograph. No licensed farm photographs or farm video could be fetched for this site, so use your own." }];
const IMG_RE = /\.(jpe?g|png|webp)$/i, VID_RE = /\.(mp4|webm|mov|m4v)$/i;
const save = (blob: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

export default function FarmApp({ branding }: { branding: Branding }) {
  const [kind, setKind] = useState<"image" | "video" | null>(null); const [src, setSrc] = useState(""); const [name, setName] = useState(""); const [sampleNote, setSampleNote] = useState("");
  const [dim, setDim] = useState({ w: 0, h: 0 }); const [zone, setZone] = useState<Pt[]>([]); const [drawing, setDrawing] = useState(false);
  const [conf, setConf] = useState(0.35); const [fps, setFps] = useState(4); const [busy, setBusy] = useState(false); const [prog, setProg] = useState(0); const [error, setError] = useState("");
  const [frames, setFrames] = useState<FrameOut[]>([]); const [summary, setSummary] = useState<Summary | null>(null); const [stopped, setStopped] = useState(false); const [view, setView] = useState<"processed" | "original">("processed");
  const imgRef = useRef<HTMLImageElement>(null), vidRef = useRef<HTMLVideoElement>(null), cvs = useRef<HTMLCanvasElement>(null), det = useRef<AnimalDetector | null>(null), abort = useRef<AbortController | null>(null), frameRef = useRef<FrameOut[]>([]);
  frameRef.current = frames;
  const zoneRef = useRef(zone); zoneRef.current = zone; const viewRef = useRef(view); viewRef.current = view;

  const reset = () => { setFrames([]); setSummary(null); setStopped(false); setError(""); setProg(0); };
  const load = (k: "image" | "video", url: string, n: string, note = "") => { if (src.startsWith("blob:")) URL.revokeObjectURL(src); reset(); setZone([]); setDrawing(false); setKind(k); setSrc(url); setName(n); setSampleNote(note); setDim({ w: 0, h: 0 }); };
  const onFile = (f: File) => {
    setError("");
    if (!f.size) { setError("That file is empty."); return; }
    if (IMG_RE.test(f.name) || /^image\/(jpeg|png|webp)$/.test(f.type)) { if (f.size > LIMITS.maxImageMb * 1e6) { setError(`Images are limited to ${LIMITS.maxImageMb} MB.`); return; } load("image", URL.createObjectURL(f), f.name); }
    else if (VID_RE.test(f.name) || /^video\//.test(f.type)) { if (f.size > LIMITS.maxVideoMb * 1e6) { setError(`Videos are limited to ${LIMITS.maxVideoMb} MB.`); return; } load("video", URL.createObjectURL(f), f.name); }
    else setError("Unsupported file. Upload a JPEG, PNG or WebP image, or an MP4 / WebM / MOV video.");
  };

  const paint = useCallback(() => {
    const c = cvs.current; if (!c || !dim.w) return; c.width = dim.w; c.height = dim.h; const ctx = c.getContext("2d")!; ctx.clearRect(0, 0, dim.w, dim.h);
    const z = zoneRef.current; let dets: FrameOut["dets"] = [];
    if (viewRef.current === "processed") {
      if (kind === "video" && vidRef.current) { const t = vidRef.current.currentTime, fs = frameRef.current; let best: FrameOut | null = null; for (const f of fs) { if (f.t <= t + 0.001) best = f; else break; } if (best && t - best.t < 1.5) dets = best.dets; }
      else if (kind === "image") dets = frameRef.current[0]?.dets ?? [];
    }
    drawFrame(ctx, dets, dim.w, dim.h, z.length ? z : null);
    if (drawing || (z.length && z.length < 3)) { const lw = Math.max(2, Math.round(Math.max(dim.w, dim.h) / 300)); ctx.fillStyle = "#16834A"; z.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * dim.w, y * dim.h, lw * 2.5, 0, 7); ctx.fill(); }); if (z.length > 1) { ctx.beginPath(); z.forEach(([x, y], k) => (k ? ctx.lineTo(x * dim.w, y * dim.h) : ctx.moveTo(x * dim.w, y * dim.h))); ctx.strokeStyle = "#16834A"; ctx.lineWidth = lw; ctx.stroke(); } }
  }, [dim, drawing, kind]);
  useEffect(() => { paint(); }, [paint, zone, frames, view]);
  useEffect(() => { if (kind !== "video") return; let raf = 0; const loop = () => { paint(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, [kind, paint]);

  const clickStage = (e: React.MouseEvent) => {
    if (!drawing) return; const r = cvs.current!.getBoundingClientRect(); const p: Pt = [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
    setZone((z) => [...z, p]); setFrames([]); setSummary(null);
  };
  const zoneOk = zone.length >= 3;

  const run = async () => {
    if (!kind || !src) return; setError(""); setBusy(true); setSummary(null); setFrames([]); setStopped(false); setProg(0); abort.current = new AbortController();
    try {
      if (!det.current) det.current = await AnimalDetector.create();
      const z = zoneOk ? zone : null;
      if (kind === "image") {
        const img = imgRef.current!; if (!img.naturalWidth) throw new Error("The image has not finished loading."); const w = img.naturalWidth, h = img.naturalHeight;
        const t0 = performance.now(); const raw = await det.current.detect(img, w, h, conf); const ms = performance.now() - t0;
        const p = new FarmProcessor({ conf, fps: 1, minHits: 1, w, h, zone: z }); const f = p.step(raw, 0, 0);
        // single image: tracking does not apply, so every detection is an instance and the zone test is per detection
        f.dets.forEach((d) => { delete d.track; d.inZone = z ? inPolygon(groundPoint(d.box, w, h), z) : undefined; });
        const unique: Record<string, number> = {}; f.dets.forEach((d) => (unique[d.cls] = (unique[d.cls] ?? 0) + 1));
        setFrames([f]); setSummary({ frames: 1, seconds: ms / 1000, inferMs: Math.round(ms), unique, peak: unique, instances: raw.length, zone: z, events: [], zoneEntries: f.dets.filter((d) => d.inZone).length });
      } else {
        const r = await runVideo(src, det.current, { conf, sampleFps: fps, minHits: 3, zone: z, signal: abort.current.signal, onFrame: (_f, d, t) => setProg(d / t) });
        setFrames(r.frames); setSummary(r.summary); setStopped(r.stopped); if (vidRef.current) vidRef.current.currentTime = 0;
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); } finally { setBusy(false); }
  };

  const png = () => {
    const c = document.createElement("canvas"); c.width = dim.w; c.height = dim.h; const ctx = c.getContext("2d")!; const el = kind === "image" ? imgRef.current! : vidRef.current!; ctx.drawImage(el, 0, 0, dim.w, dim.h);
    const fs = frames; let dets = fs[0]?.dets ?? []; if (kind === "video" && vidRef.current) { const t = vidRef.current.currentTime; let b: FrameOut | null = null; for (const f of fs) { if (f.t <= t + 0.001) b = f; else break; } dets = b?.dets ?? []; }
    drawFrame(ctx, dets, dim.w, dim.h, zoneOk ? zone : null); c.toBlob((b) => b && save(b, `${name.replace(/\.[^.]+$/, "") || "farm"}-annotated.png`), "image/png");
  };
  const report = useMemo(() => summary && ({ file: name, kind, model: "YOLOX-tiny, COCO-trained (Apache-2.0), run in the browser with ONNX Runtime Web (WASM)", supported_animal_classes: ANIMALS.map((a) => a.key), confidence_threshold: conf, analysed_frames: summary.frames, frame_sampling_per_second: kind === "video" ? fps : null, tracker: kind === "video" ? "ByteTrack (temporary track IDs, not identities)" : "none (single image)", zone_polygon_normalised: summary.zone, zone_rule: "an animal is inside when the bottom-centre of its box is inside the polygon", unique_animals_by_class: summary.unique, peak_visible_by_class: summary.peak, zone_entries: summary.zoneEntries, zone_events: summary.events, stopped_early: stopped }), [summary, name, kind, conf, fps, stopped]);

  const counts = summary ? Object.entries(summary.unique).sort((a, b) => b[1] - a[1]) : [];
  return (
    <LightShell branding={branding} title="Animal Detection & Monitoring for Smart Farming" project={name || "No file selected"} status={busy ? "Analysing…" : summary ? "Result ready" : "Ready"}
      notice="Prototype. Detects and counts animals of the ten classes a COCO-trained model knows (sheep, cow and horse are the livestock classes; goats, pigs, chickens and deer are not detectable) and flags when a detected animal stands inside a zone you draw. It does not detect crop damage, disease, health or behaviour, it is not a security system, and every number comes from the detections shown. Everything runs in your browser; nothing is uploaded."
      footer="Model: YOLOX-tiny (Apache-2.0) trained on COCO. Tracking: ByteTrack. No file leaves your device.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          <div className={L_CARD}>
            <h2 className={L_H3}>1 · Choose a photograph or video</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`${L_GO} cursor-pointer`}>Upload image or video<input data-testid="file-input" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} /></label>
              {SAMPLES.map((s) => <button key={s.id} type="button" data-testid={`sample-${s.id}`} className={L_BTN} disabled={busy} onClick={() => load("image", s.url, s.title, s.note)}>{s.title}</button>)}
            </div>
            <p className="mt-2 text-[13px] text-slate-600">JPEG, PNG, WebP up to {LIMITS.maxImageMb} MB; MP4, WebM or MOV up to {LIMITS.maxVideoMb} MB and {LIMITS.maxSeconds} s. {sampleNote}</p>
            {error && <div role="alert" data-testid="error" className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-[14px] text-red-700">{error}</div>}
          </div>
          <div className={L_CARD}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className={L_H3 + " !mb-0"}>2 · Crop-protection zone</h2>
              <button type="button" data-testid="zone-draw" className={L_BTN} disabled={!kind || busy} onClick={() => { if (!drawing) { setZone([]); setFrames([]); setSummary(null); } setDrawing(!drawing); }}>{drawing ? "Finish drawing" : zone.length ? "Redraw zone" : "Draw zone"}</button>
              <button type="button" data-testid="zone-clear" className={L_BTN} disabled={!zone.length || busy} onClick={() => { setZone([]); setDrawing(false); setFrames([]); setSummary(null); }}>Clear zone</button>
              <span data-testid="zone-state" className="text-[13px] text-slate-600">{drawing ? `Click the picture to add corners (${zone.length} so far; at least 3).` : zoneOk ? `Zone set with ${zone.length} corners.` : "No zone: detection and counting only."}</span>
            </div>
            <div className="relative mx-auto w-full overflow-hidden rounded-md border border-emerald-200 bg-slate-100" style={{ maxWidth: 1000, aspectRatio: dim.w ? `${dim.w}/${dim.h}` : "16/9" }} data-testid="stage" onClick={clickStage}>
              {!kind && <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-center text-slate-500" data-testid="stage-empty">Nothing to show yet. Upload a photograph or video, or open the sample, then press Detect animals.</div>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {kind === "image" && <img ref={imgRef} src={src} alt="Selected farm photograph" className="absolute inset-0 h-full w-full object-fill" data-testid="stage-image" onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} onError={() => setError("This image could not be decoded.")} />}
              {kind === "video" && <video ref={vidRef} src={src} muted playsInline controls={!drawing} preload="auto" className="absolute inset-0 h-full w-full object-fill" data-testid="stage-video" onLoadedMetadata={(e) => setDim({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} onError={() => setError("This video could not be opened in the browser. Try MP4 (H.264) or WebM.")} />}
              {kind && <canvas ref={cvs} data-testid="overlay" className={`absolute inset-0 h-full w-full ${drawing ? "cursor-crosshair" : "pointer-events-none"}`} style={drawing ? undefined : { pointerEvents: "none" }} />}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[14px]">
              <label className="flex items-center gap-2">Confidence ≥ <input data-testid="conf" type="range" min={0.15} max={0.8} step={0.05} value={conf} disabled={busy} onChange={(e) => setConf(+e.target.value)} /><b>{conf.toFixed(2)}</b></label>
              {kind === "video" && <label className="flex items-center gap-2">Frames per second analysed <select data-testid="fps" className="rounded border border-emerald-300 px-1" value={fps} disabled={busy} onChange={(e) => setFps(+e.target.value)}>{[1, 2, 4, 6].map((n) => <option key={n}>{n}</option>)}</select></label>}
              <button type="button" data-testid="run" className={L_GO} disabled={!kind || busy || drawing || (kind === "image" && !dim.w)} onClick={() => void run()}>{busy ? "Analysing…" : "Detect animals"}</button>
              {busy && kind === "video" && <button type="button" data-testid="stop" className={L_BTN} onClick={() => abort.current?.abort()}>Stop</button>}
              {summary && <div className="inline-flex overflow-hidden rounded border border-emerald-300 text-[13px]">{(["processed", "original"] as const).map((v) => <button key={v} type="button" data-testid={`view-${v}`} onClick={() => setView(v)} className={`px-3 py-1 ${view === v ? "bg-[#16834A] text-white" : "bg-white text-[#11643A]"}`}>{v === "processed" ? "Detections" : "Original"}</button>)}</div>}
            </div>
            {busy && <div className="mt-2 h-2 overflow-hidden rounded bg-emerald-100" role="progressbar" aria-valuenow={Math.round(prog * 100)}><div className="h-full bg-[#16834A]" style={{ width: `${Math.max(3, prog * 100)}%` }} /></div>}
          </div>
        </section>
        <aside className="space-y-3">
          <div className={L_CARD} data-testid="results">
            <h2 className={L_H3}>Results</h2>
            {!summary ? <p className="text-slate-600" data-testid="results-empty">Results appear here after an analysis. Nothing is shown before then.</p> : (<>
              <p className="text-[14px]" data-testid="headline"><b data-testid="total">{counts.reduce((s, [, n]) => s + n, 0)}</b> {kind === "video" ? "distinct animals tracked" : "animal(s) detected"}{stopped ? " (stopped early)" : ""}. {summary.zone ? <><b data-testid="zone-count">{summary.zoneEntries}</b> {kind === "video" ? "zone entries" : "inside the zone"}.</> : "No zone set."}</p>
              <table className="mt-2 w-full text-[14px]" data-testid="counts"><thead><tr className="border-b border-emerald-200 text-left text-[#11643A]"><th>Class</th><th className="text-right">{kind === "video" ? "Distinct tracks" : "Detected"}</th><th className="text-right">Peak in view</th></tr></thead>
                <tbody>{counts.length ? counts.map(([k, n]) => <tr key={k} data-testid={`count-${k}`} className="border-b border-emerald-50"><td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: BY_KEY[k as keyof typeof BY_KEY].color }} />{labelOf(k)}{BY_KEY[k as keyof typeof BY_KEY].livestock ? " (livestock class)" : ""}</td><td className="text-right">{n}</td><td className="text-right">{summary.peak[k] ?? 0}</td></tr>) : <tr><td colSpan={3} className="py-2 text-slate-600" data-testid="none-found">No animal of the supported classes was detected at this confidence.</td></tr>}</tbody></table>
              <p className="mt-2 text-[12px] text-slate-500">Operations performed: YOLOX-tiny inference on {summary.frames} {summary.frames === 1 ? "image" : "sampled frames"} ({summary.inferMs} ms per {summary.frames === 1 ? "image" : "frame"}){kind === "video" ? ", ByteTrack association (a track counts after 3 matched frames), polygon test on each animal’s ground point" : summary.zone ? ", polygon test on each animal’s ground point" : ""}.</p>
            </>)}
          </div>
          {summary && summary.zone && kind === "video" && (
            <div className={L_CARD} data-testid="events">
              <h2 className={L_H3}>Zone events</h2>
              {summary.events.length === 0 ? <p className="text-slate-600" data-testid="no-events">No tracked animal crossed into or out of the zone.</p> :
                <table className="w-full text-[14px]"><thead><tr className="border-b border-emerald-200 text-left text-[#11643A]"><th>Time</th><th>Animal</th><th>Event</th></tr></thead><tbody>{summary.events.map((e, i) => <tr key={i} data-testid="event-row" className="border-b border-emerald-50"><td>{e.t.toFixed(1)} s</td><td>{labelOf(e.cls)} #{e.track}</td><td className={e.kind === "enter" ? "font-semibold text-red-600" : ""}>{e.kind === "enter" ? "entered zone" : "left zone"}</td></tr>)}</tbody></table>}
              <p className="mt-2 text-[12px] text-slate-500">Times are positions in the video at the sampled frames; events between samples can be missed.</p>
            </div>)}
          {summary && <div className={L_CARD}><h2 className={L_H3}>Downloads</h2><div className="flex flex-wrap gap-2">
            <button type="button" data-testid="dl-png" className={L_BTN} onClick={png}>{kind === "video" ? "Annotated frame (PNG)" : "Annotated image (PNG)"}</button>
            <button type="button" data-testid="dl-json" className={L_BTN} onClick={() => save(new Blob([JSON.stringify({ ...report, frames: kind === "video" ? frames : undefined, detections: kind === "image" ? frames[0]?.dets : undefined }, null, 1)], { type: "application/json" }), "farm-summary.json")}>Summary (JSON)</button>
            {kind === "video" && summary.zone && <button type="button" data-testid="dl-csv" className={L_BTN} onClick={() => save(new Blob([eventsCsv(summary.events)], { type: "text/csv" }), "zone-events.csv")}>Zone events (CSV)</button>}</div></div>}
          <div className={L_CARD}><h2 className={L_H3}>What this can and cannot do</h2>
            <p className="text-[13px] text-slate-600" data-testid="classes"><b>Supported classes:</b> {ANIMALS.map((a) => a.label).join(", ")}. Sheep, cow and horse are the livestock classes. No goat, pig, chicken, deer or other species class exists in this model, so those animals are either missed or named as the nearest class (for example a goat as a sheep or a dog).</p>
            <p className="mt-1 text-[13px] text-slate-600">Counts are of detections. Distinct-animal counts use temporary tracker IDs that can switch or split when animals overlap or leave the view. Not implemented: crop-damage, disease or health detection, species beyond the list, live camera feeds.</p>
          </div>
        </aside>
      </div>
    </LightShell>
  );
}
