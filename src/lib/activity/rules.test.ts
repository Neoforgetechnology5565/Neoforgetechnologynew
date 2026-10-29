import assert from "node:assert/strict";
import { AGGR_DEFAULTS, FALL_DEFAULTS, armSpeeds, detectAggression, detectFalls, torso, type KP, type Sample } from "./rules";
const check = (n: string, f: () => void) => { f(); console.log("ok", n); };
const H = 300;
/** Rigid skeleton rotated tilt degrees about the ankles (0 = standing); wrists optionally swing. Generated keypoints, not model output (same generator as services/activity-monitor/tests/skeleton.py). */
function skeleton(cx: number, ankleY: number, tilt: number, armPhase: number | null = null, armAmp = 0, vis = 0.95): { kp: KP; box: [number, number, number, number] } {
  const t = (tilt * Math.PI) / 180, u = [Math.sin(t), -Math.cos(t)], p = [Math.cos(t), Math.sin(t)], kp: KP = Array.from({ length: 33 }, () => [cx + 0.5 * H * u[0], ankleY + 0.5 * H * u[1], vis, vis]);
  const put = (i: number, along: number, side: number) => { kp[i][0] = cx + along * H * u[0] + side * H * p[0]; kp[i][1] = ankleY + along * H * u[1] + side * H * p[1]; };
  put(11, 0.8, -0.1); put(12, 0.8, 0.1); put(23, 0.5, -0.06); put(24, 0.5, 0.06); put(0, 0.92, 0); put(25, 0.27, -0.06); put(26, 0.27, 0.06); put(27, 0.02, -0.06); put(28, 0.02, 0.06); put(13, 0.62, -0.12); put(14, 0.62, 0.12);
  const swing = armPhase === null ? 0 : armAmp * Math.sin(armPhase); put(15, 0.45 + swing, -0.14); put(16, 0.45 - swing, 0.14);
  const xs = kp.map((k) => k[0]), ys = kp.map((k) => k[1]);
  return { kp, box: [Math.min(...xs) - 10, Math.min(...ys) - 10, Math.max(...xs) + 10, Math.max(...ys) + 10] };
}
function fallTrack(o: { fps?: number; stand?: number; fall?: number; lie?: number; recover?: boolean } = {}): Sample[] {
  const fps = o.fps ?? 5, stand = o.stand ?? 2, fall = o.fall ?? 0.6, lie = o.lie ?? 2.5, out: Sample[] = [], n = Math.floor((stand + fall + lie) * fps);
  for (let i = 0; i < n; i++) { const t = i / fps; let tilt: number; if (t < stand) tilt = 3 * Math.sin(t * 3); else if (t < stand + fall) tilt = (90 * (t - stand)) / fall; else { tilt = 90; if (o.recover && t > stand + fall + lie - 0.8) tilt = 10; } const s = skeleton(200, 400, tilt); out.push({ t: Math.round(t * 1000) / 1000, box: s.box, score: 0.9, kp: s.kp }); }
  return out;
}
const M = (...e: [number, Sample[]][]) => new Map(e);
check("torso tilt geometry: upright 0, horizontal 90, unsigned, shoulders below hips > 90", () => {
  const a = torso(skeleton(100, 400, 0).kp); assert.ok(Math.abs(a.tilt) < 1 && Math.abs(a.len - 0.3 * H) < 1 && Math.abs(a.hip[1] - (400 - 0.5 * H)) < 1);
  assert.ok(Math.abs(torso(skeleton(100, 400, 90).kp).tilt - 90) < 1); assert.ok(Math.abs(torso(skeleton(100, 400, -90).kp).tilt - 90) < 1); assert.ok(Math.abs(torso(skeleton(100, 400, 150).kp).tilt - 150) < 1);
});
check("a fall is found once, with its evidence", () => {
  const c = detectFalls(M([1, fallTrack()]), FALL_DEFAULTS, 10); assert.equal(c.length, 1); const f = c[0]; assert.ok(f.kind === "fall" && f.tracks[0] === 1);
  assert.ok(f.t_start >= 1.8 && f.t_start <= 2.4 && f.t_peak >= 2.4 && f.t_peak <= 3.2, `${f.t_start} ${f.t_peak}`); assert.ok(f.evidence.filter((e) => e.threshold !== null).every((e) => e.met));
  assert.ok(String(f.evidence.find((e) => e.name.startsWith("Drop"))!.value).includes("hips 1.")); assert.ok(f.notes.some((n) => n.includes("No return")));
});
check("recovery is reported", () => { const c = detectFalls(M([1, fallTrack({ recover: true })]), FALL_DEFAULTS, 10); assert.equal(c.length, 1); assert.ok(!c[0].notes.some((n) => n.includes("No return"))); });
check("standing and walking give nothing", () => {
  const stand: Sample[] = [], walk: Sample[] = []; for (let i = 0; i < 40; i++) { const a = skeleton(200, 400, 2), b = skeleton(100 + 8 * i, 400, 4 * Math.sin(i)); stand.push({ t: i / 5, box: a.box, score: 0.9, kp: a.kp }); walk.push({ t: i / 5, box: b.box, score: 0.9, kp: b.kp }); }
  assert.equal(detectFalls(M([1, stand], [2, walk]), FALL_DEFAULTS, 8).length, 0);
});
check("a person who is never upright is not a fall; a slow lie-down and a brief recovering drop are not falls; bending is not lying", () => {
  const lying: Sample[] = []; for (let i = 0; i < 40; i++) { const a = skeleton(200, 400, 90); lying.push({ t: i / 5, box: a.box, score: 0.9, kp: a.kp }); } assert.equal(detectFalls(M([1, lying]), FALL_DEFAULTS, 8).length, 0);
  assert.equal(detectFalls(M([1, fallTrack({ fall: 6, lie: 3 })]), FALL_DEFAULTS, 12).length, 0); assert.equal(detectFalls(M([1, fallTrack({ lie: 0.4, recover: true })]), FALL_DEFAULTS, 12).length, 0);
  const bend: Sample[] = []; for (let i = 0; i < 40; i++) { const a = skeleton(200, 400, i < 15 ? 3 : 50); bend.push({ t: i / 5, box: a.box, score: 0.9, kp: a.kp }); } assert.equal(detectFalls(M([1, bend]), FALL_DEFAULTS, 8).length, 0);
});
check("a video that ends while the person is lying is flagged as such, and thresholds change the outcome", () => {
  const c = detectFalls(M([1, fallTrack({ lie: 0.8 })]), FALL_DEFAULTS, 3.4); assert.equal(c.length, 1); assert.ok(c[0].evidence.some((e) => String(e.value).includes("video ended")));
  assert.equal(detectFalls(M([1, fallTrack({ lie: 0.8 })]), { ...FALL_DEFAULTS, min_lying_s: 2 }, 60).length, 0);
});
function pair(amp: number, gap: number, seconds = 3, fps = 5): Map<number, Sample[]> {
  const a: Sample[] = [], b: Sample[] = []; for (let i = 0; i < Math.floor(seconds * fps); i++) { const t = i / fps, ph = t * 2 * Math.PI * 1.2 * 2, sa = skeleton(200, 400, 0, ph, amp), sb = skeleton(200 + gap, 400, 0, null, 0); a.push({ t, box: sa.box, score: 0.9, kp: sa.kp }); b.push({ t, box: sb.box, score: 0.9, kp: sb.kp }); }
  return M([1, a], [2, b]);
}
check("arm speed is relative to the person's own hips (rigid arms while walking fast give ~0)", () => {
  const v = [...armSpeeds(pair(0.3, 120).get(1)!, 0.5).values()]; assert.ok(Math.max(...v) > 3); assert.ok(Math.max(...armSpeeds(pair(0, 120).get(1)!, 0.5).values()) < 0.01);
  const moving: Sample[] = []; for (let i = 0; i < 10; i++) { const a = skeleton(100 + 40 * i, 400, 0); moving.push({ t: i / 5, box: a.box, score: 0.9, kp: a.kp }); } assert.ok(Math.max(...armSpeeds(moving, 0.5).values()) < 0.01);
});
check("a close pair with fast arms is a candidate; a far pair, slow arms or too short a contact are not", () => {
  const p = { ...AGGR_DEFAULTS, min_arm_speed: 3 }, c = detectAggression(pair(0.3, 120), p); assert.equal(c.length, 1); assert.ok(c[0].kind === "aggression" && c[0].tracks.join() === "1,2" && c[0].notes.some((n) => /dancing/i.test(n)));
  assert.equal(detectAggression(pair(0.3, 900), p).length, 0); assert.equal(detectAggression(pair(0.02, 120), p).length, 0); assert.equal(detectAggression(pair(0.3, 120, 0.6), p).length, 0);
});
check("tracks without pose never raise an aggression alert; the box-shape fallback for falls says so", () => {
  const t = pair(0.3, 120); for (const tr of t.values()) tr.forEach((s) => (s.kp = null)); assert.equal(detectAggression(t, { ...AGGR_DEFAULTS, min_arm_speed: 3 }).length, 0);
  const box = detectFalls(M([1, fallTrack().map((s) => ({ ...s, kp: null }))]), FALL_DEFAULTS, 10); assert.equal(box.length, 1); assert.ok(box[0].notes.some((n) => n.includes("box shape")));
});
