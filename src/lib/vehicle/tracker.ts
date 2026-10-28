/** ByteTrack (Zhang et al., ECCV 2022) in TypeScript. Mirrors services/vehicle-tracker/app/tracker.py so the browser engine behaves like the server engine.
 * Two-stage IoU association with a constant-velocity Kalman filter; no appearance model and no camera-motion compensation. */
import type { VClass } from "./types";

type Vec = number[]; type Mat = number[][];
const eye = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const mul = (a: Mat, b: Mat): Mat => a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
const T = (a: Mat): Mat => a[0].map((_, j) => a.map((r) => r[j]));
const add = (a: Mat, b: Mat): Mat => a.map((r, i) => r.map((v, j) => v + b[i][j]));
const sub = (a: Mat, b: Mat): Mat => a.map((r, i) => r.map((v, j) => v - b[i][j]));
const mv = (a: Mat, v: Vec): Vec => a.map((r) => r.reduce((s, x, k) => s + x * v[k], 0));
const diag = (v: Vec): Mat => v.map((x, i) => v.map((_, j) => (i === j ? x : 0)));
function inv(m: Mat): Mat { // Gauss-Jordan with partial pivoting (matrices here are 4x4 and positive definite)
  const n = m.length; const a = m.map((r, i) => [...r, ...eye(n)[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]]; const d = a[c][c]; for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((r) => r.slice(n));
}

const MOTION: Mat = (() => { const m = eye(8); for (let i = 0; i < 4; i++) m[i][4 + i] = 1; return m; })();
const UPDATE: Mat = Array.from({ length: 4 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 1 : 0)));
const WP = 1 / 20, WV = 1 / 160;
const kf = {
  initiate(m: Vec): [Vec, Mat] { const s = [2 * WP * m[3], 2 * WP * m[3], 1e-2, 2 * WP * m[3], 10 * WV * m[3], 10 * WV * m[3], 1e-5, 10 * WV * m[3]]; return [[...m, 0, 0, 0, 0], diag(s.map((x) => x * x))]; },
  predict(mean: Vec, cov: Mat): [Vec, Mat] {
    const sp = [WP * mean[3], WP * mean[3], 1e-2, WP * mean[3]], sv = [WV * mean[3], WV * mean[3], 1e-5, WV * mean[3]];
    const q = diag([...sp, ...sv].map((x) => x * x));
    return [mv(MOTION, mean), add(mul(mul(MOTION, cov), T(MOTION)), q)];
  },
  project(mean: Vec, cov: Mat): [Vec, Mat] { const std = [WP * mean[3], WP * mean[3], 1e-1, WP * mean[3]]; return [mv(UPDATE, mean), add(mul(mul(UPDATE, cov), T(UPDATE)), diag(std.map((x) => x * x)))]; },
  update(mean: Vec, cov: Mat, m: Vec): [Vec, Mat] {
    const [pm, pc] = this.project(mean, cov); const gain = mul(mul(cov, T(UPDATE)), inv(pc)); // K = P Hᵀ S⁻¹
    const innov = m.map((v, i) => v - pm[i]); const dm = mv(gain, innov);
    return [mean.map((v, i) => v + dm[i]), sub(cov, mul(mul(gain, pc), T(gain)))];
  },
};

