"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import type { Region, XY } from "@/lib/roof/types";

export interface Layers { mask: boolean; probability: boolean; outlines: boolean; edges: boolean; labels: boolean }
export type Tool = "select" | "reference" | "quad" | "trace";
export interface UserShape { id: number; name: string; points: XY[] }
export interface ViewerHandle { fit(): void }
interface Props {
  imageUrl: string; maskUrl?: string; probUrl?: string; regions: Region[]; layers: Layers; selected: number | null; onSelect: (id: number | null) => void; tool: Tool; onPoints: (pts: XY[]) => void;
  reference: [XY, XY] | null; quad: XY[] | null; userShapes: UserShape[]; selectedUser: number | null; label: (r: Region) => string; userLabel: (s: UserShape) => string; showOriginalOnly: boolean;
}
const NEED: Record<Tool, number> = { select: 0, reference: 2, quad: 4, trace: Infinity };
const inside = (p: XY, poly: XY[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
const centroid = (p: XY[]): XY => [p.reduce((a, b) => a + b[0], 0) / p.length, p.reduce((a, b) => a + b[1], 0) / p.length];

function tint(src: HTMLImageElement, kind: "mask" | "prob"): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = src.naturalWidth; c.height = src.naturalHeight; const g = c.getContext("2d")!; g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height); const a = d.data;
  for (let i = 0; i < a.length; i += 4) { const v = a[i] / 255; if (kind === "mask") { a[i] = 255; a[i + 1] = 90; a[i + 2] = 40; a[i + 3] = v > 0.5 ? 110 : 0; } else { a[i] = 255; a[i + 1] = 200 * (1 - v); a[i + 2] = 40; a[i + 3] = Math.round(190 * v); } }
  g.putImageData(d, 0, 0); return c;
}

