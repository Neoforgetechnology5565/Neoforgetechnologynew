"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { VehicleApiError, vehicleApi, type Health, type JobInfo } from "@/lib/vehicle/api";
import type { BrowserDetector } from "@/lib/vehicle/detector";
import { BROWSER_LIMITS, runBrowserVideo } from "@/lib/vehicle/engine";
import { CLASS_COLOR, CLASS_LABEL, VCLASSES, framesToCsv, zeroCounts, type FrameRec, type ImageResult, type Line, type SampleInfo, type Summary } from "@/lib/vehicle/types";
import OverlayPlayer, { type OverlayOpts, type PlayerHandle, type PlayerMode } from "./OverlayPlayer";
import StatsPanel from "./StatsPanel";

const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40";
const GO = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40";
const STOP = "rounded-md border border-red-500/70 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-40";
const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,image/jpeg,image/png,image/webp,.mp4,.mov,.m4v,.webm,.mkv,.avi,.jpg,.jpeg,.png,.webp";
/** H.264 is missing from some browsers (e.g. open-source Chromium); the sample and the processed video are also provided as VP8 WebM. */
const canH264 = () => { try { return !!document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'); } catch { return true; } };
const IMG_EXT = /\.(jpe?g|png|webp)$/i;

type Engine = "server" | "browser";
type Status = "idle" | "loading-model" | "uploading" | "queued" | "running" | "completed" | "stopped" | "failed";
interface Media { kind: "video" | "image"; name: string; url: string; file?: File; sampleId?: string; fps?: number }
const download = (name: string, body: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); };

export default function VehicleApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? vehicleApi(serviceUrl) : null), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">(serviceUrl ? "unknown" : "offline"); const [health, setHealth] = useState<Health | null>(null);
  const [engine, setEngine] = useState<Engine>("browser"); const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [media, setMedia] = useState<Media | null>(null); const [conf, setConf] = useState(0.3); const [stride, setStride] = useState(1); const [sampleFps, setSampleFps] = useState(5); const [minHits] = useState(3);
  const [line, setLine] = useState<Line | null>(null); const [drawing, setDrawing] = useState(false);
  const [status, setStatus] = useState<Status>("idle"); const [error, setError] = useState(""); const [progress, setProgress] = useState({ done: 0, total: 0, fps: 0, elapsed: 0 });
  const [summary, setSummary] = useState<Summary | null>(null); const [job, setJob] = useState<JobInfo | null>(null); const [cur, setCur] = useState<FrameRec | null>(null);
  const [mode, setMode] = useState<PlayerMode>("overlay"); const [opts, setOpts] = useState<OverlayOpts>({ boxes: true, ids: true, labels: true, confidence: true }); const [follow, setFollow] = useState(true);
  const [imgRes, setImgRes] = useState<ImageResult | null>(null); const [engineUsed, setEngineUsed] = useState<Engine | null>(null); const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const frames = useRef<FrameRec[]>([]); const [, bump] = useState(0); const abort = useRef<AbortController | null>(null); const jobId = useRef<string | null>(null); const detector = useRef<BrowserDetector | null>(null); const player = useRef<PlayerHandle>(null); const lastFollow = useRef(0);
  const running = status === "loading-model" || status === "uploading" || status === "queued" || status === "running";

  // service availability and samples ------------------------------------------------------------------------------------
  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); setEngine("server"); }).catch(() => setService("offline")); }, [api]);
  useEffect(() => { fetch("/vehicle/samples/manifest.json").then((r) => r.json()).then((m) => setSamples(m.samples.map((s: Omit<SampleInfo, "url"> & { file: string; webm?: string }) => ({ ...s, url: `/vehicle/samples/${!canH264() && s.webm ? s.webm : s.file}` })))).catch(() => undefined); }, []);
  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => { const id = window.setInterval(() => { if (running) bump((n) => n + 1); }, 400); return () => window.clearInterval(id); }, [running]);

  const reset = useCallback(() => { frames.current = []; setCur(null); setSummary(null); setJob(null); setProcessedSrc(null); setImgRes(null); setError(""); setProgress({ done: 0, total: 0, fps: 0, elapsed: 0 }); setStatus("idle"); setMode("overlay"); setEngineUsed(null); jobId.current = null; }, []);
  const pickSample = async (s: SampleInfo) => {
    if (running) return; reset(); setLine(null); setMedia({ kind: "video", name: s.title, url: s.url, sampleId: s.id, fps: s.fps });
    try { // load the whole (small) clip into memory: instant, exact seeking regardless of whether the host supports HTTP range requests
      const blob = await (await fetch(s.url)).blob(); const u = URL.createObjectURL(blob); setMedia((m) => (m && m.sampleId === s.id ? { ...m, url: u } : m));
    } catch { /* keep streaming from the network URL */ }
  };
  const pickFile = (f: File | undefined) => {
    if (!f || running) return; reset(); setLine(null);
    const limit = (health?.limits.max_video_mb ?? 100) * 1_000_000; const isImg = IMG_EXT.test(f.name) || f.type.startsWith("image/");
    if (!isImg && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name) && !f.type.startsWith("video/")) { setError("Unsupported file type. Upload an MP4, MOV, WebM, MKV or AVI video, or a JPEG, PNG or WebP image."); return; }
    if (!isImg && engine === "server" && f.size > limit) { setError(`The file is larger than the ${limit / 1_000_000} MB limit of the processing service.`); return; }
    setMedia({ kind: isImg ? "image" : "video", name: f.name, url: URL.createObjectURL(f), file: f });
  };

  // processing ----------------------------------------------------------------------------------------------------------------
  const fail = (e: unknown) => { setStatus("failed"); setError(e instanceof Error ? e.message : "Processing failed."); };
  const runImage = async (m: Media, eng: Engine) => {
    if (eng === "server" && api && m.file) { const r = await api.detectImage(m.file, conf); setImgRes(r); setStatus("completed"); return; }
    setStatus("loading-model"); detector.current ??= await (await import("@/lib/vehicle/detector")).BrowserDetector.create();
    const img = new Image(); img.src = m.url; await img.decode(); setStatus("running"); const t0 = performance.now(); const dets = await detector.current.detect(img, img.naturalWidth, img.naturalHeight, conf); const ms = performance.now() - t0;
    const counts = zeroCounts(); for (const d of dets) counts[d.cls]++;
    setImgRes({ image: { width: img.naturalWidth, height: img.naturalHeight }, model: "yolox_tiny", inference_ms: Math.round(ms * 10) / 10, vehicles_visible: dets.length, class_counts: counts, detections: dets.map((d) => ({ track_id: null, class: d.cls, confidence: Math.round(d.score * 1e4) / 1e4, bbox: { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 } })) }); setStatus("completed");
  };
  const runServer = async (m: Media) => {
    if (!api) throw new Error("The processing service is not configured.");
    setStatus("uploading"); const j = await api.startVideo(m.sampleId ? { sampleId: m.sampleId } : { file: m.file }, { conf, stride, minHits, line }); jobId.current = j.job_id; setJob(j); setStatus("queued");
    let next = 0;
    for (;;) {
      const info = await api.job(j.job_id); setJob(info); if (info.status === "queued" || info.status === "running") setStatus(info.status);
      setProgress({ done: info.progress.frames_processed, total: info.progress.total_frames_estimate, fps: info.progress.live_fps, elapsed: info.progress.elapsed_seconds });
      for (;;) { const f = await api.frames(j.job_id, next); if (!f.frames.length) break; frames.current.push(...f.frames); next = f.next_start; }
      if (follow && frames.current.length && Date.now() - lastFollow.current > 450) { lastFollow.current = Date.now(); player.current?.seek(frames.current[frames.current.length - 1].timestamp_seconds); }
      if (info.status === "failed") throw new Error(info.error_detail ? `${info.error} (${info.error_detail})` : info.error ?? "Processing failed.");
      if (info.status === "completed" || info.status === "cancelled") {
        for (;;) { const f = await api.frames(j.job_id, next); if (!f.frames.length) break; frames.current.push(...f.frames); next = f.next_start; }
        setSummary(info.summary); setStatus(info.status === "completed" ? "completed" : "stopped"); const v = canH264() ? info.outputs.video_mp4 ?? info.outputs.video_webm : info.outputs.video_webm ?? info.outputs.video_mp4; setProcessedSrc(v ? api.url(v) : null); setCur(frames.current[frames.current.length - 1] ?? null); return;
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  };
  const runBrowser = async (m: Media) => {
    setStatus("loading-model"); detector.current ??= await (await import("@/lib/vehicle/detector")).BrowserDetector.create();
    setStatus("running"); abort.current = new AbortController();
    const r = await runBrowserVideo(m.url, detector.current, { conf, sampleFps, minHits, line, signal: abort.current.signal, onFrame: (f, done, total) => {
      frames.current.push(f); setProgress({ done, total, fps: 0, elapsed: 0 }); if (follow && Date.now() - lastFollow.current > 450) { lastFollow.current = Date.now(); player.current?.seek(f.timestamp_seconds); } } });
    setSummary(r.summary); setStatus(r.stopped ? "stopped" : "completed"); setCur(frames.current[frames.current.length - 1] ?? null);
  };
  const start = async () => {
    if (!media || running) return; const eng = engine; const keepLine = line; reset(); setLine(keepLine); setEngineUsed(eng);
    try { if (media.kind === "image") await runImage(media, eng); else if (eng === "server") await runServer(media); else await runBrowser(media); }
    catch (e) { fail(e instanceof VehicleApiError ? e : e); }
  };
  const stop = async () => { abort.current?.abort(); if (engine === "server" && api && jobId.current) { try { await api.stop(jobId.current); } catch (e) { fail(e); } } };

  const live = running && status === "running";
  const shown = cur ?? (running && frames.current.length ? frames.current[frames.current.length - 1] : null);
  const statusText = { idle: "Ready", "loading-model": "Loading detection model…", uploading: "Uploading…", queued: "Queued…", running: `Processing ${progress.total ? Math.round((100 * progress.done) / progress.total) : 0}%`, completed: "Completed", stopped: "Stopped (partial results)", failed: "Failed" }[status];
  const pct = progress.total ? Math.min(100, Math.round((100 * progress.done) / progress.total)) : status === "completed" ? 100 : 0;
  const onFrame = useCallback((rec: FrameRec | null) => setCur(rec), []);
  const videoFps = media?.fps ?? job?.video.fps ?? 25;

  return (
    <DemoShell branding={branding} app="Vehicle Detection & Tracking" project={media ? media.name : "No media selected"} status={statusText} badge="Computer Vision · prototype" back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision"
      footer="Detections come from a real pretrained model (YOLOX, COCO classes) and tracks from ByteTrack, run on the media you provide. Accuracy has not been benchmarked here; small, distant, occluded or unusual vehicles are missed or mislabelled, and vans are reported as car or truck. This demonstration only detects, tracks and counts vehicles: it does not read number plates or identify people or vehicles.">
      <div className="mx-auto grid max-w-[110rem] gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-3">
          {/* source and controls */}
          <section className={CARD} aria-label="Media and processing controls">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="min-w-[14rem] flex-1"><h3 className={H3}>1 · Choose media</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {samples.map((s) => <button key={s.id} type="button" disabled={running} onClick={() => pickSample(s)} data-testid={`sample-${s.id}`} className={`rounded-lg border px-3 py-2 text-left text-xs ${media?.sampleId === s.id ? "border-blue-500 bg-blue-600/10 text-white" : "border-slate-700 text-slate-200 hover:border-blue-500"}`}><b className="block text-sm">{s.title}</b><span className="text-slate-400">{s.width}×{s.height} · {s.duration_seconds}s · sample</span></button>)}
                  <label className={`${BTN} flex cursor-pointer items-center`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}>Upload video or image…<input type="file" hidden accept={ACCEPT} data-testid="file-input" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} disabled={running} /></label>
                </div>
                {samples[0] && media?.sampleId === samples[0].id && <p className="mt-2 text-[11px] leading-snug text-slate-500" data-testid="sample-credit">{samples[0].attribution} Licence: {samples[0].license}. <a className="text-blue-400 hover:underline" href={samples[0].source} target="_blank" rel="noreferrer">Source</a></p>}
              </div>
              <fieldset className="min-w-[16rem]"><legend className={H3}>2 · Engine</legend>
                <label className="mt-2 flex items-start gap-2 text-xs text-slate-200"><input type="radio" name="engine" checked={engine === "server"} disabled={service !== "online" || running} onChange={() => setEngine("server")} data-testid="engine-server" className="mt-0.5" /><span><b>Server</b> (FastAPI · ONNX Runtime · ByteTrack) <span className={service === "online" ? "text-emerald-300" : "text-slate-500"}>{service === "online" ? `online · ${health?.model}` : service === "unknown" ? "checking…" : serviceUrl ? "not reachable" : "not configured on this site"}</span></span></label>
                <label className="mt-1.5 flex items-start gap-2 text-xs text-slate-200"><input type="radio" name="engine" checked={engine === "browser"} disabled={running} onChange={() => setEngine("browser")} data-testid="engine-browser" className="mt-0.5" /><span><b>This browser</b> (ONNX Runtime Web, same model and tracker) <span className="text-slate-400">· slower, clips up to {BROWSER_LIMITS.maxSeconds}s</span></span></label>
              </fieldset>
              <div className="min-w-[14rem]"><h3 className={H3}>3 · Settings</h3>
                <label className="mt-2 block text-xs text-slate-300">Minimum confidence <b className="tabular-nums text-white">{conf.toFixed(2)}</b><input type="range" className="block w-full" min={0.15} max={0.8} step={0.05} value={conf} disabled={running} onChange={(e) => setConf(Number(e.target.value))} aria-label="Minimum confidence" /></label>
                {engine === "server" ? <label className="mt-2 block text-xs text-slate-300">Process every<select className="ml-2 rounded border border-slate-700 bg-slate-950 px-1 py-1" value={stride} disabled={running} onChange={(e) => setStride(Number(e.target.value))} aria-label="Frame stride">{[1, 2, 3, 5].map((s) => <option key={s} value={s}>{s === 1 ? "frame (all)" : `${s}th frame`}</option>)}</select></label>
                  : <label className="mt-2 block text-xs text-slate-300">Sample rate<select className="ml-2 rounded border border-slate-700 bg-slate-950 px-1 py-1" value={sampleFps} disabled={running} onChange={(e) => setSampleFps(Number(e.target.value))} aria-label="Sample rate">{[2, 3, 5, 8].map((s) => <option key={s} value={s}>{s} frames/s</option>)}</select></label>}
                <div className="mt-2 flex flex-wrap gap-1.5"><button type="button" className={`${BTN} ${drawing ? "!border-cyan-400 !text-cyan-200" : ""}`} aria-pressed={drawing} disabled={running || !media || media.kind !== "video" || mode !== "overlay"} onClick={() => setDrawing(!drawing)} data-testid="draw-line">{drawing ? "Click two points…" : "Draw counting line"}</button>{line && <button type="button" className={BTN} disabled={running} onClick={() => { setLine(null); setDrawing(false); }}>Clear line</button>}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={GO} disabled={!media || running} onClick={start} data-testid="start">Start processing</button>
              <button type="button" className={STOP} disabled={!running} onClick={stop} data-testid="stop">Stop processing</button>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === "failed" ? "bg-red-900/60 text-red-200" : status === "completed" ? "bg-emerald-900/60 text-emerald-200" : running ? "bg-blue-900/60 text-blue-200" : "bg-slate-800 text-slate-300"}`} role="status" data-testid="status">{statusText}</span>
              {(running || status === "completed" || status === "stopped") && media?.kind === "video" && <div className="min-w-[10rem] flex-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-2 rounded bg-slate-800"><div className="h-full rounded bg-blue-500 transition-all" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[11px] text-slate-400" data-testid="progress-text">{progress.done} / {progress.total || "?"} frames{progress.fps ? ` · ${progress.fps.toFixed(1)} frames/s` : ""}</p></div>}
            </div>
            {error && <p role="alert" data-testid="error" className="mt-3 rounded-md border border-red-500/50 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</p>}
            {engine === "server" && service === "offline" && <p className="mt-3 text-xs text-slate-400">The processing service is {serviceUrl ? "not reachable right now" : "not set up on this site"}; the in-browser engine runs the same model and tracker on your device.</p>}
          </section>

          {/* viewer */}
          {media?.kind === "image" ? <ImageViewer media={media} res={imgRes} opts={opts} /> : (
            <section className={CARD} aria-label="Detection viewer">
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <h3 className={H3}>Detection viewer</h3>
                <div role="tablist" aria-label="View" className="flex gap-1">{([["overlay", "Overlay on original"], ["processed", "Processed video"], ["side", "Side by side"]] as [PlayerMode, string][]).map(([k, l]) => { const off = (k === "processed" && !processedSrc) || !media; return <button key={k} role="tab" type="button" aria-selected={mode === k} disabled={off} title={k === "processed" && !processedSrc ? "Available after a server run (the browser engine draws on the original instead)" : undefined} onClick={() => { setMode(k); setDrawing(false); }} data-testid={`mode-${k}`} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${mode === k ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-300 hover:border-blue-500 disabled:opacity-40"}`}>{l}</button>; })}</div>
                <div className="ml-auto flex flex-wrap gap-3 text-xs text-slate-300">{([["boxes", "Boxes"], ["labels", "Class"], ["confidence", "Confidence"], ["ids", "Track IDs"]] as [keyof OverlayOpts, string][]).map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} data-testid={`toggle-${k}`} />{l}</label>)}
                  {running && <label className="flex items-center gap-1 text-emerald-300"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />Follow live</label>}</div>
              </div>
              {media ? <OverlayPlayer ref={player} originalSrc={media.url} processedSrc={processedSrc} frames={frames} opts={opts} mode={mode} line={line} drawing={drawing} onLine={(l) => { setLine(l); setDrawing(false); }} onFrame={onFrame} fps={videoFps} />
                : <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-700 text-center text-sm text-slate-400"><p>Select a sample video or upload your own to begin.<br /><span className="text-xs text-slate-500">Nothing is shown until real detections exist for it.</span></p></div>}
              {engineUsed === "browser" && media && <p className="mt-2 text-[11px] text-slate-500">Browser engine: frames were sampled at {sampleFps}/s, so overlays update at that rate. Frame numbers count sampled frames.</p>}
            </section>)}
        </div>

        <div className="space-y-3">
          <StatsPanel rec={media?.kind === "image" ? null : shown} summary={summary} live={live} hasLine={!!line} />
          <ResultsCard status={status} summary={summary} job={job} engineUsed={engineUsed} frames={frames} processedSrc={processedSrc} media={media} imgRes={imgRes} api={api} />
        </div>
      </div>
    </DemoShell>
  );
}

