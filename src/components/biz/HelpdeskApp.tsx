"use client";
import { useMemo, useState } from "react";
import { logActivity, resetDb, useSlice } from "@/lib/biz/db";
import { atRisk, isOpen, overdue } from "@/lib/biz/desk-calc";
import { AGENT_IDS, CATEGORIES, SLA_HOURS, type TMsg, type TPriority, type TStatus, type Ticket } from "@/lib/biz/seed-desk";
import { DEMO_NOW, addDays, addHours, downloadCsv, fmtDt, fmtHours, groupBy, hoursBetween, pct, round2, sum, uid } from "@/lib/biz/util";
import type { Branding } from "@/lib/types";
import { AppProviders, AreaIn, Avatar, Badge, BarChart, BrandLogo, Btn, DataTable, DemoBadge, DemoLinks, Donut, Drawer, Empty, FilterSelect, HBars, Kanban, Kpi, KpiRow, Modal, Notice, PageHead, Panel, Progress, ResetButton, SelectIn, TextIn, Timeline, useToast, type Col } from "./kit";

/* Support console: three side-by-side panels (queue, conversation, customer context) that fill the screen, like an agent workstation. Below desktop width they become switchable tabs. */
const VIEWS = [{ id: "console", label: "Console" }, { id: "queues", label: "Priority board" }, { id: "agents", label: "Agents" }, { id: "customers", label: "Customers" }, { id: "sla", label: "SLA" }, { id: "analytics", label: "Analytics" }, { id: "history", label: "History" }];
const STATUSES: TStatus[] = ["New", "Open", "Pending customer", "Resolved", "Closed"]; const PRIOS: TPriority[] = ["Urgent", "High", "Normal", "Low"]; const CHANNELS = ["Email", "Chat", "Phone", "Portal"];
const prTone = (p: TPriority) => (p === "Urgent" ? "red" : p === "High" ? "amber" : p === "Normal" ? "blue" : "slate") as "red" | "amber" | "blue" | "slate";
const stTone = (s: TStatus) => (s === "Resolved" || s === "Closed" ? "green" : s === "New" ? "violet" : s === "Pending customer" ? "amber" : "blue") as "green" | "violet" | "amber" | "blue";
const firstResponse = (t: Ticket) => { const a = t.messages.find((m) => m.kind === "agent"); return a ? hoursBetween(t.created, a.at) : null; };
const resolvedHours = (t: Ticket) => (t.resolution ? hoursBetween(t.created, t.resolution.at) : null);
const ME = "e24";

export default function HelpdeskApp({ branding }: { branding: Branding }) {
  return (
    <AppProviders className="bg-slate-200 text-slate-800" note="Demonstration helpdesk with fictional customers and conversations. Replies and notes are stored only in this browser: no message is sent to any real customer. Overdue status is calculated against the demo time shown above. No server or shared database.">
      <Desk branding={branding} />
    </AppProviders>
  );
}
function Desk({ branding }: { branding: Branding }) {
  const { desk } = useDesk(); const [screen, setScreen] = useState("console"); const [tid, setTid] = useState<string | null>(null); const [form, setForm] = useState(false);
  const od = desk.tickets.filter(overdue).length, risk = desk.tickets.filter(atRisk).length, open = desk.tickets.filter(isOpen).length;
  const openTicket = (id: string) => { setTid(id); setScreen("console"); };
  return (<>
    <header className="no-print bg-slate-900 text-slate-100">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <BrandLogo branding={branding} height={28} />
        <div><h1 className="font-display text-lg font-semibold leading-tight text-white">NorthPeak Helpdesk</h1><p className="text-sm leading-tight text-slate-300">Support console · demo time {fmtDt(DEMO_NOW)}</p></div>
        <p className="flex flex-wrap items-center gap-3 text-[15px]" aria-label="Queue health"><span>{open} open</span><span className={od ? "font-semibold text-red-300" : ""} data-testid="hd-overdue">{od} overdue</span><span className={risk ? "text-amber-300" : ""}>{risk} at risk</span></p>
        <div className="ml-auto flex flex-wrap items-center gap-2"><Btn kind="primary" onClick={() => setForm(true)} testid="new-ticket">+ New ticket</Btn><DemoBadge /><ResetButton onReset={() => resetDb(["desk"])} /><DemoLinks compact /></div>
      </div>
      <nav aria-label="Helpdesk views" className="flex flex-wrap gap-1 border-t border-slate-700 px-3 py-1.5">
        {VIEWS.map((v) => <button key={v.id} type="button" data-nav={v.id} aria-current={screen === v.id ? "page" : undefined} onClick={() => setScreen(v.id)} className={`rounded-md px-3.5 py-1.5 text-[15px] ${screen === v.id ? "bg-white font-semibold text-slate-900" : "text-slate-200 hover:bg-slate-800"}`}>{v.label}</button>)}
      </nav>
    </header>
    <main className="min-w-0 flex-1 p-3 sm:p-4" id="app-main">
      {screen === "console" && <Console tid={tid} setTid={setTid} />}
      {screen === "queues" && <Queues open={openTicket} />}
      {screen === "agents" && <Agents open={openTicket} />}
      {screen === "customers" && <Customers open={openTicket} />}
      {screen === "sla" && <Sla open={openTicket} />}
      {screen === "analytics" && <Analytics />}
      {screen === "history" && <History open={openTicket} />}
    </main>
    {form && <TicketForm onClose={() => setForm(false)} onCreated={openTicket} />}
  </>);
}
function useDesk() {
  const [desk, setDesk] = useSlice("desk"); const [hrm] = useSlice("hrm"); const [crm] = useSlice("crm");
  const agents = hrm.employees.filter((e) => AGENT_IDS.includes(e.id)); const aName = (id: string) => hrm.employees.find((e) => e.id === id)?.name ?? "Unassigned";
  const contact = (id: string) => crm.contacts.find((c) => c.id === id); const cName = (id: string) => contact(id)?.name ?? "Unknown customer"; const coName = (id: string) => crm.companies.find((c) => c.id === contact(id)?.companyId)?.name ?? "";
  const patch = (id: string, fn: (t: Ticket) => Ticket) => setDesk((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === id ? fn(t) : t)) }));
  return { desk, setDesk, hrm, crm, agents, aName, contact, cName, coName, patch };
}
const SlaBadge = ({ t }: { t: Ticket }) => (overdue(t) ? <Badge tone="red">Overdue {fmtHours(hoursBetween(t.due, DEMO_NOW))}</Badge> : atRisk(t) ? <Badge tone="amber">Due in {fmtHours(hoursBetween(DEMO_NOW, t.due))}</Badge> : isOpen(t) ? <Badge tone="green">Due {fmtDt(t.due)}</Badge> : <Badge>{t.resolution && t.resolution.at <= t.due ? "Met SLA" : "Missed SLA"}</Badge>);