const RoofViewer = forwardRef<ViewerHandle, Props>(function RoofViewer(p, ref) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null); const maskC = useRef<HTMLCanvasElement | null>(null), probC = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ s: 1, tx: 0, ty: 0 }); const [, bump] = useState(0); const draft = useRef<XY[]>([]); const props = useRef(p); props.current = p;
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null); const [ready, setReady] = useState(false);
  const redraw = useCallback(() => bump((n) => n + 1), []);
  const fit = useCallback(() => { const b = box.current, im = img.current; if (!b || !im) return; const s = Math.min(b.clientWidth / im.naturalWidth, b.clientHeight / im.naturalHeight); view.current = { s, tx: (b.clientWidth - im.naturalWidth * s) / 2, ty: (b.clientHeight - im.naturalHeight * s) / 2 }; redraw(); }, [redraw]);
  useImperativeHandle(ref, () => ({ fit }), [fit]);
  const load = (url: string | undefined, set: (i: HTMLImageElement | null) => void) => { if (!url) { set(null); return; } const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => { set(i); redraw(); }; i.onerror = () => set(null); i.src = url; };
  useEffect(() => { setReady(false); load(p.imageUrl, (i) => { img.current = i; setReady(!!i); if (i) requestAnimationFrame(fit); }); }, [p.imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(p.maskUrl, (i) => { maskC.current = i ? tint(i, "mask") : null; }); }, [p.maskUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(p.probUrl, (i) => { probC.current = i ? tint(i, "prob") : null; }); }, [p.probUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { draft.current = []; redraw(); }, [p.tool, redraw]);
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => { fit(); }); ro.observe(b); return () => ro.disconnect(); }, [fit]);

  // drawing -------------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const c = cv.current, b = box.current, im = img.current; if (!c || !b) return; const dpr = window.devicePixelRatio || 1, W = b.clientWidth, H = b.clientHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; c.style.width = W + "px"; c.style.height = H + "px"; }
    const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); if (!im) return; const { s, tx, ty } = view.current; const L = props.current.layers;
    g.imageSmoothingEnabled = s < 3; g.save(); g.translate(tx, ty); g.scale(s, s); g.drawImage(im, 0, 0);
    if (!p.showOriginalOnly) {
      if (L.probability && probC.current) g.drawImage(probC.current, 0, 0); if (L.mask && maskC.current) g.drawImage(maskC.current, 0, 0);
      const lw = 2 / s;
      for (const r of p.regions) {
        const sel = r.id === p.selected; const poly = r.polygon;
        if (L.outlines || sel) { g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (sel) { g.fillStyle = "rgba(250,204,21,0.22)"; g.fill(); } g.lineWidth = (sel ? 3.2 : 1.8) / s; g.strokeStyle = sel ? "#facc15" : "#fde68a"; g.stroke(); }
        if (L.outlines && s > 1.2) { g.fillStyle = "#fde68a"; for (const [x, y] of poly) g.fillRect(x - 1.5 / s, y - 1.5 / s, 3 / s, 3 / s); }
        if (L.edges && (sel || p.selected === null)) for (const e of r.features.interior_edge_candidates) { g.beginPath(); g.moveTo(e.p1[0], e.p1[1]); g.lineTo(e.p2[0], e.p2[1]); g.setLineDash([5 / s, 3 / s]); g.lineWidth = lw; g.strokeStyle = "#38bdf8"; g.stroke(); g.setLineDash([]); }
      }
      for (const u of p.userShapes) { g.beginPath(); u.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = u.id === p.selectedUser ? "rgba(52,211,153,0.28)" : "rgba(52,211,153,0.12)"; g.fill(); g.lineWidth = (u.id === p.selectedUser ? 3.2 : 2) / s; g.strokeStyle = "#34d399"; g.stroke(); }
      if (p.reference) { g.beginPath(); g.moveTo(...p.reference[0]); g.lineTo(...p.reference[1]); g.lineWidth = 2.5 / s; g.strokeStyle = "#22d3ee"; g.stroke(); for (const [x, y] of p.reference) { g.beginPath(); g.arc(x, y, 4 / s, 0, 7); g.fillStyle = "#22d3ee"; g.fill(); } }
      if (p.quad && p.quad.length === 4) { g.beginPath(); p.quad.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.setLineDash([8 / s, 5 / s]); g.lineWidth = 2.2 / s; g.strokeStyle = "#f472b6"; g.stroke(); g.setLineDash([]); }
      const d = draft.current; if (d.length) { g.beginPath(); d.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.lineWidth = 2 / s; g.strokeStyle = "#fff"; g.stroke(); for (const [x, y] of d) { g.beginPath(); g.arc(x, y, 4 / s, 0, 7); g.fillStyle = "#fff"; g.fill(); } }
    }
    g.restore();
    if (!p.showOriginalOnly && L.labels) { g.font = "600 13px Georgia, serif"; g.textAlign = "center"; for (const r of p.regions) { const t = p.label(r); if (!t) continue; const [cx, cy] = centroid(r.polygon); const x = cx * s + tx, y = cy * s + ty; if (x < 0 || y < 0 || x > W || y > H) continue; const w = g.measureText(t).width + 8; g.fillStyle = "rgba(11,18,32,0.82)"; g.fillRect(x - w / 2, y - 10, w, 20); g.fillStyle = "#fde68a"; g.fillText(t, x, y + 4); } for (const u of p.userShapes) { const [cx, cy] = centroid(u.points); const t = p.userLabel(u); const x = cx * s + tx, y = cy * s + ty; const w = g.measureText(t).width + 8; g.fillStyle = "rgba(11,18,32,0.82)"; g.fillRect(x - w / 2, y - 10, w, 20); g.fillStyle = "#6ee7b7"; g.fillText(t, x, y + 4); } }
  });

  // interaction -----------------------------------------------------------------------------------------------------------------
  const toImg = (e: { clientX: number; clientY: number }): XY => { const r = box.current!.getBoundingClientRect(); const { s, tx, ty } = view.current; return [(e.clientX - r.left - tx) / s, (e.clientY - r.top - ty) / s]; };
  const down = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, tx: view.current.tx, ty: view.current.ty, moved: false }; (e.target as Element).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.hypot(dx, dy) > 4) d.moved = true; if (d.moved) { view.current.tx = d.tx + dx; view.current.ty = d.ty + dy; redraw(); } };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; if (!d || d.moved) return; const pt = toImg(e); const im = img.current; if (!im || pt[0] < 0 || pt[1] < 0 || pt[0] > im.naturalWidth || pt[1] > im.naturalHeight) return;
    const t = props.current.tool;
    if (t === "select") { const hit = [...props.current.regions].filter((r) => inside(pt, r.polygon)).sort((a, b) => a.mask_area_px - b.mask_area_px)[0]; props.current.onSelect(hit ? hit.id : null); return; }
    draft.current = [...draft.current, pt]; if (draft.current.length >= NEED[t] && NEED[t] !== Infinity) { const pts = draft.current; draft.current = []; props.current.onPoints(pts); } redraw();
  };
  const finishTrace = () => { if (props.current.tool === "trace" && draft.current.length >= 3) { const pts = draft.current; draft.current = []; props.current.onPoints(pts); redraw(); } };
  const wheel = (e: React.WheelEvent) => { const b = box.current!.getBoundingClientRect(); const mx = e.clientX - b.left, my = e.clientY - b.top; const v = view.current; const k = Math.exp(-e.deltaY * 0.0015); const ns = Math.min(40, Math.max(0.05, v.s * k)); v.tx = mx - ((mx - v.tx) / v.s) * ns; v.ty = my - ((my - v.ty) / v.s) * ns; v.s = ns; redraw(); };
  const zoom = (k: number) => { const b = box.current!; const v = view.current; const mx = b.clientWidth / 2, my = b.clientHeight / 2; const ns = Math.min(40, Math.max(0.05, v.s * k)); v.tx = mx - ((mx - v.tx) / v.s) * ns; v.ty = my - ((my - v.ty) / v.s) * ns; v.s = ns; redraw(); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Enter") finishTrace(); if (e.key === "Escape") { draft.current = []; redraw(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }); // eslint-disable-line react-hooks/exhaustive-deps
  const need = NEED[p.tool];
  return (
    <div className="relative">
      <div ref={box} className={`relative h-[62vh] min-h-[22rem] w-full touch-none overflow-hidden rounded-lg bg-black ${p.tool === "select" ? "cursor-grab" : "cursor-crosshair"}`} data-testid="viewer" onWheel={wheel}>
        <canvas ref={cv} data-testid="viewer-canvas" className="absolute inset-0" onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={finishTrace} />
        {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Loading image…</p>}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          {[["+", () => zoom(1.4), "Zoom in"], ["−", () => zoom(1 / 1.4), "Zoom out"], ["⤢", fit, "Fit to window"]].map(([l, f, a]) => <button key={a as string} type="button" aria-label={a as string} onClick={f as () => void} className="h-8 w-8 rounded border border-slate-600 bg-slate-900/90 text-base text-slate-100 hover:border-amber-500">{l as string}</button>)}
        </div>
        {p.tool !== "select" && <p className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-slate-900/90 px-3 py-1.5 text-xs text-slate-100" data-testid="tool-hint">{p.tool === "reference" ? "Click the two ends of a length you know." : p.tool === "quad" ? `Click the four corners of a rectangle of known size on the roof plane, in order around it (${draft.current.length}/4).` : `Click the corners of the roof outline (${draft.current.length} so far); double-click or press Enter to finish, Esc to cancel.`}{need === Infinity && draft.current.length >= 3 && <button type="button" className="pointer-events-auto ml-2 rounded bg-amber-600 px-2 py-0.5 font-semibold" onClick={finishTrace}>Finish outline</button>}</p>}
      </div>
    </div>
  );
});
export default RoofViewer;
