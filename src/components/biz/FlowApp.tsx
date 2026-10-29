"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, subscribeSync, syncStatus, type Json } from "@/lib/biz/sync";
import { uid } from "@/lib/biz/util";
import type { Branding } from "@/lib/types";
import { AppProviders, Badge, BrandLogo, Btn, DemoBadge, DemoLinks, Empty, Modal, Notice, PageHead, Panel, SelectIn, Tabs, TextIn, AreaIn, useConfirm, useToast } from "./kit";

interface Step { id: string; type: string; config: Json }
interface Workflow { id: string; name: string; active: boolean; trigger: { type: string; slice?: string; coll?: string }; steps: Step[] }
interface Run { id: string; workflowId: string; workflowName: string; startedAt: string; auto: boolean; status: string; error: string; steps: { stepId: string; type: string; at: string; status: string; detail: string }[]; approvalId?: string }
interface Approval { id: string; runId: string; title: string; status: string; createdAt: string; decidedAt?: string; note: string }
interface Alert { id: string; title: string; message: string; at: string; runId: string }

const TRIGGERS = [["crm.leads", "A lead is created"], ["crm.opps", "A deal is created"], ["desk.tickets", "A ticket is created"], ["fin.invoices", "An invoice is created"], ["fin.expenses", "An expense is created"], ["hrm.leave", "A leave request is created"], ["proc.requisitions", "A requisition is created"], ["inv.movements", "A stock movement is created"], ["manual", "Run manually"]];
const STEP_TYPES: [string, string][] = [["condition", "Condition (stop unless true)"], ["create_task", "Create a CRM task"], ["set_field", "Set a field on the record"], ["create_alert", "Create an alert"], ["approval", "Ask for approval"], ["delay", "Delay (recorded, not waited for)"], ["end", "End"]];
const SAMPLE: Record<string, Json> = {
  "crm.leads": { id: "lead_test", name: "Test Buyer", status: "New", score: 70, value: 25000, createdAt: "2026-03-15" },
  "crm.opps": { id: "opp_test", name: "Test deal", value: 40000, stage: "New Lead", createdAt: "2026-03-15" },
  "desk.tickets": { id: "tkt_test", subject: "Cannot log in", channel: "Email", priority: "Urgent", status: "New" },
  "fin.invoices": { id: "inv_test", number: "INV-TEST", total: 1200 },
  "fin.expenses": { id: "exp_test", vendor: "Test vendor", amount: 450 },
  "hrm.leave": { id: "lv_test", empId: "e1", type: "Annual", days: 6, status: "Pending" },
  "proc.requisitions": { id: "req_test", number: "REQ-TEST", status: "Submitted" },
  "inv.movements": { id: "mv_test", type: "Issue", qty: -5 },
  manual: { id: "lead_test", name: "Manual test", value: 1000 },
};
const EXAMPLES = (): Workflow[] => [
  { id: uid("wf"), name: "High-value lead: task and alert", active: true, trigger: { type: "record_created", slice: "crm", coll: "leads" }, steps: [
    { id: "s1", type: "condition", config: { field: "value", op: "gte", value: 20000 } }, { id: "s2", type: "create_task", config: { subject: "Call {{name}} within two days", dueDays: 2 } }, { id: "s3", type: "create_alert", config: { title: "High-value lead: {{name}}", message: "Estimated value {{value}}" } }] },
  { id: uid("wf"), name: "Urgent ticket: needs manager approval", active: true, trigger: { type: "record_created", slice: "desk", coll: "tickets" }, steps: [
    { id: "s1", type: "condition", config: { field: "priority", op: "eq", value: "Urgent" } }, { id: "s2", type: "approval", config: { title: "Escalate “{{subject}}”" } }, { id: "s3", type: "create_alert", config: { title: "Ticket escalated: {{subject}}" } }] },
  { id: uid("wf"), name: "Large leave request: approval", active: false, trigger: { type: "record_created", slice: "hrm", coll: "leave" }, steps: [
    { id: "s1", type: "condition", config: { field: "days", op: "gt", value: 5 } }, { id: "s2", type: "approval", config: { title: "Approve {{days}} days of leave" } }] },
];
const trigKey = (t: Workflow["trigger"]) => (t.type === "manual" ? "manual" : `${t.slice}.${t.coll}`);
const tone = (s: string): "green" | "red" | "amber" | "slate" => (s === "succeeded" ? "green" : s === "failed" || s === "rejected" || s === "validation_error" ? "red" : s === "pending_approval" ? "amber" : "slate");

