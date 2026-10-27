import type { Det, Frame, TrackSummary } from "./types";

/**
 * Offline multi-object tracker: constant-velocity prediction, greedy IoU / centre-distance association per class,
 * and removal of tracks that were seen fewer than `minHits` times (suppresses one-frame flicker).
 * Written for this project; the association idea is the common SORT / ByteTrack family approach.
 */
interface Trk { id: number; cls: string; box: [number, number, number, number]; vx: number; vy: number; lastT: number; hits: Det[]; times: number[]; frames: number[] }
const iou = (a: number[], b: number[]) => {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1), u = a[2] * a[3] + b[2] * b[3] - inter;
  return u > 0 ? inter / u : 0;
};
const centre = (b: number[]) => [b[0] + b[2] / 2, b[1] + b[3] / 2];

export function trackFrames(input: Frame[], opts: { maxAgeSec: number; minHits: number; iouMin?: number }): { frames: Frame[]; tracks: TrackSummary[] } {
  const iouMin = opts.iouMin ?? 0.1;
  const frames: Frame[] = input.map((f) => ({ ...f, dets: f.dets.map((d) => ({ ...d, tid: undefined })) }));
  const live: Trk[] = [], all: Trk[] = []; let next = 1;
  for (const f of frames) {
    const cand: { ti: number; di: number; s: number }[] = [];
    live.forEach((t, ti) => {
      const dt = Math.max(0, f.t - t.lastT), pred: [number, number, number, number] = [t.box[0] + t.vx * dt, t.box[1] + t.vy * dt, t.box[2], t.box[3]];
      f.dets.forEach((d, di) => {
        if (d.cls !== t.cls) return;
        const o = iou(pred, d.box), [pc, dc] = [centre(pred), centre(d.box)], dist = Math.hypot(pc[0] - dc[0], pc[1] - dc[1]), scale = Math.max(t.box[2], t.box[3], d.box[2], d.box[3]);
        if (o >= iouMin || dist < 0.6 * scale) cand.push({ ti, di, s: o + 0.3 * Math.max(0, 1 - dist / (0.6 * scale)) });
      });
    });
    cand.sort((a, b) => b.s - a.s);
    const usedT = new Set<number>(), usedD = new Set<number>();
    for (const c of cand) {
      if (usedT.has(c.ti) || usedD.has(c.di)) continue;
      usedT.add(c.ti); usedD.add(c.di);
      const t = live[c.ti], d = f.dets[c.di], dt = Math.max(1e-3, f.t - t.lastT);
      const [pc, dc] = [centre(t.box), centre(d.box)];
      t.vx = 0.6 * t.vx + 0.4 * ((dc[0] - pc[0]) / dt); t.vy = 0.6 * t.vy + 0.4 * ((dc[1] - pc[1]) / dt);
      t.box = d.box; t.lastT = f.t; d.tid = t.id; t.hits.push(d); t.times.push(f.t); t.frames.push(f.i);
    }
    f.dets.forEach((d, di) => { if (usedD.has(di)) return; const t: Trk = { id: next++, cls: d.cls, box: d.box, vx: 0, vy: 0, lastT: f.t, hits: [d], times: [f.t], frames: [f.i] }; d.tid = t.id; live.push(t); all.push(t); });
    for (let i = live.length - 1; i >= 0; i--) if (f.t - live[i].lastT > opts.maxAgeSec) live.splice(i, 1);
  }
  // drop tentative tracks, renumber the rest in order of appearance
  const keep = all.filter((t) => t.hits.length >= opts.minHits), map = new Map<number, number>();
  keep.sort((a, b) => a.times[0] - b.times[0]).forEach((t, i) => map.set(t.id, i + 1));
  for (const f of frames) { f.dets = f.dets.filter((d) => d.tid !== undefined && map.has(d.tid)); f.dets.forEach((d) => (d.tid = map.get(d.tid!))); }
  const tracks: TrackSummary[] = keep.map((t) => ({
    id: map.get(t.id)!, cls: t.cls, firstT: t.times[0], lastT: t.times[t.times.length - 1], hits: t.hits.length,
    avgConf: Math.round((t.hits.reduce((s, d) => s + d.conf, 0) / t.hits.length) * 100) / 100, maxConf: Math.max(...t.hits.map((d) => d.conf)),
    path: t.hits.map((d) => [Math.round((d.box[0] + d.box[2] / 2) * 1000) / 1000, Math.round((d.box[1] + d.box[3]) * 1000) / 1000] as [number, number]),
  }));
  return { frames, tracks };
}
