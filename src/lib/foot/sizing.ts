/**
 * Shoe-size engine. Everything here is a GENERAL CONVENTION applied to a measured foot, not any brand's chart.
 * Rules are data (RULESET) so they can be reviewed, versioned and changed; brand charts are optional data supplied by the operator.
 */
export type Fit = "snug" | "regular" | "roomy";
export type Sex = "men" | "women";

export const RULESET = {
  id: "general-v1", date: "2026-10-27",
  description: "Last length = foot length + toe allowance. EU = last length ÷ 6.667 mm (Paris point, 2/3 cm). UK = last length in inches × 3 − 25 (barleycorn 1/3 in). US men's = UK + 1. US women's = US men's + 1.5. These are widely used conventions; real lasts and brands deviate, so results are estimates.",
  allowanceMm: { snug: 8, regular: 12, roomy: 17 } as Record<Fit, number>,
  parisPointMm: 6.6667, barleycornMm: 25.4 / 3, ukOffset: 25, usMenOffset: 1, usWomenOffset: 2.5,
  halfSizeStep: 0.5,
  /** width category by foot width ÷ foot length. A heuristic split, not a standard; tune per population. */
  widthRatio: { narrow: 0.36, wide: 0.405, extraWide: 0.43 },
  /** adult range that the conventions above are reasonable for */
  supportedFootLengthMm: [200, 320] as [number, number],
};

export interface SizeResult {
  footLengthMm: number; allowanceMm: number; lastLengthMm: number; fit: Fit;
  eu: number; uk: number; usMen: number; usWomen: number;
  euExact: number; ukExact: number; roundedTo: number; rulesetId: string;
  steps: string[]; notes: string[]; inRange: boolean;
}
const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const f1 = (v: number) => Math.round(v * 10) / 10;

export function sizeFromFoot(footLengthMm: number, fit: Fit = "regular", allowanceOverrideMm?: number): SizeResult {
  const R = RULESET; const allowance = allowanceOverrideMm ?? R.allowanceMm[fit]; const last = footLengthMm + allowance;
  const euExact = last / R.parisPointMm; const ukExact = (last / R.barleycornMm) - R.ukOffset;
  const eu = roundTo(euExact, 0.5), uk = roundTo(ukExact, R.halfSizeStep), usMen = uk + R.usMenOffset, usWomen = uk + R.usWomenOffset;
  const notes: string[] = []; const [lo, hi] = R.supportedFootLengthMm; const inRange = footLengthMm >= lo && footLengthMm <= hi;
  if (footLengthMm > hi) notes.push(`This foot is longer than ${hi} mm. The conventions above extend mathematically but many brands stop before this size; check the brand's largest available size.`);
  if (footLengthMm < lo) notes.push(`This foot is shorter than ${lo} mm (a child-size range). Children's sizing differs; treat the numbers as indicative only.`);
  notes.push("US men's and US women's sizes are different scales and are not interchangeable.");
  const steps = [
    `Foot length ${f1(footLengthMm)} mm + ${allowance} mm allowance (${allowanceOverrideMm != null ? "custom" : fit}) = last length ${f1(last)} mm.`,
    `EU: ${f1(last)} ÷ ${f1(R.parisPointMm * 1000) / 1000} mm = ${f1(euExact)} → rounded to nearest half size = ${eu}.`,
    `UK: ${f1(last)} mm ÷ ${f1(R.barleycornMm * 100) / 100} mm per barleycorn − ${R.ukOffset} = ${f1(ukExact)} → nearest half size = ${uk}.`,
    `US men's = UK + ${R.usMenOffset} = ${usMen}. US women's = UK + ${R.usWomenOffset} = ${usWomen}.`,
  ];
  return { footLengthMm, allowanceMm: allowance, lastLengthMm: f1(last), fit, eu, uk, usMen, usWomen, euExact: f1(euExact), ukExact: f1(ukExact), roundedTo: 0.5, rulesetId: R.id, steps, notes, inRange };
}

export type WidthClass = "narrow" | "standard" | "wide" | "extra wide";
export function widthClass(widthMm: number, lengthMm: number): { cls: WidthClass; ratio: number; note: string } {
  const r = widthMm / lengthMm; const t = RULESET.widthRatio; const cls: WidthClass = r < t.narrow ? "narrow" : r < t.wide ? "standard" : r < t.extraWide ? "wide" : "extra wide";
  return { cls, ratio: Math.round(r * 1000) / 1000, note: "Width class is a heuristic from the width ÷ length ratio of the top-view silhouette. It does not measure girth or instep height." };
}

