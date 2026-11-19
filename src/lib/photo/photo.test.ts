import assert from "node:assert/strict";
import { cleanCloud, subsetCloud } from "./clean";
import { PointGrid } from "./grid";
import { cloudToPLY, parseOBJ, parsePLY, writeDXF, writeGLB, writeOBJ, writePLY, writeSTL } from "./io";
import { runPipeline } from "./pipeline";
import { heightField, heightMesh } from "./recon";
import { simplify } from "./simplify";
import { taubin } from "./smooth";
import { PRESETS, rng, synthFacade, truthChecks } from "./synth";
import { DEFAULT_PARAMS, type Mesh } from "./types";

const buf = async (b: Blob) => await b.arrayBuffer();
const grid = (n: number, f: (x: number, y: number) => number): Mesh => { const pos: number[] = [], idx: number[] = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) pos.push(x * 0.05, y * 0.05, f(x, y)); for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) { const a = y * n + x; idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n); } return { pos: Float64Array.from(pos), idx: Uint32Array.from(idx) }; };

async function main() {
  // ---- file formats: round trips keep coordinates exactly (large world offsets included)
  const m0: Mesh = { pos: Float64Array.from([532100.123456789, 35.5, 4180200.987654321, 532101.5, 35.5, 4180200.5, 532100.5, 36.5, 4180201.25]), idx: Uint32Array.from([0, 1, 2]) };
  const p1 = parsePLY(await buf(writePLY(m0))); assert.ok(p1.mesh && p1.mesh.pos[0] === m0.pos[0] && p1.mesh.pos[8] === m0.pos[8] && p1.faceCount === 1, "binary PLY round trip is exact");
  const o1 = parseOBJ(await writeOBJ(m0).text()); assert.ok(o1.mesh && Math.abs(o1.mesh.pos[0] - m0.pos[0]) < 1e-9 && o1.faceCount === 1, "OBJ round trip");
  const asc = `ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0 255 0 0\n1 0 0 0 255 0\n1 1 0 0 0 255\n0 1 0 9 9 9\n4 0 1 2 3\n`;
  const pa = parsePLY(new TextEncoder().encode(asc).buffer as ArrayBuffer); assert.equal(pa.faceCount, 2, "quad is triangulated"); assert.deepEqual([...pa.mesh!.colors!.slice(0, 3)], [255, 0, 0]);
  const pc = parsePLY(await buf(cloudToPLY({ pos: Float64Array.from([1, 2, 3, 4, 5, 6]), colors: Uint8Array.from([1, 2, 3, 4, 5, 6]) }))); assert.ok(pc.cloud && pc.cloud.pos[4] === 5 && pc.cloud.colors![5] === 6, "point cloud PLY with colours");
  assert.throws(() => parsePLY(new TextEncoder().encode("hello").buffer as ArrayBuffer), /not a valid PLY|not a PLY/); assert.throws(() => parseOBJ("f 1 2 3"), /no vertices/); assert.throws(() => parseOBJ("v 1 2 3\nv 1 2 3\nv 1 2 3\nf 1 2 9"), /do not exist/); assert.throws(() => parseOBJ("v 1 NaN 3"), /invalid/);
  const stl = writeSTL(m0); assert.equal((await buf(stl.blob)).byteLength, 84 + 50, "binary STL size"); assert.ok(Math.abs(stl.offset[0] - 532100.123456789) < 1e-6, "STL offset reported");
  const glb = await buf(writeGLB(m0, "m")), dv = new DataView(glb); assert.equal(dv.getUint32(0, true), 0x46546c67); assert.equal(dv.getUint32(4, true), 2); assert.equal(dv.getUint32(8, true), glb.byteLength); const jl = dv.getUint32(12, true), gj = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jl)));
  assert.ok(Math.abs(gj.nodes[0].translation[0] - (532100.123456789 + 532101.5) / 2) < 1e-6 && gj.accessors[0].count === 3, "GLB keeps the world position in the node translation");
  const dxf = await writeDXF(m0, "mm").text(); assert.ok(dxf.includes("3DFACE") && dxf.includes("$INSUNITS\n70\n4") && dxf.trim().endsWith("EOF"), "DXF with units");
  // ---- spatial index agrees with brute force
  const r = rng(5), pts = new Float64Array(3 * 2000); for (let i = 0; i < pts.length; i++) pts[i] = r(); const g = new PointGrid(pts, 0.08); let bad = 0;
  for (let q = 0; q < 100; q++) { const x = r(), y = r(), z = r(); const got: number[] = []; g.near(x, y, z, 0.1, (i) => got.push(i)); const want: number[] = []; for (let i = 0; i < 2000; i++) if (Math.hypot(pts[i * 3] - x, pts[i * 3 + 1] - y, pts[i * 3 + 2] - z) <= 0.1) want.push(i); if (got.sort().join() !== want.sort().join()) bad++; } assert.equal(bad, 0, "grid radius search equals brute force");
  // ---- cleaning removes injected junk and keeps the real surface
  const flat: number[] = []; const rr = rng(9); for (let i = 0; i < 20000; i++) flat.push(rr() * 4, rr() * 3, 0.003 * (rr() - 0.5)); const base = flat.length / 3; for (let i = 0; i < 100; i++) flat.push(rr() * 6 - 1, rr() * 5 - 1, rr() * 2 + 0.5); for (let i = 0; i < 300; i++) flat.push(8 + 0.05 * rr(), 8 + 0.05 * rr(), 8 + 0.05 * rr());
  const cl = cleanCloud(Float64Array.from(flat), 12, 2.5, 0.02), kept = cl.keep.length, realKept = [...cl.keep].filter((i) => i < base).length; assert.ok(realKept > 19500, `real points kept ${realKept}`); assert.ok(kept - realKept < 15, `junk left ${kept - realKept}`);
  // ---- height field: a plane with a recess, noise, a hole; small gaps filled, large holes left open; wall snapped; offset kept
  const hf: number[] = []; for (let i = 0; i < 90000; i++) { const x = rr() * 6, y = rr() * 4; if (x > 2 && x < 3.4 && y > 1 && y < 2.2) continue; const rec = x > 4 && x < 5 && y > 1 && y < 2 ? -0.2 : 0; hf.push(1000 + x, 50 + y, 5000 + rec + 0.004 * (rr() - 0.5)); }
  const h = heightField(Float64Array.from(hf), 0.06, 3, 0.01), hm = heightMesh(h); assert.ok(h.snapped > 1000 && hm.idx.length > 1000); let zmin = 1e9, zmax = -1e9; for (let i = 2; i < hm.pos.length; i += 3) { zmin = Math.min(zmin, hm.pos[i]); zmax = Math.max(zmax, hm.pos[i]); }
  assert.ok(zmin > 4999.75 && zmin < 4999.85 && Math.abs(zmax - 5000) < 0.011, `recess ${zmin} wall ${zmax}`); assert.ok(hm.pos[0] > 999 && hm.pos[0] < 1007, "original coordinates kept");
  assert.ok(!hm.idx.length || (h.state.reduce((a, b) => a + (b === 0 ? 1 : 0), 0) > 100), "the 1.4 x 1.2 m hole stays open");
  // ---- Taubin does not shrink and never moves a vertex further than the limit; QEM keeps a stepped feature and obeys the error bound
  const noisy = grid(60, () => 0.004 * (rr() - 0.5)), tb = taubin(noisy, 10, 40, 0.01); let dz0 = 0, dz1 = 0, mean = 0; for (let i = 2; i < noisy.pos.length; i += 3) { dz0 += noisy.pos[i] ** 2; dz1 += tb.mesh.pos[i] ** 2; mean += tb.mesh.pos[i]; } assert.ok(dz1 < dz0 * 0.5, "noise reduced"); assert.ok(Math.abs(mean / (noisy.pos.length / 3)) < 0.0005, "mean surface stays put"); assert.ok(tb.maxMoved <= 0.01 + 1e-12);
  const lim = taubin(noisy, 30, 40, 0.0005); assert.ok(lim.maxMoved <= 0.0005 + 1e-12, "hard movement limit");
  const step = grid(40, (x, y) => (x >= 15 && x < 25 && y >= 15 && y < 25 ? 0.25 : 0)), sp = simplify(step, 0.05, 0.006); let sz = -1; for (let i = 2; i < sp.mesh.pos.length; i += 3) sz = Math.max(sz, sp.mesh.pos[i]); assert.ok(Math.abs(sz - 0.25) < 1e-9 && sp.mesh.idx.length / 3 < step.idx.length / 3 / 8, "flat parts collapse, the 250 mm step survives");
  // ---- full pipeline on the synthetic facade: dimensions, validation and ground truth
  const o = { ...PRESETS.typical.opt, points: 160000 }, cloud = synthFacade(o), t0 = Date.now();
  const out = runPipeline({ cloud, mesh: null, format: "synthetic", vertexCount: cloud.pos.length / 3, faceCount: 0, notes: [] }, DEFAULT_PARAMS), a = out.report.accuracy;
  assert.ok(out.report.counts.cleanedPoints < out.report.counts.rawPoints && out.report.counts.cleanedPoints > out.report.counts.rawPoints * 0.9, "cleaning removed junk only"); assert.ok(out.report.counts.finalTriangles <= out.report.counts.reconTriangles * 0.15, "mesh is much lighter");
  assert.ok(a.maxBboxDeltaMm < 40, `extent change ${a.maxBboxDeltaMm}`); assert.ok(a.pass.surface && a.pass.process, JSON.stringify(a.pass)); assert.ok(a.surfaceDevMm.p95 < DEFAULT_PARAMS.toleranceMm && a.pairs.meanRelPercent < 0.2, `pairs ${a.pairs.meanRelPercent}`);
  for (let i = 0; i < out.mesh.pos.length; i += 3) { assert.ok(out.mesh.pos[i] > 532090 && out.mesh.pos[i] < 532120 && out.mesh.pos[i + 2] > 4180198 && out.mesh.pos[i + 2] < 4180203, "mesh stays at the input's world coordinates"); if (i > 300) break; }
  const tc = Object.fromEntries(truthChecks(out.mesh.pos, out.mesh.idx, o.origin).map((c) => [c.name, c])); const lim2: Record<string, number> = { "Overall width": 0.04, "Overall height": 0.04, "Window height": 0.06, "Door width": 0.08, "Window recess depth": 0.015, "Cornice projection": 0.015, "Window width (average of complete windows)": 0.08 };
  for (const [k, v] of Object.entries(lim2)) { assert.ok(tc[k], "missing check " + k); assert.ok(Math.abs(tc[k].error) <= v, `${k}: error ${(tc[k].error * 1000).toFixed(1)} mm`); }
  // ---- mesh input path and errors
  const nm = grid(50, (x) => 0.003 * Math.sin(x)), mo = runPipeline({ cloud: null, mesh: nm, format: "OBJ", vertexCount: nm.pos.length / 3, faceCount: nm.idx.length / 3, notes: [] }, { ...DEFAULT_PARAMS, keepRatio: 0.3 }); assert.ok(mo.report.input.kind === "mesh" && mo.report.counts.finalTriangles < nm.idx.length / 3 * 0.5);
  assert.throws(() => runPipeline({ cloud: { pos: new Float64Array(30) }, mesh: null, format: "x", vertexCount: 10, faceCount: 0, notes: [] }, DEFAULT_PARAMS), /Too few points|No surface/);
  void subsetCloud;
  console.log(`photogrammetry clean-up tests passed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
