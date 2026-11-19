import assert from "node:assert/strict";
import { analyse, anglesOf, angleBetween } from "./analysis";
import { estimateSequence, mpjpe } from "./estimate";
import { BONE_IDX, DATASETS, fk, generateDataset, J, poseAt, type MotionKey, type Pose, type V3 } from "./model";

const STAND: Pose = { root: [0, 0, 0], heading: 0, trunk: 0, hipFlex: [0, 0], hipAbd: [0, 0], knee: [0, 0], shFlex: [0, 0], shAbd: [0, 0], elbow: [0, 0] };
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

async function main() {
  // ---- skeleton model: rigid bones, feet on the floor, arms and legs on the correct sides
  const s = fk(STAND); assert.ok(Math.abs(s[J.head][1] - 1.75 + 0.075 - 0.2 + 0.2) < 0.4 && s[J.l_shoulder][0] > 0 && s[J.r_shoulder][0] < 0 && s[J.l_hip][0] > 0, "left is +X"); assert.ok(Math.abs(Math.min(s[J.l_ankle][1], s[J.r_ankle][1]) - 0.075) < 1e-9, "feet on the floor");
  const lens0 = BONE_IDX.map(([a, b]) => dist(s[a], s[b])); for (const m of Object.keys(DATASETS[0] ? { walk: 1, squat: 1, jacks: 1, jump: 1, kick: 1 } : {}) as MotionKey[]) for (let t = 0; t < 2.4; t += 0.1) { const j = fk(poseAt(m, t, [0, 0, 0], 0.5)); const w = fk(poseAt(m, 0, [0, 0, 0], 0.5)); BONE_IDX.forEach(([a, b], i) => assert.ok(Math.abs(dist(j[a], j[b]) - dist(w[a], w[b])) < 1e-9, `${m}: bone ${i} stays rigid`)); }
  void lens0;
  const abd = fk({ ...STAND, shAbd: [1.2, 1.2], hipAbd: [0.4, 0.4] }); assert.ok(abd[J.l_elbow][0] > abd[J.l_shoulder][0] + 0.2 && abd[J.r_elbow][0] < abd[J.r_shoulder][0] - 0.2, "abduction moves arms outwards"); assert.ok(abd[J.l_knee][0] > abd[J.l_hip][0] && abd[J.r_knee][0] < abd[J.r_hip][0], "leg abduction outwards");
  // ---- joint angles on known poses
  const a0 = anglesOf(fk(STAND)); assert.ok(a0.elbowL < 1 && a0.kneeL < 1 && a0.trunkLean < 1 && a0.shoulderAbdL < 1, "straight standing pose"); const a1 = anglesOf(fk({ ...STAND, elbow: [Math.PI / 2, 0], knee: [Math.PI / 2, 0], shFlex: [0, 0], hipFlex: [0, 0] })); assert.ok(Math.abs(a1.elbowL - 90) < 0.1 && Math.abs(a1.kneeL - 90) < 0.1, "90 degree elbow and knee");
  assert.ok(Math.abs(anglesOf(fk({ ...STAND, shAbd: [Math.PI / 2, 0] })).shoulderAbdL - 90) < 0.1, "shoulder abduction 90"); assert.ok(Math.abs(angleBetween([1, 0, 0], [0, 1, 0]) - 90) < 1e-9);
  // ---- generated clouds: deterministic, floor and clutter present, back-face culling in single-view scans
  const ds = Object.fromEntries(DATASETS.map((d) => [d.id, d])), f1 = generateDataset(ds.walk), f2 = generateDataset(ds.walk); assert.equal(f1[5].points.length, f2[5].points.length); assert.equal(f1[5].points[100], f2[5].points[100], "deterministic"); assert.ok(f1[0].points.length / 3 > 6000);
  const multi = generateDataset({ ...ds.squat, sensor: "multi", frames: 1 })[0].points.length, front = generateDataset({ ...ds.squat, frames: 1 })[0].points.length; assert.ok(front < multi * 0.9, "a single depth camera sees fewer points than a multi-view rig");
  // ---- estimation from points only, against the known skeleton
  const limit: Record<string, number> = { walk: 0.05, squat: 0.08, jacks: 0.06, jump: 0.14, kick: 0.11, two: 0.06 }; const results: Record<string, ReturnType<typeof analyse>[]> = {};
  for (const d of DATASETS) {
    const fr = generateDataset(d), est = estimateSequence(fr.map((f) => f.points)), m = mpjpe(est, fr.map((f) => f.truth)); assert.ok(m.mean < limit[d.id], `${d.id}: MPJPE ${(m.mean * 100).toFixed(1)} cm (limit ${limit[d.id] * 100})`); assert.equal(m.missed, 0, `${d.id}: every frame had every person`);
    const ids = new Set(est.flatMap((e) => e.people.map((p) => p.id))); assert.equal(ids.size, d.people.length, `${d.id}: ${ids.size} identities for ${d.people.length} people`); assert.ok(est.every((e) => e.people.length === d.people.length), `${d.id}: people count per frame`);
    assert.ok(Math.abs(est[0].floorY) < 0.03, "floor found at y = 0"); if (d.clutter) assert.ok(est.every((e) => e.rejected >= 1), `${d.id}: pillar and box rejected as non-people`);
    assert.ok(est[10].people.every((p) => p.confidence > 0.5), "fit confidence");
    results[d.id] = d.people.map((_, pi) => { const id = [...ids].sort()[pi]; return analyse(est.map((e) => e.people.find((p) => p.id === id)?.joints ?? null), d.fps); });
  }
  // ---- motion classification: the most common non-"standing" label over the clip must be the generated motion; per-frame agreement is reported (a squat or jump also contains standing and transition frames)
  let right = 0, total = 0; for (const d of DATASETS) d.people.forEach((p, i) => { const a = results[d.id][i], c: Record<string, number> = {}; for (const l of a.labels) if (l !== "stand") c[l] = (c[l] ?? 0) + 1; const dom = Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0]; assert.equal(dom, p.motion, `${d.id} person ${i}: dominant label ${dom}`); right += a.labels.filter((l) => l === p.motion).length; total += a.labels.length; assert.ok(a.labels.filter((l) => l === p.motion).length / a.labels.length >= 0.5, `${d.id}: per-frame agreement`); });
  assert.ok(right / total >= 0.7, `overall per-frame agreement ${(right / total * 100).toFixed(0)}%`);
  // ---- biomechanics on known behaviour
  const w = results.walk[0]; assert.ok(w.distance > 2.8 && w.distance < 4.2 && w.meanSpeed > 0.9 && w.meanSpeed < 1.5, `walking speed ${w.meanSpeed.toFixed(2)} m/s distance ${w.distance.toFixed(2)} m`); assert.ok(w.symmetry.find((x) => x.pair === "Knees")!.percent > 75, "walking is symmetric"); assert.ok(w.direction.slice(5, 50).every((v) => v[2] > 0.8), "walking direction is +Z");
  const sq = results.squat[0]; assert.ok(sq.rom.find((r) => r.key === "kneeL")!.max > 75, "squat knee flexion"); const jj = results.jacks[0]; assert.ok(jj.rom.find((r) => r.key === "shoulderAbdL")!.max > 120, "jumping-jack arm abduction"); const kk = results.kick[0]; assert.ok(Math.abs(kk.rom.find((r) => r.key === "hipR")!.range - kk.rom.find((r) => r.key === "hipL")!.range) > 20, "kick is asymmetric");
  console.log("3D pose tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
