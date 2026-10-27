/** Run with: npx tsx src/lib/cctv/cctv.test.ts */
import assert from "node:assert/strict";
import { analyze } from "./analyze";
import { pointInPolygon, segmentsIntersect } from "./analytics";
import { trackFrames } from "./tracker";
import { DEFAULT_SETTINGS, type Frame, type Settings } from "./types";

// geometry
const sq = [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }];
assert.equal(pointInPolygon({ x: 0.5, y: 0.5 }, sq), true); assert.equal(pointInPolygon({ x: 0.7, y: 0.5 }, sq), false);
assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }), true); assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 0.2, y: 0.2 }, { x: 0, y: 1 }, { x: 1, y: 0 }), false);

// two people walk in opposite directions across the frame at 4 fps, a car drives through; one one-frame false positive
const frames: Frame[] = [];
for (let i = 0; i < 24; i++) {
  const t = i / 4, dets = [
    { cls: "person", conf: 0.9, box: [0.05 + i * 0.035, 0.5, 0.04, 0.12] as [number, number, number, number] },
    { cls: "person", conf: 0.8, box: [0.9 - i * 0.035, 0.7, 0.04, 0.12] as [number, number, number, number] },
    { cls: "car", conf: 0.85, box: [0.02 + i * 0.04, 0.2, 0.12, 0.08] as [number, number, number, number] },
  ];
  if (i === 7) dets.push({ cls: "person", conf: 0.5, box: [0.5, 0.05, 0.04, 0.1] });
  frames.push({ i, t, dets });
}
const s: Settings = { ...DEFAULT_SETTINGS, zones: [{ id: "z1", name: "Door", points: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.9 }, { x: 0.4, y: 0.9 }], classes: ["person"], dwellSeconds: 0 }], lines: [{ id: "l1", name: "Gate", a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 }, classes: [] }] };
const r = trackFrames(frames, { maxAgeSec: 1, minHits: 2 });
assert.equal(r.tracks.length, 3, "two people and one car; the single-frame false positive is dropped");
assert.deepEqual(r.tracks.map((t) => t.cls).sort(), ["car", "person", "person"]);
const a = analyze(frames, s, { durationSec: 6 });
assert.equal(a.stats.uniqueByClass.person, 2); assert.equal(a.stats.uniqueByClass.car, 1);
assert.ok(a.stats.detectionsByClass.person >= 47, "frame-level detections are counted separately from unique tracks");
const cross = a.events.filter((e) => e.type === "line_cross"); assert.equal(cross.length, 3, "each of the three tracks crosses the gate once");
assert.deepEqual(new Set(cross.filter((e) => e.cls === "person").map((e) => e.direction)).size, 2, "opposite directions are distinguished");
assert.equal(a.events.filter((e) => e.type === "zone_enter").length, 2); assert.equal(a.events.filter((e) => e.type === "zone_exit").length, 2);
assert.equal(a.events.filter((e) => e.type === "object_first_seen").length, 3);
// settings change the outcome
const hi = analyze(frames, { ...s, minConf: 0.82 }, { durationSec: 6 }); assert.equal(hi.stats.uniqueByClass.person, 1);
const onlyCar = analyze(frames, { ...s, classes: ["car"] }, { durationSec: 6 }); assert.equal(onlyCar.stats.uniqueTotal, 1);
// dwell
const still: Frame[] = Array.from({ length: 20 }, (_, i) => ({ i, t: i / 4, dets: [{ cls: "person", conf: 0.9, box: [0.45, 0.5, 0.04, 0.1] as [number, number, number, number] }] }));
const d = analyze(still, { ...s, lines: [], zones: [{ ...s.zones[0], dwellSeconds: 2 }] }, { durationSec: 5 }); assert.equal(d.events.filter((e) => e.type === "zone_dwell").length, 1);
console.log("cctv: all tests passed");
