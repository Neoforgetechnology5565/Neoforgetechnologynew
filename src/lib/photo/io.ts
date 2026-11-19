import type { Cloud, Mesh, Parsed, Unit } from "./types";
import { UNIT_PER_M } from "./types";

/* ───────── PLY (ascii, binary little/big endian) and OBJ readers ───────── */
const SIZES: Record<string, number> = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
type Prop = { name: string; type: string; list?: { count: string; item: string } };
function read(dv: DataView, o: number, t: string, le: boolean): number {
  switch (t) { case "char": case "int8": return dv.getInt8(o); case "uchar": case "uint8": return dv.getUint8(o); case "short": case "int16": return dv.getInt16(o, le); case "ushort": case "uint16": return dv.getUint16(o, le);
    case "int": case "int32": return dv.getInt32(o, le); case "uint": case "uint32": return dv.getUint32(o, le); case "float": case "float32": return dv.getFloat32(o, le); case "double": case "float64": return dv.getFloat64(o, le); }
  throw new Error(`Unsupported PLY property type "${t}".`);
}
export function parsePLY(buf: ArrayBuffer): Parsed {
  const u8 = new Uint8Array(buf); let end = -1;
  for (let i = 0; i < Math.min(u8.length, 20000); i++) if (u8[i] === 0x65 && String.fromCharCode(...u8.subarray(i, i + 10)) === "end_header") { end = i + 10; while (u8[end] === 0x0d || u8[end] === 0x0a) { if (u8[end] === 0x0a) { end++; break; } end++; } break; }
  if (end < 0) throw new Error("This is not a valid PLY file (no end_header).");
  const head = new TextDecoder().decode(u8.subarray(0, end)).split(/\r?\n/).map((l) => l.trim());
  if (head[0] !== "ply") throw new Error("This is not a PLY file.");
  let fmt = "", els: { name: string; n: number; props: Prop[] }[] = [];
  for (const l of head.slice(1)) { const p = l.split(/\s+/); if (p[0] === "format") fmt = p[1]; else if (p[0] === "element") els.push({ name: p[1], n: Number(p[2]), props: [] }); else if (p[0] === "property" && els.length) { if (p[1] === "list") els[els.length - 1].props.push({ name: p[4], type: p[3], list: { count: p[2], item: p[3] } }); else els[els.length - 1].props.push({ name: p[2], type: p[1] }); } }
  if (!["ascii", "binary_little_endian", "binary_big_endian"].includes(fmt)) throw new Error(`Unsupported PLY format "${fmt}".`);
  const vel = els.find((e) => e.name === "vertex"); if (!vel || !vel.n) throw new Error("The PLY file has no vertices.");
  const fel = els.find((e) => e.name === "face"); const names = vel.props.map((p) => p.name);
  if (!["x", "y", "z"].every((k) => names.includes(k))) throw new Error("The PLY vertices have no x, y, z.");
  const pos = new Float64Array(vel.n * 3), hasCol = ["red", "green", "blue"].every((k) => names.includes(k)), hasN = ["nx", "ny", "nz"].every((k) => names.includes(k));
  const col = hasCol ? new Uint8Array(vel.n * 3) : undefined, nor = hasN ? new Float64Array(vel.n * 3) : undefined, tris: number[] = [];
  const slot: Record<string, number> = { x: 0, y: 1, z: 2 }; const cslot: Record<string, number> = { red: 0, green: 1, blue: 2 }, nslot: Record<string, number> = { nx: 0, ny: 1, nz: 2 };
  const put = (i: number, name: string, v: number) => { if (name in slot) pos[i * 3 + slot[name]] = v; else if (col && name in cslot) col[i * 3 + cslot[name]] = v; else if (nor && name in nslot) nor[i * 3 + nslot[name]] = v; };
  const addFace = (f: number[]) => { for (let k = 1; k + 1 < f.length; k++) tris.push(f[0], f[k], f[k + 1]); };
  if (fmt === "ascii") {
    const lines = new TextDecoder().decode(u8.subarray(end)).split(/\r?\n/); let li = 0;
    for (const el of els) for (let i = 0; i < el.n; i++) {
      const t = (lines[li++] || "").trim().split(/\s+/);
      if (el === vel) { let k = 0; for (const p of el.props) { const v = Number(t[k++]); if (p.list) { k += v; continue; } put(i, p.name, v); } }
      else if (el === fel) { let k = 0; for (const p of el.props) { if (p.list) { const c = Number(t[k++]); const f: number[] = []; for (let j = 0; j < c; j++) f.push(Number(t[k++])); if (/vertex_ind/.test(p.name)) addFace(f); } else k++; } }
    }
  } else {
    const dv = new DataView(buf), le = fmt === "binary_little_endian"; let o = end;
    for (const el of els) for (let i = 0; i < el.n; i++) for (const p of el.props) {
      if (p.list) { const c = read(dv, o, p.list.count, le); o += SIZES[p.list.count]; const f: number[] = []; for (let j = 0; j < c; j++) { f.push(read(dv, o, p.list.item, le)); o += SIZES[p.list.item]; } if (el === fel && /vertex_ind/.test(p.name)) addFace(f); }
      else { const v = read(dv, o, p.type, le); o += SIZES[p.type]; if (el === vel) put(i, p.name, v); }
    }
  }
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error("The file contains invalid (NaN or infinite) coordinates.");
  const notes: string[] = []; const faces = tris.length / 3;
  if (faces && tris.some((v) => v >= vel.n || v < 0)) throw new Error("The PLY faces refer to vertices that do not exist.");
  return { cloud: faces ? null : { pos, colors: col, normals: nor }, mesh: faces ? { pos, idx: Uint32Array.from(tris), colors: col } : null, format: `PLY ${fmt.replace("binary_", "binary ").replace("_endian", "")}`, vertexCount: vel.n, faceCount: faces, notes };
}
export function parseOBJ(text: string): Parsed {
  const v: number[] = [], f: number[] = [], notes: string[] = []; let nv = 0;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim(); if (l.charCodeAt(0) === 118 && l.charCodeAt(1) === 32) { const p = l.split(/\s+/); v.push(Number(p[1]), Number(p[2]), Number(p[3])); nv++; }
    else if (l.charCodeAt(0) === 102 && l.charCodeAt(1) === 32) { const ids = l.split(/\s+/).slice(1).map((s) => { const k = parseInt(s.split("/")[0], 10); return k < 0 ? nv + k : k - 1; }); for (let k = 1; k + 1 < ids.length; k++) f.push(ids[0], ids[k], ids[k + 1]); }
  }
  if (!nv) throw new Error("The OBJ file has no vertices.");
  if (v.some((x) => !Number.isFinite(x))) throw new Error("The file contains invalid (NaN or infinite) coordinates.");
  if (f.some((i) => i >= nv || i < 0)) throw new Error("The OBJ faces refer to vertices that do not exist.");
  const pos = Float64Array.from(v);
  return f.length ? { cloud: null, mesh: { pos, idx: Uint32Array.from(f) }, format: "OBJ", vertexCount: nv, faceCount: f.length / 3, notes } : { cloud: { pos }, mesh: null, format: "OBJ (points only)", vertexCount: nv, faceCount: 0, notes };
}
export async function parseFile(name: string, buf: ArrayBuffer): Promise<Parsed> {
  const ext = name.toLowerCase().split(".").pop(); if (ext === "ply") return parsePLY(buf); if (ext === "obj") return parseOBJ(new TextDecoder().decode(buf));
  throw new Error("Unsupported file type. Upload a .ply or .obj file.");
}

