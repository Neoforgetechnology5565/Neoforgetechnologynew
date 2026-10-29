"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TEAM_COLOR, type Frame, type Team } from "@/lib/sports/types";

export interface OverlayOpts { boxes: boolean; ids: boolean; confidence: boolean; ball: boolean; ballTrail: boolean; trajectory: boolean }
export interface PlayerHandle { seek: (t: number) => void; time: () => number; toggle: () => void }
interface Props { src: string | null; fallbackSrc?: string | null; frames: Frame[]; sampleDt: number; srcW: number; srcH: number; opts: OverlayOpts; selected: number[]; onSelect: (id: number | null, additive: boolean) => void; onTime: (t: number, frame: Frame | null) => void }

/** Binary search for the analysed frame nearest to time t; null when t is further than 1.5 sampling intervals from any analysed frame. */
export function frameAt(frames: Frame[], t: number, dt: number): Frame | null {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < t) lo = m + 1; else hi = m; }
  const cands = [frames[lo], frames[Math.max(0, lo - 1)]];
  const best = cands.reduce((a, b) => (Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b));
  return Math.abs(best.t - t) <= 1.5 * dt ? best : null;
}

const SportsPlayer = forwardRef<PlayerHandle, Props>(function SportsPlayer({ src, fallbackSrc, frames, sampleDt, srcW, srcH, opts, selected, onSelect, onTime }, ref) {
  const video = useRef<HTMLVideoElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const box = useRef<HTMLDivElement>(null);
  const [srcFailed, setSrcFailed] = useState(false); const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false); const [dur, setDur] = useState(0);
  const cur = useRef<Frame | null>(null); const optsRef = useRef(opts); optsRef.current = opts; const selRef = useRef(selected); selRef.current = selected;
  const framesRef = useRef(frames); framesRef.current = frames;
  useEffect(() => setSrcFailed(false), [src]);
  useImperativeHandle(ref, () => ({ seek: (t) => { if (video.current) { video.current.currentTime = Math.max(0, t); } }, time: () => video.current?.currentTime ?? 0, toggle: () => { const v = video.current; if (v) (v.paused ? v.play() : v.pause()); } }), []);

  const useFallback = srcFailed && !!fallbackSrc;
  const url = useFallback ? fallbackSrc! : srcFailed ? null : src;

  const layout = useCallback(() => {
    const c = canvas.current, b = box.current; if (!c || !b) return null;
    const w = b.clientWidth, h = b.clientHeight; const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const s = Math.min(w / srcW, h / srcH); const ox = (w - srcW * s) / 2, oy = (h - srcH * s) / 2;
    return { s, ox, oy, dpr, w, h };
  }, [srcW, srcH]);

  const draw = useCallback(() => {
    const c = canvas.current, v = video.current; const L = layout(); if (!c || !v || !L) return;
    const g = c.getContext("2d"); if (!g) return; g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.clearRect(0, 0, L.w, L.h);
    const t = v.currentTime; const f = frameAt(framesRef.current, t, sampleDt); cur.current = f; const o = optsRef.current; const sel = new Set(selRef.current);
    const X = (x: number) => L.ox + x * L.s, Y = (y: number) => L.oy + y * L.s;
    // trajectories of selected tracks over the last 6 s (image coordinates of the foot point, as observed)
    if (o.trajectory && sel.size) {
      for (const id of sel) {
        g.beginPath(); let started = false;
        for (const fr of framesRef.current) { if (fr.t > t || fr.t < t - 6) continue; const p = fr.p.find((q) => q[0] === id); if (!p) continue; const x = X((p[1] + p[3]) / 2), y = Y(p[4]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }
        g.strokeStyle = "#fde047"; g.lineWidth = 2; g.stroke();
      }
    }
    if (o.ballTrail) {
      g.beginPath(); let st = false;
      for (const fr of framesRef.current) { if (fr.t > t || fr.t < t - 2 || !fr.b) continue; const x = X(fr.b[0]), y = Y(fr.b[1]); if (!st) { g.moveTo(x, y); st = true; } else g.lineTo(x, y); }
      g.strokeStyle = "rgba(250,250,250,.8)"; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
    }
    if (f && o.boxes) {
      for (const p of f.p) {
        const col = TEAM_COLOR[p[6] as Team]; const isSel = sel.has(p[0]);
        g.lineWidth = isSel ? 3 : 1.5; g.strokeStyle = isSel ? "#fde047" : col; g.strokeRect(X(p[1]), Y(p[2]), (p[3] - p[1]) * L.s, (p[4] - p[2]) * L.s);
        const label = [o.ids ? `#${p[0]}` : "", o.confidence ? p[5].toFixed(2) : ""].filter(Boolean).join(" ");
        if (label) { g.font = "12px Georgia, serif"; const tw = g.measureText(label).width + 6; g.fillStyle = "rgba(2,6,23,.8)"; g.fillRect(X(p[1]), Y(p[2]) - 16, tw, 15); g.fillStyle = isSel ? "#fde047" : col; g.fillText(label, X(p[1]) + 3, Y(p[2]) - 4); }
      }
    }
    if (f && o.ball && f.b) {
      const [bx, by, conf, kind] = f.b; g.lineWidth = 2.5; g.strokeStyle = kind === "observed" ? "#f43f5e" : "#fda4af"; g.setLineDash(kind === "observed" ? [] : [4, 3]);
      g.beginPath(); g.arc(X(bx), Y(by), Math.max(8, 14 * L.s), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.font = "12px Georgia, serif"; g.fillStyle = "#fecdd3"; g.fillText(kind === "observed" ? `ball ${conf?.toFixed(2)}` : "ball (estimated)", X(bx) + 12, Y(by) - 12);
    }
    onTime(t, f);
  }, [layout, sampleDt, onTime]);

  useEffect(() => {
    const v = video.current; if (!v) return; let raf = 0; let stop = false;
    const tick = () => { if (stop) return; setTime(v.currentTime); draw(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [draw, url]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const L = layout(); const f = cur.current; if (!L || !f) { onSelect(null, false); return; }
    const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left - L.ox) / L.s, y = (e.clientY - r.top - L.oy) / L.s;
    const hits = f.p.filter((p) => x >= p[1] && x <= p[3] && y >= p[2] && y <= p[4]).sort((a, b) => (a[3] - a[1]) * (a[4] - a[2]) - (b[3] - b[1]) * (b[4] - b[2]));
    onSelect(hits.length ? hits[0][0] : null, e.shiftKey || e.ctrlKey || e.metaKey);
  };
  return (
    <div>
      <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-md bg-black" data-testid="player-box">
        {url ? <video ref={video} key={url} src={url} className="absolute inset-0 h-full w-full object-contain" playsInline muted preload="auto" data-testid="video"
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onError={() => setSrcFailed(true)} />
          : <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-400">{srcFailed ? "This browser cannot play the original file; waiting for the server to prepare a browser-playable preview…" : "Choose a match video or a sample to see it here."}</div>}
        <canvas ref={canvas} className="absolute inset-0 h-full w-full cursor-crosshair" onClick={click} aria-label="Detections drawn on the video. Click a player box to select that track." data-testid="overlay" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <button type="button" className="rounded-md border border-slate-600 px-3 py-1 hover:border-amber-500" disabled={!url} onClick={() => { const v = video.current; if (v) (v.paused ? v.play() : v.pause()); }} data-testid="play">{playing ? "Pause" : "Play"}</button>
        <button type="button" className="rounded-md border border-slate-600 px-2 py-1 hover:border-amber-500" disabled={!url} onClick={() => { if (video.current) video.current.currentTime = Math.max(0, video.current.currentTime - sampleDt); }} aria-label="Previous analysed frame">◀</button>
        <button type="button" className="rounded-md border border-slate-600 px-2 py-1 hover:border-amber-500" disabled={!url} onClick={() => { if (video.current) video.current.currentTime += sampleDt; }} aria-label="Next analysed frame">▶</button>
        <input type="range" aria-label="Playback position" className="min-w-40 flex-1" min={0} max={dur || 1} step={0.04} value={time} onChange={(e) => { if (video.current) video.current.currentTime = Number(e.target.value); }} />
        <span className="tabular-nums" data-testid="clock">{time.toFixed(2)} s / {dur ? dur.toFixed(1) : "–"} s</span>
        {useFallback && <span className="text-amber-300">using the server preview</span>}
      </div>
    </div>
  );
});
export default SportsPlayer;
