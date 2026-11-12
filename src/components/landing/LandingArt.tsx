import type { ArtKind } from "@/lib/landing-types";

const BG = "#0f172a", LINE = "#334155", CY = "#22d3ee", GR = "#34d399", AM = "#fbbf24", MUT = "#94a3b8";
let s = 7; const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pts = (n: number, f: (r: () => number) => [number, number]) => { s = 11; return Array.from({ length: n }, () => f(rnd)); };

function Box({ x, y, w, h, c, label }: { x: number; y: number; w: number; h: number; c: string; label: string }) {
  return <g><rect x={x} y={y} width={w} height={h} fill="none" stroke={c} strokeWidth="2" /><rect x={x} y={y - 15} width={label.length * 6.4 + 8} height="15" fill={c} /><text x={x + 4} y={y - 4} fontSize="10" fill="#0f172a" fontFamily="ui-monospace,monospace">{label}</text></g>;
}
const Frame = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <svg viewBox="0 0 560 360" role="img" aria-label={label} className="h-auto w-full rounded-2xl border border-slate-700 shadow-2xl"><title>{label}</title><rect width="560" height="360" fill={BG} />{children}</svg>
);

/** Drawn illustrations in the same schematic style as the portfolio previews. They are illustrations, not screenshots. */
export default function LandingArt({ kind, alt }: { kind: ArtKind; alt: string }) {
  if (kind === "vision") return (
    <Frame label={alt}>
      <polygon points="0,190 560,190 560,360 0,360" fill="#111c33" /><polygon points="190,190 370,190 520,360 40,360" fill="#1e293b" /><path d="M280 190v170" stroke={LINE} strokeDasharray="10 10" strokeWidth="3" />
      <rect x="395" y="120" width="70" height="95" fill="#1e293b" /><rect x="60" y="100" width="90" height="90" fill="#172036" />
      <circle cx="225" cy="235" r="14" fill="#475569" /><rect x="212" y="248" width="26" height="52" rx="8" fill="#475569" /><Box x={200} y={217} w={52} h={92} c={CY} label="person 0.94" />
      <rect x="330" y="255" width="120" height="44" rx="12" fill="#475569" /><rect x="352" y="238" width="70" height="26" rx="8" fill="#64748b" /><circle cx="360" cy="302" r="10" fill="#1e293b" /><circle cx="424" cy="302" r="10" fill="#1e293b" /><Box x={322} y={232} w={136} h={80} c={GR} label="car 0.91" />
      <path d="M170 260 L195 258 L222 262" stroke={AM} strokeWidth="2" fill="none" strokeDasharray="4 4" /><text x="24" y="338" fontSize="12" fill={MUT} fontFamily="ui-monospace,monospace">frame 1284 · 2 objects tracked</text>
    </Frame>);
  if (kind === "ai") return (
    <Frame label={alt}>
      {[[70, [90, 180, 270]], [190, [60, 135, 225, 300]], [310, [90, 180, 270]]].map(([x, ys], i, a) => (ys as number[]).map((y) => <g key={`${x}-${y}`}>{i < a.length - 1 && ((a[i + 1][1] as number[]).map((y2) => <line key={y2} x1={x as number} y1={y} x2={a[i + 1][0] as number} y2={y2} stroke={LINE} />))}</g>))}
      {[[70, [90, 180, 270]], [190, [60, 135, 225, 300]], [310, [90, 180, 270]]].map(([x, ys]) => (ys as number[]).map((y) => <circle key={`${x}-${y}`} cx={x as number} cy={y} r="13" fill="#0f172a" stroke={CY} strokeWidth="2" />))}
      <rect x="360" y="70" width="170" height="220" rx="10" fill="#111c33" stroke={LINE} /><text x="372" y="94" fontSize="12" fill={MUT} fontFamily="ui-monospace,monospace">forecast</text>
      <polyline points="372,250 400,230 428,238 456,200 484,190 512,170" fill="none" stroke={CY} strokeWidth="3" /><polyline points="456,200 484,186 512,150" fill="none" stroke={AM} strokeWidth="2" strokeDasharray="5 4" /><path d="M456 200 L512 150 L512 190 Z" fill={AM} opacity="0.15" />
      <rect x="372" y="262" width="22" height="16" fill={LINE} /><rect x="402" y="254" width="22" height="24" fill={LINE} /><rect x="432" y="246" width="22" height="32" fill={LINE} />
    </Frame>);
  if (kind === "cctv") return (
    <Frame label={alt}>
      {[[24, 24], [292, 24], [24, 190], [292, 190]].map(([x, y], i) => (
        <g key={i}><rect x={x} y={y} width="244" height="146" fill="#111c33" stroke={LINE} /><polygon points={`${x},${y + 90} ${x + 244},${y + 90} ${x + 244},${y + 146} ${x},${y + 146}`} fill="#172036" />
          <circle cx={x + 80 + i * 14} cy={y + 80} r="8" fill="#475569" /><rect x={x + 72 + i * 14} y={y + 90} width="16" height="34" rx="5" fill="#475569" /><rect x={x + 62 + i * 14} y={y + 62} width="36" height="66" fill="none" stroke={i % 2 ? GR : CY} strokeWidth="2" />
          {i === 1 && <><polygon points={`${x + 150},${y + 40} ${x + 225},${y + 40} ${x + 225},${y + 130} ${x + 150},${y + 130}`} fill={AM} opacity="0.12" stroke={AM} strokeDasharray="5 4" /><text x={x + 156} y={y + 56} fontSize="10" fill={AM} fontFamily="ui-monospace,monospace">restricted</text></>}
          <circle cx={x + 14} cy={y + 14} r="4" fill="#ef4444" /><text x={x + 24} y={y + 18} fontSize="10" fill={MUT} fontFamily="ui-monospace,monospace">CAM {i + 1}</text></g>))}
      <rect x="200" y="152" width="160" height="56" rx="8" fill="#0b1220" stroke={CY} /><text x="214" y="176" fontSize="12" fill={MUT} fontFamily="ui-monospace,monospace">IN 24 · OUT 19</text><text x="214" y="196" fontSize="12" fill={GR} fontFamily="ui-monospace,monospace">inside now: 5</text>
    </Frame>);
  if (kind === "anpr") return (
    <Frame label={alt}>
      <polygon points="0,230 560,230 560,360 0,360" fill="#172036" /><path d="M0 300H560" stroke={LINE} strokeDasharray="14 12" strokeWidth="3" />
      <path d="M110 230 L150 168 Q158 156 176 156 H384 Q402 156 410 168 L450 230 Z" fill="#334155" /><rect x="86" y="226" width="388" height="78" rx="22" fill="#475569" /><circle cx="170" cy="306" r="28" fill="#0f172a" stroke="#64748b" strokeWidth="6" /><circle cx="390" cy="306" r="28" fill="#0f172a" stroke="#64748b" strokeWidth="6" />
      <rect x="222" y="252" width="116" height="34" rx="4" fill="#e2e8f0" /><text x="238" y="276" fontSize="20" fill="#0f172a" fontFamily="ui-monospace,monospace" fontWeight="bold">AB12 CDE</text>
      <rect x="214" y="244" width="132" height="50" fill="none" stroke={GR} strokeWidth="2.5" /><rect x="214" y="224" width="132" height="20" fill={GR} /><text x="220" y="239" fontSize="11" fill="#0f172a" fontFamily="ui-monospace,monospace">plate · example read</text>
      <rect x="40" y="36" width="180" height="62" rx="8" fill="#0b1220" stroke={LINE} /><text x="54" y="60" fontSize="12" fill={MUT} fontFamily="ui-monospace,monospace">entry · 08:14:07</text><text x="54" y="82" fontSize="12" fill={CY} fontFamily="ui-monospace,monospace">AB12 CDE → matched</text>
    </Frame>);
  if (kind === "recon") {
    const room = pts(260, (r) => { const f = Math.floor(r() * 3), u = r(), v = r(); return f === 0 ? [60 + u * 150 + v * 40, 250 - v * 90 + u * 10] : f === 1 ? [60 + u * 150, 250 - v * 150 + u * 10] : [60 + u * 40 + 150 * 0 + v * 150 * 0 + 150 * v, 250 - 150 + v * 60 - u * 10]; });
    return (
      <Frame label={alt}>
        {room.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill={i % 3 ? CY : "#67e8f9"} opacity="0.85" />)}
        <path d="M250 180 H320" stroke={AM} strokeWidth="3" /><path d="M312 170 L324 180 L312 190" fill="none" stroke={AM} strokeWidth="3" /><text x="238" y="206" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">mesh</text>
        {Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => { const x = 350 + j * 36 + i * 12, y = 120 + i * 30 - j * 10; return <polygon key={`${i}-${j}`} points={`${x},${y} ${x + 36},${y - 10} ${x + 48},${y + 20} ${x + 12},${y + 30}`} fill={(i + j) % 2 ? "#1e3a5f" : "#16304f"} stroke={CY} strokeWidth="1" />; }))}
        <text x="60" y="330" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">point cloud · 260 points shown</text>
      </Frame>);
  }
  if (kind === "cad") return (
    <Frame label={alt}>
      <g stroke={CY} strokeWidth="2" fill="none"><path d="M140 250 L280 320 L420 250 L420 130 L280 60 L140 130 Z" /><path d="M280 320V200M140 130L280 200L420 130" /><path d="M140 190L280 260L420 190M140 160L280 230L420 160" stroke={LINE} /></g>
      <g fill="#1e3a5f" opacity="0.7"><polygon points="140,130 280,200 280,320 140,250" /><polygon points="280,200 420,130 420,250 280,320" opacity="0.5" /></g>
      {[0, 1, 2].map((i) => <rect key={i} x={170 + i * 34} y={190 + i * 17 - 10} width="20" height="26" fill={BG} stroke={AM} />)}
      <path d="M130 270 L270 340" stroke={AM} strokeWidth="1.5" /><text x="140" y="338" fontSize="12" fill={AM} fontFamily="ui-monospace,monospace">24.0 m</text><path d="M440 250V130" stroke={AM} strokeWidth="1.5" /><text x="448" y="196" fontSize="12" fill={AM} fontFamily="ui-monospace,monospace">10.5 m</text>
      <rect x="28" y="28" width="150" height="48" rx="6" fill="#0b1220" stroke={LINE} /><text x="40" y="50" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">IfcWall · 12</text><text x="40" y="68" fontSize="11" fill={GR} fontFamily="ui-monospace,monospace">checks passed</text>
    </Frame>);
  if (kind === "erp") return (
    <Frame label={alt}>
      {[["New", 3], ["Qualified", 2], ["Proposal", 3], ["Won", 1]].map(([n, c], i) => (
        <g key={String(n)}><rect x={28 + i * 96} y="30" width="88" height="200" rx="6" fill="#111c33" stroke={LINE} /><text x={36 + i * 96} y="50" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">{n}</text>
          {Array.from({ length: c as number }, (_, k) => <rect key={k} x={36 + i * 96} y={60 + k * 52} width="72" height="42" rx="4" fill="#1e293b" stroke={k === 0 ? CY : LINE} />)}</g>))}
      <rect x="420" y="30" width="112" height="90" rx="6" fill="#111c33" stroke={LINE} /><text x="432" y="52" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">stock</text>{[28, 52, 36, 66, 48].map((h, i) => <rect key={i} x={432 + i * 19} y={110 - h} width="12" height={h} fill={i === 3 ? CY : LINE} />)}
      <rect x="420" y="134" width="112" height="96" rx="6" fill="#111c33" stroke={LINE} /><polyline points="432,210 456,190 478,198 502,166 524,152" fill="none" stroke={GR} strokeWidth="3" /><text x="432" y="152" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">revenue</text>
      <rect x="28" y="250" width="504" height="82" rx="6" fill="#111c33" stroke={LINE} />{[0, 1, 2, 3].map((i) => <g key={i}><rect x="44" y={262 + i * 17} width="140" height="8" fill={LINE} /><rect x="210" y={262 + i * 17} width={90 + i * 40} height="8" fill={i === 1 ? CY : "#475569"} /><rect x="440" y={262 + i * 17} width="70" height="8" fill={LINE} /></g>)}
    </Frame>);
  return (
    <Frame label={alt}>
      <defs><radialGradient id="scan" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#e2e8f0" stopOpacity="0.9" /><stop offset="0.6" stopColor="#64748b" stopOpacity="0.8" /><stop offset="1" stopColor="#0f172a" stopOpacity="0" /></radialGradient></defs>
      <rect x="150" y="20" width="260" height="320" rx="10" fill="#020617" stroke={LINE} /><ellipse cx="280" cy="180" rx="105" ry="135" fill="url(#scan)" /><ellipse cx="280" cy="180" rx="80" ry="105" fill="none" stroke="#475569" strokeWidth="6" opacity="0.6" /><ellipse cx="250" cy="170" rx="22" ry="40" fill="#334155" opacity="0.8" /><ellipse cx="312" cy="176" rx="26" ry="44" fill="#334155" opacity="0.8" />
      <path d="M232 150 C236 124 266 118 276 140 C288 160 270 202 248 204 C228 204 226 172 232 150 Z" fill="none" stroke={GR} strokeWidth="3" />
      <path d="M220 230 H340" stroke={AM} strokeWidth="2" /><path d="M220 224v12M340 224v12" stroke={AM} strokeWidth="2" /><text x="236" y="250" fontSize="11" fill={AM} fontFamily="ui-monospace,monospace">measurement · example</text>
      <rect x="28" y="36" width="100" height="70" rx="6" fill="#0b1220" stroke={LINE} /><text x="38" y="58" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">original</text><text x="38" y="78" fontSize="11" fill={GR} fontFamily="ui-monospace,monospace">processed</text><text x="38" y="98" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">log: 4 ops</text>
      <rect x="432" y="36" width="104" height="52" rx="6" fill="#0b1220" stroke={AM} /><text x="440" y="58" fontSize="11" fill={AM} fontFamily="ui-monospace,monospace">research use</text><text x="440" y="76" fontSize="11" fill={MUT} fontFamily="ui-monospace,monospace">not diagnostic</text>
    </Frame>);
}
