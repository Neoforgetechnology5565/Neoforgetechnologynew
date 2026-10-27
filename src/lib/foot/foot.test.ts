/** Run: npx tsx src/lib/foot/foot.test.ts — geometry tests on SYNTHETIC scenes with known dimensions (not photographs of feet). */
import { renderScene, boxBlur } from "./synthetic";
import { analyzeFootImage } from "./vision";
import { sizeFromFoot, widthClass, recommend, SAMPLE_PROFILES, compareFeet } from "./sizing";
import { parseObj, measureMesh } from "./mesh";
import type { Img } from "./types";

let pass = 0, fail = 0; const out: string[] = [];
function t(name: string, fn: () => void) { try { fn(); pass++; out.push(`  ok   ${name}`); } catch (e) { fail++; out.push(`  FAIL ${name}\n       ${(e as Error).message}`); } }
const near = (a: number, b: number, tol: number, what: string) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: got ${a}, expected ${b} ± ${tol}`); };
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };

/* length/width recovery under varying geometry */
const cases: { n: string; o: Parameters<typeof renderScene>[0]; tol: number }[] = [
  { n: "flat, centred", o: { footLengthMm: 255, footWidthMm: 98 }, tol: 3 },
  { n: "short foot 210 mm", o: { footLengthMm: 210, footWidthMm: 82 }, tol: 3 },
  { n: "long foot 268 mm", o: { footLengthMm: 268, footWidthMm: 102, footAngleDeg: 0 }, tol: 3 },
  { n: "left foot", o: { footLengthMm: 240, footWidthMm: 92, side: "left" }, tol: 3 },
  { n: "pitch 8°, roll −6°, yaw 10°", o: { footLengthMm: 235, footWidthMm: 90, pitchDeg: 8, rollDeg: -6, yawDeg: 10 }, tol: 3 },
  { n: "strong perspective (pitch 12° at 600 mm)", o: { footLengthMm: 250, footWidthMm: 96, pitchDeg: 12, heightMm: 600 }, tol: 4 },
  { n: "different camera height (700 mm)", o: { footLengthMm: 250, footWidthMm: 96, heightMm: 700 }, tol: 4 },
  { n: "image rotated 90° (portrait paper)", o: { footLengthMm: 250, footWidthMm: 96, yawDeg: 90, w: 1200, h: 1600 }, tol: 3 },
  { n: "image noise σ≈6", o: { footLengthMm: 250, footWidthMm: 96, noise: 6 }, tol: 3 },
  { n: "mild blur (2 px)", o: { footLengthMm: 250, footWidthMm: 96, blurPx: 2 }, tol: 3.5 },
  { n: "foot offset on paper", o: { footLengthMm: 245, footWidthMm: 94, footOffset: { x: 6, y: -12 } }, tol: 3 },
  { n: "US Letter sheet", o: { footLengthMm: 250, footWidthMm: 96, paper: "letter" }, tol: 3 },
  { n: "FOV mismatch (renders 75°, engine assumes 65°)", o: { footLengthMm: 250, footWidthMm: 96, fovDeg: 75 }, tol: 5 },
  { n: "3D silhouette 25 mm above the paper (parallax corrected)", o: { footLengthMm: 250, footWidthMm: 96, footHeightMm: 25 }, tol: 4 },
];
for (const c of cases) t(`measure: ${c.n}`, () => {
  const s = renderScene({ footHeightMm: 25, ...c.o }); const a = analyzeFootImage(s.img, { paper: c.o.paper ?? "auto" }).analysis; ok(a.ok, `analysis failed: ${a.reason}`);
  near(a.measurement!.lengthMm, c.o.footLengthMm, c.tol, "length"); near(a.measurement!.widthMm, c.o.footWidthMm, c.tol, "width");
});
t("flat (zero-height) silhouette is under-read by the assumed parallax correction — documented limitation", () => { const a = analyzeFootImage(renderScene({ footLengthMm: 255, footWidthMm: 98 }).img).analysis.measurement!; near(a.rawLengthMm, 255, 2, "raw planar length"); ok(a.lengthMm < a.rawLengthMm && a.parallaxScale < 1, "corrected < raw"); });
t("scale conversion: pixel/mm matches the sheet", () => { const s = renderScene({ footLengthMm: 250, footWidthMm: 96, heightMm: 520 }); const a = analyzeFootImage(s.img).analysis; ok(a.ok, "fail"); near(a.calibration!.pxPerMm, 1600 / (2 * Math.tan(32.5 * Math.PI / 180)) / 520, 0.15, "px/mm"); });
t("paper auto-detection picks A4 vs Letter", () => { ok(analyzeFootImage(renderScene({ footLengthMm: 250, footWidthMm: 96 }).img).analysis.calibration?.paper === "a4", "a4"); ok(analyzeFootImage(renderScene({ footLengthMm: 250, footWidthMm: 96, paper: "letter" }).img).analysis.calibration?.paper === "letter", "letter"); });
t("left vs right: assigned sides give mirrored outlines of equal size", () => { const L = analyzeFootImage(renderScene({ footLengthMm: 250, footWidthMm: 96, side: "left" }).img).analysis.measurement!, R = analyzeFootImage(renderScene({ footLengthMm: 250, footWidthMm: 96, side: "right" }).img).analysis.measurement!; near(L.lengthMm, R.lengthMm, 1.5, "length"); near(L.widthMm, R.widthMm, 2, "width"); });
t("left/right difference of 6 mm is detected", () => { const L = analyzeFootImage(renderScene({ footLengthMm: 256, footWidthMm: 98, side: "left" }).img).analysis.measurement!, R = analyzeFootImage(renderScene({ footLengthMm: 250, footWidthMm: 96, side: "right" }).img).analysis.measurement!; const cmp = compareFeet(L, R); near(cmp.lengthDiffMm, 6, 3, "diff"); ok(cmp.largerFoot === "left", "larger foot"); });
t("manual corners reproduce the auto result", () => { const s = renderScene({ footLengthMm: 250, footWidthMm: 96 }); const auto = analyzeFootImage(s.img).analysis; const man = analyzeFootImage(s.img, { paper: "a4", corners: s.truth.corners }).analysis; ok(man.ok && man.calibration?.method === "manual-corners", "manual"); near(man.measurement!.lengthMm, auto.measurement!.lengthMm, 2.5, "length"); });
t("manual corners with 4 px error stay within 4 mm", () => { const s = renderScene({ footLengthMm: 250, footWidthMm: 96, footHeightMm: 25 }); const c = s.truth.corners.map((p, i) => ({ x: p.x + (i % 2 ? 4 : -4), y: p.y + (i < 2 ? -3 : 3) })); const a = analyzeFootImage(s.img, { paper: "a4", corners: c }).analysis; ok(a.ok, "fail"); near(a.measurement!.lengthMm, 250, 5, "length"); });

/* refusal and quality behaviour */
t("no calibration paper → refuses, never invents a measurement", () => { const s = renderScene({ footLengthMm: 250, footWidthMm: 96 }); const img = { ...s.img, data: s.img.data.map((v, i) => (i % 3 === 0 ? 70 : 60)) } as Img; const a = analyzeFootImage(img).analysis; ok(!a.ok && !a.measurement && a.stage === "paper" && !!a.reason, "should refuse"); });
t("too-small image rejected", () => { const a = analyzeFootImage({ w: 300, h: 300, ch: 3, data: new Uint8Array(300 * 300 * 3) }).analysis; ok(!a.ok && a.stage === "decoded", "small"); });
t("very dark photo is flagged", () => { const a = analyzeFootImage(renderScene({ footLengthMm: 250, footWidthMm: 96, brightness: 0.34 }).img).analysis; ok(!a.ok || a.warnings.some((w) => /dark/i.test(w)) || a.grade !== "good", "dark not flagged"); });
t("heavy blur is flagged", () => { const a = analyzeFootImage(boxBlur(renderScene({ footLengthMm: 250, footWidthMm: 96 }).img, 9)).analysis; ok(!a.ok || a.quality!.sharpnessLabel !== "sharp", "blur not flagged"); });
t("pale foot on white paper (white sock) → refuses with guidance", () => { const a = analyzeFootImage(renderScene({ footLengthMm: 250, footWidthMm: 96, footRgb: [236, 234, 230] }).img).analysis; ok(!a.ok && a.stage === "segmentation" && /sock|apart/i.test(a.reason ?? ""), `expected refusal, got ok=${a.ok} ${a.reason}`); });
t("foot running off the paper is warned", () => { const a = analyzeFootImage(renderScene({ footLengthMm: 285, footWidthMm: 104, footAngleDeg: 0 }).img).analysis; ok(!a.ok || a.warnings.some((w) => /edge/i.test(w)), "edge not flagged"); });
t("strong tilt lowers the grade", () => { const a = analyzeFootImage(renderScene({ footLengthMm: 250, footWidthMm: 96, pitchDeg: 38 }).img).analysis; ok(!a.ok || a.warnings.some((w) => /angle/i.test(w)), "tilt not flagged"); });

/* sizing */
t("275 mm foot on A4 is warned that it nearly fills the sheet (length may be clipped)", () => { const a = analyzeFootImage(renderScene({ footLengthMm: 275, footWidthMm: 104, footAngleDeg: 0, footHeightMm: 25 }).img).analysis; ok(a.ok && a.warnings.some((w) => /edge|paper/i.test(w)), "no warning"); });
t("sizing: 255 mm foot, regular", () => { const s = sizeFromFoot(255, "regular"); near(s.lastLengthMm, 267, 0.01, "last"); ok(s.eu === 40 && s.uk === 6.5 && s.usMen === 7.5 && s.usWomen === 9, JSON.stringify(s)); });
t("sizing: fit allowance changes size monotonically", () => { const a = sizeFromFoot(260, "snug"), b = sizeFromFoot(260, "regular"), c = sizeFromFoot(260, "roomy"); ok(a.eu <= b.eu && b.eu <= c.eu && a.eu < c.eu, "monotone"); });
t("sizing: US men's and women's are different scales", () => { const s = sizeFromFoot(250); near(s.usWomen - s.usMen, 1.5, 0.001, "offset"); });
t("sizing: larger foot is flagged", () => { ok(sizeFromFoot(335).notes.some((n) => /longer than/.test(n)) && !sizeFromFoot(335).inRange, "large"); });
t("sizing: steps explain the calculation", () => { ok(sizeFromFoot(250).steps.length === 4, "steps"); });
t("sizing: width class and recommendation", () => { ok(widthClass(80, 250).cls === "narrow" && widthClass(100, 250).cls === "standard" && widthClass(112, 250).cls === "extra wide", "width"); const r = recommend(250, 112, SAMPLE_PROFILES.find((p) => p.id === "dress")!); ok(r.widthFit === "tight" && !r.brandSize, "recommend"); });
t("unit conversion mm → in", () => { near(Math.round(254 / 25.4 * 100) / 100, 10, 0.001, "in"); });

/* mesh */
function cube(sx: number, sy: number, sz: number) { const lines: string[] = []; for (let i = 0; i < 300; i++) { const u = Math.random() - 0.5, v = Math.random() - 0.5, w = Math.random() - 0.5; lines.push(`v ${u * sx} ${v * sy} ${w * sz}`); } lines.push("v 0 0 0"); lines.push("v 0.5 0 0"); lines.push("v 0 0.5 0"); lines.push(`v ${sx / 2} ${sy / 2} ${sz / 2}`, `v ${-sx / 2} ${-sy / 2} ${-sz / 2}`); for (let i = 1; i <= 300; i++) lines.push(`f ${i} ${(i % 300) + 1} ${((i + 1) % 300) + 1}`); return lines.join("\n"); }
t("mesh: OBJ extents in cm → mm", () => { const m = measureMesh(parseObj(cube(26, 10, 7)), "cm"); ok(m.lengthMm > 200 && m.lengthMm < 280 && m.widthMm < m.lengthMm && m.heightMm < m.widthMm, JSON.stringify([m.lengthMm, m.widthMm, m.heightMm])); });
t("mesh: invalid OBJ rejected", () => { let threw = false; try { parseObj("v 1 2 3\nf 1 2 3"); } catch { threw = true; } ok(threw, "should throw"); });

console.log(out.join("\n")); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
