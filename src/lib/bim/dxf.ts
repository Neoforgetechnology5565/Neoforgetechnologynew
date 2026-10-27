/**
 * ASCII DXF reader/writer written for this project (no third-party parser). Reads LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, CIRCLE, ELLIPSE(bbox only), SPLINE (control polygon, flagged approximate),
 * TEXT, MTEXT, INSERT (block references, exploded with scale/rotation), DIMENSION, 3DFACE/SOLID, POINT. Binary DXF and DWG are rejected with a clear message.
 */
import { arcPoints, bulgeArc, rot, type V2 } from "./geom";

export interface DxfPt extends V2 { bulge?: number }
export type DxfEntity =
  | { t: "LINE"; layer: string; a: V2; b: V2; z?: number; h?: string }
  | { t: "POLY"; layer: string; pts: DxfPt[]; closed: boolean; h?: string; width?: number }
  | { t: "ARC"; layer: string; c: V2; r: number; a0: number; a1: number; h?: string }
  | { t: "CIRCLE"; layer: string; c: V2; r: number; h?: string }
  | { t: "TEXT"; layer: string; p: V2; text: string; height: number; rotation: number; h?: string }
  | { t: "INSERT"; layer: string; name: string; p: V2; sx: number; sy: number; rotation: number; h?: string; attribs?: Record<string, string> }
  | { t: "DIM"; layer: string; p: V2; p1?: V2; p2?: V2; text: string; measurement?: number; h?: string }
  | { t: "FACE"; layer: string; pts: V2[]; h?: string }
  | { t: "POINT"; layer: string; p: V2; h?: string }
  | { t: "OTHER"; layer: string; kind: string; h?: string };
export interface DxfBlock { name: string; base: V2; entities: DxfEntity[] }
export interface DxfLayer { name: string; color: number; off: boolean; frozen: boolean }
export interface DxfDoc {
  version: string; insunits: number; unitsKnown: boolean; layers: Record<string, DxfLayer>; blocks: Record<string, DxfBlock>; entities: DxfEntity[];
  headerExtents?: { min: V2; max: V2 }; warnings: string[]; counts: Record<string, number>;
}
export const INSUNITS: Record<number, { name: string; toM: number }> = { 0: { name: "unitless", toM: 1 }, 1: { name: "inches", toM: 0.0254 }, 2: { name: "feet", toM: 0.3048 }, 3: { name: "miles", toM: 1609.344 }, 4: { name: "millimetres", toM: 0.001 }, 5: { name: "centimetres", toM: 0.01 }, 6: { name: "metres", toM: 1 }, 7: { name: "kilometres", toM: 1000 }, 8: { name: "microinches", toM: 2.54e-8 }, 9: { name: "mils", toM: 2.54e-5 }, 10: { name: "yards", toM: 0.9144 } };

export class DxfError extends Error {}
const MAX_ENTITIES = 400_000;

function pairs(text: string): [number, string][] {
  const lines = text.split(/\r\n|\n|\r/); const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const c = parseInt(lines[i].trim(), 10); if (!Number.isFinite(c)) throw new DxfError(`Not a valid ASCII DXF: expected a group code on line ${i + 1}.`); out.push([c, lines[i + 1].replace(/\s+$/, "")]); }
  return out;
}
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

