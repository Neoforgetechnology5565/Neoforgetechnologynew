import type { EventRec } from "./types";
const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export const eventsCsv = (events: EventRec[], source: string) =>
  [["event_id", "job_id", "source", "type", "severity", "time_s", "frame", "class", "confidence", "track_id", "zone", "line", "direction", "dwell_s", "box_x", "box_y", "box_w", "box_h", "review", "message"],
    ...events.map((e) => [e.id, e.jobId, source, e.type, e.severity, e.t.toFixed(2), e.frame, e.cls, e.conf.toFixed(2), e.trackId, e.zone, e.line, e.direction, e.dwellSeconds, ...e.box.map((n) => n.toFixed(4)), e.review, e.message])]
    .map((r) => r.map(cell).join(",")).join("\n");
