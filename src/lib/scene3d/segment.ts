import { PointGrid, medianSpacing } from "../photo/grid";
import { eig3 } from "../photo/recon";
import { rng } from "../photo/synth";
import { CLASSES, type Cls } from "./scenes";

/**
 * Classical 3D scene segmentation (no neural network), in the order a rule-based system would do it:
 *  1. surface normals from local PCA;
 *  2. floor and ceiling from the most common low / high horizontal surface heights;
 *  3. walls by RANSAC plane fitting on vertical surfaces (up to 8 planes);
 *  4. doors and windows inside each wall plane by colour (door brown, window blue) and size, grouped into separate instances;
 *  5. everything else grouped into objects by 3D connectivity (touching objects merge);
 *  6. each object classified by geometric rules (size, footprint, shape of the top, hollow underside, green foliage), with a rule-match score.
 * Rules are tuned for the generated sample scenes and will not transfer unchanged to real scans.
 */
export interface Segmentation { cls: Uint8Array; inst: Int32Array; instances: { id: number; cls: Cls; index: number; score: number; checks: string[] }[]; floorY: number; ceilingY: number | null; walls: number; ms: number }
const V = { wall: [225, 222, 212], door: [112, 74, 38], window: [140, 196, 232] };
const ci = (c: Cls) => CLASSES.indexOf(c);
export function segmentScene(pos: Float32Array, rgb: Uint8Array): Segmentation {
  const t0 = performance.now(), n = pos.length / 3, P = Float64Array.from(pos), cls = new Uint8Array(n).fill(ci("other")), inst = new Int32Array(n).fill(-1), taken = new Uint8Array(n); let nextInst = 1;
  const spacing = medianSpacing(P), grid = new PointGrid(P, Math.max(spacing * 3, 0.05)), nn = new Float32Array(n * 3), r0 = Math.max(0.1, spacing * 3.2);
  for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; let sx = 0, sy = 0, sz = 0, k = 0; const nb: number[] = []; grid.near(x, y, z, r0, (j) => { nb.push(j); sx += P[j * 3]; sy += P[j * 3 + 1]; sz += P[j * 3 + 2]; k++; }); if (k < 5) { nn[i * 3 + 1] = 1; continue; }
    const cx = sx / k, cy = sy / k, cz = sz / k, m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const j of nb) { const d = [P[j * 3] - cx, P[j * 3 + 1] - cy, P[j * 3 + 2] - cz]; for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) m[a][b] += d[a] * d[b]; } for (let a = 0; a < 3; a++) for (let b = 0; b < a; b++) m[a][b] = m[b][a]; const v = eig3(m).vectors[0]; nn[i * 3] = v[0]; nn[i * 3 + 1] = v[1]; nn[i * 3 + 2] = v[2]; }
  // ---- floor and ceiling
  const histPeak = (lo: boolean) => { const h = new Map<number, number>(); for (let i = 0; i < n; i++) if (Math.abs(nn[i * 3 + 1]) > 0.85) { const b = Math.round(P[i * 3 + 1] / 0.04); h.set(b, (h.get(b) ?? 0) + 1); } const bins = [...h.entries()].filter(([, c]) => c > n * 0.02).sort((a, b) => (lo ? a[0] - b[0] : b[0] - a[0])); return bins.length ? bins[0][0] * 0.04 : null; };
  const floorY = histPeak(true) ?? Math.min(...Array.from({ length: n }, (_, i) => P[i * 3 + 1])); let ceilingY = histPeak(false); if (ceilingY !== null && ceilingY - floorY < 2.0) ceilingY = null;
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1], ny = Math.abs(nn[i * 3 + 1]); if (ny > 0.8 && Math.abs(y - floorY) < 0.06) { cls[i] = ci("floor"); taken[i] = 1; } else if (ceilingY !== null && ny > 0.8 && Math.abs(y - ceilingY) < 0.06) { cls[i] = ci("ceiling"); taken[i] = 1; } }
  // ---- walls (RANSAC planes on vertical surfaces)
  const rand = rng(11); let walls = 0; const wallPlanes: { n: [number, number, number]; d: number; idx: number[] }[] = [];
  for (let plane = 0; plane < 8; plane++) {
    const cand: number[] = []; for (let i = 0; i < n; i++) if (!taken[i] && Math.abs(nn[i * 3 + 1]) < 0.3 && P[i * 3 + 1] > floorY + 0.1) cand.push(i); if (cand.length < Math.max(800, n * 0.02)) break;
    let best: { nx: number; ny: number; nz: number; d: number; cnt: number } | null = null;
    for (let it = 0; it < 160; it++) { const a = cand[Math.floor(rand() * cand.length)], nx = nn[a * 3], nz = nn[a * 3 + 2], l = Math.hypot(nx, nz); if (l < 0.5) continue; const ux = nx / l, uz = nz / l, d = ux * P[a * 3] + uz * P[a * 3 + 2]; let cnt = 0; for (let q = 0; q < cand.length; q += 3) { const i = cand[q]; if (Math.abs(ux * P[i * 3] + uz * P[i * 3 + 2] - d) < 0.04) cnt++; } if (!best || cnt > best.cnt) best = { nx: ux, ny: 0, nz: uz, d, cnt }; }
    if (!best) break; const inl: number[] = []; for (const i of cand) if (Math.abs(best.nx * P[i * 3] + best.nz * P[i * 3 + 2] - best.d) < 0.06 && Math.abs(nn[i * 3] * best.nx + nn[i * 3 + 2] * best.nz) > 0.8) inl.push(i);
    let vmin = Infinity, vmax = -Infinity, umin = Infinity, umax = -Infinity; for (const i of inl) { const y = P[i * 3 + 1], u = -best.nz * P[i * 3] + best.nx * P[i * 3 + 2]; vmin = Math.min(vmin, y); vmax = Math.max(vmax, y); umin = Math.min(umin, u); umax = Math.max(umax, u); }
    // a wall is large and on the outer boundary of the scene along its normal; a row of cabinets or racks is a large vertical plane too but stands inside the room
    let pmin = Infinity, pmax = -Infinity; for (let i = 0; i < n; i += 5) { const q = best.nx * P[i * 3] + best.nz * P[i * 3 + 2]; if (q < pmin) pmin = q; if (q > pmax) pmax = q; }
    const tol = Math.max(0.4, 0.1 * (pmax - pmin)), outer = Math.abs(best.d - pmin) < tol || Math.abs(best.d - pmax) < tol;
    if (inl.length < Math.max(800, n * 0.02) || vmax - vmin < 1.6 || umax - umin < 1.5 || !outer) { for (const i of inl) taken[i] = 2; /* not a wall: set aside so the next plane is searched among the rest, but they are released again below */ continue; }
    for (const i of inl) { cls[i] = ci("wall"); taken[i] = 1; } wallPlanes.push({ n: [best.nx, 0, best.nz], d: best.d, idx: inl }); walls++;
  }
  for (let i = 0; i < n; i++) if (taken[i] === 2) taken[i] = 0; // points set aside while searching for walls go back to the objects
  // ---- doors and windows in wall planes: colour + size
  const col = (i: number) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]], dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const instances: Segmentation["instances"] = [], counts: Record<string, number> = {};
  const add = (c: Cls, score: number, checks: string[]) => { counts[c] = (counts[c] ?? 0) + 1; const id = nextInst++; instances.push({ id, cls: c, index: counts[c], score, checks }); return id; };
  for (const wp of wallPlanes) {
    const kind = new Map<number, "door" | "window">(); for (const i of wp.idx) { const c = col(i), dw = dist(c, V.wall), dd = dist(c, V.door), dwin = dist(c, V.window); if (dd < dw && dd < dwin && dd < 60) kind.set(i, "door"); else if (dwin < dw && dwin < dd && dwin < 60) kind.set(i, "window"); }
    for (const want of ["door", "window"] as const) {
      const cells = new Map<number, number[]>(); for (const [i, k] of kind) if (k === want) { const u = -wp.n[2] * P[i * 3] + wp.n[0] * P[i * 3 + 2], key = Math.floor(u / 0.1) * 4096 + Math.floor(P[i * 3 + 1] / 0.1); const l = cells.get(key); if (l) l.push(i); else cells.set(key, [i]); }
      const seen = new Set<number>(); for (const s of cells.keys()) { if (seen.has(s)) continue; const stack = [s], pts: number[] = []; seen.add(s); while (stack.length) { const c = stack.pop()!; pts.push(...cells.get(c)!); const v = ((c % 4096) + 4096) % 4096, u = (c - v) / 4096; for (const du of [-1, 0, 1]) for (const dv of [-1, 0, 1]) { const k = (u + du) * 4096 + (v + dv); if (cells.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); } } }
        let mn = Infinity, mx = -Infinity, um = Infinity, uM = -Infinity; for (const i of pts) { mn = Math.min(mn, P[i * 3 + 1]); mx = Math.max(mx, P[i * 3 + 1]); const u = -wp.n[2] * P[i * 3] + wp.n[0] * P[i * 3 + 2]; um = Math.min(um, u); uM = Math.max(uM, u); }
        const w = uM - um, h = mx - mn; const checks: string[] = []; let okc = 0; const tot = want === "door" ? 3 : 2; const sizeOk = want === "door" ? w > 0.6 && w < 1.4 && h > 1.7 && h < 2.6 : w > 0.5 && h > 0.5; checks.push(`size ${w.toFixed(2)} × ${h.toFixed(2)} m ${sizeOk ? "fits" : "does not fit"} a ${want}`); if (sizeOk) okc++; checks.push(`colour matches a ${want}`); okc++; if (want === "door") { const low = mn - floorY < 0.3; checks.push(`reaches the floor: ${low}`); if (low) okc++; }
        if (pts.length < 80 || !sizeOk) continue; const id = add(want, okc / tot, checks); for (const i of pts) { cls[i] = ci(want); inst[i] = id; } } }
    for (const i of wp.idx) if (inst[i] === -1) inst[i] = 0; // wall points share the (unnumbered) structural instance 0 until numbered below
  }
  // structural instances: each wall plane, the floor and the ceiling are one instance each
  const structId = new Map<string, number>(); const structOf = (c: Cls, key: string) => { const k = c + key; if (!structId.has(k)) structId.set(k, add(c, 1, ["large horizontal or vertical plane"])); return structId.get(k)!; };
  wallPlanes.forEach((wp, wi) => { for (const i of wp.idx) if (cls[i] === ci("wall")) inst[i] = structOf("wall", String(wi)); });
  for (let i = 0; i < n; i++) { if (cls[i] === ci("floor")) inst[i] = structOf("floor", ""); else if (cls[i] === ci("ceiling")) inst[i] = structOf("ceiling", ""); }
  // ---- remaining points: connected objects
  const rest: number[] = []; for (let i = 0; i < n; i++) if (!taken[i] && inst[i] === -1) rest.push(i); const sub = new Float64Array(rest.length * 3); rest.forEach((g, k) => { sub.set([P[g * 3], P[g * 3 + 1], P[g * 3 + 2]], k * 3); }); const rr = Math.max(spacing * 3.2, 0.08), rg = new PointGrid(sub, rr), seen = new Uint8Array(rest.length); // connectivity radius: about four typical point spacings, so thin shells such as car bodies stay in one piece (objects closer than this merge)
  for (let s = 0; s < rest.length; s++) { if (seen[s]) continue; const stack = [s], mem: number[] = []; seen[s] = 1; while (stack.length) { const c = stack.pop()!; mem.push(c); rg.near(sub[c * 3], sub[c * 3 + 1], sub[c * 3 + 2], rr, (j) => { if (!seen[j]) { seen[j] = 1; stack.push(j); } }); }
    if (mem.length < 60) continue; const pts = mem.map((m) => rest[m]); const f = describe(pts, P, rgb, floorY); const { c, score, checks } = classify(f); const id = add(c, score, [...checks, `${pts.length.toLocaleString()} points, ${f.a.toFixed(2)} × ${f.b.toFixed(2)} × ${f.h.toFixed(2)} m`]); for (const i of pts) { cls[i] = ci(c); inst[i] = id; } }
  return { cls, inst, instances, floorY, ceilingY, walls, ms: performance.now() - t0 };
}
interface Feat { h: number; top: number; a: number; b: number; green: number; topFrac: number; midFrac: number; seat: number; back: number; n: number }
function describe(idx: number[], P: Float64Array, rgb: Uint8Array, floorY: number): Feat {
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, mnz = Infinity, mxz = -Infinity, g = 0, cx = 0, cz = 0; for (const i of idx) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); cx += x; cz += z; if (rgb[i * 3 + 1] > rgb[i * 3] + 25 && rgb[i * 3 + 1] > rgb[i * 3 + 2] + 25) g++; }
  cx /= idx.length; cz /= idx.length; let sxx = 0, szz = 0, sxz = 0; for (const i of idx) { const dx = P[i * 3] - cx, dz = P[i * 3 + 2] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; } const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), c = Math.cos(th), s = Math.sin(th); let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const i of idx) { const dx = P[i * 3] - cx, dz = P[i * 3 + 2] - cz, u = dx * s + dz * c, v = dx * c - dz * s; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
  const h = mxy - floorY, top = h, ext = [a1 - a0, b1 - b0].sort((x, y) => y - x); let topN = 0, midN = 0, seatN = 0, backN = 0; for (const i of idx) { const y = P[i * 3 + 1] - floorY; if (y > top - 0.07) topN++; if (y > 0.2 && y < 0.7 * top) midN++; if (Math.abs(y - 0.45) < 0.06) seatN++; if (y > 0.6) backN++; }
  return { h, top, a: ext[0], b: ext[1], green: g / idx.length, topFrac: topN / idx.length, midFrac: midN / idx.length, seat: seatN / idx.length, back: backN / idx.length, n: idx.length };
}
function classify(f: Feat): { c: Cls; score: number; checks: string[] } {
  const rules: [Cls, [string, boolean][]][] = [
    ["tree", [["foliage-green points ≥ 25%", f.green >= 0.25], ["taller than 2.2 m", f.h >= 2.2]]],
    ["vehicle", [["length 2.2-5.8 m", f.a >= 2.2 && f.a <= 5.8], ["width 1.1-2.4 m", f.b >= 1.1 && f.b <= 2.4], ["height 0.9-2.6 m", f.h >= 0.9 && f.h <= 2.6]]],
    ["table", [["flat top between 0.35 and 1.1 m", f.top >= 0.35 && f.top <= 1.1 && f.topFrac >= 0.3], ["hollow underside (little mass between floor and top)", f.midFrac < 0.22], ["top at least 0.55 m long", f.a >= 0.55]]],
    ["chair", [["height 0.6-1.25 m", f.h >= 0.6 && f.h <= 1.25], ["footprint under 0.75 m", f.a <= 0.75 && f.b >= 0.3], ["seat layer near 0.45 m", f.seat >= 0.15], ["backrest above 0.6 m", f.back >= 0.1]]],
    ["cabinet", [["height 1.0-3.5 m with depth up to 1.0 m, or 0.55-1.0 m high and under 0.6 m deep", (f.h >= 1 && f.h <= 3.5 && f.b <= 1.0) || (f.h >= 0.55 && f.h < 1 && f.b <= 0.6)], ["width 0.5-2.6 m", f.a >= 0.5 && f.a <= 2.6], ["solid body (mass between floor and top)", f.midFrac >= 0.25]]],
  ];
  let best: { c: Cls; score: number; checks: string[] } | null = null;
  for (const [c, rs] of rules) { const ok = rs.filter(([, v]) => v).length; if (ok === rs.length) return { c, score: 1, checks: rs.map(([t]) => t) }; const sc = ok / rs.length; if (!best || sc > best.score) best = { c, score: sc, checks: rs.map(([t, v]) => `${v ? "✓" : "✗"} ${t}`) }; }
  return { c: "other", score: Math.max(0, 1 - (best?.score ?? 0)) * 0.5 + 0.4, checks: ["no object rule matched fully (closest: " + (best?.c ?? "none") + ")"] };
}
