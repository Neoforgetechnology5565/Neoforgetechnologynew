/** Extracted-geometry summary of a 2D drawing: layers (with entity types and assigned role), extents, units, labels, blocks and a compact 2D preview. */
import { DxfDoc, DxfEntity, explode, polyPoints, resolveUnits, docExtents } from "./dxf";
import { guessLayerRoles } from "./plan";
import { arcPoints } from "./geom";
import type { Settings } from "./model";

export interface LayerRow { name: string; role: string; confidence: string; reason: string; entities: number; types: Record<string, number>; color: number; off: boolean }
export interface DocAnalysis {
  format: string; version: string; units: ReturnType<typeof resolveUnits>; extents: { x0: number; y0: number; x1: number; y1: number; width: number; height: number } | null; entityCounts: Record<string, number>; layers: LayerRow[]; blocks: { name: string; entities: number; inserts: number }[];
  texts: { text: string; layer: string; x: number; y: number }[]; dimensions: { count: number; withMeasurement: number }; warnings: string[]; geometry: Record<string, number[][]>; geometryPoints: number; geometryTruncated: boolean;
}
export function analyzeDoc(doc: DxfDoc, st: Pick<Settings, "unitsOverride" | "layerMap">, maxPoints = 60000): DocAnalysis {
  const ents = explode(doc); const units = resolveUnits(doc, ents, st.unitsOverride); const k = units.toM; const guess = guessLayerRoles(doc, ents); const rows = new Map<string, LayerRow>();
  for (const g of guess) rows.set(g.layer, { name: g.layer, role: st.layerMap?.[g.layer] ?? g.role, confidence: st.layerMap?.[g.layer] ? "user" : g.confidence, reason: st.layerMap?.[g.layer] ? "set by the user" : g.reason, entities: 0, types: {}, color: doc.layers[g.layer]?.color ?? 7, off: !!doc.layers[g.layer]?.off });
  const counts: Record<string, number> = {}; const texts: DocAnalysis["texts"] = []; let dims = 0, dimsM = 0; const geometry: Record<string, number[][]> = {}; let pts = 0, truncated = false; const inserts: Record<string, number> = {};
  const addPath = (layer: string, path: { x: number; y: number }[], closed = false) => { if (pts > maxPoints) { truncated = true; return; } const flat: number[] = []; for (const p of path) flat.push(Math.round(p.x * k * 1000) / 1000, Math.round(p.y * k * 1000) / 1000); if (closed && path.length) flat.push(flat[0], flat[1]); pts += path.length; (geometry[layer] ??= []).push(flat); };
  for (const e of ents) { const row = rows.get(e.layer); const kind = e.t === "OTHER" ? e.kind : e.t; counts[kind] = (counts[kind] ?? 0) + 1; if (row) { row.entities++; row.types[kind] = (row.types[kind] ?? 0) + 1; }
    if (e.t === "TEXT") texts.push({ text: e.text.trim(), layer: e.layer, x: e.p.x * k, y: e.p.y * k }); else if (e.t === "DIM") { dims++; if (e.measurement) dimsM++; } else if (e.t === "INSERT") inserts[e.name] = (inserts[e.name] ?? 0) + 1;
    else if (e.t === "LINE") addPath(e.layer, [e.a, e.b]); else if (e.t === "POLY") addPath(e.layer, polyPoints(e, 0.1 / k), e.closed); else if (e.t === "ARC") addPath(e.layer, arcPoints(e.c, e.r, e.a0, e.a1, Math.max(e.r / 12, 1e-6))); else if (e.t === "CIRCLE") addPath(e.layer, arcPoints(e.c, e.r, 0, Math.PI * 2 - 1e-6, Math.max(e.r / 12, 1e-6)), true); }
  const ex = docExtents(ents);
  return { format: doc.version, version: doc.version, units, extents: ex ? { x0: ex.x0 * k, y0: ex.y0 * k, x1: ex.x1 * k, y1: ex.y1 * k, width: (ex.x1 - ex.x0) * k, height: (ex.y1 - ex.y0) * k } : null, entityCounts: counts, layers: [...rows.values()].sort((a, b) => b.entities - a.entities), blocks: Object.values(doc.blocks).map((b) => ({ name: b.name, entities: b.entities.length, inserts: inserts[b.name] ?? 0 })).filter((b) => !b.name.startsWith("*")), texts: texts.slice(0, 200), dimensions: { count: dims, withMeasurement: dimsM }, warnings: doc.warnings, geometry, geometryPoints: pts, geometryTruncated: truncated };
}
export type { DxfEntity };
