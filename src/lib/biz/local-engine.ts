"use client";
/**
 * In-browser stand-in for the business API's workflow (Flow) and BI endpoints, so both work with no server: a TypeScript port of
 * services/biz-api/app/flow.py and bi.py running over the shared local store (db.ts). Workflows, runs, approvals, alerts and imported CSV
 * datasets live in this browser (localStorage; large datasets stay in memory when the quota is exceeded). Workflow actions really create
 * tasks / alerts / approvals and change fields in the demo's own records. Nothing is sent anywhere.
 * Differences from the server: records are not schema-validated by the server's rules (the screens' own forms still validate), and data does not outlive this browser.
 */
import { setDb } from "./db";
import type { Json } from "./sync";

const KEY = "neoforge-erp-local-engine-v1", TODAY = new Date(Date.UTC(2026, 2, 15)); // the demo's fixed 'today', as on the server
const OPS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "exists"]), TYPES = new Set(["condition", "create_task", "set_field", "create_alert", "approval", "delay", "end"]);
const TRIGGERS = new Set(["crm.leads", "crm.opps", "desk.tickets", "fin.invoices", "inv.movements", "hrm.leave", "proc.requisitions", "fin.expenses"]), TARGETS = new Set(["crm.leads", "crm.opps", "desk.tickets", "hrm.leave", "proc.requisitions"]);
export class LocalError extends Error { constructor(public status: number, message: string, public errors: string[] = []) { super(message); } }
interface Store { flow: Record<"workflows" | "runs" | "approvals" | "alerts", Json[]>; datasets: Json[] }
let store: Store | null = null;
const load = (): Store => { if (store) return store; try { const raw = localStorage.getItem(KEY); if (raw) { store = JSON.parse(raw) as Store; return store; } } catch { /* start empty */ } return (store = { flow: { workflows: [], runs: [], approvals: [], alerts: [] }, datasets: [] }); };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota: keep in memory for this session */ } };
export const resetLocalEngine = () => { store = { flow: { workflows: [], runs: [], approvals: [], alerts: [] }, datasets: [] }; save(); };
const now = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const hex = (n: number) => crypto.randomUUID().replace(/-/g, "").slice(0, n);
const dbState = () => (window as unknown as { __erpDb: () => Record<string, Record<string, Json[]>> }).__erpDb();
const sliceOf = (sl: string): Record<string, Json[]> => (sl === "flow" ? (load().flow as never) : dbState()[sl] ?? {});
function apply(sl: string, upsert: Record<string, Json[]>) {
  if (sl === "flow") { const f = load().flow as Record<string, Json[]>; for (const [c, recs] of Object.entries(upsert)) { const list = (f[c] ??= []); for (const r of recs) { const i = list.findIndex((x) => x.id === r.id); if (i >= 0) list[i] = r; else list.push(r); } } save(); return; }
  setDb((d) => { const cur = (d as unknown as Record<string, Record<string, Json[]>>)[sl] ?? {}, next = { ...cur }; for (const [c, recs] of Object.entries(upsert)) { const list = [...(next[c] ?? [])]; for (const r of recs) { const i = list.findIndex((x) => x.id === r.id); if (i >= 0) list[i] = r; else list.push(r); } next[c] = list; } return { ...d, [sl]: next } as never; });
}

