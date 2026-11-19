import type { Mesh } from "./types";

/** Eigen-decomposition of a symmetric 3x3 matrix (Jacobi); returns eigenvalues ascending with matching unit eigenvectors. */
export function eig3(m: number[][]): { values: number[]; vectors: number[][] } {
  const a = m.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) {
    let p = 0, q = 1, mx = Math.abs(a[0][1]); if (Math.abs(a[0][2]) > mx) { p = 0; q = 2; mx = Math.abs(a[0][2]); } if (Math.abs(a[1][2]) > mx) { p = 1; q = 2; mx = Math.abs(a[1][2]); } if (mx < 1e-14) break;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
  }
  const ord = [0, 1, 2].sort((x, y) => a[x][x] - a[y][y]); return { values: ord.map((i) => a[i][i]), vectors: ord.map((i) => [v[0][i], v[1][i], v[2][i]]) };
}
export interface Frame { origin: [number, number, number]; u: number[]; v: number[]; n: number[] }
/** Principal frame of a point set: n = direction of least spread (the surface normal of a facade); u and v span the surface and are then rotated about n to the orientation whose bounding rectangle has the smallest area, so a rectangular facade gets axis-aligned u and v even when uneven density or holes tilt the raw principal axes. */
export function principalFrame(pos: Float64Array): Frame {
  const n = pos.length / 3, stride = Math.max(1, Math.floor(n / 60000)); let c = [0, 0, 0]; let nrm = [0, 0, 1], u = [1, 0, 0], v = [0, 1, 0]; let sel: number[] = []; for (let i = 0; i < n; i += stride) sel.push(i);
  // robust plane fit: PCA, then repeat on the points close to the dominant plane only, so recesses, cornices and outliers do not tilt the normal
  for (let iter = 0; iter < 5; iter++) {
    c = [0, 0, 0]; for (const i of sel) for (let k = 0; k < 3; k++) c[k] += pos[i * 3 + k]; for (let k = 0; k < 3; k++) c[k] /= sel.length;
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const i of sel) { const d = [pos[i * 3] - c[0], pos[i * 3 + 1] - c[1], pos[i * 3 + 2] - c[2]]; for (let r = 0; r < 3; r++) for (let q = r; q < 3; q++) m[r][q] += d[r] * d[q]; }
    for (let r = 0; r < 3; r++) for (let q = 0; q < r; q++) m[r][q] = m[q][r]; const e = eig3(m); nrm = e.vectors[0]; v = e.vectors[1]; u = e.vectors[2];
    if (iter === 4) break; const all: number[] = [], dep: number[] = []; for (let i = 0; i < n; i += stride) { all.push(i); dep.push((pos[i * 3] - c[0]) * nrm[0] + (pos[i * 3 + 1] - c[1]) * nrm[1] + (pos[i * 3 + 2] - c[2]) * nrm[2]); }
    const sd = dep.slice().sort((a, b) => a - b), med = sd[sd.length >> 1], mad = dep.map((d) => Math.abs(d - med)).sort((a, b) => a - b)[dep.length >> 1] * 1.4826 + 1e-12, lim = Math.max(2.5 * mad, 1e-9);
    sel = all.filter((_, j) => Math.abs(dep[j] - med) <= lim); if (sel.length < 100) { sel = all; break; }
  }
  // centre on all points so the frame origin lies in the middle of the scan
  c = [0, 0, 0]; for (let i = 0; i < n; i += stride) for (let k = 0; k < 3; k++) c[k] += pos[i * 3 + k]; const cnt = Math.ceil(n / stride); for (let k = 0; k < 3; k++) c[k] /= cnt;
  const step = Math.max(1, Math.floor(n / 60000)), sx: number[] = [], sy: number[] = [];
  for (let i = 0; i < n; i += step) { const x = pos[i * 3] - c[0], y = pos[i * 3 + 1] - c[1], z = pos[i * 3 + 2] - c[2]; sx.push(x * u[0] + y * u[1] + z * u[2]); sy.push(x * v[0] + y * v[1] + z * v[2]); }
  const area = (th: number) => { const co = Math.cos(th), si = Math.sin(th); const a: number[] = [], b: number[] = []; for (let i = 0; i < sx.length; i++) { a.push(sx[i] * co + sy[i] * si); b.push(-sx[i] * si + sy[i] * co); } a.sort((p, q) => p - q); b.sort((p, q) => p - q); const k = a.length; return (a[Math.floor(k * 0.9995)] - a[Math.floor(k * 0.0005)]) * (b[Math.floor(k * 0.9995)] - b[Math.floor(k * 0.0005)]); };
  let best = 0, ba = area(0); for (let d = -45; d <= 45; d += 0.5) { const a = area((d * Math.PI) / 180); if (a < ba) { ba = a; best = d; } } for (let d = best - 0.5; d <= best + 0.5; d += 0.02) { const a = area((d * Math.PI) / 180); if (a < ba) { ba = a; best = d; } }
  const th = (best * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th); const u2 = [0, 1, 2].map((k) => u[k] * co + v[k] * si), v2 = [0, 1, 2].map((k) => -u[k] * si + v[k] * co); u = u2; v = v2;
  // Snap to the world axes when the fitted frame is within 2 degrees of them (typical for upright facade scans), so the grid, the outline and the world bounding box line up exactly
  const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], near = (a: number[], skip = -1) => { let bi = -1, bd = Math.cos((2 * Math.PI) / 180); for (let k = 0; k < 3; k++) { if (k === skip) continue; const d = Math.abs(a[0] * AX[k][0] + a[1] * AX[k][1] + a[2] * AX[k][2]); if (d > bd) { bd = d; bi = k; } } return bi; };
  const kn = near(nrm), ku = kn >= 0 ? near(u, kn) : -1;
  if (kn >= 0 && ku >= 0) { const sn = Math.sign(nrm[0] * AX[kn][0] + nrm[1] * AX[kn][1] + nrm[2] * AX[kn][2]) || 1, su = Math.sign(u[0] * AX[ku][0] + u[1] * AX[ku][1] + u[2] * AX[ku][2]) || 1; const n2 = AX[kn].map((x) => x * sn), u2 = AX[ku].map((x) => x * su); return { origin: c as [number, number, number], n: n2, u: u2, v: [n2[1] * u2[2] - n2[2] * u2[1], n2[2] * u2[0] - n2[0] * u2[2], n2[0] * u2[1] - n2[1] * u2[0]] }; }
  return { origin: c as [number, number, number], n: nrm, v, u };
}
/** Cell size that gives about `perCell` points per cell on the scan's dominant surface (never finer than 1.5x the nearest-neighbour spacing). */
export function suggestCell(pos: Float64Array, perCell: number, spacing: number): number {
  const f = principalFrame(pos), n = pos.length / 3, U = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) { const x = pos[i * 3] - f.origin[0], y = pos[i * 3 + 1] - f.origin[1], z = pos[i * 3 + 2] - f.origin[2]; U[i] = x * f.u[0] + y * f.u[1] + z * f.u[2]; V[i] = x * f.v[0] + y * f.v[1] + z * f.v[2]; }
  const span = (a: Float64Array) => { const s = Float64Array.from(a).sort(); return s[Math.floor(n * 0.995)] - s[Math.floor(n * 0.005)]; };
  return Math.max(spacing * 1.5, Math.sqrt((perCell * span(U) * span(V)) / n));
}
export interface Height { frame: Frame; nu: number; nv: number; cu: number; cv: number; cell: number; u0: number; v0: number; depth: Float32Array; state: Uint8Array /* 0 empty, 1 measured, 2 filled */; snapped: number; filled: number; measured: number; modeDepth: number }
/**
 * Height-field reconstruction for facade-like scans: points are binned into square cells in the surface plane, each cell takes the MEDIAN depth of its points (robust to noise),
 * small gaps (up to `fillIter` cells) are filled by neighbour interpolation, and larger holes are left open (missing geometry is never invented).
 * Optional planar snap: cells within `snapTol` (same unit as the coordinates) of the dominant wall plane are set exactly onto it; deeper or proud features (windows, cornices) are untouched, and no cell moves more than snapTol.
 */
