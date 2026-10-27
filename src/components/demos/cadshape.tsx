import type { ReactNode } from "react";
import { len, type Ent } from "@/lib/demo-cad-data";

/** SVG rendering of one CAD object (metres, y down). Shared by the AutoCAD and BricsCAD demos. */
export function Shape({ e, color, sw = 1.25, extra }: { e: Ent; color: string; sw?: number; extra?: ReactNode }) {
  const p = { stroke: color, strokeWidth: sw, fill: "none", vectorEffect: "non-scaling-stroke" as const, strokeLinejoin: "round" as const };
  const hit = { stroke: "transparent", strokeWidth: 12, fill: "none", vectorEffect: "non-scaling-stroke" as const };
  switch (e.type) {
    case "wall": { const t = e.t ?? 0.3, h = e.y1 === e.y2; const x = Math.min(e.x1, e.x2!), y = Math.min(e.y1, e.y2!);
      return <rect x={h ? x : e.x1 - t / 2} y={h ? e.y1 - t / 2 : y} width={h ? Math.max(len(e), 0.02) : t} height={h ? t : Math.max(len(e), 0.02)} {...p} fill={`${color}22`} />; }
    case "door": { const w = e.w!, d = e.dir ?? 1;
      if (e.horiz) { const hx = e.x1 - w / 2; return <g><path d={`M${hx} ${e.y1} L${hx} ${e.y1 + d * w} M${hx} ${e.y1 + d * w} A${w} ${w} 0 0 ${d === 1 ? 0 : 1} ${e.x1 + w / 2} ${e.y1}`} {...p} /><line x1={hx} y1={e.y1} x2={e.x1 + w / 2} y2={e.y1} {...hit} /></g>; }
      const hy = e.y1 - w / 2; return <g><path d={`M${e.x1} ${hy} L${e.x1 + d * w} ${hy} M${e.x1 + d * w} ${hy} A${w} ${w} 0 0 ${d === 1 ? 1 : 0} ${e.x1} ${e.y1 + w / 2}`} {...p} /><line x1={e.x1} y1={hy} x2={e.x1} y2={e.y1 + w / 2} {...hit} /></g>; }
    case "window": { const t = e.t ?? 0.3, h = e.y1 === e.y2!;
      return h ? <g><rect x={e.x1} y={e.y1 - t / 2} width={len(e)} height={t} {...p} /><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y1} {...p} /></g> : <g><rect x={e.x1 - t / 2} y={e.y1} width={t} height={len(e)} {...p} /><line x1={e.x1} y1={e.y1} x2={e.x1} y2={e.y2} {...p} /></g>; }
    case "room": return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} strokeDasharray="0.25 0.15" fill="rgba(85,181,43,0.04)" />{extra}</g>;
    case "dim": { const off = e.h ?? 1, horiz = e.y1 === e.y2!, L = len(e) * 1000;
      if (horiz) { const y = e.y1 + off; return <g><line x1={e.x1} y1={e.y1} x2={e.x1} y2={y} {...p} strokeWidth={0.7} /><line x1={e.x2} y1={e.y1} x2={e.x2} y2={y} {...p} strokeWidth={0.7} /><line x1={e.x1} y1={y} x2={e.x2} y2={y} {...p} /><line x1={e.x1} y1={y} x2={e.x2} y2={y} {...hit} /><text x={(e.x1 + e.x2!) / 2} y={y - 0.12} fontSize={0.28} fill={color} textAnchor="middle">{L.toFixed(0)}</text></g>; }
      const x = e.x1 + off; return <g><line x1={e.x1} y1={e.y1} x2={x} y2={e.y1} {...p} strokeWidth={0.7} /><line x1={e.x1} y1={e.y2} x2={x} y2={e.y2} {...p} strokeWidth={0.7} /><line x1={x} y1={e.y1} x2={x} y2={e.y2} {...p} /><line x1={x} y1={e.y1} x2={x} y2={e.y2} {...hit} /><text transform={`translate(${x - 0.12} ${(e.y1 + e.y2!) / 2}) rotate(-90)`} fontSize={0.28} fill={color} textAnchor="middle">{L.toFixed(0)}</text></g>; }
    case "text": return <text x={e.x1} y={e.y1} fontSize={e.size ?? 0.3} fill={color} textAnchor={e.y1 < -1 ? "start" : "middle"} style={{ cursor: "pointer" }}>{(e.text ?? "").split("\n").map((l, i) => <tspan key={i} x={e.x1} dy={i ? (e.size ?? 0.3) * 1.3 : 0}>{l}</tspan>)}</text>;
    case "furn": return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} fill={`${color}18`} />{(e.w ?? 0) >= 2 && <text x={e.x1 + e.w! / 2} y={e.y1 + e.h! / 2 + 0.1} fontSize={0.22} fill={color} textAnchor="middle">{e.name}</text>}</g>;
    case "col": return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} fill={`${color}66`} /><path d={`M${e.x1} ${e.y1} l${e.w} ${e.h} M${e.x1 + e.w!} ${e.y1} l${-e.w!} ${e.h}`} {...p} strokeWidth={0.7} /></g>;
    case "grid": return <g><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...p} strokeDasharray="0.6 0.2 0.1 0.2" /><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...hit} /><circle cx={e.x1} cy={e.y1 - 0.4} r={0.4} {...p} /><text x={e.x1} y={e.y1 - 0.3} fontSize={0.4} fill={color} textAnchor="middle">{e.text}</text></g>;
    case "line": return <g><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...p} strokeDasharray={e.name === "center" ? "0.6 0.2 0.1 0.2" : undefined} /><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...hit} /></g>;
    case "rect": return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} fill={`${color}${e.name === "solid" ? "55" : "14"}`} />{e.text && <text x={e.x1 + e.w! / 2} y={e.y1 + e.h! / 2 + 0.1} fontSize={0.22} fill={color} textAnchor="middle">{e.text}</text>}</g>;
    case "circle": return <g><circle cx={e.x1} cy={e.y1} r={e.w ?? 0.15} {...p} /><circle cx={e.x1} cy={e.y1} r={0.5} {...hit} /></g>;
    default: { const lines = (e.text ?? "").split("|"); return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} /><line x1={e.x1} y1={e.y1 + 1} x2={e.x1 + e.w!} y2={e.y1 + 1} {...p} strokeWidth={0.7} />{lines.map((l, i) => <text key={i} x={e.x1 + 0.3} y={e.y1 + 0.7 + i * 0.7} fontSize={i === 0 ? 0.5 : 0.3} fill={color}>{l}</text>)}</g>; }
  }
}

