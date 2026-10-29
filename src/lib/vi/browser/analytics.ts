/** Browser port of services/video-intel/app/analytics.py: the same derived results computed from stored observations, with the same neutral wording and limits. */
import type { Attendance, BasketballResult, Calibration, Employee, PresenceEvent, RestaurantResult, TableTennisResult, TrackInfo } from "../api";

export type Pt = [number, number];
export interface Obs { t: number; box: [number, number, number, number]; score: number }
export interface BallPt { t: number; x: number; y: number; src: string; conf: number }
export interface Frame { t: number; persons: { id: number; box: [number, number, number, number]; score: number }[] }
export interface Analysis { effectiveFps: number; width: number; height: number; times: number[]; frames: Frame[]; tracks: Map<number, Obs[]>; ballPoints: BallPt[]; ballFrames: number; ball: boolean; startS: number; endS: number }

export const TABLE_L = 2.74, TABLE_W = 1.525, COURT_L = 28, COURT_W = 15;
export const COURT_LANDMARKS: [string, number, number][] = [
  ["Corner: baseline left / sideline bottom", 0, 0], ["Corner: baseline right / sideline bottom", 28, 0], ["Corner: baseline right / sideline top", 28, 15], ["Corner: baseline left / sideline top", 0, 15],
  ["Halfway line at bottom sideline", 14, 0], ["Halfway line at top sideline", 14, 15], ["Centre circle centre", 14, 7.5],
  ["Left free-throw line, bottom end of lane", 5.8, 5.05], ["Left free-throw line, top end of lane", 5.8, 9.95], ["Left lane corner on baseline, bottom", 0, 5.05], ["Left lane corner on baseline, top", 0, 9.95],
  ["Right free-throw line, bottom end of lane", 22.2, 5.05], ["Right free-throw line, top end of lane", 22.2, 9.95], ["Right lane corner on baseline, bottom", 28, 5.05], ["Right lane corner on baseline, top", 28, 9.95],
];
export class CalibrationError extends Error {}
const r2 = (n: number, d = 2) => { const f = 10 ** d; return Math.round(n * f) / f; };

