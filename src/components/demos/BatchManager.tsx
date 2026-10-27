"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "./DemoShell";
import { BTN, CARD, FIELD, H3, LBL, PRIMARY, SEV, download, stamp, toCsv } from "./ui";
import { CATEGORIES, DEFAULT_CONFIG, STEPS, UNAVAILABLE, execStep, parseDxf, sampleDxf, sampleJobs, type Config, type Job, type JobStatus, type StepKey } from "@/lib/demo-batch-data";
import type { Branding } from "@/lib/types";

const CHIP: Record<JobStatus, string> = { pending: "bg-slate-700/60 text-slate-300", queued: "bg-sky-500/15 text-sky-300", processing: "bg-blue-500/20 text-blue-300", paused: "bg-amber-500/15 text-amber-300", completed: "bg-emerald-500/15 text-emerald-300", failed: "bg-red-500/15 text-red-300", cancelled: "bg-slate-600/40 text-slate-400" };
const TICK = 170;
const issueCount = (j: Job) => j.findings.filter((f) => f.severity !== "info").length;

export default function BatchManager({ branding }: { branding: Branding }) {
  const [jobs, setJobs] = useState<Job[]>(() => sampleJobs());
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "log" | "findings" | "report">("overview");
  const [q, setQ] = useState(""); const [catF, setCatF] = useState("All"); const [statF, setStatF] = useState("All");
  const [running, setRunning] = useState(false); const [paused, setPaused] = useState(false);
  const [msg, setMsg] = useState("");
  const [batchLog, setBatchLog] = useState<{ t: string; text: string }[]>([]);
  const jobsRef = useRef(jobs); const cfgRef = useRef(cfg);
  const eng = useRef<{ queue: string[]; cur: string | null; idx: number; paused: boolean; cancel: boolean; timer: ReturnType<typeof setTimeout> | null }>({ queue: [], cur: null, idx: 0, paused: false, cancel: false, timer: null });
  cfgRef.current = cfg;
  const commit = (fn: (j: Job[]) => Job[]) => { const n = fn(jobsRef.current); jobsRef.current = n; setJobs(n); };
  const patch = (id: string, f: (j: Job) => Job) => commit((js) => js.map((j) => (j.id === id ? f(j) : j)));
  const blog = (text: string) => setBatchLog((l) => [{ t: stamp(), text }, ...l].slice(0, 60));
  useEffect(() => () => { if (eng.current.timer) clearTimeout(eng.current.timer); }, []);

  // ---- engine ----
  const finishBatch = (why: string) => { eng.current.cur = null; eng.current.timer = null; setRunning(false); setPaused(false); blog(why); };
  const nextJob = () => {
    const e = eng.current;
    if (e.cancel) { e.queue.forEach((id) => patch(id, (j) => ({ ...j, status: "pending" }))); e.queue = []; return finishBatch("Batch cancelled. Remaining jobs returned to Pending."); }
    const id = e.queue.shift();
    if (!id) return finishBatch("Batch finished.");
    e.cur = id; e.idx = 0;
    patch(id, (j) => ({ ...j, status: "processing", step: 0, logs: [{ t: stamp(), level: "info", text: "Job started" }], findings: [], stepStatus: {}, stats: undefined, reportText: undefined, error: undefined, runs: j.runs + 1 }));
    e.timer = setTimeout(stepTick, TICK);
  };
  const stepTick = () => {
    const e = eng.current; if (!e.cur) return;
    const id = e.cur; const job = jobsRef.current.find((j) => j.id === id);
    if (!job) { e.cur = null; return nextJob(); }
    if (e.cancel) { patch(id, (j) => ({ ...j, status: "cancelled", logs: [...j.logs, { t: stamp(), level: "warn", text: "Cancelled by user" }] })); blog(`${job.file} cancelled.`); e.cur = null; return nextJob(); }
    if (e.paused) { e.timer = setTimeout(stepTick, 200); return; }
    const c = cfgRef.current;
    if (e.idx >= c.order.length) { patch(id, (j) => ({ ...j, status: "completed", logs: [...j.logs, { t: stamp(), level: "info", text: `Job completed with ${issueCount(j)} issue(s)` }] })); blog(`${job.file} completed.`); e.cur = null; e.timer = setTimeout(nextJob, TICK); return; }
    const key = c.order[e.idx++];
    if (!c.enabled[key]) { patch(id, (j) => ({ ...j, step: e.idx, stepStatus: { ...j.stepStatus, [key]: "skipped" }, logs: [...j.logs, { t: stamp(), level: "info", text: `${STEPS.find((s) => s.key === key)!.name}: skipped (disabled)` }] })); e.timer = setTimeout(stepTick, TICK / 2); return; }
    const out = execStep(key, job, c, [...job.findings, ...[]]);
    if (out.failed) { patch(id, (j) => ({ ...j, status: "failed", step: e.idx, stepStatus: { ...j.stepStatus, [key]: "failed" }, logs: [...j.logs, ...out.logs, { t: stamp(), level: "error", text: "Job failed" }], findings: [...j.findings, ...out.findings], error: out.failed })); blog(`${job.file} failed: ${out.failed}`); e.cur = null; e.timer = setTimeout(nextJob, TICK); return; }
    patch(id, (j) => { const all = [...j.findings, ...out.findings]; const stats = out.stats ? { ...out.stats, issues: all.filter((f) => f.severity !== "info").length } : j.stats; return { ...j, step: e.idx, stepStatus: { ...j.stepStatus, [key]: "done" }, logs: [...j.logs, ...out.logs], findings: all, stats, reportText: out.reportText ?? j.reportText }; });
    e.timer = setTimeout(stepTick, TICK);
  };
  const start = (ids: string[], label: string) => {
    const e = eng.current; const list = ids.filter((id) => { const j = jobsRef.current.find((x) => x.id === id); return j && j.status !== "processing" && j.status !== "paused"; });
    if (!list.length) { setMsg("Nothing to run: select jobs that are not already processing."); return; }
    if (running) { setMsg("A batch is already running. Wait for it to finish or cancel it."); return; }
    if (!cfgRef.current.order.some((k) => cfgRef.current.enabled[k])) { setMsg("Enable at least one processing step before running."); return; }
    setMsg(""); e.cancel = false; e.paused = false; e.queue = list.slice();
    commit((js) => js.map((j) => (list.includes(j.id) ? { ...j, status: "queued" } : j)));
    setRunning(true); setPaused(false); blog(`${label}: ${list.length} job${list.length > 1 ? "s" : ""} queued.`);
    e.timer = setTimeout(nextJob, TICK);
  };
  const pause = () => { const e = eng.current; e.paused = !e.paused; setPaused(e.paused); if (e.cur) patch(e.cur, (j) => ({ ...j, status: e.paused ? "paused" : "processing" })); blog(e.paused ? "Batch paused." : "Batch resumed."); };
  const cancel = () => { eng.current.cancel = true; blog("Cancel requested: finishing the current step."); if (eng.current.paused) { eng.current.paused = false; setPaused(false); } };
  const reset = () => { if (eng.current.timer) clearTimeout(eng.current.timer); Object.assign(eng.current, { queue: [], cur: null, idx: 0, paused: false, cancel: false, timer: null }); const fresh = sampleJobs(); jobsRef.current = fresh; setJobs(fresh); setCfg(DEFAULT_CONFIG); setChecked(new Set()); setFocus(null); setRunning(false); setPaused(false); setMsg(""); setBatchLog([]); setQ(""); setCatF("All"); setStatF("All"); };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) { setMsg("File too large for the demo (5 MB limit)."); return; }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "dxf") { const r = parseDxf(await file.text(), file.name, file.size); if ("error" in r) { setMsg(r.error); return; } commit((js) => [...js, r]); setFocus(r.id); setMsg(`Added ${file.name}: ${r.note ?? ""}`); blog(`Uploaded ${file.name} (parsed ${r.objects} entities).`); }
    else if (ext === "dwg") { const j: Job = { id: `U-${Date.now() % 100000}`, file: file.name, category: "Details", rev: "", format: "DWG", sizeMB: Math.round(file.size / 1e4) / 100, modified: new Date().toISOString().slice(0, 10), objects: 0, layers: [], units: "Unspecified", geom: { dups: 0, gaps: 0, tiny: 0 }, header: "ok", source: "upload", status: "pending", step: 0, stepStatus: {}, logs: [], findings: [], runs: 0, unparsed: true, note: "Uploaded DWG. Binary DWG cannot be parsed in this demo." }; commit((js) => [...js, j]); setFocus(j.id); setMsg("Added. DWG files are queued but will report that they cannot be parsed; upload ASCII DXF for real inspection."); blog(`Uploaded ${file.name} (DWG, not parsable).`); }
    else setMsg("Only .dxf and .dwg files can be added.");
  };

  // ---- derived ----
  const shown = useMemo(() => jobs.filter((j) => (catF === "All" || j.category === catF) && (statF === "All" || j.status === statF) && (!q || j.file.toLowerCase().includes(q.toLowerCase()))), [jobs, catF, statF, q]);
  const sel = jobs.find((j) => j.id === focus) ?? null;
  const M = useMemo(() => ({ total: jobs.length, done: jobs.filter((j) => j.status === "completed").length, failed: jobs.filter((j) => j.status === "failed").length, waiting: jobs.filter((j) => j.status === "pending" || j.status === "queued").length, cancelled: jobs.filter((j) => j.status === "cancelled").length, inspected: jobs.filter((j) => j.stepStatus.metadata === "done").length, findings: jobs.reduce((n, j) => n + issueCount(j), 0), steps: jobs.reduce((n, j) => n + Object.values(j.stepStatus).filter((s) => s === "done").length, 0) }), [jobs]);
  const enabledCount = cfg.order.filter((k) => cfg.enabled[k]).length;
  const allChecked = shown.length > 0 && shown.every((j) => checked.has(j.id));
  const move = (i: number, d: -1 | 1) => setCfg((c) => { const o = c.order.slice(); const j = i + d; if (j < 0 || j >= o.length) return c; [o[i], o[j]] = [o[j], o[i]]; return { ...c, order: o }; });
  const ids = [...checked].filter((id) => jobs.some((j) => j.id === id));
  const summaryCsv = () => toCsv([["Job", "File", "Category", "Rev", "Format", "Size MB", "Objects", "Status", "Issues", "Steps done"], ...jobs.map((j) => [j.id, j.file, j.category, j.rev, j.format, j.sizeMB, j.objects, j.status, issueCount(j), Object.values(j.stepStatus).filter((s) => s === "done").length])]);
  const findingsCsv = () => toCsv([["Job", "File", "Step", "Severity", "Message"], ...jobs.flatMap((j) => j.findings.map((f) => [j.id, j.file, STEPS.find((s) => s.key === f.step)!.name, f.severity, f.message]))]);
  const logsTxt = (list: Job[]) => list.map((j) => `== ${j.file} (${j.status}) ==\n${j.logs.map((l) => `${l.t} [${l.level}] ${l.text}`).join("\n")}`).join("\n\n");
  const stepIcon = (j: Job, k: StepKey) => j.stepStatus[k] === "done" ? "✓" : j.stepStatus[k] === "failed" ? "✗" : j.stepStatus[k] === "skipped" ? "–" : "·";

  return (
    <DemoShell branding={branding} app="CAD Batch Processing Manager" project="Riverside Commercial Block · drawing batch" status={running ? (paused ? "Batch paused" : "Batch running") : `${M.waiting} pending · ${M.done} completed · ${M.failed} failed`}
      actions={<button type="button" onClick={reset} className={BTN}>Reset demo</button>}>
      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">{[["Total jobs", M.total], ["Completed", M.done], ["Failed", M.failed], ["Pending", M.waiting], ["Cancelled", M.cancelled], ["Drawings inspected", M.inspected], ["Findings", M.findings], ["Steps completed", M.steps]].map(([k, v]) => <div key={k} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p><p className={`font-display text-lg font-semibold ${k === "Failed" && M.failed ? "text-red-300" : "text-white"}`}>{v}</p></div>)}</div>

        <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_22rem]">
          {/* workflow */}
          <section className={`${CARD} order-2 lg:order-1`} aria-label="Workflow builder">
            <h2 className={H3}>Processing workflow</h2>
            <ol className="mt-2 space-y-1.5">{cfg.order.map((k, i) => { const s = STEPS.find((x) => x.key === k)!; return (
              <li key={k} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs"><div className="flex items-center gap-2"><input type="checkbox" aria-label={`Enable ${s.name}`} checked={cfg.enabled[k]} disabled={running} onChange={() => setCfg((c) => ({ ...c, enabled: { ...c.enabled, [k]: !c.enabled[k] } }))} /><span className="flex-1 font-medium text-white">{i + 1}. {s.name}</span><button type="button" aria-label={`Move ${s.name} up`} disabled={running || i === 0} onClick={() => move(i, -1)} className="px-1 text-slate-400 hover:text-white disabled:opacity-30">▲</button><button type="button" aria-label={`Move ${s.name} down`} disabled={running || i === cfg.order.length - 1} onClick={() => move(i, 1)} className="px-1 text-slate-400 hover:text-white disabled:opacity-30">▼</button></div><p className="ml-6 mt-0.5 text-[11px] text-slate-500">{s.text}</p></li>); })}</ol>
            <div className="mt-3 space-y-2">
              <div><label className={LBL} htmlFor="mx">Maximum file size (MB)</label><input id="mx" type="number" min={1} max={500} value={cfg.maxSizeMB} disabled={running} onChange={(e) => setCfg((c) => ({ ...c, maxSizeMB: Math.min(500, Math.max(1, +e.target.value || 1)) }))} className={FIELD} /></div>
              <div><label className={LBL} htmlFor="un">Project units</label><select id="un" value={cfg.units} disabled={running} onChange={(e) => setCfg((c) => ({ ...c, units: e.target.value }))} className={FIELD}>{["Millimetres", "Centimetres", "Metres", "Inches", "Feet"].map((u) => <option key={u}>{u}</option>)}</select></div>
            </div>
            <h3 className={`${H3} mt-4`}>Not available in the browser demo</h3>
            <ul className="mt-1.5 space-y-1 text-[11px] text-slate-500">{UNAVAILABLE.map((u) => <li key={u.name} className="rounded border border-dashed border-slate-800 px-2 py-1.5"><span className="text-slate-400">{u.name}</span><br />{u.why}</li>)}</ul>
            <h3 className={`${H3} mt-4`}>Add a file</h3>
            <label className="mt-1.5 block cursor-pointer rounded border border-dashed border-slate-600 px-3 py-3 text-center text-xs text-slate-300 hover:border-blue-500">Choose a .dxf (parsed for real) or .dwg file<input type="file" accept=".dxf,.dwg" className="sr-only" aria-label="Add a DXF or DWG file" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button type="button" onClick={() => download("sample-drawing.dxf", sampleDxf())} className={`${BTN} mt-2 w-full`}>Download a sample DXF to try</button>
          </section>

          {/* queue */}
          <section className={`${CARD} order-1 min-w-0 lg:order-2`} aria-label="File queue">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={PRIMARY} disabled={running} onClick={() => start(ids, "Run selected")}>Run selected ({ids.length})</button>
              <button type="button" className={BTN} disabled={running} onClick={() => start(jobs.filter((j) => j.status === "pending").map((j) => j.id), "Run all pending")}>Run all pending</button>
              <button type="button" className={BTN} disabled={!running} onClick={pause}>{paused ? "Resume" : "Pause"}</button>
              <button type="button" className={BTN} disabled={!running} onClick={cancel}>Cancel</button>
              <button type="button" className={BTN} disabled={running || !M.failed} onClick={() => start(jobs.filter((j) => j.status === "failed").map((j) => j.id), "Retry failed")}>Retry failed ({M.failed})</button>
              <button type="button" className={BTN} disabled={running || !ids.length} onClick={() => { commit((js) => js.filter((j) => !checked.has(j.id))); setChecked(new Set()); blog(`Removed ${ids.length} job(s) from the queue.`); if (focus && checked.has(focus)) setFocus(null); }}>Remove selected</button>
              <button type="button" className={BTN} disabled={running} onClick={() => { const have = new Set(jobsRef.current.map((j) => j.id)); const add = sampleJobs().filter((j) => !have.has(j.id)); commit((js) => [...js, ...add]); blog(`Re-added ${add.length} sample file(s).`); setMsg(add.length ? "" : "All sample files are already in the queue."); }}>Re-add samples</button>
            </div>
            {msg && <p role="status" className="mt-2 rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{msg}</p>}
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div><label className={LBL} htmlFor="jq">Search files</label><input id="jq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filename…" className={`${FIELD} w-44`} /></div>
              <div><label className={LBL} htmlFor="jc">Category</label><select id="jc" value={catF} onChange={(e) => setCatF(e.target.value)} className={`${FIELD} w-32`}><option>All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label className={LBL} htmlFor="js">Status</label><select id="js" value={statF} onChange={(e) => setStatF(e.target.value)} className={`${FIELD} w-32`}><option>All</option>{(["pending", "queued", "processing", "paused", "completed", "failed", "cancelled"] as const).map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <p className="ml-auto pb-1.5 text-xs text-slate-500">{shown.length} of {jobs.length} jobs · {enabledCount} of {STEPS.length} steps enabled</p>
            </div>
            <div className="mt-2 max-h-[26rem] overflow-auto rounded border border-slate-800">
              <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="px-3 py-2"><input type="checkbox" aria-label="Select all shown jobs" checked={allChecked} onChange={() => setChecked((c) => { const n = new Set(c); if (allChecked) shown.forEach((j) => n.delete(j.id)); else shown.forEach((j) => n.add(j.id)); return n; })} /></th>{["File", "Category", "Rev", "Size", "Objects", "Status", "Issues"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>{shown.map((j) => (
                  <tr key={j.id} onClick={() => { setFocus(j.id); }} aria-selected={focus === j.id} className={`cursor-pointer border-t border-slate-800 ${focus === j.id ? "bg-blue-600/20" : "hover:bg-slate-900"}`}>
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${j.file}`} checked={checked.has(j.id)} onChange={() => setChecked((c) => { const n = new Set(c); if (n.has(j.id)) n.delete(j.id); else n.add(j.id); return n; })} /></td>
                    <td className="max-w-[15rem] px-3 py-1.5"><span className="block truncate font-medium text-slate-100">{j.file}</span><span className="font-mono text-[10px] text-slate-500">{j.id} · {j.format}{j.source === "upload" ? " · uploaded" : ""}</span></td>
                    <td className="px-3 py-1.5">{j.category}</td><td className="px-3 py-1.5">{j.rev || "—"}</td><td className="px-3 py-1.5">{j.sizeMB} MB</td><td className="px-3 py-1.5">{j.objects}</td>
                    <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CHIP[j.status]}`}>{j.status}{j.status === "processing" ? ` ${j.step}/${cfg.order.length}` : ""}</span></td>
                    <td className="px-3 py-1.5">{j.status === "completed" || j.status === "failed" ? issueCount(j) : "—"}</td>
                  </tr>))}
                  {!shown.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">{jobs.length ? "No jobs match the filters." : "The queue is empty. Use “Re-add samples” to restore the sample files."}</td></tr>}</tbody></table>
            </div>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={BTN} onClick={() => download("batch-summary-sample.csv", summaryCsv(), "text/csv")}>Batch summary (.csv)</button><button type="button" className={BTN} onClick={() => download("batch-findings-sample.csv", findingsCsv(), "text/csv")}>All findings (.csv)</button><button type="button" className={BTN} onClick={() => download("batch-logs-sample.txt", logsTxt(jobs.filter((j) => j.logs.length)))}>Processing logs (.txt)</button></div>
            <h3 className={`${H3} mt-4`}>Batch activity</h3>
            <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-auto font-mono text-[11px] text-slate-400" aria-live="polite">{batchLog.map((l, i) => <li key={i}><span className="text-slate-600">{l.t}</span> {l.text}</li>)}{!batchLog.length && <li className="text-slate-600">No batch has been run yet.</li>}</ul>
          </section>

          {/* job detail */}
          <section className={`${CARD} order-3 min-w-0`} aria-label="Job detail">
            {!sel ? <><h2 className={H3}>Job detail</h2><p className="mt-3 text-xs leading-relaxed text-slate-500">Select a job in the queue to see its file information, processing steps, log, findings and report.</p></> : (
              <>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate font-display text-base font-semibold text-white">{sel.file}</h2><p className="font-mono text-[11px] text-slate-500">{sel.id} · {sel.category} · rev {sel.rev || "—"}</p></div><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CHIP[sel.status]}`}>{sel.status}</span></div>
                <div className="mt-2 flex border-b border-slate-800 text-xs">{(["overview", "log", "findings", "report"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={`flex-1 px-1 py-2 capitalize ${tab === t ? "border-b-2 border-blue-500 font-semibold text-blue-300" : "text-slate-400 hover:text-white"}`}>{t}{t === "findings" && sel.findings.length ? ` (${sel.findings.length})` : ""}</button>)}</div>
                <div className="mt-3 text-xs">
                  {tab === "overview" && (
                    <div className="space-y-3">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">{[["Format", sel.format], ["Size", `${sel.sizeMB} MB`], ["Modified", sel.modified], ["Objects", sel.objects], ["Layers", sel.layers.length], ["Units", sel.units]].map(([k, v]) => <div key={String(k)}><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-100">{v}</dd></div>)}</dl>
                      {sel.note && <p className="rounded bg-slate-950 px-3 py-2 text-slate-400">{sel.note}</p>}
                      <div><div className="flex justify-between text-slate-500"><span>Progress</span><span>{Object.keys(sel.stepStatus).length} / {cfg.order.length} steps</span></div><div className="mt-1 h-1.5 rounded bg-slate-800"><div className="h-1.5 rounded bg-blue-500" style={{ width: `${(Object.keys(sel.stepStatus).length / cfg.order.length) * 100}%` }} /></div></div>
                      <ol className="space-y-1">{cfg.order.map((k) => <li key={k} className="flex items-center gap-2"><span className={`w-4 text-center font-bold ${sel.stepStatus[k] === "done" ? "text-emerald-300" : sel.stepStatus[k] === "failed" ? "text-red-300" : "text-slate-600"}`}>{stepIcon(sel, k)}</span><span className={cfg.enabled[k] ? "text-slate-200" : "text-slate-600 line-through"}>{STEPS.find((s) => s.key === k)!.name}</span></li>)}</ol>
                      {sel.error && <p className="rounded bg-red-500/10 px-3 py-2 text-red-200">✗ {sel.error}</p>}
                      {sel.stats && <p className="rounded bg-blue-500/10 px-3 py-2 text-blue-200">{sel.stats.inspected} objects inspected on {sel.stats.layers} layers · {sel.stats.issues} issue{sel.stats.issues === 1 ? "" : "s"}</p>}
                      {sel.status === "failed" && <button type="button" className={PRIMARY} disabled={running} onClick={() => start([sel.id], "Retry")}>Retry this job</button>}
                      {(sel.status === "pending" || sel.status === "cancelled") && <button type="button" className={PRIMARY} disabled={running} onClick={() => start([sel.id], "Run job")}>Run this job</button>}
                    </div>
                  )}
                  {tab === "log" && <div><pre className="max-h-72 overflow-auto rounded bg-slate-950 p-3 font-mono text-[11px] leading-relaxed">{sel.logs.length ? sel.logs.map((l) => `${l.t} ${l.level === "error" ? "ERROR" : l.level === "warn" ? "WARN " : "INFO "} ${l.text}`).join("\n") : "This job has not been processed yet."}</pre>{sel.logs.length > 0 && <button type="button" className={`${BTN} mt-2`} onClick={() => download(`${sel.id}-log-sample.txt`, logsTxt([sel]))}>Download log</button>}</div>}
                  {tab === "findings" && (sel.findings.length ? <ul className="max-h-72 space-y-1.5 overflow-auto">{sel.findings.map((f, i) => <li key={i} className="rounded border border-slate-800 bg-slate-950 px-3 py-2"><span className={`mr-1.5 rounded px-1 text-[10px] font-semibold uppercase ${SEV[f.severity]}`}>{f.severity}</span>{f.message}<span className="block text-[10px] text-slate-500">{STEPS.find((s) => s.key === f.step)!.name}</span></li>)}</ul> : <p className="text-slate-500">{sel.status === "completed" ? "✓ No findings." : "No findings yet. Process the job to see results."}</p>)}
                  {tab === "report" && (sel.reportText ? <div><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 font-mono text-[11px] leading-relaxed">{sel.reportText}</pre><button type="button" className={`${PRIMARY} mt-2`} onClick={() => download(`${sel.id}-report-sample.txt`, sel.reportText!)}>Download job report</button></div> : <p className="text-slate-500">{sel.status === "failed" ? "No report: the job failed before the report step." : "The report is produced by the last processing step. Run the job with that step enabled."}</p>)}
                </div>
              </>
            )}
          </section>
        </div>
        <p className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] leading-snug text-slate-400">Sample queue of invented files. Processing runs in your browser: the sample jobs use stored drawing metadata, and uploaded ASCII DXF files are actually parsed. DWG files cannot be read in this demo, and nothing is sent to a server.</p>
      </div>
    </DemoShell>
  );
}
