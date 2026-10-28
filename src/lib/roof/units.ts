/** Units. Everything is stored in metres and square metres; conversion happens only for display. */
export type Unit = "m" | "cm" | "ft" | "in";
export const UNITS: Unit[] = ["m", "cm", "ft", "in"];
export const UNIT_LABEL: Record<Unit, string> = { m: "metres", cm: "centimetres", ft: "feet", in: "inches" };
const M_PER: Record<Unit, number> = { m: 1, cm: 0.01, ft: 0.3048, in: 0.0254 };
export const fromMetres = (v: number, u: Unit) => v / M_PER[u];
export const toMetres = (v: number, u: Unit) => v * M_PER[u];
export const areaFromM2 = (v: number, u: Unit) => v / (M_PER[u] * M_PER[u]);
export const AREA_SUFFIX: Record<Unit, string> = { m: "m²", cm: "cm²", ft: "ft²", in: "in²" };
const nf = (d: number) => (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtLen = (m: number, u: Unit) => { const v = fromMetres(m, u); return `${nf(v >= 100 ? 1 : 2)(v)} ${u}`; };
export const fmtArea = (m2: number, u: Unit) => { const v = areaFromM2(m2, u); return `${nf(v >= 1000 ? 0 : v >= 100 ? 1 : 2)(v)} ${AREA_SUFFIX[u]}`; };
/** Pitch conventions: slope angle in degrees from horizontal; pitch as vertical rise per 12 units of horizontal run (rise = 12·tan θ). */
export const pitchToRise12 = (deg: number) => 12 * Math.tan((deg * Math.PI) / 180);
export const riseToDeg = (r: number) => (Math.atan(r / 12) * 180) / Math.PI;
