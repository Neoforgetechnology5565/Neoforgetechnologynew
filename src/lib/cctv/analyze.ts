import { generateEvents } from "./analytics";
import { trackFrames } from "./tracker";
import { isVehicle, type Analysis, type Frame, type Settings, type Stats } from "./types";

/** Full server-side analysis: filter by class and confidence, track, generate events and compute statistics. Pure and deterministic. */
export function analyze(raw: Frame[], s: Settings, meta: { durationSec: number }): Analysis {
  const filtered: Frame[] = raw.map((f) => ({ ...f, dets: f.dets.filter((d) => d.conf >= s.minConf && s.classes.includes(d.cls)) }));
  const { frames, tracks } = trackFrames(filtered, { maxAgeSec: s.trackMaxAgeSec, minHits: s.minTrackHits });
  const events = generateEvents(frames, tracks, s);
  const detectionsByClass: Record<string, number> = {}, uniqueByClass: Record<string, number> = {}, eventsByType: Record<string, number> = {};
  let detectionsTotal = 0;
  for (const f of frames) for (const d of f.dets) { detectionsByClass[d.cls] = (detectionsByClass[d.cls] ?? 0) + 1; detectionsTotal++; }
  for (const t of tracks) uniqueByClass[t.cls] = (uniqueByClass[t.cls] ?? 0) + 1;
  for (const e of events) eventsByType[e.type] = (eventsByType[e.type] ?? 0) + 1;
  const buckets = Math.max(1, Math.ceil(meta.durationSec)), series = Array.from({ length: buckets }, (_, k) => ({ t: k, person: 0, vehicle: 0, other: 0 }));
  for (const f of frames) {
    const b = series[Math.min(buckets - 1, Math.floor(f.t))]; let p = 0, v = 0, o = 0;
    for (const d of f.dets) d.cls === "person" ? p++ : isVehicle(d.cls) ? v++ : o++;
    b.person = Math.max(b.person, p); b.vehicle = Math.max(b.vehicle, v); b.other = Math.max(b.other, o);
  }
  const stats: Stats = { framesProcessed: raw.length, durationSec: meta.durationSec, detectionsTotal, detectionsByClass, uniqueByClass, uniqueTotal: tracks.length, eventsTotal: events.length, eventsByType, series };
  return { frames, tracks, events, stats };
}
