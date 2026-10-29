"use client";
import type { ReactNode } from "react";

/** Standard pitch markings (IFAB Laws: penalty area 16.5 x 40.32 m, goal area 5.5 x 18.32 m, mark 11 m, circle/arc radius 9.15 m) in metres. */
export function PitchLines({ length, width, stroke = "rgba(255,255,255,0.75)", sw = 0.22 }: { length: number; width: number; stroke?: string; sw?: number }) {
  const L = length, W = width, cy = W / 2, R = 9.15;
  const dx = 16.5 - 11, dy = Math.sqrt(R * R - dx * dx);
  const arc = (side: "l" | "r") => {
    const x0 = side === "l" ? 16.5 : L - 16.5; const sweep = side === "l" ? 1 : 0;
    return `M ${x0} ${cy - dy} A ${R} ${R} 0 0 ${sweep} ${x0} ${cy + dy}`;
  };
  const ln = { stroke, strokeWidth: sw, fill: "none" } as const;
  return (
    <g {...ln}>
      <rect x={0} y={0} width={L} height={W} />
      <line x1={L / 2} y1={0} x2={L / 2} y2={W} />
      <circle cx={L / 2} cy={cy} r={R} />
      <circle cx={L / 2} cy={cy} r={0.35} fill={stroke} />
      <rect x={0} y={cy - 20.16} width={16.5} height={40.32} />
      <rect x={L - 16.5} y={cy - 20.16} width={16.5} height={40.32} />
      <rect x={0} y={cy - 9.16} width={5.5} height={18.32} />
      <rect x={L - 5.5} y={cy - 9.16} width={5.5} height={18.32} />
      <circle cx={11} cy={cy} r={0.35} fill={stroke} />
      <circle cx={L - 11} cy={cy} r={0.35} fill={stroke} />
      <path d={arc("l")} />
      <path d={arc("r")} />
    </g>
  );
}

/** Pitch viewport: an SVG in metre coordinates with an optional canvas layer beneath it (used for heatmaps). */
export default function PitchDiagram({ length, width, children, under, label }: { length: number; width: number; children?: ReactNode; under?: ReactNode; label: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-emerald-900/60 bg-emerald-950" style={{ aspectRatio: `${length + 4} / ${width + 4}` }}>
      <div className="absolute" style={{ left: `${(2 / (length + 4)) * 100}%`, top: `${(2 / (width + 4)) * 100}%`, width: `${(length / (length + 4)) * 100}%`, height: `${(width / (width + 4)) * 100}%` }}>{under}</div>
      <svg viewBox={`-2 -2 ${length + 4} ${width + 4}`} className="absolute inset-0 h-full w-full" role="img" aria-label={label}>
        <PitchLines length={length} width={width} />
        {children}
      </svg>
    </div>
  );
}
