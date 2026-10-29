/** Manual annotations. These are entered by a person while watching the video and are always labelled "Manual Annotation": nothing here is detected. */
export type TTKind = "Rally start" | "Rally end" | "Point: side A" | "Point: side B" | "Note";
export interface TTAnnotation { id: string; t: number; kind: TTKind; note?: string }
export const TT_KINDS: TTKind[] = ["Rally start", "Rally end", "Point: side A", "Point: side B", "Note"];

/** Rallies are paired start→end in time order. An unpaired start or end is reported as incomplete instead of being guessed. */
export function ttSummary(items: TTAnnotation[]) {
  const a = [...items].sort((x, y) => x.t - y.t);
  const rallies: { start: number; end: number; duration: number; points: { A: number; B: number } }[] = [];
  const incomplete: { t: number; reason: string }[] = [];
  let open: TTAnnotation | null = null;
  for (const it of a) {
    if (it.kind === "Rally start") { if (open) incomplete.push({ t: open.t, reason: "Rally start with no end before the next start" }); open = it; }
    else if (it.kind === "Rally end") { if (!open) incomplete.push({ t: it.t, reason: "Rally end with no start" }); else { rallies.push({ start: open.t, end: it.t, duration: round(it.t - open.t), points: { A: 0, B: 0 } }); open = null; } }
  }
  if (open) incomplete.push({ t: open.t, reason: "Rally start with no end" });
  const score = { A: 0, B: 0 };
  for (const it of a) {
    if (it.kind !== "Point: side A" && it.kind !== "Point: side B") continue;
    const side = it.kind === "Point: side A" ? "A" : "B"; score[side]++;
    const r = rallies.find((x) => it.t >= x.start && it.t <= x.end + 3); if (r) r.points[side]++;
  }
  const d = rallies.map((r) => r.duration);
  return { rallies, incomplete, score, count: rallies.length, mean_duration: d.length ? round(d.reduce((p, c) => p + c, 0) / d.length) : null, longest: d.length ? Math.max(...d) : null };
}

export type BBKind = "Shot made" | "Shot missed" | "Assist" | "Rebound" | "Turnover" | "Foul" | "Note";
export const BB_KINDS: BBKind[] = ["Shot made", "Shot missed", "Assist", "Rebound", "Turnover", "Foul", "Note"];
export interface BBAnnotation { id: string; t: number; kind: BBKind; team: "A" | "B" | ""; points?: 1 | 2 | 3; player?: string; note?: string }
/** Statistics are counts of what the annotator entered, nothing else. Field-goal percentage needs at least one attempt and is otherwise null. */
export function bbSummary(items: BBAnnotation[]) {
  const teams = { A: blank(), B: blank() } as Record<"A" | "B", ReturnType<typeof blank>>;
  for (const it of items) {
    if (it.team !== "A" && it.team !== "B") continue;
    const t = teams[it.team];
    if (it.kind === "Shot made") { t.made++; t.attempts++; t.points += it.points ?? 2; t.by[it.points ?? 2]++; }
    else if (it.kind === "Shot missed") { t.attempts++; }
    else if (it.kind === "Assist") t.assists++; else if (it.kind === "Rebound") t.rebounds++; else if (it.kind === "Turnover") t.turnovers++; else if (it.kind === "Foul") t.fouls++;
  }
  for (const k of ["A", "B"] as const) teams[k].fg_pct = teams[k].attempts ? round((100 * teams[k].made) / teams[k].attempts) : null;
  return teams;
}
function blank() { return { made: 0, attempts: 0, points: 0, assists: 0, rebounds: 0, turnovers: 0, fouls: 0, fg_pct: null as number | null, by: { 1: 0, 2: 0, 3: 0 } as Record<number, number> }; }
const round = (n: number) => Math.round(n * 100) / 100;
let n = 0;
export const annId = () => `a${Date.now().toString(36)}${(n++).toString(36)}`;