/* ───────── shoe profiles and brand charts (configurable data) ───────── */
export interface ShoeProfile {
  id: string; name: string; kind: string; sample: boolean;
  /** internal length (insole) as a fraction of nothing: we store allowance and width tolerance directly */
  allowanceMm: number; maxWidthRatio: number; minWidthRatio: number; note: string;
}
/** SAMPLE profiles for demonstration. They describe generic shoe types, not real products, and no stock levels exist. */
export const SAMPLE_PROFILES: ShoeProfile[] = [
  { id: "running", name: "Sample · Running shoe", kind: "Running", sample: true, allowanceMm: 15, minWidthRatio: 0.34, maxWidthRatio: 0.42, note: "Needs thumb-width room at the toe because feet swell and slide when running." },
  { id: "dress", name: "Sample · Dress / formal shoe", kind: "Dress", sample: true, allowanceMm: 10, minWidthRatio: 0.35, maxWidthRatio: 0.395, note: "Tapered toe box; fits closer. Wide feet may feel pinched." },
  { id: "sneaker", name: "Sample · Casual sneaker", kind: "Casual", sample: true, allowanceMm: 12, minWidthRatio: 0.34, maxWidthRatio: 0.415, note: "Typical everyday fit." },
  { id: "boot", name: "Sample · Work / hiking boot", kind: "Boot", sample: true, allowanceMm: 17, minWidthRatio: 0.345, maxWidthRatio: 0.43, note: "Extra room for thick socks and downhill toe-sliding." },
  { id: "sandal", name: "Sample · Sandal", kind: "Sandal", sample: true, allowanceMm: 6, minWidthRatio: 0.33, maxWidthRatio: 0.44, note: "Foot should sit within the footbed with a small margin at the heel and toe." },
];
export interface BrandChartRow { eu?: number; uk?: number; usMen?: number; usWomen?: number; footLengthMm: number }
export interface BrandChart { id: string; brand: string; model?: string; source: string; sourceDate: string; rows: BrandChartRow[] }
/** No official brand chart is shipped. Operators add charts here (or via configuration) with a source URL/date; until then brand mapping is disabled. */
export const BRAND_CHARTS: BrandChart[] = [];

export interface Recommendation { profile: ShoeProfile; size: SizeResult; widthFit: "good" | "tight" | "loose"; widthNote: string; summary: string; brandSize?: { chart: string; size: string } }
export function recommend(footLengthMm: number, footWidthMm: number, profile: ShoeProfile, fitPref: Fit = "regular", charts: BrandChart[] = BRAND_CHARTS): Recommendation {
  const size = sizeFromFoot(footLengthMm, fitPref, profile.allowanceMm + (fitPref === "snug" ? -3 : fitPref === "roomy" ? 3 : 0));
  const r = footWidthMm / footLengthMm; const widthFit = r > profile.maxWidthRatio ? "tight" : r < profile.minWidthRatio ? "loose" : "good";
  const widthNote = widthFit === "tight" ? `Foot width ratio ${f1(r * 1000) / 1000} is above this style's comfortable range (${profile.maxWidthRatio}). Consider a wide fitting or a half size up.` : widthFit === "loose" ? `Foot width ratio ${f1(r * 1000) / 1000} is below this style's range (${profile.minWidthRatio}); a narrower fitting or lacing may help.` : `Foot width ratio ${f1(r * 1000) / 1000} sits within this style's range.`;
  let brandSize: Recommendation["brandSize"];
  for (const c of charts) { const row = [...c.rows].sort((a, b) => a.footLengthMm - b.footLengthMm).find((x) => x.footLengthMm >= footLengthMm); if (row) { brandSize = { chart: `${c.brand}${c.model ? " " + c.model : ""} (${c.source}, ${c.sourceDate})`, size: [row.eu && `EU ${row.eu}`, row.uk && `UK ${row.uk}`, row.usMen && `US M ${row.usMen}`, row.usWomen && `US W ${row.usWomen}`].filter(Boolean).join(" · ") }; break; } }
  const summary = `${profile.name}: EU ${size.eu} · UK ${size.uk} · US men's ${size.usMen} · US women's ${size.usWomen}. ${widthNote}`;
  return { profile, size, widthFit, widthNote, summary, brandSize };
}

/** Left/right comparison. Positive = left is larger. */
export function compareFeet(l: { lengthMm: number; widthMm: number }, r: { lengthMm: number; widthMm: number }) {
  const dl = f1(l.lengthMm - r.lengthMm), dw = f1(l.widthMm - r.widthMm); const bigger = Math.abs(dl) < 1 ? "similar" : dl > 0 ? "left" : "right";
  return { lengthDiffMm: dl, widthDiffMm: dw, largerFoot: bigger as "left" | "right" | "similar", advice: bigger === "similar" ? "The two feet are within 1 mm in length. Size by either foot." : `The ${bigger} foot is ${Math.abs(dl)} mm longer. Fit shoes to the larger foot; a small difference between feet is normal.` };
}
export const mmToIn = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
