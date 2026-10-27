"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CV_DISCLAIMER } from "@/lib/cv-demos";
import { DEFAULT_SETTINGS, LIMITS, SUPPORTED_CLASSES, type Pt, type Settings } from "@/lib/cctv/types";
import type { Branding } from "@/lib/types";
import DemoShell from "../DemoShell";
import { BTN, CARD, H3, LBL, PRIMARY } from "../ui";
import { api, ApiError, type Caps, type JobInfo, type Results, type SampleInfo } from "./api";
import { HumanCenterNet, type Detector } from "./detector";
import { runBrowserInference } from "./inference";
import { drawOverlay, frameAt, type OverlayState } from "./overlay";
import { AnalyticsPanel, Chip, DetectionsPanel, EventsPanel, SettingsPanel, mmss } from "./panels";

type Src = { kind: "sample" | "upload"; id: string; name: string; url: string; durationSec: number; width: number; height: number; file?: File };
type Tool = null | "zone" | "line";
type Tab = "detections" | "events" | "analytics" | "settings";
type Phase = "idle" | "loading" | "running" | "ready";
const STORE = "neoforge-cctv-v1";
const SEV_COLOR: Record<string, string> = { info: "#94a3b8", notice: "#22d3ee", review: "#f59e0b" };
const uid = () => Math.random().toString(36).slice(2, 8);

function loadSettings(): Settings {
  try { const j = JSON.parse(localStorage.getItem(STORE) || "null"); if (j && typeof j.minConf === "number") return { ...DEFAULT_SETTINGS, ...j }; } catch { /* private mode or corrupt */ }
  return DEFAULT_SETTINGS;
}
const probe = (url: string) => new Promise<{ durationSec: number; width: number; height: number }>((res, rej) => {
  const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
  v.onloadedmetadata = () => (isFinite(v.duration) && v.videoWidth ? res({ durationSec: v.duration, width: v.videoWidth, height: v.videoHeight }) : rej(new Error("no metadata")));
  v.onerror = () => rej(new Error("decode error")); v.src = url;
});
/** Prefer H.264 MP4, fall back to the WebM twin for browsers that cannot decode H.264. */
const playable = (s: SampleInfo) => { const v = document.createElement("video"); return v.canPlayType('video/mp4; codecs="avc1.42E01E"') ? s.file : s.webm; };
const dist = (a: Pt, b: Pt, W: number, H: number) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);

