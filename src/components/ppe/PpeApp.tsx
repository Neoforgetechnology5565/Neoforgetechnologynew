"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { PpeApiError, ppeApi, type Health, type JobInfo } from "@/lib/ppe/api";
import { PPE_COLOR, PPE_KINDS, PPE_LABEL, STATUS_COLOR, STATUS_LABEL, framesToCsv, isWorker, type FrameRec, type ImageResult, type PpeKind, type SampleInfo, type Summary, type Zone } from "@/lib/ppe/types";
import PpePlayer, { type OverlayOpts, type PlayerHandle, type PlayerMode } from "./PpePlayer";
import PpeStats from "./PpeStats";

const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500 hover:text-white disabled:opacity-40";
const GO = "rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40";
const STOP = "rounded-md border border-red-500/70 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-40";
const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,image/jpeg,image/png,image/webp,.mp4,.mov,.m4v,.webm,.mkv,.avi,.jpg,.jpeg,.png,.webp";
/** H.264 is missing from some browsers (e.g. open-source Chromium); the sample and the processed video are also provided as VP8 WebM. */
const canH264 = () => { try { return !!document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'); } catch { return true; } };
const IMG_EXT = /\.(jpe?g|png|webp)$/i;

type Status = "idle" | "uploading" | "queued" | "running" | "completed" | "stopped" | "failed";
interface Media { kind: "video" | "image"; name: string; url: string; file?: File; sampleId?: string; fps?: number }
const download = (name: string, body: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); };

export default function PpeApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? ppeApi(serviceUrl) : null), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">(serviceUrl ? "unknown" : "offline"); const [health, setHealth] = useState<Health | null>(null); const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [media, setMedia] = useState<Media | null>(null); const [conf, setConf] = useState(0.4); const [pconf, setPconf] = useState(0.4); const [stride, setStride] = useState(1); const [required, setRequired] = useState<PpeKind[]>(["hard_hat", "safety_vest"]);
  const [zone, setZone] = useState<Zone | null>(null); const [drawing, setDrawing] = useState(false);
  const [status, setStatus] = useState<Status>("idle"); const [error, setError] = useState(""); const [progress, setProgress] = useState({ done: 0, total: 0, fps: 0 });
  const [summary, setSummary] = useState<Summary | null>(null); const [job, setJob] = useState<JobInfo | null>(null); const [cur, setCur] = useState<FrameRec | null>(null);
  const [mode, setMode] = useState<PlayerMode>("overlay"); const [opts, setOpts] = useState<OverlayOpts>({ workers: true, ppe: true, ids: true, confidence: true, assessment: true }); const [follow, setFollow] = useState(true);
  const [imgRes, setImgRes] = useState<ImageResult | null>(null); const [source, setSource] = useState<"server" | "precomputed" | null>(null); const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const frames = useRef<FrameRec[]>([]); const [, bump] = useState(0); const jobId = useRef<string | null>(null); const player = useRef<PlayerHandle>(null); const lastFollow = useRef(0);
  const running = status === "uploading" || status === "queued" || status === "running";
  const current = media?.sampleId ? samples.find((s) => s.id === media.sampleId) : undefined;
  const useStatic = !!current?.results && service !== "online"; // the bundled sample falls back to the stored result of a real server run when no service is connected

  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); }, [api]);
  useEffect(() => { fetch("/ppe/samples/manifest.json").then((r) => r.json()).then((m) => setSamples(m.samples.map((s: Omit<SampleInfo, "url"> & { file: string; webm?: string }) => ({ ...s, url: `/ppe/samples/${!canH264() && s.webm ? s.webm : s.file}`, results: s.results ? `/ppe/samples/${s.results}` : undefined, processed: s.processed ? `/ppe/samples/${!canH264() && s.processed_webm ? s.processed_webm : s.processed}` : undefined })))).catch(() => undefined); }, []);
  useEffect(() => { const id = window.setInterval(() => { if (running) bump((n) => n + 1); }, 400); return () => window.clearInterval(id); }, [running]);

  const reset = useCallback(() => { frames.current = []; setCur(null); setSummary(null); setJob(null); setProcessedSrc(null); setImgRes(null); setError(""); setProgress({ done: 0, total: 0, fps: 0 }); setStatus("idle"); setMode("overlay"); setSource(null); jobId.current = null; }, []);
  const pickSample = async (s: SampleInfo) => {
    if (running) return; reset(); setZone(null); setDrawing(false); setMedia({ kind: "video", name: s.title, url: s.url, sampleId: s.id, fps: s.fps });
    try { const blob = await (await fetch(s.url)).blob(); const u = URL.createObjectURL(blob); setMedia((m) => (m && m.sampleId === s.id ? { ...m, url: u } : m)); } catch { /* keep streaming from the network URL */ }
  };
  const pickFile = (f: File | undefined) => {
    if (!f || running) return; reset(); setZone(null); setDrawing(false);
    const limit = (health?.limits.max_video_mb ?? 100) * 1_000_000; const isImg = IMG_EXT.test(f.name) || f.type.startsWith("image/");
    if (!isImg && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name) && !f.type.startsWith("video/")) { setError("Unsupported file type. Upload an MP4, MOV, WebM, MKV or AVI video, or a JPEG, PNG or WebP image."); return; }
    if (service === "online" && !isImg && f.size > limit) { setError(`The file is larger than the ${limit / 1_000_000} MB limit of the processing service.`); return; }
    setMedia({ kind: isImg ? "image" : "video", name: f.name, url: URL.createObjectURL(f), file: f });
  };
  const toggleRequired = (k: PpeKind) => setRequired((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]));
  const options = { conf, pconf, stride, required, zone };

  const fail = (e: unknown) => { setStatus("failed"); setError(e instanceof Error ? e.message : "Processing failed."); };
  const runStatic = async (s: SampleInfo) => {
    setSource("precomputed"); setStatus("running"); const r = await fetch(s.results!); if (!r.ok) throw new Error("The stored result could not be loaded.");
    const data = await r.json() as { summary: Summary; frames: FrameRec[] }; frames.current = data.frames; setProgress({ done: data.frames.length, total: data.frames.length, fps: 0 });
    setSummary(data.summary); setProcessedSrc(s.processed ?? null); setCur(frames.current[0] ?? null); setStatus("completed");
  };
  const runServer = async (m: Media) => {
    if (!api) throw new Error("The processing service is not configured on this site."); setSource("server");
    setStatus("uploading"); const j = await api.startVideo(m.sampleId ? { sampleId: m.sampleId } : { file: m.file }, options); jobId.current = j.job_id; setJob(j); setStatus("queued");
    let next = 0; const drain = async () => { for (;;) { const f = await api.frames(j.job_id, next); if (!f.frames.length) break; frames.current.push(...f.frames); next = f.next_start; } };
    for (;;) {
      const info = await api.job(j.job_id); setJob(info); if (info.status === "queued" || info.status === "running") setStatus(info.status);
      setProgress({ done: info.progress.frames_processed, total: info.progress.total_frames_estimate, fps: info.progress.live_fps }); await drain();
      if (follow && frames.current.length && Date.now() - lastFollow.current > 450) { lastFollow.current = Date.now(); player.current?.seek(frames.current[frames.current.length - 1].timestamp_seconds); }
      if (info.status === "failed") throw new Error(info.error_detail ? `${info.error} (${info.error_detail})` : info.error ?? "Processing failed.");
      if (info.status === "completed" || info.status === "cancelled") {
        await drain(); setSummary(info.summary); setStatus(info.status === "completed" ? "completed" : "stopped"); const v = canH264() ? info.outputs.video_mp4 ?? info.outputs.video_webm : info.outputs.video_webm ?? info.outputs.video_mp4; setProcessedSrc(v ? api.url(v) : null); setCur(frames.current[frames.current.length - 1] ?? null); return;
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  };
  const start = async () => {
    if (!media || running) return; const keep = zone; reset(); setZone(keep);
    try {
      if (media.kind === "image") { if (!api || service !== "online") throw new Error("Image analysis needs the processing service, which is not connected on this site. The bundled sample video shows a stored result of the same pipeline."); setSource("server"); setStatus("running"); setImgRes(await api.detectImage(media.file!, options)); setStatus("completed"); }
      else if (useStatic && current) await runStatic(current); else await runServer(media);
    } catch (e) { fail(e instanceof PpeApiError ? e : e); }
  };
  const stop = async () => { if (api && jobId.current) { try { await api.stop(jobId.current); } catch (e) { fail(e); } } };

  const live = running && status === "running";
  const shown = cur ?? (running && frames.current.length ? frames.current[frames.current.length - 1] : null);
  const statusText = { idle: "Ready", uploading: "Uploading…", queued: "Queued…", running: `Processing ${progress.total ? Math.round((100 * progress.done) / progress.total) : 0}%`, completed: "Completed", stopped: "Stopped (partial results)", failed: "Failed" }[status];
  const pct = progress.total ? Math.min(100, Math.round((100 * progress.done) / progress.total)) : status === "completed" ? 100 : 0;
  const onFrame = useCallback((rec: FrameRec | null) => setCur(rec), []);
  const videoFps = media?.fps ?? job?.video.fps ?? 25;
  const startLabel = useStatic ? "Load stored result" : "Start processing";

  return (
    <DemoShell branding={branding} app="Factory Workforce & PPE Monitoring" project={media ? media.name : "No media selected"} status={statusText} badge="Computer Vision · prototype" back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision"
      footer="Workers are detected by a pretrained YOLOX model (COCO “person”) and tracked by ByteTrack; hard hats and safety vests are detected by Intel’s worker_safety_mobilenet model on each worker. The result is an automated visual assessment, not a safety determination, and nothing here guarantees safety. Accuracy has not been benchmarked: items can be missed, mistaken or hidden, and “not detected” is not proof that PPE is absent. Track IDs are temporary labels; there is no face recognition and nobody is identified or matched across videos.">
      <div className="mx-auto grid max-w-[110rem] gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-3">
          <section className={CARD} aria-label="Media and processing controls">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="min-w-[14rem] flex-1"><h3 className={H3}>1 · Choose media</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {samples.map((s) => <button key={s.id} type="button" disabled={running} onClick={() => pickSample(s)} data-testid={`sample-${s.id}`} className={`rounded-lg border px-3 py-2 text-left text-xs ${media?.sampleId === s.id ? "border-amber-500 bg-amber-600/10 text-white" : "border-slate-700 text-slate-200 hover:border-amber-500"}`}><b className="block text-sm">{s.title}</b><span className="text-slate-400">{s.width}×{s.height} · {s.duration_seconds}s · sample</span></button>)}
                  <label className={`${BTN} flex cursor-pointer items-center`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}>Upload video or image…<input type="file" hidden accept={ACCEPT} data-testid="file-input" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} disabled={running} /></label>
                </div>
                {current && <div className="mt-2 text-[11px] leading-snug text-slate-500" data-testid="sample-credit"><p className="text-slate-300">{current.description}</p><p className="mt-1"><b className="text-slate-300">What the sample contains:</b> {current.scenarios}</p><p className="mt-1">{current.attribution} Licence: {current.license}. <a className="text-amber-400 hover:underline" href={current.source} target="_blank" rel="noreferrer">Source</a></p></div>}
              </div>
              <fieldset className="min-w-[16rem]"><legend className={H3}>2 · Processing</legend>
                <p className="mt-2 flex items-start gap-2 text-xs text-slate-200" data-testid="engine-state"><span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${service === "online" ? "bg-emerald-400" : "bg-slate-600"}`} /><span><b>Processing service</b> (FastAPI · ONNX Runtime · OpenCV DNN · ByteTrack){" "}<span className={service === "online" ? "text-emerald-300" : "text-slate-400"}>{service === "online" ? `online · ${health?.person_model} + ${health?.ppe_model}` : service === "unknown" ? "checking…" : serviceUrl ? "not reachable right now" : "not connected on this site"}</span></span></p>
                {service !== "online" && <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{current?.results ? "Without the service you can still open the stored result of a real run of this pipeline on the bundled sample. Uploads need the service." : "Uploads need the processing service."} See the deployment notes in the repository to run it.</p>}
              </fieldset>
              <div className="min-w-[15rem]"><h3 className={H3}>3 · Settings</h3>
                <label className="mt-2 block text-xs text-slate-300">Worker confidence <b className="tabular-nums text-white">{conf.toFixed(2)}</b><input type="range" className="block w-full" min={0.2} max={0.8} step={0.05} value={conf} disabled={running || useStatic} onChange={(e) => setConf(Number(e.target.value))} aria-label="Worker detection confidence" /></label>
                <label className="mt-2 block text-xs text-slate-300">PPE confidence <b className="tabular-nums text-white">{pconf.toFixed(2)}</b><input type="range" className="block w-full" min={0.3} max={0.8} step={0.05} value={pconf} disabled={running || useStatic} onChange={(e) => setPconf(Number(e.target.value))} aria-label="PPE detection confidence" /></label>
                <fieldset className="mt-2"><legend className="text-xs text-slate-300">Required PPE</legend><div className="mt-1 flex gap-3 text-xs text-slate-200">{PPE_KINDS.map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={required.includes(k)} disabled={running || useStatic} onChange={() => toggleRequired(k)} data-testid={`require-${k}`} />{PPE_LABEL[k]}</label>)}</div></fieldset>
                <label className="mt-2 block text-xs text-slate-300">Process every<select className="ml-2 rounded border border-slate-700 bg-slate-950 px-1 py-1" value={stride} disabled={running || useStatic} onChange={(e) => setStride(Number(e.target.value))} aria-label="Frame stride">{[1, 2, 3, 5].map((s) => <option key={s} value={s}>{s === 1 ? "frame (all)" : `${s}th frame`}</option>)}</select></label>
                <div className="mt-2 flex flex-wrap gap-1.5"><button type="button" className={`${BTN} ${drawing ? "!border-cyan-400 !text-cyan-200" : ""}`} aria-pressed={drawing} disabled={running || !media || media.kind !== "video" || mode !== "overlay" || useStatic} onClick={() => setDrawing(!drawing)} data-testid="draw-zone">{drawing ? "Click two corners…" : "Draw monitoring zone"}</button>{zone && <button type="button" className={BTN} disabled={running} onClick={() => { setZone(null); setDrawing(false); }}>Clear zone</button>}</div>
                {useStatic && <p className="mt-1 text-[11px] text-slate-500">Settings are fixed for the stored result (defaults, both items required, no zone).</p>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={GO} disabled={!media || running || required.length === 0} onClick={start} data-testid="start">{startLabel}</button>
              <button type="button" className={STOP} disabled={!running || !job} onClick={stop} data-testid="stop">Stop processing</button>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === "failed" ? "bg-red-900/60 text-red-200" : status === "completed" ? "bg-emerald-900/60 text-emerald-200" : running ? "bg-amber-900/60 text-amber-200" : "bg-slate-800 text-slate-300"}`} role="status" data-testid="status">{statusText}</span>
              {(running || status === "completed" || status === "stopped") && media?.kind === "video" && <div className="min-w-[10rem] flex-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-2 rounded bg-slate-800"><div className="h-full rounded bg-amber-500 transition-all" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[11px] text-slate-400" data-testid="progress-text">{progress.done} / {progress.total || "?"} frames{progress.fps ? ` · ${progress.fps.toFixed(1)} frames/s` : ""}</p></div>}
            </div>
            {required.length === 0 && <p className="mt-2 text-xs text-amber-300">Select at least one required PPE item.</p>}
            {error && <p role="alert" data-testid="error" className="mt-3 rounded-md border border-red-500/50 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</p>}
          </section>

          {media?.kind === "image" ? <ImageViewer media={media} res={imgRes} opts={opts} /> : (
            <section className={CARD} aria-label="Detection viewer">
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <h3 className={H3}>Monitoring viewer</h3>
                <div role="tablist" aria-label="View" className="flex gap-1">{([["overlay", "Original + overlay"], ["processed", "Annotated video"], ["side", "Side by side"]] as [PlayerMode, string][]).map(([k, l]) => { const off = (k === "processed" && !processedSrc) || !media; return <button key={k} role="tab" type="button" aria-selected={mode === k} disabled={off} title={k === "processed" && !processedSrc ? "Available after a run on the server" : undefined} onClick={() => { setMode(k); setDrawing(false); }} data-testid={`mode-${k}`} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${mode === k ? "bg-amber-600 text-white" : "border border-slate-700 text-slate-300 hover:border-amber-500 disabled:opacity-40"}`}>{l}</button>; })}</div>
                <div className="ml-auto flex flex-wrap gap-3 text-xs text-slate-300">{([["workers", "Worker boxes"], ["ppe", "PPE boxes"], ["ids", "Track IDs"], ["confidence", "Confidence"], ["assessment", "Assessment"]] as [keyof OverlayOpts, string][]).map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} data-testid={`toggle-${k}`} />{l}</label>)}
                  {running && <label className="flex items-center gap-1 text-emerald-300"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />Follow live</label>}</div>
              </div>
              {media ? <PpePlayer ref={player} originalSrc={media.url} processedSrc={processedSrc} frames={frames} opts={opts} mode={mode} zone={zone} drawing={drawing} onZone={(z) => { setZone(z); setDrawing(false); }} onFrame={onFrame} fps={videoFps} />
                : <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-700 text-center text-sm text-slate-400"><p>Select the sample video or upload your own to begin.<br /><span className="text-xs text-slate-500">Nothing is drawn until real detections exist for it.</span></p></div>}
              <Legend />
            </section>)}
        </div>

        <div className="space-y-3">
          <PpeStats rec={media?.kind === "image" ? null : shown} summary={summary} live={live} hasZone={!!zone} required={summary?.required_ppe ?? required} />
          <ResultsCard status={status} summary={summary} job={job} source={source} frames={frames} processedSrc={processedSrc} media={media} imgRes={imgRes} />
        </div>
      </div>
    </DemoShell>
  );
}

function Legend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400" aria-label="Legend" data-testid="legend">
      {(["compliant", "potential_violation", "uncertain"] as const).map((s) => <li key={s} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm border-2" style={{ borderColor: STATUS_COLOR[s], borderStyle: s === "uncertain" ? "dashed" : "solid" }} />Worker · {STATUS_LABEL[s]}</li>)}
      {PPE_KINDS.map((k) => <li key={k} className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-sm" style={{ background: PPE_COLOR[k] }} />{PPE_LABEL[k]} detected</li>)}
    </ul>
  );
}

function ResultsCard({ status, summary, job, source, frames, processedSrc, media, imgRes }: { status: Status; summary: Summary | null; job: JobInfo | null; source: "server" | "precomputed" | null; frames: React.MutableRefObject<FrameRec[]>; processedSrc: string | null; media: Media | null; imgRes: ImageResult | null }) {
  const done = status === "completed" || status === "stopped"; const base = (media?.name ?? "workers").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 40);
  return (
    <section className={CARD} aria-label="Results" data-testid="results">
      <h3 className={H3}>Results</h3>
      {imgRes ? <><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400"><dt>Workers detected</dt><dd className="text-right text-slate-100" data-testid="img-count">{imgRes.workers_visible}</dd><dt>Potential violations</dt><dd className="text-right text-slate-100">{imgRes.potential_ppe_violations}</dd><dt>Uncertain</dt><dd className="text-right text-slate-100">{imgRes.uncertain_classifications}</dd><dt>Inference time</dt><dd className="text-right text-slate-100">{imgRes.inference_ms} ms</dd></dl>
        <button type="button" className={`${BTN} mt-3`} onClick={() => download(`${base}-detections.json`, JSON.stringify(imgRes, null, 2), "application/json")}>Download JSON</button></>
        : !done || !summary ? <p className="mt-2 text-sm text-slate-400">Results appear here after processing: duration, frames, measured speed and downloads.</p> : (
          <>
            {source === "precomputed" && <p className="mt-2 rounded border border-amber-500/40 bg-amber-900/20 p-2 text-[11px] leading-snug text-amber-100" data-testid="precomputed-note">Stored result: this is the output of a real run of the service on this sample ({summary.processing_seconds.toFixed(0)} s on a CPU), saved with the site. It was not computed in your browser just now.</p>}
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400" data-testid="summary">
              <dt>Source</dt><dd className="text-right text-slate-100">{source === "server" ? `Server · ${job?.person_model ?? ""} + ${job?.ppe_model ?? ""}` : "Stored server run"}</dd>
              <dt>Processing duration</dt><dd className="text-right text-slate-100" data-testid="sum-duration">{summary.processing_seconds.toFixed(1)} s</dd>
              <dt>Frames processed</dt><dd className="text-right text-slate-100" data-testid="sum-frames">{summary.frames_processed}</dd>
              <dt>Average speed (measured)</dt><dd className="text-right text-slate-100" data-testid="sum-fps">{summary.average_fps.toFixed(1)} frames/s</dd>
              <dt>Worker detection / frame</dt><dd className="text-right text-slate-100">{summary.person_detection_ms_per_frame.toFixed(0)} ms</dd>
              <dt>PPE detection / frame</dt><dd className="text-right text-slate-100">{summary.ppe_detection_ms_per_frame.toFixed(0)} ms</dd>
              <dt>Unique worker tracks</dt><dd className="text-right text-slate-100">{summary.unique_worker_tracks}</dd>
              <dt>Tracks flagged at some point</dt><dd className="text-right text-slate-100">{summary.unique_tracks_with_potential_violation}</dd>
              <dt>Detection instances</dt><dd className="text-right text-slate-100">{summary.detection_instances_processed.toLocaleString("en-US")}</dd>
            </dl>
            <p className="mt-2 text-[11px] text-slate-500">Speed is measured on that run, on a CPU. It is not a benchmark. Worker-frame assessments: {summary.worker_frame_assessments.compliant} compliant, {summary.worker_frame_assessments.potential_violation} potential violation, {summary.worker_frame_assessments.uncertain} uncertain.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {processedSrc && <button type="button" className={`${BTN} !bg-amber-600 !text-white`} data-testid="download-video" onClick={async () => { try { const r = await fetch(processedSrc); if (!r.ok) throw new Error(); download(`${base}-annotated.${processedSrc.includes("webm") ? "webm" : "mp4"}`, await r.blob(), r.headers.get("content-type") ?? "video/mp4"); } catch { window.alert("The annotated video could not be downloaded. It may have expired; run the clip again."); } }}>Download annotated video</button>}
              <button type="button" className={BTN} onClick={() => download(`${base}-detections.json`, JSON.stringify({ summary, frames: frames.current }, null, 2), "application/json")} data-testid="download-json">JSON</button>
              <button type="button" className={BTN} onClick={() => download(`${base}-detections.csv`, framesToCsv(frames.current), "text/csv")} data-testid="download-csv">CSV</button>
            </div>
          </>)}
    </section>
  );
}

function ImageViewer({ media, res, opts }: { media: Media; res: ImageResult | null; opts: OverlayOpts }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c) return; const img = new Image(); img.onload = () => {
      c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext("2d")!; g.drawImage(img, 0, 0); const k = Math.max(1, img.naturalWidth / 900);
      if (res) for (const d of res.detections) {
        const worker = isWorker(d); if (worker ? !opts.workers : !opts.ppe) continue; const col = worker ? STATUS_COLOR[d.ppe_assessment.status] : PPE_COLOR[d.class];
        g.strokeStyle = col; g.lineWidth = (worker ? 3 : 2) * k; g.setLineDash(worker && d.ppe_assessment.status === "uncertain" ? [8 * k, 5 * k] : []); g.strokeRect(d.bbox.x1, d.bbox.y1, d.bbox.x2 - d.bbox.x1, d.bbox.y2 - d.bbox.y1); g.setLineDash([]);
        const txt = worker ? [opts.assessment ? STATUS_LABEL[d.ppe_assessment.status] : "", opts.confidence ? d.confidence.toFixed(2) : ""].filter(Boolean).join(" ") : [PPE_LABEL[d.class].toLowerCase(), opts.confidence ? d.confidence.toFixed(2) : ""].filter(Boolean).join(" ");
        if (txt) { g.font = `600 ${14 * k}px Georgia, serif`; const w = g.measureText(txt).width + 8 * k; const ty = worker ? d.bbox.y1 : d.bbox.y1 + (d.bbox.y2 - d.bbox.y1) / 2; g.fillStyle = col; g.fillRect(d.bbox.x1, ty - 18 * k, w, 18 * k); g.fillStyle = "#0b1220"; g.fillText(txt, d.bbox.x1 + 4 * k, ty - 5 * k); }
      }
    }; img.src = media.url;
  }, [media.url, res, opts]);
  return <section className={CARD} aria-label="Image analysis"><h3 className={H3}>Monitoring viewer · single image</h3><canvas ref={cv} className="mt-2 max-h-[70vh] w-full rounded-lg bg-black object-contain" data-testid="image-canvas" /><p className="mt-2 text-[11px] text-slate-500">A single image has no tracking, so workers have no track IDs and PPE is judged from this one view without smoothing over time.</p><Legend /></section>;
}
