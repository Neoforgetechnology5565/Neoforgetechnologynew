"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { CLASS_COLOR, frameAt, type FrameRec, type Line } from "@/lib/vehicle/types";

export interface OverlayOpts { boxes: boolean; ids: boolean; labels: boolean; confidence: boolean }
export type PlayerMode = "overlay" | "processed" | "side";
export interface PlayerHandle { seek(t: number): void }

const BTN = "rounded-md border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40";

function Pane({ src, overlay, frames, opts, line, drawing, onLine, onReady, label, vref }: { src: string; overlay: boolean; frames: React.MutableRefObject<FrameRec[]>; opts: OverlayOpts; line: Line | null; drawing: boolean; onLine: (l: Line | null) => void; onReady?: () => void; label: string; vref: (el: HTMLVideoElement | null) => void }) {
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), video = useRef<HTMLVideoElement>(null); const pts = useRef<{ x: number; y: number }[]>([]);
  const optsRef = useRef(opts); optsRef.current = opts; const lineRef = useRef(line); lineRef.current = line;
  useEffect(() => { vref(video.current); return () => vref(null); }, [vref]);
  const rect = () => { const v = video.current!, c = box.current!; const vw = v.videoWidth || 16, vh = v.videoHeight || 9, cw = c.clientWidth, ch = c.clientHeight; const s = Math.min(cw / vw, ch / vh); const w = vw * s, h = vh * s; return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, s, vw, vh }; };
  useEffect(() => {
    if (!overlay) return; let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop); const cv = canvas.current, v = video.current, b = box.current; if (!cv || !v || !b) return;
      const dpr = window.devicePixelRatio || 1, W = b.clientWidth, H = b.clientHeight; if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; }
      const g = cv.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const r = rect(); const o = optsRef.current;
      const rec = frameAt(frames.current, v.currentTime);
      if (rec && o.boxes) for (const d of rec.detections) {
        const x = r.x + d.bbox.x1 * r.s, y = r.y + d.bbox.y1 * r.s, w = (d.bbox.x2 - d.bbox.x1) * r.s, h = (d.bbox.y2 - d.bbox.y1) * r.s, col = CLASS_COLOR[d.class];
        g.lineWidth = d.track_id !== null ? 2.5 : 1; g.strokeStyle = col; g.setLineDash(d.track_id !== null ? [] : [4, 3]); g.strokeRect(x, y, w, h); g.setLineDash([]);
        const txt = [o.labels ? d.class : "", o.confidence ? d.confidence.toFixed(2) : "", o.ids && d.track_id !== null ? `#${d.track_id}` : ""].filter(Boolean).join(" ");
        if (txt) { g.font = "600 12px Georgia, serif"; const tw = g.measureText(txt).width + 8, ty = Math.max(16, y); g.fillStyle = col; g.fillRect(x, ty - 16, tw, 16); g.fillStyle = "#0b1220"; g.fillText(txt, x + 4, ty - 4); }
      }
      const L = lineRef.current; const P = pts.current;
      const seg = L ? [r.x + L.x1 * r.w, r.y + L.y1 * r.h, r.x + L.x2 * r.w, r.y + L.y2 * r.h] : P.length === 2 ? [P[0].x, P[0].y, P[1].x, P[1].y] : null;
      if (seg) { g.strokeStyle = "#22d3ee"; g.lineWidth = 3; g.beginPath(); g.moveTo(seg[0], seg[1]); g.lineTo(seg[2], seg[3]); g.stroke(); }
      if (drawing && P.length === 1) { g.fillStyle = "#22d3ee"; g.beginPath(); g.arc(P[0].x, P[0].y, 5, 0, 7); g.fill(); }
    };
    loop(); return () => cancelAnimationFrame(raf);
  }, [overlay, frames, drawing]);
  const click = (e: React.MouseEvent) => {
    if (!drawing) return; const b = box.current!.getBoundingClientRect(), r = rect(); const p = { x: e.clientX - b.left, y: e.clientY - b.top };
    if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) return;
    if (pts.current.length >= 2) pts.current = []; pts.current.push(p);
    if (pts.current.length === 2) { const [a, c] = pts.current; onLine({ x1: (a.x - r.x) / r.w, y1: (a.y - r.y) / r.h, x2: (c.x - r.x) / r.w, y2: (c.y - r.y) / r.h }); pts.current = []; }
  };
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div ref={box} className={`relative aspect-video w-full overflow-hidden rounded-lg bg-black ${drawing ? "cursor-crosshair" : ""}`} data-testid={overlay ? "overlay-pane" : "plain-pane"}>
        <video ref={video} src={src} muted playsInline preload="auto" crossOrigin="anonymous" onLoadedMetadata={onReady} className="absolute inset-0 h-full w-full object-contain" />
        {overlay && <canvas ref={canvas} onClick={click} data-testid="overlay-canvas" className="absolute inset-0" />}
      </div>
    </div>
  );
}

