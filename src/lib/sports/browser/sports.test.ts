import assert from "node:assert/strict";
import { fillEstimates, link, type Cand } from "./ball";
import { apply3, inv3, type M3 } from "./cvlite";
import { CalibrationError, fitHomography, landmarks, zoneOf } from "./pitch";
import { inPitch, possessionCandidates, trackStats, type FrameLite } from "./stats";
import { classify, hex2lab, lab2hex, OTHER, TEAM_A, TEAM_B, torsoColour, UNCERTAIN, type Lab } from "./teams";
const check = (n: string, f: () => void) => { f(); console.log("ok", n); };
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const W = 1920, T = Array.from({ length: 20 }, (_, i) => i * 0.2);
check("ball: link follows a smooth ball and rejects a stronger but impossible candidate", () => { const c: Cand[][] = Array.from({ length: 20 }, (_, i) => [[100 + 30 * i, 500, 0.8]]); c[7] = [[100 + 210, 500, 0.7], [1500, 100, 0.95]]; const o = link(c, T, W); assert.ok(o.every((x) => x)); assert.ok(o[7]![0] === 310 && o[7]![1] === 500); });
check("ball: isolated weak candidates are dropped, isolated strong ones kept", () => { const c: Cand[][] = Array.from({ length: 20 }, () => []); c[5] = [[400, 300, 0.4]]; c[12] = [[900, 200, 0.45]]; assert.ok(link(c, T, W).every((x) => x === null)); c[5] = [[400, 300, 0.9]]; assert.ok(link(c, T, W)[5]); });
check("ball: short gaps are estimated and marked, long gaps are not", () => { const ch: (Cand | null)[] = new Array(20).fill(null); ch[2] = [100, 100, 0.8]; ch[5] = [130, 100, 0.8]; ch[10] = [500, 100, 0.8]; ch[18] = [560, 100, 0.8]; const r = fillEstimates(ch, T, W); assert.deepEqual(r.slice(2, 6).map((x) => x!.kind), ["observed", "estimated", "estimated", "observed"]); assert.ok(Math.abs(r[3]!.x - 110) < 1e-6 && r[3]!.conf === null); assert.ok(r.slice(11, 18).every((x) => x === null) && r[0] === null && r[19] === null); });
const jersey = (rgb: [number, number, number]) => { const px = new Uint8ClampedArray(200 * 300 * 4); for (let i = 0; i < 200 * 300; i++) { const y = (i / 200) | 0, x = i % 200, c = y >= 60 && y < 200 && x >= 50 && x < 150 ? rgb : [40, 120, 40]; px.set([c[0], c[1], c[2], 255], i * 4); } return px; };
check("teams: torso colour ignores grass and is null for pure grass", () => { const c = torsoColour(jersey([200, 60, 60]), 200, 300, [40, 50, 160, 250]); assert.ok(c && lab2hex(c) !== "#287828"); const g = new Uint8ClampedArray(200 * 300 * 4); for (let i = 0; i < 200 * 300; i++) g.set([40, 120, 40, 255], i * 4); assert.equal(torsoColour(g, 200, 300, [40, 50, 160, 250]), null); });
check("teams: two clear kits are separated, a third colour is 'other'; similar kits are uncertain, user colours and off work", () => {
  const cols = new Map<number, Lab>(); const j = (h: string, s: number): Lab => { const l = hex2lab(h); return [l[0] + gauss() * s, l[1] + gauss() * s, l[2] + gauss() * s]; };
  for (let i = 0; i < 8; i++) cols.set(i, j("#d02020", 3)); for (let i = 8; i < 16; i++) cols.set(i, j("#f0f0f0", 3)); cols.set(99, hex2lab("#f2d000")); const { labels, info } = classify(cols);
  assert.ok(info.status === "clustered" && info.separation! > 1.8); assert.equal(new Set([...Array(8).keys()].map((i) => labels.get(i))).size, 1); assert.equal(new Set([...Array(8).keys()].map((i) => labels.get(i + 8))).size, 1); assert.notEqual(labels.get(0), labels.get(8)); assert.deepEqual(new Set([labels.get(0), labels.get(8)]), new Set([TEAM_A, TEAM_B])); assert.equal(labels.get(99), OTHER);
  const sim = new Map<number, Lab>(); for (let i = 0; i < 16; i++) sim.set(i, j("#808080", 6)); const u = classify(sim); assert.ok(u.info.status === "uncertain" && new Set(u.labels.values()).size === 1 && [...u.labels.values()][0] === UNCERTAIN);
  const c3 = new Map<number, Lab>([[1, hex2lab("#d02020")], [2, hex2lab("#2030d0")], [3, hex2lab("#20d020")]]), us = classify(c3, "colors", ["#cc2222", "#2233cc"]); assert.ok(us.labels.get(1) === TEAM_A && us.labels.get(2) === TEAM_B && us.labels.get(3) === OTHER && us.info.status === "user_colours"); const off = classify(c3, "off"); assert.ok(off.info.status === "off" && new Set(off.labels.values()).size === 1);
});
const HP: M3 = [9, 2, 120, 0.5, 7, 80, 1e-4, 4e-4, 1]; const IDS = ["corner_tl", "corner_br", "centre_spot", "pen_l_top", "pen_r_bottom", "spot_r", "circle_left"];
const synth = (ids: string[], noise = 0): [number, number, number, number][] => { const lm = landmarks(); return ids.map((k) => { const [x, y] = apply3(HP, lm[k].x, lm[k].y); return [x + noise * gauss(), y + noise * gauss(), lm[k].x, lm[k].y]; }); };
check("pitch: landmark catalogue matches the Laws of the Game", () => { const lm = landmarks(105, 68); assert.ok(lm.centre_spot.x === 52.5 && lm.centre_spot.y === 34); assert.ok(lm.pen_l_top.x === 16.5 && Math.abs(lm.pen_l_top.y - (34 - 20.16)) < 1e-6); assert.equal(lm.spot_r.x, 105 - 11); assert.ok(Math.abs(lm.goalarea_l_bottom.y - (34 + 9.16)) < 1e-6); assert.ok(lm.arc_l_top.y > 26 && lm.arc_l_top.y < 27.5); assert.equal(new Set(Object.values(lm).map((v) => `${v.x},${v.y}`)).size, Object.keys(lm).length); });
check("pitch: an exact perspective is recovered; noise is reported; a wrong landmark is rejected; 4 points warn", () => {
  const cal = fitHomography(synth(IDS), 105, 68); assert.ok(cal.residual < 1e-3 && cal.inliers.every(Boolean) && cal.quality === "good"); const e = apply3(inv3(HP)!, 300, 400), g = apply3(cal.H, 300, 400); assert.ok(Math.abs(g[0] - e[0]) < 1e-3 && Math.abs(g[1] - e[1]) < 1e-3);
  const nz = fitHomography(synth(IDS, 1.5), 105, 68); assert.ok(nz.residual > 0 && nz.residual < 3);
  const pairs = synth(IDS); pairs[2] = [pairs[2][0], pairs[2][1], pairs[2][2] + 25, pairs[2][3] + 12]; const bad = fitHomography(pairs, 105, 68); assert.ok(bad.inliers[2] === false && bad.inliers.filter(Boolean).length === IDS.length - 1 && bad.warnings.some((w) => w.includes("disagreed")));
  assert.ok(fitHomography(synth(["corner_tl", "corner_br", "pen_l_top", "pen_r_bottom"]), 105, 68).warnings.some((w) => w.includes("4") && w.includes("perfectly")));
});
check("pitch: too few points, collinear points, duplicates and NaN are refused", () => {
  for (const n of [0, 1, 3]) assert.throws(() => fitHomography(synth(IDS.slice(0, n)), 105, 68), (e: Error) => e instanceof CalibrationError && /At least 4/.test(e.message));
  const lm = landmarks(), col = ["corner_tl", "half_top", "corner_tr"].map((k, i) => [10 * i + 5, 3 * i + 2, lm[k].x, lm[k].y] as [number, number, number, number]); col.push([100, 9, 80, 0]); assert.throws(() => fitHomography(col, 105, 68), /straight line/);
  const p = synth(IDS); assert.throws(() => fitHomography([...p, p[0]], 105, 68), /only once/); p[0] = [NaN, 1, p[0][2], p[0][3]]; assert.throws(() => fitHomography(p, 105, 68), /finite/);
  assert.ok(zoneOf(1, 1, 105, 68) === 0 && zoneOf(104, 67, 105, 68) === 8 && zoneOf(52, 34, 105, 68) === 4 && zoneOf(-1, 10, 105, 68) === null);
});
const DT = 0.2, line = (speed: number, n = 50, jit = 0): { t: number[]; xy: [number, number][] } => ({ t: Array.from({ length: n }, (_, i) => i * DT), xy: Array.from({ length: n }, (_, i) => [10 + speed * i * DT + jit * gauss(), 30 + jit * gauss()] as [number, number]) });
check("stats: constant speed gives the right distance and speeds; jitter does not inflate a standing player; jumps are excluded; gaps are not bridged", () => {
  let { t, xy } = line(4); let p = trackStats(t, xy.map((q) => [q[0] * 10, q[1] * 10] as [number, number]), xy, DT, 105, 68).pitch!; assert.ok(p.status === "ok" && p.distance_m! > 4 * (t[49] - t[0]) - 3 && p.distance_m! <= 4 * (t[49] - t[0]) + 0.1 && Math.abs(p.avg_speed_ms! - 4) < 0.3 && Math.abs(p.max_speed_ms! - 4) < 0.3, JSON.stringify(p));
  ({ t, xy } = line(0, 120, 0.4)); p = trackStats(t, xy, xy, DT, 105, 68).pitch!; let raw = 0; for (let i = 1; i < xy.length; i++) raw += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]); assert.ok(p.distance_m! < 0.35 * raw && (p.max_speed_ms === null || p.max_speed_ms! < 3));
  ({ t, xy } = line(1, 30)); for (let i = 15; i < 30; i++) xy[i] = [xy[i][0] + 40, xy[i][1]]; p = trackStats(t, xy, xy, DT, 105, 68).pitch!; assert.ok(p.excluded_segments! >= 1 && p.distance_m! < 12);
  ({ t, xy } = line(2, 40)); const keep = [...Array(10).keys(), ...Array.from({ length: 10 }, (_, i) => 30 + i)]; p = trackStats(keep.map((i) => t[i]), keep.map((i) => xy[i]), keep.map((i) => xy[i]), DT, 105, 68).pitch!; assert.ok(p.distance_m! < 2 * (t[9] - t[0] + t[39] - t[30]) + 1);
  ({ t, xy } = line(1, 20)); assert.equal(trackStats(t, xy, xy.map(() => null), DT, 105, 68).pitch!.status, "insufficient"); assert.equal(trackStats(t, xy, null, DT, 105, 68).pitch, null); assert.ok(!inPitch(-5, 10, 105, 68) && inPitch(-2, 10, 105, 68));
  ({ t, xy } = line(1, 100)); const st = trackStats(t, xy, xy, DT, 105, 68); assert.ok(Math.abs(st.zone_seconds!.reduce((a, b) => a + b, 0) - 100 * DT) < 0.5);
});
check("stats: possession candidates need an observed ball and a clear nearest player", () => {
  const ply = (i: number, x: number): FrameLite["p"][number] => [i, x - 20, 100, x + 20, 200, 0.9, "team_a", null, null], fr = (t: number, p: FrameLite["p"], b: FrameLite["b"]): FrameLite => ({ t, p, b });
  const ok = Array.from({ length: 5 }, (_, i) => fr(i * DT, [ply(1, 300), ply(2, 700)], [300, 190, 0.8, "observed", null, null])), ev = possessionCandidates(ok, DT); assert.ok(ev.length === 1 && ev[0].track_id === 1 && ev[0].kind === "possession_candidate" && ev[0].basis.includes("not validated"));
  assert.equal(possessionCandidates(Array.from({ length: 5 }, (_, i) => fr(i * DT, [ply(1, 300)], [300, 190, null, "estimated", null, null])), DT).length, 0); assert.equal(possessionCandidates(Array.from({ length: 5 }, (_, i) => fr(i * DT, [ply(1, 300)], [600, 190, 0.8, "observed", null, null])), DT).length, 0);
  assert.equal(possessionCandidates(Array.from({ length: 5 }, (_, i) => fr(i * DT, [ply(1, 290), ply(2, 330)], [310, 190, 0.8, "observed", null, null])), DT).length, 0);
});
