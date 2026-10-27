/**
 * Architectural plan interpreter: turns the entities of a 2D DXF into walls, openings, rooms, columns and stairs.
 * Every element records where it came from (layer + DXF handle) and which of its values are assumptions.
 * Nothing is invented: walls need drawn geometry, rooms need closed wall loops, thicknesses come from the drawing (outline mode) or settings (centerline mode).
 */
import { DxfDoc, DxfEntity, entityBounds, explode, polyPoints, resolveUnits, docExtents } from "./dxf";
import { EPS, add, angleOf, bboxOf, closestOnSeg, cross, dist, dot, len, lerp, lineIntersect, mul, norm, perp, pointInPoly, polyArea, polyCentroid, polyPerimeter, segIntersect, sub, type V2 } from "./geom";
import type { Column, Opening, Room, Settings, Stair, Wall } from "./model";

export type LayerRole = "wall" | "door" | "window" | "column" | "stair" | "room-label" | "dimension" | "furniture" | "mep" | "ignore";
const RULES: [LayerRole, RegExp][] = [
  ["mep", /(^|[-_ ])(m|p|e|f|fp|hvac|duct|diff|grille|pipe|plumb|sanit|drain|elec|cond|tray|light|sprink)([-_ ]|$)|hvac|duct|diffus|conduit|sprinkl|plumb|drain/i],
  ["dimension", /dim|dimen|cota|dimension/i], ["room-label", /room|space|rm[-_ ]?(name|tag|label)|name|label|zone|area/i],
  ["door", /door|dr[-_ ]|porte|puerta|tur/i], ["window", /wind|glaz|glass|win[-_ ]|fen|ventana|vitr/i], ["column", /col(umn|[-_ ])?|pillar|post|stütze|poteau/i],
  ["stair", /stair|step|escal|treppe/i], ["furniture", /furn|fixt|equip|casework|mobil/i], ["wall", /wall|mur|muro|wand|partition|a-wall/i],
];
export interface LayerGuess { layer: string; role: LayerRole; confidence: "high" | "medium" | "low"; reason: string; entities: number }
export function guessLayerRoles(doc: DxfDoc, ents: DxfEntity[] = explode(doc)): LayerGuess[] {
  const counts: Record<string, number> = {}; for (const e of ents) counts[e.layer] = (counts[e.layer] ?? 0) + 1;
  return Object.keys({ ...doc.layers, ...counts }).sort().map((layer) => {
    const hit = RULES.find(([, re]) => re.test(layer));
    // mep rule must not swallow plain architectural names such as "A-WALL"
    if (hit && !(hit[0] === "mep" && /wall|door|wind|glaz|stair|room|dim/i.test(layer))) return { layer, role: hit[0], confidence: /^[a-z]-/i.test(layer) || /^(wall|door|window|stair|column)s?$/i.test(layer) ? "high" : "medium", reason: `layer name matches ${hit[0]} naming`, entities: counts[layer] ?? 0 } as LayerGuess;
    const alt = RULES.find(([r, re]) => r !== "mep" && re.test(layer)); if (alt) return { layer, role: alt[0], confidence: "medium", reason: `layer name matches ${alt[0]} naming`, entities: counts[layer] ?? 0 } as LayerGuess;
    return { layer, role: "ignore", confidence: "low", reason: layer === "0" ? "default layer" : "no recognisable naming", entities: counts[layer] ?? 0 };
  });
}

interface Seg { a: V2; b: V2; len: number; u: V2; layer: string; h?: string }
interface Cand { a: V2; b: V2; t: number; layers: Set<string>; handles: string[] }
const canon = (u: V2): V2 => (u.x < -1e-9 || (Math.abs(u.x) <= 1e-9 && u.y < 0) ? { x: -u.x, y: -u.y } : u);