/* ───────── writers ───────── */
const enc = new TextEncoder();
export function writeOBJ(m: Mesh): Blob {
  const parts: string[] = ["# Neo Forge Technology photogrammetry clean-up (original coordinates and units preserved)\n"];
  for (let i = 0; i < m.pos.length; i += 3) parts.push(`v ${m.pos[i]} ${m.pos[i + 1]} ${m.pos[i + 2]}\n`);
  for (let i = 0; i < m.idx.length; i += 3) parts.push(`f ${m.idx[i] + 1} ${m.idx[i + 1] + 1} ${m.idx[i + 2] + 1}\n`);
  return new Blob(parts, { type: "text/plain" });
}
export function writePLY(m: Mesh): Blob {
  const nv = m.pos.length / 3, nf = m.idx.length / 3, head = enc.encode(`ply\nformat binary_little_endian 1.0\ncomment Neo Forge Technology photogrammetry clean-up\nelement vertex ${nv}\nproperty double x\nproperty double y\nproperty double z\nelement face ${nf}\nproperty list uchar uint vertex_indices\nend_header\n`);
  const body = new DataView(new ArrayBuffer(nv * 24 + nf * 13)); let o = 0;
  for (let i = 0; i < nv * 3; i++) { body.setFloat64(o, m.pos[i], true); o += 8; }
  for (let i = 0; i < nf; i++) { body.setUint8(o++, 3); for (let k = 0; k < 3; k++) { body.setUint32(o, m.idx[i * 3 + k], true); o += 4; } }
  return new Blob([head, body.buffer], { type: "application/octet-stream" });
}
function normalOf(p: Float64Array, a: number, b: number, c: number): [number, number, number] {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l];
}
/** Binary STL stores float32 coordinates; large world coordinates lose precision, so the mesh is written relative to its minimum corner (the offset is returned and must be reported). */
export function writeSTL(m: Mesh): { blob: Blob; offset: [number, number, number] } {
  const nf = m.idx.length / 3; let mn = [Infinity, Infinity, Infinity]; for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) mn[k] = Math.min(mn[k], m.pos[i + k]);
  const dv = new DataView(new ArrayBuffer(84 + nf * 50)); dv.setUint32(80, nf, true); let o = 84;
  for (let t = 0; t < nf; t++) { const a = m.idx[t * 3], b = m.idx[t * 3 + 1], c = m.idx[t * 3 + 2], n = normalOf(m.pos, a, b, c); for (const x of n) { dv.setFloat32(o, x, true); o += 4; } for (const v of [a, b, c]) for (let k = 0; k < 3; k++) { dv.setFloat32(o, m.pos[v * 3 + k] - mn[k], true); o += 4; } o += 2; }
  return { blob: new Blob([dv.buffer], { type: "model/stl" }), offset: mn as [number, number, number] };
}
/** glTF 2.0 binary. Positions are float32 relative to the mesh centre; the node translation restores the exact world position, so nothing is re-scaled or moved. Units: glTF is metres, so non-metre input is converted and the factor is stored in the asset extras. */
export function writeGLB(m: Mesh, unit: Unit = "m"): Blob {
  const nv = m.pos.length / 3, ni = m.idx.length, k = 1 / UNIT_PER_M[unit]; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], c = [0, 0, 0];
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { const v = m.pos[i * 3 + a]; mn[a] = Math.min(mn[a], v); mx[a] = Math.max(mx[a], v); }
  for (let a = 0; a < 3; a++) c[a] = (mn[a] + mx[a]) / 2;
  const pos = new Float32Array(nv * 3), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { const v = (m.pos[i * 3 + a] - c[a]) * k; pos[i * 3 + a] = v; lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v); }
  const posBytes = pos.byteLength, idxBytes = ni * 4, pad = (n: number) => (4 - (n % 4)) % 4;
  const json = { asset: { version: "2.0", generator: "Neo Forge Technology photogrammetry clean-up", extras: { sourceUnit: unit, metresPerSourceUnit: k } }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: c.map((v) => v * k) }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    buffers: [{ byteLength: posBytes + idxBytes }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 }, { buffer: 0, byteOffset: posBytes, byteLength: idxBytes, target: 34963 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: "VEC3", min: lo, max: hi }, { bufferView: 1, componentType: 5125, count: ni, type: "SCALAR" }] };
  let js = JSON.stringify(json); js += " ".repeat(pad(enc.encode(js).length)); const jb = enc.encode(js), total = 12 + 8 + jb.length + 8 + posBytes + idxBytes;
  const out = new DataView(new ArrayBuffer(total)); let o = 0; out.setUint32(o, 0x46546c67, true); out.setUint32(o + 4, 2, true); out.setUint32(o + 8, total, true); o = 12;
  out.setUint32(o, jb.length, true); out.setUint32(o + 4, 0x4e4f534a, true); new Uint8Array(out.buffer, o + 8, jb.length).set(jb); o += 8 + jb.length;
  out.setUint32(o, posBytes + idxBytes, true); out.setUint32(o + 4, 0x004e4942, true); new Uint8Array(out.buffer, o + 8, posBytes).set(new Uint8Array(pos.buffer)); new Uint8Array(out.buffer, o + 8 + posBytes, idxBytes).set(new Uint8Array(m.idx.buffer, m.idx.byteOffset, idxBytes));
  return new Blob([out.buffer], { type: "model/gltf-binary" });
}
/** ASCII DXF with one 3DFACE per triangle: opens in AutoCAD and other CAD tools. Coordinates are written in the source units (INSUNITS set accordingly). */
export function writeDXF(m: Mesh, unit: Unit = "m"): Blob {
  const ins: Record<Unit, number> = { m: 6, mm: 4, cm: 5, ft: 2, in: 1 }, parts: string[] = [`0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${ins[unit]}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`];
  for (let t = 0; t < m.idx.length; t += 3) { let s = "0\n3DFACE\n8\nCLEANED_SCAN\n"; const v = [m.idx[t], m.idx[t + 1], m.idx[t + 2], m.idx[t + 2]]; for (let k = 0; k < 4; k++) s += `${10 + k}\n${m.pos[v[k] * 3]}\n${20 + k}\n${m.pos[v[k] * 3 + 1]}\n${30 + k}\n${m.pos[v[k] * 3 + 2]}\n`; parts.push(s); }
  parts.push("0\nENDSEC\n0\nEOF\n"); return new Blob(parts, { type: "application/dxf" });
}
export function cloudToPLY(c: Cloud): Blob {
  const n = c.pos.length / 3, col = !!c.colors, head = enc.encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${n}\nproperty double x\nproperty double y\nproperty double z\n${col ? "property uchar red\nproperty uchar green\nproperty uchar blue\n" : ""}end_header\n`), stride = 24 + (col ? 3 : 0), dv = new DataView(new ArrayBuffer(n * stride)); let o = 0;
  for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) { dv.setFloat64(o, c.pos[i * 3 + k], true); o += 8; } if (col) for (let k = 0; k < 3; k++) dv.setUint8(o++, c.colors![i * 3 + k]); }
  return new Blob([head, dv.buffer], { type: "application/octet-stream" });
}
