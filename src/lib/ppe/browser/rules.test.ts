import assert from "node:assert/strict";
import { Assessor, HAT, VEST, associate, type Box4, type PPEBox } from "./rules";
const check = (n: string, f: () => void) => { f(); console.log("ok", n); };
const P: Box4[] = [[100, 100, 200, 300]], box = (kind: PPEBox["kind"], x1: number, y1: number, x2: number, y2: number, score = 0.9, worker = 0): PPEBox => ({ kind, score, x1, y1, x2, y2, worker });
check("hat must be at the head and vest on the torso", () => {
  assert.equal(associate(P, [box(HAT, 125, 98, 175, 140), box(VEST, 110, 150, 190, 230)], 0.3).length, 2); assert.equal(associate(P, [box(HAT, 125, 200, 175, 240)], 0.3).length, 0); assert.equal(associate(P, [box(VEST, 125, 98, 175, 120)], 0.3).length, 0); assert.equal(associate(P, [box(VEST, 130, 160, 150, 180)], 0.3).length, 0); assert.equal(associate(P, [box(HAT, 400, 100, 450, 140)], 0.3).length, 0);
});
check("one item of each kind per worker; a shared box is kept once; low scores dropped", () => {
  assert.deepEqual(associate(P, [box(HAT, 125, 98, 175, 140, 0.9), box(HAT, 120, 100, 170, 142, 0.6)], 0.3).map((b) => b.score), [0.9]);
  const persons: Box4[] = [[100, 100, 200, 300], [150, 100, 250, 300]]; assert.equal(associate(persons, [box(HAT, 160, 98, 190, 140, 0.9, 0), box(HAT, 161, 99, 191, 141, 0.7, 1)], 0.3).length, 1); assert.equal(associate(P, [box(HAT, 125, 98, 175, 140, 0.2)], 0.3).length, 0);
});
check("single-image absence is a potential violation only with a good view; a weak detection is not absence", () => {
  const a = new Assessor(["hard_hat", "safety_vest"], 0.5, 96, false), hatOnly = [box(HAT, 125, 98, 175, 140)], good = a.reliability(0, P, [0.9]); assert.deepEqual(good, []);
  let r = a.assess(0, null, hatOnly, good, 0.4, true); assert.ok(r.status === "potential_violation" && r.reasons.join() === "safety vest not detected");
  const bad = a.reliability(0, P, [0.3]); r = a.assess(0, null, hatOnly, bad, 0.4, true); assert.ok(r.status === "uncertain" && r.reasons.includes("low worker-detection confidence"));
  r = a.assess(0, null, [box(HAT, 125, 98, 175, 140), box(VEST, 110, 150, 190, 230, 0.35)], good, 0.4, true); assert.equal(r.status, "uncertain");
});
check("poor views are named", () => {
  const a = new Assessor(["hard_hat", "safety_vest"]); assert.ok(a.reliability(0, [[0, 50, 30, 100]], [0.9]).includes("worker too small in the frame")); assert.ok(a.reliability(0, [[10, 0, 110, 200]], [0.9]).includes("head cut off by the frame edge"));
  assert.ok(a.reliability(0, [[100, 100, 200, 300], [120, 100, 220, 300]], [0.9, 0.9]).includes("worker partly hidden by another worker"));
});
check("smoothing needs consistent evidence before concluding", () => {
  const a = new Assessor(["hard_hat", "safety_vest"]), full = [box(HAT, 125, 98, 175, 140), box(VEST, 110, 150, 190, 230)], states = Array.from({ length: 8 }, () => a.assess(0, 7, full, [], 0.4, true).status); assert.ok(states[0] === "uncertain" && states[7] === "compliant"); assert.equal(a.assess(0, 7, [], [], 0.4, true).status, "compliant");
  const b = new Assessor(["hard_hat", "safety_vest"]), hat = [box(HAT, 125, 98, 175, 140)], seq = Array.from({ length: 8 }, () => b.assess(0, 9, hat, [], 0.4, true).status); assert.ok(seq[0] === "uncertain" && seq[7] === "potential_violation" && !seq.slice(0, 4).includes("potential_violation"));
});
check("nothing required is reported as uncertain, not compliant", () => { assert.equal(new Assessor([], 0.5, 96, false).assess(0, null, [], [], 0.4, true).status, "uncertain"); });