function ResultsCard({ status, summary, job, engineUsed, frames, processedSrc, media, imgRes, api }: { status: Status; summary: Summary | null; job: JobInfo | null; engineUsed: Engine | null; frames: React.MutableRefObject<FrameRec[]>; processedSrc: string | null; media: Media | null; imgRes: ImageResult | null; api: ReturnType<typeof vehicleApi> | null }) {
  void api; const done = status === "completed" || status === "stopped"; const base = (media?.name ?? "vehicles").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 40);
  return (
    <section className={CARD} aria-label="Results" data-testid="results">
      <h3 className={H3}>Results</h3>
      {imgRes ? <><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400"><dt>Vehicles detected</dt><dd className="text-right text-slate-100" data-testid="img-count">{imgRes.vehicles_visible}</dd><dt>Inference time</dt><dd className="text-right text-slate-100">{imgRes.inference_ms} ms</dd><dt>Model</dt><dd className="text-right text-slate-100">{imgRes.model}</dd></dl>
        <button type="button" className={`${BTN} mt-3`} onClick={() => download(`${base}-detections.json`, JSON.stringify(imgRes, null, 2), "application/json")}>Download JSON</button></>
        : !done || !summary ? <p className="mt-2 text-sm text-slate-400">Results appear here after processing: duration, frames, measured speed and downloads.</p> : (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400" data-testid="summary">
              <dt>Engine</dt><dd className="text-right text-slate-100">{engineUsed === "server" ? `Server · ${job?.model ?? ""}` : "Browser · yolox_tiny"}</dd>
              <dt>Processing duration</dt><dd className="text-right text-slate-100" data-testid="sum-duration">{summary.processing_seconds.toFixed(1)} s</dd>
              <dt>Frames processed</dt><dd className="text-right text-slate-100" data-testid="sum-frames">{summary.frames_processed}</dd>
              <dt>Average speed (measured)</dt><dd className="text-right text-slate-100" data-testid="sum-fps">{summary.average_fps.toFixed(1)} frames/s</dd>
              <dt>Model time per frame</dt><dd className="text-right text-slate-100">{summary.inference_ms_per_frame.toFixed(0)} ms</dd>
              <dt>Unique tracks</dt><dd className="text-right text-slate-100">{summary.unique_tracks_observed}</dd>
              <dt>Detection instances</dt><dd className="text-right text-slate-100">{summary.detection_instances_processed.toLocaleString("en-US")}</dd>
              {summary.line_crossings && <><dt>Line crossings</dt><dd className="text-right text-slate-100">{summary.line_crossings.total}</dd></>}
            </dl>
            <p className="mt-2 text-[11px] text-slate-500">Speed is measured on this run, on {engineUsed === "server" ? "the server's CPU" : "your device"}. It is not a benchmark.</p>
            <table className="mt-2 w-full text-xs"><tbody>{VCLASSES.map((c) => <tr key={c} className="border-t border-slate-800"><th className="py-1 text-left font-medium text-slate-200"><span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: CLASS_COLOR[c] }} />{CLASS_LABEL[c]}</th><td className="text-right tabular-nums text-slate-300">{summary.unique_by_class[c]} tracks</td><td className="text-right tabular-nums text-slate-500">{summary.instances_by_class[c]} inst.</td></tr>)}</tbody></table>
            <div className="mt-3 flex flex-wrap gap-2">
              {processedSrc && <button type="button" className={`${BTN} !bg-blue-600 !text-white`} data-testid="download-video" onClick={async () => { try { const r = await fetch(processedSrc); if (!r.ok) throw new Error(); download(`${base}-processed.${processedSrc.includes("webm") ? "webm" : "mp4"}`, await r.blob(), r.headers.get("content-type") ?? "video/mp4"); } catch { window.alert("The processed video could not be downloaded. It may have expired; run the clip again."); } }}>Download processed video</button>}
              <button type="button" className={BTN} onClick={() => download(`${base}-detections.json`, JSON.stringify({ summary, frames: frames.current }, null, 2), "application/json")} data-testid="download-json">JSON</button>
              <button type="button" className={BTN} onClick={() => download(`${base}-detections.csv`, framesToCsv(frames.current), "text/csv")} data-testid="download-csv">CSV</button>
            </div>
            {engineUsed === "browser" && <p className="mt-2 text-[11px] text-slate-500">The browser engine does not render a video file; use the overlay view, or the server engine for a downloadable processed video.</p>}
          </>)}
    </section>
  );
}