export default function FlowApp({ branding }: { branding: Branding }) {
  return (
    <AppProviders className="bg-slate-100 text-slate-800" note="Demonstration workflow automation. Workflows are validated rules that really create tasks, alerts and approvals and change fields in this demo's own records. Nothing is sent to any outside system (no e-mail, SMS or webhook), and delays are recorded but not waited for.">
      <Flow branding={branding} />
    </AppProviders>
  );
}

function Flow({ branding }: { branding: Branding }) {
  const sync = useSyncExternalStore(subscribeSync, syncStatus, syncStatus);
  const toast = useToast(); const confirm = useConfirm();
  const [tab, setTab] = useState("workflows");
  const [wfs, setWfs] = useState<Workflow[]>([]); const [runs, setRuns] = useState<Run[]>([]); const [apps, setApps] = useState<Approval[]>([]); const [alerts, setAlerts] = useState<Alert[]>([]);
  const [edit, setEdit] = useState<Workflow | null>(null); const [test, setTest] = useState<Workflow | null>(null); const [open, setOpen] = useState<Run | null>(null);
  const ready = sync.mode === "synced" || sync.mode === "saving";
  const load = useCallback(async () => {
    if (!ready) return;
    const g = async <T,>(c: string) => (await api<{ items: T[] }>(`/flow/${c}?limit=500`)).items;
    try { const [a, b, c, d] = await Promise.all([g<Workflow>("workflows"), g<Run>("runs"), g<Approval>("approvals"), g<Alert>("alerts")]); setWfs(a); setRuns([...b].reverse()); setApps(c); setAlerts([...d].reverse()); } catch (e) { toast((e as Error).message, "red"); }
  }, [ready, toast]);
  useEffect(() => { void load(); const f = () => void load(); window.addEventListener("erp-flow-changed", f); return () => window.removeEventListener("erp-flow-changed", f); }, [load]);
  const guard = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast(ok); await load(); } catch (e) { toast((e as Error).message, "red"); } };
  const pending = apps.filter((a) => a.status === "Pending");

  return (<>
    <header className="no-print border-b border-slate-700 bg-slate-900 text-slate-100">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
        <BrandLogo branding={branding} height={28} />
        <div className="border-l border-slate-600 pl-5"><h1 className="font-display text-xl font-semibold text-white">NorthPeak Flow</h1><p className="text-sm text-slate-300">Rule-based workflow automation · fictional data</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2"><DemoBadge text="Demonstration · needs the demo server" /><DemoLinks compact /></div>
      </div>
      <nav className="mx-auto max-w-[1400px] px-5"><Tabs value={tab} onChange={setTab} tabs={[{ id: "workflows", label: "Workflows", count: wfs.length }, { id: "runs", label: "Execution log", count: runs.length }, { id: "approvals", label: "Approvals", count: pending.length }, { id: "alerts", label: "Alerts", count: alerts.length }]} /></nav>
    </header>
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6" id="app-main">
      {!ready && <Panel><p className="text-[15px]" data-testid="flow-needs-server"><Badge tone="amber">Requires backend</Badge> The workflow engine runs on the demo server so that its actions really change stored records. {sync.mode === "local" ? "No business API is configured for this site (BIZ_API_URL), so this demo is not functional here." : sync.mode === "connecting" ? "Connecting…" : `The server is not available: ${sync.message}`}</p></Panel>}
      {ready && tab === "workflows" && <>
        <PageHead title="Workflows" sub="A workflow starts when a record is created (or manually) and runs its steps in order." actions={<><Btn onClick={() => guard(async () => { for (const w of EXAMPLES()) await api("/flow/workflows", { method: "POST", body: JSON.stringify(w) }); }, "Example workflows added")} testid="add-examples">Add example workflows</Btn><Btn kind="primary" testid="new-workflow" onClick={() => setEdit({ id: uid("wf"), name: "", active: false, trigger: { type: "manual" }, steps: [] })}>New workflow</Btn></>} />
        {!wfs.length ? <Empty>No workflows yet. Create one, or add the example workflows.</Empty> : (
          <div className="grid gap-3 md:grid-cols-2" data-testid="workflow-list">{wfs.map((w) => (
            <Panel key={w.id} title={<span data-testid="wf-name">{w.name}</span>} actions={<Badge tone={w.active ? "green" : "slate"}>{w.active ? "Active" : "Inactive"}</Badge>}>
              <p className="text-sm text-slate-600">Trigger: {TRIGGERS.find((t) => t[0] === trigKey(w.trigger))?.[1]} · {w.steps.length} step{w.steps.length === 1 ? "" : "s"}</p>
              <ol className="mt-2 list-decimal pl-5 text-sm text-slate-700">{w.steps.map((s) => <li key={s.id}>{STEP_TYPES.find((t) => t[0] === s.type)?.[1]}</li>)}</ol>
              <p className="mt-2 text-xs text-slate-500">Last run: {runs.find((r) => r.workflowId === w.id)?.status.replace(/_/g, " ") ?? "never"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn small onClick={() => setEdit(w)}>Edit</Btn><Btn small onClick={() => setTest(w)} testid="test-run">Test run</Btn>
                <Btn small onClick={() => guard(() => api(`/flow/workflows/${w.id}`, { method: "PATCH", body: JSON.stringify({ active: !w.active }) }), w.active ? "Workflow deactivated" : "Workflow activated")} testid="toggle-active">{w.active ? "Deactivate" : "Activate"}</Btn>
                <Btn small kind="danger" onClick={async () => { if (await confirm(`Delete the workflow “${w.name}”? Its past runs stay in the log.`)) await guard(() => api(`/flow/workflows/${w.id}`, { method: "DELETE" }), "Workflow deleted"); }}>Delete</Btn>
              </div>
            </Panel>))}</div>)}
        <p className="mt-4 text-sm text-slate-600">Active workflows run automatically when you create a matching record in the other demos (for example a lead in CRM or a ticket in Helpdesk) while the demo server is connected.</p>
      </>}
      {ready && tab === "runs" && <>
        <PageHead title="Execution log" sub="Every step records what really happened." />
        {!runs.length ? <Empty>Nothing has run yet.</Empty> : <div className="space-y-2" data-testid="run-list">{runs.map((r) => (
          <Panel key={r.id}><div className="flex flex-wrap items-center gap-3"><Badge tone={tone(r.status)}>{r.status.replace(/_/g, " ")}</Badge><span className="font-medium">{r.workflowName}</span><span className="text-xs text-slate-500">{r.startedAt} · {r.auto ? "automatic" : "manual test"}</span>
            <span className="ml-auto flex gap-2"><Btn small onClick={() => setOpen(r)} testid="run-details">Details</Btn>{r.status === "failed" && <Btn small testid="retry" onClick={() => guard(() => api(`/flow/runs/${r.id}/retry`, { method: "POST" }), "Retried")}>Retry</Btn>}</span></div>
            {r.error && <p className="mt-1 text-sm text-red-700">{r.error}</p>}</Panel>))}</div>}
      </>}
      {ready && tab === "approvals" && <>
        <PageHead title="Approvals" sub="A run waits at an approval step until someone decides." />
        {!apps.length ? <Empty>No approvals yet.</Empty> : <div className="space-y-2" data-testid="approval-list">{[...apps].reverse().map((a) => (
          <Panel key={a.id}><div className="flex flex-wrap items-center gap-3"><Badge tone={a.status === "Pending" ? "amber" : a.status === "Approved" ? "green" : "red"}>{a.status}</Badge><span className="font-medium">{a.title}</span><span className="text-xs text-slate-500">{a.createdAt}</span>
            {a.status === "Pending" ? <span className="ml-auto flex gap-2"><Btn small kind="primary" testid="approve" onClick={() => guard(() => api(`/flow/approvals/${a.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "approve" }) }), "Approved. The run continued.")}>Approve</Btn><Btn small kind="danger" testid="reject" onClick={() => guard(() => api(`/flow/approvals/${a.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "reject" }) }), "Rejected. The run was stopped.")}>Reject</Btn></span> : <span className="ml-auto text-xs text-slate-500">Decided {a.decidedAt}</span>}</div></Panel>))}</div>}
      </>}
      {ready && tab === "alerts" && <>
        <PageHead title="Alerts" sub="Alerts created by workflow steps. They are shown here only; nothing is sent." />
        {!alerts.length ? <Empty>No alerts yet.</Empty> : <ul className="space-y-2" data-testid="alert-list">{alerts.map((a) => <li key={a.id}><Panel><p className="font-medium">{a.title}</p>{a.message && <p className="text-sm text-slate-600">{a.message}</p>}<p className="text-xs text-slate-500">{a.at}</p></Panel></li>)}</ul>}
      </>}
    </main>
    {edit && <Builder wf={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load(); toast("Workflow saved"); }} />}
    {test && <TestRun wf={test} onClose={() => setTest(null)} onDone={async (r) => { setTest(null); setOpen(r); await load(); }} />}
    {open && <Modal title={`${open.workflowName}: ${open.status.replace(/_/g, " ")}`} onClose={() => setOpen(null)} wide footer={<Btn onClick={() => setOpen(null)}>Close</Btn>}>
      {open.error && <Notice tone="red">{open.error}</Notice>}
      <ol className="mt-3 space-y-2" data-testid="step-log">{open.steps.map((s) => <li key={s.stepId} className="flex flex-wrap gap-2 text-sm"><Badge tone={s.status === "ok" ? "green" : s.status === "failed" || s.status === "rejected" ? "red" : s.status === "waiting" ? "amber" : "slate"}>{s.status.replace(/_/g, " ")}</Badge><b>{STEP_TYPES.find((t) => t[0] === s.type)?.[1] ?? s.type}</b><span className="text-slate-600">{s.detail}</span></li>)}</ol>
    </Modal>}
  </>);
}

