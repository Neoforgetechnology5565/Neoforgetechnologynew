#!/usr/bin/env node
/**
 * API + integration tests for the AI CCTV demo. Needs a running server (default http://localhost:3000) with Firestore (emulator is fine).
 *   node scripts/test-cctv-api.mjs
 * Optional real-inference test: CCTV_TEST_IMAGE=/path/to/photo-with-people-or-vehicles.jpg (not shipped; use an image you are licensed to use).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000", HOST = new URL(BASE).host;
const h = (extra = {}) => ({ origin: BASE, ...extra });
const j = (r) => r.json();
let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const post = (p, body, headers = {}) => fetch(`${BASE}${p}`, { method: "POST", headers: h({ "content-type": "application/json", ...headers }), body: JSON.stringify(body) });

console.log("cctv api tests →", BASE);
await t("health, capabilities, samples, settings", async () => {
  const hl = await j(await fetch(`${BASE}/api/cctv/health`)); assert.equal(hl.ok, true);
  const c = await j(await fetch(`${BASE}/api/cctv/capabilities`));
  assert.equal(c.weaponDetection.available, false); assert.equal(c.rtsp.available, false); assert.equal(c.gpu, false); assert.equal(c.realtime, false);
  assert.ok((await j(await fetch(`${BASE}/api/cctv/samples`))).samples.length >= 2);
  assert.equal((await j(await fetch(`${BASE}/api/cctv/settings`))).limits.maxUploadMb, 40);
});

let ref, tok;
await t("reference job: results, tracking and events computed from annotations", async () => {
  const ann = JSON.parse(readFileSync("public/cctv/loading-bay.json", "utf8"));
  const r = await post("/api/cctv/jobs", { source: { type: "sample", id: "loading-bay" }, mode: "reference", meta: { durationSec: 14, width: 640, height: 360 }, settings: { zones: ann.suggested.zones } });
  assert.equal(r.status, 201); ref = await j(r); tok = ref.token; assert.ok(ref.token && !ref.tokenHash);
  const res = await j(await fetch(`${BASE}/api/cctv/jobs/${ref.id}/results`));
  assert.equal(res.stats.uniqueTotal, 4, "4 unique objects"); assert.ok(res.stats.detectionsTotal > res.stats.uniqueTotal * 5, "frame-level detections exceed unique objects");
  assert.ok(res.events.some((e) => e.type === "zone_dwell"), "dwell event");
  assert.equal(res.job.detector.name, "Reference annotations");
});
await t("settings update re-analyses without new inference", async () => {
  const off = await j(await post(`/api/cctv/jobs/${ref.id}/analyze`, { zones: [] }, { "x-job-token": tok }));
  assert.equal(off.events.filter((e) => e.type.startsWith("zone")).length, 0);
  const cls = await j(await post(`/api/cctv/jobs/${ref.id}/analyze`, { classes: ["person"] }, { "x-job-token": tok }));
  assert.deepEqual(Object.keys(cls.stats.uniqueByClass), ["person"]);
  assert.equal((await post(`/api/cctv/jobs/${ref.id}/analyze`, { minConf: 5 }, { "x-job-token": tok })).status, 400);
  assert.equal((await post(`/api/cctv/jobs/${ref.id}/analyze`, { zones: [{ id: "x", name: "bad<script>", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], classes: [], dwellSeconds: 1 }] }, { "x-job-token": tok })).status, 400, "zone names are validated");
});
await t("auth: token required, origin enforced", async () => {
  assert.equal((await post(`/api/cctv/jobs/${ref.id}/analyze`, {})).status, 403);
  assert.equal((await post(`/api/cctv/jobs/${ref.id}/analyze`, {}, { "x-job-token": "nope" })).status, 403);
  assert.equal((await fetch(`${BASE}/api/cctv/jobs`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" })).status, 403);
});
await t("events list, filters, detail and human review", async () => {
  await post(`/api/cctv/jobs/${ref.id}/analyze`, { zones: JSON.parse(readFileSync("public/cctv/loading-bay.json", "utf8")).suggested.zones }, { "x-job-token": tok });
  const all = await j(await fetch(`${BASE}/api/cctv/jobs/${ref.id}/events`));
  const dwell = await j(await fetch(`${BASE}/api/cctv/jobs/${ref.id}/events?type=zone_dwell`));
  assert.ok(dwell.events.length >= 1 && dwell.events.length < all.events.length);
  const ev = dwell.events[0];
  const bad = await fetch(`${BASE}/api/cctv/jobs/${ref.id}/events/${ev.id}`, { method: "PATCH", headers: h({ "content-type": "application/json" }), body: JSON.stringify({ review: "confirmed" }) }); assert.equal(bad.status, 403);
  const ok = await fetch(`${BASE}/api/cctv/jobs/${ref.id}/events/${ev.id}`, { method: "PATCH", headers: h({ "content-type": "application/json", "x-job-token": tok }), body: JSON.stringify({ review: "confirmed", note: "checked" }) }); assert.equal(ok.status, 200);
  const d = await j(await fetch(`${BASE}/api/cctv/jobs/${ref.id}/events/${ev.id}`)); assert.equal(d.event.review, "confirmed"); assert.equal(d.event.note, "checked");
  await post(`/api/cctv/jobs/${ref.id}/analyze`, { minConf: 0.5 }, { "x-job-token": tok });
  assert.equal((await j(await fetch(`${BASE}/api/cctv/jobs/${ref.id}/events/${ev.id}`))).event.review, "confirmed", "review survives re-analysis");
  assert.equal((await fetch(`${BASE}/api/cctv/jobs/${ref.id}/events/missing`)).status, 404);
});
await t("exports: CSV and JSON with honest disclosure", async () => {
  const csv = await (await fetch(`${BASE}/api/cctv/jobs/${ref.id}/export?format=csv`)).text();
  assert.match(csv.split("\n")[0], /"event_id","job_id","source","type"/); assert.ok(csv.split("\n").length > 3);
  const js = await j(await fetch(`${BASE}/api/cctv/jobs/${ref.id}/export?format=json`)); assert.ok(js.disclosure.note.includes("Weapon")); assert.ok(js.tracks.length);
});

await t("detection ingest: validation, tracking, finalize (browser-mode job)", async () => {
  const c = await j(await post("/api/cctv/jobs", { source: { type: "upload", name: "t.mp4" }, mode: "browser", meta: { durationSec: 3, width: 320, height: 240 } }));
  const H = { "x-job-token": c.token };
  assert.equal((await post(`/api/cctv/jobs/${c.id}/frames`, { frames: [{ i: 0, t: 0, dets: [{ cls: "person", conf: 2, box: [0, 0, 0.1, 0.1] }] }] }, H)).status, 400, "conf>1 rejected");
  assert.equal((await post(`/api/cctv/jobs/${c.id}/frames`, { frames: [{ i: 0, t: 0, dets: [{ cls: "person", conf: 0.9, box: [0.5, 0, 0.9, 0.1] }] }] }, H)).status, 200, "box inside 0..1 per component is accepted");
  assert.equal((await post(`/api/cctv/jobs/${c.id}/frames`, { frames: [{ i: 900, t: 0, dets: [] }] }, H)).status, 400, "frame outside video rejected");
  assert.equal((await post(`/api/cctv/jobs/${c.id}/finalize`, {}, { "x-job-token": "bad" })).status, 403);
  const frames = Array.from({ length: 12 }, (_, i) => ({ i, t: i / 4, dets: [{ cls: "person", conf: 0.8, box: [0.1 + i * 0.05, 0.3, 0.1, 0.3] }, ...(i % 5 === 0 ? [{ cls: "car", conf: 0.3, box: [0.7, 0.6, 0.2, 0.2] }] : [])] }));
  assert.equal((await post(`/api/cctv/jobs/${c.id}/frames`, { frames }, H)).status, 200);
  assert.equal((await fetch(`${BASE}/api/cctv/jobs/${c.id}/results`)).status, 409, "not ready before finalize");
  const f = await j(await post(`/api/cctv/jobs/${c.id}/finalize`, {}, H)); assert.equal(f.status, "ready");
  const res = await j(await fetch(`${BASE}/api/cctv/jobs/${c.id}/results`));
  assert.equal(res.stats.uniqueByClass.person, 1, "12 person detections are one tracked person"); assert.ok(!res.stats.uniqueByClass.car, "low-confidence car filtered by min confidence");
  assert.equal((await fetch(`${BASE}/api/cctv/jobs/${c.id}`, { method: "DELETE", headers: h(H) })).status, 200);
  assert.equal((await fetch(`${BASE}/api/cctv/jobs/${c.id}`)).status, 404, "deleted job is gone");
});

await t("upload validation: type by content, size, ids and path traversal", async () => {
  const up = (name, bytes, type = "video/mp4") => { const f = new FormData(); f.set("file", new Blob([bytes], { type }), name); return fetch(`${BASE}/api/cctv/videos/upload`, { method: "POST", headers: h(), body: f }); };
  assert.equal((await up("evil.mp4", Buffer.from("<?php echo 1; ?> not a video at all"))).status, 415, "renamed non-video rejected by magic bytes");
  assert.equal((await up("empty.mp4", Buffer.alloc(0))).status, 400);
  const big = Buffer.alloc(41 * 1024 * 1024); big.write("\0\0\0\x18ftypmp42", 0, "latin1"); assert.equal((await up("big.mp4", big)).status, 413, "over 40 MB rejected");
  const noOrigin = new FormData(); noOrigin.set("file", new Blob([Buffer.alloc(32)]), "a.mp4"); assert.equal((await fetch(`${BASE}/api/cctv/videos/upload`, { method: "POST", body: noOrigin })).status, 403);
  const good = await up("ok.mp4", readFileSync("public/cctv/gate-crossing.mp4")); assert.equal(good.status, 200); const g = await j(good); assert.match(g.videoId, /^[a-f0-9]{32}$/); assert.ok(Math.abs(g.probe.durationSec - 12) < 0.5);
  const corrupt = Buffer.concat([Buffer.from("\0\0\0\x18ftypmp42"), Buffer.alloc(200, 7)]); assert.equal((await up("bad.mp4", corrupt)).status, 422, "undecodable file rejected");
  for (const id of ["..%2f..%2fetc%2fpasswd", "../x", "%00", "abc"]) { const s = (await fetch(`${BASE}/api/cctv/jobs/${id}`)).status; assert.ok([400, 404].includes(s), `${id} → ${s}`); }
  const pj = await post("/api/cctv/jobs", { source: { type: "upload", videoId: "../../etc/passwd" }, mode: "worker", meta: { durationSec: 3, width: 320, height: 240 } }); assert.equal(pj.status, 400);
  assert.equal((await post("/api/cctv/jobs", { source: { type: "sample", id: "nope" }, mode: "reference", meta: { durationSec: 3, width: 320, height: 240 } })).status, 404);
  assert.equal((await post("/api/cctv/jobs", { source: { type: "upload" }, mode: "reference", meta: { durationSec: 3, width: 320, height: 240 } })).status, 400, "reference mode only for bundled samples");
  assert.equal((await fetch(`${BASE}/api/cctv/jobs`, { method: "POST", headers: h({ "content-type": "application/json" }), body: "{bad" })).status, 400, "malformed JSON gives a clean error");
});

const img = process.env.CCTV_TEST_IMAGE;
if (!img) console.log("  - skipped real-inference worker test (set CCTV_TEST_IMAGE to run it)");
else await t("REAL inference: ffmpeg + CenterNet worker on an uploaded clip", async () => {
  const caps = await j(await fetch(`${BASE}/api/cctv/capabilities`)); if (!caps.workerInference) { console.log("    worker unavailable on this host, skipped"); return; }
  const dir = mkdtempSync(path.join(os.tmpdir(), "cctvtest-")), vid = path.join(dir, "clip.mp4");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-i", img, "-t", "4", "-vf", "scale=640:-2,zoompan=z='1+0.0006*on':d=1:s=640x480:fps=10", "-pix_fmt", "yuv420p", vid]);
  const f = new FormData(); f.set("file", new Blob([readFileSync(vid)], { type: "video/mp4" }), "clip.mp4");
  const up = await j(await fetch(`${BASE}/api/cctv/videos/upload`, { method: "POST", headers: h(), body: f }));
  const c = await j(await post("/api/cctv/jobs", { source: { type: "upload", videoId: up.videoId, name: "clip.mp4" }, mode: "worker", meta: { durationSec: up.probe.durationSec, width: up.probe.width, height: up.probe.height }, settings: { sampleFps: 4 } }));
  assert.equal((await post(`/api/cctv/jobs/${c.id}/process`, {}, { "x-job-token": c.token })).status, 202);
  let info; for (let k = 0; k < 120; k++) { await new Promise((r) => setTimeout(r, 1500)); info = await j(await fetch(`${BASE}/api/cctv/jobs/${c.id}`)); if (info.status === "ready" || info.status === "failed") break; }
  assert.equal(info.status, "ready", info.error);
  const res = await j(await fetch(`${BASE}/api/cctv/jobs/${c.id}/results`));
  assert.ok(res.stats.detectionsTotal > 0, "the real detector found objects"); assert.ok(res.stats.uniqueTotal < res.stats.detectionsTotal, "tracking collapses repeats");
  console.log("    detections:", res.stats.detectionsTotal, "unique:", res.stats.uniqueTotal, JSON.stringify(res.stats.uniqueByClass));
});
console.log(process.exitCode ? "FAILED" : `all ${passed} api tests passed`);