const NEW = 0, TRACKED = 1, LOST = 2, REMOVED = 3;
let nextId = 0;
export class STrack {
  tlwh0: Vec; mean: Vec | null = null; cov: Mat | null = null; isActivated = false; score: number; state = NEW; trackId = 0; startFrame = 0; frameId = 0; hits = 1; detIndex: number; votes = new Map<VClass, number>();
  constructor(tlwh: Vec, score: number, cls: VClass, detIndex: number) { this.tlwh0 = tlwh; this.score = score; this.detIndex = detIndex; this.votes.set(cls, score); }
  get tlwh(): Vec { if (!this.mean) return [...this.tlwh0]; const r = this.mean.slice(0, 4); r[2] *= r[3]; r[0] -= r[2] / 2; r[1] -= r[3] / 2; return r; }
  get tlbr(): Vec { const r = this.tlwh; return [r[0], r[1], r[0] + r[2], r[1] + r[3]]; }
  static xyah(tlwh: Vec): Vec { return [tlwh[0] + tlwh[2] / 2, tlwh[1] + tlwh[3] / 2, tlwh[2] / Math.max(tlwh[3], 1e-6), tlwh[3]]; }
  get cls(): VClass { let best: VClass = "car", bv = -1; for (const [k, v] of this.votes) if (v > bv) { bv = v; best = k; } return best; }
  vote(c: VClass, s: number) { this.votes.set(c, (this.votes.get(c) ?? 0) + s); }
  activate(fid: number) { this.trackId = ++nextId; [this.mean, this.cov] = kf.initiate(STrack.xyah(this.tlwh0)); this.state = TRACKED; this.isActivated = fid === 1; this.frameId = this.startFrame = fid; }
  reActivate(n: STrack, fid: number) { [this.mean, this.cov] = kf.update(this.mean!, this.cov!, STrack.xyah(n.tlwh)); this.state = TRACKED; this.isActivated = true; this.frameId = fid; this.score = n.score; this.detIndex = n.detIndex; this.hits++; }
  update(n: STrack, fid: number) { this.frameId = fid; [this.mean, this.cov] = kf.update(this.mean!, this.cov!, STrack.xyah(n.tlwh)); this.state = TRACKED; this.isActivated = true; this.score = n.score; this.detIndex = n.detIndex; this.hits++; }
  predict() { const m = [...this.mean!]; if (this.state !== TRACKED) m[7] = 0; [this.mean, this.cov] = kf.predict(m, this.cov!); }
}

function iou(a: Vec[], b: Vec[]): number[][] {
  return a.map((p) => b.map((q) => {
    const w = Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])), h = Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1])), i = w * h;
    return i / ((p[2] - p[0]) * (p[3] - p[1]) + (q[2] - q[0]) * (q[3] - q[1]) - i + 1e-9);
  }));
}
const iouDist = (t: STrack[], d: STrack[]) => iou(t.map((x) => x.tlbr), d.map((x) => x.tlbr)).map((r) => r.map((v) => 1 - v));
const fuse = (cost: number[][], d: STrack[]) => cost.map((r) => r.map((c, j) => 1 - (1 - c) * d[j].score));

