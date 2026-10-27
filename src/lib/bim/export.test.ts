/** Run: npx tsx src/lib/bim/export.test.ts — exporters re-read with independent code paths (web-ifc, the DXF parser, the GLB container layout). */
import { houseArchDxf, houseMepDxf, HOUSE_MEP_CONFIG, HOUSE_TRUTH } from "./samples";
import { parseDxf, polyPoints } from "./dxf";
import { buildFromDxf } from "./build";
import { extractMep } from "./mep";
import { mepMeshes } from "./mepmesh";
import { detectClashes } from "./clash";
import { DEFAULT_SETTINGS } from "./model";
import { writeIfc, ifcGuid } from "./ifcwrite";
import { writeGlb } from "./glb";
import { exportDxf } from "./dxfout";
import { roomSchedule, mepSchedule, clashSchedule, wallSchedule, openingSchedule } from "./csv";
import { writePdf } from "./pdf";
import { reportLines } from "./report";
import { readIfc } from "./ifcread";
import { polyArea } from "./geom";

let pass = 0, fail = 0; const out: string[] = [];
async function t(name: string, fn: () => void | Promise<void>) { try { await fn(); pass++; out.push(`  ok   ${name}`); } catch (e) { fail++; out.push(`  FAIL ${name}\n       ${(e as Error).message}`); } }
const near = (a: number, b: number, tol: number, w: string) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${w}: got ${a}, expected ${b} ± ${tol}`); };
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };

(async () => {
  const B = buildFromDxf(parseDxf(houseArchDxf()), { ...DEFAULT_SETTINGS, roofType: "flat" }); const b = B.building; const M = extractMep(parseDxf(houseMepDxf()), HOUSE_MEP_CONFIG, DEFAULT_SETTINGS); const cl = detectClashes(b, M.elements, DEFAULT_SETTINGS);
  const ifc = writeIfc(b, M.elements, { name: "House", source: "house-2bed-plan.dxf" });
  await t("IFC: GUIDs are 22 characters, deterministic and unique", () => { const g = ifcGuid("a"); ok(g.length === 22 && /^[0-9A-Za-z_$]+$/.test(g) && g === ifcGuid("a") && g !== ifcGuid("b"), g); });
  await t("IFC: written entity counts match the model", () => { ok(ifc.counts.IFCWALL === 7 && ifc.counts.IFCDOOR === 5 && ifc.counts.IFCWINDOW === 6 && ifc.counts.IFCSPACE === 4 && ifc.counts.IFCOPENINGELEMENT === 11 && ifc.counts.IFCBUILDINGSTOREY === 1, JSON.stringify(ifc.counts)); ok(ifc.text.startsWith("ISO-10303-21;") && /FILE_SCHEMA\(\('IFC4'\)\)/.test(ifc.text), "header"); });
  const re = await readIfc(Buffer.from(ifc.text));
  await t("IFC: re-read by web-ifc — hierarchy, classes and element counts", () => { ok(re.schema === "IFC4" && re.storeys.length === 1 && re.storeys[0].name === "Ground floor", JSON.stringify(re.storeys)); const c = re.stats.classes; ok(c.IFCWALL === 7 && c.IFCDOOR === 5 && c.IFCWINDOW === 6 && c.IFCSPACE === 4, JSON.stringify(c)); ok(re.systems.length >= 6, `systems ${re.systems.length}`); ok(re.warnings.length === 0, re.warnings.join("|")); });
  await t("IFC: re-read geometry bounds equal the generated building (−0.15…10.15 × −0.15…8.15 × −0.2…2.8)", () => { const bb = re.stats.bounds!; near(bb.min[0], -0.15, 0.01, "minx"); near(bb.max[0], 10.15, 0.01, "maxx"); near(bb.min[1], -0.15, 0.01, "miny"); near(bb.max[1], 8.15, 0.01, "maxy"); near(bb.min[2], -0.2, 0.01, "minz"); ok(bb.max[2] >= 2.8, "maxz"); });
  await t("IFC: room quantities and provenance survive the round trip", () => { const sp = re.elements.filter((e) => e.cls === "IFCSPACE"); const living = sp.find((e) => e.name === "Living room")!; near(living.quantities["BaseQuantities.NetFloorArea"], HOUSE_TRUTH.roomAreas["Living room"], 0.001, "net area"); ok(living.props.NeoForge_Provenance.Origin === "derived", "prov"); const wall = re.elements.find((e) => e.cat === "wall-exterior")!; ok(wall.props.NeoForge_Provenance.SourceLayer === "A-WALL" && wall.props.Pset_WallCommon.IsExternal === true, JSON.stringify(wall.props)); });
  await t("IFC: MEP properties preserved and assumed values are labelled", () => { const duct = re.elements.find((e) => e.cls === "IFCDUCTSEGMENT")!; ok(duct.props.NeoForge_MEP.System === "Supply air", "system"); ok(typeof duct.props.NeoForge_MEP.WidthMm === "number", "width"); ok(re.elements.filter((e) => e.cat === "mep-duct").every((e) => /layer configuration|^$/.test(String(e.props.NeoForge_Provenance.AssumedValues)) || e.props.NeoForge_Provenance.AssumedValues !== undefined), "assumed list"); });
  await t("GLB: valid container, one node per element, bounds of walls match", () => { const meshes = [...B.meshes, ...mepMeshes(M.elements)]; const glb = writeGlb(meshes); ok(glb.readUInt32LE(0) === 0x46546c67 && glb.readUInt32LE(4) === 2 && glb.readUInt32LE(8) === glb.length, "header"); const jl = glb.readUInt32LE(12); const j = JSON.parse(glb.subarray(20, 20 + jl).toString()); ok(j.nodes.length === meshes.length, "nodes"); const south = j.nodes.find((n: { name: string }) => n.name === "W001"); ok(south.extras.category === "wall-exterior", "extras"); const acc = j.accessors[j.meshes[south.mesh].primitives[0].attributes.POSITION]; near(acc.max[0] - acc.min[0], 10, 0.01, "south wall length in glTF x"); near(acc.max[1] - acc.min[1], 2.8, 0.01, "height in glTF y"); });
  await t("DXF export: reparsed rooms keep their areas; MEP centrelines present", () => { const d = parseDxf(exportDxf(b, M.elements)); ok(d.insunits === 4, "units"); const rooms = d.entities.filter((e) => e.t === "POLY" && e.layer === "A-ROOM") as Extract<(typeof d.entities)[number], { t: "POLY" }>[]; ok(rooms.length === 4, `${rooms.length}`); const total = rooms.reduce((s, e) => s + Math.abs(polyArea(polyPoints(e))) / 1e6, 0); near(total, HOUSE_TRUTH.totalNetArea, 0.01, "total room area (mm² → m²)"); ok(Object.keys(d.layers).some((l) => l.startsWith("M-SUPPLY-AIR")), "mep layer"); });
  await t("DXF export: walls re-read by the plan interpreter reproduce the room areas (round trip)", () => { const d = parseDxf(exportDxf(b, [])); const r = buildFromDxf(d, { ...DEFAULT_SETTINGS }); ok(r.building.rooms.length === 4, `rooms ${r.building.rooms.length}`); near(r.building.rooms.reduce((s, x) => s + x.area, 0), HOUSE_TRUTH.totalNetArea, 0.02, "area"); });
  await t("CSV schedules: headers and row counts", () => { const rows = (s: string) => s.trim().split("\r\n").length - 1; ok(rows(roomSchedule(b)) === 4 && rows(wallSchedule(b)) === 7 && rows(openingSchedule(b)) === 11 && rows(mepSchedule(M.elements)) === M.elements.length && rows(clashSchedule(cl.clashes)) === cl.clashes.length, "rows"); ok(/Net area \(m2\)/.test(roomSchedule(b)), "header"); });
  await t("PDF: well-formed with valid xref offsets", () => { const pdf = writePdf("Test", reportLines({ projectName: "House", sourceFiles: [{ name: "a.dxf", format: "DXF", sample: true, size: 1000 }], building: b, mep: M.elements, clashes: cl.clashes, clashInfo: { tested: cl.tested, method: cl.method, clearance: 0.05, tolerance: 0.002 }, outputs: ["house.ifc"], limitations: ["x"] })); const s = pdf.toString("latin1"); ok(s.startsWith("%PDF-1.4") && s.trimEnd().endsWith("%%EOF"), "markers"); const xr = +/startxref\n(\d+)/.exec(s)![1]; ok(s.slice(xr, xr + 4) === "xref", "xref offset"); const offs = [...s.matchAll(/(\d{10}) 00000 n/g)].map((m) => +m[1]); for (let i = 0; i < offs.length; i++) ok(s.slice(offs[i], offs[i] + 12).startsWith(`${i + 1} 0 obj`), `obj ${i + 1}`); ok(/Living room/.test(s), "content"); });
  await t("IFC reader: rejects non-IFC input clearly", async () => { let msg = ""; try { await readIfc(Buffer.from("hello world")); } catch (e) { msg = (e as Error).message; } ok(/ISO-10303-21/.test(msg), msg); });
  console.log(out.join("\n")); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
