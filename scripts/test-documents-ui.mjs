/**
 * Browser tests for the AI Document Intelligence & OCR workspace (Playwright).
 *   MODE=static  site WITHOUT DOCS_API_URL: honest offline state, nothing read
 *   MODE=server  site with DOCS_API_URL and services/document-ocr running (reads the bundled sample documents)
 *   NODE_PATH=<dir containing playwright> BASE_URL=http://localhost:3000 MODE=server node scripts/test-documents-ui.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3001", MODE = process.env.MODE || "static", API = process.env.API || "http://localhost:8100";
const APP = `${BASE}/ai-demos/ai-document-intelligence-ocr/app`, SHOTS = process.env.SHOTS || "/tmp/documents-shots"; mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failed++; console.error("  ✗", name, "\n    ", String(e.message).replace(/\s+/g, " ").slice(0, 700)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, acceptDownloads: true }); const p = await ctx.newPage(); const errors = [];
p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|the server responded/i.test(m.text())) errors.push(m.text()); });
const tid = (id) => p.getByTestId(id); const text = (id) => tid(id).innerText(); const shot = (n) => p.screenshot({ path: `${SHOTS}/${MODE}-${n}.png` });
const dl = async (loc) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), loc.click()]); const path = `${SHOTS}/${MODE}-${d.suggestedFilename()}`; await d.saveAs(path); return readFileSync(path); };
const fieldRow = (label) => p.locator("[data-testid=field-row]").filter({ has: p.getByRole("button", { name: label, exact: true }) }).first();
const docId = () => p.evaluate(() => (performance.getEntriesByType("resource").map((r) => r.name).filter((n) => /\/api\/documents\/[0-9a-f]{32}\//.test(n)).pop() || "").match(/documents\/([0-9a-f]{32})/)?.[1]);
const loaded = (name) => p.waitForFunction((n) => (document.querySelector("header")?.textContent || "").includes(n) && !document.querySelector("[data-testid=process]")?.disabled, name, { timeout: 30000 });   // the header shows the new file's name once it has been uploaded
const read = async (sample, file) => { await tid(`sample-${sample}`).click(); await loaded(file); await tid("process").click(); await tid("page-image").waitFor({ timeout: 120000 }); await p.waitForFunction(() => { const i = document.querySelector("[data-testid=page-image]"); return i?.complete && i.naturalWidth > 100; }, null, { timeout: 30000 }); };
console.log(`documents ui tests (${MODE}) →`, APP);
await p.goto(APP, { waitUntil: "load" }); await p.getByRole("button", { name: "Decline" }).click({ timeout: 1500 }).catch(() => 0);

await t("landing: caution notice, Georgia, logo, empty states", async () => {
  const n = await text("notice"); ok(/Check before you rely on it/.test(n) && /can be wrong/.test(n) && /explicit rules, not by a language model/.test(n), "notice");
  ok(/Georgia/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), "Georgia"); ok((await p.locator("header a[aria-label*=\"Neo Forge\"]").count()) >= 1, "official logo link");
  ok(/appear here after the document has been read/.test(await text("empty-panel")), "empty panel"); ok(/Nothing is shown until/.test(await text("viewer-empty")), "empty viewer");
});
if (MODE === "static") {
  await t("static: no service means a clear explanation and nothing readable", async () => {
    ok(/not connected/.test(await p.locator("header").innerText()), "header status"); ok(/nothing can be read/.test(await p.getByRole("alert").first().innerText()), "offline explanation");
    await p.waitForSelector("[data-testid=sample-invoice-text]"); ok(await tid("sample-invoice-text").isDisabled() && await tid("file-input").isDisabled() && await tid("process").isDisabled(), "controls disabled");
    const body = await p.evaluate(() => document.body.textContent); ok(/fictional/i.test(body) && /Apache License 2\.0/.test(body) && /does not demonstrate/i.test(body), "provenance shown");
  });
}
if (MODE === "server") {
  await t("invalid uploads are refused with a message", async () => {
    await p.waitForFunction(() => /online/.test(document.querySelector("header")?.textContent || ""), null, { timeout: 15000 });
    await tid("file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }); await p.getByRole("alert").filter({ hasText: /Unsupported file type/ }).waitFor({ timeout: 5000 });
    await tid("file-input").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 this is not a real pdf") }); await p.getByRole("alert").filter({ hasText: /could not be opened|damaged/ }).waitFor({ timeout: 10000 });
  });
  await t("text PDF: read exactly, page and boxes line up with the real response", async () => {
    await read("invoice-text", "invoice-text.pdf"); const id = await docId(); const r = await (await fetch(`${API}/api/documents/${id}/results`)).json();
    ok(r.pages.length === 2 && (await p.locator("[data-testid=page-btn]").count()) === 2, "two pages listed"); ok(/PDF text layer/.test(await p.locator("[data-testid=page-btn]").first().innerText()), "source chip");
    ok((await p.locator("[data-testid=item-box]").count()) === r.pages[0].items.length, "one box per text item"); ok((await p.locator("[data-testid=table-box]").count()) === 1, "table outlined");
    await shot("text-pdf");
    const fb = r.fields.find((f) => f.label === "Total"); ok(fb && fb.current_value === "138.84", "Total parsed");
    await tid("tab-fields").click(); const vals = await p.locator("[data-testid=field-input]").evaluateAll((els) => els.map((e) => e.value)); ok(vals.includes("INV-2024-0173") && vals.includes("138.84"), `fields listed: ${vals.join(",")}`);
    const dark = await p.evaluate(async (bb) => { const img = document.querySelector("[data-testid=page-image]"); const bm = await createImageBitmap(await (await fetch(img.src)).blob()); const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; const g = c.getContext("2d"); g.drawImage(bm, 0, 0); const x0 = Math.floor(bb[0] * c.width), y0 = Math.floor(bb[1] * c.height), w = Math.ceil((bb[2] - bb[0]) * c.width), h = Math.ceil((bb[3] - bb[1]) * c.height); const d = g.getImageData(x0, y0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 140) n++; return n / (d.length / 4); }, fb.bbox);
    ok(dark > 0.03, `the Total field box covers ink on the rendered page (${dark.toFixed(3)})`);
    const rect = await p.locator("[data-testid=field-box]").first().getAttribute("x"); ok(Math.abs(Number(rect) - r.fields.filter((f) => f.page === 1)[0].bbox[0]) < 1e-4, "overlay uses the service's coordinates");
  });
  await t("text layer items have no confidence; summary says no OCR was used", async () => {
    await tid("tab-text").click(); ok(/text layer/.test(await tid("text-line").first().innerText()), "text-layer label"); await tid("tab-summary").click(); const s = await text("summary");
    ok(/Document type: invoice/.test(s) && /No OCR was used/.test(s), "classification and no-OCR statement"); ok(/✓ subtotal \+ tax = total/.test(await text("validations")) && !/✗/.test(await text("validations")), "arithmetic checks pass"); ok(/PDF text layer, \d+ text items, 1 table/.test(await text("page-info")), "page info");
  });
  await t("search finds lines, highlights boxes and jumps pages", async () => {
    await tid("tab-text").click(); await tid("search").fill("effective"); await p.waitForTimeout(200); const c = await text("search-count"); ok(/matching line/.test(c), "count shown");
    const first = tid("text-line").first(); await first.click(); await p.waitForFunction(() => /Terms and Conditions|terms/i.test(document.querySelector("[data-testid=viewer]")?.parentElement?.textContent || "") || true);
    ok(/Page 2/.test(await p.locator("[data-testid=viewer]").locator("xpath=..").innerText()), "jumped to page 2"); ok((await p.locator("[data-testid=item-box]").count()) > 0, "boxes drawn on page 2");
    await tid("search").fill("zzzz-not-there"); ok(/0 matching lines/.test(await text("search-count")), "no matches stated"); await tid("search").fill("");
    await p.locator("[data-testid=page-btn]").first().click();
  });
  await t("zoom controls and layer toggles act on the overlay", async () => {
    const z0 = Number((await text("zoom-level")).replace("%", "")); await tid("zoom-in").click(); await tid("zoom-in").click(); ok(Number((await text("zoom-level")).replace("%", "")) > z0 * 1.4, "zoom in"); await tid("zoom-fit").click(); ok((await text("zoom-level")) === "100%", "fit");
    await tid("layer-text").uncheck(); ok((await p.locator("[data-testid=item-box]").count()) === 0, "text layer off"); await tid("layer-text").check(); await tid("layer-fields").uncheck(); ok((await p.locator("[data-testid=field-box]").count()) === 0, "fields off"); await tid("layer-fields").check();
  });
  await t("fields: edit keeps the original, confirm / reject, and the service stores it", async () => {
    await tid("tab-fields").click(); const row = fieldRow("Total"); const inp = row.getByTestId("field-input");
    await inp.fill("138.48"); await row.getByTestId("field-save").click(); await p.waitForFunction(() => /Saved Total: Corrected/.test(document.querySelector("[data-testid=msg]")?.textContent || ""));
    ok(/138\.84/.test(await row.getByTestId("field-original").innerText()) && /Corrected/.test(await row.getByTestId("field-status").innerText()) && /typed by you/.test(await row.innerText()), "original kept, status corrected, origin typed by you");
    const other = fieldRow("Due Date"); await other.getByTestId("field-confirm").click(); await p.waitForFunction(() => /Saved Due Date: Confirmed/.test(document.querySelector("[data-testid=msg]")?.textContent || ""));
    const third = fieldRow("Phone"); await third.getByTestId("field-reject").click(); await p.waitForFunction(() => /Saved Phone: Rejected/.test(document.querySelector("[data-testid=msg]")?.textContent || ""));
    const id = await docId(); const f = (await (await fetch(`${API}/api/documents/${id}/results`)).json()).fields; const tot = f.find((x) => x.label === "Total"); ok(tot.current_value === "138.48" && tot.original_value === "138.84" && tot.status === "corrected" && tot.origin === "manual", "stored by the service");
    await tid("doc-needs_rework").click(); await p.waitForFunction(() => /Needs rework/.test(document.querySelector("[data-testid=doc-review-status]")?.textContent || "")); await shot("reviewed");
    ok((await (await fetch(`${API}/api/documents/${id}/status`)).json()).review.status === "needs_rework", "document review stored");
  });
  await t("tables tab shows the cell grid; exports are real files", async () => {
    await tid("tab-tables").click(); const cells = await tid("table-grid").first().locator("td").allInnerTexts(); ok(cells.length === 20 && cells[0] === "Item" && cells.includes("Safety gloves (pair)") && cells.includes("53.40"), `cells ${cells.length}`);
    const tcsv = (await dl(tid("export-tables.csv"))).toString().trim().split(/\r?\n/); ok(tcsv.length === 21 && tcsv[0] === "table_id,page,row,col,text", "tables csv");
    const csv = (await dl(tid("export-csv"))).toString(); ok(/138\.48/.test(csv) && /manual/.test(csv) && /138\.84/.test(csv), "fields csv keeps both values");
    const txt = (await dl(tid("export-txt"))).toString(); ok(/Page 1 \(PDF text layer\)/.test(txt) && /INV-2024-0173/.test(txt), "txt");
    const js = JSON.parse((await dl(tid("export-json"))).toString()); ok(js.classification.label === "invoice" && js.review.status === "needs_rework", "json");
    const pdf = await dl(tid("export-pdf")); ok(pdf.slice(0, 5).toString() === "%PDF-" && pdf.length > 3000, "searchable pdf");
  });
  await t("scanned invoice: OCR, confidence, skew correction, flagged fields", async () => {
    await read("invoice-scanned", "invoice-scanned.pdf"); const id = await docId(); const r = await (await fetch(`${API}/api/documents/${id}/results`)).json();
    ok(r.pages[0].source === "ocr_model" && /OCR/.test(await p.locator("[data-testid=page-btn]").first().innerText()), "OCR source");
    await tid("tab-text").click(); const lines = await tid("text-line").allInnerTexts(); ok(lines.length === r.pages[0].items.length && lines.every((l) => /\d\.\d\d\s*$/.test(l.trim())), "each OCR line shows its confidence");
    const low = r.pages[0].items.filter((i) => i.conf < 0.85).length; ok(low === 0 || (await p.locator("[data-testid=item-box][stroke=\"#ef4444\"]").count()) === low, `low-confidence boxes in red (${low})`);
    await tid("tab-summary").click(); const s = await text("summary"); ok(/skew corrected by -1\.4/.test(await text("page-info")) && /OCR line confidence: mean/.test(s), "preprocessing and confidence reported");
    await tid("tab-fields").click(); const fp = await text("fields-panel"); const fv = await p.locator("[data-testid=field-input]").evaluateAll((els) => els.map((e) => e.value)); ok(/from OCR/.test(fp) && /low OCR confidence|OCR confidence 0\./.test(fp) && fv.includes("138.84"), `fields from OCR with confidence: ${fv.join(",")}`); await shot("scanned");
    await tid("tab-tables").click(); const cells = await tid("table-grid").first().locator("td").allInnerTexts(); ok(cells.length === 20 && cells.filter((c) => c.replace(/\s/g, "") === "138.84").length === 0 && /53\.40/.test(cells.join(" ")), "table read from the image");
  });
  await t("PDF text layer only on a scan reads nothing and says so", async () => {
    await tid("sample-invoice-scanned").click(); await loaded("invoice-scanned.pdf"); await tid("opt-mode").selectOption("embedded"); await tid("process").click();
    await p.getByText(/no text layer and OCR was switched off/).first().waitFor({ timeout: 60000 }); await tid("opt-mode").selectOption("auto");
  });
  await t("uploading a TIFF from disk: OCR of an image file", async () => {
    await tid("file-input").setInputFiles("public/documents/samples/scan-tesseract-phototest.tif"); await loaded("scan-tesseract-phototest.tif"); await tid("process").click(); await tid("page-image").waitFor({ timeout: 90000 });
    await tid("tab-text").click(); await p.waitForFunction(() => document.querySelectorAll("[data-testid=text-line]").length === 8, null, { timeout: 15000 }); ok(/quick brown dog/.test(await text("text-panel")), "text read");
    await tid("tab-fields").click(); ok(/No fields were found/.test(await text("no-fields")), "no invented fields"); await tid("tab-tables").click(); ok(/No ruled tables were found/.test(await text("no-tables")), "no invented tables");
    await tid("tab-summary").click(); ok(/Document type: unclassified/.test(await text("summary")), "unclassified stated");
  });
  await t("phone layout has no horizontal overflow", async () => {
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(ov <= 1, `overflow ${ov}px`); await shot("phone"); await p.setViewportSize({ width: 1700, height: 1100 });
  });
}
await t("no console errors", async () => { ok(errors.length === 0, errors.join(" | ")); });
await browser.close(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
