/** Candidate-event heuristics over person tracks and pose keypoints: a TypeScript port of services/activity-monitor/app/activity.py (same rules, same thresholds, same evidence). Candidates for human review, not detections of falls or violence. */
export const LS = 11, RS = 12, LH = 23, RH = 24, LW = 15, RW = 16; const CORE = [LS, RS, LH, RH];
export interface FallParams { min_upright_s: number; window_s: number; upright_tilt_deg: number; lying_tilt_deg: number; lying_aspect: number; min_drop_torso: number; drop_height_ratio: number; min_lying_s: number; min_visibility: number }
export interface AggressionParams { max_distance: number; min_arm_speed: number; min_duration_s: number; min_fraction: number; min_visibility: number }
export const FALL_DEFAULTS: FallParams = { min_upright_s: 0.6, window_s: 1.5, upright_tilt_deg: 35, lying_tilt_deg: 60, lying_aspect: 1.2, min_drop_torso: 0.6, drop_height_ratio: 0.6, min_lying_s: 1, min_visibility: 0.5 };
export const AGGR_DEFAULTS: AggressionParams = { max_distance: 1.2, min_arm_speed: 6, min_duration_s: 1, min_fraction: 0.5, min_visibility: 0.5 };
export type KP = number[][]; // 33 × [x, y, visibility, presence]
export interface Sample { t: number; box: [number, number, number, number]; score: number; kp: KP | null }
export interface Evidence { name: string; value: number | string | boolean | null; threshold: string | null; met: boolean; note: string }
export interface Candidate { kind: "fall" | "aggression"; tracks: number[]; t_start: number; t_end: number; t_peak: number; evidence: Evidence[]; notes: string[] }
export type Track = Sample[];
const ev = (name: string, value: Evidence["value"], threshold: string | null, met: boolean, note = ""): Evidence => ({ name, value, threshold, met, note });
const mid = (kp: KP, a: number, b: number): [number, number] => [(kp[a][0] + kp[b][0]) / 2, (kp[a][1] + kp[b][1]) / 2];
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
export const poseOk = (kp: KP | null, minVis: number): kp is KP => !!kp && CORE.reduce((s, i) => s + kp[i][2], 0) / CORE.length >= minVis;
/** Torso tilt from vertical (deg, unsigned), torso length (px) and hip midpoint. */
export function torso(kp: KP): { tilt: number; len: number; hip: [number, number] } {
  const sh = mid(kp, LS, RS), hp = mid(kp, LH, RH), vx = sh[0] - hp[0], vy = sh[1] - hp[1], len = Math.hypot(vx, vy);
  return { tilt: len > 1e-6 ? (Math.atan2(Math.abs(vx), -vy) * 180) / Math.PI : 0, len, hip: hp };
}
function runs(flags: boolean[], times: number[], minLen: number, maxGap = 1): [number, number][] {
  const out: [number, number][] = []; let i = 0; const n = flags.length;
  while (i < n) {
    if (!flags[i]) { i++; continue; } let j = i, gap = 0, last = i;
    while (j + 1 < n && (flags[j + 1] || gap < maxGap)) { j++; if (flags[j]) { gap = 0; last = j; } else gap++; }
    if (times[last] - times[i] >= minLen) out.push([i, last]); i = last + 1;
  }
  return out;
}
interface Row { t: number; h: number; aspect: number; tilt: number | null; len: number | null; hip_y: number | null; state: "unknown" | "upright" | "lying" | "mid" }
function states(track: Track, p: FallParams): Row[] {
  return track.map((s) => {
    const [x1, y1, x2, y2] = s.box, w = Math.max(x2 - x1, 1e-6), h = Math.max(y2 - y1, 1e-6), row: Row = { t: s.t, h, aspect: w / h, tilt: null, len: null, hip_y: null, state: "unknown" };
    if (poseOk(s.kp, p.min_visibility)) { const { tilt, len, hip } = torso(s.kp); row.tilt = tilt; row.len = len; row.hip_y = hip[1]; row.state = tilt <= p.upright_tilt_deg ? "upright" : tilt >= p.lying_tilt_deg ? "lying" : "mid"; }
    if (row.state === "unknown") { if (row.aspect >= p.lying_aspect) row.state = "lying"; else if (row.aspect <= 0.8) row.state = "upright"; }
    return row;
  });
}
export function detectFalls(tracks: Map<number, Track>, p: FallParams, videoEnd: number): Candidate[] {
  const out: Candidate[] = [];
  for (const [tid, track] of tracks) {
    if (track.length < 4) continue; const rows = states(track, p), times = rows.map((r) => r.t); let lastAlert = -1e9;
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k]; if (r.state !== "lying" || (k > 0 && rows[k - 1].state === "lying") || r.t - lastAlert < 3) continue;
      let k0 = -1; for (let i = k - 1; i >= 0; i--) if (times[k] - times[i] <= p.window_s && rows[i].state === "upright") { k0 = i; break; } if (k0 < 0) continue;
      const before = rows.slice(0, k0 + 1).filter((x) => times[k0] - x.t <= p.min_upright_s + 1e-6), uprightFrac = before.filter((x) => x.state === "upright").length / Math.max(before.length, 1), uprightSpan = times[k0] - before[0].t;
      if (uprightSpan < p.min_upright_s * 0.6 || uprightFrac < 0.7) continue;
      const lens = before.map((x) => x.len).filter((x): x is number => !!x), refLen = lens.length ? median(lens) : null, refH = median(before.map((x) => x.h));
      const after = rows.slice(k).filter((x) => x.t - times[k] <= p.min_lying_s + 1e-6), seg = rows.slice(k0, k0 + after.length + (k - k0)), hips = seg.map((x) => x.hip_y).filter((x): x is number => x !== null);
      let drop: number | null = null; if (refLen && hips.length >= 2) drop = (Math.max(hips[hips.length - 1], ...hips) - hips[0]) / refLen;
      const last3 = seg.slice(-3), heightRatio = median(last3.map((x) => x.h)) / refH; let speed: number | null = null;
      if (refLen) { const v: number[] = []; for (let i = 0; i + 1 < seg.length; i++) { const a = seg[i], b = seg[i + 1]; if (a.hip_y !== null && b.hip_y !== null) v.push((b.hip_y - a.hip_y) / Math.max(b.t - a.t, 1e-3) / refLen); } if (v.length) speed = Math.max(...v); }
      const observed = after.length ? after[after.length - 1].t - times[k] : 0, lyingFrac = after.filter((x) => x.state === "lying").length / Math.max(after.length, 1), tailEnd = times[times.length - 1] - times[k];
      const endedLying = observed >= tailEnd - 1e-6 && rows[rows.length - 1].state === "lying" && videoEnd - times[times.length - 1] < 1;
      const lyingOk = observed >= p.min_lying_s * 0.9 && lyingFrac >= 0.7, dropOk = (drop !== null && drop >= p.min_drop_torso) || heightRatio <= p.drop_height_ratio;
      if (!(lyingOk || (endedLying && lyingFrac >= 0.7)) || !dropOk) continue;
      const recovered = rows.slice(k + after.length, k + after.length + 10).some((x) => x.state === "upright"), r2 = (v: number | null, d = 2) => (v === null ? "n/a" : String(Math.round(v * 10 ** d) / 10 ** d));
      const evidence: Evidence[] = [
        ev("Upright before the drop", `${uprightSpan.toFixed(1)} s`, `>= ${(p.min_upright_s * 0.6).toFixed(1)} s`, uprightSpan >= p.min_upright_s * 0.6),
        ev("Time from upright to lying", Math.round((times[k] - times[k0]) * 100) / 100, `<= ${p.window_s} s`, times[k] - times[k0] <= p.window_s, "seconds between the last upright sample and the first lying sample"),
        ev("Drop (hip descent or box height)", `hips ${r2(drop)} torso lengths; box height ratio ${r2(heightRatio)}`, `hips >= ${p.min_drop_torso} torso lengths or box ratio <= ${p.drop_height_ratio}`, dropOk, "either measure may satisfy the rule"),
        ev("Stayed low", `${observed.toFixed(1)} s${endedLying && !lyingOk ? " (video ended while lying)" : ""}`, `>= ${p.min_lying_s} s`, lyingOk, !lyingOk ? "lying for less than the threshold because the video ended" : ""),
        ev("Peak descent speed", speed === null ? null : Math.round(speed * 100) / 100, null, true, "torso lengths per second; informational"),
        ev("Lying posture at first lying sample", `torso tilt ${r.tilt === null ? "n/a" : Math.round(r.tilt)} deg; box width/height ${Math.round(r.aspect * 100) / 100}`, `tilt >= ${p.lying_tilt_deg} deg or width/height >= ${p.lying_aspect}`, (r.tilt !== null && r.tilt >= p.lying_tilt_deg) || r.aspect >= p.lying_aspect, "pose tilt, or box shape when pose was unreliable"),
      ];
      const notes: string[] = []; if (!recovered) notes.push("No return to an upright posture was observed in the following samples."); if (r.tilt === null) notes.push("Pose was unreliable at the drop; the box shape was used.");
      out.push({ kind: "fall", tracks: [tid], t_start: times[k0], t_end: Math.min(times[k] + Math.max(observed, 0), times[times.length - 1]), t_peak: times[k], evidence, notes }); lastAlert = times[k];
    }
  }
  return out;
}
/** Wrist speed relative to the person's own hips (torso lengths/s), keyed by the later sample time. */
export function armSpeeds(track: Track, minVis: number): Map<number, number> {
  const out = new Map<number, number>(); let prev: { t: number; rel: Map<number, [number, number]>; len: number } | null = null;
  for (const s of track) {
    if (!poseOk(s.kp, minVis)) { prev = null; continue; } const { len, hip } = torso(s.kp); if (len < 8) { prev = null; continue; }
    const rel = new Map<number, [number, number]>(); for (const w of [LW, RW]) if (s.kp[w][2] >= minVis) rel.set(w, [s.kp[w][0] - hip[0], s.kp[w][1] - hip[1]]);
    if (prev && s.t > prev.t) { let best = 0; for (const [w, r] of rel) { const q = prev.rel.get(w); if (q) best = Math.max(best, Math.hypot(r[0] - q[0], r[1] - q[1]) / (s.t - prev.t) / ((len + prev.len) / 2)); } out.set(s.t, best); }
    prev = { t: s.t, rel, len };
  }
  return out;
}
export function detectAggression(tracks: Map<number, Track>, p: AggressionParams): Candidate[] {
  const speeds = new Map([...tracks].map(([id, tr]) => [id, armSpeeds(tr, p.min_visibility)])), byTime = new Map([...tracks].map(([id, tr]) => [id, new Map(tr.map((s) => [s.t, s]))])), ids = [...tracks.keys()].sort((a, b) => a - b), out: Candidate[] = [];
  for (let ai = 0; ai < ids.length; ai++) for (const b of ids.slice(ai + 1)) {
    const a = ids[ai], ta = byTime.get(a)!, tb = byTime.get(b)!, common = [...ta.keys()].filter((t) => tb.has(t)).sort((x, y) => x - y); if (common.length < 3) continue;
    const close: boolean[] = [], fast: boolean[] = [], dist: number[] = [], spd: number[] = [];
    for (const t of common) {
      const sa = ta.get(t)!, sb = tb.get(t)!, ca = [(sa.box[0] + sa.box[2]) / 2, (sa.box[1] + sa.box[3]) / 2], cb = [(sb.box[0] + sb.box[2]) / 2, (sb.box[1] + sb.box[3]) / 2], hh = (sa.box[3] - sa.box[1] + (sb.box[3] - sb.box[1])) / 2;
      const d = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) / Math.max(hh, 1e-6), v = Math.max(speeds.get(a)!.get(t) ?? 0, speeds.get(b)!.get(t) ?? 0); dist.push(d); spd.push(v); close.push(d <= p.max_distance); fast.push(d <= p.max_distance && v >= p.min_arm_speed);
    }
    for (const [i, j] of runs(close, common, p.min_duration_s, 1)) {
      const nClose = close.slice(i, j + 1).filter(Boolean).length, frac = fast.slice(i, j + 1).filter(Boolean).length / Math.max(nClose, 1); if (frac < p.min_fraction) continue;
      let pk = i; for (let q = i; q <= j; q++) if (spd[q] > spd[pk]) pk = q; const minD = Math.min(...dist.slice(i, j + 1)), r2 = (v: number) => Math.round(v * 100) / 100;
      out.push({ kind: "aggression", tracks: [a, b], t_start: common[i], t_end: common[j], t_peak: common[pk], evidence: [
        ev("Time in close contact", r2(common[j] - common[i]), `>= ${p.min_duration_s} s`, common[j] - common[i] >= p.min_duration_s), ev("Closest distance", r2(minD), `<= ${p.max_distance} box heights`, minD <= p.max_distance, "centre-to-centre, in mean box heights"),
        ev("Samples with fast arm motion", r2(frac), `>= ${p.min_fraction}`, frac >= p.min_fraction, "share of close-contact samples in which a wrist moved faster than the speed threshold, relative to the hips"), ev("Peak wrist speed", r2(spd[pk]), `>= ${p.min_arm_speed} torso lengths/s`, spd[pk] >= p.min_arm_speed, "relative to the person's own hips")],
        notes: ["Fast arms near another person also occur in dancing, sport, play, hugging and handshakes. Nothing here measures intent or contact."] });
    }
  }
  return out;
}
export const criteria = (c: Candidate) => ({ met: c.evidence.filter((e) => e.threshold !== null && e.met).length, total: c.evidence.filter((e) => e.threshold !== null).length });
