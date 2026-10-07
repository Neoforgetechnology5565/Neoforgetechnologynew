import type { DivisionSlug } from "@/lib/divisions";

/** Abstract technical hero: detection boxes over a CAD wireframe with a data-flow trace. No stock imagery. */
export function HeroVisual() {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden border border-paper/15 bg-ink-900 grid-bg" aria-hidden>
      <svg viewBox="0 0 640 480" className="absolute inset-0 h-full w-full">
        <g stroke="#f4f5f2" strokeOpacity=".35" fill="none" strokeWidth="1">
          <path d="M120 330 L260 400 L430 330 L290 260 Z" />
          <path d="M120 330 V210 L260 280 V400" /><path d="M430 330 V210 L290 140 L120 210" />
          <path d="M290 260 V140" /><path d="M260 280 L430 210" strokeDasharray="3 5" />
        </g>
        <g fill="none" strokeWidth="1.5">
          <rect x="365" y="70" width="170" height="120" stroke="#35e0c2" />
          <rect x="60" y="90" width="120" height="86" stroke="#ff6a1a" />
          <path d="M365 70h14M365 70v14M535 190h-14M535 190v-14" stroke="#35e0c2" strokeWidth="3" />
        </g>
        <g fontFamily="var(--font-geist-mono), monospace" fontSize="11">
          <rect x="365" y="52" width="104" height="17" fill="#35e0c2" /><text x="371" y="64" fill="#06080c">defect 0.97</text>
          <rect x="60" y="72" width="92" height="17" fill="#ff6a1a" /><text x="66" y="84" fill="#06080c">tracked #14</text>
        </g>
        <path d="M20 440 C140 440 160 380 260 390 S420 450 620 400" stroke="#ff6a1a" strokeWidth="1.5" fill="none" strokeDasharray="6 6" className="animate-dash" />
        {[[260, 390], [430, 330], [120, 330], [290, 260]].map(([x, y]) => (<circle key={x} cx={x} cy={y} r="4" fill="#ff6a1a" className="animate-pulseDot" />))}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 h-20 animate-scan bg-gradient-to-b from-transparent via-signal/15 to-transparent" />
      <div className="absolute bottom-3 left-3 font-mono text-[10px] uppercase tracking-widest text-paper/50">frame 04812 · 28 fps · infer 6.1 ms</div>
    </div>
  );
}

/** Horizontal flow diagram — Video → AI Model → Detection → Analytics, etc. */
export function Pipeline({ steps, light }: { steps: string[]; light?: boolean }) {
  const line = light ? "border-ink-950/20" : "border-paper/20";
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-stretch" aria-label="Solution flow">
      {steps.map((s, i) => (
        <li key={s + i} className="flex flex-1 items-stretch sm:items-center">
          <div className={`flex-1 border ${line} px-4 py-4 sm:py-5`}>
            <p className="font-mono text-[10px] uppercase tracking-widest text-forge">0{i + 1}</p>
            <p className="mt-1 font-medium">{s}</p>
          </div>
          {i < steps.length - 1 && (
            <span aria-hidden className="hidden w-8 shrink-0 items-center justify-center text-forge sm:flex">
              <svg width="28" height="10" viewBox="0 0 28 10" fill="none" stroke="currentColor"><path d="M0 5h24M20 1l4 4-4 4" strokeDasharray="3 3" className="animate-dash" /></svg>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Per-division line-art used on division cards. */
export function DivisionGlyph({ slug }: { slug: DivisionSlug }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.4 } as const;
  return (
    <svg viewBox="0 0 120 80" className="h-20 w-32" aria-hidden>
      {slug === "computer-vision" && (<g {...p}><rect x="10" y="12" width="100" height="56" /><rect x="34" y="26" width="42" height="30" strokeDasharray="4 3" /><circle cx="86" cy="28" r="7" /><path d="M10 52l24-14 20 12 26-18 30 20" /></g>)}
      {slug === "crm-hrm-erp" && (<g {...p}><rect x="8" y="30" width="26" height="20" /><rect x="47" y="12" width="26" height="20" /><rect x="47" y="48" width="26" height="20" /><rect x="86" y="30" width="26" height="20" /><path d="M34 40h6l7-18M34 40h6l7 18M73 22l13 18M73 58l13-18" /></g>)}
      {slug === "cad-bim" && (<g {...p}><path d="M60 10l44 20v32L60 72 16 62V30z" /><path d="M16 30l44 20 44-20M60 50v22" /><path d="M60 10v40" strokeDasharray="3 3" /></g>)}
    </svg>
  );
}
