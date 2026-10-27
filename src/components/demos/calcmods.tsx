import type { ReactNode } from "react";
import { OCCUPANCY, UNITS, beam, convert, loads, quantity, section, type BeamCase, type Shape, type UCat } from "@/lib/demo-calc";

export interface Inp { k: string; label: string; unit?: string; min: number; max: number; step?: number; def: string; help?: string; show?: (s: Sel) => boolean }
export type Sel = Record<string, string>;
export interface SelDef { k: string; label: string; options: [string, string][]; def: string }
export interface Step { t: string; f?: string }
export interface Out { rows: [string, string, string?][]; steps: Step[]; status?: { ok: boolean; text: string }; diag: ReactNode }
export interface Mod {
  id: string; name: string; blurb: string; inputs: Inp[]; selects: SelDef[];
  presets: Record<string, { vals: Record<string, string>; sel?: Sel }>;
  validate?: (n: Record<string, number>, s: Sel) => string[];
  run: (n: Record<string, number>, s: Sel) => Out;
  formulas: (s: Sel) => string[]; assumptions: string[]; limits: string[];
}

export const f = (v: number, d = 3) => (Number.isFinite(v) ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(Math.round(v * 10 ** d) / 10 ** d)) : "∞");
const C = { ink: "#e5e7eb", dim: "#94a3b8", brand: "#55b52b", amber: "#f59e0b", red: "#f87171", blue: "#38bdf8", grid: "#1b271f" };

