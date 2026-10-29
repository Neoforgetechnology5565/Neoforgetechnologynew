/** Ball tracking from per-frame candidate peaks (port of services/sports-analyzer/app/ball.py): a Viterbi search picks, over the whole clip, the candidates (or "no ball") that maximise confidence while penalising implausible jumps; short gaps are interpolated and marked estimated, long gaps stay missing. */
const MISS_P = 0.3, HIGH_CONF = 0.55;
export type Cand = [number, number, number];
export interface BallObs { x: number; y: number; conf: number | null; kind: "observed" | "estimated" }
export function link(candidates: Cand[][], times: number[], width: number, maxSpeedFrac = 0.6, minConf = 0.2): (Cand | null)[] {
  const n = candidates.length; if (!n) return []; const cand = candidates.map((cs) => cs.filter((c) => c[2] >= minConf)), NEG = -1e18, score: number[][] = [], back: number[][] = [];
  for (let i = 0; i < n; i++) {
    const k = cand[i].length + 1; let sc = new Array(k).fill(NEG), bk = new Array(k).fill(-1); const emis = [...cand[i].map((c) => Math.log(Math.max(c[2], 1e-3) / MISS_P)), 0];
    if (i === 0) { sc = emis.slice(); bk = new Array(k).fill(-1); }
    else {
      const dt = Math.max(times[i] - times[i - 1], 1e-3), vmax = maxSpeedFrac * width * dt;
      for (let s = 0; s < k; s++) {
        let best = NEG, arg = -1;
        for (let p = 0; p < score[i - 1].length; p++) {
          const prev = score[i - 1][p]; if (prev <= NEG / 2) continue; let trans: number;
          if (s < cand[i].length && p < cand[i - 1].length) { const d = Math.hypot(cand[i][s][0] - cand[i - 1][p][0], cand[i][s][1] - cand[i - 1][p][1]); if (d > vmax) continue; trans = (-1.5 * d) / vmax; }
          else trans = (s === cand[i].length) !== (p === cand[i - 1].length) ? -0.3 : 0;
          if (prev + trans > best) { best = prev + trans; arg = p; }
        }
        if (arg >= 0) { sc[s] = best + emis[s]; bk[s] = arg; }
      }
    }
    score.push(sc); back.push(bk);
  }
  let state = 0; for (let s = 1; s < score[n - 1].length; s++) if (score[n - 1][s] > score[n - 1][state]) state = s;
  const path: (Cand | null)[] = new Array(n).fill(null);
  for (let i = n - 1; i >= 0; i--) { path[i] = state < cand[i].length ? cand[i][state] : null; state = back[i][state]; if (state < 0 && i > 0) state = cand[i - 1].length; }
  const out = [...path]; for (let i = 0; i < n; i++) { if (!out[i]) continue; const nb = (i > 0 && path[i - 1]) || (i + 1 < n && path[i + 1]); if (!nb && out[i]![2] < HIGH_CONF) out[i] = null; }
  return out;
}
export function fillEstimates(chosen: (Cand | null)[], times: number[], width: number, maxGapS = 1, maxSpeedFrac = 0.6): (BallObs | null)[] {
  const n = chosen.length, res: (BallObs | null)[] = chosen.map((c) => (c ? { x: c[0], y: c[1], conf: c[2], kind: "observed" } : null)); let last: number | null = null;
  for (let i = 0; i < n; i++) {
    if (!chosen[i]) continue;
    if (last !== null && i - last > 1) { const gap = times[i] - times[last], a = chosen[last]!, b = chosen[i]!; if (gap <= maxGapS && Math.hypot(b[0] - a[0], b[1] - a[1]) <= maxSpeedFrac * width * gap) for (let j = last + 1; j < i; j++) { const f = (times[j] - times[last]) / gap; res[j] = { x: a[0] + f * (b[0] - a[0]), y: a[1] + f * (b[1] - a[1]), conf: null, kind: "estimated" }; } }
    last = i;
  }
  return res;
}
