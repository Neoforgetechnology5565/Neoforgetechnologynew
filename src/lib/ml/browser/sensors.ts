"use client";
/** Sensor anomaly detection in the browser (port of sensors.py): baseline robust z, rolling robust z and Isolation Forest, with optional scoring against labelled faults. */
import { err } from "./core";

function events(flag: boolean[], gap: number): [number, number][] {
  const out: [number, number][] = [], n = flag.length; let i = 0;
  while (i < n) { if (flag[i]) { let j = i, last = i; while (j + 1 < n && (flag[j + 1] || j + 1 - last <= gap)) { j++; if (flag[j]) last = j; } out.push([i, last]); i = last + 1; } else i++; }
  return out;
}
/** pandas-style rolling median over a trailing window, ignoring NaN, needing `minP` valid values. */
function rollMedian(a: number[], w: number, minP: number): number[] {
  const out = new Array(a.length).fill(NaN), buf: number[] = [];
  const ins = (v: number) => { let lo = 0, hi = buf.length; while (lo < hi) { const m = (lo + hi) >> 1; if (buf[m] < v) lo = m + 1; else hi = m; } buf.splice(lo, 0, v); };
  const del = (v: number) => { let lo = 0, hi = buf.length; while (lo < hi) { const m = (lo + hi) >> 1; if (buf[m] < v) lo = m + 1; else hi = m; } buf.splice(lo, 1); };
  for (let i = 0; i < a.length; i++) { if (!Number.isNaN(a[i])) ins(a[i]); if (i - w >= 0 && !Number.isNaN(a[i - w])) del(a[i - w]); if (buf.length >= minP) { const m = buf.length >> 1; out[i] = buf.length % 2 ? buf[m] : (buf[m - 1] + buf[m]) / 2; } }
  return out;
}
export function rollingZ(x: number[], w: number): number[] {
  const minP = Math.max(5, w >> 2), prev = [NaN, ...x.slice(0, -1)], med = rollMedian(prev, w, minP), dev = prev.map((v, i) => Math.abs(v - med[i])), mad = rollMedian(dev, w, minP);
  return x.map((v, i) => { const z = (0.6745 * (v - med[i])) / (mad[i] === 0 ? NaN : mad[i]); return Number.isNaN(z) ? 0 : z; });
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const cFn = (n: number) => (n > 2 ? 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n : n === 2 ? 1 : 0);
/** Isolation Forest (Liu et al.): 200 trees on 256-row subsamples; score s = 2^(-E[h]/c(psi)); the top `contamination` share of scores is flagged. */
function isolationForest(F: number[][], contamination: number, trees = 200, seed = 0): { score: number[]; flag: boolean[] } {
  const n = F.length, d = F[0].length, psi = Math.min(256, n), maxD = Math.ceil(Math.log2(psi)), rnd = rng(seed), depth = new Float64Array(n);
  type Node = { f: number; v: number; l: Node; r: Node } | { size: number };
  const build = (idx: number[], dpt: number): Node => {
    if (dpt >= maxD || idx.length <= 1) return { size: idx.length };
    const cand: number[] = []; for (let k = 0; k < d; k++) { let lo = Infinity, hi = -Infinity; for (const i of idx) { if (F[i][k] < lo) lo = F[i][k]; if (F[i][k] > hi) hi = F[i][k]; } if (hi > lo) cand.push(k); }
    if (!cand.length) return { size: idx.length }; const f = cand[Math.floor(rnd() * cand.length)]; let lo = Infinity, hi = -Infinity; for (const i of idx) { lo = Math.min(lo, F[i][f]); hi = Math.max(hi, F[i][f]); }
    const v = lo + rnd() * (hi - lo), L = idx.filter((i) => F[i][f] < v), R = idx.filter((i) => F[i][f] >= v); return { f, v, l: build(L, dpt + 1), r: build(R, dpt + 1) };
  };
  for (let t = 0; t < trees; t++) {
    const all = Array.from({ length: n }, (_, i) => i); for (let i = 0; i < psi; i++) { const j = i + Math.floor(rnd() * (n - i)); [all[i], all[j]] = [all[j], all[i]]; }
    const root = build(all.slice(0, psi), 0);
    for (let i = 0; i < n; i++) { let node = root, h = 0; while ("f" in node) { node = F[i][node.f] < node.v ? node.l : node.r; h++; } depth[i] += h + cFn(node.size); }
  }
  const c = cFn(psi), score = Array.from(depth, (dv) => 2 ** (-(dv / trees) / c)), sorted = [...score].sort((a, b) => a - b), thr = sorted[Math.min(n - 1, Math.max(0, Math.ceil(n * (1 - contamination)) - 1))];
  return { score, flag: score.map((s) => s > thr) };
}
const rollStats = (x: number[], w: number) => { const mean: number[] = [], sd: number[] = []; for (let i = 0; i < x.length; i++) { const a = x.slice(Math.max(0, i - w + 1), i + 1), m = a.reduce((s, v) => s + v, 0) / a.length; mean.push(m); sd.push(a.length < 2 ? 0 : Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1))); } return { mean, sd }; };

