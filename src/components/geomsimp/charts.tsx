"use client";
/** Small SVG charts. Every bar is drawn from a value passed in; nothing is decorative. */
const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : n >= 10 ? n.toFixed(1) : n.toFixed(2));

export interface Bar { label: string; value: number; color: string }
/** Horizontal bars. `log` uses a log10 axis so 21,000 and 130 can share one chart; the axis is labelled when it is on. */
export function HBars({ bars, unit = "", log = false, testid }: { bars: Bar[]; unit?: string; log?: boolean; testid?: string }) {
  const max = Math.max(...bars.map((b) => b.value), 1), sc = (v: number) => (log ? Math.log10(Math.max(v, 1) + 1) / Math.log10(max + 1) : v / max);
  return (
    <div data-testid={testid} className="space-y-2" role="img" aria-label={bars.map((b) => `${b.label}: ${fmt(b.value)}${unit}`).join("; ")}>
      {bars.map((b) => (
        <div key={b.label} className="text-[13px]">
          <div className="mb-0.5 flex justify-between text-slate-300"><span>{b.label}</span><span className="font-mono text-slate-100">{fmt(b.value)}{unit}</span></div>
          <div className="h-3 rounded bg-slate-800"><div className="h-3 rounded" style={{ width: `${Math.max(1.5, sc(b.value) * 100)}%`, background: b.color }} /></div>
        </div>
      ))}
      {log && <p className="text-[13px] text-slate-500">Logarithmic scale: bar length compares orders of magnitude, not proportions.</p>}
    </div>
  );
}

export interface Group { label: string; a: number; b: number }
/** Paired vertical bars (before / after) per group, on a log axis. */
export function PairedBars({ groups, aLabel, bLabel, testid }: { groups: Group[]; aLabel: string; bLabel: string; testid?: string }) {
  const W = 380, H = 200, pad = 30, max = Math.max(...groups.flatMap((g) => [g.a, g.b]), 1), y = (v: number) => H - pad - (Math.log10(v + 1) / Math.log10(max + 1)) * (H - pad - 14), bw = (W - 20) / groups.length;
  return (
    <svg data-testid={testid} viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label={`${aLabel} and ${bLabel} by category`}>
      {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1={10} x2={W - 10} y1={H - pad - t * (H - pad - 14)} y2={H - pad - t * (H - pad - 14)} stroke="#1e293b" />)}
      {groups.map((g, i) => (
        <g key={g.label} transform={`translate(${10 + i * bw},0)`}>
          <rect x={bw * 0.14} width={bw * 0.32} y={y(g.a)} height={H - pad - y(g.a)} fill="#475569"><title>{`${g.label} ${aLabel}: ${g.a.toLocaleString()}`}</title></rect>
          <rect x={bw * 0.5} width={bw * 0.32} y={y(g.b)} height={H - pad - y(g.b)} fill="#22d3ee"><title>{`${g.label} ${bLabel}: ${g.b.toLocaleString()}`}</title></rect>
          <text x={bw * 0.3} y={y(g.a) - 3} textAnchor="middle" fontSize="10" fill="#94a3b8">{g.a >= 1000 ? `${(g.a / 1000).toFixed(1)}k` : g.a}</text>
          <text x={bw * 0.66} y={y(g.b) - 3} textAnchor="middle" fontSize="10" fill="#67e8f9">{g.b}</text>
          <text x={bw * 0.48} y={H - 12} textAnchor="middle" fontSize="11" fill="#cbd5e1">{g.label}</text>
        </g>
      ))}
      <g fontSize="11" fill="#cbd5e1"><rect x={W - 200} y={H + 4} width={9} height={9} fill="#475569" /><text x={W - 187} y={H + 13}>{aLabel}</text><rect x={W - 100} y={H + 4} width={9} height={9} fill="#22d3ee" /><text x={W - 87} y={H + 13}>{bLabel}</text></g>
      <text x={10} y={H + 13} fontSize="11" fill="#94a3b8">log scale</text>
    </svg>
  );
}

/** One stacked bar per incremental run: reused from cache vs reprocessed. */
export function CacheBars({ runs, testid }: { runs: { label: string; hits: number; re: number }[]; testid?: string }) {
  if (!runs.length) return <p className="text-[13px] text-slate-400" data-testid={testid}>No incremental update yet. Modify an element on the Incremental Updates page.</p>;
  return (
    <div data-testid={testid} className="space-y-3">
      {runs.map((r, i) => { const t = r.hits + r.re; return (
        <div key={i} className="text-[13px]">
          <div className="mb-0.5 flex justify-between text-slate-300"><span className="truncate pr-2">{i + 1}. {r.label}</span><span className="font-mono">{((r.hits / t) * 100).toFixed(1)}% reused</span></div>
          <div className="flex h-3 overflow-hidden rounded bg-slate-800" role="img" aria-label={`${r.hits} reused, ${r.re} reprocessed`}><div style={{ width: `${(r.hits / t) * 100}%`, background: "#22c55e" }} /><div style={{ width: `${Math.max(0.8, (r.re / t) * 100)}%`, background: "#f59e0b" }} /></div>
        </div>); })}
      <p className="flex gap-4 text-[13px] text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-500" />reused from cache</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />reprocessed</span></p>
    </div>
  );
}