/* ───────── workflow engine (port of flow.py) ───────── */
interface Step { id: string; type: string; config?: Json }
interface Wf extends Json { id: string; name: string; active?: boolean; trigger: { type: string; slice?: string; coll?: string }; steps: Step[] }
interface RunRec extends Json { id: string; workflowId: string; workflowName: string; startedAt: string; auto: boolean; payload: Json; steps: { stepId: string; type: string; at: string; status: string; detail: string }[]; status: string; error: string; resumeAt?: number; failedStep?: number; approvalId?: string; endedAt?: string }
export function validateWorkflow(wf: Partial<Wf>): string[] {
  const errs: string[] = [];
  if (typeof wf.name !== "string" || !wf.name.trim()) errs.push("the workflow needs a name");
  const t = wf.trigger; if (!t || !["record_created", "manual"].includes(t.type)) errs.push("the trigger must be record_created or manual"); else if (t.type === "record_created" && !TRIGGERS.has(`${t.slice}.${t.coll}`)) errs.push("the trigger needs a supported record type: " + [...TRIGGERS].sort().join(", "));
  const steps = wf.steps; if (!Array.isArray(steps) || !steps.length) return [...errs, "add at least one step"]; if (steps.length > 20) errs.push("a workflow can have at most 20 steps");
  const ids = new Set<unknown>();
  steps.forEach((s, k) => {
    const i = k + 1; if (!s || typeof s !== "object" || !TYPES.has(s.type)) { errs.push(`step ${i}: unknown step type`); return; } if (ids.has(s.id)) errs.push(`step ${i}: duplicate step id`); ids.add(s.id); const c = (s.config ?? {}) as Json;
    if (s.type === "condition") { if (!c.field || !OPS.has(c.op as string)) errs.push(`step ${i}: a condition needs a field and an operator (${[...OPS].sort().join(", ")})`); else if (c.op !== "exists" && !("value" in c)) errs.push(`step ${i}: a condition needs a value`); }
    else if (s.type === "create_task") { if (typeof c.subject !== "string" || !c.subject.trim()) errs.push(`step ${i}: a task needs a subject`); const dd = c.dueDays ?? 0; if (!Number.isInteger(dd) || (dd as number) < 0 || (dd as number) > 365) errs.push(`step ${i}: dueDays must be a whole number from 0 to 365`); }
    else if (s.type === "set_field") { if (!TARGETS.has(`${c.slice}.${c.coll}`) || !c.field || !("value" in c)) errs.push(`step ${i}: set_field needs a supported target (${[...TARGETS].sort().join(", ")}), a field and a value`); else if (c.field === "id") errs.push(`step ${i}: the id cannot be changed`); }
    else if (s.type === "create_alert") { if (typeof c.title !== "string" || !c.title.trim()) errs.push(`step ${i}: an alert needs a title`); }
    else if (s.type === "approval") { if (typeof c.title !== "string" || !c.title.trim()) errs.push(`step ${i}: an approval needs a title`); }
    else if (s.type === "delay") { if (!Number.isInteger(c.days) || (c.days as number) < 0 || (c.days as number) > 365) errs.push(`step ${i}: delay days must be a whole number from 0 to 365`); }
  });
  return errs;
}
const getPath = (payload: Json, path: string): unknown => { let cur: unknown = payload; for (const part of path.split(".")) { if (!cur || typeof cur !== "object" || Array.isArray(cur) || !(part in (cur as Json))) throw new KeyErr(path); cur = (cur as Json)[part]; } return cur; };
class KeyErr extends Error { constructor(public key: string) { super(key); } }
const render = (tpl: string, payload: Json) => tpl.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, p: string) => String(getPath(payload, p)));
function cond(c: Json, payload: Json): boolean {
  let v: unknown; try { v = getPath(payload, c.field as string); } catch (e) { if (e instanceof KeyErr && c.op === "exists") return false; throw e; }
  const op = c.op as string, want = c.value; if (op === "exists") return !(v === null || v === "" || (Array.isArray(v) && !v.length)); if (["gt", "gte", "lt", "lte"].includes(op)) { const a = Number(v), b = Number(want); if (Number.isNaN(a) || Number.isNaN(b)) throw new TypeError(`could not convert string to float: '${String(Number.isNaN(a) ? v : want)}'`); return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b; }
  if (op === "contains") return String(v ?? "").toLowerCase().includes(String(want ?? "").toLowerCase()); return (String(v) === String(want)) === (op === "eq");
}
const errMsg = (e: unknown) => (e instanceof KeyErr ? `the payload has no field '${e.key}'` : e instanceof TypeError || e instanceof RangeError ? `invalid value: ${e.message}` : e instanceof Error ? e.message : "error");
function saveRun(run: RunRec) { apply("flow", { runs: [JSON.parse(JSON.stringify(run))] }); }
const notRun = (run: RunRec, steps: Step[], from: number, why: string) => { for (const later of steps.slice(from)) run.steps.push({ stepId: later.id, type: later.type, at: "", status: "not_run", detail: why }); };
export function runWorkflow(wf: Wf, payload: Json, auto = false, startAt = 0, prior?: RunRec): RunRec {
  const errs = validateWorkflow(wf), run: RunRec = prior ?? { id: `run_${hex(10)}`, workflowId: wf.id ?? "", workflowName: wf.name ?? "", startedAt: now(), auto, payload, steps: [], status: "running", error: "" };
  if (errs.length) { Object.assign(run, { status: "validation_error", error: errs.join("; "), endedAt: now() }); saveRun(run); return run; }
  const steps = wf.steps; let finished = true;
  for (let i = startAt; i < steps.length; i++) {
    const st = steps[i], rec = { stepId: st.id, type: st.type, at: now(), status: "ok", detail: "" }; run.steps = [...run.steps.filter((s) => s.stepId !== st.id), rec]; let stop: string | null = null;
    try { stop = step(st, payload, run, rec); } catch (e) { rec.status = "failed"; rec.detail = errMsg(e); Object.assign(run, { status: "failed", error: `step ${i + 1} (${st.type}): ${rec.detail}`, failedStep: i }); notRun(run, steps, i + 1, "an earlier step failed"); finished = false; break; }
    if (stop === "pause") { Object.assign(run, { status: "pending_approval", resumeAt: i + 1 }); notRun(run, steps, i + 1, "waiting for the approval decision"); finished = false; break; }
    if (stop === "end") { run.status = "succeeded"; notRun(run, steps, i + 1, "the workflow ended"); finished = false; break; }
    if (stop === "stop") { run.status = "stopped_condition"; notRun(run, steps, i + 1, "the condition was not met"); finished = false; break; }
  }
  if (finished) run.status = "succeeded"; if (["succeeded", "failed", "stopped_condition"].includes(run.status)) run.endedAt = now(); saveRun(run); return run;
}
function step(st: Step, payload: Json, run: RunRec, rec: { status: string; detail: string }): string | null {
  const c = (st.config ?? {}) as Json;
  if (st.type === "condition") { const ok = cond(c, payload); rec.detail = `${c.field} ${c.op} ${c.value ?? ""}: ${ok ? "met" : "not met"}`; if (!ok) { rec.status = "stopped"; return "stop"; } }
  else if (st.type === "create_task") { const subject = render(c.subject as string, payload), due = new Date(TODAY.getTime() + Number(c.dueDays ?? 0) * 86400000).toISOString().slice(0, 10), id = `act_${hex(8)}`; apply("crm", { activities: [{ id, type: "Task", subject: subject.slice(0, 200), due, done: false, ownerId: String(c.ownerId ?? ""), source: run.id }] }); rec.detail = `created task ${id} “${subject.slice(0, 80)}” due ${due} in CRM activities`; }
  else if (st.type === "set_field") { const sl = c.slice as string, coll = c.coll as string, rid = getPath(payload, (c.idField as string) ?? "id"), cur = (sliceOf(sl)[coll] ?? []).find((r) => r.id === rid); if (!cur) throw new KeyErr(`${sl}.${coll} record ${String(rid)} does not exist in this workspace`); apply(sl, { [coll]: [{ ...cur, [c.field as string]: c.value }] }); rec.detail = `set ${sl}.${coll}[${String(rid)}].${c.field} = ${JSON.stringify(c.value)} (was ${JSON.stringify(cur[c.field as string] ?? null)})`; }
  else if (st.type === "create_alert") { const title = render(c.title as string, payload), id = `al_${hex(8)}`; apply("flow", { alerts: [{ id, title: title.slice(0, 200), message: render((c.message as string) ?? "", payload).slice(0, 500), at: now(), runId: run.id }] }); rec.detail = `created alert ${id} “${title.slice(0, 80)}”`; }
  else if (st.type === "approval") { const id = `apr_${hex(8)}`; apply("flow", { approvals: [{ id, runId: run.id, title: render(c.title as string, payload).slice(0, 200), status: "Pending", createdAt: now(), note: "" }] }); rec.status = "waiting"; rec.detail = `approval ${id} is waiting for a decision`; run.approvalId = id; return "pause"; }
  else if (st.type === "delay") { rec.status = "skipped_demo"; rec.detail = `a ${c.days}-day delay is recorded but not waited for in this demo`; }
  else if (st.type === "end") { rec.detail = "workflow ended"; return "end"; }
  return null;
}
function decide(id: string, decision: string, note: string): RunRec {
  const f = load().flow, ap = f.approvals.find((a) => a.id === id); if (!ap) throw new LocalError(404, "approval not found", ["approval not found"]); if (ap.status !== "Pending") throw new LocalError(409, "this approval has already been decided", ["this approval has already been decided"]);
  const run = f.runs.find((r) => r.id === ap.runId) as RunRec | undefined, wf = f.workflows.find((w) => run && w.id === run.workflowId) as Wf | undefined; Object.assign(ap, { status: decision === "approve" ? "Approved" : "Rejected", decidedAt: now(), note: note.slice(0, 300) }); apply("flow", { approvals: [ap] });
  if (!run || !wf) throw new LocalError(409, "the run or workflow no longer exists", ["the run or workflow no longer exists"]);
  if (decision !== "approve") { Object.assign(run, { status: "rejected", endedAt: now(), error: "the approval was rejected" }); for (const s of run.steps) if (s.status === "waiting") Object.assign(s, { status: "rejected", detail: "rejected" }); saveRun(run); return run; }
  for (const s of run.steps) if (s.status === "waiting") Object.assign(s, { status: "ok", detail: "approved" }); run.steps = run.steps.filter((s) => s.status !== "not_run"); run.status = "running"; return runWorkflow(wf, run.payload, run.auto, run.resumeAt ?? wf.steps.length, run);
}
function retry(id: string): RunRec {
  const f = load().flow, run = f.runs.find((r) => r.id === id) as RunRec | undefined; if (!run || run.status !== "failed") throw new LocalError(409, "only a failed run can be retried", ["only a failed run can be retried"]);
  const wf = f.workflows.find((w) => w.id === run.workflowId) as Wf | undefined; if (!wf) throw new LocalError(409, "the workflow no longer exists", ["the workflow no longer exists"]); const i = run.failedStep ?? 0;
  if (!["set_field", "create_alert", "condition"].includes(wf.steps[i].type)) throw new LocalError(409, "this step type is not safe to retry automatically because it could create a duplicate", ["this step type is not safe to retry automatically because it could create a duplicate"]);
  run.status = "running"; run.error = ""; return runWorkflow(wf, run.payload, run.auto, i, run);
}
/** Called after any change to the shared store: runs the active workflows whose trigger matches a record that was just created. */
let busy = false;
export function onStoreChange(prev: Record<string, unknown>, next: Record<string, unknown>) {
  if (busy || !store && !localStorage.getItem(KEY)) return; const s = load(); if (!s.flow.workflows.some((w) => w.active)) return;
  const created: [string, string, Json][] = []; for (const key of TRIGGERS) { const [sl, coll] = key.split("."), a = ((prev[sl] as Record<string, Json[]> | undefined)?.[coll] ?? []) as Json[], b = ((next[sl] as Record<string, Json[]> | undefined)?.[coll] ?? []) as Json[]; if (a === b) continue; const old = new Set(a.map((r) => r.id)); for (const r of b) if (!old.has(r.id)) created.push([sl, coll, r]); }
  if (!created.length) return; busy = true;
  try { for (const [sl, coll, rec] of created) for (const wf of s.flow.workflows as Wf[]) { const t = wf.trigger; if (wf.active && t.type === "record_created" && t.slice === sl && t.coll === coll) runWorkflow(wf, rec, true); } } finally { busy = false; window.dispatchEvent(new Event("erp-flow-changed")); }
}

