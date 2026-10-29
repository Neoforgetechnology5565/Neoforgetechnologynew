"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BONES, type Alert, type FrameObs } from "@/lib/activity/types";

export interface Overlay { boxes: boolean; ids: boolean; pose: boolean }
export interface PlayerHandle { playRange: (t0: number, t1: number) => void; seek: (t: number) => void }
interface Props { src: string | null; fallbackSrc?: string | null; frames: FrameObs[]; sampleDt: number; srcW: number; srcH: number; duration: number; overlay: Overlay; flagged: number[]; alerts: Alert[]; selectedId: string | null; preparing?: boolean; onPickAlert: (id: string) => void }

const COLORS = ["#3cb44b", "#e6194b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe"];
function frameAt(frames: FrameObs[], t: number, dt: number): FrameObs | null {
  let lo = 0, hi = frames.length - 1; if (hi < 0) return null;
  while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t <= t) lo = m + 1; else hi = m; }
  const f = frames[Math.max(0, frames[lo].t <= t ? lo : lo - 1)];
  return f && t - f.t >= -1e-3 && t - f.t <= 2 * dt ? f : null; // hold the last analysed frame, but never show stale overlays for longer than two sampling intervals
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

const ClipPlayer = forwardRef<PlayerHandle, Props>(function ClipPlayer({ src, fallbackSrc, frames, sampleDt, srcW, srcH, duration, overlay, flagged, alerts, selectedId, preparing, onPickAlert }, ref) {
  const video = useRef<HTMLVideoElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false); const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false); const [rate, setRate] = useState(1); const range = useRef<[number, number] | null>(null);
  const ov = useRef(overlay); ov.current = overlay; const fl = useRef(flagged); fl.current = flagged; const fr = useRef(frames); fr.current = frames;
  useEffect(() => setFailed(false), [src]);
  const url = failed && fallbackSrc ? fallbackSrc : failed ? null : src;
  useImperativeHandle(ref, () => ({
    playRange: (t0, t1) => { const v = video.current; if (!v) return; range.current = [Math.max(0, t0), t1]; v.currentTime = Math.max(0, t0); void v.play().catch(() => undefined); },
    seek: (t) => { range.current = null; if (video.current) video.current.currentTime = Math.max(0, t); },
  }), []);

  const draw = useCallback(() => {
    const c = canvas.current, v = video.current, b = box.current; if (!c || !v || !b) return;
    const w = b.clientWidth, h = b.clientHeight, dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d"); if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const s = Math.min(w / srcW, h / srcH), ox = (w - srcW * s) / 2, oy = (h - srcH * s) / 2;
    const f = frameAt(fr.current, v.currentTime, sampleDt); if (!f) return; const o = ov.current; const flaggedSet = new Set(fl.current);
    for (const p of f.persons) {
      const col = COLORS[p.id % COLORS.length], hot = flaggedSet.has(p.id);
      if (o.boxes) { g.lineWidth = hot ? 3 : 1.5; g.strokeStyle = hot ? "#ef4444" : col; g.strokeRect(ox + p.box[0] * s, oy + p.box[1] * s, (p.box[2] - p.box[0]) * s, (p.box[3] - p.box[1]) * s); }
      if (o.ids) { g.font = "12px Georgia, serif"; g.fillStyle = hot ? "#fecaca" : col; g.fillText(`#${p.id}`, ox + p.box[0] * s, Math.max(12, oy + p.box[1] * s - 4)); }
      if (o.pose && p.kp) {
        g.lineWidth = 2; g.strokeStyle = col; g.lineCap = "round";
        for (const [a, c2] of BONES) { const A = p.kp[a], B = p.kp[c2]; if (A[2] < 0.4 || B[2] < 0.4) continue; g.beginPath(); g.moveTo(ox + A[0] * s, oy + A[1] * s); g.lineTo(ox + B[0] * s, oy + B[1] * s); g.stroke(); }
      }
    }
  }, [srcW, srcH, sampleDt]);

  useEffect(() => { let raf = 0; const loop = () => { const v = video.current; if (v) { setTime(v.currentTime); const r = range.current; if (r && v.currentTime >= r[1]) { v.pause(); range.current = null; } draw(); } raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, [draw]);
  useEffect(() => { if (video.current) video.current.playbackRate = rate; }, [rate, url]);

  const dur = duration || video.current?.duration || 0;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-black">
        {url ? <video ref={video} key={url} src={url} playsInline muted preload="auto" className="absolute inset-0 h-full w-full object-contain" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} data-testid="clip-video" />
          : <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-slate-400" data-testid="clip-pending">{preparing ? "Preparing a browser preview of the video…" : "The browser preview is not available. The annotated MP4 can still be downloaded."}</p>}
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" data-testid="clip-overlay" />
      </div>
      <div className="space-y-2 p-3">
        <div className="relative">
          <input type="range" min={0} max={Math.max(dur, 0.1)} step={0.05} value={Math.min(time, dur || time)} aria-label="Seek" className="w-full accent-blue-500" onChange={(e) => { range.current = null; if (video.current) video.current.currentTime = Number(e.target.value); }} />
          <div className="pointer-events-none relative -mt-1 h-3 w-full" aria-hidden>
            {alerts.map((a) => <span key={a.id} style={{ left: `${dur ? (a.t_peak / dur) * 100 : 0}%` }} className={`absolute top-0 h-3 w-1 -translate-x-1/2 rounded-sm ${a.id === selectedId ? "bg-white" : a.kind === "fall" ? "bg-red-500" : "bg-amber-400"}`} />)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button className="rounded-md border border-slate-600 px-3 py-1.5 font-medium text-slate-200 hover:border-blue-500" onClick={() => { const v = video.current; if (v) { range.current = null; void (v.paused ? v.play() : v.pause()); } }}>{playing ? "Pause" : "Play"}</button>
          <span className="tabular-nums text-slate-300">{fmt(time)} / {fmt(dur)}</span>
          <label className="ml-auto flex items-center gap-1 text-slate-400">Speed
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100">{[0.25, 0.5, 1, 2].map((r) => <option key={r} value={r}>{r}×</option>)}</select>
          </label>
        </div>
        <p className="text-[11px] text-slate-500">Overlays are drawn from the analysed frames (about {sampleDt > 0 ? (1 / sampleDt).toFixed(1) : "?"} per second) and held between them; they are not interpolated. Click a marker to open its alert.</p>
        <div className="flex flex-wrap gap-1" aria-label="Alert markers">{alerts.map((a) => <button key={a.id} onClick={() => onPickAlert(a.id)} className={`rounded border px-1.5 py-0.5 text-[11px] ${a.id === selectedId ? "border-white text-white" : "border-slate-700 text-slate-400 hover:border-blue-500"}`}>{fmt(a.t_peak)} {a.kind === "fall" ? "fall?" : "contact?"}</button>)}</div>
      </div>
    </div>
  );
});
export default ClipPlayer;
