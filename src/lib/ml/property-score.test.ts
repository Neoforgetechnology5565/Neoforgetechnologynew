import assert from "node:assert/strict";
import { BASELINE, scoreProperty, type Cls, type DetLite, type Meas } from "./property-score";

// the same controlled cases as services/ml-lab/tests/test_property.py: both engines must give the same numbers
const cls = (label = "residential_house", probability = 0.9, margin = 0.8): Cls => ({ label, probability, margin });
const det = (label: string, score = 0.9): DetLite => ({ label, score });
const M: Meas = { green_percent: 20, sharpness: 300, brightness: 120 };
async function main() {
  let s = scoreProperty(cls(), [], M); assert.equal(s.value, BASELINE); assert.match(s.explanation[0], /very little/); assert.equal(s.evidence_strength, "Medium");
  assert.equal(scoreProperty(cls(), [det("car"), det("car")], M).value, 66); assert.equal(scoreProperty(cls(), Array(9).fill(det("car")), M).value, 69);
  assert.equal(scoreProperty(cls(), [det("car")], M).factors.find((f) => f.key === "vehicles")!.kind, "assumption");
  s = scoreProperty(cls("vacant_land"), [det("car")], { ...M, green_percent: 90 }); assert.equal(s.value, BASELINE); assert.ok(s.factors.every((f) => f.points === 0));
  assert.equal(scoreProperty(cls(), [det("couch", 0.4)], M).value, BASELINE);
  s = scoreProperty(cls(), [det("couch", 0.8), det("tv", 0.7)], M); assert.equal(s.value, 52); assert.match(s.factors.find((f) => f.key === "household")!.meaning, /cannot tell/);
  assert.equal(scoreProperty(cls(), [], M).factors.find((f) => f.key === "green")!.kind, "observed");
  s = scoreProperty(cls(), [], { ...M, green_percent: 80 }); assert.equal(s.value, 54); assert.equal(s.factors.find((f) => f.key === "green")!.kind, "assumption");
  s = scoreProperty(cls("residential_house", 0.3, 0.05), [], { ...M, sharpness: 10, brightness: 20 }); assert.equal(s.evidence_strength, "Low"); assert.ok(s.evidence_notes.length >= 3);
  const big = scoreProperty(cls(), Array(20).fill(det("couch", 0.9)), M); assert.ok(big.value >= 0 && big.value <= 100);
  assert.equal(scoreProperty(cls(), [det("person"), det("person"), det("person"), det("potted plant")], M).value, 66);
  console.log("property scoring (TypeScript) tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