function ImageViewer({ media, res, opts }: { media: Media; res: ImageResult | null; opts: OverlayOpts }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c) return; const img = new Image(); img.onload = () => {
      c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext("2d")!; g.drawImage(img, 0, 0); const k = Math.max(1, img.naturalWidth / 900);
      if (res && opts.boxes) for (const d of res.detections) { const col = CLASS_COLOR[d.class]; g.strokeStyle = col; g.lineWidth = 3 * k; g.strokeRect(d.bbox.x1, d.bbox.y1, d.bbox.x2 - d.bbox.x1, d.bbox.y2 - d.bbox.y1); const txt = [opts.labels ? d.class : "", opts.confidence ? d.confidence.toFixed(2) : ""].filter(Boolean).join(" "); if (txt) { g.font = `600 ${14 * k}px Georgia, serif`; const w = g.measureText(txt).width + 8 * k; g.fillStyle = col; g.fillRect(d.bbox.x1, d.bbox.y1 - 18 * k, w, 18 * k); g.fillStyle = "#0b1220"; g.fillText(txt, d.bbox.x1 + 4 * k, d.bbox.y1 - 5 * k); } }
    }; img.src = media.url;
  }, [media.url, res, opts]);
  return <section className={CARD} aria-label="Image detection"><h3 className={H3}>Detection viewer · single image</h3><canvas ref={cv} className="mt-2 max-h-[70vh] w-full rounded-lg bg-black object-contain" data-testid="image-canvas" /><p className="mt-2 text-[11px] text-slate-500">A single image has no tracking, so detections have no track IDs.</p></section>;
}
