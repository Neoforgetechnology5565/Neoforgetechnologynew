#!/usr/bin/env node
/**
 * API + integration tests for the foot platform. Needs a running server (default http://localhost:3000) with Firestore (emulator is fine).
 *   node scripts/test-foot-api.mjs
 * Photos used are SYNTHETIC renderings from public/foot/samples; this proves the pipeline, not real-world accuracy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const hd = (extra = {}) => ({ origin: BASE, ...extra });
const J = (p, method, body, headers = {}) => fetch(`${BASE}${p}`, { method, headers: hd({ "content-type": "application/json", ...headers }), body: body ? JSON.stringify(body) : undefined });
const sample = (n) => new Blob([readFileSync(`public/foot/samples/${n}`)], { type: "image/jpeg" });
const upload = (id, headers, file, side, name = "photo.jpg", extra = {}) => { const f = new FormData(); f.set("file", file, name); f.set("side", side); for (const [k, v] of Object.entries(extra)) f.set(k, v); return fetch(`${BASE}/api/foot/sessions/${id}/captures`, { method: "POST", headers: hd(headers), body: f }); };

console.log("foot api tests →", BASE);
let id, key, K;
await t("health", async () => { const r = await fetch(`${BASE}/api/foot/health`); const j = await r.json(); assert.equal(j.ok, true); assert.equal(j.reconstruction.startsWith("none"), true); });
await t("create session returns key once; session is not readable without it", async () => {
  const r = await J("/api/foot/sessions", "POST", { name: "Test", paper: "a4" }); assert.equal(r.status, 201); const j = await r.json(); id = j.session.id; key = j.key; K = { "x-foot-key": key };
  assert.match(id, /^[a-f0-9]{32}$/); assert.ok(key.length >= 32); assert.equal(JSON.stringify(j).includes("ownerHash"), false);
  assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}`)).status, 403); assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}`, { headers: { "x-foot-key": "wrong" } })).status, 403);
});
await t("cross-origin POST rejected", async () => { const r = await fetch(`${BASE}/api/foot/sessions`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" }); assert.equal(r.status, 403); });
await t("rejects non-image and tiny files", async () => {
  const r1 = await upload(id, K, new Blob([Buffer.alloc(5000, 65)], { type: "image/jpeg" }), "left"); assert.equal(r1.status, 415);
  const r2 = await upload(id, K, new Blob([Buffer.alloc(100)]), "left"); assert.equal(r2.status, 422);
  const r3 = await upload(id, K, sample("synthetic-left-257x99.jpg"), "middle"); assert.equal(r3.status, 400);
});
let leftCap, rightCap;
await t("upload left photo → analysed with real stage timings", async () => {
  const r = await upload(id, K, sample("synthetic-left-257x99.jpg"), "left", "left.jpg", { source: "upload" }); assert.equal(r.status, 201); const { capture } = await r.json(); leftCap = capture;
  assert.equal(capture.auto.ok, true); assert.ok(Math.abs(capture.auto.measurement.lengthMm - 257) < 4, `length ${capture.auto.measurement.lengthMm}`); assert.ok(Math.abs(capture.auto.measurement.widthMm - 99) < 4);
  const stages = capture.job.events.map((e) => e.stage); for (const s of ["Uploading", "Validating", "Preparing", "Calibrating", "Measuring", "Completed"]) assert.ok(stages.includes(s), s);
  assert.ok(capture.job.events.every((e, i, a) => i === 0 || e.at >= a[i - 1].at));
});
await t("upload right photo (Letter sheet auto-detected)", async () => {
  const r = await upload(id, K, sample("synthetic-right-letter-243x93.jpg"), "right", "r.jpg", { paper: "auto" }); assert.equal(r.status, 201); rightCap = (await r.json()).capture; assert.equal(rightCap.auto.calibration.paper, "letter"); assert.ok(Math.abs(rightCap.auto.measurement.lengthMm - 243) < 4);
});
await t("poor photos are stored but never produce invented numbers", async () => {
  for (const [n, stage] of [["bad-no-paper.jpg", "paper"], ["bad-too-dark.jpg", "paper"], ["bad-white-sock.jpg", "segmentation"]]) {
    const r = await upload(id, K, sample(n), "left"); assert.equal(r.status, 201); const { capture } = await r.json(); assert.equal(capture.auto.ok, false, n); assert.equal(capture.auto.measurement, undefined, n); assert.equal(capture.auto.stage, stage, n); assert.ok(capture.auto.reason.length > 20); assert.equal(capture.job.status, "failed");
    await J(`/api/foot/sessions/${id}/captures/${capture.id}`, "DELETE", undefined, K);
  }
});
await t("manual corner correction keeps the original and can be reverted", async () => {
  const c = leftCap.auto.calibration.corners.map((p) => ({ x: p.x + 1, y: p.y - 1 }));
  const r = await J(`/api/foot/sessions/${id}/captures/${leftCap.id}/calibration`, "POST", { corners: c, paper: "a4" }, K); assert.equal(r.status, 200); const { capture } = await r.json();
  assert.equal(capture.manual.ok, true); assert.equal(capture.manual.calibration.method, "manual-corners"); assert.equal(capture.use, "manual"); assert.deepEqual(capture.auto.measurement.lengthMm, leftCap.auto.measurement.lengthMm); assert.ok(Math.abs(capture.manual.measurement.lengthMm - 257) < 5);
  const bad = await J(`/api/foot/sessions/${id}/captures/${leftCap.id}/calibration`, "POST", { corners: [{ x: 1, y: 1 }, { x: 99999, y: 1 }, { x: 5, y: 5 }, { x: 9, y: 9 }], paper: "a4" }, K); assert.equal(bad.status, 400);
  const rv = await J(`/api/foot/sessions/${id}/captures/${leftCap.id}/calibration`, "DELETE", undefined, K); assert.equal((await rv.json()).capture.use, "auto");
});
await t("image is owner-only and private", async () => {
  assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}/captures/${leftCap.id}/image`)).status, 403);
  const r = await fetch(`${BASE}/api/foot/sessions/${id}/captures/${leftCap.id}/image`, { headers: K }); assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/jpeg"); assert.match(r.headers.get("cache-control"), /no-store/);
});
await t("process → results → recommendations → report", async () => {
  const p = await J(`/api/foot/sessions/${id}/process`, "POST", {}, K); assert.equal(p.status, 200); const pj = await p.json(); assert.equal(pj.status, "completed"); assert.ok(pj.events.map((e) => e.stage).includes("Generating recommendations"));
  const res = await (await fetch(`${BASE}/api/foot/sessions/${id}/results`, { headers: K })).json();
  assert.ok(res.results.left && res.results.right && res.results.comparison); assert.equal(res.results.comparison.largerFoot, "left"); assert.ok(res.results.size.eu >= 38 && res.results.size.eu <= 42); assert.equal(res.results.recommendations.length, 5); assert.ok(res.results.recommendations.every((x) => x.profile.sample === true));
  const rec = await (await J(`/api/foot/sessions/${id}/recommendations`, "POST", { fit: "roomy" }, K)).json(); assert.ok(rec.size.eu >= res.results.size.eu); assert.match(rec.disclaimer, /not a guarantee/);
  const csv = await (await fetch(`${BASE}/api/foot/sessions/${id}/report?format=csv`, { headers: K })).text(); assert.match(csv, /side,capture/); assert.equal(csv.trim().split("\n").length, 3);
  const rep = await (await fetch(`${BASE}/api/foot/sessions/${id}/report`, { headers: K })).json(); assert.ok(rep.captures.length >= 2); assert.equal(rep.rulesetId, "general-v1");
  const st = await (await fetch(`${BASE}/api/foot/sessions/${id}/status`, { headers: K })).json(); assert.equal(st.status, "processed");
});
await t("sample (demo) data is labelled and includes known truth", async () => {
  const r = await J(`/api/foot/sessions/${id}/samples`, "POST", { side: "right", lengthMm: 262, widthMm: 100 }, K); assert.equal(r.status, 201); const { capture } = await r.json(); assert.equal(capture.source, "sample"); assert.equal(capture.sampleTruth.lengthMm, 262); assert.ok(Math.abs(capture.auto.measurement.lengthMm - 262) < 4, `${capture.auto.measurement.lengthMm}`);
  const res = await (await fetch(`${BASE}/api/foot/sessions/${id}/results`, { headers: K })).json(); assert.equal(res.results.anySample, true);
});
await t("OBJ import: measured with declared units; invalid files rejected", async () => {
  const pts = []; for (let i = 0; i < 400; i++) { const a = i * 0.7; pts.push(`v ${(Math.cos(a) * 13).toFixed(3)} ${(Math.sin(a * 1.3) * 4.5).toFixed(3)} ${(Math.sin(a) * 3.5).toFixed(3)}`); } const faces = []; for (let i = 1; i <= 398; i++) faces.push(`f ${i} ${i + 1} ${i + 2}`);
  const ok = await fetch(`${BASE}/api/foot/sessions/${id}/mesh?side=left&unit=cm&filename=a.obj`, { method: "POST", headers: hd({ ...K, "content-type": "text/plain" }), body: [...pts, ...faces].join("\n") }); assert.equal(ok.status, 201); const m = (await ok.json()).mesh; assert.ok(m.measurement.lengthMm > 200 && m.measurement.lengthMm < 300, `${m.measurement.lengthMm}`);
  const bad = await fetch(`${BASE}/api/foot/sessions/${id}/mesh?side=left&unit=cm`, { method: "POST", headers: hd({ ...K, "content-type": "text/plain" }), body: "v 1 2 3\nf 1 2 3" }); assert.equal(bad.status, 422);
  const noUnit = await fetch(`${BASE}/api/foot/sessions/${id}/mesh?side=left`, { method: "POST", headers: hd({ ...K, "content-type": "text/plain" }), body: "x" }); assert.equal(noUnit.status, 400);
});
let token;
await t("phone link: short-lived, capture-only token", async () => {
  const r = await J(`/api/foot/sessions/${id}/phone-link`, "POST", {}, K); assert.equal(r.status, 201); const j = await r.json(); token = j.token; assert.ok(j.expiresAt - Date.now() <= 30 * 60_000 + 5000);
  const P = { "x-foot-phone": token };
  assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}`, { headers: P })).status, 200);
  const up = await upload(id, P, sample("synthetic-right-254x97.jpg"), "right", "phone.jpg", { source: "camera" }); assert.equal(up.status, 201); assert.equal((await up.json()).uploadedBy, "phone");
  assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}/captures/${leftCap.id}/image`, { headers: P })).status, 403);
  assert.equal((await J(`/api/foot/sessions/${id}`, "DELETE", undefined, P)).status, 403);
  assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}/results`, { headers: P })).status, 403);
  assert.equal((await J(`/api/foot/sessions/${id}/phone-link`, "DELETE", undefined, K)).status, 200);
  assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}`, { headers: P })).status, 403);
});
await t("history: list returns only valid {id,key} pairs; reopen works", async () => {
  const r = await (await J("/api/foot/sessions/list", "POST", { items: [{ id, key }, { id, key: "wrongwrongwrong" }, { id: "0".repeat(32), key }] })).json(); assert.equal(r.sessions.length, 1); assert.equal(r.sessions[0].id, id);
  const g = await (await fetch(`${BASE}/api/foot/sessions/${id}`, { headers: K })).json(); assert.ok(g.session.captureCount >= 3);
});
await t("delete removes the session, captures and images", async () => {
  const r = await J(`/api/foot/sessions/${id}`, "DELETE", undefined, K); assert.equal(r.status, 200);
  assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}`, { headers: K })).status, 404); assert.equal((await fetch(`${BASE}/api/foot/sessions/${id}/captures/${leftCap.id}/image`, { headers: K })).status, 404);
});
console.log(`\n${passed} passed`);
