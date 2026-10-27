/** Binary glTF 2.0 writer. Model coordinates (Z up) are converted to glTF (Y up): (x, y, z) → (x, z, −y). GLB carries geometry, colours and element ids only — not BIM semantics. */
import type { MeshEl } from "./model";

export { CAT_COLOR, SYS_COLOR, colorFor } from "./colors";
import { colorFor } from "./colors";

export function writeGlb(meshes: MeshEl[], meta: Record<string, unknown> = {}): Buffer {
  const bufs: Buffer[] = []; let offset = 0; const accessors: object[] = [], views: object[] = [], gmeshes: object[] = [], nodes: object[] = []; const mats: object[] = []; const matIdx = new Map<string, number>();
  const pad = (b: Buffer) => { const n = (4 - (b.length % 4)) % 4; return n ? Buffer.concat([b, Buffer.alloc(n)]) : b; };
  for (const m of meshes) {
    if (!m.idx.length) continue; const nv = m.pos.length / 3; const P = new Float32Array(nv * 3); const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nv; i++) { const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2]; const g = [x, z, -y]; for (let k = 0; k < 3; k++) { P[i * 3 + k] = g[k]; mn[k] = Math.min(mn[k], g[k]); mx[k] = Math.max(mx[k], g[k]); } }
    const N = new Float32Array(nv * 3); for (let t = 0; t < m.idx.length; t += 3) { const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2]; const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const v of [a, b, c]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; } }
    for (let i = 0; i < nv; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
    // winding: the model uses CCW-from-outside in a Z-up right-handed frame; (x,z,-y) is a proper rotation so winding is preserved
    const I = new Uint32Array(m.idx); const pb = pad(Buffer.from(P.buffer)), nb = pad(Buffer.from(N.buffer)), ib = pad(Buffer.from(I.buffer));
    const vi = views.length; views.push({ buffer: 0, byteOffset: offset, byteLength: P.byteLength, target: 34962 }); offset += pb.length; views.push({ buffer: 0, byteOffset: offset, byteLength: N.byteLength, target: 34962 }); offset += nb.length; views.push({ buffer: 0, byteOffset: offset, byteLength: I.byteLength, target: 34963 }); offset += ib.length; bufs.push(pb, nb, ib);
    const ai = accessors.length; accessors.push({ bufferView: vi, componentType: 5126, count: nv, type: "VEC3", min: mn, max: mx }, { bufferView: vi + 1, componentType: 5126, count: nv, type: "VEC3" }, { bufferView: vi + 2, componentType: 5125, count: I.length, type: "SCALAR" });
    const col = colorFor(m); const key = col.join(","); let mi = matIdx.get(key); if (mi === undefined) { mi = mats.length; matIdx.set(key, mi); const alpha = m.cat === "window" ? 0.45 : m.cat === "space" ? 0.35 : 1; mats.push({ pbrMetallicRoughness: { baseColorFactor: [...col, alpha], metallicFactor: 0, roughnessFactor: 0.85 }, alphaMode: alpha < 1 ? "BLEND" : "OPAQUE", doubleSided: true }); }
    gmeshes.push({ name: m.id, primitives: [{ attributes: { POSITION: ai, NORMAL: ai + 1 }, indices: ai + 2, material: mi }] }); nodes.push({ name: m.id, mesh: gmeshes.length - 1, extras: { id: m.id, category: m.cat, system: m.sys ?? null, level: m.level ?? null, name: m.name } });
  }
  const json = { asset: { version: "2.0", generator: "Neo Forge BIM suite", extras: { note: "Geometry only. GLB does not preserve BIM semantics; use the IFC export for that.", ...meta } }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gmeshes, materials: mats, accessors, bufferViews: views, buffers: [{ byteLength: offset }] };
  let js = Buffer.from(JSON.stringify(json), "utf8"); const jp = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]); const bin = Buffer.concat(bufs);
  const total = 12 + 8 + js.length + 8 + bin.length; const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const j8 = Buffer.alloc(8); j8.writeUInt32LE(js.length, 0); j8.writeUInt32LE(0x4e4f534a, 4); const b8 = Buffer.alloc(8); b8.writeUInt32LE(bin.length, 0); b8.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, j8, js, b8, bin]);
}
