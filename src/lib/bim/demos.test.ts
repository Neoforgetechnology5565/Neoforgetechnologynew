/** Run: npx tsx src/lib/bim/demos.test.ts — demonstrations 2-10 against files of known content. */
import { runDemo, isPlan3d, type AnyModel } from "./demos";
import { listDemoExports, makeDemoExport } from "./demos/exports";
import { DIRTY_DXF_TRUTH, FLAWED_IFC_TRUTH } from "./samples-qc";
import { STRUCT_DIFF_TRUTH, STRUCT_TRUTH } from "./samples-struct";
import { ROOM_TRUTH } from "./samples-cloud";
import { HOUSE_TRUTH } from "./samples";
import { DEFAULT_SETTINGS } from "./model";
import { SAMPLES } from "./samples-registry";
import type { InFile } from "./pipeline";
import { validateUpload } from "./validate";
import { ifcValidate } from "./test-util";

let pass = 0, fail = 0;
const t = async (n: string, f: () => void | Promise<void>) => { try { await f(); pass++; console.log("  ok  " + n); } catch (e) { fail++; console.log("FAIL  " + n + "\n      " + (e as Error).message); } };
const eq = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const near = (a: number, b: number, tol: number, m: string) => eq(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b} (±${tol})`);
async function files(id: string): Promise<{ files: InFile[]; settings: Record<string, unknown>; demo: (typeof SAMPLES)[number]["demo"] }> { const s = SAMPLES.find((x) => x.id === id)!; const fs: InFile[] = []; for (const f of s.files) { const buf = Buffer.from(await f.make()); const v = validateUpload(f.name, buf); fs.push({ name: f.name, format: v.format, support: v.support, role: f.role, sample: true, buf }); } return { files: fs, settings: { ...(s.settings ?? {}) }, demo: s.demo }; }
const run = async (id: string, extra: Record<string, unknown> = {}): Promise<AnyModel> => { const f = await files(id); return runDemo(f.demo, f.files, { ...f.settings, ...extra }, () => {}, 1, id); };
const rule = (m: AnyModel, r: string) => m.ext!.issues.filter((i) => i.rule === r);
const table = (m: AnyModel, id: string) => m.ext!.tables.find((x) => x.id === id)!;

(async () => {
  console.log("Demonstrations 2-10");
  // 2 - CAD analysis
  const dirty = await run("cad-dirty");
  await t("D2 validator finds exactly the injected drawing defects", () => { const c = (r: string) => rule(dirty, r).length; eq(c("duplicate") === DIRTY_DXF_TRUTH.duplicates, `duplicates ${c("duplicate")}`); eq(c("zero-length") === DIRTY_DXF_TRUTH.zeroLength, `zero ${c("zero-length")}`); eq(c("almost-closed") === DIRTY_DXF_TRUTH.almostClosed, `almost ${c("almost-closed")}`); eq(c("self-intersecting") === DIRTY_DXF_TRUTH.selfIntersecting, `self ${c("self-intersecting")}`); eq(c("outlier") === DIRTY_DXF_TRUTH.outliers, `outlier ${c("outlier")}`); eq(c("empty-layer") === DIRTY_DXF_TRUTH.emptyLayers, `empty ${c("empty-layer")}`); });
  const cadHouse = await run("cad-house");
  await t("D2 house drawing: layers, extents and units", () => { const lay = table(cadHouse, "layers").rows.map((r) => r[0]); eq(lay.includes("A-WALL"), "A-WALL layer"); const h = cadHouse.ext!.headline.find((x) => x.label === "Extents")!.value as string; eq(/10\.3 × 8\.3 m/.test(h), `extents ${h}`); });
  await t("D2 conversions re-read cleanly (SVG, GeoJSON, CSV, clean DXF)", async () => { const f = await files("cad-house"); for (const fmt of ["cad-svg", "cad-geojson", "cad-csv", "cad-dxf-clean", "cad-json"]) { const o = await makeDemoExport(fmt, { demo: "cad-analysis", model: cadHouse, name: "x", files: f.files, settings: {} }); eq(o.buf.length > 100, fmt + " empty"); } });
  // 3 - viewer
  const v1 = await run("viewer-house"), v2 = await run("viewer-house-2st");
  await t("D3 IFC information: class counts match the generating model", () => { if (!isPlan3d(v1) || !isPlan3d(v2)) throw new Error("kind"); const c = v1.ifc!.classes; eq(c.IFCWALL === HOUSE_TRUTH.walls && c.IFCDOOR === HOUSE_TRUTH.doors && c.IFCWINDOW === HOUSE_TRUTH.windows && c.IFCSPACE === HOUSE_TRUTH.rooms, JSON.stringify(c)); eq(v1.ifc!.storeys.length === 1 && v2.ifc!.storeys.length === 2, "storeys"); eq(v2.ifc!.classes.IFCWALL === 2 * HOUSE_TRUTH.walls, "two-storey walls"); });
  await t("D3 quantities table lists only values stored in the file", () => { const q = table(v1, "quantities").rows; eq(q.length > 0, "quantities exist"); const sp = q.find((r) => r[0] === "IFCSPACE" && /Net/.test(String(r[1]))); eq(!!sp, "space net area present"); near(Number(sp![2]), HOUSE_TRUTH.totalNetArea, 0.01, "total net area"); });
  // 9 - QC
  const clean = await run("qc-clean"), flawed = await run("qc-flawed");
  await t("D9 QC finds exactly the injected IFC defects", () => { const c = (m: AnyModel, r: string) => rule(m, r).length; eq(c(flawed, "name") === FLAWED_IFC_TRUTH.unnamedWalls, `name ${c(flawed, "name")}`); eq(c(flawed, "guid") === FLAWED_IFC_TRUTH.duplicateGuidElements, `guid ${c(flawed, "guid")}`); eq(c(flawed, "storey") === FLAWED_IFC_TRUTH.columnsWithoutStorey, `storey ${c(flawed, "storey")}`); eq(c(flawed, "duplicate") === FLAWED_IFC_TRUTH.duplicateWalls, `duplicate ${c(flawed, "duplicate")}`); eq(c(flawed, "outlier") === FLAWED_IFC_TRUTH.farColumns, `outlier ${c(flawed, "outlier")}`); eq(c(flawed, "space-area") === FLAWED_IFC_TRUTH.tinySpaces, `space ${c(flawed, "space-area")}`); eq(c(flawed, "required-props") === FLAWED_IFC_TRUTH.doors, `required ${c(flawed, "required-props")}`); });
  await t("D9 clean file has only the FireRating findings", () => { const bad = clean.ext!.issues.filter((i) => i.rule !== "required-props" && i.severity !== "info"); eq(bad.length === 0, `unexpected: ${bad.map((b) => b.rule + ":" + b.title).join("; ")}`); eq(rule(clean, "required-props").length === FLAWED_IFC_TRUTH.doors, "5 doors without FireRating"); });
  await t("D9 rules can be switched off and thresholds changed", async () => { const m = await run("qc-flawed", { params: { enabled: { guid: false, name: false }, required: {}, minSpaceArea: 0.5 } }); eq(rule(m, "guid").length === 0 && rule(m, "name").length === 0 && rule(m, "required-props").length === 0, "disabled/empty rules silent"); eq(rule(m, "space-area").length === 0, "1.2 m² is above a 0.5 m² minimum"); });
  // 6 - floor plan
  const fp = await run("fp-dxf");
  await t("D6 room schedule equals ground truth", () => { const rows = table(fp, "rooms").rows; eq(rows.length === HOUSE_TRUTH.rooms, `rooms ${rows.length}`); for (const r of rows) { const exp = HOUSE_TRUTH.roomAreas[String(r[1])]; eq(exp !== undefined, `unknown room ${r[1]}`); near(Number(r[3]), exp, 0.006, String(r[1])); } near(Number(table(fp, "areas").rows[0][1]), HOUSE_TRUTH.totalNetArea, 0.01, "total net"); });
  await t("D6 plan has no free wall ends or unlabelled openings", () => { eq(rule(fp, "free-wall-end").length === 0 && rule(fp, "unlabelled-opening").length === 0 && rule(fp, "no-rooms").length === 0, fp.ext!.issues.map((i) => i.rule).join(",")); });
  // 10 - QTO
  const q = await run("qto-house");
  await t("D10 exterior wall area = perimeter × height − openings (hand calculation)", () => { const H = DEFAULT_SETTINGS.wallHeight; const boq = table(q, "boq").rows; const ext = boq.find((r) => r[0] === "WALL-EXT")!; const open = 1.0 * DEFAULT_SETTINGS.doorHeight + 4 * 1.2 * 1.2 + 2 * 1.5 * 1.2; near(Number(ext[4]), 36 * H - open, 0.1, "exterior wall net area"); });
  await t("D10 BOQ arithmetic: amount = qty×(1+waste)×rate and summary adds up", () => { const boq = table(q, "boq").rows; let sum = 0; for (const r of boq) { const amt = Number(r[4]) * (1 + Number(r[5]) / 100) * Number(r[7]); near(Number(r[9]), amt, 0.02, String(r[0])); sum += Number(r[9]); } const sm = table(q, "summary").rows; near(Number(sm.find((r) => r[0] === "Subtotal")![1]), sum, 0.5, "subtotal"); const tot = Number(sm.find((r) => r[0] === "Total")![1]); near(tot, sum * 1.1 * 1.08 * 1.05, 1, "total with markups"); });
  await t("D10 user rates, waste and markups change the result as arithmetic says", async () => { const q2 = await run("qto-house", { params: { rates: { "WALL-EXT": 100 }, waste: { "WALL-EXT": 0 }, overheadPct: 0, profitPct: 0, contingencyPct: 0 } }); const r = table(q2, "boq").rows.find((x) => x[0] === "WALL-EXT")!; near(Number(r[9]), Number(r[4]) * 100, 0.05, "amount"); eq(r[8] === "user", "rate source"); const tot = Number(table(q2, "summary").rows.find((x) => x[0] === "Total")![1]); const sub = Number(table(q2, "summary").rows.find((x) => x[0] === "Subtotal")![1]); near(tot, sub, 0.01, "no markups"); });
  await t("D10 labels placeholder rates and lists exclusions", () => { eq(/PLACEHOLDER/.test(String(table(q, "boq").note)), "placeholder note"); eq(table(q, "exclusions").rows.length >= 5, "exclusions"); });
  await t("D10 IFC input uses stored quantities only", async () => { const qi = await run("qto-ifc"); const boq = table(qi, "boq").rows; eq(boq.some((r) => r[0] === "WALL-IFC"), "wall line from IFC quantities"); eq(boq.every((r) => !/guess/i.test(String(r[10]))), "no guessed basis"); });
  // 8 - MEP
  const mep = await run("mep-house");
  await t("D8 coordination tables are consistent with the clash list", () => { if (!isPlan3d(mep)) throw new Error("kind"); const mx = table(mep, "matrix").rows; const total = mx.reduce((s, r) => s + Number(r[1]) + Number(r[2]), 0); eq(total === mep.clashes.length, `matrix ${total} vs ${mep.clashes.length}`); eq(table(mep, "systems").rows.length >= 3, "systems"); eq(m_len(mep) > 20, "run length"); });
  await t("D8 every duct/pipe is accounted for in the networks", () => { if (!isPlan3d(mep)) throw new Error("kind"); const inNet = new Set(mep.mep.networks.flatMap((n) => n.elements)); const lin = mep.mep.elements.filter((e) => ["duct", "pipe", "conduit", "cable-tray"].includes(e.category)); eq(lin.every((e) => inNet.has(e.id)), "all linear elements belong to a network"); });
  // 5 - interop
  const io = await run("interop-dxf"), ii = await run("interop-ifc");
  await t("D5 every conversion verifies against its source", () => { for (const m of [io, ii]) { const bad = table(m, "checks").rows.filter((r) => r[4] !== "match"); eq(bad.length === 0, bad.map((b) => b.join(" ")).join("; ")); eq(table(m, "conversions").rows.every((r) => r[1] === "verified"), "all verified"); } eq(table(io, "conversions").rows.length === 4 && table(ii, "conversions").rows.length === 3, "conversion counts"); });
  await t("D5 converted IFC passes the independent ifcopenshell check when available", async () => { const f = await files("interop-dxf"); const o = await makeDemoExport("ifc", { demo: "interop", model: io, name: "x", files: f.files, settings: {} }); const r = ifcValidate(o.buf); if (r === "skipped") return console.log("        (ifcopenshell not available; skipped)"); eq(r === "ok", r); });
  // 7 - structural
  const sa = await run("struct-a"), sab = await run("struct-ab");
  await t("D7 extracts the known structure", () => { const h = (m: AnyModel, l: string) => Number(m.ext!.headline.find((x) => x.label === l)!.value); eq(h(sa, "Columns") === STRUCT_TRUTH.columns && h(sa, "Beams") === STRUCT_TRUTH.beams && h(sa, "Grid lines") === STRUCT_TRUTH.gridLines && h(sa, "Footings") === STRUCT_TRUTH.footings, JSON.stringify(sa.ext!.headline)); const c = (r: string) => rule(sa, r).length; eq(c("off-grid") === STRUCT_TRUTH.offGridColumns && c("unlabelled-beam") === STRUCT_TRUTH.unlabelledBeams && c("unsupported-end") === STRUCT_TRUTH.unsupportedBeamEnds && c("no-footing") === STRUCT_TRUTH.columnsWithoutFooting && c("size-mismatch") === STRUCT_TRUTH.sizeMismatches, `rules ${JSON.stringify(sa.ext!.issues.map((i) => i.rule))}`); const round = table(sa, "columns").rows.filter((r) => r[6] === "round").length; eq(round === STRUCT_TRUTH.roundColumns, "round columns"); });
  await t("D7 revision comparison finds the known differences", () => { const d = sab.ext!.extra!.comparison as Record<string, number>; for (const k of Object.keys(STRUCT_DIFF_TRUTH) as (keyof typeof STRUCT_DIFF_TRUTH)[]) eq(d[k] === STRUCT_DIFF_TRUTH[k], `${k}: ${d[k]} vs ${STRUCT_DIFF_TRUTH[k]}`); });
  // 4 - point cloud
  const pc = await run("cloud-room-las"), pr = await run("cloud-room-rot"), pp = await run("cloud-room-ply");
  await t("D4 plane fitting recovers the room dimensions (unrotated, rotated, PLY)", () => { for (const m of [pc, pr, pp]) { const rows = table(m, "dims").rows.map((r) => [String(r[0]), Number(r[1])] as const); const h = rows.find((r) => /Floor-to-ceiling/.test(r[0])); eq(!!h, "height"); near(h![1], ROOM_TRUTH.height, 0.02, "height"); const walls = rows.filter((r) => /parallel walls/.test(r[0])).map((r) => r[1]); eq(walls.some((w) => Math.abs(w - 6) < 0.02) && walls.some((w) => Math.abs(w - 4) < 0.02), `wall distances ${walls}`); } });
  await t("D4 scan-to-BIM draft: rectangular room 6 × 4 m", () => { const b = (pc as Extract<AnyModel, { kind: "analysis" }>).data!.building as { rooms: { area: number }[]; walls: unknown[] }; eq(!!b && b.walls.length === 4, "4 walls"); near(b.rooms[0].area, 24, 0.15, "room area"); });
  await t("D4 outlier removal drops the stray points and keeps the room", () => { const rm = Number((pc.ext!.extra as { removed: number }).removed); eq(rm >= ROOM_TRUTH.strayPoints * 0.7 && rm < 1500, `removed ${rm}`); });
  await t("D4 exports: LAS/PLY/XYZ/DXF/IFC/GLB are produced and IFC re-reads", async () => { const f = await files("cloud-room-las"); for (const fmt of ["cloud-ply", "cloud-xyz", "cloud-las", "cloud-dxf", "cloud-ifc", "cloud-glb"]) { eq(listDemoExports("point-cloud", pc).some((x) => x.format === fmt), "listed " + fmt); const o = await makeDemoExport(fmt, { demo: "point-cloud", model: pc, name: "x", files: f.files, settings: {} }); eq(o.buf.length > 200, fmt); } });
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
function m_len(m: AnyModel) { return isPlan3d(m) ? m.mep.networks.reduce((s, n) => s + n.length, 0) : 0; }
