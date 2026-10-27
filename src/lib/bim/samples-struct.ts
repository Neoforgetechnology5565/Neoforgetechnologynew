/** Synthetic structural drawings with KNOWN content (millimetres), plus a second revision with known differences. Not a real building; not an engineering design. */
import { writeDxf, type DxfEntity } from "./dxf";

export const STRUCT_TRUTH = { columns: 12, gridLines: 7, beams: 17, footings: 11, offGridColumns: 1, unlabelledBeams: 2, unsupportedBeamEnds: 1, columnsWithoutFooting: 1, sizeMismatches: 1, roundColumns: 1 };
export const STRUCT_DIFF_TRUTH = { columnsAdded: 1, columnsRemoved: 1, columnsMoved: 1, columnsResized: 1, beamsRemoved: 3, beamsModified: 3, beamsAdded: 0 };
const XS = [0, 6000, 12000, 18000], YS = [0, 5000, 10000], XN = ["A", "B", "C", "D"], YN = ["1", "2", "3"];
type Opts = { revB?: boolean };
export function structuralDxf(o: Opts = {}): string {
  const e: DxfEntity[] = []; const L = (layer: string, x0: number, y0: number, x1: number, y1: number) => e.push({ t: "LINE", layer, a: { x: x0, y: y0 }, b: { x: x1, y: y1 } });
  const T = (layer: string, x: number, y: number, text: string, h = 200) => e.push({ t: "TEXT", layer, p: { x, y }, text, height: h, rotation: 0 });
  const rect = (layer: string, cx: number, cy: number, w: number, d: number) => e.push({ t: "POLY", layer, closed: true, pts: [{ x: cx - w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy + d / 2 }, { x: cx - w / 2, y: cy + d / 2 }] });
  // grid lines with labels at the ends
  XS.forEach((x, i) => { L("S-GRID", x, -1500, x, 11500); e.push({ t: "CIRCLE", layer: "S-GRID", c: { x, y: -1900 }, r: 400 }); T("S-GRID", x - 100, -2000, XN[i], 300); });
  YS.forEach((y, j) => { L("S-GRID", -1500, y, 19500, y); e.push({ t: "CIRCLE", layer: "S-GRID", c: { x: -1900, y }, r: 400 }); T("S-GRID", -2000, y - 100, YN[j], 300); });
  const removed = o.revB ? new Set(["B-3"]) : new Set<string>();
  const colPos: Record<string, { x: number; y: number; w: number; d: number; n: number; round?: boolean }> = {}; let n = 0;
  YS.forEach((y, j) => XS.forEach((x, i) => { n++; const k = `${XN[i]}-${YN[j]}`; let cx = x; const cy = y; let w = 400, d = 400; if (k === "D-3") cx = x + 350; if (k === "C-3") { w = 450; d = 450; } if (o.revB && k === "A-2") cx += 100; if (o.revB && k === "D-1") { w = 500; d = 500; } colPos[k] = { x: cx, y: cy, w, d, n, round: k === "C-2" }; }));
  for (const [k, c] of Object.entries(colPos)) { if (removed.has(k)) continue; if (c.round) e.push({ t: "CIRCLE", layer: "S-COLS", c: { x: c.x, y: c.y }, r: 250 }); else rect("S-COLS", c.x, c.y, c.w, c.d); T("S-COLS-TEXT", c.x + 260, c.y + 260, `C${c.n} ${c.round ? "D500" : k === "C-3" ? "400x400" : `${c.w}x${c.d}`}`, 160); }
  if (o.revB) { colPos["E-X"] = { x: 9000, y: 7500, w: 400, d: 400, n: 13 }; rect("S-COLS", 9000, 7500, 400, 400); T("S-COLS-TEXT", 9260, 7760, "C13 400x400", 160); }
  // footings (11 in rev A: every column except B-2)
  for (const [k, c] of Object.entries(colPos)) { if (removed.has(k) || k === "B-2" || k === "E-X") continue; rect("S-FNDN", c.x, c.y, 1600, 1600); }
  // beams: x-direction rows (3 rows x 3 spans = 9) and y-direction (4 columns x 2 spans = 8)
  let bn = 0; const beam = (a: string, b: string, label: boolean, short = 0) => { if (removed.has(a) || removed.has(b)) return; const A = colPos[a], B = colPos[b]; bn++; const dx = B.x - A.x, dy = B.y - A.y; const len = Math.hypot(dx, dy); const ex = B.x - (dx / len) * short, ey = B.y - (dy / len) * short; L("S-BEAM", A.x, A.y, ex, ey); if (label) T("S-BEAM-TEXT", (A.x + ex) / 2 - 500, (A.y + ey) / 2 + 150, `B${bn} ${dy === 0 ? "300x600" : "250x500"}`, 160); };
  YN.forEach((yn) => { for (let i = 0; i < 3; i++) { const a = `${XN[i]}-${yn}`, b = `${XN[i + 1]}-${yn}`; beam(a, b, !(a === "B-3" && b === "C-3") && !(a === "A-1" && b === "B-1"), a === "C-1" ? 500 : 0); } });
  XN.forEach((xn) => { for (let j = 0; j < 2; j++) beam(`${xn}-${YN[j]}`, `${xn}-${YN[j + 1]}`, true); });
  T("S-ANNO", 0, -3500, o.revB ? "FOUNDATION AND FRAMING PLAN - REV B (SYNTHETIC SAMPLE)" : "FOUNDATION AND FRAMING PLAN - REV A (SYNTHETIC SAMPLE)", 300);
  return writeDxf({ insunits: 4, layers: [{ name: "S-GRID", color: 1 }, { name: "S-COLS", color: 3 }, { name: "S-COLS-TEXT", color: 2 }, { name: "S-BEAM", color: 5 }, { name: "S-BEAM-TEXT", color: 4 }, { name: "S-FNDN", color: 8 }, { name: "S-ANNO", color: 7 }], entities: e } as never);
}