function Builder({ wf, onClose, onSaved }: { wf: Workflow; onClose(): void; onSaved(): void }) {
  const [w, setW] = useState<Workflow>(JSON.parse(JSON.stringify(wf)) as Workflow); const [errs, setErrs] = useState<string[]>([]); const toast = useToast();
  const isNew = !wf.name;
  const setStep = (i: number, p: Partial<Step>) => setW({ ...w, steps: w.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const cfg = (i: number, k: string, v: unknown) => setStep(i, { config: { ...w.steps[i].config, [k]: v } });
  const save = async () => {
    try {
      const v = await api<{ valid: boolean; errors: string[] }>("/flow/validate", { method: "POST", body: JSON.stringify(w) });
      if (!v.valid) { setErrs(v.errors); return; }
      if (isNew) await api("/flow/workflows", { method: "POST", body: JSON.stringify(w) }); else await api(`/flow/workflows/${w.id}`, { method: "PUT", body: JSON.stringify(w) });
      onSaved();
    } catch (e) { toast((e as Error).message, "red"); }
  };
  return (
    <Modal title={isNew ? "New workflow" : "Edit workflow"} onClose={onClose} wide footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-workflow">Validate and save</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextIn label="Name" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} data-testid="wf-name-input" />
        <SelectIn label="Trigger" value={trigKey(w.trigger)} onChange={(e) => setW({ ...w, trigger: e.target.value === "manual" ? { type: "manual" } : { type: "record_created", slice: e.target.value.split(".")[0], coll: e.target.value.split(".")[1] } })} options={TRIGGERS.map(([v, l]) => ({ value: v, label: l }))} data-testid="trigger-select" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">Steps</h3>
      <div className="mt-2 space-y-3" data-testid="steps">{w.steps.map((s, i) => (
        <div key={s.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="step">
          <div className="flex flex-wrap items-end gap-2"><span className="pb-2 text-sm font-semibold">{i + 1}.</span>
            <SelectIn label="Step type" value={s.type} onChange={(e) => setStep(i, { type: e.target.value, config: {} })} options={STEP_TYPES.map(([v, l]) => ({ value: v, label: l }))} className="min-w-56" data-testid="step-type" />
            <Btn small disabled={i === 0} onClick={() => { const a = [...w.steps]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setW({ ...w, steps: a }); }}>Up</Btn>
            <Btn small kind="danger" onClick={() => setW({ ...w, steps: w.steps.filter((_, j) => j !== i) })}>Remove</Btn></div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {s.type === "condition" && <><TextIn label="Field" value={String(s.config.field ?? "")} onChange={(e) => cfg(i, "field", e.target.value)} data-testid="cond-field" /><SelectIn label="Operator" value={String(s.config.op ?? "eq")} onChange={(e) => cfg(i, "op", e.target.value)} options={["eq", "ne", "gt", "gte", "lt", "lte", "contains", "exists"]} data-testid="cond-op" /><TextIn label="Value" value={String(s.config.value ?? "")} onChange={(e) => { const n = Number(e.target.value); cfg(i, "value", e.target.value !== "" && !Number.isNaN(n) ? n : e.target.value); }} data-testid="cond-value" /></>}
            {s.type === "create_task" && <><TextIn label="Task subject (use {{field}})" value={String(s.config.subject ?? "")} onChange={(e) => cfg(i, "subject", e.target.value)} className="sm:col-span-2" data-testid="task-subject" /><TextIn label="Due in days" type="number" value={String(s.config.dueDays ?? 0)} onChange={(e) => cfg(i, "dueDays", Number(e.target.value))} /></>}
            {s.type === "set_field" && <><SelectIn label="Record type" value={`${s.config.slice ?? "crm"}.${s.config.coll ?? "leads"}`} onChange={(e) => setStep(i, { config: { ...s.config, slice: e.target.value.split(".")[0], coll: e.target.value.split(".")[1] } })} options={["crm.leads", "crm.opps", "desk.tickets", "hrm.leave", "proc.requisitions"]} /><TextIn label="Field" value={String(s.config.field ?? "")} onChange={(e) => cfg(i, "field", e.target.value)} /><TextIn label="New value" value={String(s.config.value ?? "")} onChange={(e) => cfg(i, "value", e.target.value)} /></>}
            {s.type === "create_alert" && <><TextIn label="Title" value={String(s.config.title ?? "")} onChange={(e) => cfg(i, "title", e.target.value)} className="sm:col-span-2" data-testid="alert-title" /><TextIn label="Message" value={String(s.config.message ?? "")} onChange={(e) => cfg(i, "message", e.target.value)} /></>}
            {s.type === "approval" && <TextIn label="Approval title" value={String(s.config.title ?? "")} onChange={(e) => cfg(i, "title", e.target.value)} className="sm:col-span-3" data-testid="approval-title" />}
            {s.type === "delay" && <TextIn label="Days (recorded, not waited for)" type="number" value={String(s.config.days ?? 1)} onChange={(e) => cfg(i, "days", Number(e.target.value))} />}
          </div>
        </div>))}</div>
      <Btn className="mt-3" onClick={() => setW({ ...w, steps: [...w.steps, { id: `s${w.steps.length + 1}${Math.floor(Math.random() * 90 + 10)}`, type: "condition", config: {} }] })} testid="add-step">Add step</Btn>
      {errs.length > 0 && <div className="mt-3" data-testid="validation-errors"><Notice tone="red">{errs.map((e) => <span key={e} className="block">{e}</span>)}</Notice></div>}
    </Modal>
  );
}

function TestRun({ wf, onClose, onDone }: { wf: Workflow; onClose(): void; onDone(r: Run): void }) {
  const [text, setText] = useState(JSON.stringify(SAMPLE[trigKey(wf.trigger)], null, 2)); const [err, setErr] = useState(""); const toast = useToast();
  const go = async () => {
    let payload: unknown; try { payload = JSON.parse(text); } catch { setErr("The sample record must be valid JSON."); return; }
    try { onDone(await api<Run>(`/flow/workflows/${wf.id}/run`, { method: "POST", body: JSON.stringify({ payload }) })); } catch (e) { toast((e as Error).message, "red"); }
  };
  return (
    <Modal title={`Test run: ${wf.name}`} onClose={onClose} wide footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={go} testid="run-now">Run now</Btn></>}>
      <Notice tone="blue">A test run executes the real steps: tasks, alerts and approvals are created in this workspace. The record below is only the input; it is not stored unless a step changes an existing record.</Notice>
      <AreaIn label="Sample record (JSON)" rows={9} value={text} onChange={(e) => { setText(e.target.value); setErr(""); }} error={err} className="mt-3" data-testid="payload" />
    </Modal>
  );
}