export function parseDxf(input: string | Buffer): DxfDoc {
  let text = typeof input === "string" ? input : input.toString("latin1");
  if (text.startsWith("AutoCAD Binary DXF")) throw new DxfError("Binary DXF is not supported. Save the drawing as ASCII DXF (or R12/2000 ASCII) and upload again.");
  if (/^AC10\d\d/.test(text.slice(0, 8)) ) throw new DxfError("This looks like a DWG file, not a DXF. DWG is not parsed natively; convert it to DXF (e.g. with ODA File Converter or LibreDWG) and upload the DXF.");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const P = pairs(text); const doc: DxfDoc = { version: "unknown", insunits: 0, unitsKnown: false, layers: {}, blocks: {}, entities: [], warnings: [], counts: {} };
  let i = 0; const n = P.length; if (!P.some(([c, v]) => c === 0 && v === "SECTION")) throw new DxfError("Not a DXF file: no SECTION found.");
  const count = (k: string) => { doc.counts[k] = (doc.counts[k] ?? 0) + 1; };
  const readEntity = (): DxfEntity | null => {
    const kind = P[i][1]; i++; const g: [number, string][] = []; while (i < n && P[i][0] !== 0) { g.push(P[i]); i++; }
    const first = (c: number) => g.find((p) => p[0] === c)?.[1]; const all = (c: number) => g.filter((p) => p[0] === c).map((p) => p[1]);
    const layer = first(8) ?? "0"; const h = first(5);
    switch (kind) {
      case "LINE": return { t: "LINE", layer, a: { x: num(first(10) ?? "0"), y: num(first(20) ?? "0") }, b: { x: num(first(11) ?? "0"), y: num(first(21) ?? "0") }, z: num(first(30) ?? "0"), h };
      case "LWPOLYLINE": { const pts: DxfPt[] = []; let cur: DxfPt | null = null; for (const [c, v] of g) { if (c === 10) { cur = { x: num(v), y: 0 }; pts.push(cur); } else if (c === 20 && cur) cur.y = num(v); else if (c === 42 && cur) cur.bulge = num(v); } return { t: "POLY", layer, pts, closed: (parseInt(first(70) ?? "0", 10) & 1) === 1, h, width: first(43) ? num(first(43)!) : undefined }; }
      case "POLYLINE": { const closed = (parseInt(first(70) ?? "0", 10) & 1) === 1; const pts: DxfPt[] = []; while (i < n && !(P[i][0] === 0 && P[i][1] === "SEQEND")) { if (P[i][0] === 0 && P[i][1] === "VERTEX") { i++; const vg: [number, string][] = []; while (i < n && P[i][0] !== 0) { vg.push(P[i]); i++; } const f = (c: number) => vg.find((p) => p[0] === c)?.[1]; const flags = parseInt(f(70) ?? "0", 10); if (!(flags & 16) && !(flags & 64)) pts.push({ x: num(f(10) ?? "0"), y: num(f(20) ?? "0"), bulge: f(42) ? num(f(42)!) : undefined }); } else i++; } if (i < n) { i++; while (i < n && P[i][0] !== 0) i++; } return { t: "POLY", layer, pts, closed, h }; }
      case "ARC": return { t: "ARC", layer, c: { x: num(first(10) ?? "0"), y: num(first(20) ?? "0") }, r: num(first(40) ?? "0"), a0: (num(first(50) ?? "0") * Math.PI) / 180, a1: (num(first(51) ?? "0") * Math.PI) / 180, h };
      case "CIRCLE": return { t: "CIRCLE", layer, c: { x: num(first(10) ?? "0"), y: num(first(20) ?? "0") }, r: num(first(40) ?? "0"), h };
      case "TEXT": return { t: "TEXT", layer, p: { x: num(first(10) ?? "0"), y: num(first(20) ?? "0") }, text: first(1) ?? "", height: num(first(40) ?? "0"), rotation: (num(first(50) ?? "0") * Math.PI) / 180, h };
      case "MTEXT": { const raw = all(3).join("") + (first(1) ?? ""); const txt = raw.replace(/\\P/g, "\n").replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, ""); return { t: "TEXT", layer, p: { x: num(first(10) ?? "0"), y: num(first(20) ?? "0") }, text: txt, height: num(first(40) ?? "0"), rotation: (num(first(50) ?? "0") * Math.PI) / 180, h }; }
      case "INSERT": { const attribs: Record<string, string> = {}; // ATTRIB entities follow when flag 66 is set
        if (first(66) === "1") { while (i < n && P[i][0] === 0 && P[i][1] === "ATTRIB") { i++; const ag: [number, string][] = []; while (i < n && P[i][0] !== 0) { ag.push(P[i]); i++; } const tag = ag.find((p) => p[0] === 2)?.[1], val = ag.find((p) => p[0] === 1)?.[1]; if (tag) attribs[tag] = val ?? ""; } if (i < n && P[i][1] === "SEQEND") { i++; while (i < n && P[i][0] !== 0) i++; } }
        return { t: "INSERT", layer, name: first(2) ?? "", p: { x: num(first(10) ?? "0"), y: num(first(20) ?? "0") }, sx: first(41) ? num(first(41)!) : 1, sy: first(42) ? num(first(42)!) : first(41) ? num(first(41)!) : 1, rotation: (num(first(50) ?? "0") * Math.PI) / 180, h, attribs: Object.keys(attribs).length ? attribs : undefined }; }
      case "DIMENSION": return { t: "DIM", layer, p: { x: num(first(10) ?? "0"), y: num(first(20) ?? "0") }, p1: first(13) ? { x: num(first(13)!), y: num(first(23) ?? "0") } : undefined, p2: first(14) ? { x: num(first(14)!), y: num(first(24) ?? "0") } : undefined, text: first(1) ?? "", measurement: first(42) ? num(first(42)!) : undefined, h };
      case "3DFACE": case "SOLID": { const pts: V2[] = []; for (const base of [10, 11, 12, 13]) if (first(base)) pts.push({ x: num(first(base)!), y: num(first(base + 10) ?? "0") }); return { t: "FACE", layer, pts, h }; }
      case "POINT": return { t: "POINT", layer, p: { x: num(first(10) ?? "0"), y: num(first(20) ?? "0") }, h };
      case "SPLINE": { const pts: DxfPt[] = []; let cur: DxfPt | null = null; for (const [c, v] of g) { if (c === 10) { cur = { x: num(v), y: 0 }; pts.push(cur); } else if (c === 20 && cur) cur.y = num(v); } doc.warnings.push("SPLINE entities are approximated by their control polygon."); return { t: "POLY", layer, pts, closed: false, h }; }
      case "ELLIPSE": case "HATCH": case "LEADER": case "MLINE": case "IMAGE": case "VIEWPORT": case "ATTDEF": case "WIPEOUT": case "REGION": case "3DSOLID": case "BODY": case "MLEADER": case "TOLERANCE": case "RAY": case "XLINE": return { t: "OTHER", layer, kind, h };
      default: return { t: "OTHER", layer, kind, h };
    }
  };
  const readEntitiesUntil = (end: string): DxfEntity[] => { const out: DxfEntity[] = []; while (i < n && !(P[i][0] === 0 && P[i][1] === end)) { if (P[i][0] === 0 && P[i][1] !== "ENDSEC") { const k = P[i][1]; const e = readEntity(); if (e) { count(e.t === "OTHER" ? e.kind : k); out.push(e); if (out.length > MAX_ENTITIES) throw new DxfError(`Too many entities (limit ${MAX_ENTITIES.toLocaleString()}).`); } } else if (P[i][0] === 0 && P[i][1] === "ENDSEC") break; else i++; } return out; };
  while (i < n) {
    if (!(P[i][0] === 0 && P[i][1] === "SECTION")) { i++; continue; } i++; const name = P[i]?.[0] === 2 ? P[i][1] : ""; i++;
    if (name === "HEADER") { while (i < n && !(P[i][0] === 0 && P[i][1] === "ENDSEC")) { if (P[i][0] === 9) { const key = P[i][1]; i++; const vals: [number, string][] = []; while (i < n && P[i][0] !== 9 && P[i][0] !== 0) { vals.push(P[i]); i++; } if (key === "$ACADVER") doc.version = vals[0]?.[1] ?? "unknown"; if (key === "$INSUNITS") { doc.insunits = parseInt(vals[0]?.[1] ?? "0", 10) || 0; doc.unitsKnown = doc.insunits !== 0; } if (key === "$EXTMIN") (doc.headerExtents ??= { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }).min = { x: num(vals.find((v) => v[0] === 10)?.[1] ?? "0"), y: num(vals.find((v) => v[0] === 20)?.[1] ?? "0") }; if (key === "$EXTMAX") (doc.headerExtents ??= { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }).max = { x: num(vals.find((v) => v[0] === 10)?.[1] ?? "0"), y: num(vals.find((v) => v[0] === 20)?.[1] ?? "0") }; } else i++; } }
    else if (name === "TABLES") { while (i < n && !(P[i][0] === 0 && P[i][1] === "ENDSEC")) { if (P[i][0] === 0 && P[i][1] === "LAYER") { i++; const g: [number, string][] = []; while (i < n && P[i][0] !== 0) { g.push(P[i]); i++; } const nm = g.find((p) => p[0] === 2)?.[1]; if (nm) { const col = parseInt(g.find((p) => p[0] === 62)?.[1] ?? "7", 10); const fl = parseInt(g.find((p) => p[0] === 70)?.[1] ?? "0", 10); doc.layers[nm] = { name: nm, color: Math.abs(col), off: col < 0, frozen: (fl & 1) === 1 }; } } else i++; } }
    else if (name === "BLOCKS") { while (i < n && !(P[i][0] === 0 && P[i][1] === "ENDSEC")) { if (P[i][0] === 0 && P[i][1] === "BLOCK") { i++; const g: [number, string][] = []; while (i < n && P[i][0] !== 0) { g.push(P[i]); i++; } const nm = g.find((p) => p[0] === 2)?.[1] ?? ""; const base = { x: num(g.find((p) => p[0] === 10)?.[1] ?? "0"), y: num(g.find((p) => p[0] === 20)?.[1] ?? "0") }; const saved = { ...doc.counts }; const ents = readEntitiesUntil("ENDBLK"); doc.counts = saved; doc.blocks[nm] = { name: nm, base, entities: ents }; } else i++; } }
    else if (name === "ENTITIES") { doc.entities = readEntitiesUntil("ENDSEC"); }
    else { while (i < n && !(P[i][0] === 0 && P[i][1] === "ENDSEC")) i++; }
    if (i < n) i++;
  }
  for (const e of [...doc.entities, ...Object.values(doc.blocks).flatMap((b) => b.entities)]) if (!doc.layers[e.layer]) doc.layers[e.layer] = { name: e.layer, color: 7, off: false, frozen: false };
  if (!doc.entities.length) doc.warnings.push("The ENTITIES section is empty (geometry may live only in blocks or paper space).");
  return doc;
}