export function runSensors(timeLabels: string[] | null, X0: Record<string, number[]>, sensors: string[], method: string, window: number, zThr: number, contamination: number, labels: number[] | null, baselineFraction: number, labelCol: string | null) {
  const n = X0[sensors[0]].length; if (n < Math.max(30, window + 5)) err(422, `At least ${Math.max(30, window + 5)} rows are needed for a window of ${window}.`);
  const notes: string[] = [], X: Record<string, number[]> = {}; let nmiss = 0;
  for (const c of sensors) { const a = [...X0[c]]; for (let i = 0; i < n; i++) if (Number.isNaN(a[i])) { nmiss++; let p = i - 1, q = i + 1; while (p >= 0 && Number.isNaN(a[p])) p--; while (q < n && Number.isNaN(a[q])) q++; a[i] = p < 0 ? a[q] : q >= n ? a[p] : a[p] + ((a[q] - a[p]) * (i - p)) / (q - p); } X[c] = a; }
  if (nmiss) notes.push(`${nmiss} missing value(s) were filled by linear interpolation before detection.`);
  const flags: Record<string, boolean[]> = {}, detail: Record<string, { z_flagged: number; max_abs_z: number }> = {}; let iso: number[] | null = null;
  if (method === "baseline" || method === "all") { const nb = Math.max(20, Math.floor(n * baselineFraction)), f = new Array(n).fill(false); for (const c of sensors) { const ref = X[c].slice(0, nb), med = median(ref), mad = median(ref.map((v) => Math.abs(v - med))) || 1e-9; X[c].forEach((v, i) => { if (Math.abs((0.6745 * (v - med)) / mad) >= zThr) f[i] = true; }); } flags.baseline = f; }
  if (method === "zscore" || method === "all") { const f = new Array(n).fill(false); for (const c of sensors) { const z = rollingZ(X[c], window); let cnt = 0, mx = 0; z.forEach((v, i) => { if (Math.abs(v) >= zThr) { f[i] = true; cnt++; } mx = Math.max(mx, Math.abs(v)); }); detail[c] = { z_flagged: cnt, max_abs_z: mx }; } flags.zscore = f; }
  if (method === "iforest" || method === "all") {
    const cols: number[][] = sensors.map((c) => X[c]); for (const c of sensors) { const { mean, sd } = rollStats(X[c], window); cols.push(mean, sd); }
    const F = Array.from({ length: n }, (_, i) => cols.map((col) => col[i])), d = cols.length;
    for (let k = 0; k < d; k++) { const m = F.reduce((s, r) => s + r[k], 0) / n, sd = Math.sqrt(F.reduce((s, r) => s + (r[k] - m) ** 2, 0) / n) || 1; for (const r of F) r[k] = (r[k] - m) / sd; }
    const r = isolationForest(F, contamination); flags.iforest = r.flag; iso = r.score;
  }
  const gap = Math.max(1, window >> 3), outM: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(flags)) outM[k] = { flagged_points: f.filter(Boolean).length, events: events(f, Math.max(1, Math.floor(window / 10))).map(([a, b]) => ({ start: a, end: b, points: f.slice(a, b + 1).filter(Boolean).length })) };
  void gap;
  const res: Record<string, unknown> = { rows: n, sensors, methods: outM, sensor_detail: detail, notes, series: Object.fromEntries(sensors.map((c) => [c, X[c]])), time: timeLabels ?? Array.from({ length: n }, (_, i) => i), flags: Object.fromEntries(Object.entries(flags).map(([k, f]) => [k, f.flatMap((v, i) => (v ? [i] : []))])), params: { method, window, z_threshold: zThr, contamination, baseline_fraction: baselineFraction } };
  if (iso) res.iforest_score = iso.map((v) => Math.round(v * 10000) / 10000);
  if (labels && labelCol) {
    const lab = labels.map((v) => v > 0), evTrue = events(lab, 2), ev: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(flags)) { let tp = 0, fp = 0, fn = 0; f.forEach((v, i) => { if (v && lab[i]) tp++; else if (v && !lab[i]) fp++; else if (!v && lab[i]) fn++; }); const hit = evTrue.filter(([a, b]) => f.slice(a, b + 1).some(Boolean)).length, pr = tp / Math.max(tp + fp, 1), rc = tp / Math.max(tp + fn, 1);
      ev[k] = { point_precision: pr, point_recall: rc, point_f1: (2 * pr * rc) / Math.max(pr + rc, 1e-9), labelled_events: evTrue.length, labelled_events_detected: hit, flagged_points_outside_labelled_faults: fp }; }
    res.evaluation = { label_column: labelCol, labelled_points: lab.filter(Boolean).length, scores: ev, note: "Scored against the labels in your file. For the bundled dataset the labels are the faults injected when the data was generated." };
  }
  res.limitations = ["A statistical anomaly is an unusual reading, not a confirmed fault; normal operating changes (load, season, maintenance) also cause them.", "Rolling z-score judges each sensor against its own recent past (so it adapts to, and then misses, sustained faults and flat lines); the baseline method judges it against the first part of the data, assumed healthy;  Isolation Forest scores combinations of sensors and recent behaviour. None of them knows the machine.", "Thresholds are your choice and trade missed anomalies against false alarms; no remaining-useful-life or failure prediction is made."];
  return res;
}
