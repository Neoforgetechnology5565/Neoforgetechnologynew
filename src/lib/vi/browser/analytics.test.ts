import assert from "node:assert/strict";
import { attendance, basketball, CalibrationError, fitHomography, presenceEvents, project, tableTennis, validPolygon, type Analysis, type Obs, type Pt } from "./analytics";
const check = (n: string, f: () => void) => { f(); console.log("ok", n); };
const box = (x: number, y: number, w = 40, h = 100): [number, number, number, number] => [x - w / 2, y - h, x + w / 2, y];
function an(tracks: Record<number, [number, [number, number, number, number]][]>, fps = 5, ball: Analysis["ballPoints"] = []): Analysis {
  const t = new Map<number, Obs[]>(), times = new Set<number>(); for (const [id, s] of Object.entries(tracks)) { t.set(+id, s.map(([tt, b]) => ({ t: tt, box: b, score: 0.9 }))); s.forEach(([tt]) => times.add(tt)); } ball.forEach((b) => times.add(b.t));
  const ts = [...times].sort((a, b) => a - b); return { effectiveFps: fps, width: 960, height: 540, times: ts, frames: ts.map((x) => ({ t: x, persons: Object.entries(tracks).flatMap(([id, s]) => s.filter(([tt]) => tt === x).map(([, b]) => ({ id: +id, box: b, score: 0.9 }))) })), tracks: t, ballPoints: ball, ballFrames: ts.length, ball: ball.length > 0, startS: ts[0], endS: ts[ts.length - 1] };
}
const SQ: Pt[] = [[100, 100], [300, 100], [300, 300], [100, 300]];
const walk = (pts: [number, number, number][]) => pts.map(([t, x, y]) => [t, box(x, y)] as [number, [number, number, number, number]]);

