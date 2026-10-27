/** Wavefront OBJ import for an existing foot scan. Parses real geometry and measures it; it does not reconstruct anything. */
export const MESH_LIMITS = { maxBytes: 12 * 1024 * 1024, maxVertices: 400_000, maxFaces: 800_000 };
export type MeshUnit = "mm" | "cm" | "m";
export interface MeshData { positions: Float32Array; indices: Uint32Array; vertexCount: number; faceCount: number }
export interface MeshMeasurement { lengthMm: number; widthMm: number; heightMm: number; axes: number[][]; centre: number[]; unit: MeshUnit; vertexCount: number; faceCount: number; notes: string[] }

export function parseObj(text: string): MeshData {
  const pos: number[] = [], idx: number[] = []; let faces = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === "#") continue;
    if (line.startsWith("v ")) { const p = line.split(/\s+/); const x = +p[1], y = +p[2], z = +p[3]; if (![x, y, z].every(Number.isFinite)) throw new Error("The OBJ file contains an invalid vertex."); pos.push(x, y, z); if (pos.length / 3 > MESH_LIMITS.maxVertices) throw new Error(`The mesh has more than ${MESH_LIMITS.maxVertices.toLocaleString()} vertices, which is over the limit.`); }
    else if (line.startsWith("f ")) { const refs = line.split(/\s+/).slice(1).map((t) => { const n = parseInt(t.split("/")[0], 10); return n < 0 ? pos.length / 3 + n : n - 1; }); for (let i = 1; i + 1 < refs.length; i++) { idx.push(refs[0], refs[i], refs[i + 1]); faces++; } if (faces > MESH_LIMITS.maxFaces) throw new Error("The mesh has too many faces."); }
  }
  const vc = pos.length / 3; if (vc < 100 || faces < 50) throw new Error("The OBJ file has too little geometry to be a foot scan.");
  for (const i of idx) if (!(i >= 0 && i < vc)) throw new Error("The OBJ file references a vertex that does not exist.");
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), vertexCount: vc, faceCount: faces };
}

/** Principal-axis extents. Length is along the axis of largest spread; width and height follow. Units are user-declared, never guessed. */
export function measureMesh(m: MeshData, unit: MeshUnit): MeshMeasurement {
  const k = unit === "mm" ? 1 : unit === "cm" ? 10 : 1000; const n = m.vertexCount; const c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += m.positions[i * 3 + a]; c.forEach((_, a) => (c[a] /= n));
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < n; i++) { const d = [0, 1, 2].map((a) => m.positions[i * 3 + a] - c[a]); for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) C[r][q] += d[r] * d[q]; }
  const axes = jacobi(C); const ext = axes.map(() => ({ lo: Infinity, hi: -Infinity }));
  for (let i = 0; i < n; i++) { const d = [0, 1, 2].map((a) => m.positions[i * 3 + a] - c[a]); axes.forEach((ax, j) => { const t = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]; if (t < ext[j].lo) ext[j].lo = t; if (t > ext[j].hi) ext[j].hi = t; }); }
  const e = ext.map((x) => (x.hi - x.lo) * k); const notes = [`Units were declared as ${unit}; the file itself does not record units, so confirm them against a known dimension.`, "Extents are along the principal axes of the vertex cloud and include the ankle/leg if the scan has one, so trim the mesh to the foot before measuring."];
  if (e[0] < 150 || e[0] > 400) notes.push(`The longest extent is ${Math.round(e[0])} mm, outside the usual adult foot range. The unit setting may be wrong or the scan may include more than a foot.`);
  return { lengthMm: Math.round(e[0] * 10) / 10, widthMm: Math.round(e[1] * 10) / 10, heightMm: Math.round(e[2] * 10) / 10, axes, centre: c, unit, vertexCount: n, faceCount: m.faceCount, notes };
}
function jacobi(A: number[][]): number[][] {
  const a = A.map((r) => [...r]); let V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) { let p = 0, q = 1, mx = Math.abs(a[0][1]); if (Math.abs(a[0][2]) > mx) { p = 0; q = 2; mx = Math.abs(a[0][2]); } if (Math.abs(a[1][2]) > mx) { p = 1; q = 2; mx = Math.abs(a[1][2]); } if (mx < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]); const cs = Math.cos(th), sn = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = cs * akp - sn * akq; a[k][q] = sn * akp + cs * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = cs * apk - sn * aqk; a[q][k] = sn * apk + cs * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = cs * vkp - sn * vkq; V[k][q] = sn * vkp + cs * vkq; } }
  const vals = [a[0][0], a[1][1], a[2][2]]; const order = [0, 1, 2].sort((i, j) => vals[j] - vals[i]); return order.map((i) => [V[0][i], V[1][i], V[2][i]]);
}