/* ───────── Dashboard ───────── */

/* ───────── Console: queue | conversation | context ───────── */
const QUEUES = [{ id: "mine", label: "Mine" }, { id: "open", label: "All open" }, { id: "overdue", label: "Overdue" }, { id: "waiting", label: "Waiting" }, { id: "done", label: "Resolved" }];
function Console({ tid, setTid }: { tid: string | null; setTid(id: string | null): void }) {
  const { desk, cName, coName, aName } = useDesk(); const [queue, setQueue] = useState("open"); const [q, setQ] = useState(""); const [pri, setPri] = useState(""); const [pane, setPane] = useState("queue");
  const list = useMemo(() => desk.tickets.filter((t) => (queue === "mine" ? isOpen(t) && t.assigneeId === ME : queue === "open" ? isOpen(t) : queue === "overdue" ? overdue(t) : queue === "waiting" ? t.status === "Pending customer" : !isOpen(t)) && (!pri || t.priority === pri) && (!q || `${t.number} ${t.subject} ${cName(t.contactId)} ${coName(t.contactId)}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (queue === "done" ? b.updated.localeCompare(a.updated) : a.due.localeCompare(b.due))), [desk.tickets, queue, q, pri]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = desk.tickets.find((t) => t.id === tid) ?? list[0];
  const count = (id: string) => desk.tickets.filter((t) => (id === "mine" ? isOpen(t) && t.assigneeId === ME : id === "open" ? isOpen(t) : id === "overdue" ? overdue(t) : id === "waiting" ? t.status === "Pending customer" : !isOpen(t))).length;
  const panel = "flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-400 bg-white shadow-sm";
  return (<>
    <div className="no-print mb-3 flex gap-1 lg:hidden" role="tablist" aria-label="Console panels">{[["queue", "Queue"], ["thread", "Conversation"], ["context", "Customer"]].map(([id, l]) => <button key={id} role="tab" type="button" aria-selected={pane === id} onClick={() => setPane(id)} className={`flex-1 rounded-md px-3 py-2 text-[15px] font-medium ${pane === id ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}>{l}</button>)}</div>
    <div className="grid gap-3 lg:h-[calc(100vh-190px)] lg:min-h-[640px] lg:grid-cols-[340px_minmax(0,1fr)_330px]">
      <section aria-label="Ticket queue" className={`${panel} ${pane === "queue" ? "" : "hidden"} lg:flex`}>
        <div className="border-b border-slate-200 p-2.5"><div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Queue">{QUEUES.map((x) => <button key={x.id} type="button" aria-pressed={queue === x.id} data-testid={`queue-${x.id}`} onClick={() => setQueue(x.id)} className={`rounded-full px-2.5 py-1 text-sm font-medium ${queue === x.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{x.label} <span className="tabular-nums opacity-80">{count(x.id)}</span></button>)}</div>
          <div className="flex gap-2"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets…" aria-label="Search tickets" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[15px]" /><select aria-label="Priority filter" value={pri} onChange={(e) => setPri(e.target.value)} className="rounded-md border border-slate-300 bg-white px-1.5 py-1.5 text-[15px]"><option value="">Any priority</option>{PRIOS.map((p) => <option key={p}>{p}</option>)}</select></div></div>
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto" data-testid="ticket-list">{list.map((t) => <li key={t.id}><button type="button" onClick={() => { setTid(t.id); setPane("thread"); }} aria-current={sel?.id === t.id ? "true" : undefined} className={`block w-full px-3 py-2.5 text-left ${sel?.id === t.id ? "bg-amber-50 shadow-[inset_4px_0_0_#f59e0b]" : "hover:bg-slate-50"}`}>
          <span className="flex items-center gap-2"><span className="text-sm text-slate-500">{t.number}</span><Badge tone={prTone(t.priority)}>{t.priority}</Badge><Badge tone={stTone(t.status)}>{t.status}</Badge></span>
          <span className="mt-0.5 block truncate text-[15px] font-semibold text-slate-900">{t.subject}</span><span className="block truncate text-sm text-slate-600">{cName(t.contactId)} · {coName(t.contactId)}</span><span className="mt-1 flex items-center justify-between gap-2"><SlaBadge t={t} /><span className="text-sm text-slate-500">{aName(t.assigneeId).split(" ")[0]}</span></span></button></li>)}
          {list.length === 0 && <li className="px-4 py-10 text-center text-[15px] text-slate-500">No tickets in this queue.</li>}</ul>
      </section>
      {sel ? <>
        <section aria-label="Conversation" className={`${panel} ${pane === "thread" ? "" : "hidden"} lg:flex`}><Conversation key={sel.id} t={sel} /></section>
        <aside aria-label="Customer context" className={`${panel} ${pane === "context" ? "" : "hidden"} lg:flex`}><Context key={sel.id} t={sel} open={(id) => { setTid(id); setPane("thread"); }} /></aside></> :
        <div className={`${panel} items-center justify-center p-8 text-center lg:col-span-2`}><p className="font-display text-xl text-slate-700">Select a ticket</p><p className="text-[15px] text-slate-600">Choose one from the queue to see the conversation and the customer.</p></div>}
    </div></>);
}
function Conversation({ t }: { t: Ticket }) {
  const { cName, aName, patch } = useDesk(); const toast = useToast(); const id = t.id; const [text, setText] = useState(""); const [mode, setMode] = useState<"agent" | "note">("agent"); const [res, setRes] = useState(false); const [err, setErr] = useState("");
  const log = (x: Ticket, line: string) => ({ ...x, history: [...x.history, `${DEMO_NOW.slice(0, 10)} ${line}`], updated: DEMO_NOW });
  const send = () => { if (text.trim().length < 2) return setErr("Write a message first."); const msg: TMsg = { id: uid("tm"), kind: mode, authorId: ME, at: DEMO_NOW, text: text.trim() }; patch(id, (x) => ({ ...x, messages: [...x.messages, msg], status: mode === "agent" && (x.status === "New" || x.status === "Open") ? "Pending customer" : x.status, updated: DEMO_NOW })); setText(""); setErr(""); toast(mode === "agent" ? "Reply saved (simulated: nothing was sent to the customer)" : "Internal note added"); };
  return (<>
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 p-3"><div className="min-w-0"><p className="text-sm text-slate-500">{t.number} · via {t.channel} · created {fmtDt(t.created)}</p><h2 className="font-display text-xl font-semibold leading-tight text-slate-900">{t.subject}</h2></div>
      <div className="flex flex-wrap gap-2">{isOpen(t) && <Btn kind="primary" onClick={() => setRes(true)} testid="resolve">Resolve</Btn>}{t.status === "Resolved" && <Btn kind="primary" testid="close-ticket" onClick={() => { patch(id, (x) => log({ ...x, status: "Closed" }, "Closed")); toast(`${t.number} closed`); }}>Close ticket</Btn>}{(t.status === "Resolved" || t.status === "Closed") && <Btn testid="reopen" onClick={() => { patch(id, (x) => log({ ...x, status: "Open" }, "Reopened")); logActivity("Helpdesk", `${t.number} reopened`); toast(`${t.number} reopened`, "amber"); }}>Reopen</Btn>}</div></div>
    <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4" data-testid="conversation">{t.messages.map((m) => <li key={m.id} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] ${m.kind === "customer" ? "rounded-tl-sm bg-white shadow-sm" : m.kind === "note" ? "ml-auto border border-amber-300 bg-amber-50" : "ml-auto rounded-tr-sm bg-blue-100"}`}><p className="mb-0.5 text-sm font-semibold text-slate-600">{m.kind === "customer" ? cName(t.contactId) : m.kind === "note" ? `Internal note · ${aName(m.authorId ?? "")}` : `${aName(m.authorId ?? t.assigneeId)} (agent)`} · {fmtDt(m.at)}</p><p>{m.text}</p></li>)}
      {t.resolution && <li className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-[15px]"><p className="text-sm font-semibold text-emerald-900">Resolution · {fmtDt(t.resolution.at)} by {aName(t.resolution.by)} · took {fmtHours(resolvedHours(t) ?? 0)}{t.csat ? ` · customer rating ${t.csat}/5` : ""}</p><p>{t.resolution.summary}</p></li>}</ul>
    {t.status !== "Closed" && <div className="border-t border-slate-200 p-3"><div className="mb-2 flex gap-1"><Btn small kind={mode === "agent" ? "primary" : "default"} onClick={() => setMode("agent")} testid="mode-reply">Reply to customer</Btn><Btn small kind={mode === "note" ? "primary" : "default"} onClick={() => setMode("note")} testid="mode-note">Internal note</Btn></div>
      <textarea aria-label="Message" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "agent" ? "Write a reply…" : "Write a note only agents can see…"} className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-[15px]" />{err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2"><Btn kind="primary" onClick={send} testid="send-message">{mode === "agent" ? "Send reply (simulated)" : "Add note"}</Btn><Btn small onClick={() => { patch(id, (x) => ({ ...x, messages: [...x.messages, { id: uid("tm"), kind: "customer", at: DEMO_NOW, text: "Thanks, that helps. One more question about this." }], status: x.status === "Pending customer" ? "Open" : x.status, updated: DEMO_NOW })); toast("Simulated customer reply added"); }} testid="sim-customer">Simulate customer reply</Btn><span className="text-sm text-slate-500">Stored locally; nothing is sent.</span></div></div>}
    {res && <ResolveModal t={t} onClose={() => setRes(false)} />}</>);
}
function Context({ t, open }: { t: Ticket; open(id: string): void }) {
  const { desk, agents, aName, contact, cName, coName, patch } = useDesk(); const toast = useToast(); const [crm] = useSlice("crm"); const id = t.id; const c = contact(t.contactId);
  const log = (x: Ticket, line: string) => ({ ...x, history: [...x.history, `${DEMO_NOW.slice(0, 10)} ${line}`], updated: DEMO_NOW });
  const setPriority = (p: TPriority) => { patch(id, (x) => log({ ...x, priority: p, due: addHours(x.created, SLA_HOURS[p]) }, `Priority ${x.priority} → ${p} (SLA due ${fmtDt(addHours(x.created, SLA_HOURS[p]))})`)); toast(`Priority set to ${p}; SLA due time recalculated`); };
  const [res, setRes] = useState(false); const others = desk.tickets.filter((x) => x.contactId === t.contactId && x.id !== t.id); const deals = crm.opps.filter((o) => o.contactId === t.contactId);
  return (<div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
    <div className="flex items-center gap-3"><Avatar name={cName(t.contactId)} size={48} /><div><p className="font-display text-lg font-semibold leading-tight">{cName(t.contactId)}</p><p className="text-sm text-slate-600">{c?.title} · {coName(t.contactId)}</p><p className="text-sm text-slate-500">{c?.email}</p></div></div>
    <div className="grid gap-3"><SelectIn label="Status" aria-label="Ticket status" value={t.status} onChange={(e) => { const v = e.target.value as TStatus; if (v === "Resolved") return setRes(true); patch(id, (x) => log({ ...x, status: v }, `Status ${x.status} → ${v}`)); toast(`Status: ${v}`); }} options={STATUSES.filter((s) => s !== "Closed" || t.status === "Closed")} />
      <SelectIn label="Priority" aria-label="Ticket priority" value={t.priority} onChange={(e) => setPriority(e.target.value as TPriority)} options={PRIOS} /><SelectIn label="Category" aria-label="Ticket category" value={t.category} onChange={(e) => { patch(id, (x) => log({ ...x, category: e.target.value }, `Category → ${e.target.value}`)); toast("Category updated"); }} options={CATEGORIES} />
      <SelectIn label="Assigned agent" aria-label="Assigned agent" value={t.assigneeId} onChange={(e) => { patch(id, (x) => log({ ...x, assigneeId: e.target.value }, `Assigned to ${aName(e.target.value)}`)); toast(`Assigned to ${aName(e.target.value)}`); }} options={agents.map((a) => ({ value: a.id, label: a.name }))} /></div>
    <p className="text-[15px]"><span className="text-slate-600">SLA due:</span> {fmtDt(t.due)} <SlaBadge t={t} /></p>
    <div><h3 className="mb-1 text-base font-semibold">Other tickets from this customer</h3>{others.length ? <ul className="space-y-1">{others.map((o) => <li key={o.id}><button type="button" className="text-left text-[15px] text-blue-700 hover:underline" onClick={() => open(o.id)}>{o.number}: {o.subject}</button> <Badge tone={stTone(o.status)}>{o.status}</Badge></li>)}</ul> : <p className="text-[15px] text-slate-500">None.</p>}</div>
    <div><h3 className="mb-1 text-base font-semibold">Linked CRM deals</h3>{deals.length ? <ul className="space-y-1 text-[15px]">{deals.map((o) => <li key={o.id}>{o.name} <span className="text-slate-500">· {o.stage}</span></li>)}</ul> : <p className="text-[15px] text-slate-500">No deals for this contact.</p>}</div>
    <div><h3 className="mb-1 text-base font-semibold">Activity</h3><Timeline items={[...t.history].reverse().map((h, i) => ({ id: String(i), at: h.slice(0, 10), title: h.slice(11) }))} /></div>
    {res && <ResolveModal t={t} onClose={() => setRes(false)} />}</div>);
}

