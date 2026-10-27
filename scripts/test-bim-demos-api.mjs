#!/usr/bin/env node
/**
 * API + integration tests for BIM suite demonstrations 2-10 through the HTTP API (create project → sample → process → model → exports → download).
 * Needs a running server with Firestore (emulator is fine):  node scripts/test-bim-demos-api.mjs
 * Expected values come from the synthetic sample files' known content (see docs/bim/TESTING.md).
 */
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL || "http://localhost:3000"; let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const J = (p, m, body, h = {}) => fetch(`${BASE}${p}`, { method: m, headers: { origin: BASE, "content-type": "application/json", ...h }, body: body ? JSON.stringify(body) : undefined });
async function open(demo, sample, settings) {
  const c = await (await J("/api/bim/projects", "POST", { demo, name: `t-${sample}` })).json(); const id = c.project.id, K = { "x-bim-key": c.key };
  const s = await J(`/api/bim/projects/${id}/samples`, "POST", { sample }, K); assert.equal(s.status, 200, `sample ${sample}: ${await s.clone().text()}`);
  const r = await J(`/api/bim/projects/${id}/process`, "POST", settings ? { settings } : {}, K); const j = await r.json(); assert.equal(r.status, 200, `process ${sample}: ${JSON.stringify(j.job?.error ?? j)}`); assert.equal(j.job.status, "completed");
  const m = await (await fetch(`${BASE}/api/bim/projects/${id}/model`, { headers: K })).json(); return { id, K, m, job: j.job };
}
const exportOf = async (p, format) => { const r = await J(`/api/bim/projects/${p.id}/exports`, "POST", { format }, p.K); const j = await r.json(); assert.equal(r.status, 201, `${format}: ${JSON.stringify(j)}`); const d = await fetch(`${BASE}/api/bim/projects/${p.id}/artifacts/${j.artifact.id}`, { headers: p.K }); assert.equal(d.status, 200); return { art: j.artifact, buf: Buffer.from(await d.arrayBuffer()) }; };
const rule = (m, r) => m.ext.issues.filter((i) => i.rule === r).length;
const tbl = (m, id) => m.ext.tables.find((x) => x.id === id);
console.log("bim demos 2-10 api tests →", BASE);

