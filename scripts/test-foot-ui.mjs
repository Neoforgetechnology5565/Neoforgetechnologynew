#!/usr/bin/env node
/**
 * End-to-end UI tests for the foot platform (Playwright + running server + Firestore emulator).
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 node scripts/test-foot-ui.mjs
 * The camera test feeds Chromium a FAKE camera stream built from a synthetic photo (--use-file-for-fake-video-capture).
 * It exercises the browser code path (getUserMedia, live guidance, capture, upload) but is NOT a test on a real phone.
 */
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000", APP = `${BASE}/ai-demos/ai-shoe-foot-measurement-fitting/app`;
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).split("\n")[0], "\n    ", (String(e.stack).split("\n").find((l) => l.includes("test-foot-ui.mjs")) || "").trim()); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const dir = mkdtempSync(path.join(os.tmpdir(), "foot-ui-"));
// Chromium's fake camera stretches levels, which would clip the white sheet; darken the source slightly so it reads like a normally exposed photo.
const sharp = createRequire(import.meta.url)("sharp"); const jpg = await sharp(readFileSync("public/foot/samples/synthetic-right-254x97.jpg")).linear(0.82, 0).jpeg({ quality: 90 }).toBuffer(); const fake = path.join(dir, "cam.mjpeg"); writeFileSync(fake, Buffer.concat(Array(30).fill(jpg)));

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${fake}`] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera"] });
const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
const stage = (re) => p.getByRole("navigation", { name: "Measurement stages" }).getByRole("button", { name: re });
const decline = async () => { const d = p.getByRole("button", { name: "Decline" }); if (await d.isVisible().catch(() => false)) await d.click(); };

console.log("foot ui tests →", APP);
await p.goto(APP, { waitUntil: "networkidle" }); await decline();
await t("landing: honest scope, privacy, both entry points, sample mode", async () => {
  ok(await p.getByRole("button", { name: "Start Foot Measurement" }).isVisible(), "start"); ok(await p.getByRole("button", { name: "Upload Existing Scan" }).isVisible(), "upload");
  ok(await p.getByText(/Not measured:/).isVisible(), "not-measured statement"); ok(await p.getByRole("heading", { name: "Privacy" }).isVisible(), "privacy");
  const fonts = await p.evaluate(() => getComputedStyle(document.body).fontFamily); ok(/Georgia/.test(fonts), "Georgia");
  const small = await p.evaluate(() => [...document.querySelectorAll("main *, body *")].filter((e) => e.children.length === 0 && e.textContent.trim() && getComputedStyle(e).fontSize && parseFloat(getComputedStyle(e).fontSize) < 12.9 && e.offsetParent).length); ok(small === 0, `${small} text nodes under 13px`);
});
await t("start → method step with QR code creation and scale-check", async () => {
  await p.getByRole("button", { name: "Start Foot Measurement" }).click(); await p.getByRole("heading", { name: /Pick a capture method/ }).waitFor();
  await p.getByRole("button", { name: /Create QR code/ }).click(); const qr = p.getByRole("img", { name: /QR code/ }); await qr.waitFor(); ok((await p.getByText(/Expires in/).innerText()).includes("Expires in"), "expiry shown");
  ok(await p.getByText(/capture-only access/).isVisible(), "capture-only");
});
await t("upload: invalid file rejected client-side; valid synthetic photo measured", async () => {
  await stage(/Photos/).click(); await p.getByRole("tab", { name: /Right foot/ }).click();
  await p.locator("[data-testid=foot-file-input]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }); await p.getByText(/not a JPEG, PNG or WebP/).waitFor();
  await p.locator("[data-testid=foot-file-input]").setInputFiles("public/foot/samples/synthetic-right-254x97.jpg"); await p.getByText("analysed", { exact: true }).waitFor({ timeout: 30000 });
  await p.getByText(/254\.\d × 9[67]\.\d mm/).first().waitFor();
});
await t("poor photo: no numbers, plain-language reason, manual corners offered", async () => {
  await p.getByRole("tab", { name: /Left foot/ }).click(); await p.locator("[data-testid=foot-file-input]").setInputFiles("public/foot/samples/bad-white-sock.jpg"); await p.getByText("analysed", { exact: true }).nth(1).waitFor({ timeout: 30000 }).catch(() => undefined);
  await p.getByText(/could not be told apart|white socks/i).first().waitFor({ timeout: 20000 }); await p.getByRole("button", { name: "Review", exact: true }).first().click();
  await p.getByText(/No measurement\./).waitFor(); ok(await p.getByRole("button", { name: "Mark the paper corners myself" }).isVisible(), "manual corners button");
});
await t("manual corner editor: drag a handle, re-measure keeps original", async () => {
  await p.getByRole("button", { name: "Delete" }).first().isVisible().catch(() => 0);
  await stage(/Photos/).click(); await p.getByRole("tab", { name: /Right foot/ }).click(); await p.getByRole("button", { name: "Review", exact: true }).first().click();
  await p.getByRole("button", { name: "Adjust paper corners" }).click(); const circles = p.locator("svg circle[fill='#10b981']"); ok((await circles.count()) === 4, "4 handles");
  const box = await circles.first().boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 2); await p.mouse.up();
  await p.getByRole("button", { name: "Re-measure" }).click(); await p.getByText(/Original automatic result:/).waitFor({ timeout: 30000 }); await p.getByRole("button", { name: "Discard my correction" }).click(); await p.getByRole("button", { name: "Adjust paper corners" }).waitFor();
});
await t("camera: fake stream → live guidance → capture → upload → measured", async () => {
  await stage(/Photos/).click(); await p.getByRole("tab", { name: /Left foot/ }).click(); await p.getByRole("button", { name: "Open camera" }).click(); const dlg = p.getByRole("dialog", { name: /Camera/ }); await dlg.waitFor();
  await dlg.getByText(/Good\. Place your bare foot/).waitFor({ timeout: 20000 }); await dlg.getByRole("button", { name: "Capture photo" }).click(); await dlg.getByRole("button", { name: "Use this photo" }).click();
  await p.getByText("analysed", { exact: true }).last().waitFor({ timeout: 30000 }); await p.getByText(/camera-left\.jpg/).first().waitFor();
});
await t("camera permission denied → clear message and photo-picker fallback", async () => {
  const c2 = await browser.newContext({ viewport: { width: 1200, height: 800 } }); const q = await c2.newPage(); await c2.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError")); });
  await q.goto(APP, { waitUntil: "networkidle" }); const d = q.getByRole("button", { name: "Decline" }); if (await d.isVisible().catch(() => false)) await d.click();
  await q.getByRole("button", { name: "Upload Existing Scan" }).click(); await q.getByRole("button", { name: "Open camera" }).click(); await q.getByText("Camera blocked").waitFor(); ok(await q.getByRole("button", { name: "Use the photo-picker instead" }).isVisible(), "fallback"); await c2.close();
});
await t("results: left/right comparison, units, 3D labelled as inferred, OBJ import", async () => {
  await stage(/Results/).click(); await p.getByRole("heading", { name: "Measured feet" }).waitFor(); await p.getByText("Left vs right").waitFor();
  await p.getByRole("button", { name: "in", exact: true }).click(); ok(/\d\.\d\d in/.test(await p.locator("table").first().innerText()), "inches"); await p.getByRole("button", { name: "mm", exact: true }).click();
  await p.getByText("Inferred geometry").first().waitFor({ timeout: 15000 });
  const pts = []; for (let i = 0; i < 400; i++) { const a = i * 0.7; pts.push(`v ${(Math.cos(a) * 13).toFixed(3)} ${(Math.sin(a * 1.3) * 4.5).toFixed(3)} ${(Math.sin(a) * 3.5).toFixed(3)}`); } const faces = []; for (let i = 1; i <= 398; i++) faces.push(`f ${i} ${i + 1} ${i + 2}`);
  await p.getByLabel(/OBJ units/).selectOption("cm"); await p.locator("input[type=file][accept='.obj,text/plain']").setInputFiles({ name: "scan.obj", mimeType: "text/plain", buffer: Buffer.from([...pts, ...faces].join("\n")) });
  await p.getByText("Imported model").first().waitFor({ timeout: 15000 }); await p.getByText(/Imported right OBJ “scan.obj”/).waitFor();
  await p.getByRole("button", { name: "Top" }).click(); await p.getByRole("button", { name: "Reset camera" }).click();
});
await t("fit: sizes, calculation, fit preference changes size, US men's ≠ women's", async () => {
  await stage(/Fit/).click(); await p.getByTestId("size-EU").waitFor(); const eu0 = +(await p.getByTestId("size-EU").innerText()); const m = +(await p.getByTestId("size-US men's").innerText()), w = +(await p.getByTestId("size-US women's").innerText()); ok(w - m === 1.5, `US offset ${w - m}`);
  await p.getByLabel("Fit preference").selectOption("snug"); await p.waitForTimeout(900); const euS = +(await p.getByTestId("size-EU").innerText()); await p.getByLabel("Fit preference").selectOption("roomy"); await p.waitForTimeout(900); const eu1 = +(await p.getByTestId("size-EU").innerText()); ok(eu1 > euS && eu1 >= eu0, `snug ${euS} regular ${eu0} roomy ${eu1}`); ok(await p.getByText(/No brand size charts are loaded/).isVisible(), "brand note"); ok(await p.getByText("How this was calculated").isVisible(), "explanation");
});
await t("report: preview, JSON and CSV export, then delete removes everything", async () => {
  await stage(/Report/).click(); const fr = p.frameLocator("iframe[title='Report preview']"); await fr.getByRole("heading", { name: "Foot measurement report" }).waitFor(); ok(await fr.getByText(/How this was measured/).isVisible(), "method");
  for (const f of ["Export JSON", "Export CSV"]) { const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: f }).click()]); ok(/foot-report-.+\.(json|csv)$/.test(dl.suggestedFilename()), "filename"); }
  await p.getByRole("button", { name: /Save & close/ }).click(); await p.getByRole("heading", { name: "Your recent sessions" }).waitFor(); await p.getByRole("button", { name: "Open", exact: true }).first().waitFor({ timeout: 15000 });
  await p.getByRole("button", { name: "Open", exact: true }).first().click(); await p.getByRole("navigation", { name: "Measurement stages" }).waitFor(); await stage(/Report/).click();
  await p.getByRole("button", { name: /Delete this session/ }).click(); await p.getByRole("button", { name: /Yes, delete everything/ }).click(); await p.getByRole("heading", { name: "Your recent sessions" }).waitFor();
});
await t("sample mode: opens results with sample labelling", async () => {
  await p.getByRole("button", { name: "Try with sample data" }).click(); await p.getByText(/Sample data in use/).waitFor({ timeout: 60000 }); ok(await p.getByText("Sample visualization").first().isVisible(), "sample label");
});
await t("phone scanner page (mobile viewport): token consumed from URL, capture-only upload, expired link message", async () => {
  const sid = await p.evaluate(() => JSON.parse(localStorage.getItem("neoforge-foot-v1"))[0]);
  const link = await p.evaluate(async (s) => { const r = await fetch(`/api/foot/sessions/${s.id}/phone-link`, { method: "POST", headers: { "x-foot-key": s.key, "content-type": "application/json", origin: location.origin }, body: "{}" }); return r.json(); }, sid);
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ["camera"] }); const q = await m.newPage();
  await q.goto(`${BASE}/ai-demos/ai-shoe-foot-measurement-fitting/app/scan#s=${sid.id}&t=${link.token}`, { waitUntil: "networkidle" }); const d = q.getByRole("button", { name: "Decline" }); if (await d.isVisible().catch(() => false)) await d.click();
  await q.getByRole("heading", { name: /Sample data demo/ }).waitFor(); ok(!q.url().includes("#t="), "token removed from the URL");
  ok(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal scroll at 390px");
  await q.locator("input[type=file]").setInputFiles("public/foot/samples/synthetic-left-257x99.jpg"); await q.getByText("sent ✓").waitFor({ timeout: 30000 }); await q.getByText(/25\d\.\d × \d+\.\d mm/).waitFor();
  await q.getByRole("button", { name: /Open camera/ }).click(); await q.getByText(/Good\. Place your bare foot/).waitFor({ timeout: 20000 }); await q.getByRole("button", { name: "Close camera" }).click();
  const q2 = await m.newPage(); await q2.goto(`${BASE}/ai-demos/ai-shoe-foot-measurement-fitting/app/scan#s=${sid.id}&t=${"0".repeat(48)}`, { waitUntil: "networkidle" }); await q2.getByText(/expired or the session was deleted/).waitFor();
  const q3 = await (await browser.newContext()).newPage(); await q3.goto(`${BASE}/ai-demos/ai-shoe-foot-measurement-fitting/app/scan`, { waitUntil: "networkidle" }); await q3.getByText(/scanning the QR code/).waitFor();
  const mani = await (await fetch(`${BASE}/foot.webmanifest`)).json(); ok(mani.display === "standalone" && mani.start_url.includes("/app/scan"), "manifest"); const sw = await fetch(`${BASE}/api/foot/sw`); ok(sw.headers.get("service-worker-allowed")?.includes("ai-shoe-foot"), "sw scope"); await m.close();
});
await t("no uncaught page errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