check("a complete visit has exact entry, exit and duration and is flagged at the threshold", () => {
  const pts: [number, number, number][] = []; for (let i = 0; i <= 50; i++) { const t = Math.round(i * 0.2 * 10) / 10; pts.push([t, t < 2 || t > 8 ? 50 : 200, 200]); }
  const r = presenceEvents(an({ 1: walk(pts) }), SQ, 5, 1, 3); const e = r.events[0];
  assert.deepEqual([e.entry_t, e.exit_t, e.duration_s, e.complete], [2, 8, 6, true]); assert.equal(e.flag, "Potential Extended Area Presence"); assert.equal(r.summary.flagged, 1);
  assert.equal(presenceEvents(an({ 1: walk(pts) }), SQ, 10, 1, 3).events[0].flag, null);
});
check("tracks that start or end inside are incomplete and never described with loaded words", () => {
  const a: [number, number, number][] = []; for (let i = 0; i < 20; i++) a.push([i * 0.2, i < 10 ? 200 : 50, 200]);
  const e = presenceEvents(an({ 1: walk(a) }), SQ, 1, 1, 3).events[0]; assert.ok(!e.entry_observed && e.exit_observed && /entry not observed/.test(e.status));
  assert.ok(!/break|idle|violation/i.test(JSON.stringify(presenceEvents(an({ 1: walk(a) }), SQ, 1, 1, 3))));
});
check("short blips are ignored and counted; an area must be valid", () => {
  const r = presenceEvents(an({ 1: walk([[0, 50, 200], [0.2, 200, 200], [0.4, 50, 200], [0.6, 50, 200]]) }), SQ, 1, 1, 3); assert.equal(r.events.length, 0); assert.equal(r.ignored_short_events, 1);
  assert.throws(() => validPolygon([[0, 0], [10, 0], [20, 0]]), CalibrationError); assert.throws(() => validPolygon("x"), CalibrationError);
});
const EMP = [{ id: "e1", name: "A", role: "r", shift_start: "12:00", shift_end: "14:00" }, { id: "e3", name: "C", role: "r", shift_start: "18:00", shift_end: "20:00" }];
const ev = (t: number, a: number, b: number, complete = true) => ({ track_id: t, entry_t: a, exit_t: b, duration_s: b - a, observations: 5, entry_observed: complete, exit_observed: complete, complete, status: "", flag: null, flag_note: null });
check("attendance: consistent, insufficient data, discrepancy", () => {
  const r = attendance([ev(1, 600, 900)], EMP, { "1": "e1" }, "12:00:00", 0, 1800, 10); assert.equal(r.rows[0].status, "Consistent with the schedule"); assert.equal(r.rows[1].status, "Insufficient Data");
  assert.ok(attendance([ev(1, 9000, 9300)], EMP.slice(0, 1), { "1": "e1" }, "12:00:00", 0, 9400, 10).rows[0].status.startsWith("Discrepancy"));
  assert.equal(attendance([ev(1, 1, 2, false)], EMP.slice(0, 1), { "1": "e1" }, "12:00:00", 0, 1800, 10).rows[0].status, "Insufficient Data"); assert.throws(() => attendance([], EMP, {}, "noon", 0, 1, 10), CalibrationError);
});
check("homography recovers a known mapping, refuses swapped points, accepts a mirrored view", () => {
  const img: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]], world: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]]; const { H, cal } = fitHomography(img, world); assert.ok(cal.rms_error_m < 1e-6); assert.ok(Math.abs(project(H, [5, 5])[0] - 0.5) < 1e-9);
  assert.throws(() => fitHomography([img[0], img[2], img[1], img[3]], world), /order/); fitHomography(img, world.map(([x, y]) => [1 - x, y] as Pt));
  assert.throws(() => fitHomography([[0, 0], [10, 0], [20, 0], [30, 0]], world), /straight line/); assert.throws(() => fitHomography(img.slice(0, 3), world.slice(0, 3)), /four/);
  const real = [[236.1, 297.2], [716.9, 303.2], [666.9, 235.2], [302.4, 231.7]] as Pt[]; const t = fitHomography(real, [[0, 0], [2.74, 0], [2.74, 1.525], [0, 1.525]]); assert.ok(t.cal.rms_error_m < 1e-6); const m = project(t.H, [(real[0][0] + real[2][0]) / 2, (real[0][1] + real[2][1]) / 2]); assert.ok(Math.abs(m[0] - 1.37) < 0.2);
});
check("table tennis: segments, one net-side crossing and one bounce candidate", () => {
  const ball = Array.from({ length: 16 }, (_, i) => ({ t: Math.round((i / 30) * 1000) / 1000, x: 40 + 30 * i, y: 150 + (50 - Math.abs(i - 8) * 6), src: "colour", conf: 1 }));
  const r = tableTennis(an({}, 30, ball), [[0, 305], [548, 305], [548, 0], [0, 0]], 0.2, 0.3); assert.equal(r.segments.length, 1); assert.equal(r.segments[0].net_side_crossings, 1); assert.equal(r.segments[0].bounce_candidates.length, 1); assert.equal(r.ball.detected_points, 16);
});
check("basketball: exact distance, heat map and possession from known tracks", () => {
  const c = (x: number, y: number): Pt => [x * 30 + 50, y * 30 + 40], corners: [number, number][] = [[0, 0], [28, 0], [28, 15], [0, 15], [14, 7.5]];
  const tr: [number, [number, number, number, number]][] = [], ball: Analysis["ballPoints"] = []; for (let i = 0; i < 26; i++) { const t = Math.round(i * 0.2 * 10) / 10, [fx, fy] = c(5 + 2 * t, 5.5); tr.push([t, box(fx, fy, 30, 60)]); if (i >= 10 && i <= 14) ball.push({ t, x: fx, y: fy - 30, src: "colour", conf: 1 }); }
  const r = basketball(an({ 1: tr }, 5, ball), corners.map(([x, y]) => c(x, y)), corners as Pt[], 1, null, 0.6, 0.08); assert.ok(r.calibration.rms_error_m < 1e-6); assert.ok(Math.abs(r.players[0].distance_m - 10) < 0.01);
  assert.ok(Math.abs(r.heatmap.seconds.flat().reduce((a, b) => a + b, 0) - 5.2) < 0.05); assert.equal(r.possession.length, 1); assert.deepEqual([r.possession[0].start_t, r.possession[0].end_t, r.possession[0].label], [2, 2.8, "Potential Possession Event"]);
});
