"use client";
import { useEffect, useRef } from "react";

/** Draws a normalised (0..1) heat grid. Cells with value 0 stay transparent so the pitch markings remain visible. */
export default function HeatCanvas({ grid, rows, cols, dim = false }: { grid: Float64Array; rows: number; cols: number; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = cols; c.height = rows;
    const g = c.getContext("2d"); if (!g) return;
    const img = g.createImageData(cols, rows);
    for (let i = 0; i < grid.length; i++) {
      const v = Math.min(1, Math.max(0, grid[i])); const o = i * 4;
      if (v < 0.02) { img.data[o + 3] = 0; continue; }
      // blue -> cyan -> yellow -> red
      const r = v < 0.5 ? 0 : Math.round(255 * Math.min(1, (v - 0.5) * 2)); const gr = v < 0.5 ? Math.round(255 * v * 2) : Math.round(255 * (1 - Math.max(0, (v - 0.75) * 4)));
      const b = v < 0.5 ? Math.round(255 * (1 - v * 2) + 80) : 0;
      img.data[o] = r; img.data[o + 1] = gr; img.data[o + 2] = Math.min(255, b); img.data[o + 3] = Math.round(70 + 170 * v);
    }
    g.putImageData(img, 0, 0);
  }, [grid, rows, cols]);
  return <canvas ref={ref} data-testid="heat-canvas" className="h-full w-full" style={{ imageRendering: "auto", opacity: dim ? 0.35 : 1 }} aria-hidden />;
}
