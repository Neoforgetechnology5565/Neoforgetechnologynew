import { cleanCloud, subsetCloud } from "./clean";
import { PointGrid } from "./grid";
import { bbox, meshArea, statsOf, TriIndex, type Stats } from "./metrics";
import { heightField, heightMesh, principalFrame, suggestCell } from "./recon";
import { simplify } from "./simplify";
import { taubin } from "./smooth";
import type { Cloud, Mesh, Params, Parsed, StageInfo } from "./types";
import { UNIT_PER_M } from "./types";
import { rng } from "./synth";

export interface Report {
  input: { kind: "cloud" | "mesh"; points: number; triangles: number; format: string };
  stages: StageInfo[];
  counts: { rawPoints: number; cleanedPoints: number; reconTriangles: number; smoothedTriangles: number; finalTriangles: number; finalVertices: number };
  accuracy: {
    tolMm: number;
    bboxBefore: number[]; bboxAfter: number[]; bboxDeltaMm: number[]; maxBboxDeltaMm: number; originShiftMm: number[];
    surfaceDev: Stats; surfaceDevMm: { mean: number; rms: number; p95: number; max: number };
    processDevMm: { mean: number; rms: number; p95: number; max: number }; guaranteedMaxMm: number;
    pairs: { n: number; maxAbsMm: number; meanAbsMm: number; maxRelPercent: number; meanRelPercent: number };
    areaBefore: number; areaAfter: number;
    pass: { dimensions: boolean; surface: boolean; process: boolean };
  };
  notes: string[];
}
export interface Output { cleaned: Cloud; recon: Mesh; mesh: Mesh; deviation: Float32Array; report: Report }
type Progress = (stage: string, fraction: number) => void;
const mm = (v: number, unit: Params["unit"]) => (v * 1000) / UNIT_PER_M[unit]; // metres -> units value helper not used; see toUnit
const unitsOf = (mmv: number, unit: Params["unit"]) => (mmv / 1000) * UNIT_PER_M[unit]; // millimetres -> coordinate units
const toMm = (v: number, unit: Params["unit"]) => (v / UNIT_PER_M[unit]) * 1000; // coordinate units -> millimetres
void mm;

/** Cleans a loaded mesh: welds duplicate vertices, drops degenerate triangles and small floating pieces. */
export function cleanMesh(m: Mesh, frac: number): { mesh: Mesh; removedTris: number; pieces: number } {
  const nv = m.pos.length / 3; let mn = Infinity, mx = -Infinity; for (const v of m.pos) { if (v < mn) mn = v; if (v > mx) mx = v; } const q = Math.max((mx - mn) * 1e-9, 1e-12), map = new Map<string, number>(), remap = new Uint32Array(nv), pos: number[] = [];
  for (let i = 0; i < nv; i++) { const k = `${Math.round(m.pos[i * 3] / q)},${Math.round(m.pos[i * 3 + 1] / q)},${Math.round(m.pos[i * 3 + 2] / q)}`; let id = map.get(k); if (id === undefined) { id = pos.length / 3; map.set(k, id); pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); } remap[i] = id; }
  const tris: number[] = []; for (let t = 0; t < m.idx.length; t += 3) { const a = remap[m.idx[t]], b = remap[m.idx[t + 1]], c = remap[m.idx[t + 2]]; if (a !== b && b !== c && a !== c) tris.push(a, b, c); }
  const n2 = pos.length / 3, parent = Int32Array.from({ length: n2 }, (_, i) => i), find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < tris.length; t += 3) { parent[find(tris[t])] = find(tris[t + 1]); parent[find(tris[t + 1])] = find(tris[t + 2]); }
  const cnt = new Map<number, number>(); for (let t = 0; t < tris.length; t += 3) { const r = find(tris[t]); cnt.set(r, (cnt.get(r) ?? 0) + 1); } const big = Math.max(0, ...cnt.values()), keep: number[] = [], used = new Int32Array(n2).fill(-1), op: number[] = [];
  for (let t = 0; t < tris.length; t += 3) { if ((cnt.get(find(tris[t])) ?? 0) < big * frac) continue; for (let k = 0; k < 3; k++) { const v = tris[t + k]; if (used[v] < 0) { used[v] = op.length / 3; op.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } keep.push(used[v]); } }
  return { mesh: { pos: Float64Array.from(op), idx: Uint32Array.from(keep) }, removedTris: m.idx.length / 3 - keep.length / 3, pieces: cnt.size };
}

