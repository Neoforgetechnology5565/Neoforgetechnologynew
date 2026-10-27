/**
 * Sample projects with KNOWN geometry, generated in code so tests can compare extracted values with ground truth.
 * They are synthetic teaching files, not real buildings. Coordinates are written in millimetres (INSUNITS = 4).
 */
import { writeDxf, type DxfEntity } from "./dxf";
import type { MepLayerConfig } from "./model";

const mm = (v: number) => Math.round(v * 1000 * 1000) / 1000;
type Ln = Extract<DxfEntity, { t: "LINE" }>;
const line = (layer: string, x0: number, y0: number, x1: number, y1: number): Ln => ({ t: "LINE", layer, a: { x: mm(x0), y: mm(y0) }, b: { x: mm(x1), y: mm(y1) } });

export const HOUSE_TRUTH = {
  name: "Two-bedroom house (synthetic)", units: "millimetres", walls: 7, exteriorWalls: 4, interiorWalls: 3, doors: 5, windows: 6, rooms: 4,
  wallThickness: { exterior: 0.3, interior: 0.15 }, footprintCentreline: { w: 10, h: 8 },
  roomAreas: { "Living room": 22.800625, "Bedroom 1": 13.250625, Kitchen: 18.025625, "Bedroom 2": 18.025625 } as Record<string, number>,
  totalNetArea: 22.800625 + 13.250625 + 18.025625 + 18.025625,
  doorWidths: [1.0, 0.9, 0.9, 0.9, 0.9], windowWidths: [1.5, 1.2, 1.2, 1.2, 1.2, 1.5],
};

