/** Run: npx tsx src/lib/bim/pointcloud.test.ts — point-cloud readers, filters and plane detection against a synthetic room of known planes. */
import { readCloud, stats, voxelDownsample, removeOutliers, detectPlanes, writeLas, writePlyAscii, writeXyz, cropBox, type Cloud } from "./pointcloud";

let pass = 0, fail = 0;
const t = (n: string, f: () => void) => { try { f(); pass++; console.log("  ok  " + n); } catch (e) { fail++; console.log("FAIL  " + n + "\n      " + (e as Error).message); } };
const eq = (c: boolean, m: string) => { if (!c) throw new Error(m); };
let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const noise = (a: number) => (rnd() - 0.5) * 2 * a;

/** Room 6 x 4 x 2.6 m: floor z=0, ceiling z=2.6, walls x=0/6, y=0/4, plus a table top z=0.75 (1.2 x 0.8 m) and 30 stray points. */
function room(): Cloud {
  const pts: number[] = []; const P = (x: number, y: number, z: number) => pts.push(x, y, z);
  const N = 0.004;
  for (let i = 0; i < 9000; i++) { P(rnd() * 6, rnd() * 4, noise(N)); P(rnd() * 6, rnd() * 4, 2.6 + noise(N)); }
  for (let i = 0; i < 4000; i++) { P(noise(N) + 0, rnd() * 4, rnd() * 2.6); P(6 + noise(N), rnd() * 4, rnd() * 2.6); }
  for (let i = 0; i < 6000; i++) { P(rnd() * 6, noise(N), rnd() * 2.6); P(rnd() * 6, 4 + noise(N), rnd() * 2.6); }
  for (let i = 0; i < 1500; i++) P(2 + rnd() * 1.2, 1 + rnd() * 0.8, 0.75 + noise(N));
  for (let i = 0; i < 30; i++) P(rnd() * 8 - 1, rnd() * 6 - 1, rnd() * 4 - 0.5);
  const xyz = Float64Array.from(pts); return { n: xyz.length / 3, xyz, format: "synthetic", fileCount: 1, truncated: false };
}
const c = room();
console.log(`Point cloud tests (${c.n} synthetic points)`);

t("LAS round trip preserves count and bounds within 1 mm", () => {
  const back = readCloud("a.las", writeLas(c)); eq(back.n === c.n, `count ${back.n} vs ${c.n}`);
  const a = stats(c), b = stats(back); for (let k = 0; k < 3; k++) { eq(Math.abs(a.bbox.min[k] - b.bbox.min[k]) < 1e-3 && Math.abs(a.bbox.max[k] - b.bbox.max[k]) < 1e-3, `bbox axis ${k}`); }
});
t("PLY (ascii) round trip", () => { const back = readCloud("a.ply", Buffer.from(writePlyAscii(c))); eq(back.n === c.n, "count"); eq(Math.abs(back.xyz[100] - c.xyz[100]) < 1e-9, "value"); });
t("XYZ / CSV round trip", () => { const back = readCloud("a.xyz", Buffer.from(writeXyz(c))); eq(back.n === c.n, "xyz count"); const csv = readCloud("a.csv", Buffer.from(writeXyz(c, true))); eq(csv.n === c.n, "csv count"); });
t("LAZ and unknown files are rejected with a message", () => { let msg = ""; try { const b = writeLas(c); b[104] |= 0x80; readCloud("a.laz", b); } catch (e) { msg = (e as Error).message; } eq(/laz|compress/i.test(msg), "message: " + msg); });
t("statistics: bbox of room is about 6 x 4 x 2.6", () => { const st = stats(removeOutliers(c, 8, 2).cloud); eq(Math.abs(st.size[0] - 6) < 0.3 && Math.abs(st.size[1] - 4) < 0.3 && Math.abs(st.size[2] - 2.6) < 0.3, JSON.stringify(st.size)); });
t("voxel downsample reduces points and keeps extent", () => { const d = voxelDownsample(c, 0.05); eq(d.n < c.n * 0.8 && d.n > 1000, `n=${d.n}`); });
t("outlier removal drops most stray points", () => { const r = removeOutliers(c, 8, 2); eq(r.removed >= 15 && r.removed < c.n * 0.1, `removed ${r.removed}`); });
t("crop box keeps only inside points", () => { const k = cropBox(c, [0, 0, 0], [3, 4, 3]); eq(k.n > 0 && k.n < c.n, "n"); for (let i = 0; i < k.n; i++) eq(k.xyz[i * 3] <= 3, "x"); });
const res = detectPlanes(voxelDownsample(c, 0.02), { tolerance: 0.015, minPoints: 300, maxPlanes: 10, seed: 7 });
t("RANSAC finds the six room planes plus the table", () => {
  const ps = res.planes; eq(ps.length >= 7, `found ${ps.length}`);
  const has = (n: number[], off: number) => ps.some((p) => { const dot = Math.abs(p.normal[0] * n[0] + p.normal[1] * n[1] + p.normal[2] * n[2]); if (dot < 0.995) return false; const sgn = p.normal[0] * n[0] + p.normal[1] * n[1] + p.normal[2] * n[2] > 0 ? 1 : -1; return Math.abs(-p.d * sgn - off) < 0.02; });
  eq(has([0, 0, 1], 0), "floor z=0"); eq(has([0, 0, 1], 2.6), "ceiling z=2.6"); eq(has([0, 0, 1], 0.75), "table z=0.75");
  eq(has([1, 0, 0], 0), "wall x=0"); eq(has([1, 0, 0], 6), "wall x=6"); eq(has([0, 1, 0], 0), "wall y=0"); eq(has([0, 1, 0], 4), "wall y=4");
});
t("plane kinds are classified", () => { const k = res.planes.map((p) => p.kind); eq(k.filter((x) => x === "horizontal").length >= 3 && k.filter((x) => x === "vertical").length >= 4, k.join()); });
t("plane RMS reflects the injected noise (< 5 mm)", () => { for (const p of res.planes.slice(0, 6)) eq(p.rms < 0.005, `rms ${p.rms}`); });

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