export function runPipeline(input: Parsed, p: Params, progress: Progress = () => {}): Output {
  const stages: StageInfo[] = [], notes: string[] = []; const time = <T,>(name: string, f: () => { r: T; detail: string }): T => { const t0 = performance.now(); const { r, detail } = f(); stages.push({ name, detail, ms: Math.round(performance.now() - t0) }); return r; };
  const u = p.unit, kMm = (v: number) => toMm(v, u);
  let cleaned: Cloud, recon: Mesh, rawCount: number;
  if (input.cloud) {
    const raw = input.cloud; rawCount = raw.pos.length / 3; progress("Cleaning the point cloud", 0.05);
    const res = time("Cleaning", () => { const r = cleanCloud(raw.pos, p.outlierK, p.outlierStd, p.floatingFraction); return { r, detail: `${r.stages.map((s) => `${s.name}: ${s.removed.toLocaleString()} removed (${s.detail})`).join("; ")}` }; });
    const sub = subsetCloud(raw.pos, res.keep, raw.colors); cleaned = { pos: sub.pos, colors: sub.colors };
    if (cleaned.pos.length < 300) throw new Error("Too few points are left after cleaning to reconstruct a surface. Try a lower outlier threshold or check the file.");
    progress("Reconstructing the surface", 0.3);
    const cell = suggestCell(cleaned.pos, p.pointsPerCell, res.spacing), snap = unitsOf(p.snapMm, u);
    recon = time("Surface reconstruction", () => { const h = heightField(cleaned.pos, cell, p.fillIterations, snap); const m = heightMesh(h); if (!m.idx.length) throw new Error("No surface could be reconstructed. This demo reconstructs facade-like (mostly planar) scans; try a larger cell size."); return { r: m, detail: `height-field on the dominant plane, cell ${kMm(cell).toFixed(1)} mm, ${h.measured.toLocaleString()} measured cells, ${h.filled.toLocaleString()} small gaps filled, ${h.snapped.toLocaleString()} cells snapped to the wall plane (tolerance ${p.snapMm} mm); larger holes left open` }; });
    if (m_isThin(recon)) notes.push("The reconstructed surface is small compared with the point cloud: parts of the scan may not be facade-like (this demo reconstructs one dominant surface).");
  } else if (input.mesh) {
    rawCount = input.mesh.pos.length / 3; progress("Cleaning the mesh", 0.1);
    const res = time("Cleaning", () => { const r = cleanMesh(input.mesh!, p.floatingFraction); return { r, detail: `${r.removedTris.toLocaleString()} degenerate or floating triangles removed from ${r.pieces} piece(s)` }; });
    recon = res.mesh; cleaned = { pos: res.mesh.pos }; stages.push({ name: "Surface reconstruction", detail: "skipped: the input is already a mesh", ms: 0 });
  } else throw new Error("The file has no geometry.");
  progress("Smoothing", 0.55);
  const sm = time("Smoothing", () => { const maxMove = unitsOf(p.maxMoveMm, u), r = p.smoothIterations > 0 ? taubin(recon, p.smoothIterations, p.featureAngle, maxMove) : { mesh: recon, locked: 0, maxMoved: 0 }; return { r, detail: p.smoothIterations > 0 ? `Taubin λ|μ, ${p.smoothIterations} iterations, ${r.locked.toLocaleString()} edge/boundary vertices locked (sharp > ${p.featureAngle}°), no vertex may move more than ${p.maxMoveMm} mm (largest move ${kMm(r.maxMoved).toFixed(2)} mm)` : "off" }; });
  progress("Simplifying", 0.7);
  const simp = time("Simplification", () => { const r = p.keepRatio < 1 ? simplify(sm.mesh, p.keepRatio, unitsOf(p.errorMm, u)) : { mesh: sm.mesh, collapses: 0, stoppedBy: "none" as const }; return { r, detail: p.keepRatio < 1 ? `quadric edge collapse, ${r.collapses.toLocaleString()} collapses, stopped by ${r.stoppedBy === "error" ? `the ${p.errorMm} mm RMS error limit` : r.stoppedBy === "ratio" ? "the triangle target" : "nothing to collapse"}; outline vertices fixed` : "off" }; });
  const mesh = simp.mesh; progress("Validating dimensions", 0.85);
  // ---- dimensional validation (everything measured in the input's own units, reported in millimetres)
  const t0 = performance.now(), idxStart = (a: Mesh) => { const b = bbox(a.pos); return Math.max(1e-9, Math.hypot(b.size[0], b.size[1], b.size[2]) / 500); };
  const ti = new TriIndex(mesh, Math.max(idxStart(mesh), 1e-9) * 2), tiRecon = mesh === recon ? ti : null;
  const rnd = rng(7), nc = cleaned.pos.length / 3, sample = Math.min(nc, 20000), dev: number[] = [], pts = new Uint32Array(sample); const startR = Math.max(idxStart(mesh), 1e-9);
  for (let s = 0; s < sample; s++) { const i = Math.floor(rnd() * nc); pts[s] = i; dev.push(ti.closest(cleaned.pos[i * 3], cleaned.pos[i * 3 + 1], cleaned.pos[i * 3 + 2], startR).d); }
  const surface = statsOf(dev);
  // deviation introduced by smoothing and simplification alone: reconstructed vertices -> final mesh
  const pd: number[] = [], nr = recon.pos.length / 3, stepR = Math.max(1, Math.floor(nr / 15000)); for (let i = 0; i < nr; i += stepR) pd.push(ti.closest(recon.pos[i * 3], recon.pos[i * 3 + 1], recon.pos[i * 3 + 2], startR).d); const proc = statsOf(pd); void tiRecon;
  // pair distances: random pairs of cleaned points, compared with the distance between their closest surface points
  const pairs: number[] = [], rel: number[] = []; const bb = bbox(cleaned.pos), diag = Math.hypot(bb.size[0], bb.size[1], bb.size[2]);
  for (let k = 0, tries = 0; k < 300 && tries < 3000; tries++) { const a = pts[Math.floor(rnd() * sample)], b = pts[Math.floor(rnd() * sample)], d0 = Math.hypot(cleaned.pos[a * 3] - cleaned.pos[b * 3], cleaned.pos[a * 3 + 1] - cleaned.pos[b * 3 + 1], cleaned.pos[a * 3 + 2] - cleaned.pos[b * 3 + 2]); if (d0 < diag * 0.1) continue; const pa = ti.closest(cleaned.pos[a * 3], cleaned.pos[a * 3 + 1], cleaned.pos[a * 3 + 2], startR).p, pb = ti.closest(cleaned.pos[b * 3], cleaned.pos[b * 3 + 1], cleaned.pos[b * 3 + 2], startR).p; const d1 = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]); pairs.push(Math.abs(d1 - d0)); rel.push((Math.abs(d1 - d0) / d0) * 100); k++; }
  const fr = principalFrame(cleaned.pos), ext = (pos: Float64Array) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < pos.length; i += 3) { const x = pos[i] - fr.origin[0], y = pos[i + 1] - fr.origin[1], z = pos[i + 2] - fr.origin[2]; const c = [x * fr.u[0] + y * fr.u[1] + z * fr.u[2], x * fr.v[0] + y * fr.v[1] + z * fr.v[2], x * fr.n[0] + y * fr.n[1] + z * fr.n[2]]; for (let k = 0; k < 3; k++) { if (c[k] < mn[k]) mn[k] = c[k]; if (c[k] > mx[k]) mx[k] = c[k]; } } return { min: mn, size: mx.map((v, k) => v - mn[k]) }; };
  // sizes are measured along the scan's own axes (width, height, depth of the facade), not the world axes, so a tilted scan is not penalised
  const ps = statsOf(pairs), rs = statsOf(rel), after = ext(mesh.pos), before = ext(cleaned.pos);
  const dm = after.size.map((v, i) => kMm(v - before.size[i])), shift = after.min.map((v, i) => kMm(v - before.min[i]));
  const rawMesh = { pos: cleaned.pos, idx: new Uint32Array(0) }; void rawMesh;
  // per-vertex deviation of the final mesh from the cleaned points (colour map)
  const grid = new PointGrid(cleaned.pos, Math.max(startR * 2, 1e-9)); const nv = mesh.pos.length / 3, deviation = new Float32Array(nv);
  for (let i = 0; i < nv; i++) { let r = grid.cell, best = Infinity; for (let t = 0; t < 6 && best === Infinity; t++, r *= 2) grid.near(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2], r, (_j, d2) => { if (d2 < best) best = d2; }); deviation[i] = Number.isFinite(best) ? Math.sqrt(best) : 0; }
  stages.push({ name: "Validation", detail: `${sample.toLocaleString()} cleaned points compared with the surface; ${pairs.length} point pairs compared before and after`, ms: Math.round(performance.now() - t0) });
  const maxBbox = Math.max(...dm.map(Math.abs)), tol = p.toleranceMm, smoothMm = p.smoothIterations > 0 ? p.maxMoveMm : 0, guaranteed = smoothMm + (p.keepRatio < 1 ? p.errorMm : 0) + (input.cloud ? p.snapMm : 0);
  const mm4 = (s: Stats) => ({ mean: kMm(s.mean), rms: kMm(s.rms), p95: kMm(s.p95), max: kMm(s.max) });
  const report: Report = {
    input: { kind: input.cloud ? "cloud" : "mesh", points: rawCount, triangles: input.faceCount, format: input.format }, stages,
    counts: { rawPoints: rawCount, cleanedPoints: cleaned.pos.length / 3, reconTriangles: recon.idx.length / 3, smoothedTriangles: sm.mesh.idx.length / 3, finalTriangles: mesh.idx.length / 3, finalVertices: mesh.pos.length / 3 },
    accuracy: { tolMm: tol, bboxBefore: before.size.map(kMm), bboxAfter: after.size.map(kMm), bboxDeltaMm: dm, maxBboxDeltaMm: maxBbox, originShiftMm: shift, surfaceDev: surface, surfaceDevMm: mm4(surface), processDevMm: mm4(proc), guaranteedMaxMm: smoothMm + (input.cloud ? p.snapMm : 0),
      pairs: { n: pairs.length, maxAbsMm: kMm(ps.max), meanAbsMm: kMm(ps.mean), maxRelPercent: rs.max, meanRelPercent: rs.mean }, areaBefore: 0, areaAfter: meshArea(mesh), pass: { dimensions: maxBbox <= tol, surface: kMm(surface.p95) <= tol, process: kMm(proc.p95) <= tol } }, notes,
  };
  if (!input.cloud) notes.push("Mesh input: cleaning, smoothing and simplification were applied; no surface reconstruction was needed.");
  notes.push("Deviation figures include the scan's own noise: they compare the result with the cleaned points, not with the real building. Only a measured reference can confirm absolute accuracy.");
  progress("Done", 1);
  return { cleaned, recon, mesh, deviation, report };
}
const m_isThin = (m: Mesh) => m.idx.length / 3 < 50;