/** Flatten block references recursively (depth ≤ 6). Entities on layer "0" inside a block inherit the INSERT's layer. */
export function explode(doc: DxfDoc, ents: DxfEntity[] = doc.entities, depth = 0): DxfEntity[] {
  const out: DxfEntity[] = [];
  for (const e of ents) {
    if (e.t !== "INSERT") { out.push(e); continue; }
    const b = doc.blocks[e.name]; if (!b || depth >= 6) { out.push(e); continue; }
    const tf = (p: V2): V2 => { const q = rot({ x: (p.x - b.base.x) * e.sx, y: (p.y - b.base.y) * e.sy }, e.rotation); return { x: q.x + e.p.x, y: q.y + e.p.y }; };
    for (const c of explode(doc, b.entities, depth + 1)) {
      const layer = c.layer === "0" ? e.layer : c.layer; const origin = c.h ?? e.h;
      switch (c.t) {
        case "LINE": out.push({ ...c, layer, a: tf(c.a), b: tf(c.b), h: origin }); break;
        case "POLY": { const flip = e.sx * e.sy < 0; out.push({ ...c, layer, pts: c.pts.map((p) => ({ ...tf(p), bulge: p.bulge !== undefined ? (flip ? -p.bulge : p.bulge) : undefined })), h: origin }); break; }
        case "ARC": { const k = Math.abs(e.sx); const mirrored = e.sx * e.sy < 0; const a0 = mirrored ? Math.PI - c.a1 + e.rotation : c.a0 + e.rotation, a1 = mirrored ? Math.PI - c.a0 + e.rotation : c.a1 + e.rotation; out.push({ ...c, layer, c: tf(c.c), r: c.r * k, a0, a1, h: origin }); break; }
        case "CIRCLE": out.push({ ...c, layer, c: tf(c.c), r: c.r * Math.abs(e.sx), h: origin }); break;
        case "TEXT": out.push({ ...c, layer, p: tf(c.p), rotation: c.rotation + e.rotation, height: c.height * Math.abs(e.sy), h: origin }); break;
        case "INSERT": out.push({ ...c, layer, p: tf(c.p), h: origin }); break;
        case "FACE": out.push({ ...c, layer, pts: c.pts.map(tf), h: origin }); break;
        case "POINT": out.push({ ...c, layer, p: tf(c.p), h: origin }); break;
        default: out.push({ ...c, layer, h: origin });
      }
    }
  }
  return out;
}