/* ------------------------------------------------------------ plots */
function Plot({ x0, x1, ys, label, unit, color, y: [top, h], w = 600, flip = false, fill = true }: { x0: number; x1: number; ys: number[]; label: string; unit: string; color: string; y: [number, number]; w?: number; flip?: boolean; fill?: boolean }) {
  const m = Math.max(...ys.map(Math.abs), 1e-12), pad = 50, W = w - pad * 2, sy = (v: number) => top + h / 2 - (flip ? -1 : 1) * (v / m) * (h / 2 - 6), sx = (i: number) => pad + (i / (ys.length - 1)) * W;
  const d = ys.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
  const area = `${d} L${sx(ys.length - 1)} ${top + h / 2} L${sx(0)} ${top + h / 2} Z`;
  const iMax = ys.map(Math.abs).indexOf(m);
  void x0; void x1;
  return (
    <g>
      <rect x={pad} y={top} width={W} height={h} fill="none" stroke={C.grid} />
      <line x1={pad} y1={top + h / 2} x2={pad + W} y2={top + h / 2} stroke={C.dim} strokeWidth="0.8" />
      {fill && <path d={area} fill={color} opacity="0.18" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" />
      <circle cx={sx(iMax)} cy={sy(ys[iMax])} r="3.5" fill={color} />
      <text x={sx(iMax) + (iMax > ys.length * 0.7 ? -8 : 8)} y={sy(ys[iMax]) + (ys[iMax] >= 0 ? -6 : 14)} fontSize="11" fill={color} textAnchor={iMax > ys.length * 0.7 ? "end" : "start"}>{f(ys[iMax], 2)} {unit}</text>
      <text x={pad} y={top - 4} fontSize="11" fill={C.dim}>{label}</text>
    </g>
  );
}
const Arrow = ({ x, y1, y2, c = C.amber }: { x: number; y1: number; y2: number; c?: string }) => <g stroke={c} fill={c}><line x1={x} y1={y1} x2={x} y2={y2} strokeWidth="1.6" /><path d={`M${x - 4} ${y2 - 7 * Math.sign(y2 - y1)} L${x} ${y2} L${x + 4} ${y2 - 7 * Math.sign(y2 - y1)} Z`} /></g>;

/* ------------------------------------------------------------- beam */
export const MAT: Record<string, { E: string; fy: string; name: string }> = { steel: { E: "210", fy: "275", name: "Structural steel" }, timber: { E: "11", fy: "24", name: "Softwood timber" }, concrete: { E: "30", fy: "30", name: "Concrete (reference strength)" }, aluminium: { E: "70", fy: "160", name: "Aluminium alloy" } };
const beamMod: Mod = {
  id: "beam", name: "Beam analysis", blurb: "Single-span beam: reactions, shear, moment, deflection and an indicative stress check.",
  selects: [
    { k: "case", label: "Support and load case", def: "ss-udl", options: [["ss-udl", "Simply supported, uniform load"], ["ss-central", "Simply supported, central point load"], ["ss-point", "Simply supported, point load at distance a"], ["cant-udl", "Cantilever, uniform load"], ["cant-point", "Cantilever, point load at free end"]] },
    { k: "lunit", label: "Span unit", def: "m", options: [["m", "metres"], ["mm", "millimetres"], ["ft", "feet"]] },
    { k: "mat", label: "Material preset (sets E and reference strength)", def: "steel", options: [["steel", "Structural steel"], ["timber", "Softwood timber"], ["concrete", "Concrete"], ["aluminium", "Aluminium alloy"], ["custom", "Custom (edit the values)"]] },
  ],
  inputs: [
    { k: "L", label: "Span", min: 0.1, max: 50000, step: 0.1, def: "6", help: "Between supports (or fixed end to free end)" },
    { k: "w", label: "Uniform load", unit: "kN/m", min: 0.01, max: 1000, def: "10", show: (s) => s.case.endsWith("udl") },
    { k: "P", label: "Point load", unit: "kN", min: 0.01, max: 100000, def: "20", show: (s) => !s.case.endsWith("udl") },
    { k: "a", label: "Load distance a from left support", unit: "same as span", min: 0.001, max: 50000, def: "2", show: (s) => s.case === "ss-point" },
    { k: "E", label: "Elastic modulus E", unit: "GPa", min: 1, max: 500, def: "210" },
    { k: "b", label: "Section width b", unit: "mm", min: 5, max: 2000, def: "100" },
    { k: "h", label: "Section depth h", unit: "mm", min: 5, max: 3000, def: "300" },
    { k: "fy", label: "Reference strength", unit: "MPa", min: 1, max: 1500, def: "275", help: "Used only for an indicative utilisation figure" },
  ],
  presets: {
    "6 m steel beam, uniform load": { vals: { L: "6", w: "10", E: "210", b: "100", h: "300", fy: "275" }, sel: { case: "ss-udl", lunit: "m", mat: "steel" } },
    "4 m timber beam, central load": { vals: { L: "4", P: "6", E: "11", b: "75", h: "225", fy: "24" }, sel: { case: "ss-central", lunit: "m", mat: "timber" } },
    "2 m steel cantilever": { vals: { L: "2", w: "5", E: "210", b: "80", h: "200", fy: "275" }, sel: { case: "cant-udl", lunit: "m", mat: "steel" } },
    "5 m beam, load at 1.7 m": { vals: { L: "5", P: "18", a: "1.7", E: "210", b: "100", h: "250", fy: "275" }, sel: { case: "ss-point", lunit: "m", mat: "steel" } },
  },
  validate: (n, s) => {
    const e: string[] = [], k = s.lunit === "mm" ? 0.001 : s.lunit === "ft" ? 0.3048 : 1, L = n.L * k;
    if (L < 0.1 || L > 100) e.push(`Span of ${f(L)} m is outside the supported range of 0.1 to 100 m.`);
    if (s.case === "ss-point" && !(n.a > 0 && n.a < n.L)) e.push("The load position a must be greater than 0 and less than the span.");
    if (n.h > 0 && L / (n.h / 1000) < 3) e.push("Span is less than 3 times the depth: beam theory is not valid for such a deep member.");
    return e;
  },
  run: (n, s) => {
    const k = s.lunit === "mm" ? 0.001 : s.lunit === "ft" ? 0.3048 : 1, L = n.L * k, a = (n.a ?? 0) * k, I = (n.b * n.h ** 3) / 12, S = I / (n.h / 2);
    const c = s.case as BeamCase, r = beam({ c, L, w: n.w ?? 0, P: n.P ?? 0, a, E: n.E, I, c_mm: n.h / 2, fy: n.fy });
    const cant = c.startsWith("cant"), ssP = c === "ss-point";
    const rows: Out["rows"] = cant ? [["Fixed-end reaction", f(r.RA), "kN"], ["Fixed-end moment", f(r.MA), "kN·m"]] : [["Left reaction RA", f(r.RA), "kN"], ["Right reaction RB", f(r.RB), "kN"]];
    rows.push(["Maximum shear", f(r.Vmax), "kN"], ["Maximum bending moment", f(r.Mmax), "kN·m"], ["Location of maximum moment", f(r.xM, 2), "m from left"], ["Maximum deflection", f(r.defl, 2), "mm"], ["Location of maximum deflection", f(r.xD, 2), "m from left"], ["Span / deflection", f(r.ratio, 0), ""], ["Bending stress σ = M / S", f(r.sigma, 1), "MPa"], ["Utilisation σ / reference strength", `${f(r.util * 100, 1)}`, "%"]);
    const steps: Step[] = [
      { t: `Validate inputs and convert the span to metres: ${f(n.L)} ${s.lunit} = ${f(L, 4)} m.` },
      { t: "Section properties of the rectangle:", f: `I = b h³ / 12 = ${f(n.b, 0)} × ${f(n.h, 0)}³ / 12 = ${f(I, 0)} mm⁴;  S = I / (h/2) = ${f(S, 0)} mm³` },
      { t: "Flexural rigidity (E in kN/m², I in m⁴):", f: `EI = ${f(n.E)} × 10⁶ × ${f(I * 1e-12, 8)} = ${f(r.EI, 1)} kN·m²` },
      cant ? { t: "Reactions for the cantilever:", f: c === "cant-udl" ? `R = wL = ${f(n.w)} × ${f(L)} = ${f(r.RA)} kN;  M = wL²/2 = ${f(r.MA)} kN·m` : `R = P = ${f(r.RA)} kN;  M = PL = ${f(r.MA)} kN·m` }
        : { t: "Reactions from equilibrium:", f: c === "ss-udl" ? `RA = RB = wL/2 = ${f(r.RA)} kN` : c === "ss-central" ? `RA = RB = P/2 = ${f(r.RA)} kN` : `RA = P(L−a)/L = ${f(r.RA)} kN;  RB = Pa/L = ${f(r.RB)} kN` },
      { t: "Maximum bending moment:", f: c === "ss-udl" ? `Mmax = wL²/8 = ${f(r.Mmax)} kN·m` : c === "ss-central" ? `Mmax = PL/4 = ${f(r.Mmax)} kN·m` : ssP ? `Mmax = P a b / L = ${f(r.Mmax)} kN·m at x = a` : c === "cant-udl" ? `Mmax = wL²/2 = ${f(r.Mmax)} kN·m` : `Mmax = PL = ${f(r.Mmax)} kN·m` },
      { t: "Maximum deflection (Euler–Bernoulli beam theory):", f: c === "ss-udl" ? `δ = 5wL⁴ / (384EI) = ${f(r.defl, 3)} mm` : c === "ss-central" ? `δ = PL³ / (48EI) = ${f(r.defl, 3)} mm` : ssP ? `δ = P b (L²−b²)^1.5 / (9√3 L EI) (b = shorter segment) = ${f(r.defl, 3)} mm` : c === "cant-udl" ? `δ = wL⁴ / (8EI) = ${f(r.defl, 3)} mm` : `δ = PL³ / (3EI) = ${f(r.defl, 3)} mm` },
      { t: "Indicative stress and serviceability checks:", f: `σ = M/S = ${f(r.Mmax, 3)}×10⁶ / ${f(S, 0)} = ${f(r.sigma, 1)} MPa;  L/δ = ${f(r.ratio, 0)} (limit used here: 360)` },
    ];
    const W = 600, bx = 50, bw = 500, scale = bw / L;
    const diag = (
      <svg viewBox="0 0 600 560" className="block w-full" role="img" aria-label="Beam diagram with shear, bending moment and deflection plots">
        <rect width="600" height="560" fill="#0a0f0c" />
        {/* beam sketch */}
        <rect x={bx} y="78" width={bw} height="10" fill="#cbd5e1" />
        {cant ? <g><rect x={bx - 12} y="60" width="12" height="48" fill="#475569" />{[0, 1, 2, 3, 4].map((i) => <line key={i} x1={bx - 12} y1={64 + i * 10} x2={bx - 20} y2={72 + i * 10} stroke="#475569" />)}</g>
          : <g><path d={`M${bx} 88 l-9 16 h18 z`} fill="#475569" /><path d={`M${bx + bw} 88 l-9 16 h18 z`} fill="#475569" /><circle cx={bx + bw} cy="108" r="3" fill="#475569" /></g>}
        {c.endsWith("udl") ? <g><line x1={bx} y1="46" x2={bx + bw} y2="46" stroke={C.amber} />{Array.from({ length: 11 }, (_, i) => <Arrow key={i} x={bx + (i * bw) / 10} y1={46} y2={76} />)}<text x={bx + bw / 2} y="38" fontSize="12" fill={C.amber} textAnchor="middle">w = {f(n.w)} kN/m</text></g>
          : <g><Arrow x={bx + (c === "ss-central" ? bw / 2 : c === "cant-point" ? bw : a * scale)} y1={30} y2={76} /><text x={bx + (c === "ss-central" ? bw / 2 : c === "cant-point" ? bw - 20 : a * scale)} y="24" fontSize="12" fill={C.amber} textAnchor="middle">P = {f(n.P)} kN</text></g>}
        <line x1={bx} y1="128" x2={bx + bw} y2="128" stroke={C.dim} /><line x1={bx} y1="123" x2={bx} y2="133" stroke={C.dim} /><line x1={bx + bw} y1="123" x2={bx + bw} y2="133" stroke={C.dim} />
        <text x={bx + bw / 2} y="144" fontSize="12" fill={C.ink} textAnchor="middle">L = {f(L, 3)} m</text>
        {!cant && <><text x={bx} y="162" fontSize="11" fill={C.brand} textAnchor="middle">RA = {f(r.RA, 2)} kN</text><text x={bx + bw} y="162" fontSize="11" fill={C.brand} textAnchor="middle">RB = {f(r.RB, 2)} kN</text></>}
        {cant && <text x={bx} y="162" fontSize="11" fill={C.brand}>R = {f(r.RA, 2)} kN · M = {f(r.MA, 2)} kN·m</text>}
        <Plot x0={0} x1={L} ys={r.V} label="Shear force V (kN)" unit="kN" color={C.blue} y={[190, 100]} w={W} />
        <Plot x0={0} x1={L} ys={r.M} label={cant ? "Bending moment M (kN·m, hogging negative)" : "Bending moment M (kN·m)"} unit="kN·m" color={C.brand} y={[322, 100]} w={W} flip />
        <Plot x0={0} x1={L} ys={r.y} label="Deflection (mm, exaggerated vertical scale)" unit="mm" color={C.amber} y={[454, 100]} w={W} flip fill={false} />
      </svg>
    );
    return { rows, steps, status: { ok: r.ok, text: r.ok ? `Indicative checks pass: utilisation ${f(r.util * 100, 0)}% and span/deflection ${f(r.ratio, 0)} ≥ 360.` : `Indicative check not met: ${r.sigma > n.fy ? "stress exceeds the reference strength" : `span/deflection ${f(r.ratio, 0)} is below 360`}. Increase the section or reduce the load.` }, diag };
  },
  formulas: (s) => {
    const c = s.case;
    const m: Record<string, string[]> = {
      "ss-udl": ["RA = RB = wL / 2", "V(x) = wL/2 − w x", "M(x) = wL x/2 − w x²/2, Mmax = wL² / 8 at midspan", "y(x) = w x (L³ − 2L x² + x³) / (24 EI), δmax = 5wL⁴ / (384 EI)"],
      "ss-central": ["RA = RB = P / 2", "M(x) = P x / 2 for x ≤ L/2, Mmax = PL / 4", "y(x) = P x (3L² − 4x²) / (48 EI) for x ≤ L/2, δmax = PL³ / (48 EI)"],
      "ss-point": ["RA = P b / L,  RB = P a / L  (b = L − a)", "Mmax = P a b / L under the load", "y(x) = P b x (L² − b² − x²) / (6 L EI) for x ≤ a;  y(x) = P a (L−x)(2Lx − x² − a²) / (6 L EI) for x ≥ a", "δmax = P b (L² − b²)^1.5 / (9√3 L EI) for a ≥ b (swap a and b otherwise)"],
      "cant-udl": ["R = wL,  M = wL² / 2 at the fixed end", "y(x) = w x² (6L² − 4L x + x²) / (24 EI), δmax = wL⁴ / (8 EI) at the free end"],
      "cant-point": ["R = P,  M = P L at the fixed end", "y(x) = P x² (3L − x) / (6 EI), δmax = P L³ / (3 EI) at the free end"],
    };
    return [...m[c], "σ = Mmax / S, with S = I / (h/2) and I = b h³ / 12 for a rectangle", "EI uses E in kN/m² (GPa × 10⁶) and I in m⁴ (mm⁴ × 10⁻¹²)"];
  },
  assumptions: ["Linear-elastic, prismatic beam of one material and a rectangular section.", "Euler–Bernoulli bending: shear deformation is ignored, so very deep beams are out of scope.", "Small deflections. Self-weight is not included: add it to the uniform load yourself.", "Loads act in the plane of bending through the shear centre; supports are rigid."],
  limits: ["Not a member design: no load combinations, partial safety factors or code resistance checks.", "No lateral-torsional buckling, shear, bearing, connection or vibration checks.", "The 'reference strength' and the span/360 limit are indicative figures you can change; they are not code limits.", "Do not use these results for construction without review by a qualified engineer."],
};

/* ---------------------------------------------------------- section */
const secMod: Mod = {
  id: "section", name: "Section properties", blurb: "Area, second moment of area, elastic modulus, radius of gyration and mass per metre.",
  selects: [{ k: "shape", label: "Section shape", def: "rect", options: [["rect", "Solid rectangle"], ["circle", "Solid circle"], ["rhs", "Rectangular hollow section"], ["tube", "Circular hollow section"], ["ibeam", "I-section (doubly symmetric)"]] }, { k: "mat", label: "Material (density)", def: "7850", options: [["7850", "Steel 7850 kg/m³"], ["2400", "Concrete 2400 kg/m³"], ["500", "Timber 500 kg/m³"], ["2700", "Aluminium 2700 kg/m³"]] }],
  inputs: [
    { k: "b", label: "Width b", unit: "mm", min: 5, max: 3000, def: "100", show: (s) => ["rect", "rhs", "ibeam"].includes(s.shape) },
    { k: "h", label: "Depth h", unit: "mm", min: 5, max: 3000, def: "200", show: (s) => ["rect", "rhs", "ibeam"].includes(s.shape) },
    { k: "d", label: "Diameter d", unit: "mm", min: 5, max: 3000, def: "100", show: (s) => ["circle", "tube"].includes(s.shape) },
    { k: "t", label: "Wall thickness t", unit: "mm", min: 0.5, max: 200, def: "8", show: (s) => ["rhs", "tube"].includes(s.shape) },
    { k: "tf", label: "Flange thickness tf", unit: "mm", min: 1, max: 200, def: "10", show: (s) => s.shape === "ibeam" },
    { k: "tw", label: "Web thickness tw", unit: "mm", min: 1, max: 200, def: "6", show: (s) => s.shape === "ibeam" },
  ],
  presets: { "100 × 200 rectangle": { vals: { b: "100", h: "200" }, sel: { shape: "rect", mat: "7850" } }, "Ø100 solid bar": { vals: { d: "100" }, sel: { shape: "circle", mat: "7850" } }, "150 × 100 × 8 RHS": { vals: { b: "100", h: "150", t: "8" }, sel: { shape: "rhs", mat: "7850" } }, "I-section 100 × 200": { vals: { b: "100", h: "200", tf: "10", tw: "6" }, sel: { shape: "ibeam", mat: "7850" } } },
  validate: (n, s) => { const e: string[] = []; if (s.shape === "rhs" && n.t * 2 >= Math.min(n.b, n.h)) e.push("Wall thickness must be less than half of the smaller side."); if (s.shape === "tube" && n.t * 2 >= n.d) e.push("Wall thickness must be less than half of the diameter."); if (s.shape === "ibeam") { if (n.tf * 2 >= n.h) e.push("Two flange thicknesses must be less than the depth."); if (n.tw >= n.b) e.push("Web thickness must be less than the flange width."); } return e; },
  run: (n, s) => {
    const shape = s.shape as Shape, r = section({ shape, b: n.b ?? 0, h: n.h ?? 0, d: n.d ?? 0, t: n.t ?? 0, tf: n.tf ?? 0, tw: n.tw ?? 0, rho: +s.mat });
    const H = shape === "circle" || shape === "tube" ? n.d : n.h, B = shape === "circle" || shape === "tube" ? n.d : n.b, k = 300 / Math.max(H, B);
    const rows: Out["rows"] = [["Area A", f(r.A, 1), "mm²"], ["Centroid height", f(r.yc, 2), "mm from base"], ["Second moment Ix (strong axis)", f(r.Ix, 0), "mm⁴"], ["Second moment Iy", f(r.Iy, 0), "mm⁴"], ["Elastic modulus Zx = Ix / ymax", f(r.Zx, 0), "mm³"], ["Elastic modulus Zy", f(r.Zy, 0), "mm³"], ["Radius of gyration rx", f(r.rx, 2), "mm"], ["Radius of gyration ry", f(r.ry, 2), "mm"], ["Mass per metre", f(r.mass, 2), "kg/m"]];
    const w = B * k, h = H * k, x = 300 - w / 2, y = 190 - h / 2;
    const shapeEl = shape === "rect" ? <rect x={x} y={y} width={w} height={h} fill="#334155" stroke={C.ink} /> : shape === "circle" ? <circle cx={300} cy={190} r={w / 2} fill="#334155" stroke={C.ink} />
      : shape === "rhs" ? <path fillRule="evenodd" d={`M${x} ${y}h${w}v${h}h${-w}z M${x + n.t * k} ${y + n.t * k}h${w - 2 * n.t * k}v${h - 2 * n.t * k}h${-(w - 2 * n.t * k)}z`} fill="#334155" stroke={C.ink} />
      : shape === "tube" ? <g><circle cx={300} cy={190} r={w / 2} fill="#334155" stroke={C.ink} /><circle cx={300} cy={190} r={w / 2 - n.t * k} fill="#0a0f0c" stroke={C.ink} /></g>
      : <path d={`M${x} ${y}h${w}v${n.tf * k}h${-(w - n.tw * k) / 2}v${h - 2 * n.tf * k}h${(w - n.tw * k) / 2}v${n.tf * k}h${-w}v${-n.tf * k}h${(w - n.tw * k) / 2}v${-(h - 2 * n.tf * k)}h${-(w - n.tw * k) / 2}z`} fill="#334155" stroke={C.ink} />;
    const diag = (
      <svg viewBox="0 0 600 380" className="block w-full" role="img" aria-label="Cross-section with dimensions and centroid axes"><rect width="600" height="380" fill="#0a0f0c" />
        {shapeEl}
        <line x1={x - 24} y1={190} x2={x + w + 24} y2={190} stroke={C.brand} strokeDasharray="6 3" /><line x1={300} y1={y - 24} x2={300} y2={y + h + 24} stroke={C.brand} strokeDasharray="6 3" /><circle cx={300} cy={190} r="3.5" fill={C.brand} />
        <text x={x + w + 26} y={186} fontSize="11" fill={C.brand}>x–x</text><text x={304} y={y - 28} fontSize="11" fill={C.brand}>y–y (centroid)</text>
        <line x1={x} y1={y + h + 30} x2={x + w} y2={y + h + 30} stroke={C.dim} /><text x={300} y={y + h + 48} fontSize="12" fill={C.ink} textAnchor="middle">{shape === "circle" || shape === "tube" ? `Ø ${f(n.d, 1)} mm` : `b = ${f(n.b, 1)} mm`}</text>
        <line x1={x - 34} y1={y} x2={x - 34} y2={y + h} stroke={C.dim} /><text transform={`translate(${x - 42} 190) rotate(-90)`} fontSize="12" fill={C.ink} textAnchor="middle">{shape === "circle" || shape === "tube" ? "" : `h = ${f(n.h, 1)} mm`}</text>
      </svg>
    );
    const A = r.A, Ix = r.Ix;
    const steps: Step[] = [{ t: "Read and validate the dimensions (mm)." }, { t: "Area:", f: shape === "rect" ? `A = b h = ${f(n.b, 0)} × ${f(n.h, 0)} = ${f(A, 0)} mm²` : shape === "circle" ? `A = π d² / 4 = ${f(A, 1)} mm²` : shape === "rhs" ? `A = b h − (b−2t)(h−2t) = ${f(A, 1)} mm²` : shape === "tube" ? `A = π (d² − (d−2t)²) / 4 = ${f(A, 1)} mm²` : `A = 2 b tf + (h−2tf) tw = ${f(A, 1)} mm²` },
      { t: "Second moment of area about the strong axis:", f: shape === "rect" ? `Ix = b h³ / 12 = ${f(Ix, 0)} mm⁴` : shape === "circle" ? `Ix = π d⁴ / 64 = ${f(Ix, 0)} mm⁴` : shape === "rhs" ? `Ix = (b h³ − (b−2t)(h−2t)³) / 12 = ${f(Ix, 0)} mm⁴` : shape === "tube" ? `Ix = π (d⁴ − (d−2t)⁴) / 64 = ${f(Ix, 0)} mm⁴` : `Ix = (b h³ − (b−tw)(h−2tf)³) / 12 = ${f(Ix, 0)} mm⁴` },
      { t: "Elastic modulus and radius of gyration:", f: `Zx = Ix / (h/2) = ${f(r.Zx, 0)} mm³;  rx = √(Ix / A) = ${f(r.rx, 2)} mm` }, { t: "Mass per metre from the density:", f: `m = A × ρ = ${f(A * 1e-6, 6)} m² × ${s.mat} kg/m³ = ${f(r.mass, 2)} kg/m` }];
    return { rows, steps, diag };
  },
  formulas: (s) => ({ rect: ["A = b h", "Ix = b h³ / 12,  Iy = h b³ / 12"], circle: ["A = π d² / 4", "I = π d⁴ / 64"], rhs: ["A = b h − (b − 2t)(h − 2t)", "Ix = [b h³ − (b−2t)(h−2t)³] / 12"], tube: ["A = π [d² − (d−2t)²] / 4", "I = π [d⁴ − (d−2t)⁴] / 64"], ibeam: ["A = 2 b tf + (h − 2tf) tw", "Ix = [b h³ − (b − tw)(h − 2tf)³] / 12"] } as Record<string, string[]>)[s.shape].concat(["Z = I / ymax,  r = √(I / A),  mass per metre = A × ρ"]),
  assumptions: ["Sharp corners: root radii and fillets of real rolled sections are ignored.", "Doubly symmetric shapes, so the centroid is at mid-depth."],
  limits: ["Section properties only: no resistance, buckling classification or torsion constant.", "Compare with manufacturer tables for rolled sections."],
};

/* --------------------------------------------------------- quantities */
const qtyMod: Mod = {
  id: "quantity", name: "Material quantities", blurb: "Concrete volume, mass and formwork area for slabs, columns and walls.",
  selects: [{ k: "shape", label: "Element", def: "slab", options: [["slab", "Rectangular slab or beam"], ["column-rect", "Rectangular column"], ["column-round", "Round column"], ["wall", "Wall"]] }, { k: "mat", label: "Material (density)", def: "2400", options: [["2400", "Concrete 2400 kg/m³"], ["7850", "Steel 7850 kg/m³"], ["500", "Timber 500 kg/m³"], ["1800", "Brickwork 1800 kg/m³"]] }],
  inputs: [
    { k: "L", label: "Length", unit: "m", min: 0.05, max: 200, def: "5", show: (s) => s.shape === "slab" || s.shape === "wall" },
    { k: "B", label: "Width / thickness", unit: "m", min: 0.05, max: 50, def: "4", show: (s) => s.shape !== "column-round" },
    { k: "D", label: "Column depth / diameter", unit: "m", min: 0.05, max: 5, def: "0.4", show: (s) => s.shape === "column-rect" || s.shape === "column-round" },
    { k: "H", label: "Thickness / height", unit: "m", min: 0.02, max: 100, def: "0.2" },
    { k: "n", label: "Number of elements", min: 1, max: 10000, step: 1, def: "1" },
    { k: "open", label: "Openings (walls)", unit: "m²", min: 0, max: 5000, def: "0", show: (s) => s.shape === "wall" },
    { k: "waste", label: "Waste allowance", unit: "%", min: 0, max: 50, def: "5" },
  ],
  presets: { "Slab 5 × 4 × 0.2 m": { vals: { L: "5", B: "4", H: "0.2", n: "1", waste: "5" }, sel: { shape: "slab", mat: "2400" } }, "Four round columns Ø0.4": { vals: { D: "0.4", H: "3", n: "4", waste: "5" }, sel: { shape: "column-round", mat: "2400" } }, "Wall 10 × 3 m, 0.2 m, 4 m² openings": { vals: { L: "10", B: "0.2", H: "3", n: "1", open: "4", waste: "5" }, sel: { shape: "wall", mat: "2400" } } },
  validate: (n, s) => (s.shape === "wall" && n.open >= n.L * n.H ? ["Openings are larger than or equal to the wall area."] : []),
  run: (n, s) => {
    const sh = s.shape as "slab" | "column-rect" | "column-round" | "wall";
    const dims = sh === "slab" ? { L: n.L, B: n.B, H: n.H, D: 0 } : sh === "wall" ? { L: n.L, B: n.B, H: n.H, D: 0 } : sh === "column-rect" ? { L: 0, B: n.B, H: n.H, D: n.D } : { L: 0, B: 0, H: n.H, D: n.D };
    const r = quantity({ shape: sh, ...dims, n: n.n, openings: n.open ?? 0, rho: +s.mat, waste: n.waste });
    const rows: Out["rows"] = [["Volume per element", f(r.one.vol, 3), "m³"], ["Total volume", f(r.total.vol, 3), "m³"], ["Volume to order (with waste)", f(r.order, 3), "m³"], ["Mass (net)", f(r.mass, 2), "t"], ["Mass to order", f(r.orderMass, 2), "t"], ["Formwork / surface area per element", f(r.one.formwork, 2), "m²"], ["Total formwork / surface area", f(r.total.formwork, 2), "m²"]];
    const steps: Step[] = [{ t: "Read the dimensions (m) and validate them." }, { t: "Volume of one element:", f: sh === "slab" ? `V = L × B × H = ${f(n.L)} × ${f(n.B)} × ${f(n.H)} = ${f(r.one.vol, 4)} m³` : sh === "column-rect" ? `V = B × D × H = ${f(r.one.vol, 4)} m³` : sh === "column-round" ? `V = π D² H / 4 = ${f(r.one.vol, 4)} m³` : `V = (L × H − openings) × t = (${f(n.L * n.H)} − ${f(n.open)}) × ${f(n.B)} = ${f(r.one.vol, 4)} m³` },
      { t: "Total volume and waste allowance:", f: `Vtotal = n × V = ${f(r.total.vol, 3)} m³;  Vorder = Vtotal × (1 + ${f(n.waste, 1)}%) = ${f(r.order, 3)} m³` }, { t: "Mass from the density:", f: `m = V × ρ / 1000 = ${f(r.total.vol, 3)} × ${s.mat} / 1000 = ${f(r.mass, 2)} t` }];
    const k = 6, bw = (sh === "slab" ? n.L : sh === "wall" ? n.L : sh === "column-rect" ? n.B : n.D) || 1, bd = (sh === "slab" ? n.B : sh === "wall" ? n.B : sh === "column-rect" ? n.D : n.D) || 1, bh = n.H, sc = 150 / Math.max(bw, bd, bh), W = bw * sc, Dp = bd * sc * 0.5, Hh = bh * sc;
    const ox = 220, oy = 280, dx = Dp * 0.8, dy = Dp * 0.5;
    void k;
    const diag = (
      <svg viewBox="0 0 600 380" className="block w-full" role="img" aria-label="Sketch of the element with its dimensions"><rect width="600" height="380" fill="#0a0f0c" />
        {sh === "column-round" ? <g><ellipse cx={300} cy={oy - Hh} rx={n.D * sc / 2} ry={n.D * sc / 4} fill="#475569" stroke={C.ink} /><path d={`M${300 - n.D * sc / 2} ${oy - Hh} V${oy} a${n.D * sc / 2} ${n.D * sc / 4} 0 0 0 ${n.D * sc} 0 V${oy - Hh}`} fill="#334155" stroke={C.ink} /></g>
          : <g><path d={`M${ox} ${oy} h${W} v${-Hh} h${-W} z`} fill="#334155" stroke={C.ink} /><path d={`M${ox + W} ${oy} l${dx} ${-dy} v${-Hh} l${-dx} ${dy} z`} fill="#263243" stroke={C.ink} /><path d={`M${ox} ${oy - Hh} l${dx} ${-dy} h${W} l${-dx} ${dy} z`} fill="#475569" stroke={C.ink} /></g>}
        <text x={300} y={oy + 28} fontSize="12" fill={C.ink} textAnchor="middle">{sh === "slab" || sh === "wall" ? `L = ${f(n.L)} m` : sh === "column-rect" ? `B = ${f(n.B)} m` : `Ø ${f(n.D)} m`}</text>
        <text x={ox - 14} y={oy - Hh / 2} fontSize="12" fill={C.ink} textAnchor="end">{sh === "slab" ? `H = ${f(n.H)} m` : `H = ${f(n.H)} m`}</text>
        <text x={ox + W + dx + 8} y={oy - dy} fontSize="12" fill={C.ink}>{sh === "slab" || sh === "wall" ? `${sh === "wall" ? "t" : "B"} = ${f(n.B)} m` : sh === "column-rect" ? `D = ${f(n.D)} m` : ""}</text>
        <text x={300} y={340} fontSize="14" fill={C.brand} textAnchor="middle">{f(r.total.vol, 2)} m³ · {f(r.mass, 1)} t · {n.n} element{n.n === 1 ? "" : "s"}</text>
      </svg>
    );
    return { rows, steps, diag };
  },
  formulas: () => ["Slab / beam: V = L × B × H;  formwork = L × B + 2 (L + B) H", "Rectangular column: V = B × D × H;  formwork = 2 (B + D) H", "Round column: V = π D² H / 4;  formwork = π D H", "Wall: V = (L × H − openings) × t;  formwork = 2 × (L × H − openings)", "Mass = V × ρ;  order volume = V × (1 + waste %)"],
  assumptions: ["Prismatic solid elements; no chamfers, voids or reinforcement volume deducted.", "Formwork for slabs assumes soffit plus edges; walls assume both faces."],
  limits: ["Quantities for planning only; no concrete mix design, rebar scheduling or temporary works.", "Check against the drawings and a measured takeoff before ordering."],
};

/* ------------------------------------------------------------- units */
const unitMod: Mod = {
  id: "units", name: "Unit conversion", blurb: "Convert engineering quantities and see the conversion factor and base-unit value.",
  selects: [{ k: "cat", label: "Quantity", def: "Length", options: (Object.keys(UNITS) as UCat[]).map((c) => [c, c]) }, { k: "from", label: "From", def: "in", options: [] }, { k: "to", label: "To", def: "mm", options: [] }],
  inputs: [{ k: "v", label: "Value", min: -1e12, max: 1e12, def: "10", step: 0.001 }],
  presets: { "10 in → mm": { vals: { v: "10" }, sel: { cat: "Length", from: "in", to: "mm" } }, "30 MPa → psi": { vals: { v: "30" }, sel: { cat: "Stress", from: "MPa", to: "psi" } }, "50 kN → kip": { vals: { v: "50" }, sel: { cat: "Force", from: "kN", to: "kip" } }, "2.5 m³ → ft³": { vals: { v: "2.5" }, sel: { cat: "Volume", from: "m³", to: "ft³" } } },
  validate: (_n, s) => (UNITS[s.cat as UCat]?.units[s.from] === undefined || UNITS[s.cat as UCat]?.units[s.to] === undefined ? ["Choose units that belong to the selected quantity."] : []),
  run: (n, s) => {
    const cat = s.cat as UCat, r = convert(cat, n.v, s.from, s.to), u = UNITS[cat];
    const rows: Out["rows"] = [["Converted value", f(r.result, 6), s.to], ["Conversion factor", f(r.factor, 8), `${s.to} per ${s.from}`], ["Value in SI base unit", f(r.base, 6), u.base]];
    const steps: Step[] = [{ t: `Check that “${s.from}” and “${s.to}” are both ${cat.toLowerCase()} units (dimension check).` }, { t: `Convert to the base unit (${u.base}):`, f: `${f(n.v, 6)} ${s.from} × ${u.units[s.from]} = ${f(r.base, 6)} ${u.base}` }, { t: `Convert from the base unit to ${s.to}:`, f: `${f(r.base, 6)} ${u.base} ÷ ${u.units[s.to]} = ${f(r.result, 6)} ${s.to}` }];
    const all = Object.entries(u.units).map(([k, fac]) => ({ k, v: r.base / fac }));
    const maxLog = Math.max(...all.map((a) => Math.abs(Math.log10(Math.abs(a.v) || 1e-9)))) || 1;
    const diag = (
      <svg viewBox="0 0 600 340" className="block w-full" role="img" aria-label="The same value expressed in every unit of the quantity"><rect width="600" height="340" fill="#0a0f0c" />
        <text x="20" y="28" fontSize="13" fill={C.ink}>{f(n.v, 4)} {s.from} expressed in every {cat.toLowerCase()} unit</text>
        {all.map((a, i) => <g key={a.k}><text x="20" y={64 + i * 34} fontSize="12" fill={a.k === s.to ? C.brand : C.dim}>{a.k}</text><rect x="90" y={50 + i * 34} width={Math.max(4, (Math.abs(Math.log10(Math.abs(a.v) || 1e-9)) / maxLog) * 300)} height="16" fill={a.k === s.to ? C.brand : "#334155"} /><text x="400" y={64 + i * 34} fontSize="12" fill={a.k === s.to ? C.brand : C.ink}>{f(a.v, 6)}</text></g>)}
      </svg>
    );
    return { rows, steps, diag };
  },
  formulas: () => ["value in base unit = value × factor(from)", "result = value in base unit ÷ factor(to)", "Base units: m, m², m³, N, Pa, kg, N·m"],
  assumptions: ["Exact or internationally agreed factors (for example 1 in = 25.4 mm, 1 lbf = 4.4482216152605 N)."],
  limits: ["US and UK gallons, temperatures and mixed-unit expressions are not included.", "Always keep units consistent through a calculation: a unit slip is one of the commonest sources of error."],
};

/* ------------------------------------------------------------- loads */
const loadMod: Mod = {
  id: "loads", name: "Simplified load summary", blurb: "Floor area loads, a line load on a beam and an illustrative factored combination.",
  selects: [{ k: "occ", label: "Occupancy (sample live load)", def: "Office", options: Object.keys(OCCUPANCY).map((k) => [k, `${k} (${OCCUPANCY[k].q} kPa)`]) }],
  inputs: [
    { k: "Lx", label: "Floor length", unit: "m", min: 1, max: 200, def: "6" }, { k: "Ly", label: "Floor width", unit: "m", min: 1, max: 200, def: "4" },
    { k: "t", label: "Concrete slab thickness", unit: "mm", min: 50, max: 600, def: "150" }, { k: "fin", label: "Finishes and services", unit: "kPa", min: 0, max: 10, def: "1.5" },
    { k: "q", label: "Live load", unit: "kPa", min: 0, max: 20, def: "2.5", help: "Preset from the occupancy; you can overwrite it" },
    { k: "gf", label: "Dead-load factor (illustrative)", min: 1, max: 2, step: 0.05, def: "1.35" }, { k: "qf", label: "Live-load factor (illustrative)", min: 1, max: 2, step: 0.05, def: "1.5" },
    { k: "span", label: "Supporting beam span", unit: "m", min: 1, max: 50, def: "6" }, { k: "trib", label: "Tributary width of the beam", unit: "m", min: 0.1, max: 50, def: "3" },
  ],
  presets: { "Office floor 6 × 4 m": { vals: { Lx: "6", Ly: "4", t: "150", fin: "1.5", q: "2.5", gf: "1.35", qf: "1.5", span: "6", trib: "3" }, sel: { occ: "Office" } }, "Residential floor 5 × 4 m": { vals: { Lx: "5", Ly: "4", t: "200", fin: "1.2", q: "1.5", gf: "1.35", qf: "1.5", span: "5", trib: "2" }, sel: { occ: "Residential rooms" } }, "Retail floor 8 × 6 m": { vals: { Lx: "8", Ly: "6", t: "200", fin: "1.8", q: "4", gf: "1.35", qf: "1.5", span: "8", trib: "3" }, sel: { occ: "Retail" } } },
  validate: (n) => (n.trib > Math.max(n.Lx, n.Ly) ? ["The tributary width cannot exceed the larger floor dimension."] : []),
  run: (n) => {
    const g = (25 * n.t) / 1000 + n.fin, r = loads({ Lx: n.Lx, Ly: n.Ly, g, q: n.q, gf: n.gf, qf: n.qf, beamSpan: n.span, trib: n.trib });
    const rows: Out["rows"] = [["Dead load g (slab + finishes)", f(g, 2), "kPa"], ["Live load q", f(n.q, 2), "kPa"], ["Characteristic area load g + q", f(r.char, 2), "kPa"], ["Factored area load (illustrative)", f(r.uls, 2), "kPa"], ["Floor area", f(r.area, 1), "m²"], ["Total characteristic floor load", f(r.floorChar, 1), "kN"], ["Total factored floor load", f(r.floorUls, 1), "kN"], ["Characteristic line load on beam", f(r.lineChar, 2), "kN/m"], ["Factored line load on beam", f(r.lineUls, 2), "kN/m"], ["Factored reaction at each beam end", f(r.beamEndReaction, 1), "kN"]];
    const steps: Step[] = [{ t: "Dead load from the slab (concrete 25 kN/m³) plus finishes:", f: `g = 25 × ${f(n.t / 1000, 3)} + ${f(n.fin)} = ${f(g, 2)} kPa` }, { t: "Characteristic and factored area loads:", f: `g + q = ${f(g, 2)} + ${f(n.q, 2)} = ${f(r.char, 2)} kPa;  γg g + γq q = ${f(n.gf, 2)} × ${f(g, 2)} + ${f(n.qf, 2)} × ${f(n.q, 2)} = ${f(r.uls, 2)} kPa` }, { t: "Floor totals:", f: `A = ${f(n.Lx)} × ${f(n.Ly)} = ${f(r.area, 1)} m²;  W = ${f(r.uls, 2)} × ${f(r.area, 1)} = ${f(r.floorUls, 1)} kN` }, { t: "Line load on a beam from its tributary width, and its end reactions:", f: `w = ${f(r.uls, 2)} × ${f(n.trib)} = ${f(r.lineUls, 2)} kN/m;  R = w L / 2 = ${f(r.beamEndReaction, 1)} kN` }];
    const sc = 360 / Math.max(n.Lx, n.Ly), W = n.Lx * sc, Hh = n.Ly * sc, ox = 300 - W / 2, oy = 160 - Hh / 2 + 20, tw = Math.min(n.trib, n.Ly) * sc;
    const diag = (
      <svg viewBox="0 0 600 340" className="block w-full" role="img" aria-label="Floor plan with the tributary strip of the beam"><rect width="600" height="340" fill="#0a0f0c" />
        <rect x={ox} y={oy} width={W} height={Hh} fill="#1b271f" stroke={C.ink} />
        <rect x={ox} y={oy + Hh / 2 - tw / 2} width={W} height={tw} fill={C.brand} opacity="0.25" stroke={C.brand} strokeDasharray="5 3" />
        <line x1={ox} y1={oy + Hh / 2} x2={ox + W} y2={oy + Hh / 2} stroke={C.amber} strokeWidth="3" /><text x={300} y={oy + Hh / 2 - 6} fontSize="12" fill={C.amber} textAnchor="middle">beam · w = {f(r.lineUls, 2)} kN/m</text>
        {[[ox, oy], [ox + W, oy], [ox, oy + Hh], [ox + W, oy + Hh]].map(([x, y], i) => <rect key={i} x={x - 5} y={y - 5} width="10" height="10" fill={C.red} />)}
        <text x={300} y={oy + Hh + 26} fontSize="12" fill={C.ink} textAnchor="middle">{f(n.Lx)} m</text><text x={ox - 12} y={oy + Hh / 2 + 40} fontSize="12" fill={C.ink} textAnchor="end">{f(n.Ly)} m</text>
        <text x={300} y={oy + Hh / 2 + tw / 2 + 16} fontSize="11" fill={C.brand} textAnchor="middle">tributary width {f(n.trib)} m</text>
        <text x={300} y="322" fontSize="13" fill={C.ink} textAnchor="middle">Factored floor load {f(r.floorUls, 0)} kN · {f(r.uls, 2)} kPa</text>
      </svg>
    );
    return { rows, steps, diag };
  },
  formulas: () => ["g = 25 kN/m³ × t + finishes", "Characteristic load = g + q;  illustrative factored load = γg g + γq q", "Line load w = factored area load × tributary width", "Simply supported beam end reaction R = w L / 2"],
  assumptions: ["Uniformly distributed loads; one way of spanning; the beam carries a strip of the tributary width.", "Live-load values per occupancy are sample figures, and the 1.35 / 1.5 factors are illustrative."],
  limits: ["Not a load takedown to any code: no load reduction, partitions, wind, snow, seismic or accidental combinations.", "Use the loads required by the applicable design code and have them checked by an engineer."],
};

export const MODS: Mod[] = [beamMod, secMod, qtyMod, unitMod, loadMod];
export function unitOptions(cat: string): [string, string][] { return Object.keys(UNITS[cat as UCat]?.units ?? {}).map((u) => [u, u]); }
