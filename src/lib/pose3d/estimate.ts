import { BONE_IDX, fk, J, type V3, type Pose } from "./model";

/**
 * Pose estimation from a 3D point cloud only (no skeleton is read from the data generator):
 *  1. floor removal: the most common low height is the floor, points within 4 cm of it are dropped;
 *  2. people candidates: remaining points are grouped into connected 10 cm voxel clusters, and a cluster must be person-sized (0.9-2.3 m tall, under 2.2 m wide, standing near the floor);
 *  3. tracking: clusters are matched to the previous frame by nearest horizontal distance (max 0.5 m); unmatched clusters start new tracks;
 *  4. skeleton fitting: an articulated body of 15 capsules is fitted to each cluster with iterative closest-capsule updates, then bone lengths and a rigid torso are re-imposed
 *     (position-based constraints). Each frame starts from the previous frame's fit, so large unseen motions can lose the track.
 * Left and right are named from the initial facing direction (+Z, towards the camera for the sample scenes): a mirrored fit is as good a fit, so they can swap in rare cases.
 */
export interface Estimated { id: number; joints: V3[]; confidence: number; support: number; centroid: V3; height: number; status: "new" | "tracked" }
export interface FrameEstimate { people: Estimated[]; rejected: number; floorY: number; clusterOf: Int32Array /* cluster index per point, -1 = floor/other */; clusterPerson: number[] /* person id per cluster or -1 */; residual: Float32Array }
const STAND: Pose = { root: [0, 0, 0], heading: 0, trunk: 0, hipFlex: [0, 0], hipAbd: [0.04, 0.04], knee: [0.03, 0.03], shFlex: [0, 0], shAbd: [0.08, 0.08], elbow: [0.1, 0.1] };

