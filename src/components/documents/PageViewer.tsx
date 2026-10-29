"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LOW_CONF, SOURCE_STYLE, type Field, type Page } from "@/lib/documents/types";

export interface Layers { text: boolean; tables: boolean; fields: boolean }
interface Props { page: Page; src: string; layers: Layers; fields: Field[]; selItem: string | null; selField: string | null; matches: Set<string>; onItem: (id: string) => void; onField: (id: string) => void }

/** Page image with an SVG overlay in normalised page coordinates; zoom with the buttons or the wheel, pan by dragging. */
export default function PageViewer({ page, src, layers, fields, selItem, selField, matches, onItem, onField }: Props) {
  const box = useRef<HTMLDivElement>(null); const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null); const moved = useRef(false);
  const [z, setZ] = useState(1); const [off, setOff] = useState({ x: 0, y: 0 }); const [box_, setBox] = useState({ w: 600, h: 800 });
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);
  const fit = Math.min(box_.w / page.width_px, box_.h / page.height_px);
  const W = page.width_px * fit * z, H = page.height_px * fit * z;
  const reset = useCallback(() => { setZ(1); setOff({ x: 0, y: 0 }); }, []);
  useEffect(reset, [page.page, reset]);
  const zoom = (f: number) => setZ((v) => Math.max(0.5, Math.min(8, v * f)));
  const sw = 1.4 / Math.max(W, 1), hot = 3 / Math.max(W, 1);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-2 text-xs">
        <button className="rounded border border-slate-600 px-2 py-1 text-slate-200 hover:border-blue-500" onClick={() => zoom(1.25)} data-testid="zoom-in" aria-label="Zoom in">＋</button>
        <button className="rounded border border-slate-600 px-2 py-1 text-slate-200 hover:border-blue-500" onClick={() => zoom(0.8)} data-testid="zoom-out" aria-label="Zoom out">－</button>
        <button className="rounded border border-slate-600 px-2 py-1 text-slate-200 hover:border-blue-500" onClick={reset} data-testid="zoom-fit">Fit</button>
        <span className="tabular-nums text-slate-400" data-testid="zoom-level">{Math.round(z * 100)}%</span>
        <span className="ml-auto text-slate-400">Page {page.page} · <span style={{ color: SOURCE_STYLE[page.source].stroke }}>{page.source_label}</span> · {page.width_px}×{page.height_px}px</span>
      </div>
      <div ref={box} className="relative h-[70vh] min-h-[360px] overflow-hidden bg-slate-950" data-testid="viewer"
        onWheel={(e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 0.89); }}
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button")) return; drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; moved.current = false; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true; if (moved.current) setOff({ x: d.ox + dx, y: d.oy + dy }); }}
        onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
        <div className="absolute left-1/2 top-1/2" style={{ width: W, height: H, transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`Page ${page.page}`} className="absolute inset-0 h-full w-full select-none bg-white" draggable={false} data-testid="page-image" />
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" data-testid="overlay">
            {layers.tables && page.tables.map((t) => (
              <g key={t.id} data-testid="table-box" fill="none" stroke="#22c55e" strokeWidth={sw}>
                <rect x={t.bbox[0]} y={t.bbox[1]} width={t.bbox[2] - t.bbox[0]} height={t.bbox[3] - t.bbox[1]} strokeWidth={sw * 2} />
                {t.row_edges.slice(1, -1).map((y) => <line key={`r${y}`} x1={t.bbox[0]} x2={t.bbox[2]} y1={y} y2={y} strokeDasharray={`${sw * 4} ${sw * 3}`} opacity={0.7} />)}
                {t.col_edges.slice(1, -1).map((x) => <line key={`c${x}`} y1={t.bbox[1]} y2={t.bbox[3]} x1={x} x2={x} strokeDasharray={`${sw * 4} ${sw * 3}`} opacity={0.7} />)}
              </g>
            ))}
            {layers.text && page.items.map((it) => {
              const sel = it.id === selItem, m = matches.has(it.id), low = it.conf !== null && it.conf < LOW_CONF;
              return <rect key={it.id} data-testid="item-box" data-id={it.id} x={it.bbox[0]} y={it.bbox[1]} width={it.bbox[2] - it.bbox[0]} height={it.bbox[3] - it.bbox[1]} fill={sel || m ? "rgba(250,204,21,.28)" : "transparent"}
                stroke={sel ? "#facc15" : low ? "#ef4444" : SOURCE_STYLE[it.source].stroke} strokeWidth={sel || m ? hot : sw} className="cursor-pointer" onClick={() => { if (!moved.current) onItem(it.id); }}><title>{it.text}{it.conf !== null ? ` (confidence ${it.conf.toFixed(2)})` : " (PDF text layer)"}</title></rect>;
            })}
            {layers.fields && fields.filter((f) => f.page === page.page).map((f) => (
              <rect key={f.id} data-testid="field-box" x={f.bbox[0]} y={f.bbox[1]} width={f.bbox[2] - f.bbox[0]} height={f.bbox[3] - f.bbox[1]} fill={f.id === selField ? "rgba(168,85,247,.3)" : "rgba(168,85,247,.12)"} stroke="#a855f7" strokeWidth={f.id === selField ? hot : sw} strokeDasharray={f.bbox_approximate ? `${sw * 3} ${sw * 2}` : undefined} className="cursor-pointer" onClick={() => { if (!moved.current) onField(f.id); }}><title>{`${f.label ?? f.type}: ${f.current_value}${f.bbox_approximate ? " (box approximate)" : ""}`}</title></rect>
            ))}
          </svg>
        </div>
      </div>
      <p className="border-t border-slate-800 p-2 text-[11px] text-slate-400"><span style={{ color: SOURCE_STYLE.embedded_text.stroke }}>■</span> PDF text layer · <span style={{ color: SOURCE_STYLE.ocr_model.stroke }}>■</span> OCR · <span className="text-red-400">■</span> OCR confidence below {LOW_CONF} · <span className="text-green-400">■</span> table · <span className="text-purple-400">■</span> field (dashed = box position estimated)</p>
    </div>
  );
}
