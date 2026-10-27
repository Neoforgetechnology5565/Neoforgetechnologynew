/**
 * Transparent engineering formulas for the Engineering Calculation Workbench demo.
 * Pure functions, SI-based. Simplified textbook cases only: not a design check, no safety factors or code compliance.
 */

/* ------------------------------------------------------------- beams */
export type BeamCase = "ss-udl" | "ss-central" | "ss-point" | "cant-udl" | "cant-point";
export interface BeamIn { c: BeamCase; L: number; w: number; P: number; a: number; E: number; I: number; c_mm: number; fy: number }
/** L in m, w in kN/m, P in kN, a in m, E in GPa, I in mm⁴, c_mm = distance to extreme fibre in mm, fy in MPa */
export interface BeamOut {
  RA: number; RB: number; MA: number; Vmax: number; Mmax: number; xM: number; defl: number; xD: number; EI: number; sigma: number; util: number; ratio: number; ok: boolean;
  x: number[]; V: number[]; M: number[]; y: number[];
}
const N = 101;
export function beam(i: BeamIn): BeamOut {
  const { c, L, w, P, a } = i, b = L - a;
  const EI = i.E * 1e6 * i.I * 1e-12; // kN·m²  (GPa → kN/m², mm⁴ → m⁴)
  const x = Array.from({ length: N }, (_, k) => (L * k) / (N - 1));
  let RA = 0, RB = 0, MA = 0, V: (x: number) => number, M: (x: number) => number, Y: (x: number) => number;
  if (c === "ss-udl") { RA = RB = (w * L) / 2; V = (t) => RA - w * t; M = (t) => RA * t - (w * t * t) / 2; Y = (t) => (w * t * (L ** 3 - 2 * L * t * t + t ** 3)) / (24 * EI); }
  else if (c === "ss-central") { RA = RB = P / 2; V = (t) => (t < L / 2 ? P / 2 : -P / 2); M = (t) => (t <= L / 2 ? (P * t) / 2 : (P * (L - t)) / 2); Y = (t) => { const s = t <= L / 2 ? t : L - t; return (P * s * (3 * L * L - 4 * s * s)) / (48 * EI); }; }
  else if (c === "ss-point") { RA = (P * b) / L; RB = (P * a) / L; V = (t) => (t < a ? RA : -RB); M = (t) => (t <= a ? RA * t : RB * (L - t)); Y = (t) => (t <= a ? (P * b * t * (L * L - b * b - t * t)) / (6 * L * EI) : (P * a * (L - t) * (2 * L * t - t * t - a * a)) / (6 * L * EI)); }
  else if (c === "cant-udl") { RA = w * L; MA = (w * L * L) / 2; V = (t) => w * (L - t); M = (t) => -(w * (L - t) ** 2) / 2; Y = (t) => (w * t * t * (6 * L * L - 4 * L * t + t * t)) / (24 * EI); }
  else { RA = P; MA = P * L; V = () => P; M = (t) => -P * (L - t); Y = (t) => (P * t * t * (3 * L - t)) / (6 * EI); }
  const Vs = x.map(V), Ms = x.map(M), Ys = x.map(Y);
  const Mmax = Math.max(...Ms.map(Math.abs)), Vmax = Math.max(...Vs.map(Math.abs)), defl = Math.max(...Ys.map(Math.abs));
  const xM = x[Ms.map(Math.abs).indexOf(Mmax)], xD = x[Ys.map(Math.abs).indexOf(defl)];
  const S = i.I / i.c_mm; // mm³
  const sigma = (Mmax * 1e6) / S; // kN·m → N·mm; N/mm² = MPa
  return { RA, RB, MA, Vmax, Mmax, xM, defl: defl * 1000, xD, EI, sigma, util: sigma / i.fy, ratio: defl > 0 ? L / defl : Infinity, ok: sigma <= i.fy && L / (defl || 1e-12) >= 360, x, V: Vs, M: Ms, y: Ys.map((v) => v * 1000) };
}
/** Closed-form maxima for cross-checking the diagram arrays. */
export function beamClosedForm(i: BeamIn) {
  const { c, L, w, P, a } = i, b = L - a, EI = i.E * 1e6 * i.I * 1e-12;
  if (c === "ss-udl") return { M: (w * L * L) / 8, d: (5 * w * L ** 4) / (384 * EI) };
  if (c === "ss-central") return { M: (P * L) / 4, d: (P * L ** 3) / (48 * EI) };
  if (c === "ss-point") { const [s, l] = a >= b ? [b, a] : [a, b]; return { M: (P * a * b) / L, d: (P * s * (L * L - s * s) ** 1.5) / (9 * Math.sqrt(3) * L * EI) + 0 * l }; }
  if (c === "cant-udl") return { M: (w * L * L) / 2, d: (w * L ** 4) / (8 * EI) };
  return { M: P * L, d: (P * L ** 3) / (3 * EI) };
}

