/**
 * PropertyVision AI condition-scoring engine (module 3), TypeScript port of services/ml-lab/app/property.py `score_property`.
 * Pure functions: the same rules and constants run in the browser (default) and on the Python service, and tests check them against each other.
 * It turns the real outputs of the CLIP classifier and the YOLO detector, plus three image measurements, into an EXPERIMENTAL 0-100 score in which
 * every factor is labelled "observed" (measured) or "assumption" (our interpretation). It does not prove that a property is distressed.
 */
export const CLASSES = ["residential_house", "commercial_building", "vacant_land", "mobile_home"] as const;
export const CLASS_LABEL: Record<string, string> = { residential_house: "Residential house", commercial_building: "Commercial building", vacant_land: "Vacant land", mobile_home: "Mobile home" };
export interface Cls { label: string; probability: number; margin: number }
export interface DetLite { label: string; score: number }
export interface Meas { green_percent: number; sharpness: number; brightness: number }
export interface Factor { key: string; label: string; kind: "observed" | "assumption"; points: number; observed: string; meaning: string }
export interface ScoreResult { value: number; band: string; baseline: number; factors: Factor[]; explanation: string[]; evidence_strength: string; evidence_notes: string[]; cannot_see: string[]; disclaimer: string }

export const BASELINE = 60;
const VEHICLES = new Set(["car", "truck", "bus", "motorcycle"]), PEOPLE = new Set(["person"]), TIDY = new Set(["potted plant", "bench"]);
const HOUSEHOLD = new Set(["couch", "chair", "bed", "tv", "refrigerator", "toilet", "sink", "microwave", "oven", "suitcase", "dining table"]);
const BANDS: [number, string][] = [[75, "Looks well kept, from what a photo can show"], [55, "Neutral: little or conflicting evidence"], [35, "Some visible concerns (check in person)"], [0, "Several visible concerns (check in person)"]];
export const CANNOT_SEE = ["Cracks, roof damage, rot, mould, damp or structural problems", "Anything inside the building or out of frame", "Ownership, legal, tax or market information", "Whether objects such as furniture are discarded or simply stored"];
export const DISCLAIMER = "Experimental. Built from a hand-written rule set on generic classifier and detector outputs; not validated against real inspections or valuations. It does not prove that a property is distressed or in good condition.";
const f = (key: string, label: string, kind: Factor["kind"], points: number, observed: string, meaning: string): Factor => ({ key, label, kind, points: Math.round(points * 10) / 10, observed, meaning });
const sum = (c: Record<string, number>, set: Set<string>) => Object.entries(c).reduce((a, [k, v]) => a + (set.has(k) ? v : 0), 0);

export function scoreProperty(cls: Cls, dets: DetLite[], m: Meas): ScoreResult {
  const built = cls.label !== "vacant_land", counts: Record<string, number> = {};
  for (const d of dets) counts[d.label] = (counts[d.label] ?? 0) + 1;
  const fs: Factor[] = [];
  const nv = sum(counts, VEHICLES);
  if (nv && built) fs.push(f("vehicles", "Vehicles present", "assumption", Math.min(9, 3 * nv), `${nv} vehicle(s) detected`, "Assumption: vehicles on the site suggest it is in active use. A vehicle can also be abandoned, so this is a weak signal."));
  else if (nv) fs.push(f("vehicles", "Vehicles on vacant land", "assumption", 0, `${nv} vehicle(s) detected`, "Not scored: we cannot tell parking from dumping or access from a photo."));
  const np = sum(counts, PEOPLE);
  if (np) fs.push(f("people", "People present", "assumption", Math.min(4, 2 * np), `${np} person(s) detected`, "Assumption: people in the photo suggest the place is occupied or in use."));
  const nt = sum(counts, TIDY);
  if (nt) fs.push(f("tidy", "Planters or benches", "assumption", Math.min(4, 2 * nt), `${nt} potted plant/bench object(s) detected`, "Assumption: deliberate outdoor furnishings can indicate upkeep. They can also be left behind."));
  const firm = dets.filter((d) => d.score >= 0.5), hh = firm.filter((d) => HOUSEHOLD.has(d.label)), nh = hh.length;
  if (nh && built) fs.push(f("household", "Household items outdoors", "assumption", -Math.min(12, 4 * nh), `${nh} household item(s) detected (${[...new Set(hh.map((d) => d.label))].sort().join(", ")}) at 50% confidence or more`, "Assumption: furniture or appliances in an exterior photo might be discarded items. They might equally be stored, delivered or inside a window view. Detection alone cannot tell."));
  const g = m.green_percent;
  if (built && g > 55) fs.push(f("green", "Very high vegetation cover", "assumption", -6, `${Math.round(g)}% of the image is green`, "Assumption: this could be overgrowth. It could just as well be a garden, trees or a green backdrop."));
  else if (built) fs.push(f("green", "Vegetation cover", "observed", 0, `${Math.round(g)}% of the image is green`, "Observed only; not high enough to count as a concern."));
  else fs.push(f("green", "Vegetation cover", "observed", 0, `${Math.round(g)}% of the image is green`, "Observed only: vegetation is normal on vacant land, so it is not scored."));
  const value = Math.round(Math.max(0, Math.min(100, BASELINE + fs.reduce((a, x) => a + x.points, 0)))), band = BANDS.find(([lo]) => value >= lo)![1];
  let strength = 2; const why: string[] = [];
  if (cls.probability < 0.5 || cls.margin < 0.15) { strength--; why.push(`the property type is uncertain (${Math.round(cls.probability * 100)}% for the top category)`); }
  if (m.sharpness < 60) { strength--; why.push("the photo is blurry"); }
  if (m.brightness < 45 || m.brightness > 215) { strength--; why.push("the photo is very dark or very bright"); }
  if (!dets.length) { strength--; why.push("no objects were detected"); }
  strength = Math.max(0, strength);
  const adj = fs.filter((x) => x.points !== 0).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const notes = adj.length ? adj.map((x) => `${x.label} (${x.points > 0 ? "+" : ""}${Math.round(x.points)}): ${x.meaning}`) : ["No detected object or measurement moved the score away from the neutral starting point, so the score says very little about this property."];
  return { value, band, baseline: BASELINE, factors: fs, explanation: notes, evidence_strength: ["Low", "Medium", "High"][strength], evidence_notes: why, cannot_see: CANNOT_SEE, disclaimer: DISCLAIMER };
}