/** Polyline vertices with arcs tessellated. */
export function polyPoints(e: Extract<DxfEntity, { t: "POLY" }>, maxSeg = 0.05): V2[] {
  const pts: V2[] = []; const m = e.pts.length; const segs = e.closed ? m : m - 1;
  for (let k = 0; k < segs; k++) { const a = e.pts[k], b = e.pts[(k + 1) % m]; const arc = bulgeArc(a, b, a.bulge ?? 0, maxSeg); if (k > 0) arc.shift(); pts.push(...arc); }
  if (m === 1) pts.push(e.pts[0]); return e.closed && pts.length > 1 ? pts.slice(0, -1) : pts;
}
export function entityBounds(e: DxfEntity): { x0: number; y0: number; x1: number; y1: number } | null {
  switch (e.t) {
    case "LINE": return { x0: Math.min(e.a.x, e.b.x), y0: Math.min(e.a.y, e.b.y), x1: Math.max(e.a.x, e.b.x), y1: Math.max(e.a.y, e.b.y) };
    case "POLY": { const p = polyPoints(e); if (!p.length) return null; return { x0: Math.min(...p.map((q) => q.x)), y0: Math.min(...p.map((q) => q.y)), x1: Math.max(...p.map((q) => q.x)), y1: Math.max(...p.map((q) => q.y)) }; }
    case "ARC": { const p = arcPoints(e.c, e.r, e.a0, e.a1, e.r / 8 || 1); return { x0: Math.min(...p.map((q) => q.x)), y0: Math.min(...p.map((q) => q.y)), x1: Math.max(...p.map((q) => q.x)), y1: Math.max(...p.map((q) => q.y)) }; }
    case "CIRCLE": return { x0: e.c.x - e.r, y0: e.c.y - e.r, x1: e.c.x + e.r, y1: e.c.y + e.r };
    case "TEXT": case "INSERT": case "POINT": return { x0: e.p.x, y0: e.p.y, x1: e.p.x, y1: e.p.y };
    case "FACE": return e.pts.length ? { x0: Math.min(...e.pts.map((q) => q.x)), y0: Math.min(...e.pts.map((q) => q.y)), x1: Math.max(...e.pts.map((q) => q.x)), y1: Math.max(...e.pts.map((q) => q.y)) } : null;
    default: return null;
  }
}
export function docExtents(ents: DxfEntity[]) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const e of ents) { const b = entityBounds(e); if (!b) continue; x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); } return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null; }

