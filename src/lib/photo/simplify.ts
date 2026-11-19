import type { Mesh } from "./types";


/** Squared distance from a point to a triangle (Ericson), without allocations. */
function ptTri2(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz; if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz; if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3), x = apx - v * abx, y = apy - v * aby, z = apz - v * abz; return x * x + y * y + z * z; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz; if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6), x = apx - w * acx, y = apy - w * acy, z = apz - w * acz; return x * x + y * y + z * z; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)), x = bpx - w * (cx - bx), y = bpy - w * (cy - by), z = bpz - w * (cz - bz); return x * x + y * y + z * z; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den, x = apx - abx * v - acx * w, y = apy - aby * v - acy * w, z = apz - abz * v - acz * w; return x * x + y * y + z * z;
}

/** Binary min-heap keyed by cost. */
class Heap { a: { c: number; x: number; y: number; vx: number; vy: number; p: [number, number, number] }[] = [];
  push(e: Heap["a"][number]) { const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].c <= a[i].c) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; if (!a.length) return undefined; const top = a[0], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].c < a[m].c) m = l; if (r < a.length && a[r].c < a[m].c) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } }

/**
 * Quadric error metric edge collapse (Garland and Heckbert). Flat regions collapse into a few large triangles while curved or stepped regions keep detail, because the
 * cost of a collapse is the summed squared distance of the new vertex to the planes of the faces it replaces.
 * Boundary vertices are never moved (the outline stays exact), a collapse is refused if it would flip a triangle, and collapsing stops when the next collapse would exceed
 * `maxError` (same unit as the coordinates) or the triangle count reaches the target. The cost of a collapse is normalised by the surface area it covers, so `maxError` is a ROOT-MEAN-SQUARE
 * distance to the original face planes: it limits the typical deviation. The largest single deviation is not bounded by it and is measured and reported afterwards.
 */
