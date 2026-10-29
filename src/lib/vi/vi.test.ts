import assert from "node:assert/strict";
import { bbSummary, ttSummary, type BBAnnotation, type TTAnnotation } from "./annotations";
import { csvCell, hms, mmss, nearestFrame, toCsv } from "./format";

const check = (n: string, f: () => void) => { f(); console.log("ok", n); };
const tt = (t: number, kind: TTAnnotation["kind"]): TTAnnotation => ({ id: `${t}${kind}`, t, kind });

check("csv neutralises spreadsheet formulas but keeps plain negative numbers", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1+1"), "'+1+1"); assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)"); assert.equal(csvCell("-5"), "-5"); assert.equal(csvCell("-5x"), "'-5x");
  assert.equal(csvCell("a,b"), "\"a,b\""); assert.equal(csvCell(null), ""); assert.equal(toCsv([["a", 1], ["b", "x\ny"]]), "a,1\r\nb,\"x\ny\"\r\n");
});
check("time formatting", () => { assert.equal(mmss(75.26), "1:15.3"); assert.equal(mmss(-3), "0:00.0"); assert.equal(hms(3725), "01:02:05"); });
check("nearestFrame finds the closest analysed frame or none", () => {
  const t = [0, 0.2, 0.4, 1.0];
  assert.equal(nearestFrame(t, 0.21, 0.15), 1); assert.equal(nearestFrame(t, 0.9, 0.15), 3); assert.equal(nearestFrame(t, 0.7, 0.15), -1); assert.equal(nearestFrame([], 1, 1), -1); assert.equal(nearestFrame(t, 99, 0.2), -1);
});
check("table tennis annotations pair rallies, score points and report unpaired marks", () => {
  const s = ttSummary([tt(1, "Rally start"), tt(5.2, "Point: side A"), tt(5.5, "Rally end"), tt(9, "Rally start"), tt(12, "Point: side B"), tt(12.4, "Rally end"), tt(20, "Rally end"), tt(30, "Rally start")]);
  assert.equal(s.count, 2); assert.deepEqual(s.score, { A: 1, B: 1 }); assert.equal(s.rallies[0].duration, 4.5); assert.equal(s.mean_duration, 3.95); assert.equal(s.longest, 4.5);
  assert.deepEqual(s.incomplete.map((x) => x.reason), ["Rally end with no start", "Rally start with no end"]);
  assert.deepEqual(ttSummary([]), { rallies: [], incomplete: [], score: { A: 0, B: 0 }, count: 0, mean_duration: null, longest: null });
});
check("basketball annotation statistics are only counts of what was entered", () => {
  const a = (kind: BBAnnotation["kind"], team: "A" | "B" | "", points?: 1 | 2 | 3): BBAnnotation => ({ id: Math.random().toString(), t: 0, kind, team, points });
  const s = bbSummary([a("Shot made", "A", 3), a("Shot made", "A", 2), a("Shot missed", "A"), a("Shot made", "B"), a("Assist", "A"), a("Rebound", "B"), a("Foul", ""), a("Shot missed", "B")]);
  assert.equal(s.A.points, 5); assert.equal(s.A.attempts, 3); assert.equal(s.A.fg_pct, 66.67); assert.equal(s.A.assists, 1); assert.equal(s.B.points, 2); assert.equal(s.B.fg_pct, 50); assert.equal(s.B.rebounds, 1);
  assert.equal(bbSummary([]).A.fg_pct, null);
});
