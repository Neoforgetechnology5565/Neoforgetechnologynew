"use client";
import { useMemo, useRef, useState } from "react";
import type { Preview2d } from "@/lib/bim/demos/types";
import { BTN } from "./ui";

/** Pan/zoom SVG view of extracted drawing geometry with layer visibility, issue marks and a two-click distance tool. */
export default function Preview2D({ data, onMark, focus }: { data: Preview2d; onMark?: (i: number) => void; focus?: { x: number; y: number } | null }) {
  const ex = data.extents; const w0 = Math.max(ex.x1 - ex.x0, 1e-6), h0 = Math.max(ex.y1 - ex.y0, 1e-6); const pad = Math.max(w0, h0) * 0.06;
  const base = { x: ex.x0 - pad, y: -(ex.y1 + pad), w: w0 + 2 * pad, h: h0 + 2 * pad };
  const [vb, setVb] = useState<typeof base | null>(null); const view = vb ?? base; const drag = useRef<{ x: number; y: number; vb: typeof base; moved: boolean } | null>(null); const svg = useRef<SVGSVGElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); const [measure, setMeasure] = useState(false); const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const paths = useMemo(() => data.layers.map((l) => ({ name: l.name, color: l.color, d: l.paths.map((p) => { let s = ""; for (let i = 0; i < p.length; i += 2) s += `${i ? "L" : "M"}${p[i].toFixed(3)} ${(-p[i + 1]).toFixed(3)}`; return s; }).join("") })), [data]);
  const world = (e: React.PointerEvent | React.MouseEvent) => { const r = svg.current!.getBoundingClientRect(); return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: -(view.y + ((e.clientY - r.top) / r.height) * view.h) }; };
  const wheel = (e: React.WheelEvent) => { const r = svg.current!.getBoundingClientRect(); const mx = view.x + ((e.clientX - r.left) / r.width) * view.w, my = view.y + ((e.clientY - r.top) / r.height) * view.h; const k = e.deltaY > 0 ? 1.15 : 1 / 1.15; setVb({ x: mx - (mx - view.x) * k, y: my - (my - view.y) * k, w: view.w * k, h: view.h * k }); };
  const down = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vb: view, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true; if (!d.moved || measure) return; const r = svg.current!.getBoundingClientRect(); setVb({ ...d.vb, x: d.vb.x - ((e.clientX - d.x) / r.width) * d.vb.w, y: d.vb.y - ((e.clientY - d.y) / r.height) * d.vb.h }); };
  const up = (e: React.PointerEvent) => { const d = drag.current; drag.current = null; if (measure && d && !d.moved) setPts((p) => (p.length >= 2 ? [world(e)] : [...p, world(e)])); };
  const dist = pts.length === 2 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : null; const lw = Math.max(view.w, view.h) / 600; const fv = focus ? { x: focus.x, y: -focus.y } : null;
  return (
    <div className="relative h-[min(70vh,44rem)] min-h-[22rem] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950" data-testid="preview2d">
      <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className={`h-full w-full touch-none select-none ${measure ? "cursor-crosshair" : "cursor-grab"}`} onWheel={wheel} onPointerDown={down} onPointerMove={move} onPointerUp={up} role="img" aria-label="Extracted drawing geometry">
        {paths.filter((p) => !hidden.has(p.name)).map((p) => <path key={p.name} d={p.d} fill="none" stroke={p.color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" opacity={0.92} />)}
        {(data.marks ?? []).map((m, i) => <g key={i} onClick={(e) => { e.stopPropagation(); onMark?.(i); }} className="cursor-pointer"><circle cx={m.x} cy={-m.y} r={Math.max(view.w, view.h) / 90} fill={m.severity === "error" ? "rgba(239,68,68,.25)" : m.severity === "warning" ? "rgba(245,158,11,.25)" : "rgba(148,163,184,.2)"} stroke={m.severity === "error" ? "#ef4444" : m.severity === "warning" ? "#f59e0b" : "#94a3b8"} strokeWidth={1.5} vectorEffect="non-scaling-stroke" /><title>{m.label}</title></g>)}
        {fv && <circle cx={fv.x} cy={fv.y} r={Math.max(view.w, view.h) / 55} fill="none" stroke="#facc15" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={-p.y} r={lw * 4} fill="#facc15" />)}
        {pts.length === 2 && <line x1={pts[0].x} y1={-pts[0].y} x2={pts[1].x} y2={-pts[1].y} stroke="#facc15" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" />}
      </svg>
      <div className="absolute left-2 top-2 flex flex-wrap gap-1.5"><button type="button" className={`${BTN} bg-slate-900/90`} onClick={() => setVb(null)}>Fit</button><button type="button" className={`${BTN} bg-slate-900/90`} aria-label="Zoom in" onClick={() => setVb({ x: view.x + view.w * 0.1, y: view.y + view.h * 0.1, w: view.w * 0.8, h: view.h * 0.8 })}>＋</button><button type="button" className={`${BTN} bg-slate-900/90`} aria-label="Zoom out" onClick={() => setVb({ x: view.x - view.w * 0.125, y: view.y - view.h * 0.125, w: view.w * 1.25, h: view.h * 1.25 })}>－</button><button type="button" aria-pressed={measure} data-testid="measure2d" className={`${BTN} ${measure ? "!border-amber-400 !bg-amber-500/20 !text-amber-200" : "bg-slate-900/90"}`} onClick={() => { setMeasure((m) => !m); setPts([]); }}>Measure</button></div>
      {measure && <p className="absolute bottom-2 left-2 rounded bg-slate-900/90 px-2 py-1 text-xs text-amber-200" data-testid="measure2d-out">{dist === null ? pts.length ? "Click the second point" : "Click two points to measure (metres)" : `Distance ${dist.toFixed(3)} m · Δx ${(pts[1].x - pts[0].x).toFixed(3)} · Δy ${(pts[1].y - pts[0].y).toFixed(3)}`}</p>}
      <div className="absolute right-2 top-2 max-h-[80%] w-44 overflow-auto rounded-md border border-slate-700 bg-slate-900/90 p-2 text-xs"><p className="mb-1 font-semibold text-slate-300">Layers</p>{data.layers.map((l) => <label key={l.name} className="flex items-center gap-1.5 py-0.5 text-slate-200"><input type="checkbox" checked={!hidden.has(l.name)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(l.name)) n.delete(l.name); else n.add(l.name); return n; })} /><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} /><span className="truncate">{l.name}</span></label>)}</div>
    </div>
  );
}