/* ───────── geometry ───────── */
export const foot = (b: number[]): Pt => [(b[0] + b[2]) / 2, b[3]];
export function inside(poly: Pt[], p: Pt): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const cross = (p[0] - xi) * (yj - yi) - (p[1] - yi) * (xj - xi);
    if (cross === 0 && Math.min(xi, xj) <= p[0] && p[0] <= Math.max(xi, xj) && Math.min(yi, yj) <= p[1] && p[1] <= Math.max(yi, yj)) return true;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function validPolygon(poly: unknown): Pt[] {
  if (!Array.isArray(poly) || poly.length < 3 || poly.length > 40) throw new CalibrationError("The monitored area needs between 3 and 40 corner points.");
  const pts = poly.map((p) => [Number(p[0]), Number(p[1])] as Pt);
  if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new CalibrationError("The monitored area points must be [x, y] pairs.");
  let a = 0; for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
  if (Math.abs(a / 2) < 25) throw new CalibrationError("The monitored area is too small or its points are in a line.");
  return pts;
}
type M3 = number[];
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; } return x;
}
const mul = (a: M3, b: M3): M3 => { const o = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return o; };
function inv3(m: M3): M3 | null {
  const [a, b, c, d, e, f, g, h, i] = m; const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g); if (Math.abs(det) < 1e-18) return null;
  return [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
}
function normalise(p: Pt[]): { T: M3; q: Pt[] } {
  const cx = p.reduce((s, x) => s + x[0], 0) / p.length, cy = p.reduce((s, x) => s + x[1], 0) / p.length;
  const d = p.reduce((s, x) => s + Math.hypot(x[0] - cx, x[1] - cy), 0) / p.length || 1, s = Math.SQRT2 / d;
  return { T: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1], q: p.map((x) => [(x[0] - cx) * s, (x[1] - cy) * s]) };
}
export const project = (H: M3, p: Pt): Pt => { const w = H[6] * p[0] + H[7] * p[1] + H[8]; return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w]; };
/** Least-squares homography from image pixels to a world plane in metres (normalised DLT), with the reprojection error in metres. */
export function fitHomography(img: Pt[], world: Pt[]): { H: M3; cal: Calibration } {
  if (img.length !== world.length || img.length < 4) throw new CalibrationError("At least four matching reference points are required.");
  const key = (p: Pt) => `${p[0]},${p[1]}`;
  if (new Set(img.map(key)).size < img.length) throw new CalibrationError("Two reference points are at the same image position.");
  if (new Set(world.map(key)).size < world.length) throw new CalibrationError("Two reference points have the same real-world position.");
  for (const [pts, what] of [[img, "image"], [world, "real-world"]] as [Pt[], string][]) {
    const cx = pts.reduce((s, x) => s + x[0], 0) / pts.length, cy = pts.reduce((s, x) => s + x[1], 0) / pts.length;
    let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { const x = p[0] - cx, y = p[1] - cy; sxx += x * x; sxy += x * y; syy += y * y; }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, small = tr / 2 - Math.sqrt(Math.max(0, (tr / 2) ** 2 - det));
    if (small < 1e-9 * Math.max(1, tr)) throw new CalibrationError(`The ${what} reference points lie in a straight line; spread them over the area.`);
  }
  const area = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const rel = new Set<boolean>(); const n = img.length; const span = Math.max(...img.flat()) - Math.min(...img.flat());
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) { const ai = area(img[i], img[j], img[k]), wi = area(world[i], world[j], world[k]); if (Math.abs(ai) > 1e-6 * Math.max(1, span) ** 2 && Math.abs(wi) > 1e-9) rel.add((ai > 0) === (wi > 0)); }
  if (rel.size > 1) throw new CalibrationError("These points do not fit together: the click order or the matched landmarks look wrong (two points seem swapped, so the mapping would fold the area). Check the order and try again.");
  const a = normalise(img), w = normalise(world), A: number[][] = [], b: number[] = [];
  for (let i = 0; i < n; i++) { const [x, y] = a.q[i], [u, v] = w.q[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  const AtA = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0))), Atb = Array.from({ length: 8 }, (_, i) => A.reduce((s, r, k) => s + r[i] * b[k], 0));
  const h = solve(AtA, Atb); if (!h) throw new CalibrationError("The reference points do not give a usable mapping. Check that they are in the right order.");
  const Hn: M3 = [...h, 1], Ti = inv3(w.T), H = Ti ? mul(mul(Ti, Hn), a.T) : null;
  if (!H || H.some((x) => !Number.isFinite(x))) throw new CalibrationError("The reference points do not give a usable mapping. Check that they are in the right order.");
  const err = img.map((p, i) => Math.hypot(...(project(H, p).map((v, k) => v - world[i][k]) as [number, number])));
  return { H, cal: { points: n, rms_error_m: r2(Math.sqrt(err.reduce((s, e) => s + e * e, 0) / n), 3), max_error_m: r2(Math.max(...err), 3) } };
}

/* ───────── tracks ───────── */
export function trackSummary(an: Analysis): TrackInfo[] {
  return [...an.tracks.entries()].sort((a, b) => a[0] - b[0]).map(([id, s]) => ({ id, first_t: s[0].t, last_t: s[s.length - 1].t, observations: s.length, observed_s: r2(s.length / Math.max(an.effectiveFps, 1e-9)), mean_score: r2(s.reduce((x, o) => x + o.score, 0) / s.length, 3) }));
}

