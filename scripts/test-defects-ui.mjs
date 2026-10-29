/**
 * Browser tests for the AI Visual Inspection workspace (Playwright).
 *   MODE=static  site WITHOUT DEFECT_API_URL: honest offline state, nothing inspected
 *   MODE=server  site with DEFECT_API_URL and services/defect-inspector running (built-in references + public/defects/samples)
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 MODE=server node scripts/test-defects-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001", MODE = process.env.MODE || "static", APP = `${BASE}/ai-demos/ai-visual-inspection/app`, SHOTS = process.env.SHOTS || "/tmp/defects-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded/i.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const text = (id) => tid(id).innerText(); const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), loc.click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path); };
const SAMPLES = "public/defects/samples";
console.log(`defects ui tests (${MODE}) →`, APP);
await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: honest scope, Georgia, logo, nothing shown before an inspection exists", async () => {
  const txt = await p.locator("body").innerText(); ok(/AI Visual Inspection & Defect Detection/.test(txt) && /not certified quality assurance/i.test(txt) && /does not name defect types/i.test(txt), "scope text");
  ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia"); ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link");
  ok(/Nothing is shown before a real inspection/.test(await text("viewer-empty")), "viewer empty state"); ok(/appear here after an inspection/.test(await text("decision-empty")), "decision empty state"); ok(!(await tid("recommendation").count()), "no recommendation before an inspection");
});
if (MODE === "static") {
  await t("static: no service means a clear explanation and no inspection", async () => {
    ok(/not connected/.test(await text("service-state")), "service state"); ok(/not connected to this site/.test(await text("offline-note")) && /no example results are shown/.test(await text("offline-note")), "offline note");
    ok(await tid("ref-select").isDisabled(), "reference select disabled");
  });
}
if (MODE === "server") {
  await t("server: built-in references with their measured evaluation are listed", async () => {
    await p.waitForFunction(() => /online|built-in/.test(document.querySelector("[data-testid=service-state]")?.textContent || ""), null, { timeout: 15000 });
    const opts = await p.locator("[data-testid=ref-select] option").allInnerTexts(); ok(opts.length >= 4, `references ${opts.length}`);
    await tid("ref-select").selectOption("pcb1"); const info = await text("ref-info"); ok(/image AUROC/.test(info) && /anomalous/.test(info) && /VisA/.test(info), `evaluation shown: ${info}`);
  });
  await t("sample inspection: real model output, overlays, decision layers", async () => {
    await tid("ref-select").selectOption("pcb1"); await tid("sample-pcb1-anomalous-1").click(); await tid("recommendation").waitFor({ timeout: 60000 });
    ok(Number((await text("m-score"))) > 0 && /×/.test(await text("m-ratio")), "score and ratio from the model"); ok(/PASS|FAIL|MANUAL/.test(await text("recommendation")), "recommendation");
    ok(/not reviewed|has not been confirmed/i.test(await text("human-none")), "human decision is separate and empty"); ok(/Dataset label for this sample: anomalous/.test(await text("dataset-note")) && /not the model/.test(await text("dataset-note")), "dataset label is marked as not model output");
    await p.waitForFunction(() => { const i = document.querySelector("[data-testid=viewer-image]"); return i?.complete && i.naturalWidth > 100; }); await shot("inspected");
    ok((await p.locator("[data-testid=viewer-heat]").count()) === 1, "heat overlay present"); ok(/unclassified/.test(await text("defect-panel")) && /not available/i.test(await text("defect-panel")), "regions are unclassified and the panel says why");
  });
  await t("viewer: zoom, fit, overlays, annotated render", async () => {
    const lvl = async () => Number((await text("zoom-level")).replace("%", "")); const fit = await lvl();
    await tid("zoom-in").click(); await tid("zoom-in").click(); const zin = await lvl(); ok(zin > fit * 1.5, `zoom in ${fit} -> ${zin}`); await tid("zoom-fit").click(); ok(Math.abs((await lvl()) - fit) <= 1, "fit restores the zoom");
    const box = await tid("viewer").boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.wheel(0, -400); await p.waitForTimeout(200); ok((await lvl()) > fit, "wheel zoom");
    const before = await tid("viewer").evaluate((e) => e.firstElementChild.style.transform); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 4 }); await p.mouse.up(); ok(before !== (await tid("viewer").evaluate((e) => e.firstElementChild.style.transform)), "drag pans"); await tid("zoom-fit").click();
    await tid("ov-heat").uncheck(); ok((await p.locator("[data-testid=viewer-heat]").count()) === 0, "heat toggled off"); await tid("ov-heat").check();
    await tid("ov-boxes").uncheck(); ok((await p.locator("[data-testid=viewer-svg]").count()) === 0, "regions toggled off"); await tid("ov-boxes").check();
    await tid("ov-dataset").check(); const ds = await p.locator("[data-testid=viewer-dataset]").count(); ok(ds === 1, "dataset annotation overlay is available for an anomalous sample"); await tid("ov-dataset").uncheck();
    await tid("mode-annotated").click(); ok((await p.locator("[data-testid=viewer-svg]").count()) === 0, "annotated render has no live overlay"); ok(/images\/annotated/.test(await tid("viewer-image").getAttribute("src")), "server render shown"); await tid("mode-original").click();
  });
  await t("regions: boxes sit on the image, can be hidden, focused and reviewed", async () => {
    const n = await p.locator("[data-testid^=region-]").count(); if (n === 0) { ok(/No region reached/.test(await text("no-regions")), "no regions explained"); return; }
    ok((await p.locator("[data-testid^=box-]").count()) === n, "one box per region"); const b = await tid("box-1").locator("rect").first().boundingBox(); const v = await tid("viewer").boundingBox(); ok(b && b.x >= v.x - 2 && b.y >= v.y - 2 && b.x + b.width <= v.x + v.width + 2, "box lies inside the displayed image area");
    await tid("show-1").uncheck(); ok((await p.locator("[data-testid=box-1]").count()) === 0, "region hidden"); await tid("show-1").check(); await tid("region-1").getByRole("button", { name: "#1" }).click(); ok(Number((await text("zoom-level")).replace("%", "")) > 0, "focus works");
    await tid("rr-1").selectOption("confirmed"); ok((await tid("rr-1").inputValue()) === "confirmed", "region review mark");
  });
  await t("rules change the recommendation; re-evaluation keeps the model score", async () => {
    const score = await text("m-score"); await tid("r-max").fill("50"); await tid("r-min").fill("4"); await tid("r-band").fill("3.5"); await tid("reeval").click(); await p.waitForFunction(() => /PASS/.test(document.querySelector("[data-testid=recommendation]")?.textContent || ""), null, { timeout: 20000 });
    ok((await text("m-score")) === score, "model score unchanged by rules"); ok(/within the allowed|No region reached|below the review band/.test(await text("reasons")), `reasons ${await text("reasons")}`);
    await tid("r-max").fill("0"); await tid("r-min").fill("1"); await tid("r-band").fill("0.85"); await tid("reeval").click(); await p.waitForFunction(() => !/PASS/.test(document.querySelector("[data-testid=recommendation]")?.textContent || ""), null, { timeout: 20000 });
  });
  await t("human review: override and confirm are recorded apart from the recommendation; history and CSV", async () => {
    await tid("reviewer").fill("Q. Inspector"); await tid("notes").fill("checked on the bench"); const rec = (await text("recommendation")).trim();
    if (!/MANUAL/.test(rec)) { await tid("confirm").click(); await tid("review-msg").waitFor(); ok(/agrees with the recommendation/.test(await text("review-msg")), "confirm recorded"); }
    else ok(await tid("confirm").isDisabled(), "confirm disabled while the recommendation is MANUAL REVIEW");
    await tid("override-PASS").click(); await p.waitForFunction(() => /overrides|agrees/.test(document.querySelector("[data-testid=review-msg]")?.textContent || "")); ok(/Q\. Inspector/.test(await text("human-decision")) && /PASS/.test(await text("human-decision")), "human decision shown");
    ok(/overrides the recommendation/.test(await text("human-decision")) || /PASS/.test(rec), "override is labelled"); ok(!/PASS/.test((await text("recommendation")).replace(/\s/g, "")) || /PASS/.test(rec), "the automated recommendation is not rewritten by the human decision");
    await tid("tab-history").click(); ok((await p.locator("[data-testid=history] tbody tr").count()) >= 1, "history row"); const csv = (await dl(tid("history-csv"))).toString(); ok(/^"id","time","file"/.test(csv) && /human_decision/.test(csv) && /PASS/.test(csv), "history CSV"); await tid("tab-gallery").click();
  });
  await t("reports: PDF and JSON contain the real inspection", async () => {
    const pdf = await dl(tid("report-pdf")); ok(pdf.slice(0, 5).toString() === "%PDF-" && pdf.length > 4000, "PDF");
    const js = JSON.parse((await dl(tid("report-json"))).toString()); ok(js.model_output.anomaly_score > 0 && js.review.current.decision === "PASS" && js.recommendation.rule_trace.length > 0, "JSON has model output, recommendation and review");
  });
  await t("upload: invalid, oversize and real images are handled; gallery cards appear", async () => {
    const limit = 20 * 1_000_000;
    await tid("upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }); await p.getByTestId("pending-card").first().waitFor(); ok(/Unsupported file type/.test(await text("pending-card")), "text file rejected");
    await tid("upload").setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(limit + 10, 1) }); await p.waitForFunction(() => /Larger than/.test(document.body.innerText)); 
    await tid("upload").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("\x89PNG\r\n\x1a\n" + "x".repeat(100), "latin1") }); await p.waitForFunction(() => /could not be decoded|damaged|Unsupported/i.test(document.body.innerText), null, { timeout: 15000 });
    const f1 = `${SAMPLES}/pcb1-normal-1.jpg`, f2 = `${SAMPLES}/pcb1-anomalous-2.jpg`; ok(existsSync(f1) && existsSync(f2), "sample files exist");
    const before = await p.locator("[data-testid^=card-]").count(); await tid("upload").setInputFiles([f1, f2]); await p.waitForFunction((b) => document.querySelectorAll("[data-testid^=card-]").length >= b + 2, before, { timeout: 90000 });
    ok(/pcb1-normal-1\.jpg/.test(await tid("gallery").innerText()), "uploaded file listed by name"); await shot("gallery");
  });
  await t("custom reference: built from my own good images in the browser, then used", async () => {
    // twelve distinct 'good part' photos made in the page from one sample (shifted crops and small brightness changes)
    const files = await p.evaluate(async () => { const im = new Image(); im.src = "/defects/samples/pcb1-normal-1.jpg"; await im.decode(); const out = []; for (let i = 0; i < 12; i++) { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const g = c.getContext("2d"); g.filter = `brightness(${0.97 + (i % 5) * 0.015})`; g.drawImage(im, (i % 4) * 4, Math.floor(i / 4) * 4, im.width - 12, im.height - 12, 0, 0, 640, 480); const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9)); out.push({ name: `good${i}.jpg`, data: Array.from(new Uint8Array(await b.arrayBuffer())) }); } return out; });
    await tid("build-ref-toggle").click(); await tid("ref-name").fill("Test board"); ok(await tid("ref-build").isDisabled(), "build disabled with no images");
    await tid("ref-files").setInputFiles(files.map((f) => ({ name: f.name, mimeType: "image/jpeg", buffer: Buffer.from(f.data) }))); await tid("ref-build").click();
    await p.waitForFunction(() => /Test board \(custom\)$/.test(document.querySelector("[data-testid=ref-select] option:checked")?.textContent || ""), null, { timeout: 180000 });
    const info = await text("ref-info"); ok(/Built from your images/.test(info) && /12 good images/.test(info) && /rough estimate/.test(info), `custom info: ${info}`);
    await tid("upload").setInputFiles(`${SAMPLES}/pcb1-normal-1.jpg`); await p.waitForFunction(() => /Test board/.test(document.querySelector("[data-testid=gallery]")?.innerText || ""), null, { timeout: 5000 }).catch(() => 0);
    await p.waitForFunction(() => /MANUAL/.test(document.querySelector("[data-testid=recommendation]")?.textContent || ""), null, { timeout: 60000 }); ok(/only 12 good image|good image/.test(await text("reasons")) || /close to the flag/.test(await text("reasons")) || /flagged/.test(await text("reasons")), `reasons: ${await text("reasons")}`);
    await shot("custom");
  });
  await t("a normal sample from the right reference is judged against its rules, not by its label", async () => {
    await tid("ref-select").selectOption("macaroni1"); await tid("sample-macaroni1-normal-1").click(); await p.waitForFunction(() => /macaroni/i.test(document.querySelector("[data-testid=ref-info]")?.textContent || "") || true);
    await p.waitForFunction(() => document.querySelector("[data-testid=viewer-image]")?.getAttribute("src")?.includes("original") && /Dataset label for this sample: normal/.test(document.querySelector("[data-testid=dataset-note]")?.textContent || ""), null, { timeout: 60000 });
    ok(/PASS|FAIL|MANUAL/.test(await text("recommendation")), "recommendation from rules"); ok(!(await tid("ov-dataset").count()) || (await p.locator("[data-testid=viewer-dataset]").count()) === 0, "no annotation mask for a normal sample");
  });
}
await t("responsive: no horizontal scroll at phone and tablet width", async () => { for (const w of [390, 820]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(400); ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `overflow at ${w}`); } await shot("phone"); await p.setViewportSize({ width: 1700, height: 1100 }); });
await t("catalogue: demo 07 is live and honest", async () => { await p.goto(`${BASE}/ai-demos/ai-visual-inspection`, { waitUntil: "load" }); const txt = await p.locator("body").innerText(); ok(/Prototype/.test(txt) && /does not name defect types/i.test(txt) && /not certified quality assurance/i.test(txt), "honest catalogue text"); ok((await p.locator("a[href$=\"/ai-demos/ai-visual-inspection/app\"]").count()) >= 1, "link to the app"); });
await t("no console errors", async () => { ok(errors.length === 0, errors.slice(0, 3).join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
