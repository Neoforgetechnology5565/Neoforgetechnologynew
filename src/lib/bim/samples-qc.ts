/** Synthetic files with KNOWN defects for the CAD-analysis and BIM-QC demonstrations. */
import { writeDxf, parseDxf, type DxfEntity } from "./dxf";
import { buildFromDxf } from "./build";
import { houseArchDxf, houseMepDxf, HOUSE_MEP_CONFIG } from "./samples";
import { extractMep } from "./mep";
import { writeIfc } from "./ifcwrite";
import { DEFAULT_SETTINGS } from "./model";

/** A drawing with exactly these hygiene problems. */
export const DIRTY_DXF_TRUTH = { duplicates: 2, zeroLength: 1, almostClosed: 1, selfIntersecting: 1, outliers: 1, emptyLayers: 1 };
export function dirtyDxf(): string {
  const e: DxfEntity[] = []; const L = (layer: string, x0: number, y0: number, x1: number, y1: number): DxfEntity => ({ t: "LINE", layer, a: { x: x0, y: y0 }, b: { x: x1, y: y1 } });
  for (let i = 0; i < 12; i++) e.push(L("A-WALL", i * 1000, 0, i * 1000 + 900, 0)); for (let i = 0; i < 10; i++) e.push(L("A-WALL", 0, i * 1000, 0, i * 1000 + 900));
  e.push(L("A-WALL", 0, 0, 900, 0), L("A-WALL", 1000, 0, 1900, 0)); // 2 duplicates
  e.push(L("A-WALL", 5000, 5000, 5000, 5000)); // zero length
  e.push({ t: "POLY", layer: "A-ROOM", closed: false, pts: [{ x: 2000, y: 2000 }, { x: 4000, y: 2000 }, { x: 4000, y: 4000 }, { x: 2000, y: 4000 }, { x: 2000, y: 2005 }] }); // almost closed (5 mm)
  e.push({ t: "POLY", layer: "A-ROOM", closed: true, pts: [{ x: 6000, y: 2000 }, { x: 8000, y: 4000 }, { x: 8000, y: 2000 }, { x: 6000, y: 4000 }] }); // bow-tie
  e.push(L("A-WALL", 900000, 900000, 901000, 900000)); // stray geometry 1,2 km away
  for (let i = 0; i < 6; i++) e.push(L("A-ANNO", i * 500, -1000, i * 500 + 300, -1000));
  return writeDxf({ insunits: 4, layers: [{ name: "A-WALL", color: 7 }, { name: "A-ROOM", color: 3 }, { name: "A-ANNO", color: 2 }, { name: "A-UNUSED", color: 5 }], entities: e });
}

/** The generated house IFC with these defects injected: 1 unnamed wall, 2 elements sharing a GlobalId, 1 column outside any storey, 1 duplicated wall, 1 far-away column, 1 tiny space. All doors lack FireRating. */
export const FLAWED_IFC_TRUTH = { unnamedWalls: 1, duplicateGuidElements: 2, columnsWithoutStorey: 1, duplicateWalls: 1, farColumns: 1, tinySpaces: 1, doors: 5 };
export function houseIfc(flawed = false, storeys = 1): string {
  const st = { ...DEFAULT_SETTINGS, storeys }; const b = buildFromDxf(parseDxf(houseArchDxf()), st).building; const m = extractMep(parseDxf(houseMepDxf()), HOUSE_MEP_CONFIG, st);
  if (flawed) {
    const w = b.walls[1]; b.walls.push({ ...w, id: "W099", openings: [] }); // same geometry as another wall -> duplicate (different id keeps GUID unique)
    b.walls[b.walls.length - 1].a = { ...w.a }; b.walls[b.walls.length - 1].b = { ...w.b };
    b.columns.push({ id: "C99", level: b.levels[0].id, c: { x: 90, y: 90 }, w: 0.4, d: 0.4, round: false, height: 2.7, source: { origin: "user", note: "injected defect" }, assumed: [] });
    b.rooms[0] = { ...b.rooms[0], area: 1.2 };
  }
  let t = writeIfc(b, m.elements, { name: flawed ? "house-flawed" : "house", source: "synthetic" }).text;
  if (flawed) {
    t = t.replace(/(IFCWALL\('[^']+',\$,)'W001'/, "$1$"); // unnamed wall
    const w = [...t.matchAll(/IFCWINDOW\('([^']{22})'/g)]; if (w.length >= 2) t = t.replace(w[1][0], `IFCWINDOW('${w[0][1]}'`); // duplicate GlobalId
    const d = /#(\d+)= IFCCOLUMN\(/.exec(t); if (d) t = t.replace(/(IFCRELCONTAINEDINSPATIALSTRUCTURE\([^\n]*?\(([^)]*)\))/, (all, _a, list: string) => all.replace(list, list.split(",").filter((x) => x.trim() !== `#${d[1]}`).join(",")));
  }
  return t;
}

/** A second revision of the house IFC: window O009 deleted, door O011 widened by 0.1 m, a column C98 added. GlobalIds are stable across revisions because they derive from element ids. */
export const REVISION_TRUTH = { removedWindow: "O009", widenedDoor: "O011", addedColumn: "C98", doorWidening: 0.1 };
export function houseIfcRevision(): string {
  const st = { ...DEFAULT_SETTINGS }; const b = buildFromDxf(parseDxf(houseArchDxf()), st).building; const m = extractMep(parseDxf(houseMepDxf()), HOUSE_MEP_CONFIG, st);
  for (const w of b.walls) w.openings = w.openings.filter((o) => o.id !== REVISION_TRUTH.removedWindow);
  for (const w of b.walls) for (const o of w.openings) if (o.id === REVISION_TRUTH.widenedDoor) o.width += REVISION_TRUTH.doorWidening;
  b.columns.push({ id: REVISION_TRUTH.addedColumn, level: b.levels[0].id, c: { x: 2.5, y: 6.5 }, w: 0.3, d: 0.3, round: false, height: b.levels[0].height, source: { origin: "user", note: "added in revision B" }, assumed: [] });
  return writeIfc(b, m.elements, { name: "house-rev-b", source: "synthetic" }).text;
}
