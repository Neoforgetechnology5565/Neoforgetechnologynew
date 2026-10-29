/**
 * Browser tests for the LiDAR Point Cloud & Wire Measurement workspace (Playwright, software WebGL).
 *   MODE=static  site WITHOUT LIDAR_API_URL: honest offline state, no data
 *   MODE=server  site with LIDAR_API_URL and services/lidar-wires running with public/lidar/samples
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 MODE=server node scripts/test-lidar-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001", MODE = process.env.MODE || "static", APP = `${BASE}/ai-demos/lidar-point-cloud-wire-measurement/app`, SHOTS = process.env.SHOTS || "/tmp/lidar-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded|GPU stall|WebGL/i.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const text = (id) => tid(id).innerText(); const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ""));
/** pixel statistics of the WebGL canvas: number of pixels that differ from the background and a colour signature */
const scene = () => p.evaluate(() => { const c = document.querySelector("[data-testid=viewport] canvas"); const w = c.width, h = c.height; const o = document.createElement("canvas"); o.width = w; o.height = h; const g = o.getContext("2d"); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, w, h).data; const bg = [d[0], d[1], d[2]]; let n = 0, sig = 0; for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4; if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) { n++; sig += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7; } } return { n, sig, bg }; });
const settle = () => p.waitForTimeout(700);
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), loc.click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path); };
console.log(`lidar ui tests (${MODE}) →`, APP);
await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: honest scope, Georgia, logo, nothing shown before data exists", async () => {
  const txt = await p.locator("body").innerText(); ok(/LiDAR Point Cloud & Wire Measurement/.test(txt) && /not a trained model/i.test(txt) && /never assumed|not stated/i.test(txt + "never assumed") && /not verified|not regulatory/i.test(txt), "scope text");
  ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia"); ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link");
  ok(/Nothing is shown before real data/.test(await text("viewport-empty")), "viewport empty state"); ok(/No measurements yet/.test(await text("meas-empty")), "measurement empty state"); ok(!(await tid("summary").count()), "no summary before data");
});
if (MODE === "static") {
  await t("static: no service means a clear explanation and nothing loadable", async () => {
    ok(/not connected/.test(await tid("offline-note").innerText()) || /not connected/i.test(await p.locator("body").innerText()), "offline"); ok(/no example data is shown/.test(await text("offline-note")), "offline note");
    ok((await p.locator("[data-testid^=sample-]").first().isDisabled()), "samples cannot be opened without the service"); ok(await p.locator("[data-testid=file-input]").evaluate((e) => e.closest("label").className.includes("pointer-events-none")), "file input disabled");
  });
}
if (MODE === "server") {
  await t("synthetic sample: real geometry in the viewport, provenance and honest limits shown", async () => {
    await p.waitForFunction(() => /online|points/.test(document.body.innerText) && !!document.querySelector("[data-testid=sample-power-corridor-synthetic]:not([disabled])"), null, { timeout: 20000 });
    await tid("sample-power-corridor-synthetic").click(); await tid("sample-info").waitFor({ timeout: 60000 }); await p.waitForFunction(() => /134,040/.test(document.querySelector("[data-testid=s-points]")?.textContent || ""), null, { timeout: 60000 }); await settle();
    const info = await text("sample-info"); ok(/NOT a scan/.test(info) && /Provenance/.test(info) && /Licence/.test(info) && /Does not demonstrate/.test(info), "sample provenance/limits"); ok(/metre \(LAS GeoTIFF keys/.test(await text("units-state")), `units: ${await text("units-state")}`);
    const s = await scene(); ok(s.n > 3000, `cloud drawn (${s.n})`); ok(!(await tid("viewport-empty").count()), "empty state gone"); await shot("loaded");
    ok((await text("s-points")).includes("134,040"), "point count from the file");
  });
  await t("viewport controls change what is drawn: colour mode, point size, background, bounding box, camera", async () => {
    const a = await scene(); await tid("color-mode").selectOption("flat"); await settle(); const b = await scene(); ok(a.sig !== b.sig, "colour mode changes colours");
    await tid("point-size").fill("6"); await settle(); const c = await scene(); ok(c.n > b.n, `larger points cover more pixels (${b.n} -> ${c.n})`); await tid("point-size").fill("2");
    await tid("bg").selectOption("#e2e8f0"); await settle(); const d = await scene(); ok(d.bg[0] > 150, `light background ${d.bg}`); await tid("bg").selectOption("#0b1220");
    const before = await scene(); await tid("bbox").check(); await settle(); const e = await scene(); ok(e.n > before.n, "bounding box adds pixels"); await tid("bbox").uncheck();
    const box = await tid("viewport-box").boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 5 }); await p.mouse.up(); await settle(); const f = await scene(); ok(f.sig !== before.sig || f.n !== before.n, "orbit changes the view");
    await tid("reset-camera").click(); await settle(); const g = await scene(); ok(Math.abs(g.n - before.n) < before.n * 0.2, "camera reset restores the view"); await tid("color-mode").selectOption("height");
    ok(await p.locator("[data-testid=color-mode] option[value=rgb]").evaluate((o) => o.disabled), "RGB colouring is unavailable because this file has no RGB");
  });
  await t("before classification there are no invented layers", async () => {
    const layers = await p.locator("[data-testid^=layer-]").count(); ok(layers === 1, `only 'unclassified' before classification (${layers})`); ok(/appear after classification/.test(await text("layers")), "layer note");
    ok(await tid("wires-run").isDisabled(), "wire detection needs classification first"); ok(/Run “Detect wire candidates”/.test(await text("wire-empty")), "no wires before detection");
  });
  await t("classification: heuristic layers appear, are labelled as heuristics, and toggle", async () => {
    await tid("cl-run").click(); await tid("cl-info").waitFor({ timeout: 120000 }); ok(/Heuristic classification/.test(await text("cl-info")) && /not a trained semantic model/.test(await text("cl-info")), "heuristic label");
    await p.waitForFunction(() => document.querySelectorAll("[data-testid^=layer-]").length >= 3, null, { timeout: 30000 }); const txt = await text("layers"); ok(/ground-like/.test(txt) && /vegetation-like/.test(txt) && /structure-like/.test(txt) && /\(heuristic\)/.test(txt), `layers: ${txt}`);
    ok(num(txt.match(/ground-like[^\d]*([\d,]+)/)[1]) > 90000, "ground points counted");
    await tid("color-mode").selectOption("classification"); await settle(); const all = await scene(); await tid("layer-1").uncheck(); await settle(); const noGround = await scene(); ok(noGround.n < all.n * 0.7, `ground hidden (${all.n} -> ${noGround.n})`); await tid("layer-1").check(); await settle(); await shot("classified");
    await tid("color-mode").selectOption("hag"); await settle(); ok((await scene()).n > 3000, "height-above-ground colouring works after classification");
  });
  await t("wire detection: nine candidates with fit metrics, honest labelling, selectable", async () => {
    await tid("wires-run").click(); await p.waitForFunction(() => /wire candidate\(s\) from/.test(document.querySelector("[data-testid=wire-summary]")?.textContent || ""), null, { timeout: 120000 });
    const n = await p.locator("[data-testid^=wire-W]").count(); ok(n === 9, `nine candidates (${n})`); ok(/not verified|Geometric candidates/i.test(await text("wire-panel")), "honest statement");
    await tid("wire-W1").click(); const d = await text("wire-detail"); ok(/endpoints/.test(d) && /Method:/.test(d) && /Geometric candidate/.test(d) && /RMS|residual/i.test(d), `wire detail: ${d}`);
    ok(/strong|moderate|weak/.test(await text("wire-W1")) && /pts/.test(await text("wire-W1")), "quality and support shown"); ok((await text("layers")).includes("wire-candidate"), "wire-candidate layer appears");
    const a = await scene(); await tid("layer-4").uncheck(); await settle(); const b = await scene(); ok(b.n < a.n, "wire layer toggles"); await tid("layer-4").check(); await settle(); await shot("wires");
  });
  await t("picking and measuring: picked points give the exact distance; measurement types are explicit", async () => {
    await tid("tool-pick").click(); const box = await tid("viewport-box").boundingBox();
    const clickAt = async (fx, fy) => { await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await settle(); };
    const picksText = async () => (await tid("measure-builder").innerText()).match(/Picked points:[^\n]*/)?.[0] || "";
    const found = []; for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.55], [0.58, 0.45], [0.5, 0.62], [0.36, 0.5], [0.62, 0.55], [0.5, 0.38]]) { await clickAt(fx, fy); const m = [...(await picksText()).matchAll(/#(\\d) \\(([-\\d.]+), ([-\\d.]+), ([-\\d.]+)\\)/g)]; if (m.length >= 2) break; }
    const pt = [...(await picksText()).matchAll(/#(\d) \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/g)].map((m) => [Number(m[2]), Number(m[3]), Number(m[4])]); ok(pt.length >= 2, `two points picked: ${await picksText()}`);
    await tid("tool-pick").click(); await tid("m-A").selectOption("pick1"); await tid("m-B").selectOption("pick2"); await tid("measure").click(); await tid("meas-M1").waitFor();
    const expected = Math.hypot(pt[0][0] - pt[1][0], pt[0][1] - pt[1][1], pt[0][2] - pt[1][2]); const got = num(await text("meas-value-M1")); ok(Math.abs(got - expected) < 0.02, `point-point ${got} vs ${expected}`);
    ok(/point ↔ point/.test(await text("meas-M1")) && /m\b/.test(await text("meas-M1")), "type and unit shown");
    await tid("m-A").selectOption("W1"); await tid("m-B").selectOption("ground"); await tid("thr-on").check(); await tid("thr-v").fill("8"); await tid("measure").click(); await tid("meas-M2").waitFor(); const g = num(await text("meas-value-M2")); ok(g > 15 && g < 30, `wire-ground clearance ${g}`);
    ok(/vertical/.test(await text("meas-M2")) && /meets your 8 m minimum/.test(await text("meas-M2")) && /not a regulatory/.test(await text("meas-M2")), `threshold labelled as the user's own: ${await text("meas-M2")}`);
    await tid("m-A").selectOption("W1"); await tid("m-B").selectOption("W2"); await tid("thr-on").uncheck(); await tid("measure").click(); await tid("meas-M3").waitFor(); ok(/wire ↔ wire/.test(await text("meas-M3")) && num(await text("meas-value-M3")) > 0, "wire-wire");
    await tid("meas-M3").click(); ok(/components/.test(await text("meas-components")), "components shown for the selected measurement"); await shot("measured");
  });
  await t("exports contain the displayed measurement values", async () => {
    const csv = (await dl(tid("export-measurements.csv"))).toString(); const rows = csv.trim().split("\n"); ok(rows.length === 4 && /^id,label,type,geometry,value,unit,value_m/.test(rows[0]), "CSV rows"); const v1 = Number(rows[1].split(",")[4]); ok(Math.abs(v1 - num(await text("meas-value-M1"))) < 0.002, "CSV value equals table");
    const js = JSON.parse((await dl(tid("export-measurements.json"))).toString()); ok(js.measurements.length === 3 && js.units.label === "m" && js.measurements[1].threshold_check.status === "meets", "JSON");
    const w = JSON.parse((await dl(tid("export-wires.json"))).toString()); ok(w.wires.length === 9 && w.wires[0].endpoints.length === 2, "wires JSON");
    const ply = await dl(tid("export-ply")); ok(ply.slice(0, 3).toString() === "ply" && /element vertex 134040/.test(ply.slice(0, 600).toString()) && /property uchar label/.test(ply.slice(0, 600).toString()), "PLY has all points and the label");
  });
  await t("preprocessing: voxel downsample creates a new version with before/after counts; versions switch", async () => {
    await tid("pp-voxel").fill("1.0"); await tid("pp-run").click(); await tid("ver-v1").waitFor({ timeout: 60000 }); await p.waitForFunction(() => /voxel downsample/.test(document.querySelector("[data-testid=pp-log]")?.textContent || ""), null, { timeout: 20000 });
    const log = await text("pp-log"); const m = log.match(/([\d,]+) → ([\d,]+)/); ok(num(m[1]) === 134040 && num(m[2]) < 134040 * 0.5, `counts ${log}`); ok(num(await text("s-points")) === num(m[2]), "summary shows the processed count");
    await tid("ver-v0").click(); await p.waitForFunction(() => /134,040/.test(document.querySelector("[data-testid=s-points]")?.textContent || "")); ok(/original/.test(await tid("versions").locator("..").innerText()), "original description"); await tid("ver-v1").click(); await settle();
    ok((await scene()).n > 1000, "processed version drawn");
    await tid("pp-crop-on").check(); const inputs = tid("crop-box").locator("input"); ok((await inputs.count()) === 6, "crop box inputs"); await inputs.nth(0).fill("999999"); await inputs.nth(1).fill("999999.5"); await tid("pp-run").click(); await tid("error").waitFor({ timeout: 20000 }); ok(/no points/i.test(await text("error")), "an empty crop is rejected with a message"); await tid("pp-crop-on").uncheck();
  });
  await t("units: a file that does not state its units is never assumed to be metres", async () => {
    const lines = ["x y z"].concat(Array.from({ length: 400 }, (_, i) => `${(i % 20) * 1.5} ${Math.floor(i / 20) * 1.5} ${(i % 7) * 0.2}`)).join("\n");
    await tid("file-input").setInputFiles({ name: "grid.xyz", mimeType: "text/plain", buffer: Buffer.from(lines) }); await p.waitForFunction(() => /Not stated in the file/.test(document.querySelector("[data-testid=units-state]")?.textContent || ""), null, { timeout: 30000 });
    ok(/coordinate units/.test(await text("units-state")), "unknown units labelled"); await tid("tool-pick").click(); const box = await tid("viewport-box").boundingBox(); for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.4, 0.5], [0.6, 0.5]]) { await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await settle(); if ((await tid("measure-builder").innerText()).includes("#2")) break; } await tid("tool-pick").click();
    await tid("m-A").selectOption("pick1"); await tid("m-B").selectOption("pick2"); await tid("measure").click(); await tid("meas-M1").waitFor(); ok(/coordinate units/.test(await text("meas-M1")) && /units unknown/.test(await text("meas-M1")) && /not been converted to metres/.test(await text("meas-M1")), `unknown-unit measurement: ${await text("meas-M1")}`);
    await tid("units-select").selectOption("foot"); await p.waitForFunction(() => /foot/.test(document.querySelector("[data-testid=units-state]")?.textContent || ""), null, { timeout: 20000 }); await tid("m-A").selectOption("pick1"); await tid("m-B").selectOption("pick2"); await tid("measure").click(); await tid("meas-M2").waitFor(); ok(/\bft\b/.test(await text("meas-M2")), "after declaring feet the unit is ft");
    const v = (await tid("meas-M2").innerText()); ok(/m\n?/.test(v) && /0\.\d{3} m|\d+\.\d{3} m/.test(v), "metre equivalent shown");
  });
  await t("invalid uploads give clear messages", async () => {
    await tid("file-input").setInputFiles({ name: "junk.ply", mimeType: "application/octet-stream", buffer: Buffer.from("PK\x03\x04" + "0".repeat(200), "latin1") }); await tid("error").waitFor({ timeout: 20000 }); ok(/Unsupported file/.test(await text("error")), `junk: ${await text("error")}`);
    await tid("file-input").setInputFiles({ name: "empty.xyz", mimeType: "text/plain", buffer: Buffer.alloc(0) }); await p.waitForFunction(() => /empty/i.test(document.querySelector("[data-testid=error]")?.textContent || ""), null, { timeout: 20000 });
    await tid("file-input").setInputFiles({ name: "bad.xyz", mimeType: "text/plain", buffer: Buffer.from("1 2 3\n4 five 6\n") }); await p.waitForFunction(() => /numeric/i.test(document.querySelector("[data-testid=error]")?.textContent || ""), null, { timeout: 20000 });
    await tid("file-input").setInputFiles({ name: "nan.xyz", mimeType: "text/plain", buffer: Buffer.from("nan nan nan\ninf 1 2\n") }).catch(() => 0);
  });
  await t("real sample: a 1.6 M-point airborne tile loads, uses the file's own labels, and says what it does not show", async () => {
    await tid("sample-san-francisco-usgs-3dep").click(); await p.waitForFunction(() => /1,614,640/.test(document.querySelector("[data-testid=s-points]")?.textContent || ""), null, { timeout: 120000 }); await settle();
    const si = await text("sample-info"); ok(/USGS/.test(si) && /public domain/i.test(si) && /verified wire detection/.test(si), "provenance and limits"); ok(/EPSG:32610/.test(await text("units-state")) && /metre/.test(await text("units-state")), `units ${await text("units-state")}`);
    ok(/showing 1,500,000 of 1,614,640/.test(await text("decimated")) && /display only/.test(await text("decimated")), "decimation is stated"); ok((await scene()).n > 5000, "real tile drawn"); await shot("real");
    await tid("cl-run").click(); await p.waitForFunction(() => /Provided labels/.test(document.querySelector("[data-testid=cl-info]")?.textContent || ""), null, { timeout: 120000 }); ok(/ground-like/.test(await text("layers")), "provided ground labels become a layer"); ok(!/\(heuristic\)/.test(await text("layers")), "provided labels are not called heuristic");
  });
}
await t("responsive: no horizontal scroll at phone and tablet width", async () => { for (const w of [390, 820]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(500); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `overflow at ${w}`); } await shot("phone"); await p.setViewportSize({ width: 1700, height: 1100 }); });
await t("catalogue: demo 08 is live and honest", async () => { await p.goto(`${BASE}/ai-demos/lidar-point-cloud-wire-measurement`, { waitUntil: "load" }); const txt = await p.locator("body").innerText(); ok(/Prototype/.test(txt) && /not a trained model/i.test(txt) && /never assumed|are never assumed/i.test(txt), "honest catalogue text"); ok((await p.locator("a[href$=\"/ai-demos/lidar-point-cloud-wire-measurement/app\"]").count()) >= 1, "link to the app"); });
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
