"use client";
import { useMemo, useRef, useState } from "react";
import type { DocAnalysis } from "@/lib/bim/analysis";
import type { Building } from "@/lib/bim/model";

const ROLE_COLOR: Record<string, string> = { wall: "#e5e7eb", door: "#f59e0b", window: "#38bdf8", column: "#a78bfa", stair: "#fbbf24", "room-label": "#34d399", dimension: "#fb7185", furniture: "#94a3b8", mep: "#22d3ee", ignore: "#64748b" };
export { ROLE_COLOR };

/** SVG view of the EXTRACTED drawing (layers coloured by their assigned role) with an optional overlay of the INTERPRETED building (wall footprints, openings, rooms). */
export default function PlanView2D({ analysis, building, hiddenLayers, showInterpreted, showRooms, level = "L0", onSelect, selectedId, highlightLayer }: { analysis: DocAnalysis | null; building: Building | null; hiddenLayers: Set<string>; showInterpreted: boolean; showRooms: boolean; level?: string; onSelect?: (id: string) => void; selectedId?: string | null; highlightLayer?: string | null }) {
  const ex = analysis?.extents; const pad = ex ? Math.max(ex.width, ex.height) * 0.06 + 0.5 : 1;
  const base = ex ? { x: ex.x0 - pad, y: -(ex.y1 + pad), w: ex.width + 2 * pad, h: ex.height + 2 * pad } : { x: 0, y: 0, w: 10, h: 10 };
  const [vb, setVb] = useState<{ x: number; y: number; w: number; h: number } | null>(null); const view = vb ?? base; const drag = useRef<{ x: number; y: number; vb: typeof view } | null>(null); const svg = useRef<SVGSVGElement>(null);
  const paths = useMemo(() => { if (!analysis) return []; const role = new Map(analysis.layers.map((l) => [l.name, l.role])); return Object.entries(analysis.geometry).map(([layer, ps]) => ({ layer, role: role.get(layer) ?? "ignore", d: ps.map((p) => { let s = ""; for (let i = 0; i < p.length; i += 2) s += `${i ? "L" : "M"}${p[i].toFixed(3)} ${(-p[i + 1]).toFixed(3)}`; return s; }).join("") })); }, [analysis]);
  const lw = Math.max(view.w, view.h) / 700;
  const wheel = (e: React.WheelEvent) => { const r = svg.current!.getBoundingClientRect(); const mx = view.x + ((e.clientX - r.left) / r.width) * view.w, my = view.y + ((e.clientY - r.top) / r.height) * view.h; const k = e.deltaY > 0 ? 1.15 : 1 / 1.15; setVb({ x: mx - (mx - view.x) * k, y: my - (my - view.y) * k, w: view.w * k, h: view.h * k }); };
  const down = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vb: view }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const r = svg.current!.getBoundingClientRect(); setVb({ ...d.vb, x: d.vb.x - ((e.clientX - d.x) / r.width) * d.vb.w, y: d.vb.y - ((e.clientY - d.y) / r.height) * d.vb.h }); };
  const walls = building?.walls.filter((w) => w.level === level) ?? []; const rooms = building?.rooms.filter((r) => r.level === level) ?? [];
  const wallPoly = (w: (typeof walls)[number]) => { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y; const L = Math.hypot(dx, dy) || 1; const nx = (-dy / L) * (w.thickness / 2), ny = (dx / L) * (w.thickness / 2); return `${w.a.x + nx},${-(w.a.y + ny)} ${w.b.x + nx},${-(w.b.y + ny)} ${w.b.x - nx},${-(w.b.y - ny)} ${w.a.x - nx},${-(w.a.y - ny)}`; };
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="h-full w-full cursor-grab touch-none select-none" onWheel={wheel} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} role="img" aria-label="Extracted 2D drawing and interpreted plan">
        {paths.filter((p) => !hiddenLayers.has(p.layer)).map((p) => <path key={p.layer} d={p.d} fill="none" stroke={ROLE_COLOR[p.role] ?? "#94a3b8"} strokeWidth={p.layer === highlightLayer ? lw * 3 : lw} opacity={showInterpreted ? 0.35 : 0.95} vectorEffect="non-scaling-stroke" style={{ strokeWidth: p.layer === highlightLayer ? 3 : 1 }} />)}
        {showInterpreted && <g>
          {rooms.map((r) => <g key={r.id} onClick={() => onSelect?.(r.id)} className="cursor-pointer"><polygon points={r.polygon.map((p) => `${p.x},${-p.y}`).join(" ")} fill={selectedId === r.id ? "rgba(250,204,21,.45)" : showRooms ? "rgba(52,211,153,.22)" : "rgba(52,211,153,.05)"} stroke="#34d399" strokeWidth={1} vectorEffect="non-scaling-stroke" />{showRooms && <text x={r.centroid.x} y={-r.centroid.y} textAnchor="middle" fontSize={Math.max(0.28, Math.max(view.w, view.h) / 55)} fill="#d1fae5" style={{ pointerEvents: "none" }}>{r.name}<tspan x={r.centroid.x} dy="1.2em" fill="#6ee7b7">{r.area.toFixed(2)} m²</tspan></text>}</g>)}
          {walls.map((w) => <g key={w.id} onClick={() => onSelect?.(w.id)} className="cursor-pointer"><polygon points={wallPoly(w)} fill={selectedId === w.id ? "#facc15" : w.kind === "exterior" ? "#9ca3af" : "#cbd5e1"} stroke="#0f172a" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.92} />
            {w.openings.map((o) => { const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1; const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L; const x0 = w.a.x + ux * (o.s - o.width / 2), y0 = w.a.y + uy * (o.s - o.width / 2), x1 = w.a.x + ux * (o.s + o.width / 2), y1 = w.a.y + uy * (o.s + o.width / 2); return <line key={o.id} x1={x0} y1={-y0} x2={x1} y2={-y1} stroke={o.kind === "door" ? "#f59e0b" : o.kind === "window" ? "#38bdf8" : "#ef4444"} strokeWidth={Math.max(3, w.thickness * 60)} strokeLinecap="butt" vectorEffect="non-scaling-stroke" onClick={(e) => { e.stopPropagation(); onSelect?.(o.id); }} />; })}</g>)}
        </g>}
      </svg>
      <div className="absolute left-2 top-2 flex gap-1.5"><button type="button" className="rounded-md border border-slate-600 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-200 hover:border-blue-500" onClick={() => setVb(null)}>Fit</button><button type="button" className="rounded-md border border-slate-600 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-200 hover:border-blue-500" onClick={() => setVb({ ...view, x: view.x + view.w * 0.1, y: view.y + view.h * 0.1, w: view.w * 0.8, h: view.h * 0.8 })} aria-label="Zoom in">＋</button><button type="button" className="rounded-md border border-slate-600 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-200 hover:border-blue-500" onClick={() => setVb({ ...view, x: view.x - view.w * 0.125, y: view.y - view.h * 0.125, w: view.w * 1.25, h: view.h * 1.25 })} aria-label="Zoom out">－</button></div>
      {!analysis && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400">Load a sample or upload a drawing to see its extracted geometry here.</p>}
    </div>
  );
}