/* ───────── BI (port of bi.py) ───────── */
const NUM = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/, DATE_RE = /^\d{4}-\d{2}-\d{2}$/, MAX_ROWS = 50000, MAX_MB = 5;
const parseNumber = (v: string): number | null => { const t = v.trim(); return NUM.test(t) ? Number(t.replace(/,/g, "")) : null; };
const isDate = (v: string) => { if (!DATE_RE.test(v)) return false; const d = new Date(v + "T00:00:00Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; };
function csvRows(text: string): string[][] { const out: string[][] = []; let row: string[] = [], cur = "", q = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; } else cur += ch; } if (cur !== "" || row.length) { row.push(cur); out.push(row); } return out; }
interface Col { name: string; type: string }
function parseCsv(text: string, mapping: Record<string, string>) {
  if (text.slice(0, 2000).includes("\x00")) throw new LocalError(422, "this looks like a binary file, not a CSV"); const all = csvRows(text.replace(/^﻿/, "")); if (!all.length) throw new LocalError(422, "the file is empty");
  const head = all[0].map((h) => h.trim()); if (head.length < 2 || head.some((h) => !h) || new Set(head).size !== head.length) throw new LocalError(422, "the first row must contain unique, non-empty column names (at least two)");
  const cols = head.map((h) => mapping[h] ?? h); if (new Set(cols).size !== cols.length || cols.some((c) => !/^[A-Za-z][A-Za-z0-9_ ]{0,40}$/.test(c))) throw new LocalError(422, "column names must be unique, start with a letter and contain only letters, digits, spaces and underscores");
  const raw: [number, string[]][] = []; all.slice(1).forEach((r, i) => { if (!r.some((c) => c.trim())) return; raw.push([i + 2, r]); if (raw.length > MAX_ROWS) throw new LocalError(422, `the file has more than ${MAX_ROWS} rows`); });
  const kinds: Record<string, string> = {}; cols.forEach((c, j) => { const vals = raw.map(([, r]) => (r[j] ?? "").trim()).filter(Boolean), share = (f: (v: string) => boolean) => (vals.length ? vals.filter(f).length / vals.length : 0); kinds[c] = share(isDate) >= 0.8 ? "date" : share((v) => parseNumber(v) !== null) >= 0.8 ? "number" : "text"; });
  const rows: Json[] = [], errors: { line: number; message: string }[] = [];
  for (const [ln, r] of raw) {
    if (r.length !== cols.length) { errors.push({ line: ln, message: `has ${r.length} values but the header has ${cols.length}` }); continue; } const rec: Json = {}; let bad = false;
    for (let j = 0; j < cols.length; j++) { const c = cols[j], v = r[j].trim(); if (kinds[c] === "number") { const n = v ? parseNumber(v) : null; if (v && n === null) { errors.push({ line: ln, message: `${c}: '${v}' is not a number` }); bad = true; break; } rec[c] = n; } else if (kinds[c] === "date") { if (v && !isDate(v)) { errors.push({ line: ln, message: `${c}: '${v}' is not a valid date (YYYY-MM-DD)` }); bad = true; break; } rec[c] = v || null; } else rec[c] = v; }
    if (!bad) rows.push(rec);
  }
  return { columns: cols.map((c) => ({ name: c, type: kinds[c] })) as Col[], rows, errors, rows_in_file: raw.length };
}
function biQuery(rows: Json[], columns: Col[], q: { group_by?: string; metric?: string; agg: string; filters: [string, string, string][]; date_col?: string; date_from?: string; date_to?: string; sort: string }) {
  const kinds = Object.fromEntries(columns.map((c) => [c.name, c.type])), { group_by, metric, agg } = q; if (!["sum", "avg", "count", "min", "max"].includes(agg)) throw new LocalError(422, "agg must be one of avg, count, max, min, sum"); if (group_by && !(group_by in kinds)) throw new LocalError(422, `unknown column '${group_by}'`); if (agg !== "count" && (!metric || kinds[metric] !== "number")) throw new LocalError(422, "choose a numeric column as the metric");
  const sel = rows.filter((r) => {
    if (q.date_col) { const d = r[q.date_col] as string | null; if ((q.date_from || q.date_to) && !d) return false; if ((q.date_from && d! < q.date_from) || (q.date_to && d! > q.date_to)) return false; }
    for (const [col, op, val] of q.filters) { if (!(col in kinds)) throw new LocalError(422, `unknown filter column '${col}'`); const v = r[col]; let ok: boolean; if (op === "eq") ok = String(v) === val; else if (op === "ne") ok = String(v) !== val; else if (["gte", "lte", "gt", "lt"].includes(op)) { const a = Number(v), b = Number(val); ok = v === null || Number.isNaN(a) || Number.isNaN(b) ? false : op === "gte" ? a >= b : op === "lte" ? a <= b : op === "gt" ? a > b : a < b; } else throw new LocalError(422, "filter operator must be eq, ne, gt, gte, lt or lte"); if (!ok) return false; }
    return true;
  });
  const groups = new Map<unknown, Json[]>(); for (const r of sel) { const k = group_by ? r[group_by] : "All"; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const aggOf = (rs: Json[]): number | null => { if (agg === "count") return rs.length; const v = rs.map((x) => x[metric!]).filter((x): x is number => typeof x === "number"); if (!v.length) return null; return agg === "sum" ? v.reduce((a, b) => a + b, 0) : agg === "avg" ? v.reduce((a, b) => a + b, 0) / v.length : agg === "min" ? Math.min(...v) : Math.max(...v); };
  const r4 = (x: number | null) => (x === null ? null : Math.round(x * 1e4) / 1e4), out = [...groups].map(([k, rs]) => ({ group: k === null || k === "" ? "(blank)" : k, value: r4(aggOf(rs)), rows: rs.length }));
  out.sort(q.sort === "value_desc" ? (a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || String(a.group).localeCompare(String(b.group)) : (a, b) => String(a.group).localeCompare(String(b.group)));
  return { rows_matched: sel.length, rows_total: rows.length, groups: out.slice(0, 200), total: r4(aggOf(sel)), agg, metric: metric ?? null, group_by: group_by ?? null, note: "A group with value null has no numeric values for the metric: it is not zero." };
}
export async function localBiImport(fd: FormData): Promise<Json> {
  const file = fd.get("file"); if (!(file instanceof File)) throw new LocalError(400, "Choose a CSV file."); if (!file.size) throw new LocalError(400, "The file is empty."); if (file.size > MAX_MB * 1e6) throw new LocalError(413, `The file is larger than the ${MAX_MB} MB limit.`);
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer()), is = (b: number[]) => b.every((v, i) => head[i] === v); if (is([0x25, 0x50, 0x44, 0x46, 0x2d]) || is([0x50, 0x4b, 3, 4]) || is([0xff, 0xd8, 0xff]) || is([0x89, 0x50, 0x4e, 0x47])) throw new LocalError(415, "Unsupported file type. Upload a CSV file.");
  const mode = String(fd.get("mode") ?? "preview"); if (!["preview", "commit"].includes(mode)) throw new LocalError(400, "mode must be preview or commit."); let mapping: Record<string, string>; try { mapping = JSON.parse(String(fd.get("mapping") ?? "{}")); if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error(); } catch { throw new LocalError(400, "mapping must be a JSON object of {file column: dataset column}."); }
  let text: string; const buf = await file.arrayBuffer(); try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { text = new TextDecoder("latin1").decode(buf); }
  const parsed = parseCsv(text, mapping); let rows = parsed.rows, dups = 0; const dk = String(fd.get("dedupe_key") ?? "");
  if (dk) { const keys = dk.split(",").map((k) => k.trim()).filter(Boolean), names = new Set(parsed.columns.map((c) => c.name)); if (!keys.length || keys.some((k) => !names.has(k))) throw new LocalError(400, "dedupe_key must name existing columns."); const seen = new Set<string>(), out: Json[] = []; for (const r of rows) { const k = JSON.stringify(keys.map((c) => r[c])); if (seen.has(k)) { dups++; continue; } seen.add(k); out.push(r); } rows = out; }
  const res = { columns: parsed.columns, preview: rows.slice(0, 10), rows_in_file: parsed.rows_in_file, valid_rows: rows.length, invalid_rows: parsed.errors.length, duplicates_removed: dups, errors: parsed.errors.slice(0, 50) };
  if (mode === "preview") return { ...res, committed: false }; const skip = String(fd.get("skip_invalid")) === "true";
  if (parsed.errors.length && !skip) throw new LocalError(422, "Fix the file or choose to skip invalid rows.", [...parsed.errors.slice(0, 25).map((e) => `line ${e.line}: ${e.message}`), "Fix the file or choose to skip invalid rows."]); if (!rows.length) throw new LocalError(422, "No valid rows to import.");
  const id = `ds_${hex(8)}`; load().datasets.push({ id, name: (String(fd.get("name") ?? "").trim() || "Imported data").slice(0, 80), columns: parsed.columns, rows, importedAt: now(), source: "csv upload (in this browser)" }); save(); return { ...res, committed: true, dataset_id: id };
}

const filtered = (rows: Json[], params: URLSearchParams) => { let r = rows; params.forEach((v, k) => { if (k.startsWith("f.")) r = r.filter((x) => String(x[k.slice(2)]) === v); }); const q = (params.get("q") ?? "").toLowerCase(); return q ? r.filter((x) => JSON.stringify(x).toLowerCase().includes(q)) : r; };
/* ───────── router (the subset of the REST API the Flow and BI screens use) ───────── */
export async function localApi<T = Json>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase(), [p, qs = ""] = path.split("?"), params = new URLSearchParams(qs), parts = p.split("/").filter(Boolean), body = init?.body && typeof init.body === "string" ? (JSON.parse(init.body) as Json) : {};
  const s = load(); const out = (v: unknown) => v as T;
  if (parts[0] === "flow") {
    const [, coll, id, action] = parts;
    if (coll === "validate" && method === "POST") { const errs = validateWorkflow(body as Partial<Wf>); return out({ valid: !errs.length, errors: errs }); }
    if (coll === "workflows" && id && action === "run" && method === "POST") { const wf = s.flow.workflows.find((w) => w.id === id) as Wf | undefined; if (!wf) throw new LocalError(404, "Record not found."); const payload = body.payload; if (!payload || typeof payload !== "object" || !Object.keys(payload).length) throw new LocalError(400, "Send payload: an object with the test record's fields."); const r = runWorkflow(wf, payload as Json); window.dispatchEvent(new Event("erp-flow-changed")); return out(r); }
    if (coll === "approvals" && id && action === "decide" && method === "POST") { if (!["approve", "reject"].includes(body.decision as string)) throw new LocalError(400, "decision must be approve or reject."); const r = decide(id, body.decision as string, String(body.note ?? "")); window.dispatchEvent(new Event("erp-flow-changed")); return out(r); }
    if (coll === "runs" && id && action === "retry" && method === "POST") { const r = retry(id); window.dispatchEvent(new Event("erp-flow-changed")); return out(r); }
    if (coll && ["workflows", "runs", "approvals", "alerts"].includes(coll)) {
      const list = (s.flow as Record<string, Json[]>)[coll];
      if (!id && method === "GET") { const limit = Math.min(500, Number(params.get("limit") ?? 50)), off = Number(params.get("offset") ?? 0), rows = filtered(list, params); return out({ total: rows.length, limit, offset: off, items: rows.slice(off, off + limit) }); }
      if (!id && method === "POST") { const rec = { ...body, id: (body.id as string) || `${coll.slice(0, 3)}_${hex(8)}` }; if (list.some((r) => r.id === rec.id)) throw new LocalError(409, "A record with this id already exists."); if (coll === "workflows") { const errs = validateWorkflow(rec as unknown as Wf); if (errs.length) throw new LocalError(422, errs[0], errs); } list.push(rec); save(); return out({ record: rec, workflow_runs: [], refresh: [] }); }
      const i = list.findIndex((r) => r.id === id); if (i < 0) throw new LocalError(404, "Record not found.");
      if (method === "GET") return out(list[i]); if (method === "DELETE") { list.splice(i, 1); save(); return out({ deleted: true }); }
      if (method === "PUT" || method === "PATCH") { const next = method === "PUT" ? { ...body, id } : { ...list[i], ...body, id }; if (coll === "workflows") { const errs = validateWorkflow(next as unknown as Wf); if (errs.length) throw new LocalError(422, errs[0], errs); } list[i] = next; save(); return out(next); }
    }
  }
  if (parts[0] === "bi") {
    if (parts[1] === "datasets") return out({ datasets: s.datasets.map((d) => ({ ...d, rows: (d.rows as Json[]).length })) });
    if (parts[1] === "query") {
      const source = params.get("source") ?? ""; let rows: Json[], cols: Col[];
      if (source.startsWith("dataset:")) { const ds = s.datasets.find((d) => d.id === source.slice(8)); if (!ds) throw new LocalError(404, "Dataset not found."); rows = ds.rows as Json[]; cols = ds.columns as Col[]; }
      else if (source.startsWith("records:") && source.split(".").length === 2) { const [sl, coll] = source.slice(8).split("."); rows = (sliceOf(sl)[coll] ?? []).map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => !Array.isArray(v) && !(v && typeof v === "object")))); if (!rows.length) throw new LocalError(409, "There are no records in this collection yet."); const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort(); cols = keys.map((k) => ({ name: k, type: rows.some((r) => r[k] !== null && r[k] !== undefined) && rows.every((r) => r[k] === null || r[k] === undefined || (typeof r[k] === "number")) ? "number" : "text" })); }
      else throw new LocalError(400, "source must be dataset:<id> or records:<module>.<collection>.");
      const filters: [string, string, string][] = []; params.forEach((v, k) => { if (k.startsWith("filter.")) { const i = v.indexOf(":"); filters.push([k.slice(7), i < 0 ? v : v.slice(0, i), i < 0 ? "" : v.slice(i + 1)]); } });
      return out({ source, ...biQuery(rows, cols, { group_by: params.get("group_by") ?? undefined, metric: params.get("metric") ?? undefined, agg: params.get("agg") ?? "sum", filters, date_col: params.get("date_col") ?? undefined, date_from: params.get("date_from") ?? undefined, date_to: params.get("date_to") ?? undefined, sort: params.get("sort") ?? "value_desc" }) });
    }
  }
  if (parts.length === 2 && method === "GET") { const rows = filtered(sliceOf(parts[0])[parts[1]] ?? [], params), limit = Math.min(500, Number(params.get("limit") ?? 50)); return out({ total: rows.length, limit, offset: 0, items: rows.slice(0, limit) }); }
  throw new LocalError(404, `Not available in the in-browser engine: ${method} ${path}`);
}

/** Test hook: lets browser tests query the in-browser engine the way the screens do. */
if (typeof window !== "undefined") (window as unknown as { __erpLocalApi: typeof localApi }).__erpLocalApi = localApi;