export function heightField(pos: Float64Array, cell: number, fillIter: number, snapTol: number): Height {
  const f = principalFrame(pos), n = pos.length / 3, U = new Float64Array(n), V = new Float64Array(n), D = new Float64Array(n);
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = pos[i * 3] - f.origin[0], y = pos[i * 3 + 1] - f.origin[1], z = pos[i * 3 + 2] - f.origin[2]; const u = x * f.u[0] + y * f.u[1] + z * f.u[2], v = x * f.v[0] + y * f.v[1] + z * f.v[2], d = x * f.n[0] + y * f.n[1] + z * f.n[2]; U[i] = u; V[i] = v; D[i] = d; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  // vertices sit at u0 + x*cu where cu is chosen so the first and last vertex fall exactly on the data extents (the outline keeps the scanned size); each vertex owns the points within half a cell of it
  const nu = Math.max(2, Math.round((u1 - u0) / cell) + 1), nv = Math.max(2, Math.round((v1 - v0) / cell) + 1), cu = (u1 - u0) / (nu - 1) || cell, cv = (v1 - v0) / (nv - 1) || cell, cells = nu * nv, count = new Uint32Array(cells + 1);
  const cid = new Uint32Array(n); for (let i = 0; i < n; i++) { const c = Math.min(nv - 1, Math.max(0, Math.round((V[i] - v0) / cv))) * nu + Math.min(nu - 1, Math.max(0, Math.round((U[i] - u0) / cu))); cid[i] = c; count[c + 1]++; }
  for (let c = 0; c < cells; c++) count[c + 1] += count[c]; const fillp = count.slice(0, cells), sorted = new Float64Array(n); for (let i = 0; i < n; i++) sorted[fillp[cid[i]]++] = D[i];
  const depth = new Float32Array(cells), state = new Uint8Array(cells); let measured = 0;
  for (let c = 0; c < cells; c++) { const a = count[c], b = count[c + 1]; if (b - a < 2) continue; const s = Array.from(sorted.subarray(a, b)).sort((x, y) => x - y); depth[c] = s.length % 2 ? s[(s.length - 1) >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; state[c] = 1; measured++; }
  let filled = 0;
  for (let it = 0; it < fillIter; it++) { const add: [number, number][] = []; for (let y = 0; y < nv; y++) for (let x = 0; x < nu; x++) { const c = y * nu + x; if (state[c]) continue; let s = 0, k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= nu || yy >= nv) continue; const q = yy * nu + xx; if (state[q]) { s += depth[q]; k++; } } if (k >= 4) add.push([c, s / k]); } for (const [c, d] of add) { depth[c] = d; state[c] = 2; filled++; } }
  // dominant wall plane = mode of the measured depths (histogram, bin = snapTol or cell)
  let snapped = 0, mode = 0; const bin = Math.max(snapTol > 0 ? snapTol : cell * 0.5, 1e-9), hist = new Map<number, number>(); for (let c = 0; c < cells; c++) if (state[c] === 1) { const b = Math.round(depth[c] / bin); hist.set(b, (hist.get(b) ?? 0) + 1); } let best = -1; for (const [b, k] of hist) if (k > best) { best = k; mode = b * bin; }
  if (snapTol > 0) { // refine the mode as the mean of the cells inside the tolerance
    let s = 0, k = 0; for (let c = 0; c < cells; c++) if (state[c] === 1 && Math.abs(depth[c] - mode) <= snapTol) { s += depth[c]; k++; } if (k) mode = s / k;
    for (let c = 0; c < cells; c++) if (state[c] && Math.abs(depth[c] - mode) <= snapTol) { depth[c] = mode; snapped++; } }
  return { frame: f, nu, nv, cu, cv, cell, u0, v0, depth, state, snapped, filled, measured, modeDepth: mode };
}
/** Triangulates the filled cells of a height field (two triangles per 2x2 block of filled cells) and returns world-space vertices (original coordinates and units). */
export function heightMesh(h: Height): Mesh {
  const { nu, nv, cu, cv, u0, v0, depth, state, frame: f } = h, vid = new Int32Array(nu * nv).fill(-1), pos: number[] = [], idx: number[] = [];
  const vtx = (x: number, y: number) => { const c = y * nu + x; if (vid[c] >= 0) return vid[c]; const u = u0 + x * cu, v = v0 + y * cv, d = depth[c]; vid[c] = pos.length / 3; pos.push(f.origin[0] + u * f.u[0] + v * f.v[0] + d * f.n[0], f.origin[1] + u * f.u[1] + v * f.v[1] + d * f.n[1], f.origin[2] + u * f.u[2] + v * f.v[2] + d * f.n[2]); return vid[c]; };
  for (let y = 0; y + 1 < nv; y++) for (let x = 0; x + 1 < nu; x++) { const a = y * nu + x, b = a + 1, c = a + nu, d = c + 1; if (!(state[a] && state[b] && state[c] && state[d])) continue; const A = vtx(x, y), B = vtx(x + 1, y), C = vtx(x, y + 1), D = vtx(x + 1, y + 1); const flip = (x + y) & 1; if (flip) idx.push(A, B, D, A, D, C); else idx.push(A, B, C, B, D, C); }
  // consistent outward orientation: normals should agree with the frame normal
  const p = Float64Array.from(pos), t = Uint32Array.from(idx); let agree = 0; for (let i = 0; i < t.length; i += 3) { const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3; const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]; agree += (uy * vz - uz * vy) * f.n[0] + (uz * vx - ux * vz) * f.n[1] + (ux * vy - uy * vx) * f.n[2] > 0 ? 1 : -1; }
  if (agree < 0) for (let i = 0; i < t.length; i += 3) { const x = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = x; }
  return { pos: p, idx: t };
}
/** Depth of the reconstructed surface at plane position (u, v) relative to the frame origin: bilinear over filled cells, NaN where there is no surface. Used to measure features. */
export function depthAt(h: Height, u: number, v: number): number {
  const fx = (u - h.u0) / h.cu, fy = (v - h.v0) / h.cv, x = Math.floor(fx), y = Math.floor(fy); if (x < 0 || y < 0 || x + 1 >= h.nu || y + 1 >= h.nv) return NaN; const a = y * h.nu + x, ok = [a, a + 1, a + h.nu, a + h.nu + 1]; if (!ok.every((c) => h.state[c])) return NaN;
  const tx = fx - x, ty = fy - y; return (h.depth[a] * (1 - tx) + h.depth[a + 1] * tx) * (1 - ty) + (h.depth[a + h.nu] * (1 - tx) + h.depth[a + h.nu + 1] * tx) * ty;
}
