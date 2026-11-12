"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, Field, PageTitle, useToast } from "@/components/admin/ui";
import { ACTION_HELP, ACTION_TYPES, configSchema, type ActionType, type ConfigRecord, type DemoEntry, type WtConfig, type WtStep } from "@/lib/walkthrough/schema";
import WalkthroughStage from "./Stage";

type Row = { entry: DemoEntry; record: ConfigRecord };
const CHIP = "rounded px-1.5 py-0.5 text-[11px] font-semibold";
let uid = 0;
const newStep = (): WtStep => ({ id: `n${Date.now().toString(36)}${uid++}`, title: "New step", subtitle: "Describe what this part of the interface does.", durationMs: 5000, target: "", actions: [], badge: "live" });

export default function Manager() {
  const [rows, setRows] = useState<Row[]>([]), [storage, setStorage] = useState(true), [sel, setSel] = useState<string>(""), [draft, setDraft] = useState<WtConfig | null>(null), [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"run" | "edit">("run"), [q, setQ] = useState(""), [mode, setMode] = useState<"auto" | "manual" | undefined>(), [startAt, setStartAt] = useState<number | undefined>(), [runKey, setRunKey] = useState(0), [busy, setBusy] = useState(false), [errs, setErrs] = useState<string[]>([]);
  const toast = useToast();
  const load = useCallback(() => api<{ demos: Row[]; storage: boolean }>("/api/admin/walkthroughs").then((r) => { setRows(r.demos); setStorage(r.storage); return r.demos; }).catch((e) => { toast.err(e); return [] as Row[]; }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load().then((d) => { if (d[0]) pick(d[0], d); }); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = rows.find((r) => r.entry.key === sel);
  function pick(r: Row, _all?: Row[]) { void _all; if (dirty && !confirm("Discard unsaved changes to this walkthrough?")) return; setSel(r.entry.key); setDraft(structuredClone(r.record.config)); setDirty(false); setMode(undefined); setStartAt(undefined); setRunKey((k) => k + 1); setErrs([]); }
  const edit = (fn: (c: WtConfig) => void) => { if (!draft) return; const c = structuredClone(draft); fn(c); setDraft(c); setDirty(true); };
  const editStep = (i: number, fn: (s: WtStep) => void) => edit((c) => fn(c.steps[i]));
  const move = (i: number, d: -1 | 1) => edit((c) => { const j = i + d; if (j < 0 || j >= c.steps.length) return; [c.steps[i], c.steps[j]] = [c.steps[j], c.steps[i]]; });
  async function save() {
    if (!draft || !cur) return; const p = configSchema.safeParse(draft);
    if (!p.success) { setErrs(p.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`)); return toast.err(new Error("Fix the highlighted problems first")); }
    setErrs([]); setBusy(true);
    try { await api(`/api/admin/walkthroughs/${cur.entry.key}`, "PUT", p.data); toast.ok("Walkthrough saved"); setDirty(false); const d = await load(); const r = d.find((x) => x.entry.key === cur.entry.key); if (r) setDraft(structuredClone(r.record.config)); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  async function reset() {
    if (!cur || !confirm("Reset this walkthrough to the built-in version? Your saved edits for it will be removed.")) return; setBusy(true);
    try { await api(`/api/admin/walkthroughs/${cur.entry.key}`, "DELETE"); toast.ok("Reset to the built-in walkthrough"); const d = await load(); const r = d.find((x) => x.entry.key === cur.entry.key); if (r) setDraft(structuredClone(r.record.config)); setDirty(false); setRunKey((k) => k + 1); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  const groups = useMemo(() => { const f = rows.filter((r) => (r.entry.title + " " + r.entry.group + " " + r.entry.no).toLowerCase().includes(q.toLowerCase())); const g = new Map<string, Row[]>(); f.forEach((r) => g.set(r.entry.group, [...(g.get(r.entry.group) ?? []), r])); return [...g.entries()]; }, [rows, q]);
  const run = (m: "auto" | "manual", at?: number) => { setMode(m); setStartAt(at); setTab("run"); setRunKey((k) => k + 1); };

  return (
    <>
      <PageTitle title="Demo Walkthrough Manager" />
      <p className="mb-4 max-w-3xl text-sm text-paper/70">Private to administrators. Pick any demo, then walk through its interface automatically or step by step with subtitles and highlights. Visitors never see this tool and the public demos are unchanged. You record the screen yourself.</p>
      {!storage && <p className="mb-4 border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="wt-nostorage">Saving is unavailable on this server (storage is not configured), so edits can be previewed but not kept. Built-in walkthroughs still work.</p>}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="max-h-[78vh] overflow-auto !p-3" >
          <input className="field mb-3" placeholder="Search demos" aria-label="Search demos" value={q} onChange={(e) => setQ(e.target.value)} data-testid="wt-search" />
          {groups.map(([g, list]) => <div key={g} className="mb-3"><p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-paper/45">{g}</p>
            <ul>{list.map((r) => <li key={r.entry.key}><button type="button" onClick={() => pick(r)} data-testid={`wt-demo-${r.entry.key}`} aria-current={sel === r.entry.key} className={`w-full px-2 py-1.5 text-left text-sm ${sel === r.entry.key ? "bg-forge text-white" : "hover:bg-paper/10"}`}><span className="text-paper/50">{r.entry.no}</span> {r.entry.title}
              <span className="mt-0.5 flex flex-wrap gap-1">{r.record.source === "custom" && <span className={`${CHIP} bg-cyan-500/20 text-cyan-200`}>Edited</span>}{!r.record.config.enabled && <span className={`${CHIP} bg-slate-500/30 text-slate-200`}>Disabled</span>}{r.record.quality === "draft" && <span className={`${CHIP} bg-amber-500/20 text-amber-200`}>Draft</span>}{r.record.quality === "partial" && <span className={`${CHIP} bg-amber-500/20 text-amber-200`}>Partly checked</span>}<span className="text-[11px] text-paper/40">{r.record.config.steps.length} steps</span></span></button></li>)}</ul></div>)}
          {!rows.length && <p className="text-sm text-paper/50">Loading demos…</p>}
        </Card>

        <div className="min-w-0 space-y-4">
          {cur && draft ? <>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold" data-testid="wt-title">{cur.entry.title}</h2><p className="text-xs text-paper/50">{cur.entry.appPath} · {cur.record.quality === "verified" ? "built-in steps checked against the real interface" : cur.record.quality === "partial" ? "start screen checked; the later steps need the demo's server back-end, so run it once to confirm" : "draft generated from the demo's description: review before use"}{dirty ? " · unsaved changes" : ""}</p></div>
                <div className="flex flex-wrap gap-2"><button type="button" className={tab === "run" ? "btn-primary !py-2" : "btn-ghost !py-2"} onClick={() => setTab("run")} data-testid="wt-tab-run">Run</button><button type="button" className={tab === "edit" ? "btn-primary !py-2" : "btn-ghost !py-2"} onClick={() => setTab("edit")} data-testid="wt-tab-edit">Edit steps</button></div>
              </div>
              {!draft.enabled && <p className="mt-2 text-sm text-amber-300">This walkthrough is disabled. You can still preview it here.</p>}
            </Card>
            {tab === "run" && <>
              <Card className="!p-3"><div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-paper/60">Mode:</span>
                <button type="button" className="btn-primary !py-2" onClick={() => run("auto")} data-testid="wt-run-auto">Start Automated Walkthrough</button><button type="button" className="btn-ghost !py-2" onClick={() => run("manual")} data-testid="wt-run-manual">Start Manual Walkthrough</button>
                <span className="text-xs text-paper/50">Automated runs the steps by itself. Manual shows each step when you press Next, and you can click the demo at any time.</span></div></Card>
              <WalkthroughStage key={`${sel}-${runKey}`} demoPath={cur.entry.appPath} demoTitle={cur.entry.title} config={draft} autoStart={mode} startAt={startAt} />
              <p className="text-xs text-paper/50">Steps marked “Prepared presentation data” show a bundled sample state, not a new processing result. Risky buttons (delete, send, pay, save, create…) are never clicked and write requests are blocked while a walkthrough runs{draft.sandboxApi ? ", except the demo's own anonymous sample project" : ""}.</p>
            </>}
            {tab === "edit" && <Editor draft={draft} edit={edit} editStep={editStep} move={move} run={run} save={save} reset={reset} busy={busy} dirty={dirty} errs={errs} storage={storage} source={cur.record.source} />}
          </> : <Card><p className="text-sm text-paper/60">Select a demo.</p></Card>}
        </div>
      </div>
      {toast.el}
    </>
  );
}

function Editor({ draft, edit, editStep, move, run, save, reset, busy, dirty, errs, storage, source }: { draft: WtConfig; edit: (f: (c: WtConfig) => void) => void; editStep: (i: number, f: (s: WtStep) => void) => void; move: (i: number, d: -1 | 1) => void; run: (m: "auto" | "manual", at?: number) => void; save: () => void; reset: () => void; busy: boolean; dirty: boolean; errs: string[]; storage: boolean; source: string }) {
  return (
    <div className="space-y-4" data-testid="wt-editor">
      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Walkthrough title"><input className="field" value={draft.title} onChange={(e) => edit((c) => { c.title = e.target.value; })} data-testid="ed-title" /></Field>
          <Field label="Introduction shown for (seconds)"><input type="number" min={1.5} max={30} step={0.5} className="field" value={draft.introMs / 1000} onChange={(e) => edit((c) => { c.introMs = Math.round(Number(e.target.value) * 1000); })} /></Field>
        </div>
        <Field label="Project introduction"><textarea rows={2} className="field" value={draft.intro} onChange={(e) => edit((c) => { c.intro = e.target.value; })} data-testid="ed-intro" /></Field>
        <Field label="Completion message"><input className="field" value={draft.completion} onChange={(e) => edit((c) => { c.completion = e.target.value; })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(e) => edit((c) => { c.enabled = e.target.checked; })} data-testid="ed-enabled" /> Walkthrough enabled</label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={draft.sandboxApi} onChange={(e) => edit((c) => { c.sandboxApi = e.target.checked; })} /><span>Let the demo create its own anonymous sample project<span className="block text-xs text-paper/50">Needed by the CAD/BIM suite demos 11–21 to open a sample. Allows POST/PUT/PATCH to /api/bim and /api/cctv only; deletes, contact, chat, tracking and admin requests stay blocked.</span></span></label>
      </Card>
      {draft.steps.map((s, i) => (
        <Card key={s.id} className="space-y-2" >
          <div data-testid={`ed-step-${i}`}>
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-paper/60">Step {i + 1}</span>
              <input aria-label={`Step ${i + 1} title`} className="field !w-auto min-w-0 flex-1" value={s.title} onChange={(e) => editStep(i, (x) => { x.title = e.target.value; })} data-testid={`ed-step-title-${i}`} />
              <button type="button" className="btn-ghost !px-2 !py-1.5" aria-label={`Move step ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0} data-testid={`ed-up-${i}`}>↑</button>
              <button type="button" className="btn-ghost !px-2 !py-1.5" aria-label={`Move step ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === draft.steps.length - 1} data-testid={`ed-down-${i}`}>↓</button>
              <button type="button" className="btn-ghost !px-2 !py-1.5" onClick={() => run("manual", i)} data-testid={`ed-test-${i}`}>Test step</button>
              <button type="button" className="btn-ghost !px-2 !py-1.5" onClick={() => edit((c) => { c.steps.splice(i + 1, 0, { ...structuredClone(s), id: newStep().id }); })}>Duplicate</button>
              <button type="button" className="btn-ghost !px-2 !py-1.5 text-red-400" onClick={() => { if (confirm("Delete this step from the walkthrough?")) edit((c) => { c.steps.splice(i, 1); }); }} data-testid={`ed-del-${i}`}>Delete</button></div>
            <textarea aria-label={`Step ${i + 1} subtitle`} rows={2} className="field mt-2" value={s.subtitle} onChange={(e) => editStep(i, (x) => { x.subtitle = e.target.value; })} placeholder="Subtitle shown to the audience" data-testid={`ed-sub-${i}`} />
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px_200px]">
              <Field label="Highlight (selector)" hint="tid:id, tour:id, tab:Label, btn:Label, nav:Label, text:Label or CSS"><input className="field" value={s.target} onChange={(e) => editStep(i, (x) => { x.target = e.target.value; })} data-testid={`ed-target-${i}`} /></Field>
              <Field label="Seconds"><input type="number" min={1} max={60} step={0.5} className="field" value={s.durationMs / 1000} onChange={(e) => editStep(i, (x) => { x.durationMs = Math.round(Number(e.target.value) * 1000); })} data-testid={`ed-dur-${i}`} /></Field>
              <Field label="Data shown"><select className="field" value={s.badge} onChange={(e) => editStep(i, (x) => { x.badge = e.target.value as "live" | "prepared"; })}><option value="live">Live demo</option><option value="prepared">Prepared presentation data</option></select></Field></div>
            <div className="mt-2 space-y-1.5">{s.actions.map((a, k) => (
              <div key={k} className="grid gap-1.5 sm:grid-cols-[150px_1fr_1fr_auto_auto]" data-testid={`ed-action-${i}-${k}`}>
                <select aria-label="Action" className="field" value={a.t} title={ACTION_HELP[a.t]} onChange={(e) => editStep(i, (x) => { x.actions[k].t = e.target.value as ActionType; })}>{ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <input aria-label="Action target" className="field" placeholder="Target selector" value={a.sel} onChange={(e) => editStep(i, (x) => { x.actions[k].sel = e.target.value; })} />
                <input aria-label="Action value" className="field" placeholder="Value (option, path or wait ms)" value={a.value} onChange={(e) => editStep(i, (x) => { x.actions[k].value = e.target.value; })} />
                <label className="flex items-center gap-1 text-[11px] text-paper/60" title="Click even if the label looks like a change. Delete, send, pay and publish are still refused."><input type="checkbox" checked={a.allow} onChange={(e) => editStep(i, (x) => { x.actions[k].allow = e.target.checked; })} />allow</label>
                <button type="button" className="btn-ghost !px-2 !py-1.5" aria-label="Remove action" onClick={() => editStep(i, (x) => { x.actions.splice(k, 1); })}>✕</button></div>))}
              <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => editStep(i, (x) => { x.actions.push({ t: "click", sel: "", value: "", allow: false }); })} data-testid={`ed-addaction-${i}`}>+ Add action</button></div>
          </div>
        </Card>))}
      <Card>
        {errs.length > 0 && <ul className="mb-3 text-sm text-red-400" data-testid="ed-errors">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost !py-2" onClick={() => edit((c) => { c.steps.push(newStep()); })} data-testid="ed-addstep">+ Add step</button>
          <button type="button" className="btn-primary !py-2" onClick={save} disabled={busy || !dirty || !storage} data-testid="ed-save">Save walkthrough</button>
          <button type="button" className="btn-ghost !py-2" onClick={() => run("auto")} data-testid="ed-preview">Preview automated run</button>
          <button type="button" className="btn-ghost !py-2" onClick={reset} disabled={busy || source !== "custom"} data-testid="ed-reset">Reset to built-in</button></div>
        {!storage && <p className="mt-2 text-xs text-amber-300">Saving is unavailable on this server; edits stay in this page until you leave it.</p>}
      </Card>
    </div>
  );
}