function wallSegments(ents: DxfEntity[], roles: Record<string, string>, k: number, warn: string[]): Seg[] {
  const out: Seg[] = []; let arcs = 0; const push = (a: V2, b: V2, layer: string, h?: string) => { const A = mul(a, k), B = mul(b, k); const l = dist(A, B); if (l > 0.03) out.push({ a: A, b: B, len: l, u: norm(sub(B, A)), layer, h }); };
  for (const e of ents) { if (roles[e.layer] !== "wall") continue;
    if (e.t === "LINE") push(e.a, e.b, e.layer, e.h);
    else if (e.t === "POLY") { if (e.pts.some((p) => p.bulge)) arcs++; const pts = e.pts; const m = pts.length; for (let i = 0; i < (e.closed ? m : m - 1); i++) { if (!pts[i].bulge) push(pts[i], pts[(i + 1) % m], e.layer, e.h); } }
    else if (e.t === "ARC" || e.t === "CIRCLE") arcs++; }
  if (arcs) warn.push(`${arcs} curved wall entities (arcs/bulged polylines) were not converted: curved walls are not supported by the plan interpreter.`);
  return out;
}

/** Outline mode: pairs of parallel faces → wall centrelines. */
export function pairFaces(segs: Seg[], range: [number, number]): Cand[] {
  const cands: Cand[] = []; const n = Math.min(segs.length, 9000);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = segs[i], B = segs[j]; if (Math.abs(cross(A.u, B.u)) > 0.02) continue;
    const nrm = perp(A.u); const d = dot(sub(B.a, A.a), nrm); const ad = Math.abs(d); if (ad < range[0] || ad > range[1]) continue;
    const dB = Math.abs(dot(sub(B.b, A.a), nrm) - d); if (dB > 0.02) continue;
    const pa0 = 0, pa1 = A.len; const pb0 = dot(sub(B.a, A.a), A.u), pb1 = dot(sub(B.b, A.a), A.u); const s0 = Math.max(pa0, Math.min(pb0, pb1)), s1 = Math.min(pa1, Math.max(pb0, pb1)); if (s1 - s0 < 0.1) continue;
    const off = mul(nrm, d / 2); cands.push({ a: add(add(A.a, mul(A.u, s0)), off), b: add(add(A.a, mul(A.u, s1)), off), t: ad, layers: new Set([A.layer, B.layer]), handles: [A.h, B.h].filter(Boolean) as string[] });
  }
  return mergeCands(cands);
}
function mergeCands(c: Cand[]): Cand[] {
  const n = c.length; const par = Array.from({ length: n }, (_, i) => i); const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])));
  const info = c.map((w) => { const u = canon(norm(sub(w.b, w.a))); const o = cross(w.a, u); const s0 = dot(w.a, u), s1 = dot(w.b, u); return { u, o, s0: Math.min(s0, s1), s1: Math.max(s0, s1) }; });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = info[i], b = info[j]; if (Math.abs(cross(a.u, b.u)) > 0.02 || Math.abs(a.o - b.o) > 0.03 || Math.abs(c[i].t - c[j].t) > 0.04) continue; if (Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0) < -0.32) continue; par[find(i)] = find(j); }
  const groups = new Map<number, number[]>(); for (let i = 0; i < n; i++) { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); }
  const out: Cand[] = []; for (const idxs of groups.values()) { const u = info[idxs[0]].u; const base = c[idxs[0]].a; const o0 = sub(base, mul(u, dot(base, u))); const s0 = Math.min(...idxs.map((i) => info[i].s0)), s1 = Math.max(...idxs.map((i) => info[i].s1)); const t = idxs.reduce((s, i) => s + c[i].t, 0) / idxs.length; const layers = new Set<string>(); const handles: string[] = []; idxs.forEach((i) => { c[i].layers.forEach((l) => layers.add(l)); handles.push(...c[i].handles); }); out.push({ a: add(o0, mul(u, s0)), b: add(o0, mul(u, s1)), t, layers, handles }); }
  return out.filter((w) => dist(w.a, w.b) >= 0.1);
}

/** Centreline mode: each wall-layer line is a centreline with the configured thickness. */
function centerlineCands(segs: Seg[], t: number): Cand[] { return mergeCands(segs.filter((s) => s.len >= 0.2).map((s) => ({ a: s.a, b: s.b, t, layers: new Set([s.layer]), handles: s.h ? [s.h] : [] }))); }