export default function CctvPlatform({ branding }: { branding: Branding }) {
  const [caps, setCaps] = useState<Caps | null>(null);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [src, setSrc] = useState<Src | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [job, setJob] = useState<{ id: string; token: string } | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; ms: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState("");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>("detections");
  const [tool, setTool] = useState<Tool>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [selTid, setSelTid] = useState<number | null>(null);
  const [selEvent, setSelEvent] = useState<string | null>(null);
  const [trails, setTrails] = useState(true);
  const [showRules, setShowRules] = useState(true);
  const [runMode, setRunMode] = useState<"browser" | "worker">("browser");
  const [rate, setRate] = useState(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const detectorRef = useRef<Detector | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ kind: "zone" | "line"; id: string; idx: number } | null>(null);
  const live = useRef<OverlayState & { fps: number }>({ frame: null, tracks: [], t: 0, settings: DEFAULT_SETTINGS, selectedTid: null, trails: true, zones: true, draft: null, fps: 4 });
  const jobRef = useRef(job); jobRef.current = job;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const resultsRef = useRef(results); resultsRef.current = results;

  useEffect(() => { setSettings(loadSettings()); api.caps().then(setCaps).catch((e) => setError(e.message)); api.samples().then((r) => setSamples(r.samples)).catch((e) => setError(e.message)); }, []);
  useEffect(() => () => { cancelRef.current = true; detectorRef.current?.dispose(); }, []);

  const persist = (s: Settings) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage unavailable */ } };
  const fps = results?.job.settings.sampleFps ?? (results?.job.mode === "reference" ? 4 : settings.sampleFps);
  const frame = useMemo(() => (results ? frameAt(results.frames, time, fps) : null), [results, time, fps]);

  // Overlay state is mirrored into a ref so the draw loop never causes React re-renders.
  live.current = { ...live.current, frame, tracks: results?.tracks ?? [], t: time, settings, selectedTid: selTid, trails, zones: showRules, draft: tool ? { kind: tool, pts: draft, hover } : null, fps };

  // ---- canvas sizing + draw loop + playhead sync
  useEffect(() => {
    const wrap = wrapRef.current, cv = canvasRef.current, v = videoRef.current; if (!wrap || !cv || !v) return;
    const size = () => { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(wrap.clientWidth * d); cv.height = Math.round(wrap.clientHeight * d); };
    size(); const ro = new ResizeObserver(size); ro.observe(wrap);
    let raf = 0, last = 0;
    const loop = () => {
      const ctx = cv.getContext("2d");
      const t = v.currentTime, r = resultsRef.current;
      if (ctx) drawOverlay(ctx, cv.width, cv.height, { ...live.current, t, frame: r ? frameAt(r.frames, t, live.current.fps) : null });
      if (!v.paused && performance.now() - last > 120) { last = performance.now(); setTime(t); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const sync = () => { setTime(v.currentTime); setPlaying(!v.paused); };
    for (const ev of ["seeked", "pause", "play", "ended", "loadedmetadata"]) v.addEventListener(ev, sync);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); for (const ev of ["seeked", "pause", "play", "ended", "loadedmetadata"]) v.removeEventListener(ev, sync); };
  }, [src]);

  const seek = useCallback((t: number) => { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(v.duration || t, t)); setTime(v.currentTime); }, []);
  const toggle = () => { const v = videoRef.current; if (!v) return; if (v.paused) void v.play(); else v.pause(); };
  const stepFrame = (dir: 1 | -1) => {
    const v = videoRef.current; if (!v) return; v.pause();
    const fs = resultsRef.current?.frames; const eps = 1e-3;
    if (fs?.length) { const next = dir > 0 ? fs.find((f) => f.t > v.currentTime + eps) : [...fs].reverse().find((f) => f.t < v.currentTime - eps); if (next) { seek(next.t); return; } }
    seek(v.currentTime + dir / fps);
  };

  // ---- settings (persisted; re-analysis is debounced and uses stored detections, no new inference)
  const reanalyse = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const j = jobRef.current; if (!j) return;
      const { sampleFps: _s, ...patch } = settingsRef.current; void _s;
      setBusy(true);
      try { setResults(await api.analyze(j.id, j.token, patch)); setError(""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }, 350);
  }, []);
  const update = useCallback((p: Partial<Settings>) => {
    const n = { ...settingsRef.current, ...p }; settingsRef.current = n; setSettings(n); persist(n); reanalyse();
  }, [reanalyse]);
  const resetSettings = () => { try { localStorage.removeItem(STORE); } catch { /* ignore */ } update({ ...DEFAULT_SETTINGS }); };

  // ---- jobs
  const finish = async (j: { id: string; token: string }, info?: JobInfo) => { const r = await api.results(j.id); setResults(r); setPhase("ready"); setStatus(""); setProgress(null); if (info) setBackend(info.detector.runtime); setTab("events"); seek(0); };
  const reset = async () => {
    cancelRef.current = true; if (timer.current) clearTimeout(timer.current);
    if (job) api.del(job.id, job.token).catch(() => undefined);
    setJob(null); setResults(null); setPhase("idle"); setProgress(null); setStatus(""); setError(""); setSelEvent(null); setSelTid(null); setTool(null); setDraft([]); seek(0);
  };
  const guard = async (fn: () => Promise<void>) => { try { setError(""); await fn(); } catch (e) { setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong"); setPhase((p) => (p === "ready" ? p : "idle")); setProgress(null); setStatus(""); } };

  const chooseSample = (s: SampleInfo) => guard(async () => {
    await reset(); cancelRef.current = false; setPhase("loading"); setStatus("Loading reference analysis…");
    const ann = (await (await fetch(s.annotations)).json()) as { suggested?: { zones?: Settings["zones"]; lines?: Settings["lines"] } };
    const next = { ...settingsRef.current, zones: ann.suggested?.zones ?? [], lines: ann.suggested?.lines ?? [] }; settingsRef.current = next; setSettings(next); persist(next);
    setSrc({ kind: "sample", id: s.id, name: s.name, url: playable(s), durationSec: s.durationSec, width: s.width, height: s.height });
    const created = await api.createJob({ source: { type: "sample", id: s.id }, mode: "reference", meta: { durationSec: s.durationSec, width: s.width, height: s.height }, settings: next });
    const j = { id: created.id, token: created.token }; setJob(j); await finish(j, created);
  });

  const onFile = (file: File | undefined) => guard(async () => {
    if (!file) return;
    const okType = /\.(mp4|webm)$/i.test(file.name) || /^video\/(mp4|webm)$/.test(file.type);
    if (!okType) throw new Error("Please choose an MP4 or WebM video.");
    if (file.size > LIMITS.maxUploadMb * 1024 * 1024) throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${LIMITS.maxUploadMb} MB.`);
    await reset(); cancelRef.current = false;
    const url = URL.createObjectURL(file);
    let meta; try { meta = await probe(url); } catch { URL.revokeObjectURL(url); throw new Error("This browser cannot read that video. Try an H.264 MP4 or a WebM."); }
    if (meta.durationSec > 180) { URL.revokeObjectURL(url); throw new Error(`The clip is ${Math.round(meta.durationSec)} s long. The demo limit is 180 s.`); }
    setSrc({ kind: "upload", id: "upload", name: file.name.slice(0, 60), url, file, ...meta });
  });

  const runInference = (mode: "browser" | "worker") => guard(async () => {
    if (!src || !caps) return;
    cancelRef.current = false; setPhase("running"); setResults(null); setSelEvent(null);
    const meta = { durationSec: src.durationSec, width: src.width, height: src.height };
    let videoId: string | undefined;
    if (mode === "worker") { if (!src.file) throw new Error("The server worker needs an uploaded file."); setStatus("Uploading and validating on the server…"); videoId = (await api.upload(src.file)).videoId; }
    const created = await api.createJob({ source: src.kind === "sample" ? { type: "sample", id: src.id } : { type: "upload", videoId, name: src.name }, mode, meta, settings: settingsRef.current });
    const j = { id: created.id, token: created.token }; setJob(j);
    if (mode === "worker") {
      await api.process(j.id, j.token); setStatus("Server worker decoding and detecting…");
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500)); if (cancelRef.current) return;
        const info = await api.job(j.id); setProgress({ done: info.framesReceived, total: info.expectedFrames, ms: 0 });
        if (info.status === "failed") throw new Error(info.error || "The server worker failed.");
        if (info.status === "ready") { await finish(j, info); return; }
      }
    }
    setStatus("Loading the detection model (first run downloads about 3 MB of weights plus the TensorFlow.js runtime)…");
    const det = detectorRef.current ?? new HumanCenterNet();
    detectorRef.current = det; const { backend: be } = await det.load(); setBackend(`${be.toUpperCase()} backend`);
    setStatus("Detecting objects frame by frame…");
    let posted = 0;
    const completed = await runBrowserInference({ detector: det, url: src.url, durationSec: src.durationSec, fps: settingsRef.current.sampleFps, maxFrames: created.expectedFrames,
      onProgress: (done, total, ms) => setProgress({ done, total, ms }), cancelled: () => cancelRef.current,
      post: async (fr) => { await api.frames(j.id, j.token, fr); posted += fr.length; } });
    if (posted === 0) { setPhase("idle"); setStatus(""); setProgress(null); return; }
    await api.finalize(j.id, j.token, true);
    await finish(j, created);
    if (!completed) setError(`Stopped early: analysed ${posted} of ${created.expectedFrames} sampled frames. Results below are partial.`);
  });

  // ---- events review
  const review = async (e: Results["events"][number], rv: string, note?: string) => {
    const j = jobRef.current; if (!j) return;
    setResults((r) => r && { ...r, events: r.events.map((x) => (x.id === e.id ? { ...x, review: rv as typeof x.review, note: note ?? x.note } : x)) });
    try { await api.review(j.id, j.token, e.id, rv, note); } catch (er) { setError((er as Error).message); }
  };

  // ---- zone / line drawing + vertex dragging on the overlay canvas
  const toPt = (ev: React.PointerEvent): Pt => { const r = canvasRef.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) }; };
  const finishDraft = useCallback((pts: Pt[]) => {
    const s = settingsRef.current;
    if (tool === "zone" && pts.length >= 3) update({ zones: [...s.zones, { id: uid(), name: `Zone ${s.zones.length + 1}`, points: pts, classes: [], dwellSeconds: 4 }] });
    if (tool === "line" && pts.length >= 2) update({ lines: [...s.lines, { id: uid(), name: `Line ${s.lines.length + 1}`, a: pts[0], b: pts[1], classes: [] }] });
    setTool(null); setDraft([]); setHover(null);
  }, [tool, update]);
  useEffect(() => {
    if (!tool) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setTool(null); setDraft([]); } if (e.key === "Enter") finishDraft(draft); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [tool, draft, finishDraft]);
  const onDown = (ev: React.PointerEvent) => {
    const p = toPt(ev), r = canvasRef.current!.getBoundingClientRect();
    if (tool) { const next = [...draft, p]; if (tool === "line" && next.length === 2) finishDraft(next); else setDraft(next); return; }
    const s = settingsRef.current;
    for (const z of s.zones) { const i = z.points.findIndex((q) => dist(q, p, r.width, r.height) < 12); if (i >= 0) { drag.current = { kind: "zone", id: z.id, idx: i }; canvasRef.current!.setPointerCapture(ev.pointerId); return; } }
    for (const l of s.lines) for (const [i, q] of [l.a, l.b].entries()) if (dist(q, p, r.width, r.height) < 12) { drag.current = { kind: "line", id: l.id, idx: i }; canvasRef.current!.setPointerCapture(ev.pointerId); return; }
  };
  const onMove = (ev: React.PointerEvent) => {
    const p = toPt(ev);
    if (tool) { setHover(p); return; }
    const d = drag.current; if (!d) return; const s = settingsRef.current;
    if (d.kind === "zone") update({ zones: s.zones.map((z) => (z.id === d.id ? { ...z, points: z.points.map((q, i) => (i === d.idx ? p : q)) } : z)) });
    else update({ lines: s.lines.map((l) => (l.id === d.id ? { ...l, [d.idx ? "b" : "a"]: p } : l)) });
  };

  // ---- derived
  const mode = results?.job.mode ?? null;
  const banner = !results ? { tone: "slate", text: src ? "No analysis yet. Run the AI detector on this clip, or open a sample." : "Choose a sample or upload a clip to begin." }
    : mode === "reference" ? { tone: "amber", text: "REFERENCE ANNOTATIONS: the boxes are the ground truth drawn with this synthetic clip. No AI inference ran. Tracking, zones, lines and events below are computed for real from them." }
    : mode === "browser" ? { tone: "emerald", text: `REAL AI INFERENCE in your browser: ${results.job.detector.name} (${backend || "TensorFlow.js"}). Offline frame sampling, not real-time.` }
    : { tone: "emerald", text: `REAL AI INFERENCE on the server worker: ${results.job.detector.name}, TensorFlow.js WASM on CPU. Not GPU, not real-time.` };
  const toneCls: Record<string, string> = { slate: "border-slate-700 bg-slate-900 text-slate-300", amber: "border-amber-500/40 bg-amber-500/10 text-amber-200", emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" };
  const dur = src?.durationSec ?? 0;
  const link = (fmt: string) => (job ? `/api/cctv/jobs/${job.id}/export?format=${fmt}` : undefined);
  const aspect = src ? `${src.width} / ${src.height}` : "16 / 9";
  const running = phase === "running" || phase === "loading";

  return (
    <DemoShell branding={branding} app="AI CCTV Intelligence & Security Analytics" project={src ? src.name : "No source selected"} status={phase === "ready" ? (mode === "reference" ? "Reference annotations" : "AI inference complete") : running ? "Working…" : "Ready"}
      back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All demos" }} contact="/contact?division=computer-vision" badge="Computer vision demo"
      footer={`${CV_DISCLAIMER} Use only fictional, licensed or authorised footage. No face recognition or identity matching. Weapon detection is not supported.`}
      actions={<>{link("csv") ? <a href={link("csv")} className={BTN} download>Export CSV</a> : <button className={BTN} disabled>Export CSV</button>}{link("json") ? <a href={link("json")} className={BTN} download>Export JSON</a> : <button className={BTN} disabled>Export JSON</button>}<button type="button" className={BTN} onClick={reset}>Reset</button></>}>
      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[250px_minmax(0,1fr)_360px]">
        {/* Sources */}
        <aside className={`space-y-3 ${src ? "order-2 lg:order-none" : ""}`} aria-label="Video sources">
          <div className={CARD}>
            <h2 className={H3}>Sources</h2>
            <ul className="mt-2 space-y-2">
              {samples.map((s) => (
                <li key={s.id}><button type="button" onClick={() => chooseSample(s)} disabled={running} className={`w-full rounded-lg border p-2.5 text-left text-xs ${src?.id === s.id ? "border-blue-500 bg-slate-800" : "border-slate-700 hover:border-slate-500"}`}>
                  <span className="block font-medium text-slate-100">{s.name}</span><span className="mt-0.5 block text-[10px] text-slate-400">Sample file · {s.durationSec}s · reference annotations</span></button></li>
              ))}
              <li>
                <label className={`block cursor-pointer rounded-lg border border-dashed p-2.5 text-xs ${src?.kind === "upload" ? "border-blue-500 bg-slate-800" : "border-slate-600 hover:border-slate-400"}`}>
                  <span className="block font-medium text-slate-100">{src?.kind === "upload" ? src.name : "Upload a video file"}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">MP4 or WebM · max {LIMITS.maxUploadMb} MB · 180 s · fictional or authorised footage only</span>
                  <input type="file" accept="video/mp4,video/webm,.mp4,.webm" className="sr-only" data-testid="file-input" disabled={running} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </li>
              <li className="rounded-lg border border-slate-800 p-2.5 text-xs opacity-70"><span className="block font-medium text-slate-300">RTSP / IP camera</span><span className="mt-0.5 block text-[10px] text-slate-500">Not connected. {caps?.rtsp.reason ?? "Live camera ingest is not implemented."}</span></li>
              <li className="rounded-lg border border-slate-800 p-2.5 text-xs opacity-70"><span className="block font-medium text-slate-300">Webcam / live stream</span><span className="mt-0.5 block text-[10px] text-slate-500">Not implemented. This demo analyses recorded clips only.</span></li>
            </ul>
          </div>
          {src && (
            <div className={CARD}>
              <h2 className={H3}>Run detection</h2>
              {src.kind === "upload" || (src.kind === "sample" && mode === "reference") ? (
                <>
                  {caps?.workerInference && src.kind === "upload" && <div className="mt-2 flex gap-1">{(["browser", "worker"] as const).map((m) => <Chip key={m} on={runMode === m} onClick={() => setRunMode(m)}>{m === "browser" ? "In my browser" : "Server worker"}</Chip>)}</div>}
                  <p className="mt-2 text-[11px] leading-snug text-slate-400">{runMode === "worker" && src.kind === "upload" && caps?.workerInference ? "The file is uploaded, validated and processed by the Node worker (ffmpeg + CenterNet on WASM/CPU). It is deleted within 60 minutes." : "Your file stays on this device. Frames are analysed in the browser; only box coordinates are sent to the API."}</p>
                  {src.kind === "sample" && <p className="mt-1 text-[11px] text-amber-300/90">Sample clips are drawn shapes, so a real detector will usually find nothing. That is expected. Upload real footage you are allowed to use to see real detections.</p>}
                  <button type="button" className={`${PRIMARY} mt-3 w-full`} disabled={running} data-testid="run-ai" onClick={() => runInference(src.kind === "upload" ? runMode : "browser")}>{results && mode !== "reference" ? "Run again" : "Run AI detection"}</button>
                </>
              ) : <button type="button" className={`${PRIMARY} mt-3 w-full`} disabled={running} onClick={() => runInference(runMode)}>Run AI detection</button>}
              {running && <button type="button" className={`${BTN} mt-2 w-full`} onClick={() => { cancelRef.current = true; }}>Stop</button>}
            </div>
          )}
          <div className={`${CARD} text-[11px] leading-snug text-slate-400`}>
            <h2 className={H3}>Honest status</h2>
            <ul className="mt-2 space-y-1"><li>Detector: {caps?.detector.name ?? "…"}</li><li>Speed: offline, a few frames per second on CPU. Not real-time.</li><li>GPU on server: no</li><li>Live cameras: no</li><li>Weapon detection: no</li><li>Face recognition: never</li></ul>
          </div>
        </aside>

        {/* Video workspace */}
        <section className={`min-w-0 space-y-3 ${src ? "order-1 lg:order-none" : ""}`} aria-label="Video workspace">
          <div className={`rounded-lg border px-3 py-2 text-xs ${toneCls[banner.tone]}`} role="status" data-testid="mode-banner">{banner.text}</div>
          {error && <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert"><span className="flex-1">{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="text-red-300">✕</button></div>}
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-black">
            <div ref={wrapRef} className="relative mx-auto max-h-[70vh] w-full bg-black" style={{ aspectRatio: aspect }}>
              {src ? <video key={src.url} ref={videoRef} src={src.url} playsInline muted preload="auto" className="absolute inset-0 h-full w-full" data-testid="video" /> :
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">Open a sample clip or upload a video to start.</div>}
              <canvas ref={canvasRef} data-testid="overlay" className={`absolute inset-0 h-full w-full ${tool ? "cursor-crosshair" : ""}`} style={{ touchAction: tool || drag.current ? "none" : "auto" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onDoubleClick={() => tool === "zone" && finishDraft(draft.slice(0, -1))} />
              {running && <div className="absolute inset-x-0 bottom-0 bg-slate-950/85 p-3 text-xs text-slate-200" role="status"><p>{status}</p>{progress && <><div className="mt-2 h-1.5 rounded bg-slate-700"><div className="h-full rounded bg-blue-500" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">{progress.done} / {progress.total} frames{progress.ms ? ` · ${(progress.ms / 1000).toFixed(2)} s per frame` : ""}</p></>}</div>}
            </div>
            {/* transport */}
            <div className="space-y-2 border-t border-slate-800 bg-slate-900 p-2.5">
              <div className="relative" aria-label="Event timeline">
                <input type="range" min={0} max={Math.max(0.01, dur)} step={0.01} value={Math.min(time, dur)} disabled={!src} onChange={(e) => seek(+e.target.value)} className="relative z-10 w-full" aria-label="Seek" data-testid="seek" />
                <div className="pointer-events-none absolute inset-x-0 -bottom-1.5 h-2" aria-hidden>{results?.events.filter((e) => e.type !== "object_first_seen").map((e) => <span key={e.id} className="absolute top-0 h-2 w-1 rounded-sm" style={{ left: `${(e.t / Math.max(0.01, dur)) * 100}%`, background: SEV_COLOR[e.severity] }} />)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" className={PRIMARY} disabled={!src} onClick={toggle} data-testid="play">{playing ? "Pause" : "Play"}</button>
                <button type="button" className={BTN} disabled={!src} onClick={() => stepFrame(-1)} aria-label="Previous analysed frame">⏮ Frame</button>
                <button type="button" className={BTN} disabled={!src} onClick={() => stepFrame(1)} aria-label="Next analysed frame" data-testid="next-frame">Frame ⏭</button>
                <button type="button" className={BTN} disabled={!src} onClick={() => seek(time - 1)}>−1s</button><button type="button" className={BTN} disabled={!src} onClick={() => seek(time + 1)}>+1s</button>
                <select aria-label="Playback speed" className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-xs" value={rate} onChange={(e) => { setRate(+e.target.value); if (videoRef.current) videoRef.current.playbackRate = +e.target.value; }}>{[0.25, 0.5, 1, 2].map((r) => <option key={r} value={r}>{r}×</option>)}</select>
                <span className="ml-auto text-xs tabular-nums text-slate-400" data-testid="clock">{mmss(time)} / {mmss(dur)}{frame ? ` · frame ${frame.i}` : ""}</span>
              </div>
              <p className="text-[10px] text-slate-500">Boxes update at the analysis rate ({fps} analysed frames per second), not on every video frame. “Frame” steps jump between analysed frames.</p>
            </div>
          </div>
          {/* quick filters + editors */}
          <div className={`${CARD} flex flex-wrap items-center gap-x-5 gap-y-3`}>
            <div><span className={LBL}>Classes</span><div className="flex flex-wrap gap-1">{SUPPORTED_CLASSES.map((c) => <Chip key={c} testid={`cls-${c}`} on={settings.classes.includes(c)} onClick={() => { const n = settings.classes.includes(c) ? settings.classes.filter((x) => x !== c) : [...settings.classes, c]; update({ classes: n.length ? n : [c] }); }}>{c}</Chip>)}</div></div>
            <label className="min-w-40"><span className={LBL}>Min confidence · {Math.round(settings.minConf * 100)}%</span><input type="range" min={5} max={95} value={Math.round(settings.minConf * 100)} onChange={(e) => update({ minConf: +e.target.value / 100 })} className="w-full" aria-label="Quick minimum confidence" /></label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`${BTN} ${tool === "zone" ? "!border-blue-500" : ""}`} disabled={!src || settings.zones.length >= LIMITS.maxZones} onClick={() => { setTool(tool === "zone" ? null : "zone"); setDraft([]); }} data-testid="draw-zone">{tool === "zone" ? "Cancel zone" : "Draw zone"}</button>
              {tool === "zone" && <button type="button" className={PRIMARY} disabled={draft.length < 3} onClick={() => finishDraft(draft)}>Finish zone</button>}
              <button type="button" className={`${BTN} ${tool === "line" ? "!border-blue-500" : ""}`} disabled={!src || settings.lines.length >= LIMITS.maxLines} onClick={() => { setTool(tool === "line" ? null : "line"); setDraft([]); }} data-testid="draw-line">{tool === "line" ? "Cancel line" : "Draw line"}</button>
              <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} />Trails</label>
              <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" checked={showRules} onChange={(e) => setShowRules(e.target.checked)} />Zones & lines</label>
            </div>
            {tool && <p className="basis-full text-[11px] text-blue-300" role="status">{tool === "zone" ? `Click the video to add points (${draft.length} so far). Double-click, Enter or “Finish zone” closes it; Esc cancels.` : `Click two points on the video to place the line (${draft.length}/2). Esc cancels.`}</p>}
            {!tool && (settings.zones.length > 0 || settings.lines.length > 0) && <p className="basis-full text-[10px] text-slate-500">Drag a zone corner or line end on the video to adjust it. Changes re-run tracking and events instantly.</p>}
          </div>
        </section>

        {/* Right panels */}
        <aside className={`min-w-0 ${src ? "order-3 lg:order-none" : ""}`} aria-label="Analysis panels">
          <div role="tablist" className="mb-3 flex gap-1 rounded-lg bg-slate-900 p-1">
            {([["detections", "Detections"], ["events", `Events${results ? ` (${results.events.length})` : ""}`], ["analytics", "Analytics"], ["settings", "Settings"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${tab === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <div role="tabpanel" className="max-h-[calc(100vh-9rem)] overflow-y-auto pr-0.5">
            {tab === "detections" && <DetectionsPanel frame={frame} tracks={results?.tracks ?? []} stats={results?.stats ?? null} selected={selTid} onSelect={setSelTid} onSeek={seek} />}
            {tab === "events" && <EventsPanel events={results?.events ?? []} selectedId={selEvent} onSelect={setSelEvent} onSeek={seek} onReview={review} hasJob={!!job} />}
            {tab === "analytics" && <AnalyticsPanel stats={results?.stats ?? null} events={results?.events ?? []} />}
            {tab === "settings" && <SettingsPanel s={settings} caps={caps} mode={mode ?? ""} update={update} reset={resetSettings} setTool={(t) => { setTool(t); setDraft([]); }} busy={busy} />}
          </div>
        </aside>
      </div>
    </DemoShell>
  );
}
