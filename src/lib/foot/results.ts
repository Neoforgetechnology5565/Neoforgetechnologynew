/** Turns captures into per-side results, comparison and size recommendations. Pure functions: used by the API and the browser. */
import type { CaptureDTO, SessionDTO, SideResult } from "./api-types";
import { SAMPLE_PROFILES, compareFeet, recommend, sizeFromFoot, widthClass, type Fit, type Recommendation, type SizeResult } from "./sizing";
import type { Side } from "./types";

export function activeAnalysis(c: CaptureDTO) { return c.use === "manual" && c.manual?.ok ? c.manual : c.auto; }
/** The capture used for each side: the explicit choice if it still exists and measured, otherwise the newest capture that measured. */
export function pickActive(session: Pick<SessionDTO, "activeCapture">, captures: CaptureDTO[]): Record<Side, CaptureDTO | undefined> {
  const out = {} as Record<Side, CaptureDTO | undefined>;
  for (const side of ["left", "right"] as Side[]) {
    const mine = captures.filter((c) => c.side === side && activeAnalysis(c).ok);
    const chosen = mine.find((c) => c.id === session.activeCapture[side]);
    out[side] = chosen ?? [...mine].sort((a, b) => b.createdAt - a.createdAt)[0];
  }
  return out;
}
export function sideResult(c: CaptureDTO): SideResult | null {
  const a = activeAnalysis(c); const m = a.measurement; if (!a.ok || !m) return null;
  return { captureId: c.id, source: c.source, method: c.use === "manual" && c.manual?.ok ? "manual" : "auto", grade: a.grade, calibration: "calibrated", lengthMm: m.lengthMm, widthMm: m.widthMm, ballWidthMm: m.ballWidthMm, heelWidthMm: m.heelWidthMm, areaCm2: m.areaCm2, widthLengthRatio: m.widthLengthRatio, rawLengthMm: m.rawLengthMm, parallaxBoundMm: m.parallaxBoundMm, warnings: a.warnings, outlineMm: m.outlineMm, axis: m.axis, sample: c.source === "sample" };
}
export interface Results {
  left?: SideResult; right?: SideResult;
  comparison?: ReturnType<typeof compareFeet>;
  fitFoot?: { side: Side | "either"; lengthMm: number; widthMm: number };
  size?: SizeResult; width?: ReturnType<typeof widthClass>; recommendations: Recommendation[];
  method: string[]; limitations: string[]; anySample: boolean;
}
export const METHOD_STATEMENT = [
  "A sheet of A4 or US Letter paper is the scale reference. Its four corners give a perspective transform from the photo to the paper plane in millimetres.",
  "The photo is rectified onto the paper plane, the foot is separated from the paper by colour/brightness, and length and width are measured along the foot's principal axis at 0.5 mm resolution.",
  "A top-view silhouette sits above the paper and looks slightly larger. An assumed silhouette height (25 mm) and the estimated camera height are used to correct this; the remaining uncertainty is reported as a bound, not a statistical confidence.",
  "Only length, width, forefoot (ball) width and heel width are measured. Girth, instep height and arch height need depth or multi-view data and are not reported.",
];
export const LIMITATIONS = [
  "Accuracy depends on a flat sheet, a bare or dark-sock foot, even light and a phone held roughly straight above the sheet. It has not been validated against clinical or industrial foot scanners.",
  "Shoe sizes are estimates from general conversion rules, not any brand's official chart, and not a guarantee of fit.",
  "Foot width class is a heuristic from the width-to-length ratio.",
];
export function buildResults(session: SessionDTO, captures: CaptureDTO[], fit: Fit = session.fit, allowanceMm?: number): Results {
  const act = pickActive(session, captures); const left = act.left && sideResult(act.left) || undefined, right = act.right && sideResult(act.right) || undefined;
  const res: Results = { left, right, recommendations: [], method: METHOD_STATEMENT, limitations: LIMITATIONS, anySample: !!(left?.sample || right?.sample) };
  if (left && right) res.comparison = compareFeet(left, right);
  const feet = [left && { side: "left" as Side, ...left }, right && { side: "right" as Side, ...right }].filter(Boolean) as (SideResult & { side: Side })[];
  if (feet.length) {
    const big = feet.reduce((a, b) => (b.lengthMm > a.lengthMm ? b : a)); const similar = feet.length === 2 && Math.abs(feet[0].lengthMm - feet[1].lengthMm) < 1;
    res.fitFoot = { side: similar ? "either" : big.side, lengthMm: big.lengthMm, widthMm: Math.max(...feet.map((f) => f.widthMm)) };
    res.size = sizeFromFoot(res.fitFoot.lengthMm, fit, allowanceMm); res.width = widthClass(res.fitFoot.widthMm, res.fitFoot.lengthMm);
    res.recommendations = SAMPLE_PROFILES.map((p) => recommend(res.fitFoot!.lengthMm, res.fitFoot!.widthMm, p, fit));
  }
  return res;
}