/* ───────── restaurant ───────── */
export function presenceEvents(an: Analysis, poly: Pt[], minStay: number, mergeGap: number, minObs: number): Omit<RestaurantResult, "occupancy" | "tracks" | "attendance" | "limits"> {
  const dt = 1 / Math.max(an.effectiveFps, 1e-9), gapBreak = Math.max(2.5 * dt, mergeGap), events: PresenceEvent[] = []; let ignored = 0;
  for (const [tid, s] of [...an.tracks.entries()].sort((a, b) => a[0] - b[0])) {
    const flags = s.map((x) => inside(poly, foot(x.box))), runs: [number, number][] = [];
    flags.forEach((f, i) => { if (!f) return; if (runs.length) { const last = runs[runs.length - 1][1]; if (s[i].t - s[last].t <= (last === i - 1 ? gapBreak : mergeGap)) { runs[runs.length - 1][1] = i; return; } } runs.push([i, i]); });
    for (const [a, b] of runs) {
      const n = flags.slice(a, b + 1).filter(Boolean).length; if (n < minObs) { ignored++; continue; }
      const t0 = s[a].t, t1 = s[b].t, entry = a > 0 && !flags[a - 1], exit = b < s.length - 1 && !flags[b + 1], dur = r2(t1 - t0), inc = [...(entry ? [] : ["entry not observed"]), ...(exit ? [] : ["exit not observed"])];
      const flag = dur >= minStay;
      events.push({ track_id: tid, entry_t: r2(t0), exit_t: r2(t1), duration_s: dur, observations: n, entry_observed: entry, exit_observed: exit, complete: !inc.length, status: inc.length ? "Incomplete observation: " + inc.join(", ") : "Complete observation",
        flag: flag ? "Potential Extended Area Presence" : null, flag_note: !flag ? null : inc.length ? "Observed presence of at least this length. This is a threshold flag for human review, not a conclusion about what the person was doing." : "Observed presence reached the threshold. This is a flag for human review, not a conclusion about what the person was doing." });
    }
  }
  events.sort((x, y) => x.entry_t - y.entry_t || x.track_id - y.track_id);
  return { events, ignored_short_events: ignored, threshold_s: minStay, merge_gap_s: mergeGap, summary: { events: events.length, tracks_in_area: new Set(events.map((e) => e.track_id)).size, flagged: events.filter((e) => e.flag).length, incomplete: events.filter((e) => !e.complete).length, observed_area_seconds: r2(events.reduce((s, e) => s + e.duration_s, 0), 1) } };
}
export function occupancy(an: Analysis, poly: Pt[], bin = 5) {
  if (!an.times.length) return []; const t0 = an.times[0], t1 = an.times[an.times.length - 1], nb = Math.max(1, Math.ceil((t1 - t0 + 1e-9) / bin)), peak = new Array(nb).fill(0);
  for (const f of an.frames) { const n = f.persons.filter((p) => inside(poly, foot(p.box))).length, i = Math.min(nb - 1, Math.floor((f.t - t0) / bin)); peak[i] = Math.max(peak[i], n); }
  return peak.map((v, i) => ({ t: r2(t0 + i * bin), max_people_in_area: v as number }));
}
const hmsSec = (s: string) => { const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim()); if (!m) throw new Error("bad"); return +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0); };
export function attendance(events: PresenceEvent[], employees: Employee[], links: Record<string, string>, clockStart: string, v0s: number, v1s: number, tolMin: number): Attendance {
  let c0: number; try { c0 = hmsSec(clockStart); } catch { throw new CalibrationError("The video clock start must look like HH:MM or HH:MM:SS."); }
  const by = new Map<string, PresenceEvent[]>(); for (const e of events) { const emp = links[String(e.track_id)]; if (emp) by.set(emp, [...(by.get(emp) ?? []), e]); }
  const v0 = c0 + v0s, v1 = c0 + v1s, linked = new Set(Object.values(links)), rows = employees.map((emp) => {
    let s0: number, s1: number; try { s0 = hmsSec(emp.shift_start); s1 = hmsSec(emp.shift_end); } catch { throw new CalibrationError(`Employee ${emp.name} has an invalid shift time.`); }
    const ev = by.get(emp.id) ?? [], covered = Math.max(0, Math.min(s1, v1) - Math.max(s0, v0)), pres = ev.map((e) => [c0 + e.entry_t, c0 + e.exit_t, e] as const);
    const inShift = pres.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, s1) - Math.max(a, s0)), 0), outside = pres.filter(([a, b]) => b < s0 - tolMin * 60 || a > s1 + tolMin * 60);
    let status: string, why: string;
    if (!ev.length && !linked.has(emp.id)) [status, why] = ["Insufficient Data", "No track has been linked to this person, so nothing can be compared."];
    else if (covered <= 0) [status, why] = ["Insufficient Data", "The analysed video does not overlap this person's scheduled shift."];
    else if (outside.length) [status, why] = ["Discrepancy: observed outside the scheduled shift", `${outside.length} presence event(s) in the area fall outside the shift (± ${tolMin} min).`];
    else if (!ev.length) [status, why] = ["Not observed in the monitored area", "The linked track(s) were not inside the area during the analysed part of the shift. This cannot show where the person was."];
    else if (ev.some((e) => !e.complete)) [status, why] = ["Insufficient Data", "The linked presence events are incomplete (entry or exit not observed), so the times are not reliable."];
    else [status, why] = ["Consistent with the schedule", "All observed presence in the area falls within the scheduled shift."];
    return { employee_id: emp.id, name: emp.name, role: emp.role ?? "", shift: `${emp.shift_start}–${emp.shift_end}`, linked_tracks: [...new Set(ev.map((e) => e.track_id))].sort((a, b) => a - b), shift_seconds_covered_by_video: Math.round(covered), observed_in_area_within_shift_s: r2(inShift, 1), events: ev.length, status, explanation: why };
  });
  return { rows, unlinked_tracks: [...new Set(events.filter((e) => !links[String(e.track_id)]).map((e) => e.track_id))].sort((a, b) => a - b), note: "Schedule data is simulated and fictional. Track links are entered manually; the system does not recognise people. A mismatch is a prompt for a human to review, not a finding about anyone." };
}