/** Optimal rectangular assignment (Hungarian / Jonker-Volgenant style, O(n³)); same objective as scipy.optimize.linear_sum_assignment. */
export function hungarian(cost: number[][]): [number, number][] {
  const n = cost.length, m = n ? cost[0].length : 0; if (!n || !m) return [];
  const tr = n > m; const a = tr ? T(cost) : cost; const R = a.length, C = a[0].length; // R <= C
  const u = new Array(R + 1).fill(0), v = new Array(C + 1).fill(0), p = new Array(C + 1).fill(0), way = new Array(C + 1).fill(0);
  for (let i = 1; i <= R; i++) {
    p[0] = i; let j0 = 0; const minv = new Array(C + 1).fill(Infinity), used = new Array(C + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= C; j++) if (!used[j]) { const cur = a[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= C; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out: [number, number][] = []; for (let j = 1; j <= C; j++) if (p[j]) out.push(tr ? [j - 1, p[j] - 1] : [p[j] - 1, j - 1]); return out;
}
function assign(cost: number[][], thresh: number, nr: number, nc: number): [[number, number][], number[], number[]] {
  if (!nr || !nc) return [[], [...Array(nr).keys()], [...Array(nc).keys()]];
  const m = hungarian(cost).filter(([r, c]) => cost[r][c] <= thresh); const mr = new Set(m.map((x) => x[0])), mc = new Set(m.map((x) => x[1]));
  return [m, [...Array(nr).keys()].filter((i) => !mr.has(i)), [...Array(nc).keys()].filter((j) => !mc.has(j))];
}
const join = (a: STrack[], b: STrack[]) => { const s = new Set(a.map((t) => t.trackId)); return [...a, ...b.filter((t) => !s.has(t.trackId))]; };
const minus = (a: STrack[], b: STrack[]) => { const s = new Set(b.map((t) => t.trackId)); return a.filter((t) => !s.has(t.trackId)); };

export class ByteTracker {
  frameId = 0; tracked: STrack[] = []; lost: STrack[] = []; newThresh: number;
  constructor(private high = 0.5, private low = 0.1, private matchThresh = 0.8, private bufferFrames = 30, margin = 0.1) { this.newThresh = high + margin; nextId = 0; }
  update(boxes: number[][], scores: number[], classes: VClass[]): STrack[] {
    const fid = ++this.frameId; const n = scores.length;
    const tlwh = boxes.map((b) => [b[0], b[1], b[2] - b[0], b[3] - b[1]]);
    const mk = (idx: number[]) => idx.map((i) => new STrack(tlwh[i], scores[i], classes[i], i));
    const dets = mk([...Array(n).keys()].filter((i) => scores[i] >= this.high)), low = mk([...Array(n).keys()].filter((i) => scores[i] > this.low && scores[i] < this.high));
    const unconfirmed = this.tracked.filter((t) => !t.isActivated), tracked = this.tracked.filter((t) => t.isActivated);
    const pool = [...tracked, ...this.lost.filter((t) => !tracked.includes(t))]; pool.forEach((t) => t.predict());
    const activated: STrack[] = [], refound: STrack[] = [], lostNow: STrack[] = [], removed: STrack[] = [];
    const [m, uTrack, uDet] = assign(fuse(iouDist(pool, dets), dets), this.matchThresh, pool.length, dets.length);
    for (const [ti, di] of m) { const t = pool[ti], d = dets[di]; t.vote(classes[d.detIndex], d.score); if (t.state === TRACKED) { t.update(d, fid); activated.push(t); } else { t.reActivate(d, fid); refound.push(t); } }
    const rem = uTrack.map((i) => pool[i]).filter((t) => t.state === TRACKED);
    const [m2, uTrack2] = assign(iouDist(rem, low), 0.5, rem.length, low.length);
    for (const [ti, di] of m2) { const t = rem[ti], d = low[di]; t.vote(classes[d.detIndex], d.score); if (t.state === TRACKED) { t.update(d, fid); activated.push(t); } else { t.reActivate(d, fid); refound.push(t); } }
    for (const i of uTrack2) { const t = rem[i]; if (t.state !== LOST) { t.state = LOST; lostNow.push(t); } }
    const left = uDet.map((i) => dets[i]);
    const [m3, uUnconf, uDet3] = assign(fuse(iouDist(unconfirmed, left), left), 0.7, unconfirmed.length, left.length);
    for (const [ti, di] of m3) { const t = unconfirmed[ti], d = left[di]; t.vote(classes[d.detIndex], d.score); t.update(d, fid); activated.push(t); }
    for (const i of uUnconf) { unconfirmed[i].state = REMOVED; removed.push(unconfirmed[i]); }
    for (const i of uDet3) { const d = left[i]; if (d.score < this.newThresh) continue; d.activate(fid); activated.push(d); }
    for (const t of this.lost) if (fid - t.frameId > this.bufferFrames) { t.state = REMOVED; removed.push(t); }
    this.tracked = join(join(this.tracked.filter((t) => t.state === TRACKED), activated), refound);
    this.lost = minus(minus(join(this.lost, lostNow), this.tracked).filter((t) => t.state !== REMOVED), removed);
    return this.tracked.filter((t) => t.isActivated && t.frameId === fid);
  }
}