export function houseArchDxf(): string {
  const W = "A-WALL", D = "A-DOOR", G = "A-GLAZ", T = "A-ROOM-NAME", M = "A-DIMS"; const e: DxfEntity[] = []; const E = 0.15, I = 0.075;
  // exterior faces (outer y=-E / inner y=E etc.). South wall has the entrance gap x 2.0..3.0
  const ext = (x0: number, y0: number, x1: number, y1: number) => e.push(line(W, x0, y0, x1, y1));
  ext(-E, -E, 2.0, -E); ext(3.0, -E, 10 + E, -E); ext(E, E, 2.0, E); ext(3.0, E, 10 - E, E); e.push(line(W, 2.0, -E, 2.0, E), line(W, 3.0, -E, 3.0, E));
  ext(-E, 8 + E, 10 + E, 8 + E); ext(E, 8 - E, 10 - E, 8 - E); ext(-E, -E, -E, 8 + E); ext(E, E, E, 8 - E); ext(10 + E, -E, 10 + E, 8 + E); ext(10 - E, E, 10 - E, 8 - E);
  // interior wall A: x=5, from y=E to 8-E, faces broken at joints with B (east face y 3.925..4.075) and C (west face 4.925..5.075), doors at y 1.55..2.45 and 5.55..6.45
  const aWest = [[E, 1.55], [2.45, 5 - I], [5 + I, 5.55], [6.45, 8 - E]], aEast = [[E, 1.55], [2.45, 4 - I], [4 + I, 5.55], [6.45, 8 - E]];
  for (const [a, b] of aWest) e.push(line(W, 5 - I, a, 5 - I, b)); for (const [a, b] of aEast) e.push(line(W, 5 + I, a, 5 + I, b));
  for (const y of [1.55, 2.45, 5.55, 6.45]) e.push(line(W, 5 - I, y, 5 + I, y));
  // wall B: y=4, x from 5+I to 10-E, door at x 7.05..7.95
  for (const [a, b] of [[5 + I, 7.05], [7.95, 10 - E]]) { e.push(line(W, a, 4 - I, b, 4 - I), line(W, a, 4 + I, b, 4 + I)); } for (const x of [7.05, 7.95]) e.push(line(W, x, 4 - I, x, 4 + I));
  // wall C: y=5, x from E to 5-I, door at x 2.05..2.95
  for (const [a, b] of [[E, 2.05], [2.95, 5 - I]]) { e.push(line(W, a, 5 - I, b, 5 - I), line(W, a, 5 + I, b, 5 + I)); } for (const x of [2.05, 2.95]) e.push(line(W, x, 5 - I, x, 5 + I));
  // door symbols: arc from the free end on the wall axis around the hinge, plus the leaf line
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => e.push({ t: "ARC", layer: D, c: { x: mm(cx), y: mm(cy) }, r: mm(r), a0: (a0 * Math.PI) / 180, a1: (a1 * Math.PI) / 180 });
  arc(2.0, 0, 1.0, 0, 90); e.push(line(D, 2.0, 0, 2.0, 1.0));            // entrance, hinge on the west jamb, swings into the living room
  arc(5, 1.55, 0.9, 0, 90); e.push(line(D, 5, 1.55, 5.9, 1.55));         // living ↔ kitchen
  arc(5, 5.55, 0.9, 0, 90); e.push(line(D, 5, 5.55, 5.9, 5.55));         // bedroom 1 ↔ bedroom 2
  arc(7.05, 4, 0.9, 0, 90); e.push(line(D, 7.05, 4, 7.05, 4.9));         // kitchen ↔ bedroom 2
  arc(2.05, 5, 0.9, 0, 90); e.push(line(D, 2.05, 5, 2.05, 5.9));         // living ↔ bedroom 1
  // windows: rectangle across the wall thickness with a centre line
  const win = (cx: number, cy: number, w: number, vertical: boolean) => { const tw = 0.3; const [dx, dy] = vertical ? [tw / 2, w / 2] : [w / 2, tw / 2]; e.push({ t: "POLY", layer: G, closed: true, pts: [{ x: mm(cx - dx), y: mm(cy - dy) }, { x: mm(cx + dx), y: mm(cy - dy) }, { x: mm(cx + dx), y: mm(cy + dy) }, { x: mm(cx - dx), y: mm(cy + dy) }] }); e.push(vertical ? line(G, cx, cy - dy, cx, cy + dy) : line(G, cx - dx, cy, cx + dx, cy)); };
  win(0, 2.5, 1.5, true); win(0, 6.5, 1.2, true); win(2.5, 8, 1.2, false); win(7.5, 8, 1.2, false); win(10, 2, 1.2, true); win(10, 6, 1.5, true);
  const txt = (s: string, x: number, y: number) => e.push({ t: "TEXT", layer: T, p: { x: mm(x), y: mm(y) }, text: s, height: 200, rotation: 0 });
  txt("Living room", 1.6, 2.2); txt("Bedroom 1", 1.8, 6.4); txt("Kitchen", 6.5, 1.5); txt("Bedroom 2", 6.5, 6.2);
  e.push({ t: "DIM", layer: M, p: { x: 0, y: mm(-1) }, p1: { x: 0, y: 0 }, p2: { x: mm(10), y: 0 }, text: "", measurement: mm(10) }, { t: "DIM", layer: M, p: { x: mm(-1), y: 0 }, p1: { x: 0, y: 0 }, p2: { x: 0, y: mm(8) }, text: "", measurement: mm(8) });
  return writeDxf({ layers: [W, D, G, T, M].map((n, i) => ({ name: n, color: [7, 3, 5, 2, 1][i] })), entities: e, insunits: 4 }).replace("0\nSECTION\n2\nENTITIES", "0\nSECTION\n2\nENTITIES");
}

