/** Synthetic scans with KNOWN planes: a 6.00 x 4.00 x 2.60 m room with a table and a box. Deterministic. */
import { writeLas, writePlyAscii, type Cloud } from "./pointcloud";

export const ROOM_TRUTH = { length: 6, width: 4, height: 2.6, floorZ: 0, ceilingZ: 2.6, tableTopZ: 0.75, noise: 0.004, strayPoints: 40 };
export function roomCloud(opt: { seed?: number; density?: number; rotateDeg?: number } = {}): Cloud {
  let s = (opt.seed ?? 20240607) >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const d = opt.density ?? 1; const N = ROOM_TRUTH.noise; const nz = () => (rnd() - 0.5) * 2 * N;
  const pts: number[] = []; const col: number[] = []; const rot = ((opt.rotateDeg ?? 0) * Math.PI) / 180, cr = Math.cos(rot), sr = Math.sin(rot);
  const P = (x: number, y: number, z: number, r: number, g: number, b: number) => { pts.push(x * cr - y * sr, x * sr + y * cr, z); col.push(r, g, b); };
  const L = ROOM_TRUTH.length, W = ROOM_TRUTH.width, H = ROOM_TRUTH.height; const n = (k: number) => Math.round(k * d);
  for (let i = 0; i < n(14000); i++) { const x = rnd() * L, y = rnd() * W; P(x, y, nz(), 150, 140, 125); }
  for (let i = 0; i < n(12000); i++) { const x = rnd() * L, y = rnd() * W; P(x, y, H + nz(), 235, 235, 235); }
  for (let i = 0; i < n(5000); i++) { const y = rnd() * W, z = rnd() * H; P(nz(), y, z, 210, 205, 195); P(L + nz(), y, z, 210, 205, 195); }
  for (let i = 0; i < n(7000); i++) { const x = rnd() * L, z = rnd() * H; P(x, nz(), z, 200, 200, 210); P(x, W + nz(), z, 200, 200, 210); }
  for (let i = 0; i < n(2400); i++) P(2 + rnd() * 1.2, 1 + rnd() * 0.8, ROOM_TRUTH.tableTopZ + nz(), 120, 80, 50);
  for (let i = 0; i < n(1800); i++) { const y = 1 + rnd() * 0.8, z = rnd() * ROOM_TRUTH.tableTopZ; P(2 + nz(), y, z, 120, 80, 50); P(3.2 + nz(), y, z, 120, 80, 50); }
  for (let i = 0; i < ROOM_TRUTH.strayPoints; i++) P(rnd() * 9 - 1.5, rnd() * 7 - 1.5, rnd() * 4 - 0.6, 255, 0, 0);
  const xyz = Float64Array.from(pts); return { n: xyz.length / 3, xyz, rgb: Uint8Array.from(col), format: "synthetic", fileCount: 1, truncated: false };
}
export const roomLas = (o?: Parameters<typeof roomCloud>[0]) => writeLas(roomCloud(o));
export const roomPly = (o?: Parameters<typeof roomCloud>[0]) => Buffer.from(writePlyAscii(roomCloud({ density: 0.4, ...o })));