function TicketForm({ defaults, onClose, onCreated }: { defaults?: { contactId?: string }; onClose(): void; onCreated?(id: string): void }) {
  const { desk, setDesk, crm, agents } = useDesk(); const toast = useToast();
  const [f, setF] = useState({ contactId: defaults?.contactId ?? crm.contacts[0]?.id ?? "", subject: "", message: "", channel: "Email", category: CATEGORIES[0], priority: "Normal" as TPriority, assigneeId: "e24" }); const [err, setErr] = useState<Record<string, string>>({});
  const save = () => { const e: Record<string, string> = {}; if (f.subject.trim().length < 5) e.subject = "Describe the problem in a few words (5+ characters)"; if (f.message.trim().length < 10) e.message = "Add the customer's message (10+ characters)"; setErr(e); if (Object.keys(e).length) return;
    const n = desk.nextNo; const t: Ticket = { id: uid("t"), number: `TCK-${n}`, subject: f.subject.trim(), contactId: f.contactId, channel: f.channel as Ticket["channel"], category: f.category, priority: f.priority, status: "New", assigneeId: f.assigneeId, created: DEMO_NOW, due: addHours(DEMO_NOW, SLA_HOURS[f.priority]), updated: DEMO_NOW, messages: [{ id: uid("tm"), kind: "customer", at: DEMO_NOW, text: f.message.trim() }], history: [`${DEMO_NOW.slice(0, 10)} Ticket created`] };
    setDesk((s) => ({ ...s, nextNo: n + 1, tickets: [t, ...s.tickets] })); logActivity("Helpdesk", `Ticket ${t.number} created: ${t.subject}`); toast(`${t.number} created (SLA due ${fmtDt(t.due)})`); onClose(); onCreated?.(t.id); };
  return (<Modal title="New support ticket" wide onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-ticket">Create ticket</Btn></>}>
    <div className="grid gap-3 sm:grid-cols-2"><SelectIn label="Customer" value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })} options={crm.contacts.map((c) => ({ value: c.id, label: `${c.name} (${crm.companies.find((x) => x.id === c.companyId)?.name})` }))} /><SelectIn label="Channel" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} options={CHANNELS} /><TextIn label="Subject" className="sm:col-span-2" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} error={err.subject} />
      <AreaIn label="Customer's message" className="sm:col-span-2" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={err.message} /><SelectIn label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CATEGORIES} /><SelectIn label="Priority" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TPriority })} options={PRIOS.map((p) => ({ value: p, label: `${p} (SLA ${SLA_HOURS[p]} h)` }))} /><SelectIn label="Assign to" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })} options={agents.map((a) => ({ value: a.id, label: a.name }))} /></div></Modal>);
}
function ResolveModal({ t, onClose }: { t: Ticket; onClose(): void }) {
  const { patch } = useDesk(); const toast = useToast(); const [s, setS] = useState(t.resolution?.summary ?? ""); const [err, setErr] = useState("");
  return (<Modal title={`Resolve ${t.number}`} small onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" testid="save-resolution" onClick={() => { if (s.trim().length < 10) return setErr("Write a resolution summary (10+ characters) so the history is useful."); patch(t.id, (x) => ({ ...x, status: "Resolved", resolution: { summary: s.trim(), at: DEMO_NOW, by: x.assigneeId }, updated: DEMO_NOW, history: [...x.history, `${DEMO_NOW.slice(0, 10)} Resolved`] })); logActivity("Helpdesk", `${t.number} resolved`); toast(`${t.number} resolved`); onClose(); }}>Mark resolved</Btn></>}>
    <AreaIn label="Resolution summary" value={s} onChange={(e) => setS(e.target.value)} error={err} /></Modal>);
}


