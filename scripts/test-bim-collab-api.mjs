#!/usr/bin/env node
/**
 * API tests for demonstration 11 (collaboration, issue tracking and model review). Needs a running server with Firestore (emulator is fine).
 *   node scripts/test-bim-collab-api.mjs
 * The sample project has two IFC revisions with known differences: window O009 deleted, door O011 widened by 0.10 m, column C98 added.
 */
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL || "http://localhost:3000"; let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const J = (p, m, body, h = {}, origin = BASE) => fetch(`${BASE}${p}`, { method: m, headers: { origin, "content-type": "application/json", ...h }, body: body ? JSON.stringify(body) : undefined });
let id, O, versions, issues, reviewer, viewer; const P = (s = "") => `/api/bim/projects/${id}${s}`;
console.log("bim collab api tests →", BASE);

await t("create review project from the sample: two versions registered, three sample issues created and labelled", async () => {
  const c = await (await J("/api/bim/projects", "POST", { demo: "collab", name: "Review test" })).json(); id = c.project.id; O = { "x-bim-key": c.key };
  const r = await J(P("/samples"), "POST", { sample: "collab-house" }, O); assert.equal(r.status, 200, await r.clone().text());
  versions = (await (await fetch(`${BASE}${P("/versions")}`, { headers: O })).json()).versions; assert.equal(versions.length, 2); assert.ok(versions.every((v) => v.sample && v.elements > 30 && !("modelBlob" in v)));
  issues = (await (await fetch(`${BASE}${P("/issues")}`, { headers: O })).json()); assert.equal(issues.total, 3); assert.ok(issues.issues.every((i) => i.sample && i.labels.includes("sample")));
});
await t("version comparison finds exactly the known differences", async () => {
  const c = await (await fetch(`${BASE}${P(`/compare?a=${versions[0].id}&b=${versions[1].id}`)}`, { headers: O })).json();
  assert.deepEqual(c.added.map((e) => e.name), ["C98"]); assert.deepEqual(c.removed.map((e) => e.name), ["O009"]);
  const door = c.changed.find((e) => e.name === "O011"); assert.ok(door, "door changed"); const g = door.changes.find((x) => x.kind === "geometry"); assert.ok(g); const shift = Number(/max shift ([\d.]+)/.exec(g.to)[1]); assert.ok(Math.abs(shift - 0.05) < 0.006, `door shift ${shift}`);
  assert.ok(c.changed.some((e) => /^W\d+/.test(e.name) && e.changes.some((x) => x.kind === "quantity")), "host walls change quantities (new opening areas)"); assert.ok(c.summary.changed >= 2 && c.unchanged > 20);
  const same = await fetch(`${BASE}${P(`/compare?a=${versions[0].id}&b=${versions[0].id}`)}`, { headers: O }); assert.equal(same.status, 400);
});
await t("per-version model is served and differs (revision B has one more column, one fewer window)", async () => {
  const a = await (await fetch(`${BASE}${P(`/versions/${versions[0].id}/model`)}`, { headers: O })).json(), b = await (await fetch(`${BASE}${P(`/versions/${versions[1].id}/model`)}`, { headers: O })).json();
  assert.equal(b.ifc.classes.IFCCOLUMN, (a.ifc.classes.IFCCOLUMN ?? 0) + 1); assert.equal(b.ifc.classes.IFCWINDOW, a.ifc.classes.IFCWINDOW - 1);
  const cur = await (await fetch(`${BASE}${P("/model")}`, { headers: O })).json(); assert.equal(cur.ifc.classes.IFCCOLUMN, b.ifc.classes.IFCCOLUMN);
});
let issue;
await t("owner creates an issue with a viewpoint and element references; fields are validated", async () => {
  const vp = { cam: { pos: [12, -10, 8], target: [5, 4, 1], ortho: false }, section: { on: true, axis: "elevation", offset: 1.5, flip: false }, hiddenCats: ["roof"], selected: "#402" };
  const r = await J(P("/issues"), "POST", { title: "Clearance at entrance", description: "Check door swing against the stair.", type: "coordination", priority: "high", assignee: "Alex", due: "2030-05-01", labels: ["entrance"], elements: [{ guid: "abc", id: "#402", label: "Door O011" }], versionId: versions[1].id, viewpoint: vp }, O); assert.equal(r.status, 201); issue = (await r.json()).issue; assert.equal(issue.number, 4); assert.equal(issue.reporter, "Owner"); assert.equal(issue.status, "open"); assert.deepEqual(issue.viewpoint.cam.pos, [12, -10, 8]);
  for (const bad of [{ title: "x" }, { title: "ok title", due: "01/05/2030" }, { title: "ok title", priority: "urgent" }, { title: "ok title", versionId: "nope" }, { title: "ok title", viewpoint: { cam: { pos: [1, 2], target: [0, 0, 0], ortho: false } } }]) assert.equal((await J(P("/issues"), "POST", bad, O)).status, 400, JSON.stringify(bad));
});
await t("status, assignee and priority changes are recorded in the issue history; comments are added with the author", async () => {
  let r = await J(P(`/issues/${issue.id}`), "PATCH", { status: "in-progress", assignee: "Sam" }, O); assert.equal(r.status, 200); issue = (await r.json()).issue; assert.equal(issue.status, "in-progress"); assert.ok(issue.history.some((h) => h.field === "status" && h.from === "open" && h.to === "in-progress" && h.by === "Owner")); assert.ok(issue.history.some((h) => h.field === "assignee" && h.to === "Sam"));
  // regression: a PATCH must change only the fields it names (zod defaults once reset type, labels, elements and due on every edit)
  assert.equal(issue.type, "coordination"); assert.equal(issue.priority, "high"); assert.equal(issue.due, "2030-05-01"); assert.deepEqual(issue.labels, ["entrance"]); assert.equal(issue.elements.length, 1); assert.ok(issue.viewpoint); assert.equal(issue.versionId, versions[1].id); assert.deepEqual([...new Set(issue.history.map((h) => h.field))].sort(), ["assignee", "created", "status"]);
  r = await J(P(`/issues/${issue.id}/comments`, "POST"), "POST", { text: "Swing checked on site." }, O); assert.equal(r.status, 201); issue = (await r.json()).issue; assert.equal(issue.comments.length, 1); assert.equal(issue.comments[0].author, "Owner");
  assert.equal((await J(P(`/issues/${issue.id}/comments`), "POST", { text: "x".repeat(2001) }, O)).status, 400); assert.equal((await J(P(`/issues/${issue.id}`), "PATCH", { status: "done" }, O)).status, 400); assert.equal((await J(P(`/issues/${issue.id}`), "PATCH", { reporter: "Mallory" }, O)).status, 400);
});
await t("issue list filters: status, assignee, priority, text search", async () => {
  const q = async (s) => (await (await fetch(`${BASE}${P(`/issues?${s}`)}`, { headers: O })).json()); assert.equal((await q("status=in-progress")).issues.filter((i) => i.id === issue.id).length, 1); assert.equal((await q("assignee=sam")).total, 1); assert.ok((await q("priority=high")).issues.every((i) => i.priority === "high")); assert.ok((await q("q=window")).issues.some((i) => /Window/.test(i.title))); assert.equal((await q("q=zzzznotfound")).total, 0);
});
await t("share keys: reviewer can raise issues and comment under their own name; viewer is read-only; neither can manage the project", async () => {
  let r = await J(P("/shares"), "POST", { name: "Dana (reviewer)", role: "reviewer" }, O); assert.equal(r.status, 201); reviewer = { "x-bim-share": (await r.json()).key }; r = await J(P("/shares"), "POST", { name: "Vic (viewer)", role: "viewer" }, O); viewer = { "x-bim-share": (await r.json()).key };
  assert.equal((await fetch(`${BASE}${P("/issues")}`, { headers: viewer })).status, 200); assert.equal((await fetch(`${BASE}${P("/model")}`, { headers: viewer })).status, 200);
  assert.equal((await J(P("/issues"), "POST", { title: "Viewer attempt" }, viewer)).status, 403); assert.equal((await J(P(`/issues/${issue.id}/comments`), "POST", { text: "hi" }, viewer)).status, 403);
  r = await J(P("/issues"), "POST", { title: "Raised by reviewer", description: "x", reporter: "Mallory" }, reviewer); assert.equal(r.status, 201); const ri = (await r.json()).issue; assert.equal(ri.reporter, "Dana (reviewer)");
  r = await J(P(`/issues/${ri.id}/comments`), "POST", { text: "A comment" }, reviewer); assert.equal((await r.json()).issue.comments[0].author, "Dana (reviewer)");
  assert.equal((await J(P(`/issues/${ri.id}`), "DELETE", undefined, reviewer)).status, 403); assert.equal((await J(P("/shares"), "POST", { name: "x", role: "reviewer" }, reviewer)).status, 403); assert.equal((await J(P("/versions"), "POST", { fileId: "xxxxxxxx" }, reviewer)).status, 403); assert.equal((await J(P("/process"), "POST", {}, reviewer)).status, 403);
  const sh = (await (await fetch(`${BASE}${P("/shares")}`, { headers: O })).json()).shares; assert.equal(sh.length, 2); assert.ok(!JSON.stringify(sh).includes(reviewer["x-bim-share"]));
});
await t("revoking a share key removes access immediately; the public project view never exposes key hashes", async () => {
  const sh = (await (await fetch(`${BASE}${P("/shares")}`, { headers: O })).json()).shares.find((s) => s.role === "viewer"); const r = await J(P(`/shares?id=${sh.id}`), "DELETE", undefined, O); assert.equal(r.status, 200); assert.equal((await fetch(`${BASE}${P("/issues")}`, { headers: viewer })).status, 403);
  const pj = await (await fetch(`${BASE}${P("")}`, { headers: reviewer })).text(); assert.ok(!/ownerHash|hash"/.test(pj));
});
await t("saved views: create, list, delete (owner only)", async () => {
  const vp = { cam: { pos: [1, 2, 3], target: [0, 0, 0], ortho: true }, hiddenCats: ["mep-duct"] }; let r = await J(P("/views"), "POST", { name: "Entrance, no ducts", versionId: versions[1].id, viewpoint: vp }, reviewer); assert.equal(r.status, 201); const v = (await r.json()).view; assert.equal(v.by, "Dana (reviewer)");
  assert.equal((await (await fetch(`${BASE}${P("/views")}`, { headers: O })).json()).views.length, 1); assert.equal((await J(P(`/views?id=${v.id}`), "DELETE", undefined, reviewer)).status, 403); assert.equal((await J(P(`/views?id=${v.id}`), "DELETE", undefined, O)).status, 200);
});
await t("reports: CSV, JSON and HTML downloads include issues, comments and versions", async () => {
  const csv = await (await fetch(`${BASE}${P("/report?format=csv")}`, { headers: O })).text(); assert.match(csv, /Clearance at entrance/); assert.ok(csv.split("\n").length >= 6);
  const js = await (await fetch(`${BASE}${P("/report?format=json")}`, { headers: O })).json(); assert.equal(js.versions.length, 2); assert.ok(js.issues.length >= 5); const html = await (await fetch(`${BASE}${P("/report?format=html")}`, { headers: O })).text(); assert.match(html, /Swing checked on site/); assert.match(html, /SAMPLE DATA/); assert.equal((await fetch(`${BASE}${P("/report?format=pdf")}`, { headers: O })).status, 400);
});
await t("activity log records versions, issues, comments, shares and status changes; wrong key and cross-origin writes are refused", async () => {
  const a = (await (await fetch(`${BASE}${P("/activity")}`, { headers: O })).json()).activity; for (const k of ["version", "issue", "comment", "share", "status"]) assert.ok(a.some((x) => x.action === k), k);
  assert.equal((await fetch(`${BASE}${P("/issues")}`, { headers: { "x-bim-key": "wrong" } })).status, 403); assert.equal((await J(P("/issues"), "POST", { title: "Cross origin" }, O, "https://evil.example")).status, 403);
});
await t("a non-IFC file cannot become a version; deleting the project deletes its issues", async () => {
  const f = new FormData(); f.set("file", new Blob(["0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"]), "plan.dxf"); f.set("role", "model"); const up = await fetch(`${BASE}${P("/files")}`, { method: "POST", headers: { origin: BASE, ...O }, body: f }); assert.equal(up.status, 201); const fid = (await up.json()).file.id;
  const r = await J(P("/versions"), "POST", { fileId: fid, label: "bad" }, O); assert.equal(r.status, 422);
  assert.equal((await J(P(""), "DELETE", undefined, O)).status, 200); assert.equal((await fetch(`${BASE}${P("/issues")}`, { headers: O })).status, 404);
});
console.log(`\n${passed} passed`);
