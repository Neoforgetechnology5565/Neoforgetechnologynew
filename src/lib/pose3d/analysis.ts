import { J, MOTIONS, type MotionKey, type V3 } from "./model";

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
/** Angle in degrees between two vectors. */
export const angleBetween = (a: V3, b: V3) => { const l = len(a) * len(b); return l < 1e-9 ? 0 : (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / l))) * 180) / Math.PI; };
export interface Angles { elbowL: number; elbowR: number; kneeL: number; kneeR: number; hipL: number; hipR: number; shoulderAbdL: number; shoulderAbdR: number; trunkLean: number; headTilt: number }
export const ANGLE_LABEL: Record<keyof Angles, string> = { elbowL: "Left elbow flexion", elbowR: "Right elbow flexion", kneeL: "Left knee flexion", kneeR: "Right knee flexion", hipL: "Left hip flexion", hipR: "Right hip flexion", shoulderAbdL: "Left shoulder abduction", shoulderAbdR: "Right shoulder abduction", trunkLean: "Trunk lean from vertical", headTilt: "Head tilt from trunk" };
/** Joint angles of one skeleton. Flexion = 0 for a straight limb. Shoulder abduction = angle between the upper arm and the downward trunk direction. */
export function anglesOf(j: V3[]): Angles {
  const flex = (a: number, b: number, c: number) => 180 - angleBetween(sub(j[a], j[b]), sub(j[c], j[b])), trunkUp = sub(j[J.neck], j[J.pelvis]), down: V3 = [-trunkUp[0], -trunkUp[1], -trunkUp[2]];
  const hip = (h: number, k: number) => angleBetween(sub(j[k], j[h]), down), abd = (s: number, e: number) => angleBetween(sub(j[e], j[s]), down);
  return { elbowL: flex(J.l_shoulder, J.l_elbow, J.l_wrist), elbowR: flex(J.r_shoulder, J.r_elbow, J.r_wrist), kneeL: flex(J.l_hip, J.l_knee, J.l_ankle), kneeR: flex(J.r_hip, J.r_knee, J.r_ankle), hipL: hip(J.l_hip, J.l_knee), hipR: hip(J.r_hip, J.r_knee), shoulderAbdL: abd(J.l_shoulder, J.l_elbow), shoulderAbdR: abd(J.r_shoulder, J.r_elbow), trunkLean: angleBetween(trunkUp, [0, 1, 0]), headTilt: angleBetween(sub(j[J.head], j[J.neck]), trunkUp) };
}
export interface Rom { key: keyof Angles; min: number; max: number; range: number }
export interface Analysis {
  angles: Angles[]; speed: number[] /* pelvis speed m/s */; wristSpeed: [number[], number[]]; direction: V3[] /* horizontal pelvis velocity direction */; rom: Rom[]; symmetry: { pair: string; percent: number }[]; labels: MotionKey[]; trajectories: Record<number, V3[]>;
  distance: number; meanSpeed: number; maxSpeed: number; posture: { trunkLeanMean: number; kneeBalance: number };
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
/** Analyses one tracked person over the clip. `joints[f]` is the skeleton at frame f, or null where the person was not found (those frames are skipped). */
export function analyse(joints: (V3[] | null)[], fps: number): Analysis {
  const n = joints.length, dt = 1 / fps, angles: Angles[] = joints.map((j) => (j ? anglesOf(j) : (null as unknown as Angles)));
  const speed: number[] = [], wL: number[] = [], wR: number[] = [], dir: V3[] = [];
  for (let f = 0; f < n; f++) { const a = joints[Math.max(0, f - 1)], b = joints[Math.min(n - 1, f + 1)], span = (Math.min(n - 1, f + 1) - Math.max(0, f - 1)) * dt; if (!a || !b || span <= 0) { speed.push(0); wL.push(0); wR.push(0); dir.push([0, 0, 0]); continue; } const v = sub(b[J.pelvis], a[J.pelvis]); speed.push(len(v) / span); wL.push(len(sub(b[J.l_wrist], a[J.l_wrist])) / span); wR.push(len(sub(b[J.r_wrist], a[J.r_wrist])) / span); const h = Math.hypot(v[0], v[2]) || 1; dir.push([v[0] / h, 0, v[2] / h]); }
  const smooth = (x: number[]) => x.map((_, i) => mean(x.slice(Math.max(0, i - 2), i + 3)));
  const sp = smooth(speed);
  const keys = Object.keys(ANGLE_LABEL) as (keyof Angles)[], rom: Rom[] = keys.map((k) => { const v = angles.filter(Boolean).map((a) => a[k]); const mn = Math.min(...v), mx = Math.max(...v); return { key: k, min: mn, max: mx, range: mx - mn }; });
  const sym = (l: keyof Angles, r: keyof Angles, name: string) => { const a = rom.find((x) => x.key === l)!.range, b = rom.find((x) => x.key === r)!.range; return { pair: name, percent: Math.max(a, b) < 3 ? 100 : (Math.min(a, b) / Math.max(a, b)) * 100 }; };
  const symmetry = [sym("elbowL", "elbowR", "Elbows"), sym("kneeL", "kneeR", "Knees"), sym("hipL", "hipR", "Hips"), sym("shoulderAbdL", "shoulderAbdR", "Shoulders")];
  // motion classification over a sliding window (about 0.45 s)
  const win = Math.max(5, Math.round(0.45 * fps)), labels: MotionKey[] = [];
  for (let f = 0; f < n; f++) {
    const idx: number[] = []; for (let k = Math.max(0, f - win); k <= Math.min(n - 1, f + win); k++) if (joints[k]) idx.push(k); if (idx.length < 3) { labels.push(f > 0 ? labels[f - 1] : "stand"); continue; }
    const pel = idx.map((k) => joints[k]![J.pelvis]), hs = mean(idx.slice(1).map((k, i) => Math.hypot(joints[k]![J.pelvis][0] - joints[idx[i]]![J.pelvis][0], joints[k]![J.pelvis][2] - joints[idx[i]]![J.pelvis][2]) / ((k - idx[i]) * dt)));
    const ay = idx.map((k) => Math.min(joints[k]![J.l_ankle][1], joints[k]![J.r_ankle][1])), diff = idx.map((k) => Math.abs(joints[k]![J.l_ankle][1] - joints[k]![J.r_ankle][1])), pr = Math.max(...pel.map((p) => p[1])) - Math.min(...pel.map((p) => p[1]));
    const A = idx.map((k) => angles[k]), kneeMax = Math.max(...A.map((a) => (a.kneeL + a.kneeR) / 2)), kneeRange = kneeMax - Math.min(...A.map((a) => (a.kneeL + a.kneeR) / 2)), armMax = Math.max(...A.map((a) => (a.shoulderAbdL + a.shoulderAbdR) / 2)), armRange = armMax - Math.min(...A.map((a) => (a.shoulderAbdL + a.shoulderAbdR) / 2));
    const flightLow = Math.max(...ay) - Math.min(...ay); // how far the lower foot rises and falls
    let l: MotionKey = "stand";
    if (hs > 0.5) l = "walk"; else if (Math.max(...diff) > 0.3 && Math.max(...A.map((a) => Math.max(a.hipL, a.hipR))) > 45 && kneeMax < 100 && armMax < 60 && hs < 0.3 && flightLow < 0.2) l = "kick";
    else if (armMax > 95 && armRange > 45) l = "jacks"; else if (flightLow > 0.12 && pr > 0.1) l = "jump"; else if (kneeMax > 35 && kneeRange > 20 && pr > 0.07) l = "squat";
    labels.push(l);
  }
  // majority smoothing
  const labs = labels.map((_, i) => { const c: Record<string, number> = {}; for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) c[labels[k]] = (c[labels[k]] ?? 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] as MotionKey; });
  const trajectories: Record<number, V3[]> = {}; for (const jn of [J.head, J.l_wrist, J.r_wrist, J.l_ankle, J.r_ankle, J.pelvis]) trajectories[jn] = joints.map((j, f) => (j ? j[jn] : f > 0 ? (joints[f - 1]?.[jn] ?? [0, 0, 0]) : [0, 0, 0])) as V3[];
  let distance = 0; for (let f = 1; f < n; f++) { const a = joints[f - 1], b = joints[f]; if (a && b) distance += Math.hypot(b[J.pelvis][0] - a[J.pelvis][0], b[J.pelvis][2] - a[J.pelvis][2]); }
  const A = angles.filter(Boolean); return { angles, speed: sp, wristSpeed: [smooth(wL), smooth(wR)], direction: dir, rom, symmetry, labels: labs, trajectories, distance, meanSpeed: mean(sp), maxSpeed: Math.max(...sp), posture: { trunkLeanMean: mean(A.map((a) => a.trunkLean)), kneeBalance: mean(A.map((a) => a.kneeL - a.kneeR)) } };
}
export const motionLabel = (k: MotionKey) => MOTIONS[k].label;