interface W { a: V2; b: V2; t: number; layers: string[]; handles: string[]; openings: Opening[]; derived: string[] }
function joinWalls(ws: W[]) {
  for (const W of ws) for (const endKey of ["a", "b"] as const) {
    const e = W[endKey]; const uW = norm(sub(W.b, W.a)); let best: { x: V2; d: number } | null = null;
    for (const V of ws) { if (V === W) continue; const uV = norm(sub(V.b, V.a)); if (Math.abs(cross(uW, uV)) < 0.1) continue; const li = lineIntersect(W.a, W.b, V.a, V.b); if (!li) continue; const lenV = dist(V.a, V.b); const sV = li.u * lenV; const slack = W.t / 2 + 0.05; if (sV < -slack || sV > lenV + slack) continue; const d = dist(e, li.pt); if (d > V.t / 2 + 0.08 + (d > 0 ? 0 : 0)) continue; // must be near the end
      // the intersection must be beyond (extension) or within the last portion of W: reject when it lies near W's opposite end
      const other = endKey === "a" ? W.b : W.a; if (dist(other, li.pt) < dist(other, e) - V.t) continue; if (!best || d < best.d) best = { x: li.pt, d }; }
    if (best) W[endKey] = best.x;
  }
}

export interface Symbol2D { kind: "door" | "window"; center: V2; width: number; dirHint?: V2; hinge?: V2; source: { layer: string; handle?: string }; swing?: V2 }
function collectSymbols(ents: DxfEntity[], roles: Record<string, string>, k: number, doc: DxfDoc): Symbol2D[] {
  const out: Symbol2D[] = [];
  for (const e of ents) {
    const role = roles[e.layer]; if (role !== "door" && role !== "window") continue;
    if (role === "door" && e.t === "ARC") { const c = mul(e.c, k), r = e.r * k; const p0 = add(c, { x: r * Math.cos(e.a0), y: r * Math.sin(e.a0) }), p1 = add(c, { x: r * Math.cos(e.a1), y: r * Math.sin(e.a1) }); out.push({ kind: "door", center: c, width: r, hinge: c, dirHint: undefined, source: { layer: e.layer, handle: e.h }, swing: lerp(p0, p1, 0.5), ...{ ends: [p0, p1] } as object } as Symbol2D); }
    else if (e.t === "INSERT") { const b = doc.blocks[e.name]; const bb = b ? docExtents(b.entities) : null; const w = bb ? Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * Math.abs(e.sx) * k : 0.9; out.push({ kind: role, center: mul(e.p, k), width: w || 0.9, source: { layer: e.layer, handle: e.h } }); }
  }
  // window symbols: cluster the geometry of each window layer into rectangles
  const winEnts = ents.filter((e) => roles[e.layer] === "window" && (e.t === "LINE" || e.t === "POLY")); const used = new Array(winEnts.length).fill(false);
  const bounds = winEnts.map((e) => entityBounds(e)!);
  for (let i = 0; i < winEnts.length; i++) { if (used[i]) continue; used[i] = true; let bb = { ...bounds[i] }; const members = [i]; let grew = true; while (grew) { grew = false; for (let j = 0; j < winEnts.length; j++) { if (used[j]) continue; const q = bounds[j]; const tol = 0.02 / k; if (q.x0 <= bb.x1 + tol && q.x1 >= bb.x0 - tol && q.y0 <= bb.y1 + tol && q.y1 >= bb.y0 - tol) { used[j] = true; members.push(j); bb = { x0: Math.min(bb.x0, q.x0), y0: Math.min(bb.y0, q.y0), x1: Math.max(bb.x1, q.x1), y1: Math.max(bb.y1, q.y1) }; grew = true; } } }
    const w = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * k; if (w < 0.2) continue; const dir: V2 = bb.x1 - bb.x0 >= bb.y1 - bb.y0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
    out.push({ kind: "window", center: mul({ x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 }, k), width: w, dirHint: dir, source: { layer: winEnts[i].layer, handle: winEnts[i].h } }); }
  return out;
}

export interface PlanResult {
  walls: Wall[]; rooms: Room[]; columns: Column[]; stairs: Stair[]; warnings: string[]; assumptions: string[]; units: ReturnType<typeof resolveUnits>; extents: { x0: number; y0: number; x1: number; y1: number };
  roles: Record<string, string>; wallMode: "outline" | "centerline"; unpairedLines: number; symbols: { doors: number; windows: number; unattached: number }; scaleCheck?: { checked: number; agreeing: number; medianRatio: number };
  outerLoops: V2[][];
}

