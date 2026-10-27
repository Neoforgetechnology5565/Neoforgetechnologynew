import type { EventRec, Frame, Line, Pt, Settings, TrackSummary, Zone } from "./types";

/**
 * Zone enter / exit / dwell and virtual-line crossing events from tracked detections.
 * The rule structure (per-track zone state, dwell timer, side-of-line state) is adapted from the AnalyticsEngine of
 * VisionGuard by snakyv (MIT licence, https://github.com/snakyv/visionguard). Changes: video time instead of the wall clock,
 * ground anchor point (bottom centre of the box), crossing tested against the finite line segment with a direction, a
 * "first seen" event per track, and TypeScript.
 */
export const pointInPolygon = (p: Pt, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
};
export const sideOfLine = (p: Pt, a: Pt, b: Pt) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
const ccw = (a: Pt, b: Pt, c: Pt) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
// Half-open on the track segment's start so a point landing exactly on the line counts once, not zero or twice.
export const segmentsIntersect = (p1: Pt, p2: Pt, q1: Pt, q2: Pt) => {
  const s1 = ccw(p1, q1, q2), s2 = ccw(p2, q1, q2);
  const crosses = (s1 < 0 && s2 >= 0) || (s1 > 0 && s2 <= 0);
  return crosses && ccw(p1, p2, q1) * ccw(p1, p2, q2) <= 0;
};
const anchor = (b: number[]): Pt => ({ x: b[0] + b[2] / 2, y: b[1] + b[3] });
const fmt = (c: string, id: number) => `${c} #${id}`;

type Ev = Omit<EventRec, "id" | "jobId" | "review">;
export function generateEvents(frames: Frame[], tracks: TrackSummary[], s: Pick<Settings, "zones" | "lines">): Ev[] {
  const out: Ev[] = [];
  const seen = new Set<number>(), inZone = new Map<string, number>(), dwellDone = new Set<string>(), prev = new Map<number, Pt>(), lastSeenT = new Map<number, number>();
  const applies = (list: string[], cls: string) => !list.length || list.includes(cls);
  const lastDet = new Map<number, { f: Frame; d: Frame["dets"][number] }>();
  for (const f of frames) {
    for (const d of f.dets) {
      const id = d.tid!, p = anchor(d.box); lastSeenT.set(id, f.t); lastDet.set(id, { f, d });
      const base = { t: f.t, frame: f.i, cls: d.cls, conf: d.conf, trackId: id, box: d.box };
      if (!seen.has(id)) { seen.add(id); out.push({ ...base, type: "object_first_seen", severity: "info", message: `${fmt(d.cls, id)} appeared` }); }
      for (const z of s.zones) {
        if (!applies(z.classes, d.cls)) continue;
        const key = `${id}|${z.id}`, inside = pointInPolygon(p, z.points), was = inZone.has(key);
        if (inside && !was) { inZone.set(key, f.t); out.push({ ...base, type: "zone_enter", zone: z.name, severity: "notice", message: `${fmt(d.cls, id)} entered ${z.name}` }); }
        else if (!inside && was) { const since = inZone.get(key)!; inZone.delete(key); dwellDone.delete(key); out.push({ ...base, type: "zone_exit", zone: z.name, dwellSeconds: round(f.t - since), severity: "info", message: `${fmt(d.cls, id)} left ${z.name} after ${round(f.t - since)} s` }); }
        if (inside && z.dwellSeconds > 0 && !dwellDone.has(key) && f.t - (inZone.get(key) ?? f.t) >= z.dwellSeconds) { dwellDone.add(key); out.push({ ...base, type: "zone_dwell", zone: z.name, dwellSeconds: round(f.t - inZone.get(key)!), severity: "review", message: `${fmt(d.cls, id)} stayed in ${z.name} for more than ${z.dwellSeconds} s (review)` }); }
      }
      const before = prev.get(id);
      if (before) for (const l of s.lines) {
        if (!applies(l.classes, d.cls)) continue;
        if (segmentsIntersect(before, p, l.a, l.b)) { const dir = sideOfLine(before, l.a, l.b) < 0 ? "a_to_b" : "b_to_a"; out.push({ ...base, type: "line_cross", line: l.name, direction: dir, severity: "notice", message: `${fmt(d.cls, id)} crossed ${l.name} (${dir === "a_to_b" ? "A → B side" : "B → A side"})` }); }
      }
      prev.set(id, p);
    }
  }
  // tracks that ended inside a zone leave an exit event at their last position, so dwell times are complete
  for (const [key, since] of inZone) {
    const [tid, zid] = key.split("|"), z = s.zones.find((x) => x.id === zid), last = lastDet.get(+tid);
    if (!z || !last) continue;
    out.push({ t: last.f.t, frame: last.f.i, cls: last.d.cls, conf: last.d.conf, trackId: +tid, box: last.d.box, type: "zone_exit", zone: z.name, dwellSeconds: round(last.f.t - since), severity: "info", message: `${fmt(last.d.cls, +tid)} left the view while inside ${z.name} (${round(last.f.t - since)} s)` });
  }
  return out.sort((a, b) => a.t - b.t || a.frame - b.frame);
}
const round = (n: number) => Math.round(n * 100) / 100;
export type { Zone, Line };