/** MEP overlay drawing for the house: centrelines on layers; some ducts carry "WxH" size and "EL+" annotations, the rest rely on layer configuration. */
export const HOUSE_MEP_CONFIG: MepLayerConfig[] = [
  { layer: "M-DUCT-SUP", system: "supply-air", category: "duct", elevation: 2.45, width: 0.3, height: 0.2, label: "Supply air duct" },
  { layer: "M-DUCT-RET", system: "return-air", category: "duct", elevation: 2.3, width: 0.3, height: 0.2, label: "Return air duct" },
  { layer: "M-DUCT-EXH", system: "exhaust-air", category: "duct", elevation: 2.55, diameter: 0.15, label: "Exhaust duct" },
  { layer: "M-EQUIP", system: "equipment", category: "equipment", elevation: 2.2, height: 0.5, label: "Air handling unit" },
  { layer: "M-DIFF", system: "supply-air", category: "air-terminal", elevation: 2.7, label: "Supply diffuser" },
  { layer: "M-GRILLE", system: "return-air", category: "air-terminal", elevation: 2.7, label: "Return grille" },
  { layer: "P-WATER", system: "water-cold", category: "pipe", elevation: 0.5, diameter: 0.022, label: "Cold water" },
  { layer: "P-DRAIN", system: "drainage", category: "pipe", elevation: -0.1, diameter: 0.1, label: "Drainage" },
  { layer: "E-CONDUIT", system: "electrical-power", category: "conduit", elevation: 2.62, diameter: 0.025, label: "Conduit" },
  { layer: "E-TRAY", system: "cable-tray", category: "cable-tray", elevation: 2.5, width: 0.2, height: 0.05, label: "Cable tray" },
  { layer: "E-LIGHT", system: "electrical-lighting", category: "light", elevation: 2.75, label: "Light fixture" },
];
export function houseMepDxf(): string {
  const e: DxfEntity[] = []; const pl = (layer: string, pts: [number, number][]) => e.push({ t: "POLY", layer, closed: false, pts: pts.map(([x, y]) => ({ x: mm(x), y: mm(y) })) });
  const txt = (layer: string, s: string, x: number, y: number) => e.push({ t: "TEXT", layer, p: { x: mm(x), y: mm(y) }, text: s, height: 120, rotation: 0 });
  // AHU in the living room corner (1.0 x 0.8 m), supply trunk east along y=2.6 then north; return trunk back
  e.push({ t: "POLY", layer: "M-EQUIP", closed: true, pts: [[0.6, 0.6], [1.6, 0.6], [1.6, 1.4], [0.6, 1.4]].map(([x, y]) => ({ x: mm(x), y: mm(y) })) }); txt("M-EQUIP", "AHU-01", 0.7, 0.9);
  pl("M-DUCT-SUP", [[1.6, 1.0], [3.5, 1.0], [3.5, 2.6], [8.0, 2.6]]); txt("M-DUCT-SUP", "400x250", 2.0, 1.1);
  pl("M-DUCT-SUP", [[3.5, 2.6], [3.5, 7.0]]);
  pl("M-DUCT-RET", [[0.6, 1.2], [0.2, 1.2]].map((p) => p as [number, number])); // stub
  pl("M-DUCT-RET", [[1.1, 1.4], [1.1, 3.2], [4.6, 3.2]]);
  pl("M-DUCT-EXH", [[7.0, 1.0], [9.7, 1.0]]);
  e.push({ t: "CIRCLE", layer: "M-DIFF", c: { x: mm(2.5), y: mm(1.0) }, r: mm(0.15) }, { t: "CIRCLE", layer: "M-DIFF", c: { x: mm(3.5), y: mm(5.5) }, r: mm(0.15) }, { t: "CIRCLE", layer: "M-DIFF", c: { x: mm(6.0), y: mm(2.6) }, r: mm(0.15) });
  e.push({ t: "POLY", layer: "M-GRILLE", closed: true, pts: [[4.4, 3.1], [4.8, 3.1], [4.8, 3.3], [4.4, 3.3]].map(([x, y]) => ({ x: mm(x), y: mm(y) })) });
  pl("P-WATER", [[9.0, 0.4], [9.0, 3.0], [6.0, 3.0]]); pl("P-DRAIN", [[9.0, 0.5], [9.0, 2.0]]);
  pl("E-CONDUIT", [[0.5, 3.5], [0.5, 7.0], [4.5, 7.0]]); pl("E-TRAY", [[5.5, 2.0], [5.5, 7.5]]);
  e.push({ t: "CIRCLE", layer: "E-LIGHT", c: { x: mm(2.5), y: mm(2.5) }, r: mm(0.2) }, { t: "CIRCLE", layer: "E-LIGHT", c: { x: mm(2.5), y: mm(6.5) }, r: mm(0.2) }, { t: "CIRCLE", layer: "E-LIGHT", c: { x: mm(7.5), y: mm(6.0) }, r: mm(0.2) });
  return writeDxf({ layers: HOUSE_MEP_CONFIG.map((c, i) => ({ name: c.layer, color: 1 + (i % 7) })), entities: e, insunits: 4 });
}