/* ----------------------------------------------------------- sections */
export type Shape = "rect" | "circle" | "rhs" | "tube" | "ibeam";
export interface SecIn { shape: Shape; b: number; h: number; d: number; t: number; tf: number; tw: number; rho: number }
export interface SecOut { A: number; yc: number; Ix: number; Iy: number; Zx: number; Zy: number; rx: number; ry: number; mass: number; ymax: number }
/** Dimensions in mm, rho in kg/m³. Areas mm², inertia mm⁴, modulus mm³, mass kg/m. */
export function section(s: SecIn): SecOut {
  let A = 0, Ix = 0, Iy = 0, H = s.h, B = s.b;
  if (s.shape === "rect") { A = s.b * s.h; Ix = (s.b * s.h ** 3) / 12; Iy = (s.h * s.b ** 3) / 12; }
  else if (s.shape === "circle") { H = B = s.d; A = (Math.PI * s.d ** 2) / 4; Ix = Iy = (Math.PI * s.d ** 4) / 64; }
  else if (s.shape === "rhs") { const bi = s.b - 2 * s.t, hi = s.h - 2 * s.t; A = s.b * s.h - bi * hi; Ix = (s.b * s.h ** 3 - bi * hi ** 3) / 12; Iy = (s.h * s.b ** 3 - hi * bi ** 3) / 12; }
  else if (s.shape === "tube") { H = B = s.d; const di = s.d - 2 * s.t; A = (Math.PI * (s.d ** 2 - di ** 2)) / 4; Ix = Iy = (Math.PI * (s.d ** 4 - di ** 4)) / 64; }
  else { const hw = s.h - 2 * s.tf; A = 2 * s.b * s.tf + hw * s.tw; Ix = (s.b * s.h ** 3 - (s.b - s.tw) * hw ** 3) / 12; Iy = (2 * s.tf * s.b ** 3 + hw * s.tw ** 3) / 12; }
  return { A, yc: H / 2, Ix, Iy, Zx: Ix / (H / 2), Zy: Iy / (B / 2), rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A), mass: (A * 1e-6 * s.rho), ymax: H / 2 };
}

/* ---------------------------------------------------------- quantities */
export type QShape = "slab" | "column-rect" | "column-round" | "wall";
export interface QIn { shape: QShape; L: number; B: number; H: number; D: number; n: number; openings: number; rho: number; waste: number }
/** Metres, openings in m² (walls), rho in kg/m³, waste in %. */
export function quantity(q: QIn) {
  let vol = 0, formwork = 0;
  if (q.shape === "slab") { vol = q.L * q.B * q.H; formwork = q.L * q.B + 2 * (q.L + q.B) * q.H; }
  else if (q.shape === "column-rect") { vol = q.B * q.D * q.H; formwork = 2 * (q.B + q.D) * q.H; }
  else if (q.shape === "column-round") { vol = (Math.PI * q.D ** 2 * q.H) / 4; formwork = Math.PI * q.D * q.H; }
  else { const gross = q.L * q.H; const net = Math.max(0, gross - q.openings); vol = net * q.B; formwork = 2 * net; }
  const one = { vol, formwork }, total = { vol: vol * q.n, formwork: formwork * q.n };
  const order = total.vol * (1 + q.waste / 100);
  return { one, total, mass: (total.vol * q.rho) / 1000, order, orderMass: (order * q.rho) / 1000 };
}

/* --------------------------------------------------------- conversions */
export type UCat = "Length" | "Area" | "Volume" | "Force" | "Stress" | "Mass" | "Moment";
/** Factors convert one unit of the named unit into the SI base unit of the category. */
export const UNITS: Record<UCat, { base: string; units: Record<string, number> }> = {
  Length: { base: "m", units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144 } },
  Area: { base: "m²", units: { "mm²": 1e-6, "cm²": 1e-4, "m²": 1, "in²": 6.4516e-4, "ft²": 0.09290304 } },
  Volume: { base: "m³", units: { "cm³": 1e-6, L: 1e-3, "m³": 1, "in³": 1.6387064e-5, "ft³": 0.028316846592, "yd³": 0.764554857984 } },
  Force: { base: "N", units: { N: 1, kN: 1000, MN: 1e6, lbf: 4.4482216152605, kip: 4448.2216152605 } },
  Stress: { base: "Pa", units: { Pa: 1, kPa: 1e3, MPa: 1e6, GPa: 1e9, psi: 6894.757293168, ksi: 6894757.293168 } },
  Mass: { base: "kg", units: { g: 0.001, kg: 1, t: 1000, lb: 0.45359237 } },
  Moment: { base: "N·m", units: { "N·m": 1, "kN·m": 1000, "kN·mm": 1, "lbf·ft": 1.3558179483314, "kip·ft": 1355.8179483314 } },
};
export function convert(cat: UCat, value: number, from: string, to: string) {
  const u = UNITS[cat].units; const f = u[from], t = u[to];
  if (f === undefined || t === undefined) throw new Error("Unknown unit");
  return { result: (value * f) / t, factor: f / t, base: value * f };
}

/* --------------------------------------------------------------- loads */
export const OCCUPANCY: Record<string, { q: number; note: string }> = {
  "Residential rooms": { q: 1.5, note: "Illustrative" }, "Office": { q: 2.5, note: "Illustrative" }, "Corridors and stairs": { q: 4.0, note: "Illustrative" }, "Retail": { q: 4.0, note: "Illustrative" }, "Roof (no access)": { q: 0.6, note: "Illustrative" },
};
export interface LIn { Lx: number; Ly: number; g: number; q: number; gf: number; qf: number; beamSpan: number; trib: number }
/** Metres, kPa; gf/qf are illustrative partial factors. */
export function loads(i: LIn) {
  const area = i.Lx * i.Ly, char = i.g + i.q, uls = i.gf * i.g + i.qf * i.q;
  return { area, char, uls, floorChar: char * area, floorUls: uls * area, lineChar: char * i.trib, lineUls: uls * i.trib, beamEndReaction: (uls * i.trib * i.beamSpan) / 2, colTrib: (i.Lx / 2) * (i.Ly / 2) * 4, colLoad: uls * i.Lx * i.Ly };
}
