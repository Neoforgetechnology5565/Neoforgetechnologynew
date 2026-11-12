import assert from "node:assert/strict";
import { BUILTIN, configFor, draftConfig } from "./defaults";
import { blockedRequest, blockReason, riskyLabel, type ElInfo } from "./guard";
import { listDemos } from "./registry";
import { actionSchema, configSchema, keyOk, safePath } from "./schema";

// registry discovery: every catalogue is covered, keys are unique and valid, every app route is a real route shape
const demos = listDemos(), keys = demos.map((d) => d.key);
assert.equal(demos.length, 57); assert.equal(new Set(keys).size, 57); assert.ok(keys.every(keyOk));
assert.deepEqual([...new Set(demos.map((d) => d.group))].sort(), ["CAD / BIM", "CRM / HRM / ERP", "Computer Vision & AI"]);
for (const d of demos) assert.match(d.appPath, /^\/(ai-demos|erp-demos|demos|cad-bim-suite)\/[a-z0-9-]+\/app$/, d.key);
for (const k of ["cv-ai-medical-imaging-analysis", "cv-ai-animal-detection-smart-farming", "cv-sports-video-intelligence", "erp-crm-sales-pipeline", "suite-architectural-geometry-simplification", "cad-revit-bim-automation-dashboard", "cv-ai-cctv-intelligence-security-analytics"]) assert.ok(keys.includes(k), k);

// every built-in config is valid, belongs to a real demo, and is specific to its demo (no two share a title or step list)
for (const [k, c] of Object.entries(BUILTIN)) { assert.ok(keys.includes(k), "builtin for unknown demo " + k); const p = configSchema.safeParse(c); assert.ok(p.success, k + ": " + (p.success ? "" : JSON.stringify(p.error.issues[0]))); assert.ok(c.steps.length >= 3, k); }
assert.equal(new Set(Object.values(BUILTIN).map((c) => c.title)).size, Object.keys(BUILTIN).length, "titles are unique");
assert.equal(new Set(Object.values(BUILTIN).map((c) => JSON.stringify(c.steps.map((s) => s.subtitle)))).size, Object.keys(BUILTIN).length, "no two demos share subtitles");
const missing = keys.filter((k) => !BUILTIN[k]); assert.deepEqual(missing, [], "demos without a hand-written walkthrough: " + missing.join(", "));
// a demo without built-ins gets a valid, clearly marked draft
const draft = draftConfig({ ...demos[0], key: "cv-new-demo" }); assert.ok(configSchema.safeParse(draft).success); assert.equal(configFor({ ...demos[0], key: "cv-new-demo" }).quality, "draft"); assert.equal(configFor(demos[0]).quality, "verified");

// schema rules
assert.ok(!safePath("/admin/x") && !safePath("/api/admin/walkthroughs") && !safePath("//evil.com/x") && !safePath("https://evil.com") && !safePath("/../x") && safePath("/ml/samples/chelsea.jpg"));
assert.ok(!actionSchema.safeParse({ t: "upload", sel: "tid:file-input", value: "/api/admin/x" }).success); assert.ok(!actionSchema.safeParse({ t: "open", value: "https://evil.com" }).success); assert.ok(!actionSchema.safeParse({ t: "click", sel: "" }).success);
assert.ok(actionSchema.safeParse({ t: "click", sel: "tid:play" }).success);
const base = { title: "T", steps: [{ id: "a", title: "A" }, { id: "a", title: "B" }] }; assert.ok(!configSchema.safeParse(base).success, "duplicate step ids rejected");
assert.ok(!configSchema.safeParse({ title: "T", steps: Array.from({ length: 61 }, (_, i) => ({ id: "s" + i, title: "x" })) }).success, "too many steps rejected");
assert.ok(!configSchema.safeParse({ title: "T", steps: [{ id: "a", title: "A", durationMs: 10 }] }).success, "duration bounds");
assert.equal(configSchema.parse({ title: "T", steps: [] }).sandboxApi, false, "sandbox off by default");

// safety guard: changes, sends and payments are refused; navigation and sample selection are not
const el = (text: string, o: Partial<ElInfo> = {}): ElInfo => ({ text, aria: "", title: "", testid: "", id: "", type: "button", tag: "button", insideForm: false, ...o });
for (const t of ["Delete", "Delete project", "Remove item", "Send email", "Send message", "Pay now", "Checkout", "Publish", "Save", "Save to history", "+ New opportunity", "Add employee", "Create", "Approve", "Reject", "Submit", "Confirm", "Log out", "Reset all"]) assert.ok(blockReason(el(t), "click"), t + " should be blocked");
for (const t of ["Gate crossing (synthetic)", "Corridor walk-through", "Open this sample", "Start processing", "Detect animals", "Read document", "Analyse video", "Run all stages", "Iso", "Top", "Wireframe", "List", "Board", "Table"]) assert.equal(blockReason(el(t), "click"), null, t + " should be allowed");
assert.equal(blockReason(el("Import & explore"), "tab"), null, "navigation tabs are always allowed"); assert.equal(blockReason(el("Delete"), "navigate"), null);
assert.ok(blockReason(el("Go", { type: "submit", insideForm: true }), "click"), "form submit blocked"); assert.ok(blockReason(el("", { testid: "delete-btn" }), "click"), "test id is checked");
assert.ok(riskyLabel("send_message") && !riskyLabel("seek"));
// the per-action allow flag lifts soft blocks only
assert.equal(blockReason(el("Import sample model"), "click"), "label looks like a change or send action (\"Import sample model\")"); assert.equal(blockReason(el("Import sample model"), "click", true), null);
for (const t of ["Delete project", "Send email", "Pay now", "Publish", "Log out"]) assert.ok(blockReason(el(t), "click", true), t + " stays blocked even with allow");
// network guard
const O = "https://site.test";
assert.equal(blockedRequest("GET", "/models/x.onnx", O), false); assert.equal(blockedRequest("POST", "/api/bim/projects", O), true, "writes blocked by default");
assert.equal(blockedRequest("GET", "https://evil.com/x", O), true, "cross-origin blocked"); assert.equal(blockedRequest("POST", "/api/bim/projects", O, true), false, "sandbox allows the demo's own project");
assert.equal(blockedRequest("DELETE", "/api/bim/projects/1", O, true), true); assert.equal(blockedRequest("POST", "/api/admin/walkthroughs/x", O, true), true); assert.equal(blockedRequest("POST", "/api/contact", O, true), true); assert.equal(blockedRequest("POST", "/api/track", O, true), true);
console.log(`walkthrough: all tests passed (${demos.length} demos discovered, ${Object.keys(BUILTIN).length} built-in walkthroughs, ${Object.values(BUILTIN).reduce((n, c) => n + c.steps.length, 0)} steps)`);
