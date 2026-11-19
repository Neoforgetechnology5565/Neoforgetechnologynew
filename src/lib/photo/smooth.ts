import type { Mesh } from "./types";

export interface Adj { start: Uint32Array; list: Uint32Array }
export function buildAdj(nv: number, idx: Uint32Array): Adj {
  const deg = new Uint32Array(nv + 1); const seen = new Set<number>(); const pairs: number[] = [];
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3], lo = Math.min(a, b), hi = Math.max(a, b), k = lo * 4294967296 + hi; if (seen.has(k)) continue; seen.add(k); pairs.push(a, b); deg[a + 1]++; deg[b + 1]++; }
  for (let i = 0; i < nv; i++) deg[i + 1] += deg[i]; const fill = deg.slice(0, nv), list = new Uint32Array(deg[nv]); for (let p = 0; p < pairs.length; p += 2) { list[fill[pairs[p]]++] = pairs[p + 1]; list[fill[pairs[p + 1]]++] = pairs[p]; } return { start: deg, list };
}
/** Vertices that must not move: boundary vertices (edges with one face) and vertices on a sharp edge (dihedral angle above `angleDeg`). */
export function lockedVertices(m: Mesh, angleDeg: number): Uint8Array {
  const nv = m.pos.length / 3, locked = new Uint8Array(nv), edges = new Map<number, number[]>(), p = m.pos, nrm: number[] = [];
  for (let t = 0; t < m.idx.length; t += 3) { const a = m.idx[t] * 3, b = m.idx[t + 1] * 3, c = m.idx[t + 2] * 3, ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]; const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1; nrm.push(x / l, y / l, z / l); }
  for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = m.idx[t + e], b = m.idx[t + (e + 1) % 3], k = Math.min(a, b) * 4294967296 + Math.max(a, b); const l = edges.get(k); if (l) l.push(t / 3); else edges.set(k, [t / 3]); }
  const cosT = Math.cos((angleDeg * Math.PI) / 180);
  for (const [k, fs] of edges) { const a = Math.floor(k / 4294967296), b = k % 4294967296; if (fs.length !== 2) { locked[a] = 1; locked[b] = 1; continue; } const f0 = fs[0] * 3, f1 = fs[1] * 3; if (nrm[f0] * nrm[f1] + nrm[f0 + 1] * nrm[f1 + 1] + nrm[f0 + 2] * nrm[f1 + 2] < cosT) { locked[a] = 1; locked[b] = 1; } }
  return locked;
}
/**
 * Taubin smoothing (alternating shrink step lambda and inflate step mu, so the surface does not shrink like plain Laplacian smoothing),
 * with locked boundary and sharp-edge vertices and a hard limit: no vertex ever ends up more than `maxMove` from where it started.
 */
export function taubin(m: Mesh, iterations: number, angleDeg: number, maxMove: number): { mesh: Mesh; locked: number; maxMoved: number } {
  const nv = m.pos.length / 3, adj = buildAdj(nv, m.idx), locked = lockedVertices(m, angleDeg), orig = m.pos, cur = Float64Array.from(m.pos), tmp = new Float64Array(cur.length), lam = 0.5, mu = -0.53;
  const step = (w: number) => { for (let i = 0; i < nv; i++) { const s = adj.start[i], e = adj.start[i + 1]; if (locked[i] || e === s) { tmp[i * 3] = cur[i * 3]; tmp[i * 3 + 1] = cur[i * 3 + 1]; tmp[i * 3 + 2] = cur[i * 3 + 2]; continue; } let x = 0, y = 0, z = 0; for (let j = s; j < e; j++) { const q = adj.list[j] * 3; x += cur[q]; y += cur[q + 1]; z += cur[q + 2]; } const k = e - s; tmp[i * 3] = cur[i * 3] + w * (x / k - cur[i * 3]); tmp[i * 3 + 1] = cur[i * 3 + 1] + w * (y / k - cur[i * 3 + 1]); tmp[i * 3 + 2] = cur[i * 3 + 2] + w * (z / k - cur[i * 3 + 2]); } cur.set(tmp); };
  for (let it = 0; it < iterations; it++) { step(lam); step(mu); }
  let maxMoved = 0; for (let i = 0; i < nv; i++) { let dx = cur[i * 3] - orig[i * 3], dy = cur[i * 3 + 1] - orig[i * 3 + 1], dz = cur[i * 3 + 2] - orig[i * 3 + 2]; const d = Math.hypot(dx, dy, dz); if (maxMove > 0 && d > maxMove) { const s = maxMove / d; cur[i * 3] = orig[i * 3] + dx * s; cur[i * 3 + 1] = orig[i * 3 + 1] + dy * s; cur[i * 3 + 2] = orig[i * 3 + 2] + dz * s; maxMoved = Math.max(maxMoved, maxMove); } else maxMoved = Math.max(maxMoved, d); }
  let nl = 0; for (let i = 0; i < nv; i++) nl += locked[i]; return { mesh: { pos: cur, idx: m.idx, colors: m.colors }, locked: nl, maxMoved };
}