function segDist(p: number[], a: V3, b: V3): { d: number; t: number; q: V3 } {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], l2 = ax * ax + ay * ay + az * az || 1e-9; let t = ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay + (p[2] - a[2]) * az) / l2; t = Math.max(0, Math.min(1, t));
  const q: V3 = [a[0] + ax * t, a[1] + ay * t, a[2] + az * t]; return { d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), t, q };
}
interface Calib { lens: number[]; rigid: [number, number, number][]; scale: number }
function calibrate(j: V3[]): Calib { const dist = (a: number, b: number) => Math.hypot(j[a][0] - j[b][0], j[a][1] - j[b][1], j[a][2] - j[b][2]); const pairs: [number, number][] = [[J.l_shoulder, J.r_shoulder], [J.l_hip, J.r_hip], [J.l_shoulder, J.l_hip], [J.r_shoulder, J.r_hip], [J.l_shoulder, J.r_hip], [J.r_shoulder, J.l_hip], [J.pelvis, J.neck], [J.spine, J.l_shoulder], [J.spine, J.r_shoulder], [J.spine, J.l_hip], [J.spine, J.r_hip]]; return { lens: BONE_IDX.map(([a, b]) => dist(a, b)), rigid: pairs.map(([a, b]) => [a, b, dist(a, b)]), scale: 1 }; }
function project(j: V3[], c: Calib, iters = 8) {
  const fix = (a: number, b: number, L: number, wa = 0.5) => { const dx = j[b][0] - j[a][0], dy = j[b][1] - j[a][1], dz = j[b][2] - j[a][2], d = Math.hypot(dx, dy, dz) || 1e-9, k = (d - L) / d; for (let m = 0; m < 3; m++) { const dd = [dx, dy, dz][m]; j[a][m] += dd * k * wa; j[b][m] -= dd * k * (1 - wa); } };
  for (let it = 0; it < iters; it++) { for (const [a, b, L] of c.rigid) fix(a, b, L); BONE_IDX.forEach(([a, b], i) => fix(a, b, c.lens[i])); }
}
export function fitSkeleton(joints: V3[], pts: number[][], calib: Calib, iterations: number): { joints: V3[]; confidence: number; support: number; residual: number[] } {
  const j = joints.map((v) => [...v] as V3);
  for (let it = 0; it < iterations; it++) {
    const num = new Float64Array(48), den = new Float64Array(16);
    for (const p of pts) {
      // coarse-to-fine capture radius below: fast limb motion is picked up first, then refined
      let best = Infinity, bi = -1, bt = 0, bq: V3 = [0, 0, 0];
      for (let k = 0; k < BONE_IDX.length; k++) { const [a, b, r] = BONE_IDX[k]; const s = segDist(p, j[a], j[b]), d = s.d - r; if (d < best) { best = d; bi = k; bt = s.t; bq = s.q; } }
      if (best > Math.max(0.14, 0.5 * Math.pow(0.8, it)) || bi < 0) continue; const [a, b, r] = BONE_IDX[bi], vx = p[0] - bq[0], vy = p[1] - bq[1], vz = p[2] - bq[2], l = Math.hypot(vx, vy, vz) || 1e-9, e = l - r, w = 1 / (1 + (best / 0.05) ** 2);
      const dx = (vx / l) * e, dy = (vy / l) * e, dz = (vz / l) * e, wa = (1 - bt) * w, wb = bt * w;
      num[a * 3] += wa * dx; num[a * 3 + 1] += wa * dy; num[a * 3 + 2] += wa * dz; den[a] += wa * (1 - bt); num[b * 3] += wb * dx; num[b * 3 + 1] += wb * dy; num[b * 3 + 2] += wb * dz; den[b] += wb * bt;
    }
    for (let k = 0; k < 16; k++) if (den[k] > 0.5) for (let m = 0; m < 3; m++) j[k][m] += (0.55 * num[k * 3 + m]) / den[k];
    project(j, calib);
  }
  const residual: number[] = []; let near = 0;
  for (const p of pts) { let best = Infinity; for (const [a, b, r] of BONE_IDX) best = Math.min(best, segDist(p, j[a], j[b]).d - r); residual.push(Math.abs(best)); if (Math.abs(best) < 0.035) near++; }
  return { joints: j, confidence: near / Math.max(1, pts.length), support: pts.length, residual };
}
function floorOf(pts: Float32Array): number { const h = new Uint32Array(80); for (let i = 1; i < pts.length; i += 3) { const b = Math.floor((pts[i] + 0.1) / 0.01); if (b >= 0 && b < 80) h[b]++; } let bi = 0; for (let b = 1; b < 80; b++) if (h[b] > h[bi]) bi = b; return bi * 0.01 - 0.1 + 0.005; }
interface Cluster { idx: number[]; min: V3; max: V3; c: V3 }
function clusters(pts: Float32Array, keep: number[], vox = 0.1): Cluster[] {
  const key = (x: number, y: number, z: number) => x + 4096 * (y + 4096 * z), cells = new Map<number, number[]>(); const mn = [Infinity, Infinity, Infinity]; for (const i of keep) for (let a = 0; a < 3; a++) mn[a] = Math.min(mn[a], pts[i * 3 + a]);
  for (const i of keep) { const k = key(Math.floor((pts[i * 3] - mn[0]) / vox) + 1, Math.floor((pts[i * 3 + 1] - mn[1]) / vox) + 1, Math.floor((pts[i * 3 + 2] - mn[2]) / vox) + 1); const l = cells.get(k); if (l) l.push(i); else cells.set(k, [i]); }
  const seen = new Set<number>(), out: Cluster[] = [];
  for (const s of cells.keys()) { if (seen.has(s)) continue; const stack = [s], idx: number[] = []; seen.add(s); while (stack.length) { const c = stack.pop()!; idx.push(...cells.get(c)!); const x = c % 4096, rest = (c - x) / 4096, y = rest % 4096, z = (rest - y) / 4096; for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nk = key(x + dx, y + dy, z + dz); if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); } } }
    const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity], c: V3 = [0, 0, 0]; for (const i of idx) for (let a = 0; a < 3; a++) { const v = pts[i * 3 + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; c[a] += v; } out.push({ idx, min, max, c: [c[0] / idx.length, c[1] / idx.length, c[2] / idx.length] }); }
  return out;
}
export function estimateSequence(frames: Float32Array[], opts: { iterations?: number; maxPoints?: number } = {}): FrameEstimate[] {
  const iters = opts.iterations ?? 14, maxPts = opts.maxPoints ?? 1600; const tracks = new Map<number, { joints: V3[]; calib: Calib; c: V3; pelvisToC: V3 }>(); let nextId = 0; const out: FrameEstimate[] = [];
  for (const pts of frames) {
    const n = pts.length / 3, floorY = floorOf(pts), keep: number[] = []; for (let i = 0; i < n; i++) if (pts[i * 3 + 1] > floorY + 0.04) keep.push(i);
    const cl = clusters(pts, keep), clusterOf = new Int32Array(n).fill(-1), clusterPerson: number[] = [], people: Estimated[] = [], residual = new Float32Array(n); let rejected = 0;
    const cand: { ci: number; cluster: Cluster }[] = [];
    cl.forEach((c, ci) => { for (const i of c.idx) clusterOf[i] = ci; clusterPerson[ci] = -1; const h = c.max[1] - floorY, w = Math.max(c.max[0] - c.min[0], c.max[2] - c.min[2]); if (c.idx.length >= 250 && h >= 0.9 && h <= 3.0 && w <= 2.4 && c.min[1] - floorY < 0.7) cand.push({ ci, cluster: c }); else rejected++; });
    const used = new Set<number>(), assigned: { ci: number; cluster: Cluster; id: number | null }[] = [];
    const pairs: [number, number, number][] = []; for (const cd of cand) for (const [id, tr] of tracks) pairs.push([Math.hypot(cd.cluster.c[0] - tr.c[0], cd.cluster.c[2] - tr.c[2]), cd.ci, id]); pairs.sort((a, b) => a[0] - b[0]); const matchedC = new Set<number>();
    for (const [d, ci, id] of pairs) { if (d > 0.5 || used.has(id) || matchedC.has(ci)) continue; used.add(id); matchedC.add(ci); assigned.push({ ci, cluster: cand.find((x) => x.ci === ci)!.cluster, id }); }
    for (const cd of cand) if (!matchedC.has(cd.ci)) assigned.push({ ci: cd.ci, cluster: cd.cluster, id: null });
    for (const a of assigned) {
      const c = a.cluster, h = c.max[1] - floorY; if (a.id === null && (h < 1.05 || h > 2.3 || c.max[0] - c.min[0] > 2.2 || c.max[2] - c.min[2] > 2.2)) { rejected++; continue; } /* a NEW person must be person-sized; a tracked one may be taller (arms raised, jumping) */ let id = a.id, status: Estimated["status"] = "tracked"; let init: V3[], calib: Calib;
      const sub: number[][] = []; const step = Math.max(1, Math.floor(c.idx.length / maxPts)); for (let k = 0; k < c.idx.length; k += step) { const i = c.idx[k]; sub.push([pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]]); }
      if (id === null) { id = nextId++; status = "new"; const sc = Math.min(1.25, Math.max(0.8, h / 1.8)); init = fk({ ...STAND, root: [c.c[0], floorY, c.c[2]] }, sc); calib = calibrate(init); calib.scale = sc; }
      else { const tr = tracks.get(id)!; calib = tr.calib; const dx = c.c[0] - tr.c[0], dy = c.c[1] - tr.c[1], dz = c.c[2] - tr.c[2]; init = tr.joints.map((v) => [v[0] + dx, v[1] + dy, v[2] + dz] as V3); }
      let fit = fitSkeleton(init, sub, calib, status === "new" ? iters * 2 : iters + 6);
      if (status === "tracked" && fit.confidence < 0.55) { const re = fitSkeleton(fit.joints, sub, calib, iters * 2); if (re.confidence > fit.confidence) fit = re; }
      tracks.set(id, { joints: fit.joints, calib, c: c.c, pelvisToC: [0, 0, 0] });
      clusterPerson[a.ci] = id; people.push({ id, joints: fit.joints, confidence: fit.confidence, support: c.idx.length, centroid: c.c, height: h, status });
      c.idx.forEach((i) => { let best = Infinity; const p = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]]; for (const [aa, bb, r] of BONE_IDX) best = Math.min(best, segDist(p, fit.joints[aa], fit.joints[bb]).d - r); residual[i] = Math.abs(best); });
    }
    for (const id of [...tracks.keys()]) if (!people.some((p) => p.id === id)) { /* lost for this frame: keep the last fit so the track can resume */ }
    people.sort((a, b) => a.id - b.id); out.push({ people, rejected, floorY, clusterOf, clusterPerson, residual });
  }
  return out;
}
/** Mean per-joint position error (metres) between estimated and true skeletons, matching estimated people to true people by pelvis distance. */
export function mpjpe(est: FrameEstimate[], truth: V3[][][]): { mean: number; perJoint: number[]; frames: number[]; matched: number; missed: number } {
  const per = new Float64Array(16), cnt = new Float64Array(16), frames: number[] = []; let matched = 0, missed = 0;
  est.forEach((fe, f) => { let fs = 0, fc = 0; for (const tj of truth[f]) { let best: Estimated | null = null, bd = Infinity; for (const p of fe.people) { const d = Math.hypot(p.joints[0][0] - tj[0][0], p.joints[0][2] - tj[0][2]); if (d < bd) { bd = d; best = p; } } if (!best || bd > 0.6) { missed++; continue; } matched++; for (let k = 0; k < 16; k++) { const e = Math.hypot(best.joints[k][0] - tj[k][0], best.joints[k][1] - tj[k][1], best.joints[k][2] - tj[k][2]); per[k] += e; cnt[k]++; fs += e; fc++; } } frames.push(fc ? fs / fc : NaN); });
  const pj = Array.from(per, (v, k) => (cnt[k] ? v / cnt[k] : NaN)); return { mean: pj.reduce((a, b) => a + b, 0) / pj.length, perJoint: pj, frames, matched, missed };
}
