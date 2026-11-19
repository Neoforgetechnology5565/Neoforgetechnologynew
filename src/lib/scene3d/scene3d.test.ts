import assert from "node:assert/strict";
import { CLASSES, SCENE_IDS, generateScene } from "./scenes";
import { segmentScene } from "./segment";
import { boxOf, evaluate, relations } from "./stats";

let fails = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, e instanceof Error ? e.message : e); } };

t("generator is deterministic and labels every point", () => {
  const a = generateScene("office", 3), b = generateScene("office", 3);
  assert.equal(a.pos.length, b.pos.length); assert.deepEqual(Array.from(a.pos.slice(0, 60)), Array.from(b.pos.slice(0, 60)));
  assert.equal(a.cls.length * 3, a.pos.length); assert.equal(a.inst.length, a.cls.length);
  for (const c of a.cls) assert.ok(c < CLASSES.length);
  const ids = new Set(a.instances.map((i) => i.id)); for (const v of a.inst) assert.ok(v === 0 || ids.has(v));
});
t("every scene has the classes the brief asks for", () => {
  const seen = new Set<string>(); for (const id of SCENE_IDS) { const s = generateScene(id); for (const i of s.instances) seen.add(i.cls); assert.ok(s.pos.length / 3 > 20000, id + " has enough points"); }
  for (const c of ["wall", "floor", "ceiling", "door", "window", "table", "chair", "cabinet", "vehicle", "tree", "other"]) assert.ok(seen.has(c as never), "missing " + c);
});
t("computed segmentation beats a floor", () => {
  const floors: Record<string, number> = { office: 0.8, living: 0.75, industrial: 0.65, warehouse: 0.6, outdoor: 0.8 };
  for (const id of SCENE_IDS) { const s = generateScene(id), g = segmentScene(s.pos, s.rgb), e = evaluate(s, g); console.log("   ", id, (e.accuracy * 100).toFixed(1) + "% mIoU", (e.meanIoU * 100).toFixed(1) + "%", "instances", e.instances.matched + "/" + e.instances.truth); assert.ok(e.accuracy >= floors[id], id + " accuracy " + e.accuracy); }
});
t("evaluation is exact for a perfect labelling", () => {
  const s = generateScene("living"), g = segmentScene(s.pos, s.rgb); g.cls = s.cls.slice(); g.inst = s.inst.slice(); const e = evaluate(s, g); assert.equal(e.accuracy, 1); assert.ok(Math.abs(e.meanIoU - 1) < 1e-9);
});
t("boxes and relations", () => {
  const p = new Float32Array([0, 0, 0, 1, 1, 1, 0.5, 2, 0.2]); const b = boxOf(p, [0, 1, 2]); assert.deepEqual(b.size, [1, 2, 1]); assert.deepEqual(b.center, [0.5, 1, 0.5]);
  const A = boxOf(new Float32Array([0, 0, 0, 1, 1, 1]), [0, 1]), B = boxOf(new Float32Array([0, 1, 0, 1, 2, 1]), [0, 1]); const r = relations(new Map([[1, A], [2, B]]), new Set()); assert.equal(r[0].kind, "on top of"); assert.equal(r[0].a, 2);
});
if (fails) { console.log(fails + " test(s) failed"); process.exit(1); } console.log("all scene3d tests passed");
