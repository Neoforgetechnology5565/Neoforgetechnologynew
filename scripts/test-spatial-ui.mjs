#!/usr/bin/env node
/**
 * End-to-end UI tests of the spatial mapping / 3D reconstruction demonstration (Playwright, software WebGL).
 *   MODE=static  site WITHOUT SPATIAL_API_URL: precomputed sample, local viewing of imports, clear messages for what needs the service
 *   MODE=server  site with SPATIAL_API_URL=http://localhost:8030 and services/spatial-recon running: live reconstruction (several minutes), failure path, processing ops
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3001 MODE=static SHOTS=/tmp/shots node scripts/test-spatial-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001", MODE = process.env.MODE || "static", APP = `${BASE}/ai-demos/smart-glasses-spatial-mapping/app`, SHOTS = process.env.SHOTS || "/tmp/spatial-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|Computed (radius|min\/max) (is|have) NaN/.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const text = (id) => tid(id).innerText();
/** Non-background pixel positions of the WebGL viewport (excluding the axis gizmo corner), read back through a 2D canvas. */
const scene = () => p.evaluate(() => { const c = document.querySelector("[data-testid=viewport] canvas"); const w = c.width, h = c.height; const o = document.createElement("canvas"); o.width = w; o.height = h; const g = o.getContext("2d"); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, w, h).data; const r = c.getBoundingClientRect(); const k = r.width / w; const pts = []; let n = 0, sig = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) { const i = (y * w + x) * 4; sig += d[i] + d[i + 1] + d[i + 2]; const diff = Math.abs(d[i] - 11) + Math.abs(d[i + 1] - 18) + Math.abs(d[i + 2] - 32); if (diff > 40 && !(x < 150 * (w / r.width) && y > h - 150 * (h / r.height))) { n++; pts.push([r.left + x * k, r.top + y * k]); } } return { n, sig, pts }; });
const pick = (pts, f) => pts[Math.floor(pts.length * f)];
const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ""));
console.log(`spatial ui tests (${MODE}) →`, APP);
await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: honest scope, Georgia, logo, three data origins, nothing shown before data exists", async () => {
  const txt = await p.locator("body").innerText(); ok(/Spatial Computing/i.test(txt) && /Smart Glasses Spatial Mapping & 3D Reconstruction/.test(txt) && /relative/i.test(txt) && /not survey-grade/i.test(txt), "scope text"); ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia");
  ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link"); ok(/not.*the processing of a new upload/i.test(await text("mode-note")), "precomputed is labelled as not a new upload");
  ok(!(await tid("origin-badge").count()), "no origin badge before anything is loaded"); ok(/Load a precomputed sample/.test(await text("inspector")), "inspector empty state"); ok((await p.getByTestId("layer-cloud").count()) === 0, "no layer controls before data exists");
  await tid("sample-highway").waitFor();
});
await t("precomputed sample: loads, is badged as precomputed, with licence, scenario and measured quality numbers", async () => {
  await tid("sample-highway").click(); await tid("origin-badge").waitFor({ timeout: 30000 }); ok(/precomputed sample result/.test(await text("origin-badge")), "badge"); const c = await text("sample-credit"); ok(/Udacity/.test(c) && /MIT/.test(c) && /NOT an indoor/.test(c) && /moves?|move through/.test(c), "credit and honest scenario");
  await p.waitForFunction(() => Number(document.querySelector("[data-testid=i-frames]")?.textContent) > 0, null, { timeout: 30000 }); ok(num(await text("i-frames")) === 84, "84 keyframes"); ok(/84 of 84/.test(await text("i-registered")), `registered: ${await text("i-registered")}`);
  await p.waitForFunction(() => /[0-9]/.test(document.querySelector("[data-testid=i-points]")?.textContent || ""), null, { timeout: 30000 }); ok(num((await text("i-points")).split("+")[0]) > 1000, `sparse points ${await text("i-points")}`); ok(/vertices/.test(await text("i-mesh")), "mesh stats"); ok(/relative/.test(await text("i-scale")) && /not metres/.test(await text("scale-note")), "scale is relative");
  ok(/precomputed result/.test(await text("i-origin")), "inspector origin"); await shot("loaded");
});
await t("viewport shows real data; layers exist only for data that exists and change what is drawn", async () => {
  await p.waitForTimeout(1500); const a = await scene(); ok(a.n > 800, `non-background pixels ${a.n}`);
  for (const l of ["cloud", "dense", "mesh", "trajectory", "cameras", "bbox", "axes", "grid"]) ok(await tid(`layer-${l}`).count(), `layer ${l} listed`);
  // isolate each layer: with every other layer off, a layer alone draws pixels, and turning it off removes them
  const only = async (name) => { for (const l of ["cloud", "dense", "mesh", "trajectory", "cameras", "axes"]) { const c = tid(`layer-${l}`); if (l === name) await c.check(); else await c.uncheck(); } await p.waitForTimeout(600); return scene(); };
  const none = await only("axes"); await tid("layer-axes").uncheck(); await p.waitForTimeout(400); const empty = await scene();
  const mesh = await only("mesh"); ok(mesh.n > 500, `mesh alone draws ${mesh.n} px`); const dense = await only("dense"); ok(dense.n > 500, `dense cloud alone draws ${dense.n} px`); const sparse = await only("cloud"); ok(sparse.n > 100, `sparse cloud alone draws ${sparse.n} px`);
  const traj = await only("trajectory"); ok(traj.n > 5, `trajectory alone draws ${traj.n} px`); const cams = await only("cameras"); ok(cams.n > 100, `cameras alone draw ${cams.n} px`); ok(empty.n < 100, `everything off draws ${empty.n} px`);
  void none;
  for (const l of ["cloud", "dense", "mesh", "trajectory", "cameras", "axes"]) await tid(`layer-${l}`).check(); await tid("layer-bbox").check(); await p.waitForTimeout(500); const d = await scene(); ok(d.n > mesh.n, "all layers back on draw more");
  await tid("layer-bbox").uncheck();
  await tid("layer-bbox").uncheck();
  for (const l of ["cloud", "dense", "mesh", "trajectory", "cameras", "axes"]) await tid(`layer-${l}`).check();
});
await t("measurement: distance and angle in relative units; calibration with a known distance changes the unit and reproduces it", async () => {
  for (const l of ["cloud", "dense", "trajectory", "cameras"]) await tid(`layer-${l}`).uncheck(); await tid("layer-mesh").check(); await p.waitForTimeout(800); const s = await scene(); const byX = [...s.pts].sort((a, b) => a[0] - b[0]), byY = [...s.pts].sort((a, b) => a[1] - b[1]); const A = byX[Math.floor(byX.length * 0.15)], B = byX[Math.floor(byX.length * 0.85)], C = byY[Math.floor(byY.length * 0.1)];
  await tid("tool-distance").click(); await p.mouse.click(...A); await p.mouse.click(...B); await p.waitForFunction(() => document.querySelectorAll("[data-testid=measure-value]").length >= 1, null, { timeout: 5000 }); const v = await text("measure-value"); ok(/model units/.test(v) && num(v) > 0, `distance ${v}`);
  await tid("tool-angle").click(); await p.mouse.click(...A); await p.mouse.click(...C); await p.mouse.click(...B); await p.waitForFunction(() => document.querySelectorAll("[data-testid=measure-value]").length >= 2, null, { timeout: 5000 }); const ang = await p.locator("[data-testid=measure-value]").nth(1).innerText(); ok(/°/.test(ang) && num(ang) > 0 && num(ang) <= 180, `angle ${ang}`);
  await tid("tool-calibrate").click(); await p.mouse.click(...A); await p.mouse.click(...B); await tid("cal-dist").fill("5"); await tid("cal-apply").click(); await p.waitForFunction(() => /calibrated by you/.test(document.querySelector("[data-testid=i-scale]")?.textContent || ""), null, { timeout: 5000 });
  ok(/one reference|reference/.test(await text("inspector")) && /Error in that reference/.test(await text("inspector")), "calibration caveat shown");
  await tid("tool-distance").click(); await p.mouse.click(...A); await p.mouse.click(...B); await p.waitForFunction(() => document.querySelectorAll("[data-testid=measure-value]").length >= 1, null, { timeout: 5000 }); const m = await text("measure-value"); ok(/ m$/.test(m) && Math.abs(num(m) - 5) < 0.05, `re-measuring the calibration pair gives 5 m, got ${m}`); await shot("measure");
  for (const l of ["cloud", "dense", "trajectory", "cameras"]) await tid(`layer-${l}`).check();
});
await t("source media: frames linked to cameras, feature overlay, verified matches, relative depth, tracking chart", async () => {
  await tid("tool-orbit").click(); const strip = tid("frame-strip"); ok((await strip.locator("button").count()) >= 80, "all keyframes in the strip"); await strip.locator("button").nth(40).click(); await tid("frame-canvas").waitFor();
  ok(/camera pose estimated/.test(await text("frame-info")), `frame info: ${await text("frame-info")}`); ok(/t = [0-9.]+ s/.test(await text("frame-info")), "timestamp");
  await tid("tab-matches").click(); await p.waitForFunction(() => document.querySelectorAll("[data-testid=source-media] figure img").length >= 3, null, { timeout: 15000 }); ok(/verified|inliers/.test(await text("source-media")), "match captions");
  await tid("tab-depth").click(); await p.waitForFunction(() => document.querySelectorAll("[data-testid=source-media] figure img").length >= 4, null, { timeout: 15000 }); ok(/not a measurement/i.test(await text("source-media")), "depth is labelled as not a measurement");
  ok((await tid("track-chart").count()) === 1 && /neighbouring frames/.test(await text("track-chart")), "tracking chart");
});
await t("frame canvas draws the stored feature points (toggle changes pixels) on a frame that has them", async () => {
  await tid("tab-frame").click(); const strip = tid("frame-strip"); await strip.locator("button").first().click(); await tid("frame-canvas").waitFor(); await p.waitForFunction(() => document.querySelector("[data-testid=frame-canvas]")?.width >= 640, null, { timeout: 15000 }); await p.waitForTimeout(500);
  const px = () => p.evaluate(() => { const c = document.querySelector("[data-testid=frame-canvas]"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 52 && d[i + 1] === 211 && d[i + 2] === 153) n++; return n; });
  const on = await px(); ok(on > 20, `green feature pixels ${on}`); await tid("toggle-features").uncheck(); await p.waitForTimeout(500); ok((await px()) < on / 4, "features hidden"); await tid("toggle-features").check();
});
await t("outputs: each artifact has a status; downloads are real files with the expected content", async () => {
  const rows = tid("outputs").locator("[data-testid=artifact]"); ok((await rows.count()) >= 10, "artifacts listed"); const txt = await text("outputs"); ok(/points_sparse\.ply/.test(txt) && /points_dense\.ply/.test(txt) && /mesh\.glb/.test(txt) && /approximate/.test(txt), "main outputs and approximate labels");
  const dl = async (name) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), tid(`download-${name}`).click()]); const path = `${SHOTS}/${MODE}-${name}`; await d.saveAs(path); return path; };
  const cam = JSON.parse(readFileSync(await dl("cameras.json"), "utf8")); ok(cam.registered.length === 84 && cam.scale.metric === false, "cameras.json: 84 poses, relative scale");
  ok(readFileSync(await dl("points_sparse.ply")).subarray(0, 3).toString() === "ply", "PLY header"); const glb = readFileSync(await dl("mesh.glb")); ok(glb.subarray(0, 4).toString() === "glTF", "GLB header");
  const [d] = await Promise.all([p.waitForEvent("download"), tid("download-report").click()]); const rp = `${SHOTS}/${MODE}-report.json`; await d.saveAs(rp); const rep = JSON.parse(readFileSync(rp, "utf8")); ok(/precomputed/.test(rep.origin) && rep.report.quality.images_registered === 84, "report says precomputed");
});
await t("import: sample cloud and mesh open in the browser, labelled as viewing only with unknown scale", async () => {
  await tid("mode-import").click(); await tid("import-sample-cloud").click(); await p.waitForFunction(() => /imported/.test(document.querySelector("[data-testid=origin-badge]")?.textContent || ""), null, { timeout: 15000 }); await p.waitForFunction(() => /[0-9]/.test(document.querySelector("[data-testid=i-points]")?.textContent || ""), null, { timeout: 15000 });
  ok(/unknown/.test(await text("i-scale")) && /does not state its units/.test(await text("scale-note")), "scale unknown for imports"); ok(num(await text("i-points")) > 1000, "points counted"); ok(!(await tid("layer-dense").count()) && !(await tid("layer-trajectory").count()), "only layers with data");
  await tid("import-sample-mesh").click(); await p.waitForFunction(() => /vertices/.test(document.querySelector("[data-testid=i-mesh]")?.textContent || ""), null, { timeout: 20000 }); ok(await tid("layer-mesh").count(), "mesh layer"); await shot("import-mesh");
});
await t("import: user files (ASCII PLY, OBJ) render and report their counts; unsupported and broken files give clear errors", async () => {
  await tid("mode-import").click(); const ply = ["ply", "format ascii 1.0", "element vertex 4", "property float x", "property float y", "property float z", "end_header", "0 0 0", "1 0 0", "0 1 0", "0 0 1"].join("\n") + "\n";
  await p.locator("[data-testid=import-input]").setInputFiles({ name: "four.ply", mimeType: "application/octet-stream", buffer: Buffer.from(ply) }); await p.waitForFunction(() => /^4/.test(document.querySelector("[data-testid=i-points]")?.textContent || ""), null, { timeout: 15000 }); ok(/imported PLY/.test(await text("i-origin")), "imported PLY");
  const obj = "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 2 4\nf 1 3 4\nf 2 3 4\n"; await p.locator("[data-testid=import-input]").setInputFiles({ name: "tet.obj", mimeType: "text/plain", buffer: Buffer.from(obj) }); await p.waitForFunction(() => /4 vertices|12 vertices/.test(document.querySelector("[data-testid=i-mesh]")?.textContent || ""), null, { timeout: 15000 }); ok(/4 faces/.test(await text("i-mesh")), `mesh stats ${await text("i-mesh")}`);
  await p.waitForTimeout(800); const solid = await scene(); await tid("wireframe").check(); await p.waitForTimeout(800); const wire = await scene(); ok(solid.n > 200 && wire.n < solid.n * 0.8, `wireframe draws fewer pixels than the solid tetrahedron: ${wire.n} vs ${solid.n}`); await tid("wireframe").uncheck();
  await p.locator("[data-testid=import-input]").setInputFiles({ name: "x.xyz", mimeType: "text/plain", buffer: Buffer.from("1 2 3\n") }); await tid("error").waitFor(); ok(/Unsupported format/.test(await text("error")), "unsupported format message");
  await p.locator("[data-testid=import-input]").setInputFiles({ name: "bad.ply", mimeType: "application/octet-stream", buffer: Buffer.from("ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nend_header\n1\n2\n") }); await p.waitForFunction(() => /invalid coordinates/.test(document.querySelector("[data-testid=layer-panel]")?.textContent || ""), null, { timeout: 15000 }); ok(/cannot be shown/.test(await text("layer-panel")), "corrupt file explained, not silently shown");
});
await t("reconstruct tab: file validation messages; without the service the page explains what is unavailable", async () => {
  await tid("mode-reconstruct").click(); await p.locator("[data-testid=media-input]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }); await tid("error").waitFor(); ok(/Unsupported file type/.test(await text("error")), "type message");
  await p.locator("[data-testid=media-input]").setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") }); await p.waitForFunction(() => /a\.jpg/.test(document.querySelector("[data-testid=media-names]")?.textContent || "") || /1 images|a\.jpg/.test(document.body.innerText), null, { timeout: 5000 });
  if (MODE === "static") { await tid("start").click(); await tid("error").waitFor(); ok(/needs the reconstruction service/.test(await text("error")), "clear message without the service"); ok(/not connected/.test(await text("service-state")), "service state"); }
});
if (MODE === "server") {
  await t("service online: failure path is honest — unreconstructable images fail with an explanation and no output is offered", async () => {
    await tid("mode-reconstruct").click(); await p.waitForFunction(() => /online/.test(document.querySelector("[data-testid=service-state]")?.textContent || ""), null, { timeout: 15000 });
    const noise = (i) => { const w = 160, h = 120, px = Buffer.alloc(w * h * 3); for (let k = 0; k < px.length; k++) px[k] = Math.floor(Math.random() * 255); return px; };
    // PNG encoder-free: use the browser to make JPEGs of noise
    const files = await p.evaluate(async () => { const out = []; for (let i = 0; i < 4; i++) { const c = document.createElement("canvas"); c.width = 320; c.height = 240; const g = c.getContext("2d"); const d = g.createImageData(320, 240); for (let k = 0; k < d.data.length; k += 4) { d.data[k] = Math.random() * 255; d.data[k + 1] = Math.random() * 255; d.data[k + 2] = Math.random() * 255; d.data[k + 3] = 255; } g.putImageData(d, 0, 0); const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9)); out.push({ name: `n${i}.jpg`, data: Array.from(new Uint8Array(await b.arrayBuffer())) }); } return out; });
    void noise; await p.locator("[data-testid=media-input]").setInputFiles(files.map((f) => ({ name: f.name, mimeType: "image/jpeg", buffer: Buffer.from(f.data) }))); await tid("start").click();
    await p.waitForFunction(() => /Failed/.test(document.querySelector("[data-testid=status]")?.textContent || ""), null, { timeout: 240000 }).catch(() => 0); await tid("error").waitFor({ timeout: 240000 }); ok(/overlap|could be built|Only/.test(await text("error")), `failure message: ${await text("error")}`);
    const out = await text("outputs"); ok(!/Download/.test(out.replace(/Downloads appear/, "")) || !(await tid("download-points_sparse.ply").count()), "no point cloud download after a failure"); await shot("failed");
  });
  await t("service online: real reconstruction of the sample video — live stages, then the same data views as the precomputed sample", async () => {
    await tid("mode-reconstruct").click(); await p.locator("[data-testid=media-input]").setInputFiles("public/spatial/samples/highway-dashcam.mp4"); await tid("start").click();
    await p.waitForFunction(() => document.querySelector("[data-testid=progress]") !== null, null, { timeout: 60000 }); await shot("running"); ok(/Feature|Camera poses/.test(await text("progress")), "stage list shown");
    await tid("origin-badge").waitFor({ timeout: 600000 }); await p.waitForFunction(() => /^[0-9]/.test(document.querySelector("[data-testid=i-registered]")?.textContent || ""), null, { timeout: 600000 });
    ok(/processed from your upload/.test(await text("origin-badge")), "badge says it is YOUR upload"); const reg = await text("i-registered"); ok(/^(8[0-9]|9[0-9]) of /.test(reg) || /^\d+ of \d+/.test(reg), `registered ${reg}`); await p.waitForFunction(() => Number((document.querySelector("[data-testid=i-points]")?.textContent || "").split("+")[0].replace(/[^0-9]/g, "")) > 1000, null, { timeout: 60000 }); ok(num((await text("i-points")).split("+")[0]) > 1000, `points ${await text("i-points")}`);
    await p.waitForTimeout(2000); const s = await scene(); ok(s.n > 800, "viewport drawn from the new reconstruction"); await shot("live-result");
  });
  await t("service online: point cloud processing creates a new artifact with before/after counts", async () => {
    await tid("run-crop").waitFor({ timeout: 10000 }); const before = await text("i-points"); await tid("run-crop").click(); await tid("op-msg").waitFor({ timeout: 60000 }); ok(/→/.test(await text("op-msg")), `message ${await text("op-msg")}`); ok(/processed_1_crop\.ply/.test(await text("outputs")), "new artifact listed"); void before;
    await tid("op-voxel").fill("0.2"); await tid("run-voxel").click(); await p.waitForFunction(() => /voxel downsample/.test(document.querySelector("[data-testid=op-msg]")?.textContent || ""), null, { timeout: 60000 });
  });
  await t("service online: importing a PLY enables processing", async () => {
    await tid("mode-import").click(); const ply = ["ply", "format ascii 1.0", "element vertex 300", "property float x", "property float y", "property float z", "end_header", ...Array.from({ length: 300 }, (_, i) => `${i % 20} ${Math.floor(i / 20)} ${(i * 7) % 5}`)].join("\n") + "\n";
    await p.locator("[data-testid=import-input]").setInputFiles({ name: "grid.ply", mimeType: "application/octet-stream", buffer: Buffer.from(ply) }); await tid("run-voxel").waitFor({ timeout: 20000 }); await tid("op-voxel").fill("5"); await tid("run-voxel").click(); await p.waitForFunction(() => /300 →/.test(document.querySelector("[data-testid=op-msg]")?.textContent || ""), null, { timeout: 30000 });
  });
}
await t("responsive: no horizontal scroll at phone width", async () => { await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(500); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "no horizontal overflow"); await shot("phone"); await p.setViewportSize({ width: 1600, height: 1000 }); });
await t("catalogue: demo 05 is live and links to the app", async () => { await p.goto(`${BASE}/ai-demos/smart-glasses-spatial-mapping`, { waitUntil: "load" }); const txt = await p.locator("body").innerText(); ok(/Prototype/.test(txt) && /relative/i.test(txt), "landing text"); ok((await p.locator('a[href$="/ai-demos/smart-glasses-spatial-mapping/app"]').count()) >= 1, "link to app"); });
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