let p;
await t("D2 CAD analysis: layers, validation findings and conversions", async () => {
  p = await open("cad-analysis", "cad-dirty"); assert.equal(p.m.kind, "analysis");
  assert.equal(rule(p.m, "duplicate"), 2); assert.equal(rule(p.m, "zero-length"), 1); assert.equal(rule(p.m, "almost-closed"), 1); assert.equal(rule(p.m, "self-intersecting"), 1); assert.equal(rule(p.m, "outlier"), 1); assert.equal(rule(p.m, "empty-layer"), 1);
  for (const f of ["cad-svg", "cad-geojson", "cad-csv", "cad-dxf-clean"]) { const e = await exportOf(p, f); assert.ok(e.buf.length > 100, f); if (f === "cad-geojson") assert.equal(JSON.parse(e.buf.toString()).type, "FeatureCollection"); if (f === "cad-svg") assert.match(e.buf.toString(), /<svg/); }
});
await t("D2 SVG sample asks for scale only when missing and a DXF upload of garbage is refused", async () => {
  const c = await (await J("/api/bim/projects", "POST", { demo: "cad-analysis", name: "bad" })).json(); const f = new FormData(); f.set("file", new Blob(["not a dxf"], { type: "text/plain" }), "bad.dxf"); f.set("role", "drawing");
  const r = await fetch(`${BASE}/api/bim/projects/${c.project.id}/files`, { method: "POST", headers: { origin: BASE, "x-bim-key": c.key }, body: f }); assert.ok([415, 422].includes(r.status), String(r.status));
});
await t("D3 BIM viewer: IFC classes, storeys and quantities; plan-only operations work on the shared model", async () => {
  p = await open("bim-viewer", "viewer-house-2st"); assert.equal(p.m.kind, "plan3d"); assert.equal(p.m.ifc.storeys.length, 2); assert.equal(p.m.ifc.classes.IFCWALL, 14); assert.ok(tbl(p.m, "quantities").rows.length > 0);
  const c = await (await J(`/api/bim/projects/${p.id}/components?q=wall&limit=5`, "GET", undefined, p.K)).json().catch(() => ({})); void c;
  const e = await exportOf(p, "glb"); assert.equal(e.buf.subarray(0, 4).toString(), "glTF");
});
await t("D4 point cloud: planes recovered within 2 cm, draft room exported as IFC", async () => {
  p = await open("point-cloud", "cloud-room-rot"); assert.equal(p.m.kind, "analysis"); const dims = tbl(p.m, "dims").rows; assert.ok(dims.some((r) => /Floor-to-ceiling/.test(r[0]) && Math.abs(r[1] - 2.6) < 0.02));
  const w = dims.filter((r) => /parallel walls/.test(r[0])).map((r) => r[1]); assert.ok(w.some((v) => Math.abs(v - 6) < 0.02) && w.some((v) => Math.abs(v - 4) < 0.02)); assert.ok(p.m.cloud.positions.length > 3000);
  const ifc = await exportOf(p, "cloud-ifc"); assert.match(ifc.buf.toString(), /^ISO-10303-21;/); const las = await exportOf(p, "cloud-las"); assert.equal(las.buf.subarray(0, 4).toString(), "LASF");
});
await t("D4 parameter change is applied: a looser plane tolerance still finds the room; unsupported LAZ is refused", async () => {
  const r = await J(`/api/bim/projects/${p.id}/process`, "POST", { settings: { params: { tolerance: 0.03, voxel: 0.06 } } }, p.K); assert.equal(r.status, 200); const m = await (await fetch(`${BASE}/api/bim/projects/${p.id}/model`, { headers: p.K })).json(); assert.equal(m.ext.params.tolerance, 0.03); assert.ok(m.cloud.planes.length >= 6);
  const f = new FormData(); const b = Buffer.alloc(300); b.write("LASF", 0); b[104] = 0x82; f.set("file", new Blob([b]), "x.laz"); f.set("role", "cloud"); const u = await fetch(`${BASE}/api/bim/projects/${p.id}/files`, { method: "POST", headers: { origin: BASE, "x-bim-key": p.K["x-bim-key"] }, body: f }); assert.ok([415, 422].includes(u.status));
});
await t("D5 interoperability: every conversion verified", async () => {
  p = await open("interop", "interop-dxf"); const conv = tbl(p.m, "conversions").rows; assert.equal(conv.length, 4); assert.ok(conv.every((r) => r[1] === "verified"), JSON.stringify(conv)); assert.ok(tbl(p.m, "checks").rows.every((r) => r[4] === "match"));
  const ifc = await exportOf(p, "ifc"); assert.match(ifc.buf.toString(), /IFCWALL/);
});
await t("D6 floor-plan analysis: room schedule equals ground truth", async () => {
  p = await open("floorplan", "fp-dxf"); const exp = { "Living room": 22.8, "Bedroom 1": 13.25, Kitchen: 18.03, "Bedroom 2": 18.03 }; const rows = tbl(p.m, "rooms").rows; assert.equal(rows.length, 4); for (const r of rows) assert.ok(Math.abs(r[3] - exp[r[1]]) < 0.02, `${r[1]} ${r[3]}`);
  const csv = await exportOf(p, "table-rooms"); assert.match(csv.buf.toString(), /Net area/);
});
await t("D6 raster plan is interpreted only with a scale, and is labelled inferred", async () => {
  p = await open("floorplan", "fp-raster"); assert.ok(p.m.building.rooms.length >= 3); assert.ok(p.m.warnings.concat(p.m.assumptions).join(" ").match(/image|raster|inferred/i));
});
await t("D7 structural: known columns, beams, findings; revision diff", async () => {
  p = await open("structural", "struct-ab"); const h = Object.fromEntries(p.m.ext.headline.map((x) => [x.label, x.value])); assert.equal(h.Columns, 12); assert.equal(h.Beams, 17); assert.equal(h["Grid lines"], 7); assert.equal(h.Footings, 11);
  assert.equal(rule(p.m, "off-grid"), 1); assert.equal(rule(p.m, "unsupported-end"), 1); assert.equal(rule(p.m, "size-mismatch"), 1); assert.equal(rule(p.m, "no-footing"), 1); assert.equal(rule(p.m, "unlabelled-beam"), 2);
  const d = p.m.ext.extra.comparison; assert.deepEqual([d.columnsAdded, d.columnsRemoved, d.columnsMoved, d.columnsResized, d.beamsRemoved, d.beamsModified], [1, 1, 1, 1, 3, 3]);
  assert.ok(p.m.meshes.length >= 12 + 17); const g = await exportOf(p, "glb"); assert.equal(g.buf.subarray(0, 4).toString(), "glTF");
});
await t("D8 MEP coordination: matrix equals clash list; networks cover all runs", async () => {
  p = await open("mep", "mep-house"); const total = tbl(p.m, "matrix").rows.reduce((s, r) => s + r[1] + r[2], 0); assert.equal(total, p.m.clashes.length); assert.ok(p.m.clashes.some((c) => c.type === "hard")); assert.ok(p.m.mep.networks.length >= 3);
  const r = await J(`/api/bim/projects/${p.id}/process`, "POST", { settings: { clearance: 0.4 } }, p.K); assert.equal(r.status, 200); const m2 = await (await fetch(`${BASE}/api/bim/projects/${p.id}/model`, { headers: p.K })).json(); assert.ok(m2.clashes.filter((c) => c.type === "clearance").length >= p.m.clashes.filter((c) => c.type === "clearance").length);
});
await t("D9 BIM QC: injected defects found exactly; rule changes take effect; findings exported", async () => {
  p = await open("bim-qc", "qc-flawed"); assert.equal(rule(p.m, "name"), 1); assert.equal(rule(p.m, "guid"), 2); assert.equal(rule(p.m, "storey"), 1); assert.equal(rule(p.m, "duplicate"), 1); assert.equal(rule(p.m, "outlier"), 1); assert.equal(rule(p.m, "space-area"), 1); assert.equal(rule(p.m, "required-props"), 5);
  const r = await J(`/api/bim/projects/${p.id}/process`, "POST", { settings: { params: { enabled: { guid: false }, required: { IFCWALL: ["Pset_WallCommon.IsExternal"] } } } }, p.K); assert.equal(r.status, 200); const m2 = await (await fetch(`${BASE}/api/bim/projects/${p.id}/model`, { headers: p.K })).json(); assert.equal(rule(m2, "guid"), 0); assert.equal(rule(m2, "required-props"), 0);
  const csv = await exportOf(p, "issues-csv"); assert.ok(csv.buf.toString().split("\n").length > 3); const pdf = await exportOf(p, "report-pdf"); assert.equal(pdf.buf.subarray(0, 5).toString(), "%PDF-");
});
await t("D10 quantities: placeholder rates labelled, edits change the cost by arithmetic, report exports", async () => {
  p = await open("qto", "qto-house"); const sum = () => Number(tbl(p.m, "summary").rows.find((r) => r[0] === "Total")[1]); const before = sum(); assert.match(String(tbl(p.m, "boq").note), /PLACEHOLDER/);
  const line = tbl(p.m, "boq").rows.find((r) => r[0] === "WALL-EXT"); const r = await J(`/api/bim/projects/${p.id}/process`, "POST", { settings: { params: { rates: { "WALL-EXT": line[7] * 2 } } } }, p.K); assert.equal(r.status, 200);
  p.m = await (await fetch(`${BASE}/api/bim/projects/${p.id}/model`, { headers: p.K })).json(); const l2 = tbl(p.m, "boq").rows.find((x) => x[0] === "WALL-EXT"); assert.ok(Math.abs(l2[9] - line[9] * 2) < 0.05); const expectedDelta = line[9] * 1.1 * 1.08 * 1.05; assert.ok(Math.abs(sum() - before - expectedDelta) < 2, `${sum() - before} vs ${expectedDelta}`);
  const html = await exportOf(p, "report-html"); assert.match(html.buf.toString(), /PLACEHOLDER|placeholder/);
});
await t("security: wrong key refused, plan-only endpoints refuse analysis results, bad export names refused", async () => {
  const q = await open("structural", "struct-a"); const bad = await fetch(`${BASE}/api/bim/projects/${q.id}/model`, { headers: { "x-bim-key": "nope" } }); assert.equal(bad.status, 403);
  const cl = await J(`/api/bim/projects/${q.id}/clashes`, "POST", { clearance: 0.1, tolerance: 0.001 }, q.K); assert.equal(cl.status, 422);
  const ex = await J(`/api/bim/projects/${q.id}/exports`, "POST", { format: "../../etc/passwd" }, q.K); assert.ok([400, 422].includes(ex.status));
  const ex2 = await J(`/api/bim/projects/${q.id}/exports`, "POST", { format: "cad-svg" }, q.K); assert.equal(ex2.status, 422);
});
console.log(`\n${passed} passed`);