/* ───────── Queues, agents, customers ───────── */
function Queues({ open }: { open(id: string): void }) {
  const { desk, patch, cName, aName } = useDesk(); const toast = useToast(); const items = desk.tickets.filter(isOpen);
  return (<><PageHead title="Priority queues" sub="Drag a ticket (or use the menu) to change its priority. The SLA due time is recalculated." />
    <Kanban columns={PRIOS.map((p) => ({ id: p, label: p, tone: prTone(p) }))} items={items} colOf={(t) => t.priority} idOf={(t) => t.id} onMove={(id, col) => { const p = col as TPriority; patch(id, (x) => ({ ...x, priority: p, due: addHours(x.created, SLA_HOURS[p]), updated: DEMO_NOW, history: [...x.history, `${DEMO_NOW.slice(0, 10)} Priority ${x.priority} → ${p}`] })); toast(`Priority set to ${p}`); }} colFooter={(c, its) => <span>{its.filter(overdue).length} overdue · SLA {SLA_HOURS[c as TPriority]} h</span>}
      renderCard={(t) => <><button type="button" className="text-left text-sm font-semibold hover:text-blue-700" onClick={() => open(t.id)}>{t.number}: {t.subject}</button><p className="text-xs text-slate-500">{cName(t.contactId)} · {aName(t.assigneeId)}</p><div className="mt-1"><SlaBadge t={t} /></div></>} /></>);
}
function Agents({ open }: { open(id: string): void }) {
  const { desk, agents, patch, aName, toast } = { ...useDesk(), toast: useToast() }; const op = desk.tickets.filter(isOpen);
  const stats = agents.map((a) => { const mine = desk.tickets.filter((t) => t.assigneeId === a.id); const done = mine.filter((t) => t.resolution); const rt = done.map(resolvedHours).filter((x): x is number => x != null); const cs = mine.filter((t) => t.csat); return { a, open: mine.filter(isOpen).length, od: mine.filter(overdue).length, solved: done.length, avg: rt.length ? sum(rt, (x) => x) / rt.length : null, csat: cs.length ? sum(cs, (t) => t.csat ?? 0) / cs.length : null }; });
  const cols: Col<Ticket>[] = [{ key: "number", label: "Ticket", render: (t) => <button className="font-medium text-blue-700 hover:underline" onClick={() => open(t.id)}>{t.number}</button> }, { key: "subject", label: "Subject" }, { key: "priority", label: "Priority", render: (t) => <Badge tone={prTone(t.priority)}>{t.priority}</Badge> }, { key: "sla", label: "SLA", value: (t) => t.due, render: (t) => <SlaBadge t={t} /> }, { key: "agent", label: "Assigned to", value: (t) => aName(t.assigneeId), render: (t) => <select aria-label={`Assign ${t.number}`} value={t.assigneeId} onChange={(e) => { patch(t.id, (x) => ({ ...x, assigneeId: e.target.value, updated: DEMO_NOW, history: [...x.history, `${DEMO_NOW.slice(0, 10)} Assigned to ${aName(e.target.value)}`] })); toast(`${t.number} assigned to ${aName(e.target.value)}`); }} className="rounded border border-slate-300 px-1 py-1 text-sm">{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select> }];
  return (<><PageHead title="Agent assignments" sub="Workload per agent, and reassign open tickets with the dropdown." />
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="agent-cards">{stats.map((s) => <Panel key={s.a.id}><div className="flex items-center gap-3"><Avatar name={s.a.name} size={40} /><div><p className="font-display font-semibold">{s.a.name}</p><p className="text-xs text-slate-500">{s.a.position}</p></div></div><dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><div><dt className="text-slate-500">Open</dt><dd className="font-display text-lg" data-testid={`open-${s.a.id}`}>{s.open}</dd></div><div><dt className="text-slate-500">Overdue</dt><dd className={`font-display text-lg ${s.od ? "text-red-700" : ""}`}>{s.od}</dd></div><div><dt className="text-slate-500">Solved</dt><dd className="font-display text-lg">{s.solved}</dd></div><div><dt className="text-slate-500">CSAT</dt><dd className="font-display text-lg">{s.csat ? s.csat.toFixed(1) : "—"}</dd></div></dl><div className="mt-2"><Progress value={op.length ? (s.open / op.length) * 100 : 0} label={`${s.a.name} share of open tickets`} /></div></Panel>)}</div>
    <div className="mt-4"><DataTable rows={op} columns={cols} rowKey={(t) => t.id} exportName="helpdesk-assignments" pageSize={10} testid="assign-table" /></div></>);
}
function Customers({ open }: { open(id: string): void }) {
  const { desk, crm, cName, coName } = useDesk(); const [sel, setSel] = useState<string | null>(null); const [form, setForm] = useState<string | null>(null);
  const rows = crm.contacts.map((c) => { const ts = desk.tickets.filter((t) => t.contactId === c.id); const cs = ts.filter((t) => t.csat); return { c, ts, open: ts.filter(isOpen).length, csat: cs.length ? sum(cs, (t) => t.csat ?? 0) / cs.length : null }; });
  const cols: Col<(typeof rows)[number]>[] = [{ key: "name", label: "Customer", value: (r) => r.c.name, render: (r) => <span className="flex items-center gap-2"><Avatar name={r.c.name} /><span><span className="block font-medium">{r.c.name}</span><span className="block text-xs text-slate-500">{r.c.title}</span></span></span> }, { key: "co", label: "Company", value: (r) => coName(r.c.id) }, { key: "n", label: "Tickets", align: "right", value: (r) => r.ts.length }, { key: "o", label: "Open", align: "right", value: (r) => r.open }, { key: "cs", label: "Satisfaction", align: "right", value: (r) => r.csat ?? 0, render: (r) => (r.csat ? `${r.csat.toFixed(1)} / 5` : "—") }];
  const r = rows.find((x) => x.c.id === sel);
  return (<><PageHead title="Customer profiles" sub="Contacts are shared with the CRM demo." /><DataTable rows={rows} columns={cols} rowKey={(r) => r.c.id} onRow={(r) => setSel(r.c.id)} exportName="helpdesk-customers" searchPlaceholder="Search customers…" testid="customer-table" />
    {r && <Drawer title={<span>{r.c.name}<span className="block text-xs font-normal text-slate-500">{r.c.title} · {coName(r.c.id)}</span></span>} onClose={() => setSel(null)} footer={<Btn kind="primary" onClick={() => { setForm(r.c.id); setSel(null); }}>Create ticket for this customer</Btn>}>
      <p className="text-sm">{r.c.email} · {r.c.phone}</p><h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Ticket history</h4><ul className="mt-2 divide-y divide-slate-100">{r.ts.map((t) => <li key={t.id} className="py-2 text-sm"><button className="text-left text-blue-700 hover:underline" onClick={() => open(t.id)}>{t.number}: {t.subject}</button><div className="mt-0.5 flex gap-1"><Badge tone={stTone(t.status)}>{t.status}</Badge><Badge tone={prTone(t.priority)}>{t.priority}</Badge></div></li>)}{r.ts.length === 0 && <li className="py-3 text-sm text-slate-400">No tickets yet.</li>}</ul></Drawer>}
    {form && <TicketForm defaults={{ contactId: form }} onClose={() => setForm(null)} onCreated={open} />}{void cName}</>);
}

/* ───────── History, SLA, analytics ───────── */
function History({ open }: { open(id: string): void }) {
  const { desk, agents, aName, cName } = useDesk(); const [ag, setAg] = useState(""); const rows = desk.tickets.filter((t) => t.resolution && (!ag || t.resolution.by === ag));
  const cols: Col<Ticket>[] = [{ key: "number", label: "Ticket", render: (t) => <button className="font-medium text-blue-700 hover:underline" onClick={() => open(t.id)}>{t.number}</button> }, { key: "subject", label: "Subject" }, { key: "cust", label: "Customer", value: (t) => cName(t.contactId) }, { key: "sum", label: "Resolution", value: (t) => t.resolution?.summary ?? "" }, { key: "by", label: "Resolved by", value: (t) => aName(t.resolution?.by ?? "") }, { key: "time", label: "Time to resolve", align: "right", value: (t) => resolvedHours(t) ?? 0, render: (t) => fmtHours(resolvedHours(t) ?? 0) }, { key: "sla", label: "SLA", value: (t) => (t.resolution && t.resolution.at <= t.due ? "Met" : "Missed"), render: (t) => <Badge tone={t.resolution && t.resolution.at <= t.due ? "green" : "red"}>{t.resolution && t.resolution.at <= t.due ? "Met" : "Missed"}</Badge> }, { key: "csat", label: "Rating", align: "right", value: (t) => t.csat ?? 0, render: (t) => (t.csat ? `${t.csat}/5` : "—") }];
  return (<><PageHead title="Resolution history" sub="Every resolved or closed ticket with its resolution summary." /><DataTable rows={rows} columns={cols} rowKey={(t) => t.id} exportName="helpdesk-resolutions" toolbar={<FilterSelect label="Agent" value={ag} onChange={setAg} options={agents.map((a) => ({ value: a.id, label: a.name }))} />} testid="history-table" /></>);
}
function Sla({ open }: { open(id: string): void }) {
  const { desk } = useDesk(); const ts = desk.tickets; const done = ts.filter((t) => t.resolution); const met = done.filter((t) => (t.resolution?.at ?? "9") <= t.due);
  const byP = PRIOS.map((p) => { const d = done.filter((t) => t.priority === p); const m = d.filter((t) => (t.resolution?.at ?? "9") <= t.due); return { p, target: SLA_HOURS[p], n: ts.filter((t) => t.priority === p).length, open: ts.filter((t) => t.priority === p && isOpen(t)).length, breached: ts.filter((t) => t.priority === p && overdue(t)).length, rate: d.length ? m.length / d.length : null }; });
  const risk = ts.filter((t) => overdue(t) || atRisk(t)).sort((a, b) => a.due.localeCompare(b.due));
  return (<><PageHead title="Service-level overview" sub="Resolution targets by priority. A ticket meets its SLA when it is resolved before its due time." />
    <KpiRow><Kpi label="SLA compliance" value={done.length ? pct(met.length / done.length) : "—"} sub={`${met.length} of ${done.length} resolved on time`} testid="kpi-sla" /><Kpi label="Breached (open)" value={ts.filter(overdue).length} tone={ts.some(overdue) ? "red" : undefined} /><Kpi label="At risk" value={ts.filter(atRisk).length} tone="amber" /><Kpi label="Open tickets" value={ts.filter(isOpen).length} /></KpiRow>
    <Panel title="By priority" className="mt-4" pad={false}><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr><th className="p-2">Priority</th><th className="p-2 text-right">Target</th><th className="p-2 text-right">Tickets</th><th className="p-2 text-right">Open</th><th className="p-2 text-right">Overdue</th><th className="p-2 text-right">Compliance</th></tr></thead><tbody>{byP.map((r) => <tr key={r.p} className="border-t"><td className="p-2"><Badge tone={prTone(r.p)}>{r.p}</Badge></td><td className="p-2 text-right">{r.target} h</td><td className="p-2 text-right">{r.n}</td><td className="p-2 text-right">{r.open}</td><td className="p-2 text-right">{r.breached}</td><td className="p-2 text-right">{r.rate == null ? "n/a" : pct(r.rate)}</td></tr>)}</tbody></table></Panel>
    <Panel title="Overdue and at-risk tickets" className="mt-4" pad={false}><ul className="divide-y divide-slate-100" data-testid="risk-list">{risk.map((t) => <li key={t.id}><button className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => open(t.id)}><span className="font-medium">{t.number}</span><span className="flex-1 truncate">{t.subject}</span><Badge tone={prTone(t.priority)}>{t.priority}</Badge><SlaBadge t={t} /></button></li>)}{risk.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">No tickets are overdue or at risk.</li>}</ul></Panel></>);
}
function Analytics() {
  const { desk, aName } = useDesk(); const [from, setFrom] = useState("2026-02-20"); const [to, setTo] = useState("2026-03-15"); const [status, setStatus] = useState("");
  const rows = desk.tickets.filter((t) => t.created.slice(0, 10) >= from && t.created.slice(0, 10) <= to && (!status || (status === "open" ? isOpen(t) : t.status === status)));
  const days = Array.from({ length: 14 }, (_, i) => addDays(to, -13 + i)); const perDay = days.map((d) => ({ label: d.slice(5), values: { tickets: rows.filter((t) => t.created.startsWith(d)).length } }));
  const byCat = Object.entries(groupBy(rows, (t) => t.category)).map(([label, v]) => ({ label, value: v.length })); const byCh = Object.entries(groupBy(rows, (t) => t.channel)).map(([label, v]) => ({ label, value: v.length }));
  const frs = rows.map(firstResponse).filter((x): x is number => x != null), rts = rows.map(resolvedHours).filter((x): x is number => x != null), cs = rows.filter((t) => t.csat);
  const exportCsv = () => downloadCsv("helpdesk-analytics-tickets", [["Ticket", "Created", "Category", "Priority", "Status", "Channel", "Agent", "First response (h)", "Resolution (h)", "CSAT"], ...rows.map((t) => [t.number, t.created, t.category, t.priority, t.status, t.channel, aName(t.assigneeId), firstResponse(t)?.toFixed(2) ?? "", resolvedHours(t)?.toFixed(2) ?? "", t.csat ?? ""])]);
  return (<><PageHead title="Support analytics" sub="Filter by creation date and status. Every chart updates." actions={<><label className="flex items-center gap-1 text-xs text-slate-500">From<input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /></label><label className="flex items-center gap-1 text-xs text-slate-500">To<input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /></label><FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "open", label: "All open" }, ...STATUSES]} /><Btn onClick={exportCsv} testid="export-analytics">Export CSV</Btn></>} />
    <KpiRow><Kpi label="Tickets" value={rows.length} testid="an-count" /><Kpi label="Avg. first response" value={frs.length ? fmtHours(sum(frs, (x) => x) / frs.length) : "—"} /><Kpi label="Avg. resolution time" value={rts.length ? fmtHours(sum(rts, (x) => x) / rts.length) : "—"} /><Kpi label="Satisfaction" value={cs.length ? `${(sum(cs, (t) => t.csat ?? 0) / cs.length).toFixed(1)} / 5` : "—"} /></KpiRow>
    <div className="mt-4 grid gap-4 lg:grid-cols-3"><Panel title="Tickets created per day (14 days to end date)" className="lg:col-span-2"><BarChart ariaLabel="Tickets per day" data={perDay} series={[{ key: "tickets", label: "Tickets" }]} /></Panel><Panel title="By category">{byCat.length ? <Donut slices={byCat} center={<>{rows.length}</>} /> : <Empty>No tickets in this range.</Empty>}</Panel><Panel title="By channel" className="lg:col-span-3"><HBars items={byCh} /></Panel></div><p className="mt-2 text-xs text-slate-500">{void round2}Resolution time and satisfaction only include tickets that have been resolved or rated.</p><Notice tone="blue">Satisfaction scores are fictional sample data.</Notice></>);
}