/** Video with a synchronised overlay of REAL per-frame results, transport controls and an optional comparison view. */
const OverlayPlayer = forwardRef<PlayerHandle, { originalSrc: string | null; processedSrc: string | null; frames: React.MutableRefObject<FrameRec[]>; opts: OverlayOpts; mode: PlayerMode; line: Line | null; drawing: boolean; onLine: (l: Line | null) => void; onFrame: (rec: FrameRec | null, t: number) => void; fps: number }>(function OverlayPlayer({ originalSrc, processedSrc, frames, opts, mode, line, drawing, onLine, onFrame, fps }, ref) {
  const vids = useRef<(HTMLVideoElement | null)[]>([null, null]); const [t, setT] = useState(0), [dur, setDur] = useState(0), [playing, setPlaying] = useState(false), [rate, setRate] = useState(1);
  const last = useRef(-1);
  const all = () => vids.current.filter(Boolean) as HTMLVideoElement[];
  const reg = useCallback((i: number) => (el: HTMLVideoElement | null) => { vids.current[i] = el; }, []);
  const regs = [reg(0), reg(1)];
  useImperativeHandle(ref, () => ({ seek: (x: number) => all().forEach((v) => { v.currentTime = x; }) }));
  useEffect(() => { // time keeping, sync of the second video, and notifying the stats panel at most when the frame record changes
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); const [a, b] = vids.current; if (!a) return; setT(a.currentTime); setPlaying(!a.paused); if (a.duration && isFinite(a.duration)) setDur(a.duration);
      if (b && Math.abs(b.currentTime - a.currentTime) > 0.12) b.currentTime = a.currentTime; if (b && a.paused !== b.paused) { if (a.paused) b.pause(); else void b.play().catch(() => undefined); }
      const rec = frameAt(frames.current, a.currentTime); const key = rec ? rec.frame_number : -1; if (key !== last.current) { last.current = key; onFrame(rec, a.currentTime); } };
    loop(); return () => cancelAnimationFrame(raf);
  }, [frames, onFrame, originalSrc, processedSrc, mode]);
  useEffect(() => { all().forEach((v) => { v.playbackRate = rate; }); }, [rate, mode, originalSrc, processedSrc]);
  const toggle = () => { const [a] = vids.current; if (!a) return; if (a.paused) all().forEach((v) => void v.play().catch(() => undefined)); else all().forEach((v) => v.pause()); };
  const seek = (x: number) => all().forEach((v) => { v.currentTime = x; });
  const step = (d: number) => { all().forEach((v) => { v.pause(); v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d / Math.max(1, fps))); }); };
  const mm = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
  const sameKey = `${originalSrc}|${processedSrc}|${mode}`;
  return (
    <div data-testid="player">
      <div className="flex gap-3" key={sameKey}>
        {mode === "overlay" && originalSrc && <Pane src={originalSrc} overlay frames={frames} opts={opts} line={line} drawing={drawing} onLine={onLine} label="Original footage with detection overlay" vref={regs[0]} />}
        {mode === "processed" && processedSrc && <Pane src={processedSrc} overlay={false} frames={frames} opts={opts} line={null} drawing={false} onLine={onLine} label="Processed video (boxes burned in by the server)" vref={regs[0]} />}
        {mode === "side" && originalSrc && <>
          <Pane src={originalSrc} overlay={false} frames={frames} opts={opts} line={null} drawing={false} onLine={onLine} label="Original" vref={regs[0]} />
          {processedSrc ? <Pane src={processedSrc} overlay={false} frames={frames} opts={opts} line={null} drawing={false} onLine={onLine} label="Processed" vref={regs[1]} /> : <Pane src={originalSrc} overlay frames={frames} opts={opts} line={line} drawing={false} onLine={onLine} label="With detection overlay" vref={regs[1]} />}
        </>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
        <button type="button" className={BTN} onClick={toggle} data-testid="play" aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <button type="button" className={BTN} onClick={() => step(-1)} aria-label="Previous frame">◀|</button><button type="button" className={BTN} onClick={() => step(1)} aria-label="Next frame">|▶</button>
        <input type="range" aria-label="Timeline" data-testid="timeline" className="min-w-[8rem] flex-1" min={0} max={dur || 1} step={0.01} value={Math.min(t, dur || 1)} onChange={() => undefined} onInput={(e) => seek(Number(e.currentTarget.value))} />
        <span className="tabular-nums text-xs text-slate-300" data-testid="clock">{mm(t)} / {mm(dur)}</span>
        <label className="flex items-center gap-1 text-xs text-slate-300">Speed<select aria-label="Playback speed" data-testid="speed" className="rounded border border-slate-700 bg-slate-950 px-1 py-1 text-xs" value={rate} onChange={(e) => setRate(Number(e.target.value))}>{[0.25, 0.5, 1, 2, 4].map((r) => <option key={r} value={r}>{r}×</option>)}</select></label>
      </div>
    </div>
  );
});
export default OverlayPlayer;
