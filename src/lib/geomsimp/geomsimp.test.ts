import assert from "node:assert/strict";
import { aggregate, buildExport, extract, makeCtx, metrics, originalPass, outdated, planUnits, runUnits, validate, zoneSpec, type Cache } from "./engine";
import { applyMod, buildElems, buildModel, modOptions } from "./model";

const m = buildModel(), elems = buildElems(m);
const count = (c: string) => elems.filter((e) => e.cat === c).length;

// model
assert.equal(count("wall"), 12); assert.equal(count("floor"), 3); assert.equal(count("roof"), 1); assert.equal(count("partition"), 12);
assert.equal(m.zones.length, 15); assert.equal(count("door"), 14); assert.equal(count("window"), 70);
assert.equal(count("shading"), 4 + 5 + 2);
assert.equal(new Set(elems.map((e) => e.id)).size, elems.length, "element ids are unique");

// extraction classifies every element, including the untyped generic models
const ex = extract(m, elems);
assert.equal(ex.unclassified.length, 0);
assert.equal(ex.rows.find((r) => r.cat === "shading")!.detected, 11);
assert.equal(ex.rows.find((r) => r.cat === "zone")!.detected, 15);
assert.equal(ex.rows.filter((r) => r.cat !== "zone").reduce((n, r) => n + r.detected, 0), elems.length);

// full simplification
const cache: Cache = new Map(), units = planUnits(m, elems), full = runUnits(units, cache, "full");
assert.equal(full.total, elems.length + 15); assert.equal(full.hits, 0); assert.equal(full.recomputed.length, full.total);
const agg = aggregate(units, cache), mt = metrics(elems, agg);
for (const c of validate(m, agg)) assert.ok(c.ok, `${c.name}: ${c.detail}`);
assert.deepEqual(agg.warnings, []);
assert.ok(mt.reductionPct > 98, `reduction ${mt.reductionPct}`);
const by = (id: string) => agg.surfaces.find((s) => s.id === id)!;
// gross wall = length x height; the openings are children and are smaller than the wall
assert.ok(Math.abs(by("W-L1-S").area - (24 + 2 * 0.335) * 3.5) < 0.01);
assert.equal(by("W-L1-S").children.length, 7); assert.equal(by("W-L1-S").azimuth, 180); assert.equal(by("W-L1-E").azimuth, 90);
assert.equal(by("W-L1-N").azimuth, 0); assert.equal(by("W-L1-W").azimuth, 270);
assert.equal(by("WIN-L2-S03").area, 2.7 + 0.0 * 0 + 0.0, "window opening 1.8 x 1.5");
assert.equal(by("ROOF-1").tilt, 0); assert.equal(by("F-L2").tilt, 180);
assert.ok(agg.surfaces.every((s) => s.thickness === 0));
// canopy is tilted
assert.ok(by("SH-OH-CAN").tilt > 5 && by("SH-OH-CAN").tilt < 8);
// zones
const zA = agg.zones.find((z) => z.id === "Z-L1-A")!;
assert.equal(zA.area, 66); assert.ok(zA.closed); assert.equal(zA.windowArea, 13.5); assert.equal(zA.windowByAzimuth.S, 8.1); assert.equal(zA.windowByAzimuth.W, 5.4);
assert.ok(agg.zones.every((z) => z.closed));
assert.equal(agg.zones.reduce((n, z) => n + z.area, 0), 3 * 24 * 14);
assert.equal(by("W-L1-S").zones.sort().join(), "Z-L1-A,Z-L1-B");
assert.equal(zoneSpec(m, m.zones.find((z) => z.id === "Z-L1-C")!).length, 4 + 0, "corridor: two end walls and two partitions");

// original pass really walks the triangles
const op = originalPass(elems); assert.equal(op.tris, mt.origTris);

// incremental updates: only affected units are recomputed
const run = (id: string, op: string) => {
  const m2 = applyMod(m, id, op), e2 = buildElems(m2), u2 = planUnits(m2, e2), c2: Cache = new Map(cache);
  const pending = outdated(u2, c2).map((x) => x.id).sort(), st = runUnits(u2, c2, "incremental");
  assert.deepEqual(st.recomputed.map((r) => r.id).sort(), pending, "outdated list equals what gets recomputed");
  assert.equal(st.hits + st.recomputed.length, st.total);
  const a2 = aggregate(u2, c2); for (const c of validate(m2, a2)) assert.ok(c.ok, `${id}/${op}: ${c.name}: ${c.detail}`);
  // the incremental result equals a clean full run
  const c3: Cache = new Map(); runUnits(u2, c3, "full"); assert.deepEqual(aggregate(u2, c3).surfaces, a2.surfaces); assert.deepEqual(aggregate(u2, c3).zones, a2.zones);
  return st.recomputed.map((r) => r.id).sort();
};
assert.deepEqual(run("WIN-L2-S03", "widen"), ["WIN-L2-S03", "W-L2-S", "Z-L2-A"].sort());
assert.deepEqual(run("P-L1-1", "move"), ["P-L1-1", "Z-L1-A", "Z-L1-B"].sort());
assert.equal(run("W-L1-S", "thicken").length, 1 + 7 + 2);
assert.equal(run("ROOF-1", "insulate").length, 1 + 5);
assert.deepEqual(run("TREE-2", "grow"), ["TREE-2"]);
assert.deepEqual(run("SH-OH-S2", "deeper"), ["SH-OH-S2"]);
assert.ok(modOptions(m, "WIN-L1-S01").length >= 3);
assert.deepEqual(outdated(units, cache), [], "nothing outdated after a full run");

// export is valid JSON with the selected sections only
const ex1 = JSON.parse(JSON.stringify(buildExport(m, agg, mt, { surfaces: true, zones: true, classification: true, shading: true, ids: true, metadata: true })));
assert.equal(ex1.surfaces.length + ex1.shadingGeometry.surfaces.length, agg.surfaces.length); assert.equal(ex1.thermalZones.length, 15);
const ex2 = buildExport(m, agg, mt, { surfaces: true, zones: false, classification: false, shading: false, ids: false, metadata: false }) as Record<string, unknown>;
assert.ok(!("thermalZones" in ex2) && !("shadingGeometry" in ex2) && !("metadata" in ex2));
void makeCtx;
console.log(`geomsimp: all tests passed (${elems.length} elements, ${mt.origTris} triangles -> ${mt.simpSurfaces} surfaces + ${mt.simpLines} lines, ${mt.reductionPct.toFixed(2)}% fewer triangles)`);