export function interpretPlan(doc: DxfDoc, st: Settings, levelId = "L0"): PlanResult {
  const warnings: string[] = []; const assumptions: string[] = []; const ents = explode(doc); const units = resolveUnits(doc, ents, st.unitsOverride); const k = units.toM;
  if (units.ambiguous) warnings.push(`Units: ${units.note}`);
  const guess = guessLayerRoles(doc, ents); const roles: Record<string, string> = {}; for (const g of guess) roles[g.layer] = g.role; Object.assign(roles, st.layerMap);
  const segs = wallSegments(ents, roles, k, warnings);
  if (!segs.length) warnings.push("No wall geometry found on the layers mapped as walls. Check the layer mapping.");
  let mode: "outline" | "centerline" = st.wallMode === "centerline" ? "centerline" : "outline"; let cands: Cand[] = [];
  if (st.wallMode !== "centerline") { cands = pairFaces(segs, st.thicknessRange); const pairedLen = cands.reduce((s, c) => s + dist(c.a, c.b), 0), segLen = segs.reduce((s, x) => s + x.len, 0); if (st.wallMode === "auto" && (cands.length === 0 || pairedLen * 2 < segLen * 0.3)) { mode = "centerline"; cands = centerlineCands(segs, st.defaultWallThickness); assumptions.push(`Wall lines were not drawn as parallel faces, so each wall line is treated as a centreline with the configured thickness of ${st.defaultWallThickness} m.`); } }
  else { cands = centerlineCands(segs, st.defaultWallThickness); assumptions.push(`Wall thickness ${st.defaultWallThickness} m is a configured value (centreline mode).`); }
  let ws: W[] = cands.map((c) => ({ a: c.a, b: c.b, t: Math.round(c.t * 1000) / 1000, layers: [...c.layers], handles: c.handles.slice(0, 6), openings: [], derived: [] }));
  const covered = (s: Seg) => { const m = lerp(s.a, s.b, 0.5); return ws.some((w) => closestOnSeg(m, w.a, w.b).d <= w.t / 2 + 0.05); };
  const unpaired = mode === "outline" ? segs.filter((s) => s.len > 1.0 && !covered(s)).length : 0; if (unpaired > 0) warnings.push(`${unpaired} long wall-layer lines were not part of any parallel face pair and were ignored (check for single-line walls or unusual wall widths).`);
  joinWalls(ws); ws = ws.filter((w) => dist(w.a, w.b) > 0.1);
  // openings
  const symbols = collectSymbols(ents, roles, k, doc); let unattached = 0;
  type Ends = { ends?: [V2, V2] };
  const nearestWall = (p: V2) => { let best: { w: W; c: ReturnType<typeof closestOnSeg> } | null = null; for (const w of ws) { const c = closestOnSeg(p, w.a, w.b); if (!best || c.d < best.c.d) best = { w, c }; } return best; };
  // door arcs: the opening runs from the hinge to the free end along the wall
  for (const s of symbols) { if (s.kind === "door" && (s as unknown as Ends).ends) { const ends = (s as unknown as Ends).ends!; const hn = nearestWall(s.hinge!); if (!hn) continue; const u = norm(sub(hn.w.b, hn.w.a)); const e = [ends[0], ends[1]].map((p) => ({ p, d: Math.abs(dot(sub(p, s.hinge!), perp(u))) })).sort((x, y) => x.d - y.d)[0].p; s.center = lerp(s.hinge!, e, 0.5); s.dirHint = u; } }
  // bridge gaps in collinear walls where a symbol sits
  const bridge = () => { for (let i = 0; i < ws.length; i++) for (let j = 0; j < ws.length; j++) { if (i === j) continue; const A = ws[i], B = ws[j]; const uA = norm(sub(A.b, A.a)), uB = norm(sub(B.b, B.a)); if (Math.abs(cross(uA, uB)) > 0.02 || dot(uA, uB) < 0) continue; if (Math.abs(cross(sub(B.a, A.a), uA)) > 0.04 || Math.abs(A.t - B.t) > 0.05) continue; const gap = dot(sub(B.a, A.b), uA); if (gap < 0.3 || gap > 4) continue; const mid = lerp(A.b, B.a, 0.5);
      const sym = symbols.find((s) => dist(s.center, mid) < 0.35 + gap / 2 && Math.abs(dot(sub(s.center, mid), uA)) < gap / 2 + 0.2 && Math.abs(cross(sub(s.center, mid), uA)) < A.t); const merged: W = { a: A.a, b: B.b, t: A.t, layers: [...new Set([...A.layers, ...B.layers])], handles: [...A.handles, ...B.handles], openings: [...A.openings, ...B.openings], derived: [...A.derived, ...B.derived] };
      if (!sym) { merged.derived.push(`gap ${gap.toFixed(2)} m between collinear wall segments without a door/window symbol`); warnings.push(`A ${gap.toFixed(2)} m gap in a wall near (${mid.x.toFixed(2)}, ${mid.y.toFixed(2)}) m has no door/window symbol; it is modelled as an unlabelled opening.`); merged.openings.push({ id: "", kind: "opening", s: 0, width: gap, height: st.doorHeight, sill: 0, source: { origin: "derived", note: "gap in wall lines" }, assumed: ["height (door height setting)"] }); (merged.openings[merged.openings.length - 1] as Opening & { _mid: V2 })._mid = mid; }
      ws = ws.filter((_, q) => q !== i && q !== j); ws.push(merged); return true; } return false; };
  let guard = 0; while (bridge() && guard++ < 200);
  // attach symbols (and the unlabelled gap openings already stored with a midpoint)
  const mkId = (() => { let n = 0; return (p: string) => `${p}${String(++n).padStart(3, "0")}`; })();
  for (const w of ws) for (const o of w.openings) { const mid = (o as Opening & { _mid?: V2 })._mid; if (mid) { const c = closestOnSeg(mid, w.a, w.b); o.s = c.t * dist(w.a, w.b); delete (o as Opening & { _mid?: V2 })._mid; } }
  for (const s of symbols) { const nw = nearestWall(s.center); if (!nw || nw.c.d > nw.w.t / 2 + 0.3) { unattached++; warnings.push(`A ${s.kind} symbol on layer ${s.source.layer} near (${s.center.x.toFixed(2)}, ${s.center.y.toFixed(2)}) m is not on any wall and was not placed.`); continue; }
    const L = dist(nw.w.a, nw.w.b); const u = norm(sub(nw.w.b, nw.w.a)); let width = s.width; if (s.kind === "window" && s.dirHint) width = s.width; const sc = dot(sub(s.center, nw.w.a), u); const sClamped = Math.max(width / 2, Math.min(L - width / 2, sc)); if (width > L) { warnings.push(`A ${s.kind} wider than its wall (${width.toFixed(2)} m) was skipped.`); continue; }
    // skip if this opening already exists (a bridged gap was created from the same symbol)
    const dup = nw.w.openings.find((o) => Math.abs(o.s - sClamped) < 0.3 && o.kind === "opening"); const assumed = s.kind === "door" ? ["height (door height setting)"] : ["sill height (setting)", "height (setting)"]; const op: Opening = { id: "", kind: s.kind, s: sClamped, width: Math.round(width * 1000) / 1000, height: s.kind === "door" ? st.doorHeight : st.windowHeight, sill: s.kind === "door" ? 0 : st.windowSill, source: { origin: "dxf", layer: s.source.layer, handle: s.source.handle }, assumed };
    if (dup) { nw.w.openings = nw.w.openings.filter((o) => o !== dup); warnings.pop(); } nw.w.openings.push(op); }
  const walls: Wall[] = ws.map((w) => ({ id: mkId("W"), level: levelId, a: w.a, b: w.b, thickness: w.t, height: st.wallHeight, kind: "unknown", openings: w.openings.sort((p, q) => p.s - q.s).map((o) => ({ ...o, id: mkId("O") })), source: { origin: "dxf", layer: w.layers.join(","), handle: w.handles[0], note: mode === "outline" ? "centreline derived from a pair of parallel wall faces" : "centreline from drawn wall line" }, assumed: mode === "centerline" ? ["thickness (setting)", "height (setting)"] : ["height (setting)"] }));
  assumptions.push(`Wall height ${st.wallHeight} m, door height ${st.doorHeight} m, window sill ${st.windowSill} m and window height ${st.windowHeight} m are configurable assumptions (2D plans do not carry heights).`);
  // rooms
  const { rooms, outerLoops } = detectRooms(walls, ents, roles, k, levelId, warnings);
  classifyWalls(walls, outerLoops);
  // columns
  const columns: Column[] = []; let ci = 0; for (const e of ents) { if (roles[e.layer] !== "column") continue; let c: V2 | null = null, w = 0, d = 0, round = false; if (e.t === "CIRCLE") { c = mul(e.c, k); w = d = e.r * 2 * k; round = true; } else if (e.t === "POLY" && e.closed) { const b = bboxOf(polyPoints(e)); c = mul({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, k); w = (b.x1 - b.x0) * k; d = (b.y1 - b.y0) * k; } else if (e.t === "INSERT") { const b = doc.blocks[e.name]; const bb = b ? docExtents(b.entities) : null; c = mul(e.p, k); w = bb ? (bb.x1 - bb.x0) * Math.abs(e.sx) * k : 0.3; d = bb ? (bb.y1 - bb.y0) * Math.abs(e.sy) * k : 0.3; } if (c && w > 0.05 && d > 0.05 && w < 3 && d < 3) columns.push({ id: `C${String(++ci).padStart(3, "0")}`, level: levelId, c, w, d, round, height: st.wallHeight, source: { origin: "dxf", layer: e.layer, handle: e.h }, assumed: ["height (wall height setting)"] }); }
  // stairs
  const stairs = detectStairs(ents, roles, k, levelId, st, assumptions);
  // dimension scale check
  const ratios: number[] = []; for (const e of ents) if (e.t === "DIM" && e.p1 && e.p2 && e.measurement && e.measurement > 0) { const dd = dist(e.p1, e.p2); if (dd > 0) ratios.push(dd / e.measurement); }
  let scaleCheck: PlanResult["scaleCheck"]; if (ratios.length) { ratios.sort((a, b) => a - b); const med = ratios[Math.floor(ratios.length / 2)]; scaleCheck = { checked: ratios.length, agreeing: ratios.filter((r) => Math.abs(r - 1) < 0.01).length, medianRatio: Math.round(med * 10000) / 10000 }; if (Math.abs(med - 1) > 0.01) warnings.push(`Drawn dimensions disagree with the geometry (median measured/geometry ratio ${med.toFixed(3)}): the drawing may be scaled or its dimensions overridden.`); }
  const ex = docExtents(ents); const extents = ex ? { x0: ex.x0 * k, y0: ex.y0 * k, x1: ex.x1 * k, y1: ex.y1 * k } : { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { walls, rooms, columns, stairs, warnings, assumptions, units, extents, roles, wallMode: mode, unpairedLines: unpaired, symbols: { doors: symbols.filter((s) => s.kind === "door").length, windows: symbols.filter((s) => s.kind === "window").length, unattached }, scaleCheck, outerLoops };
}

/* ───────── rooms from the wall graph ───────── */
interface Edge { u: number; v: number; wall: Wall }
export function detectRooms(walls: Wall[], ents: DxfEntity[], roles: Record<string, string>, k: number, levelId: string, warnings: string[]): { rooms: Room[]; outerLoops: V2[][] } {
  const nodes: V2[] = []; const nodeId = (p: V2) => { for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) < 0.03) return i; nodes.push({ ...p }); return nodes.length - 1; };
  const edges: Edge[] = [];
  for (const w of walls) { const L = dist(w.a, w.b); const ts = new Set<number>([0, 1]); const u = norm(sub(w.b, w.a));
    for (const o of walls) { if (o === w) continue; for (const p of [o.a, o.b]) { const c = closestOnSeg(p, w.a, w.b); if (c.d < 0.04 && c.t * L > 0.03 && (1 - c.t) * L > 0.03) ts.add(c.t); } const x = segIntersect(w.a, w.b, o.a, o.b); if (x) { const t = dot(sub(x, w.a), u) / L; if (t * L > 0.03 && (1 - t) * L > 0.03) ts.add(t); } }
    const arr = [...ts].sort((a, b) => a - b); for (let i = 0; i + 1 < arr.length; i++) { const p = lerp(w.a, w.b, arr[i]), q = lerp(w.a, w.b, arr[i + 1]); if (dist(p, q) < 0.03) continue; const a = nodeId(p), b = nodeId(q); if (a !== b) edges.push({ u: a, v: b, wall: w }); } }
  // prune dangling edges
  let alive = edges.slice(); for (;;) { const deg = new Map<number, number>(); for (const e of alive) { deg.set(e.u, (deg.get(e.u) ?? 0) + 1); deg.set(e.v, (deg.get(e.v) ?? 0) + 1); } const next = alive.filter((e) => (deg.get(e.u) ?? 0) > 1 && (deg.get(e.v) ?? 0) > 1); if (next.length === alive.length) break; alive = next; }
  const out = new Map<number, { to: number; edge: Edge; ang: number }[]>(); for (const e of alive) { (out.get(e.u) ?? out.set(e.u, []).get(e.u)!).push({ to: e.v, edge: e, ang: angleOf(sub(nodes[e.v], nodes[e.u])) }); (out.get(e.v) ?? out.set(e.v, []).get(e.v)!).push({ to: e.u, edge: e, ang: angleOf(sub(nodes[e.u], nodes[e.v])) }); }
  for (const l of out.values()) l.sort((a, b) => a.ang - b.ang);
  const visited = new Set<string>(); const faces: { nodes: number[]; edges: Edge[] }[] = [];
  for (const [u0, list] of out) for (const h of list) { const key0 = `${u0}>${h.to}:${nodes.length}`; void key0; const key = `${u0}>${h.to}`; if (visited.has(key)) continue; const fn: number[] = [], fe: Edge[] = []; let u = u0, he = h, guard = 0; for (;;) { const kk = `${u}>${he.to}`; if (visited.has(kk)) break; visited.add(kk); fn.push(u); fe.push(he.edge); const v = he.to; const lst = out.get(v)!; const idx = lst.findIndex((x) => x.to === u && x.edge === he.edge); const nxt = lst[(idx - 1 + lst.length) % lst.length]; u = v; he = nxt; if (++guard > 5000) break; } if (fn.length >= 3) faces.push({ nodes: fn, edges: fe }); }
  const rooms: Room[] = []; const outerLoops: V2[][] = []; const texts = ents.filter((e): e is Extract<DxfEntity, { t: "TEXT" }> => e.t === "TEXT" && roles[e.layer] !== "dimension" && roles[e.layer] !== "mep" && e.text.trim().length > 0);
  let rn = 0;
  for (const f of faces) { const poly = f.nodes.map((i) => nodes[i]); const A = polyArea(poly); if (A < 0) { outerLoops.push(poly); continue; } if (A < 0.5) continue;
    const net = insetFace(poly, f.edges); const netPoly = net ?? poly; const netValid = !!net; const area = polyArea(netPoly); const label = texts.find((t) => pointInPoly(mul(t.p, k), poly));
    rooms.push({ id: `R${String(++rn).padStart(3, "0")}`, level: levelId, name: label ? label.text.trim() : `Room ${rn}`, nameSource: label ? "text-label" : "generated", polygon: netPoly, grossPolygon: poly, area: Math.round(area * 10000) / 10000, grossArea: Math.round(A * 10000) / 10000, perimeter: Math.round(polyPerimeter(netPoly) * 10000) / 10000, centroid: polyCentroid(netPoly), source: { origin: "derived", note: netValid ? "closed loop of wall centrelines, inset by half of each wall thickness" : "closed loop of wall centrelines (inset failed; gross area)" }, netValid, wallIds: [...new Set(f.edges.map((e) => e.wall.id))] }); }
  if (!rooms.length && walls.length) warnings.push("No closed rooms were found: wall centrelines do not form closed loops (check for gaps without door/window symbols).");
  return { rooms, outerLoops };
}
function insetFace(poly: V2[], edges: Edge[]): V2[] | null {
  const n = poly.length; const lines = poly.map((p, i) => { const q = poly[(i + 1) % n]; const u = norm(sub(q, p)); const h = edges[i].wall.thickness / 2; const nn = perp(u); return { p: add(p, mul(nn, h)), q: add(q, mul(nn, h)), u, h }; });
  const out: V2[] = []; for (let i = 0; i < n; i++) { const a = lines[(i - 1 + n) % n], b = lines[i]; const li = lineIntersect(a.p, a.q, b.p, b.q); if (li && dist(li.pt, poly[i]) < 3) out.push(li.pt); else out.push(add(poly[i], mul(perp(b.u), b.h))); }
  // drop collinear duplicates
  const simp = out.filter((p, i) => dist(p, out[(i + 1) % n]) > 1e-6); if (simp.length < 3) return null; const A = polyArea(simp); if (A <= 0 || A > polyArea(poly) + 1e-6) return null;
  for (let i = 0; i < simp.length; i++) for (let j = i + 2; j < simp.length; j++) { if (i === 0 && j === simp.length - 1) continue; if (segIntersect(simp[i], simp[(i + 1) % simp.length], simp[j], simp[(j + 1) % simp.length])) return null; }
  return simp;
}
function classifyWalls(walls: Wall[], outer: V2[][]) {
  for (const w of walls) { let ext = false; for (const loop of outer) for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; const m = lerp(w.a, w.b, 0.5); const c = closestOnSeg(m, a, b); if (c.d < 0.04 && Math.abs(cross(norm(sub(b, a)), norm(sub(w.b, w.a)))) < 0.05) ext = true; } w.kind = ext ? "exterior" : "interior"; }
}