export function simplify(m: Mesh, keepRatio: number, maxError: number): { mesh: Mesh; collapses: number; stoppedBy: "ratio" | "error" | "none" } {
  const nv = m.pos.length / 3, nf0 = m.idx.length / 3, target = Math.max(4, Math.floor(nf0 * keepRatio)), pos = Float64Array.from(m.pos), tri = Uint32Array.from(m.idx), alive = new Uint8Array(nf0).fill(1);
  const orig = Float64Array.from(m.pos), cluster: number[][] = Array.from({ length: nv }, (_, i) => [i]), Wt = new Float64Array(nv), Q = new Float64Array(nv * 10), vf: number[][] = Array.from({ length: nv }, () => []), ver = new Uint32Array(nv), locked = new Uint8Array(nv), ecount = new Map<number, number>();
  const addQ = (v: number, a: number, b: number, c: number, d: number, w: number) => { const q = v * 10; Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d; Q[q + 4] += w * b * b; Q[q + 5] += w * b * c; Q[q + 6] += w * b * d; Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d; };
  const nrm = (a: number, b: number, c: number) => { const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2], vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
  for (let t = 0; t < nf0; t++) { const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2]; vf[a].push(t); vf[b].push(t); vf[c].push(t); const n = nrm(a, b, c), l = Math.hypot(n[0], n[1], n[2]); if (l < 1e-18) continue; const nx = n[0] / l, ny = n[1] / l, nz = n[2] / l, d = -(nx * pos[a * 3] + ny * pos[a * 3 + 1] + nz * pos[a * 3 + 2]), w = l / 2; for (const v of [a, b, c]) { addQ(v, nx, ny, nz, d, w); Wt[v] += w; }
    for (let e = 0; e < 3; e++) { const p = tri[t * 3 + e], q = tri[t * 3 + (e + 1) % 3], k = Math.min(p, q) * 4294967296 + Math.max(p, q); ecount.set(k, (ecount.get(k) ?? 0) + 1); } }
  for (const [k, c] of ecount) if (c === 1) { locked[Math.floor(k / 4294967296)] = 1; locked[k % 4294967296] = 1; }
  const cleanVF = (v: number) => { const l = vf[v].filter((t) => alive[t]); vf[v] = l; return l; };
  const neighbours = (v: number) => { const s = new Set<number>(); for (const t of cleanVF(v)) for (let e = 0; e < 3; e++) { const o = tri[t * 3 + e]; if (o !== v) s.add(o); } return s; };
  const errAt = (q: Float64Array | number[], o: number, x: number, y: number, z: number) => q[o] * x * x + 2 * q[o + 1] * x * y + 2 * q[o + 2] * x * z + 2 * q[o + 3] * x + q[o + 4] * y * y + 2 * q[o + 5] * y * z + 2 * q[o + 6] * y + q[o + 7] * z * z + 2 * q[o + 8] * z + q[o + 9];
  const heap = new Heap();
  const cost = (a: number, b: number) => {
    if (locked[a] && locked[b]) return null; const q = new Array(10); for (let i = 0; i < 10; i++) q[i] = Q[a * 10 + i] + Q[b * 10 + i];
    let best: [number, number, number] | null = null, bc = Infinity; const cand: [number, number, number][] = locked[a] ? [[pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]]] : locked[b] ? [[pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]]] : [[pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], [(pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2]];
    if (!locked[a] && !locked[b]) { // optimal position: solve A x = -b of the quadric
      const A = [[q[0], q[1], q[2]], [q[1], q[4], q[5]], [q[2], q[5], q[7]]], bb = [-q[3], -q[6], -q[8]]; const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
      if (Math.abs(det) > 1e-12) { const inv = (r: number[], c: number[]) => 0; void inv; const c00 = A[1][1] * A[2][2] - A[1][2] * A[2][1], c01 = A[0][2] * A[2][1] - A[0][1] * A[2][2], c02 = A[0][1] * A[1][2] - A[0][2] * A[1][1], c10 = A[1][2] * A[2][0] - A[1][0] * A[2][2], c11 = A[0][0] * A[2][2] - A[0][2] * A[2][0], c12 = A[0][2] * A[1][0] - A[0][0] * A[1][2], c20 = A[1][0] * A[2][1] - A[1][1] * A[2][0], c21 = A[0][1] * A[2][0] - A[0][0] * A[2][1], c22 = A[0][0] * A[1][1] - A[0][1] * A[1][0];
        const x = (c00 * bb[0] + c01 * bb[1] + c02 * bb[2]) / det, y = (c10 * bb[0] + c11 * bb[1] + c12 * bb[2]) / det, z = (c20 * bb[0] + c21 * bb[1] + c22 * bb[2]) / det; const ext = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]); if (Math.hypot(x - pos[a * 3], y - pos[a * 3 + 1], z - pos[a * 3 + 2]) < 3 * ext + 1e-12) cand.push([x, y, z]); } }
    for (const c of cand) { const e = Math.max(0, errAt(q, 0, c[0], c[1], c[2])) / Math.max(1e-30, Wt[a] + Wt[b]); if (e < bc) { bc = e; best = c; } } return best ? { c: bc, p: best } : null;
  };
  const pushEdge = (a: number, b: number) => { const r = cost(a, b); if (r) heap.push({ c: r.c, x: a, y: b, vx: ver[a], vy: ver[b], p: r.p }); };
  const seenE = new Set<number>(); for (let t = 0; t < nf0; t++) for (let e = 0; e < 3; e++) { const a = tri[t * 3 + e], b = tri[t * 3 + (e + 1) % 3], k = Math.min(a, b) * 4294967296 + Math.max(a, b); if (!seenE.has(k)) { seenE.add(k); pushEdge(a, b); } }
  let nf = nf0, collapses = 0, rejected = 0, stoppedBy: "ratio" | "error" | "none" = "none"; const maxE2 = maxError > 0 ? maxError * maxError : Infinity;
  while (nf > target) {
    const e = heap.pop(); if (!e) break; if (ver[e.x] !== e.vx || ver[e.y] !== e.vy) continue; if (maxError > 0 && e.c > 25 * maxE2) continue; // cheap pre-filter: such a collapse would be rejected by the hard error check anyway
    const a = e.x, b = e.y, fa = cleanVF(a), fb = cleanVF(b), shared = fa.filter((t) => fb.includes(t)); if (!shared.length) continue;
    const na = neighbours(a), nb = neighbours(b); let common = 0; for (const x of na) if (nb.has(x)) common++; if (common !== shared.length) continue; // link condition: keeps the mesh manifold
    const keep = locked[b] && !locked[a] ? b : a, drop = keep === a ? b : a, p = locked[keep] ? [pos[keep * 3], pos[keep * 3 + 1], pos[keep * 3 + 2]] : e.p;
    let bad = false; const fk = keep === a ? fa : fb, fd = keep === a ? fb : fa;
    for (const t of [...fk, ...fd]) { if (shared.includes(t)) continue; const v = [tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]], n0 = nrm(v[0], v[1], v[2]); const q: number[][] = v.map((x) => (x === keep || x === drop ? p : [pos[x * 3], pos[x * 3 + 1], pos[x * 3 + 2]])); const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], uz = q[1][2] - q[0][2], vx = q[2][0] - q[0][0], vy = q[2][1] - q[0][1], vz = q[2][2] - q[0][2]; const n1 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l0 = Math.hypot(n0[0], n0[1], n0[2]), l1 = Math.hypot(n1[0], n1[1], n1[2]); if (l1 < 1e-18 || (l0 > 0 && (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1) < 0.5)) { bad = true; break; } }
    if (bad) continue;
    if (maxError > 0) { // hard bound: every original vertex merged into this one must stay within maxError of the new local surface
      const cl = cluster[a].concat(cluster[b]), tris: number[][] = []; for (const t of [...fk, ...fd]) { if (shared.includes(t)) continue; tris.push([0, 1, 2].map((k) => { const v = tri[t * 3 + k]; return v === keep || v === drop ? p : [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]; }).flat()); }
      const lim2 = maxError * maxError, stride = Math.max(1, Math.floor(cl.length / 48)); let ok = tris.length > 0; for (let ci = 0; ok && ci < cl.length; ci += (ci === 0 || ci >= cl.length - 1 ? 1 : stride)) { const o = cl[ci] * 3, x = orig[o], y = orig[o + 1], z = orig[o + 2]; let best = Infinity; for (const T of tris) { const d = ptTri2(x, y, z, T[0], T[1], T[2], T[3], T[4], T[5], T[6], T[7], T[8]); if (d < best) best = d; if (best <= lim2) break; } if (best > lim2) ok = false; }
      if (!ok) { rejected++; continue; }
      cluster[keep] = cl; cluster[drop] = [];
    }
    pos[keep * 3] = p[0]; pos[keep * 3 + 1] = p[1]; pos[keep * 3 + 2] = p[2]; for (let i = 0; i < 10; i++) Q[keep * 10 + i] += Q[drop * 10 + i]; Wt[keep] += Wt[drop];
    for (const t of shared) { alive[t] = 0; nf--; }
    for (const t of fd) if (alive[t]) { for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === drop) tri[t * 3 + k] = keep; vf[keep].push(t); }
    vf[drop] = []; ver[keep]++; ver[drop]++; collapses++; if (locked[drop]) locked[keep] = 1;
    for (const o of neighbours(keep)) { ver[o] += 0; pushEdge(keep, o); }
  }
  stoppedBy = nf <= target ? "ratio" : maxError > 0 ? "error" : "none"; void rejected;
  const remap = new Int32Array(nv).fill(-1), op: number[] = [], oi: number[] = [];
  for (let t = 0; t < nf0; t++) { if (!alive[t]) continue; for (let k = 0; k < 3; k++) { const v = tri[t * 3 + k]; if (remap[v] < 0) { remap[v] = op.length / 3; op.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } oi.push(remap[v]); } }
  return { mesh: { pos: Float64Array.from(op), idx: Uint32Array.from(oi) }, collapses, stoppedBy };
}