/* ───────── SVG / raster variants of the same house (for the SVG and image-interpretation paths) ───────── */
const WALL_RECTS: [number, number, number, number][] = (() => {
  const E = 0.15, I = 0.075, r: [number, number, number, number][] = [];
  const rect = (x0: number, y0: number, x1: number, y1: number) => r.push([x0, y0, x1, y1]);
  // exterior: south wall split by the entrance gap 2.0..3.0
  rect(-E, -E, 2.0, E); rect(3.0, -E, 10 + E, E); rect(-E, 8 - E, 10 + E, 8 + E); rect(-E, -E, E, 8 + E); rect(10 - E, -E, 10 + E, 8 + E);
  // wall A (x=5) with door gaps 1.55..2.45 and 5.55..6.45; walls B and C with their door gaps
  rect(5 - I, E, 5 + I, 1.55); rect(5 - I, 2.45, 5 + I, 5.55); rect(5 - I, 6.45, 5 + I, 8 - E);
  rect(5 + I, 4 - I, 7.05, 4 + I); rect(7.95, 4 - I, 10 - E, 4 + I); rect(E, 5 - I, 2.05, 5 + I); rect(2.95, 5 - I, 5 - I, 5 + I);
  return r;
})();
/** SVG with wall FACE lines in group "A-WALL" (user units = millimetres, y down), window rectangles in "A-GLAZ" and room labels. */
export function houseSvg(): string {
  const f = (v: number) => Math.round(v * 1000 * 1000) / 1000; const lines: string[] = [];
  for (const [x0, y0, x1, y1] of WALL_RECTS) { const w = x1 - x0, h = y1 - y0; if (w >= h) { lines.push(`<line x1="${f(x0)}" y1="${f(-y0)}" x2="${f(x1)}" y2="${f(-y0)}"/>`, `<line x1="${f(x0)}" y1="${f(-y1)}" x2="${f(x1)}" y2="${f(-y1)}"/>`); } else { lines.push(`<line x1="${f(x0)}" y1="${f(-y0)}" x2="${f(x0)}" y2="${f(-y1)}"/>`, `<line x1="${f(x1)}" y1="${f(-y0)}" x2="${f(x1)}" y2="${f(-y1)}"/>`); } }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -9000 11000 10000"><g id="A-WALL" stroke="black">${lines.join("")}</g></svg>`;
}
/** Filled-wall rendering as an SVG string for rasterisation: 100 px per metre, y down. */
export function houseFilledSvg(pxPerM = 100, withNoise = true): { svg: string; width: number; height: number; origin: { x: number; y: number } } {
  const pad = 1; const x0 = -0.15 - pad, y1 = 8.15 + pad; const w = (10.3 + 2 * pad) * pxPerM, h = (8.3 + 2 * pad) * pxPerM; const X = (x: number) => ((x - x0) * pxPerM).toFixed(2), Y = (y: number) => ((y1 - y) * pxPerM).toFixed(2);
  const rects = WALL_RECTS.map(([a, b, c, d]) => `<rect x="${X(a)}" y="${Y(d)}" width="${((c - a) * pxPerM).toFixed(2)}" height="${((d - b) * pxPerM).toFixed(2)}" fill="#111"/>`).join("");
  const noise = withNoise ? `<text x="${X(1)}" y="${Y(2)}" font-size="16" fill="#555">Living room</text><line x1="${X(0.3)}" y1="${Y(-0.6)}" x2="${X(9.8)}" y2="${Y(-0.6)}" stroke="#777" stroke-width="1"/><text x="${X(4)}" y="${Y(-0.5)}" font-size="12" fill="#777">10000</text>` : "";
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/>${rects}${noise}</svg>`, width: w, height: h, origin: { x: x0, y: y1 } };
}