/* ───────── ball sports ───────── */
export function segments(points: BallPt[], gap: number, minLen: number, minPts: number): BallPt[][] {
  const out: BallPt[][] = []; let cur: BallPt[] = [];
  for (const p of points) { if (cur.length && p.t - cur[cur.length - 1].t > gap) { out.push(cur); cur = []; } cur.push(p); } if (cur.length) out.push(cur);
  return out.filter((s) => s.length >= minPts && s[s.length - 1].t - s[0].t >= minLen);
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function tableTennis(an: Analysis, corners: Pt[], gap: number, minLen: number, minPts = 4): TableTennisResult {
  const { H, cal } = fitHomography(corners, [[0, 0], [TABLE_L, 0], [TABLE_L, TABLE_W], [0, TABLE_W]]);
  if (cal.rms_error_m > 0.02) cal.warning = "The corners fit the table poorly; check that you clicked the table top corners in the order left-near, right-near, right-far, left-far.";
  const pts = an.ballPoints, world = pts.map((p) => project(H, [p.x, p.y])), segs = segments(pts, gap, minLen, minPts).map((seg, si) => {
    const w = seg.map((p) => project(H, [p.x, p.y])), speeds: number[] = []; for (let i = 0; i < seg.length - 1; i++) { const d = seg[i + 1].t - seg[i].t; if (d > 0 && d <= gap) speeds.push(Math.hypot(w[i + 1][0] - w[i][0], w[i + 1][1] - w[i][1]) / d); }
    const net = TABLE_L / 2, side = w.map((p) => (p[0] > net ? 1 : -1)); let cross = 0; for (let i = 0; i < side.length - 1; i++) if (side[i] !== side[i + 1]) cross++;
    const ys = seg.map((p) => p.y), bounces: TableTennisResult["segments"][0]["bounce_candidates"] = [];
    for (let i = 1; i < seg.length - 1; i++) if (ys[i] >= ys[i - 1] && ys[i] > ys[i + 1] && ys[i] - Math.min(ys[i - 1], ys[i + 1]) > 1.5) bounces.push({ t: seg[i].t, table_x_m: r2(w[i][0]), table_y_m: r2(w[i][1]), half: w[i][0] > net ? "right" : "left" });
    return { index: si + 1, label: "Ball-visible segment (experimental)", start_t: seg[0].t, end_t: seg[seg.length - 1].t, duration_s: r2(seg[seg.length - 1].t - seg[0].t), ball_points: seg.length, net_side_crossings: cross, bounce_candidates: bounces, max_table_plane_speed_ms: speeds.length ? r2(Math.max(...speeds)) : null, median_table_plane_speed_ms: speeds.length ? r2(median(speeds)) : null };
  });
  const span = Math.max(1, an.ballFrames || an.times.length), players = trackSummary(an).sort((a, b) => b.observed_s - a.observed_s).slice(0, 6);
  return { calibration: cal, segments: segs, ball: { detected_points: pts.length, analysed_frames: span, visibility_pct: r2((100 * pts.length) / span, 1), note: "Frames without a detected ball are gaps, not estimates. Segment boundaries are where the ball was not detected for longer than the gap setting, which is not necessarily where a rally started or ended." }, players,
    table_plane_points: pts.map((p, i) => ({ t: p.t, x_m: r2(world[i][0], 3), y_m: r2(world[i][1], 3), src: p.src })).slice(0, 3000) };
}
export function basketball(an: Analysis, img: Pt[], worldPts: Pt[], cell: number, trackIds: number[] | null, minPoss: number, margin: number, maxSpeed = 11): BasketballResult {
  const { H, cal } = fitHomography(img, worldPts); if (cal.rms_error_m > 0.75) cal.warning = "The reference points fit poorly (error above 0.75 m). Re-check the landmarks you matched; results may be unreliable.";
  const dt = 1 / Math.max(an.effectiveFps, 1e-9), nx = Math.ceil(COURT_L / cell), ny = Math.ceil(COURT_W / cell), heat = Array.from({ length: ny }, () => new Array(nx).fill(0)), per: BasketballResult["players"] = []; let outside = 0;
  for (const [tid, s] of an.tracks) {
    if (trackIds && !trackIds.includes(tid)) continue; let dist = 0, jumps = 0, nIn = 0, last: [number, number, number] | null = null;
    for (const x of s) {
      const [X, Y] = project(H, foot(x.box)); if (!(X >= -1 && X <= COURT_L + 1 && Y >= -1 && Y <= COURT_W + 1)) { outside++; last = null; continue; }
      nIn++; heat[Math.min(ny - 1, Math.max(0, Math.floor(Y / cell)))][Math.min(nx - 1, Math.max(0, Math.floor(X / cell)))] += dt;
      if (last && x.t - last[0] > 0 && x.t - last[0] <= 2.5 * dt + 0.01) { const st = Math.hypot(X - last[1], Y - last[2]); if (st / (x.t - last[0]) > maxSpeed) jumps++; else dist += st; } last = [x.t, X, Y];
    }
    if (nIn) per.push({ id: tid, observations_on_court: nIn, seconds_on_court: r2(nIn * dt, 1), distance_m: r2(dist, 1), implausible_jumps_excluded: jumps });
  }
  const ballBy = new Map(an.ballPoints.map((p) => [p.t, p])), holder = new Map<number, number>();
  for (const f of an.frames) {
    const b = ballBy.get(f.t) ?? an.ballPoints.find((p) => Math.abs(p.t - f.t) <= 0.5 * dt); if (!b) continue; let best: number | null = null, bd = Infinity;
    for (const p of f.persons) { if (trackIds && !trackIds.includes(p.id)) continue; const [x0, y0, x1, y1] = p.box, m = margin * (y1 - y0); if (x0 - m <= b.x && b.x <= x1 + m && y0 - m <= b.y && b.y <= y1 + m) { const d = Math.hypot(b.x - (x0 + x1) / 2, b.y - (y0 + y1) / 2); if (d < bd) { best = p.id; bd = d; } } }
    if (best !== null) holder.set(f.t, best);
  }
  const evs: { id: number; start: number; end: number; n: number }[] = []; let cur: (typeof evs)[0] | null = null;
  for (const f of an.frames) { const h = holder.get(f.t); if (cur && h === cur.id && f.t - cur.end <= 2.5 * dt + 0.01) { cur.end = f.t; cur.n++; } else { if (cur) evs.push(cur); cur = h !== undefined ? { id: h, start: f.t, end: f.t, n: 1 } : null; } } if (cur) evs.push(cur);
  const poss = evs.filter((e) => e.end - e.start + dt >= minPoss).map((e) => ({ track_id: e.id, start_t: r2(e.start), end_t: r2(e.end), duration_s: r2(e.end - e.start + dt), observations: e.n, label: "Potential Possession Event", confidence: e.n < 3 ? "low" : "medium", follows_track: null as number | null }));
  for (let i = 1; i < poss.length; i++) poss[i].follows_track = poss[i - 1].track_id !== poss[i].track_id && poss[i].start_t - poss[i - 1].end_t <= 2 ? poss[i - 1].track_id : null;
  return { calibration: cal, heatmap: { cell_m: cell, cols: nx, rows: ny, seconds: heat.map((r) => r.map((v) => r2(v))), court_m: [COURT_L, COURT_W], note: "Seconds each cell was occupied by a tracked person's feet, summed over the selected tracks. Only observed time is counted." },
    players: per.sort((a, b) => b.seconds_on_court - a.seconds_on_court), outside_court_observations: outside, possession: poss, possession_note: "Potential Possession Events are a geometric rule: the detected ball lies inside one person's box (plus a margin) for the minimum time. Dribbling, passes, loose balls and occlusion are not distinguished.",
    ball: { detected_points: an.ballPoints.length, on_court_plane: an.ballPoints.map((p) => { const w = project(H, [p.x, p.y]); return { t: p.t, x_m: r2(w[0]), y_m: r2(w[1]) }; }).slice(0, 3000), note: "A ball in the air is above the court plane, so its mapped position is a projection and can fall outside the court." } };
}