/** Units: declared ($INSUNITS) or a flagged guess from the drawing size (a house plan is 5–60 m across). */
export function resolveUnits(doc: DxfDoc, ents: DxfEntity[], override?: number) {
  if (override && INSUNITS[override]) return { code: override, name: INSUNITS[override].name, toM: INSUNITS[override].toM, declared: doc.unitsKnown && doc.insunits === override, ambiguous: false, note: override === doc.insunits ? "declared in the file ($INSUNITS)" : "set by the user" };
  if (doc.unitsKnown && INSUNITS[doc.insunits]) return { code: doc.insunits, name: INSUNITS[doc.insunits].name, toM: INSUNITS[doc.insunits].toM, declared: true, ambiguous: false, note: "declared in the file ($INSUNITS)" };
  const ex = docExtents(ents); const size = ex ? Math.max(ex.x1 - ex.x0, ex.y1 - ex.y0) : 0; const code = size > 1000 ? 4 : size > 200 ? 5 : size > 0 ? 6 : 4;
  return { code, name: INSUNITS[code].name, toM: INSUNITS[code].toM, declared: false, ambiguous: true, note: `the file does not declare units; guessed ${INSUNITS[code].name} from a drawing size of ${size.toFixed(1)} units. Please confirm.` };
}

/* ───────── writer (R12-compatible ASCII; opens in any DXF reader) ───────── */
export interface DxfOut { layers: { name: string; color: number }[]; entities: DxfEntity[]; insunits?: number }
const g = (c: number, v: string | number) => `${c}\n${v}\n`;
export function writeDxf(o: DxfOut): string {
  let s = g(0, "SECTION") + g(2, "HEADER") + g(9, "$ACADVER") + g(1, "AC1009") + g(9, "$INSUNITS") + g(70, o.insunits ?? 6) + g(0, "ENDSEC");
  s += g(0, "SECTION") + g(2, "TABLES") + g(0, "TABLE") + g(2, "LAYER") + g(70, o.layers.length) + o.layers.map((l) => g(0, "LAYER") + g(2, l.name) + g(70, 0) + g(62, l.color) + g(6, "CONTINUOUS")).join("") + g(0, "ENDTAB") + g(0, "ENDSEC");
  s += g(0, "SECTION") + g(2, "ENTITIES");
  for (const e of o.entities) {
    const base = (k: string) => g(0, k) + g(8, e.layer);
    if (e.t === "LINE") s += base("LINE") + g(10, e.a.x) + g(20, e.a.y) + g(30, e.z ?? 0) + g(11, e.b.x) + g(21, e.b.y) + g(31, e.z ?? 0);
    else if (e.t === "POLY") { s += base("POLYLINE") + g(66, 1) + g(70, e.closed ? 1 : 0); for (const p of e.pts) s += g(0, "VERTEX") + g(8, e.layer) + g(10, p.x) + g(20, p.y) + (p.bulge ? g(42, p.bulge) : ""); s += g(0, "SEQEND") + g(8, e.layer); }
    else if (e.t === "ARC") s += base("ARC") + g(10, e.c.x) + g(20, e.c.y) + g(40, e.r) + g(50, (e.a0 * 180) / Math.PI) + g(51, (e.a1 * 180) / Math.PI);
    else if (e.t === "CIRCLE") s += base("CIRCLE") + g(10, e.c.x) + g(20, e.c.y) + g(40, e.r);
    else if (e.t === "DIM") s += base("DIMENSION") + g(1, e.text) + g(10, e.p.x) + g(20, e.p.y) + g(70, 1) + (e.p1 ? g(13, e.p1.x) + g(23, e.p1.y) : "") + (e.p2 ? g(14, e.p2.x) + g(24, e.p2.y) : "") + (e.measurement !== undefined ? g(42, e.measurement) : "");
    else if (e.t === "TEXT") s += base("TEXT") + g(10, e.p.x) + g(20, e.p.y) + g(40, e.height) + g(1, e.text) + g(50, (e.rotation * 180) / Math.PI);
  }
  return s + g(0, "ENDSEC") + g(0, "EOF");
}
