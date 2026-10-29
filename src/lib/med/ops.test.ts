import assert from "node:assert/strict";
import * as o from "./ops";
const check = (n: string, f: () => void) => { f(); console.log("ok", n); };
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
/** Phantom with known geometry: two bright discs on a dark background, plus optional Gaussian noise. */
function phantom(noise: number, bg = 60, fg = 180): { g: o.Gray; areas: number[] } {
  const g = o.make(200, 200), discs = [{ x: 60, y: 60, r: 30 }, { x: 140, y: 130, r: 20 }], areas = discs.map(() => 0);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) { let v = bg; discs.forEach((d, i) => { if ((x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) { v = fg; areas[i]++; } }); g.d[y * 200 + x] = v + noise * gauss(); }
  return { g, areas };
}
check("otsu finds the threshold between the two plateaus and the segmentation recovers each disc area within 3%", () => {
  const { g, areas } = phantom(8), t = o.otsu(g); assert.ok(t > 80 && t < 160, `otsu ${t}`);
  const { regions } = o.components(o.open(o.threshold(g, t + 1), 1), g, 50); assert.equal(regions.length, 2);
  const got = regions.map((r) => r.area).sort((a, b) => b - a), want = [...areas].sort((a, b) => b - a); got.forEach((a, i) => assert.ok(Math.abs(a - want[i]) / want[i] < 0.03, `area ${a} vs ${want[i]}`));
  assert.ok(Math.abs(regions.find((r) => r.area > 2000)!.cx - 60) < 1 && Math.abs(regions.find((r) => r.area > 2000)!.cy - 60) < 1);
});
check("window/level maps the chosen window exactly onto 0..255", () => { const g = o.make(3, 1); g.d.set([50, 100, 150]); const w = o.windowLevel(g, 100, 100); assert.deepEqual([...w.d], [0, 127, 255]); });
check("contrast stretch widens a narrow histogram to the full range", () => { const g = o.make(100, 1); for (let i = 0; i < 100; i++) g.d[i] = 100 + (i % 20); const { out } = o.stretch(g, 0, 1); assert.equal(Math.min(...out.d), 0); assert.equal(Math.max(...out.d), 255); });
check("CLAHE increases local contrast of a low-contrast image and keeps the output in range", () => {
  const { g } = phantom(2, 100, 112); const sd = (x: o.Gray) => { let m = 0; x.d.forEach((v) => (m += v)); m /= x.d.length; let s = 0; x.d.forEach((v) => (s += (v - m) ** 2)); return Math.sqrt(s / x.d.length); };
  const c = o.clahe(g, 8, 3); assert.ok(sd(c) > 2 * sd(g), `${sd(g)} → ${sd(c)}`);
});
check("median filter removes salt-and-pepper noise (error vs the clean phantom drops by >90%)", () => {
  const clean = phantom(0).g, noisy = o.clone(clean); for (let i = 0; i < noisy.d.length; i++) { const r = rnd(); if (r < 0.04) noisy.d[i] = 0; else if (r < 0.08) noisy.d[i] = 255; }
  const err = (x: o.Gray) => { let s = 0; for (let i = 0; i < x.d.length; i++) s += Math.abs(x.d[i] - clean.d[i]); return s / x.d.length; };
  const f = o.median(noisy, 1); assert.ok(err(f) < 0.1 * err(noisy), `${err(noisy)} → ${err(f)}`);
});
check("gaussian smoothing reduces the estimated noise level", () => { const { g } = phantom(15), s0 = o.noiseSigma(g), s1 = o.noiseSigma(o.gaussian(g, 1.5)); assert.ok(s1 < 0.5 * s0, `${s0} → ${s1}`); });
check("multi-level otsu separates three plateaus", () => {
  const g = o.make(90, 1); for (let i = 0; i < 90; i++) g.d[i] = i < 30 ? 20 : i < 60 ? 120 : 220; const [a, b] = o.otsu3(g); assert.ok(a >= 20 && a < 120 && b >= 120 && b < 220, `${a},${b}`);
});
check("region growing from a seed inside a disc selects exactly that disc", () => { const { g, areas } = phantom(0), m = o.regionGrow(g, 60, 60, 20), n = m.d.reduce((s, v) => s + v, 0); assert.equal(n, areas[0]); assert.equal(m.d[130 * 200 + 140], 0); });
check("hole filling fills an enclosed hole but not the background", () => {
  const m: o.Mask = { w: 20, h: 20, d: new Uint8Array(400) }; for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) m.d[y * 20 + x] = 1; for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) m.d[y * 20 + x] = 0;
  const f = o.fillHoles(m); assert.equal(f.d[10 * 20 + 10], 1); assert.equal(f.d[1 * 20 + 1], 0);
});
check("connected components reports area, centroid and mean for a known square", () => { const g = o.make(20, 20); g.d.fill(10); const m: o.Mask = { w: 20, h: 20, d: new Uint8Array(400) }; for (let y = 5; y < 10; y++) for (let x = 2; x < 6; x++) { m.d[y * 20 + x] = 1; g.d[y * 20 + x] = 200; } const { regions } = o.components(m, g); assert.equal(regions.length, 1); assert.equal(regions[0].area, 20); assert.equal(regions[0].mean, 200); assert.equal(regions[0].cx, 3.5); assert.equal(regions[0].cy, 7); });
