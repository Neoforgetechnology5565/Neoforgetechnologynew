"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { bbox, type Ent } from "@/lib/demo-cad-data";

export type VB = { x: number; y: number; w: number; h: number };

/** Pan / zoom / fit for an SVG drawing viewport. Wheel zooms around the cursor; drag pans in Pan mode (or with Shift / middle button). */
export function useCadView(fitBox: VB, yBase = 0) {
  const svg = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<VB>(fitBox);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const fitRef = useRef(fitBox);
  fitRef.current = fitBox;

  const toSvg = (cx: number, cy: number) => { const s = svg.current!, p = new DOMPoint(cx, cy).matrixTransform(s.getScreenCTM()!.inverse()); return { x: p.x, y: p.y }; };
  const fit = useCallback(() => {
    const s = svg.current, F = fitRef.current; if (!s) return setVb(F);
    const a = (s.clientWidth || 1) / (s.clientHeight || 1), w = Math.max(F.w, F.h * a), h = w / a;
    setVb({ x: F.x + F.w / 2 - w / 2, y: F.y + F.h / 2 - h / 2, w, h });
  }, []);
  const zoomAt = useCallback((f: number, c?: { x: number; y: number }) => setVb((v) => { const p = c ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 }; return { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w: v.w * f, h: v.h * f }; }), []);
  const zoomTo = (e: Ent) => { const b = bbox(e), s = svg.current!, a = (s.clientWidth || 1) / (s.clientHeight || 1); const w = Math.max(b.w * 2.2, 5), h = Math.max(b.h * 2.2, 5 / a); const W = Math.max(w, h * a), H = W / a; setVb({ x: b.x + b.w / 2 - W / 2, y: b.y + b.h / 2 - H / 2, w: W, h: H }); };
  useEffect(() => { fit(); }, [fit, fitBox]);
  useEffect(() => {
    const s = svg.current; if (!s) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, toSvg(e.clientX, e.clientY)); };
    s.addEventListener("wheel", wheel, { passive: false });
    return () => s.removeEventListener("wheel", wheel);
  }, [zoomAt]);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; moved.current = false; },
    onPointerMove: (e: React.PointerEvent) => {
      const p = toSvg(e.clientX, e.clientY); setCursor([p.x, yBase - p.y]);
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (!moved.current && Math.hypot(dx, dy) > 3) { moved.current = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); }
      if (moved.current && (tool === "pan" || e.buttons === 4 || e.shiftKey)) { const k = svg.current!.getScreenCTM()!.a; setVb((v) => ({ ...v, x: v.x - dx / k, y: v.y - dy / k })); drag.current = { x: e.clientX, y: e.clientY }; }
    },
    onPointerUp: () => { drag.current = null; },
  };
  return { svg, vb, setVb, tool, setTool, cursor, fit, zoomAt, zoomTo, handlers, moved, zoomPct: Math.round((fitBox.w / vb.w) * 100) };
}