function detectStairs(ents: DxfEntity[], roles: Record<string, string>, k: number, level: string, st: Settings, assumptions: string[]): Stair[] {
  const items = ents.filter((e) => roles[e.layer] === "stair" && (e.t === "LINE" || e.t === "POLY")); if (!items.length) return [];
  const bs = items.map((e) => entityBounds(e)!); const used = new Array(items.length).fill(false); const stairs: Stair[] = []; let n = 0;
  for (let i = 0; i < items.length; i++) { if (used[i]) continue; used[i] = true; let bb = { ...bs[i] }; const mem = [i]; let g = true; while (g) { g = false; for (let j = 0; j < items.length; j++) { if (used[j]) continue; const q = bs[j]; const tol = 0.05 / k; if (q.x0 <= bb.x1 + tol && q.x1 >= bb.x0 - tol && q.y0 <= bb.y1 + tol && q.y1 >= bb.y0 - tol) { used[j] = true; mem.push(j); g = true; bb = { x0: Math.min(bb.x0, q.x0), y0: Math.min(bb.y0, q.y0), x1: Math.max(bb.x1, q.x1), y1: Math.max(bb.y1, q.y1) }; } } }
    const w = (bb.x1 - bb.x0) * k, h = (bb.y1 - bb.y0) * k; if (w < 0.6 || h < 0.6) continue; const lines = mem.map((m) => items[m]).filter((e) => e.t === "LINE") as Extract<DxfEntity, { t: "LINE" }>[];
    const horiz = h >= w ? 0 : 1; // run direction: along the longer side
    const run = Math.max(w, h), width = Math.min(w, h); const treadLines = lines.filter((l) => { const a = Math.abs(l.b.x - l.a.x), b2 = Math.abs(l.b.y - l.a.y); return horiz === 0 ? a > b2 : b2 > a; }).length; const treads = treadLines >= 3 ? treadLines + 1 : Math.max(3, Math.round(st.wallHeight / 0.175) - 1);
    if (treadLines < 3) assumptions.push("A stair without drawn tread lines uses a 0.175 m riser assumption to count steps.");
    stairs.push({ id: `S${String(++n).padStart(3, "0")}`, level, polygon: [{ x: bb.x0 * k, y: bb.y0 * k }, { x: bb.x1 * k, y: bb.y0 * k }, { x: bb.x1 * k, y: bb.y1 * k }, { x: bb.x0 * k, y: bb.y1 * k }], dir: horiz === 0 ? { x: 0, y: 1 } : { x: 1, y: 0 }, width, run, treads, rise: st.wallHeight, source: { origin: "dxf", layer: items[i].layer }, assumed: ["total rise (storey height setting)", treadLines < 3 ? "tread count (riser assumption)" : "direction of travel (assumed upward along the longer side)"] }); }
  return stairs;
}
void EPS; void len;
