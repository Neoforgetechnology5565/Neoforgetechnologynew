"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WtConfig } from "@/lib/walkthrough/schema";
import { WalkthroughRunner, type Mode, type RunnerState } from "./engine";

const B = "rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-[13px] font-medium text-slate-100 hover:border-cyan-400 disabled:opacity-40";
const GO = "rounded bg-cyan-500 px-3 py-1.5 text-[13px] font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40";

/** Hosts a demo in a same-origin iframe and drives it. The overlay never captures pointer events, so the demo stays fully usable by hand. */
export default function WalkthroughStage({ demoPath, demoTitle, config, height = "72vh", autoStart, startAt }: { demoPath: string; demoTitle: string; config: WtConfig; height?: string; autoStart?: Mode; startAt?: number }) {
  const frame = useRef<HTMLIFrameElement>(null), box = useRef<HTMLDivElement>(null), runner = useRef<WalkthroughRunner | null>(null), loadWait = useRef<(() => void) | null>(null);
  const [st, setSt] = useState<RunnerState | null>(null), [ready, setReady] = useState(false), [full, setFull] = useState(false);

  const loadPath = useCallback((path: string) => new Promise<void>((res) => { const f = frame.current; if (!f) return res(); loadWait.current = res; f.src = path; setTimeout(res, 15000); }), []);
  useEffect(() => {
    setReady(false); const r = new WalkthroughRunner({ getFrame: () => frame.current, config, demoTitle, demoPath, onState: setSt, loadPath }); runner.current = r; setSt(r.state);
    return () => { r.destroy(); runner.current = null; };
  }, [config, demoTitle, demoPath, loadPath]);
  useEffect(() => { const f = () => setFull(document.fullscreenElement === box.current); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  const onLoad = () => { runner.current?.guard(); setReady(true); loadWait.current?.(); loadWait.current = null; };
  useEffect(() => { const r = runner.current; if (ready && autoStart && r?.state.status === "idle") void r.start(autoStart).then(() => { if (startAt !== undefined) void r.goTo(startAt); }); }, [ready, autoStart, startAt]);

  const r = runner.current, s = st, active = !!s && s.status !== "idle" && s.status !== "stopped", pct = s && s.total ? Math.round((Math.max(0, s.index) / s.total) * 100) : 0;
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void box.current?.requestFullscreen?.(); };
  return (
    <div ref={box} className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-900" style={{ height: full ? "100vh" : height }} data-testid="wt-stage" data-status={s?.status ?? "idle"} data-mode={s?.mode ?? ""} data-index={s?.index ?? -1} data-skipped={s?.skipped ?? 0} data-blocked={s?.blockedRequests ?? 0}>
      <iframe ref={frame} src={demoPath} title={`${demoTitle} (demo)`} onLoad={onLoad} className="absolute inset-0 h-full w-full border-0 bg-white" data-testid="wt-frame" />
      {/* highlight: pointer-events none so the demo stays clickable */}
      {s?.rect && (s.status === "running" || s.status === "paused") && <div aria-hidden data-testid="wt-highlight" className="pointer-events-none absolute rounded-md ring-2 ring-cyan-400 transition-all duration-200" style={{ left: s.rect.x - 6, top: s.rect.y - 6, width: s.rect.w + 12, height: s.rect.h + 12, boxShadow: "0 0 0 9999px rgba(2,6,23,0.42), 0 0 18px 4px rgba(34,211,238,0.55)" }} />}
      {s && s.status === "intro" && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/70 p-6" data-testid="wt-intro"><div className="max-w-xl rounded-xl border border-cyan-500/50 bg-slate-900/95 p-6 text-center shadow-2xl"><p className="text-[13px] uppercase tracking-widest text-cyan-300">Walkthrough</p><h2 className="mt-1 text-2xl font-semibold text-white">{s.demoTitle}</h2>{s.subtitlesOn && <p className="mt-3 text-[17px] leading-relaxed text-slate-200">{s.intro}</p>}<p className="mt-3 text-[13px] text-slate-400">{s.mode === "manual" ? "Manual mode: use Next and Previous. You can click the demo at any time." : "Automated mode: the walkthrough starts in a moment."}</p></div></div>}
      {s && s.status === "done" && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 p-6" data-testid="wt-done"><div className="max-w-xl rounded-xl border border-green-500/50 bg-slate-900/95 p-6 text-center shadow-2xl"><p className="text-[13px] uppercase tracking-widest text-green-400">Complete</p><h2 className="mt-1 text-2xl font-semibold text-white">{s.demoTitle}</h2><p className="mt-3 text-[17px] text-slate-200">{s.completion}</p>
        <p className="mt-3 text-[13px] text-slate-400" data-testid="wt-summary">{s.total - s.skipped} of {s.total} steps ran{s.skipped ? `, ${s.skipped} skipped` : ""}{s.issues.length ? `, ${s.issues.length} issue${s.issues.length > 1 ? "s" : ""}` : ""}{s.blockedRequests ? `, ${s.blockedRequests} write request${s.blockedRequests > 1 ? "s" : ""} blocked` : ""}.</p>
        {s.issues.length > 0 && <ul className="mt-2 max-h-32 overflow-auto text-left text-[13px] text-amber-300" data-testid="wt-issues">{s.issues.map((i, k) => <li key={k}>{i.kind}: {i.title}: {i.detail}</li>)}</ul>}
        <div className="mt-4 flex justify-center gap-2"><button type="button" className={GO} onClick={() => void r?.restart()} data-testid="wt-done-restart">Restart</button><button type="button" className={B} onClick={() => r?.stop()} data-testid="wt-done-close">Close</button></div></div></div>}
      {/* subtitles */}
      {s && (s.status === "running" || s.status === "paused") && s.subtitlesOn && s.subtitle && <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4" data-testid="wt-subtitle-wrap"><div className="max-w-3xl rounded-lg bg-slate-950/92 px-5 py-3 text-center shadow-xl ring-1 ring-slate-700"><p className="text-[13px] font-semibold uppercase tracking-wide text-cyan-300">{s.title}<span className={`ml-2 rounded px-1.5 py-0.5 ${s.badge === "prepared" ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300"}`} data-testid="wt-badge">{s.badge === "prepared" ? "Prepared presentation data" : "Live demo"}</span></p><p className="mt-1 text-[19px] leading-snug text-white" data-testid="wt-subtitle">{s.subtitle}</p>{s.badge === "prepared" && <p className="mt-1 text-[13px] text-amber-200">Shown for presentation: this is a bundled sample state, not a new processing result.</p>}</div></div>}
      {/* floating administrator controls */}
      <div className="absolute right-3 top-3 z-10 w-[min(94%,420px)] rounded-lg border border-slate-600 bg-slate-950/95 p-2 shadow-xl" role="region" aria-label="Walkthrough controls" data-testid="wt-controls">
        {!active ? <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={GO} disabled={!ready || !config.steps.length} onClick={() => void r?.start("auto")} data-testid="wt-start-auto">Start Automated Walkthrough</button>
          <button type="button" className={B} disabled={!ready || !config.steps.length} onClick={() => void r?.start("manual")} data-testid="wt-start-manual">Manual walkthrough</button>
          <span className="text-[13px] text-slate-400">{!ready ? "Loading demo…" : !config.steps.length ? "No steps yet" : `${config.steps.length} steps`}</span>
          <button type="button" className={B} onClick={toggleFull} aria-label="Fullscreen" data-testid="wt-fullscreen">⛶</button></div>
        : <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={B} onClick={() => void r?.prev()} aria-label="Previous step" data-testid="wt-prev">⏮</button>
            {s?.status === "paused" ? <button type="button" className={GO} onClick={() => r?.resume()} aria-label="Resume" data-testid="wt-resume">▶ Resume</button> : <button type="button" className={B} onClick={() => r?.pause()} aria-label="Pause" data-testid="wt-pause" disabled={s?.status === "done"}>⏸ Pause</button>}
            <button type="button" className={B} onClick={() => void r?.next()} aria-label="Next step" data-testid="wt-next">⏭</button>
            <button type="button" className={B} onClick={() => void r?.restart()} aria-label="Restart" data-testid="wt-restart">⟲</button>
            <button type="button" className={B} onClick={() => r?.stop()} aria-label="Stop" data-testid="wt-stop">⏹</button>
            <button type="button" className={B} aria-pressed={s?.subtitlesOn} onClick={() => r?.setSubtitles(!s?.subtitlesOn)} aria-label="Subtitles" data-testid="wt-subtitles">CC {s?.subtitlesOn ? "on" : "off"}</button>
            <button type="button" className={B} onClick={toggleFull} aria-label="Fullscreen" data-testid="wt-fullscreen">⛶</button></div>
          <p className="mt-1.5 text-[13px] text-slate-200" data-testid="wt-progress-label">{s && s.index >= 0 && s.index < s.total ? `Step ${s.index + 1} of ${s.total} — ${s.title}` : s?.status === "done" ? "Finished" : `Introduction · ${s?.total ?? 0} steps`} <span className="text-slate-500">({s?.mode === "manual" ? "manual" : "automated"}{s?.status === "paused" ? ", paused" : ""})</span></p>
          <div className="mt-1 h-1.5 rounded bg-slate-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Walkthrough progress"><div className="h-1.5 rounded bg-cyan-400 transition-all" style={{ width: `${s?.status === "done" ? 100 : pct}%` }} /></div></>}
      </div>
    </div>
  );
}
