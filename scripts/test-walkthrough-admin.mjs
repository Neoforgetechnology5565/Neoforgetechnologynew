// Tests the Demo Walkthrough Manager UI with the admin API mocked (there is no admin login in the test environment).
// Server-side access control is covered by test-walkthrough-security.mjs. Usage: BASE=http://localhost:3011 node scripts/test-walkthrough-admin.mjs
import { chromium, newHarness } from "./wt-harness.mjs";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let pass = 0, fail = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n     " + String(e.message).split("\n")[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const h = await newHarness(b), page = h.page, id = (x) => page.getByTestId(x);
const list = await page.evaluate(() => window.__wtList()), saved = new Map(), puts = [], dels = [];
const rec = (key) => { const base = list.find((r) => r.entry.key === key), s = saved.get(key); return { entry: base.entry, record: s ? { ...base.record, config: s, source: "custom" } : base.record }; };
await page.route("**/api/admin/walkthroughs**", async (route) => {
  const r = route.request(), u = new URL(r.url()), key = u.pathname.split("/").filter(Boolean)[3];
  const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
  if (!key) return json({ demos: list.map((x) => rec(x.entry.key)), storage: true });
  if (r.method() === "GET") return json(rec(key));
  if (r.method() === "PUT") { const body = r.postDataJSON(); puts.push({ key, body }); saved.set(key, body); return json(rec(key)); }
  if (r.method() === "DELETE") { dels.push(key); saved.delete(key); return json(rec(key)); }
  return json({ error: "x" }, 405);
});
await page.evaluate(() => window.__wtMountManager());
await t("lists every demo found in the site's catalogues, grouped, with status chips", async () => {
  await id("wt-demo-cv-ai-medical-imaging-analysis").waitFor({ timeout: 20000 }); const n = await page.locator("[data-testid^=wt-demo-]").count(); ok(n === 57, "demos listed: " + n);
  const body = await page.locator("body").innerText(); for (const g of ["COMPUTER VISION & AI", "CRM / HRM / ERP", "CAD / BIM"]) ok(body.includes(g), g); ok(/Partly checked/.test(body), "partial chip for suite demos that need a back-end");
});
await t("search filters the demo list", async () => { await id("wt-search").fill("roof"); ok((await page.locator("[data-testid^=wt-demo-]").count()) === 1, "one match"); await id("wt-search").fill(""); ok((await page.locator("[data-testid^=wt-demo-]").count()) === 57, "all again"); });
await t("selecting a demo opens its walkthrough in the stage with both modes available", async () => {
  await id("wt-demo-cv-ai-animal-detection-smart-farming").click(); ok(/Animal Detection/.test(await id("wt-title").innerText()), "title");
  await id("wt-stage").waitFor(); await id("wt-start-auto").waitFor({ timeout: 20000 }); ok(await id("wt-start-manual").isVisible() && await id("wt-run-auto").isVisible() && await id("wt-run-manual").isVisible(), "mode buttons");
});
await t("Start Automated Walkthrough from the manager runs the demo", async () => { await id("wt-run-auto").click(); await id("wt-subtitle").waitFor({ timeout: 30000 }); ok(/A notice lists the animal classes/.test(await id("wt-subtitle").innerText()), await id("wt-subtitle").innerText()); await id("wt-stop").click(); });
await t("editing: subtitle, title, duration, highlight target, action and badge are editable", async () => {
  await id("wt-tab-edit").click(); await id("wt-editor").waitFor(); ok((await page.locator("[data-testid^=ed-step-title-]").count()) === 6, "six steps listed");
  await id("ed-sub-0").fill("My own subtitle for the first step."); await id("ed-step-title-0").fill("Scope, in my words"); await id("ed-dur-0").fill("7"); await id("ed-target-0").fill("tid:notice");
  await id("ed-addaction-0").click(); ok(await id("ed-action-0-0").isVisible(), "action row added"); await id("ed-action-0-0").locator("select").first().selectOption("highlight"); await id("ed-action-0-0").getByPlaceholder("Target selector").fill("tid:notice");
});
await t("reordering and adding and deleting steps", async () => {
  const before = await page.locator("[data-testid^=ed-step-title-]").evaluateAll((e) => e.map((x) => x.value)); await id("ed-down-0").click();
  const after = await page.locator("[data-testid^=ed-step-title-]").evaluateAll((e) => e.map((x) => x.value)); ok(after[0] === before[1] && after[1] === before[0], "swapped: " + after.slice(0, 2).join(" / ")); await id("ed-up-1").click();
  await id("ed-addstep").click(); ok((await page.locator("[data-testid^=ed-step-title-]").count()) === 7, "step added"); page.once("dialog", (d) => d.accept()); await id("ed-del-6").click(); ok((await page.locator("[data-testid^=ed-step-title-]").count()) === 6, "step deleted");
});
await t("preview uses the edited, unsaved walkthrough", async () => { await id("ed-preview").click(); await id("wt-subtitle").waitFor({ timeout: 40000 }); ok(/My own subtitle for the first step/.test(await id("wt-subtitle").innerText()), await id("wt-subtitle").innerText()); await id("wt-stop").click(); });
await t("saving sends a valid config with the edits and marks the demo as edited", async () => {
  await id("wt-tab-edit").click(); await id("ed-save").click(); await page.waitForFunction(() => /Walkthrough saved/.test(document.body.innerText), null, { timeout: 10000 }); ok(puts.length === 1, "one PUT");
  const body = puts[0].body; ok(puts[0].key === "cv-ai-animal-detection-smart-farming" && body.steps[0].subtitle === "My own subtitle for the first step." && body.steps[0].title === "Scope, in my words" && body.steps[0].durationMs === 7000 && body.steps[0].actions[0].t === "highlight", JSON.stringify(body.steps[0]).slice(0, 200));
  ok(/Edited/.test(await id("wt-demo-cv-ai-animal-detection-smart-farming").innerText()), "Edited chip");
});
await t("disabling a walkthrough is saved and shown", async () => { await id("ed-enabled").uncheck(); await id("ed-save").click(); await page.waitForFunction(() => /Disabled/.test(document.querySelector("[data-testid=wt-demo-cv-ai-animal-detection-smart-farming]")?.textContent || ""), null, { timeout: 10000 }); ok(puts.at(-1).body.enabled === false, "enabled=false sent"); await id("wt-tab-run").click(); ok(/disabled/i.test(await page.locator("body").innerText()), "disabled notice"); });
await t("validation errors are shown and nothing is sent", async () => { const n = puts.length; await id("wt-tab-edit").click(); await id("ed-step-title-1").fill(""); await id("ed-save").click(); await id("ed-errors").waitFor({ timeout: 5000 }); ok(/title/i.test(await id("ed-errors").innerText()), await id("ed-errors").innerText()); ok(puts.length === n, "no PUT"); });
await t("an upload or open path outside the site (or in /admin or /api) is rejected", async () => {
  await id("ed-step-title-1").fill("Fixed title"); await id("ed-addaction-1").click(); const row = id("ed-action-1-0"); await row.locator("select").first().selectOption("upload"); await row.getByPlaceholder("Target selector").fill("tid:file-input"); await row.getByPlaceholder(/Value/).fill("/api/admin/walkthroughs/x"); await id("ed-save").click(); await id("ed-errors").waitFor();
  ok(/Must be a path on this site/.test(await id("ed-errors").innerText()), await id("ed-errors").innerText()); await row.getByPlaceholder(/Value/).fill("https://evil.example/x.jpg"); await id("ed-save").click(); ok(/Must be a path on this site/.test(await id("ed-errors").innerText()), "external url rejected");
});
await t("reset to built-in removes the saved edits", async () => {
  await row0(); async function row0() { await id("ed-addaction-1").waitFor(); } page.once("dialog", (d) => d.accept()); await id("ed-reset").click(); await page.waitForFunction(() => /Reset to the built-in/.test(document.body.innerText), null, { timeout: 10000 }); ok(dels.length === 1, "one DELETE");
  ok((await id("ed-sub-0").inputValue()).startsWith("A notice lists the animal classes"), "built-in subtitle back"); ok(!/Edited/.test(await id("wt-demo-cv-ai-animal-detection-smart-farming").innerText()), "chip gone");
});
await t("switching demos with unsaved edits asks first", async () => {
  await id("ed-sub-0").fill("unsaved change"); let asked = false; page.once("dialog", (d) => { asked = true; d.dismiss(); }); await id("wt-demo-erp-crm-sales-pipeline").click(); ok(asked, "confirm shown"); ok(/Animal Detection/.test(await id("wt-title").innerText()), "stayed");
  page.once("dialog", (d) => d.accept()); await id("wt-demo-erp-crm-sales-pipeline").click(); await page.waitForFunction(() => /CRM/.test(document.querySelector("[data-testid=wt-title]")?.textContent || ""), null, { timeout: 5000 });
});
await t("the Test step button opens the demo at that step in manual mode", async () => { await id("wt-tab-edit").click(); await id("ed-test-2").click(); await id("wt-subtitle").waitFor({ timeout: 40000 }); ok(/(Stage totals|Global search|Each column)/.test(await id("wt-subtitle").innerText()) || (await id("wt-stage").getAttribute("data-mode")) === "manual", "manual at step 3"); ok((await id("wt-stage").getAttribute("data-index")) === "2", "index 2"); });
await t("no page errors", async () => { ok(h.errors.length === 0, h.errors.slice(0, 2).join(" | ")); });
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
