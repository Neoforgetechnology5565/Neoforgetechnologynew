"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import type { Region } from "@/lib/defects/types";

export interface ViewerHandle { fit: () => void; focus: (r: Region) => void; zoomBy: (f: number) => void; state: () => { z: number; x: number; y: number } }
export interface ViewerProps {
  width: number; height: number; originalUrl: string; annotatedUrl: string; heatUrl: string; datasetUrl: string | null; mode: "original" | "annotated";
  heat: boolean; heatOpacity: number; boxes: boolean; dataset: boolean; regions: Region[]; hidden: Set<number>; selected: number | null; onSelect: (id: number | null) => void;
}

/** Zoomable, pannable image with overlays drawn in image-pixel coordinates, so a box always sits on the pixels the model flagged. */
const ImageViewer = forwardRef<ViewerHandle, ViewerProps>(function ImageViewer(p, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ z: 1, x: 0, y: 0 });
  const tr = useRef(t); tr.current = t;
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const fit = useCallback(() => {
    const b = box.current; if (!b) return; const z = Math.min(b.clientWidth / p.width, b.clientHeight / p.height);
    setT({ z, x: (b.clientWidth - p.width * z) / 2, y: (b.clientHeight - p.height * z) / 2 });
  }, [p.width, p.height]);
  useEffect(() => { fit(); const ro = new ResizeObserver(() => { if (tr.current.z <= 0 || !box.current) return; }); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, [fit, p.originalUrl]);
  const zoomAt = useCallback((f: number, cx: number, cy: number) => setT((s) => { const z = Math.min(40, Math.max(0.05, s.z * f)); const k = z / s.z; return { z, x: cx - (cx - s.x) * k, y: cy - (cy - s.y) * k }; }), []);
  useImperativeHandle(ref, () => ({
    fit, state: () => tr.current,
    zoomBy: (f) => { const b = box.current; if (b) zoomAt(f, b.clientWidth / 2, b.clientHeight / 2); },
    focus: (r) => { const b = box.current; if (!b) return; const [x, y, w, h] = r.bbox; const z = Math.min(8, Math.max(0.2, 0.5 * Math.min(b.clientWidth / w, b.clientHeight / h))); setT({ z, x: b.clientWidth / 2 - (x + w / 2) * z, y: b.clientHeight / 2 - (y + h / 2) * z }); },
  }), [fit, zoomAt]);
  useEffect(() => { // non-passive wheel listener so the page does not scroll while zooming
    const b = box.current; if (!b) return;
    const h = (e: WheelEvent) => { e.preventDefault(); const r = b.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); };
    b.addEventListener("wheel", h, { passive: false }); return () => b.removeEventListener("wheel", h);
  }, [zoomAt]);
  const sw = 2 / t.z;
  return (
    <div ref={box} className="relative h-[28rem] w-full touch-none select-none overflow-hidden rounded-md border border-slate-700 bg-[repeating-conic-gradient(#0f172a_0%_25%,#111c33_0%_50%)] [background-size:20px_20px] sm:h-[34rem]" data-testid="viewer"
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button")) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; }}
      onPointerMove={(e) => { const d = drag.current; if (d) setT((s) => ({ ...s, x: d.tx + e.clientX - d.x, y: d.ty + e.clientY - d.y })); }}
      onPointerUp={() => { drag.current = null; }} onDoubleClick={fit} role="img" aria-label="Part image with defect overlays. Scroll to zoom, drag to pan, double-click to fit.">
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: p.width, height: p.height, transform: `translate(${t.x}px, ${t.y}px) scale(${t.z})` }}>
        {/* eslint-disable @next/next/no-img-element */}
        <img src={p.mode === "annotated" ? p.annotatedUrl : p.originalUrl} alt="" width={p.width} height={p.height} draggable={false} className="absolute left-0 top-0 max-w-none" data-testid="viewer-image" />
        {p.mode === "original" && p.heat && <img src={p.heatUrl} alt="" width={p.width} height={p.height} draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none" style={{ opacity: p.heatOpacity }} data-testid="viewer-heat" />}
        {p.mode === "original" && p.dataset && p.datasetUrl && <img src={p.datasetUrl} alt="" width={p.width} height={p.height} draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none" data-testid="viewer-dataset" />}
        {/* eslint-enable @next/next/no-img-element */}
        {p.mode === "original" && p.boxes && (
          <svg className="absolute left-0 top-0" width={p.width} height={p.height} viewBox={`0 0 ${p.width} ${p.height}`} data-testid="viewer-svg">
            {p.regions.filter((r) => !p.hidden.has(r.id)).map((r) => {
              const col = r.status === "flagged" ? "#ef4444" : "#f59e0b"; const [x, y, w, h] = r.bbox; const sel = p.selected === r.id;
              return (
                <g key={r.id} onPointerDown={(e) => e.stopPropagation()} onClick={() => p.onSelect(sel ? null : r.id)} className="cursor-pointer" data-testid={`box-${r.id}`}>
                  <rect x={x} y={y} width={w} height={h} fill={sel ? `${col}22` : "transparent"} stroke={col} strokeWidth={sel ? sw * 2 : sw} />
                  <rect x={x} y={Math.max(0, y - 18 / t.z)} width={64 / t.z} height={18 / t.z} fill={col} /><text x={x + 4 / t.z} y={Math.max(0, y - 18 / t.z) + 13 / t.z} fontSize={12 / t.z} fill="#fff" style={{ fontFamily: "Georgia, serif" }}>#{r.id} {r.score_ratio.toFixed(2)}×</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1 rounded-md bg-slate-950/80 p-1 text-xs text-slate-200">
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-800" onClick={() => zoomAt(1.4, (box.current?.clientWidth ?? 0) / 2, (box.current?.clientHeight ?? 0) / 2)} aria-label="Zoom in" data-testid="zoom-in">＋</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-800" onClick={() => zoomAt(1 / 1.4, (box.current?.clientWidth ?? 0) / 2, (box.current?.clientHeight ?? 0) / 2)} aria-label="Zoom out" data-testid="zoom-out">－</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-800" onClick={fit} data-testid="zoom-fit">Fit</button>
        <span className="px-1 py-1 tabular-nums text-slate-400" data-testid="zoom-level">{Math.round(t.z * 100)}%</span>
      </div>
    </div>
  );
});
export default ImageViewer;
