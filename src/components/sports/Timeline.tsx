"use client";
import { useEffect, useRef } from "react";
import type { EventRec, Frame, Results } from "@/lib/sports/types";

interface Props { frames: Frame[]; ballIntervals: Results["ball_intervals"]; events: EventRec[]; duration: number; time: number; range: [number, number]; onSeek: (t: number) => void; maxPlayers: number }

/** Three lanes on one time axis: players detected per analysed frame, ball state (observed / estimated / missing), event candidates. Click to seek. */
export default function Timeline({ frames, ballIntervals, events, duration, time, range, onSeek, maxPlayers }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || duration <= 0) return; const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const g = c.getContext("2d"); if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const X = (t: number) => (t / duration) * w;
    const laneH = (h - 12) / 3;
    g.fillStyle = "rgba(251,191,36,.10)"; g.fillRect(X(range[0]), 0, Math.max(1, X(range[1]) - X(range[0])), h);
    // lane 1: players per analysed frame
    g.fillStyle = "#38bdf8"; for (const f of frames) { const bh = (f.p.length / Math.max(1, maxPlayers)) * (laneH - 4); const x = X(f.t); g.fillRect(x, laneH - bh, Math.max(1, (w / Math.max(1, frames.length)) * 0.9), bh); }
    // lane 2: ball
    for (const [a, b, k] of ballIntervals) { g.fillStyle = k === "observed" ? "#f43f5e" : k === "estimated" ? "#fda4af" : "#334155"; g.fillRect(X(a), laneH + 4, Math.max(1, X(b) - X(a)), laneH - 6); }
    // lane 3: events
    for (const e of events) { g.fillStyle = e.confidence === "medium" ? "#a3e635" : "#65a30d"; g.fillRect(X(e.t0), 2 * laneH + 6, Math.max(3, X(e.t1) - X(e.t0)), laneH - 6); }
    g.fillStyle = "#e2e8f0"; g.fillRect(X(time) - 1, 0, 2, h);
    g.font = "10px Georgia, serif"; g.fillStyle = "#94a3b8"; g.fillText("players", 3, 10); g.fillText("ball", 3, laneH + 14); g.fillText("event candidates", 3, 2 * laneH + 16);
  }, [frames, ballIntervals, events, duration, time, range, maxPlayers]);
  return (
    <div>
      <canvas ref={ref} className="h-24 w-full cursor-pointer rounded-md border border-slate-800 bg-slate-950" data-testid="timeline" role="slider" aria-label="Match timeline: click to seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * duration); }} />
      <p className="mt-1 text-[11px] text-slate-500"><span className="text-sky-400">■</span> players per analysed frame · <span className="text-rose-500">■</span> ball observed · <span className="text-rose-300">■</span> ball estimated (interpolated) · <span className="text-slate-500">■</span> ball missing · <span className="text-lime-400">■</span> possession candidates · shaded = selected time range</p>
    </div>
  );
}
