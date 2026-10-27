"use client";
import { useMemo, useState } from "react";
import { logActivity, resetDb, useSlice } from "@/lib/biz/db";
import { STAGES, STAGE_PROB, quoteTotals, type Activity, type Company, type Contact, type Lead, type Note, type Opp, type Priority, type Quote, type Stage } from "@/lib/biz/seed-crm";
import { DEMO_TODAY, addDays, downloadCsv, emailOk, fmtDate, fmtShort, groupBy, lastNMonths, money, moneyK, monthKey, monthLabel, pct, sum, uid } from "@/lib/biz/util";
import type { Branding } from "@/lib/types";
import { Avatar, AppProviders, BarChart, Badge, BrandLogo, Btn, DemoBadge, DemoLinks, Donut, Drawer, Empty, FilterSelect, HBars, Kanban, Kpi, KpiRow, Modal, PageHead, Panel, PrintSheet, ResetButton, SelectIn, Tabs, TextIn, Timeline, useConfirm, useToast, DataTable, printNow, type Col } from "./kit";

/* Sales command centre: a light, top-navigated workspace where the Kanban pipeline is the home screen and records open in a side panel. */
const TABS = [{ id: "pipeline", label: "Pipeline" }, { id: "leads", label: "Leads" }, { id: "contacts", label: "Contacts" }, { id: "companies", label: "Companies" }, { id: "activities", label: "Activities" }, { id: "quotes", label: "Quotations" }, { id: "reports", label: "Reports" }];
const stageTone = (s: Stage) => (s === "Won" ? "green" : s === "Lost" ? "red" : s === "Negotiation" ? "violet" : s === "Proposal" ? "blue" : s === "New Lead" ? "slate" : "amber") as "green" | "red" | "violet" | "blue" | "slate" | "amber";
const prioTone = { High: "red", Medium: "amber", Low: "slate" } as const;
const leadTone = { New: "blue", Contacted: "amber", Qualified: "green", Unqualified: "slate" } as const;
export const prioOf = (o: Opp): Priority => o.priority ?? (o.value >= 100000 ? "High" : o.value >= 50000 ? "Medium" : "Low");

export default function CrmApp({ branding }: { branding: Branding }) {
  const [crm, setCrm] = useSlice("crm"); const [hrm] = useSlice("hrm");
  const [tab, setTab] = useState("pipeline"); const [oppId, setOppId] = useState<string | null>(null); const [owner, setOwner] = useState(""); const [focus, setFocus] = useState<string | null>(null);
  const [newOpp, setNewOpp] = useState(false); const [bell, setBell] = useState(false); const [menu, setMenu] = useState(false);
  const reps = hrm.employees.filter((e) => e.dept === "Sales" && e.status !== "Resigned");
  const repName = (id: string) => hrm.employees.find((e) => e.id === id)?.name ?? "Unassigned";
  const coName = (id: string) => crm.companies.find((c) => c.id === id)?.name ?? "—";
  const contactName = (id: string) => crm.contacts.find((c) => c.id === id)?.name ?? "—";
  const overdue = crm.activities.filter((a) => !a.done && a.due < DEMO_TODAY && (!owner || a.ownerId === owner)).sort((a, b) => a.due.localeCompare(b.due));
  const go = (s: string, f: string | null = null) => { setTab(s); setFocus(f); setOppId(null); setBell(false); };
  const ctx: Ctx = { crm, setCrm, reps, repName, coName, contactName, openOpp: (id) => { setOppId(id); setBell(false); }, go, owner, focus };
  return (
    <AppProviders className="bg-slate-50 text-slate-800">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <BrandLogo branding={branding} dark={false} height={30} />
          <div className="hidden sm:block"><p className="font-display text-lg font-semibold leading-tight text-slate-900">NorthPeak Sales</p><p className="text-sm leading-tight text-slate-500">Sales command centre</p></div>
          <GlobalSearch crm={crm} coName={coName} onOpp={(id) => setOppId(id)} onGo={go} />
          <label className="flex items-center gap-2 text-sm text-slate-600"><span className="hidden lg:inline">Workspace</span>
            <select aria-label="Workspace" value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[15px] text-slate-800"><option value="">Whole sales team</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <div className="relative">
            <button type="button" aria-label={`Notifications: ${overdue.length} overdue follow-ups`} aria-expanded={bell} onClick={() => { setBell(!bell); setMenu(false); }} data-testid="bell" className="relative rounded-full border border-slate-300 px-3 py-1.5 text-[15px] hover:border-blue-500">Alerts{overdue.length > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[13px] font-semibold text-white">{overdue.length}</span>}</button>
            {bell && <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><p className="px-2 py-1 text-sm font-semibold text-slate-700">Overdue follow-ups</p>
              {overdue.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">Nothing overdue.</p>}
              <ul>{overdue.slice(0, 6).map((a) => <li key={a.id}><button type="button" className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={() => (a.oppId ? ctx.openOpp(a.oppId) : go("activities"))}><span className="font-medium text-slate-900">{a.subject}</span><span className="block text-slate-500">{repName(a.ownerId)} · due {fmtShort(a.due)}</span></button></li>)}</ul>
              <button type="button" className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-blue-700 hover:bg-slate-50" onClick={() => go("activities")}>Open all activities →</button></div>}
          </div>
          <div className="relative">
            <button type="button" aria-label="Profile and demo options" aria-expanded={menu} onClick={() => { setMenu(!menu); setBell(false); }} className="flex items-center gap-2 rounded-full border border-slate-300 py-1 pl-1 pr-3 text-[15px] hover:border-blue-500"><Avatar name="Demo User" size={28} />Profile</button>
            {menu && <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl"><p className="text-sm font-semibold">Demo User · Sales manager</p><p className="mb-2 text-sm text-slate-500">Fictional profile. No sign-in exists.</p><div className="flex flex-wrap gap-2"><ResetButton onReset={() => resetDb(["crm"])} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:border-blue-500" /></div><div className="mt-2 flex flex-wrap gap-2 text-slate-800 [&_a]:border-slate-300"><DemoLinks compact /></div></div>}
          </div>
          <Btn kind="primary" onClick={() => setNewOpp(true)} testid="new-opp">+ New opportunity</Btn>
        </div>
        <nav aria-label="CRM sections" className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2">
          {TABS.map((t) => <button key={t.id} type="button" data-nav={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)} className={`rounded-full px-4 py-1.5 text-[15px] font-medium ${tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.label}{t.id === "activities" && overdue.length > 0 ? <span className="ml-1.5 text-red-300">•</span> : null}</button>)}
          <span className="ml-auto"><DemoBadge /></span>
        </nav>
      </header>
      <main className="min-w-0 flex-1 p-4 sm:p-5" id="app-main" key={`${tab}-${owner}-${focus}`}>
        {tab === "pipeline" && <Pipeline {...ctx} />}
        {tab === "leads" && <Leads {...ctx} />}
        {tab === "contacts" && <Contacts {...ctx} />}
        {tab === "companies" && <Companies {...ctx} />}
        {tab === "activities" && <Activities {...ctx} />}
        {tab === "quotes" && <Quotes {...ctx} />}
        {tab === "reports" && <Reports {...ctx} />}
      </main>
      {oppId && <OppDrawer {...ctx} id={oppId} onClose={() => setOppId(null)} />}
      {newOpp && <OppForm crm={crm} setCrm={setCrm} reps={reps} onClose={() => setNewOpp(false)} onCreated={(id) => { setTab("pipeline"); setOppId(id); }} />}
    </AppProviders>
  );
}
type CrmState = ReturnType<typeof useSlice<"crm">>[0];
interface Ctx { crm: CrmState; setCrm: ReturnType<typeof useSlice<"crm">>[1]; reps: { id: string; name: string }[]; repName(id: string): string; coName(id: string): string; contactName(id: string): string; openOpp(id: string): void; go(s: string, focus?: string | null): void; owner: string; focus: string | null }

function GlobalSearch({ crm, coName, onOpp, onGo }: { crm: CrmState; coName(id: string): string; onOpp(id: string): void; onGo(tab: string, focus: string): void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    const has = (...v: string[]) => v.some((x) => x.toLowerCase().includes(s));
    return [
      ...crm.opps.filter((o) => has(o.name, coName(o.companyId))).slice(0, 4).map((o) => ({ key: o.id, kind: "Deal", label: o.name, sub: coName(o.companyId), run: () => onOpp(o.id) })),
      ...crm.leads.filter((l) => has(l.name, l.company, l.email)).slice(0, 3).map((l) => ({ key: l.id, kind: "Lead", label: l.name, sub: l.company, run: () => onGo("leads", l.id) })),
      ...crm.contacts.filter((c) => has(c.name, c.email)).slice(0, 3).map((c) => ({ key: c.id, kind: "Contact", label: c.name, sub: coName(c.companyId), run: () => onGo("contacts", c.id) })),
      ...crm.companies.filter((c) => has(c.name)).slice(0, 3).map((c) => ({ key: c.id, kind: "Company", label: c.name, sub: c.industry, run: () => onGo("companies", c.id) })),
    ];
  }, [q, crm, coName, onOpp, onGo]);
  return (
    <div className="relative min-w-[220px] flex-1 sm:max-w-md">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search deals, leads, contacts and companies" placeholder="Search deals, leads, contacts, companies…" data-testid="global-search" className="w-full rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-[15px] outline-none focus:border-blue-500 focus:bg-white" />
      {q.trim().length >= 2 && <div className="absolute left-0 right-0 z-40 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" role="listbox">
        {hits.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">No matches.</p>}
        {hits.map((h) => <button key={h.kind + h.key} type="button" role="option" aria-selected={false} onClick={() => { h.run(); setQ(""); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] hover:bg-slate-50"><Badge tone="slate">{h.kind}</Badge><span className="min-w-0 flex-1 truncate font-medium text-slate-900">{h.label}</span><span className="truncate text-sm text-slate-500">{h.sub}</span></button>)}
      </div>}
    </div>
  );
}

const wonOpps = (o: Opp[]) => o.filter((x) => x.stage === "Won"); const openOppsOf = (o: Opp[]) => o.filter((x) => x.stage !== "Won" && x.stage !== "Lost");
export const crmMetrics = (crm: CrmState) => {
  const open = openOppsOf(crm.opps), won = wonOpps(crm.opps), lost = crm.opps.filter((o) => o.stage === "Lost");
  return { open, won, lost, pipeline: sum(open, (o) => o.value), forecast: sum(open, (o) => o.value * STAGE_PROB[o.stage]), wonValue: sum(won, (o) => o.value), winRate: won.length + lost.length ? won.length / (won.length + lost.length) : 0, avgDeal: won.length ? sum(won, (o) => o.value) / won.length : 0 };
};
const newNote = (text: string): Note => ({ id: uid("n"), at: `${DEMO_TODAY}`, by: "You", text });
const lastActivityOf = (crm: CrmState, o: Opp) => [o.createdAt, ...o.notes.map((n) => n.at), ...crm.activities.filter((a) => a.oppId === o.id && a.done).map((a) => a.due)].sort().pop() as string;

/* ───────── Pipeline (home screen) ───────── */
const CLOSE_FILTERS = [{ value: "overdue", label: "Overdue" }, { value: "30", label: "Next 30 days" }, { value: "60", label: "Next 60 days" }, { value: "later", label: "Later than 60 days" }];
function Pipeline({ crm, setCrm, reps, repName, coName, openOpp, owner }: Ctx) {
  const toast = useToast(); const [stage, setStage] = useState(""); const [prio, setPrio] = useState(""); const [close, setClose] = useState(""); const [view, setView] = useState("board"); const [q, setQ] = useState("");
  const [lost, setLost] = useState<string | null>(null); const [reason, setReason] = useState("");
  const items = crm.opps.filter((o) => (!owner || o.ownerId === owner) && (!stage || o.stage === stage) && (!prio || prioOf(o) === prio) && (!q || `${o.name} ${coName(o.companyId)}`.toLowerCase().includes(q.toLowerCase())) &&
    (!close || (close === "overdue" ? o.closeDate < DEMO_TODAY && o.stage !== "Won" && o.stage !== "Lost" : close === "30" ? o.closeDate >= DEMO_TODAY && o.closeDate <= addDays(DEMO_TODAY, 30) : close === "60" ? o.closeDate >= DEMO_TODAY && o.closeDate <= addDays(DEMO_TODAY, 60) : o.closeDate > addDays(DEMO_TODAY, 60))));
  const move = (id: string, to: string) => {
    const o = crm.opps.find((x) => x.id === id); if (!o || o.stage === to) return;
    if (to === "Lost") { setLost(id); setReason(""); return; }
    setCrm((s) => ({ ...s, opps: s.opps.map((x) => (x.id === id ? { ...x, stage: to as Stage, closeDate: to === "Won" ? DEMO_TODAY : x.closeDate, lostReason: undefined } : x)) }));
    logActivity("CRM", `${o.name} moved ${o.stage} → ${to}`); toast(`${o.name} moved to ${to}`);
  };
  const m = crmMetrics({ ...crm, opps: items }); const filtered = !!(stage || prio || close || q);
  const cols: Col<Opp>[] = [{ key: "name", label: "Opportunity", render: (o) => <span className="font-medium text-slate-900">{o.name}</span> }, { key: "co", label: "Company", value: (o) => coName(o.companyId) }, { key: "value", label: "Value", align: "right", value: (o) => o.value, render: (o) => money(o.value, "USD", 0) },
    { key: "stage", label: "Stage", render: (o) => <Badge tone={stageTone(o.stage)}>{o.stage}</Badge> }, { key: "prio", label: "Priority", value: (o) => prioOf(o), render: (o) => <Badge tone={prioTone[prioOf(o)]}>{prioOf(o)}</Badge> }, { key: "owner", label: "Owner", value: (o) => repName(o.ownerId) }, { key: "closeDate", label: "Close date", render: (o) => fmtDate(o.closeDate) }];
  return (
    <>
      <div className="no-print mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[15px]" aria-label="Pipeline summary">
        <span>Open <strong className="font-display text-xl tabular-nums" data-testid="pipe-open">{money(m.pipeline, "USD", 0)}</strong></span>
        <span className="text-slate-600">Weighted <strong className="tabular-nums text-slate-900">{money(m.forecast, "USD", 0)}</strong></span>
        <span className="text-slate-600">Won <strong className="tabular-nums text-blue-700" data-testid="pipe-won">{money(m.wonValue, "USD", 0)}</strong></span>
        <span className="text-slate-600">Lost <strong className="tabular-nums text-slate-900">{m.lost.length}</strong></span>
        <span className="ml-auto text-sm text-slate-500">{items.length} of {crm.opps.length} deals shown</span>
      </div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter deals…" aria-label="Filter deals by name or company" className="w-52 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[15px]" />
        <FilterSelect label="Stage" value={stage} onChange={setStage} options={[...STAGES]} />
        <FilterSelect label="Priority" value={prio} onChange={setPrio} options={["High", "Medium", "Low"]} />
        <FilterSelect label="Close date" value={close} onChange={setClose} options={CLOSE_FILTERS} all="Any" />
        {filtered && <Btn small onClick={() => { setStage(""); setPrio(""); setClose(""); setQ(""); }}>Clear filters</Btn>}
        <div role="group" aria-label="Pipeline view" className="ml-auto inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-[15px]">{[["board", "Board"], ["list", "List"]].map(([id, l]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`px-3 py-1.5 font-medium ${view === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>)}</div>
      </div>
      {view === "board" ? (
        <Kanban colWidth="w-72" columns={STAGES.map((s) => ({ id: s, label: s, tone: stageTone(s) }))} items={items} colOf={(o) => o.stage} idOf={(o) => o.id} onMove={move}
          colFooter={(c, its) => <span data-testid={`total-${c}`}>{money(sum(its, (o) => o.value), "USD", 0)}{c !== "Won" && c !== "Lost" ? ` · ${pct(STAGE_PROB[c as Stage])}` : ""}</span>}
          renderCard={(o) => <>
            <div className="flex items-start justify-between gap-2"><button type="button" className="text-left text-[15px] font-semibold leading-snug text-slate-900 hover:text-blue-700" onClick={() => openOpp(o.id)}>{o.name}</button><Badge tone={prioTone[prioOf(o)]}>{prioOf(o)}</Badge></div>
            <p className="text-sm text-slate-600">{coName(o.companyId)}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{money(o.value, "USD", 0)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><Avatar name={repName(o.ownerId)} size={22} />{repName(o.ownerId)}</p>
            <p className="mt-1 text-sm text-slate-500">Close {fmtShort(o.closeDate)} · last activity {fmtShort(lastActivityOf(crm, o))}</p>
            <div className="mt-1"><Badge tone={stageTone(o.stage)}>{o.stage}</Badge></div></>} />
      ) : <DataTable rows={items} columns={cols} rowKey={(o) => o.id} onRow={(o) => openOpp(o.id)} exportName="crm-opportunities" searchPlaceholder="Search opportunities…" search={false} testid="opp-table" />}
      {lost && <Modal title="Mark as lost" small onClose={() => setLost(null)} footer={<><Btn onClick={() => setLost(null)}>Cancel</Btn><Btn kind="danger" testid="confirm-lost" onClick={() => { const o = crm.opps.find((x) => x.id === lost)!; setCrm((s) => ({ ...s, opps: s.opps.map((x) => (x.id === lost ? { ...x, stage: "Lost", lostReason: reason || "No reason given" } : x)) })); logActivity("CRM", `${o.name} marked lost`); toast(`${o.name} marked lost`, "amber"); setLost(null); }}>Mark lost</Btn></>}>
        <TextIn label="Why was it lost?" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Chose a competitor" />
      </Modal>}
      {reps.length === 0 && null}
    </>
  );
}

function OppForm({ crm, setCrm, reps, onClose, existing, onCreated }: { crm: CrmState; setCrm: Ctx["setCrm"]; reps: Ctx["reps"]; onClose(): void; existing?: Opp; onCreated?(id: string): void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: existing?.name ?? "", companyId: existing?.companyId ?? crm.companies[0]?.id ?? "", contactId: existing?.contactId ?? "", value: String(existing?.value ?? ""), stage: (existing?.stage ?? "Qualified") as Stage, priority: (existing ? prioOf(existing) : "Medium") as Priority, ownerId: existing?.ownerId ?? reps[0]?.id ?? "", closeDate: existing?.closeDate ?? addDays(DEMO_TODAY, 45) });
  const [err, setErr] = useState<Record<string, string>>({});
  const contacts = crm.contacts.filter((c) => c.companyId === f.companyId);
  const save = () => {
    const e: Record<string, string> = {}; if (f.name.trim().length < 3) e.name = "Enter a name (3+ characters)"; if (!(Number(f.value) > 0)) e.value = "Value must be greater than 0"; if (!f.closeDate) e.closeDate = "Pick a close date"; setErr(e); if (Object.keys(e).length) return;
    const rec = { ...f, name: f.name.trim(), value: Number(f.value), contactId: contacts.some((c) => c.id === f.contactId) ? f.contactId : contacts[0]?.id ?? "" };
    if (existing) setCrm((s) => ({ ...s, opps: s.opps.map((o) => (o.id === existing.id ? { ...o, ...rec } : o)) }));
    else { const id = uid("o"); setCrm((s) => ({ ...s, opps: [{ id, createdAt: DEMO_TODAY, notes: [], ...rec }, ...s.opps] })); logActivity("CRM", `Opportunity created: ${rec.name}`); onCreated?.(id); }
    toast(existing ? "Opportunity updated" : "Opportunity created"); onClose();
  };
  return (
    <Modal title={existing ? "Edit opportunity" : "New opportunity"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-opp">Save</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextIn label="Opportunity name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err.name} className="sm:col-span-2" />
        <SelectIn label="Company" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value, contactId: "" })} options={crm.companies.map((c) => ({ value: c.id, label: c.name }))} />
        <SelectIn label="Contact" value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })} options={[{ value: "", label: contacts.length ? "First contact" : "No contacts" }, ...contacts.map((c) => ({ value: c.id, label: c.name }))]} />
        <TextIn label="Value (USD)" type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} error={err.value} />
        <SelectIn label="Stage" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value as Stage })} options={STAGES} />
        <SelectIn label="Priority" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })} options={["High", "Medium", "Low"]} />
        <SelectIn label="Salesperson" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} options={reps.map((r) => ({ value: r.id, label: r.name }))} />
        <TextIn label="Expected close date" type="date" value={f.closeDate} onChange={(e) => setF({ ...f, closeDate: e.target.value })} error={err.closeDate} />
      </div>
    </Modal>
  );
}

/* ───────── Deal side panel ───────── */
function OppDrawer({ crm, setCrm, reps, repName, coName, contactName, id, onClose }: Ctx & { id: string; onClose(): void }) {
  const toast = useToast(); const confirm = useConfirm(); const o = crm.opps.find((x) => x.id === id);
  const [edit, setEdit] = useState(false); const [note, setNote] = useState(""); const [act, setAct] = useState(false); const [lost, setLost] = useState(false); const [reason, setReason] = useState(""); const [quote, setQuote] = useState<string | null>(null);
  if (!o) return <Drawer title="Deal not found" onClose={onClose} wide><Empty>This opportunity no longer exists.</Empty></Drawer>;
  const setStage = (s: Stage, extra: Partial<Opp> = {}) => { setCrm((st) => ({ ...st, opps: st.opps.map((x) => (x.id === id ? { ...x, stage: s, closeDate: s === "Won" ? DEMO_TODAY : x.closeDate, ...extra } : x)) })); logActivity("CRM", `${o.name} → ${s}`); toast(`Moved to ${s}`); };
  const acts = crm.activities.filter((a) => a.oppId === id).sort((a, b) => a.due.localeCompare(b.due)); const quotes = crm.quotes.filter((q) => q.oppId === id);
  const closed = o.stage === "Won" || o.stage === "Lost"; const idx = STAGES.indexOf(o.stage);
  return (
    <Drawer wide onClose={onClose} title={<span>{o.name}<span className="block text-sm font-normal text-slate-500">{coName(o.companyId)} · {contactName(o.contactId)}</span></span>}
      footer={<>
        <Btn onClick={() => setEdit(true)}>Edit</Btn>
        {!closed && <><Btn kind="primary" onClick={() => setStage("Won")} testid="mark-won">Mark won</Btn><Btn kind="danger" onClick={() => setLost(true)} testid="mark-lost">Mark lost</Btn></>}
        {closed && <Btn onClick={() => setStage("Negotiation", { lostReason: undefined })}>Reopen</Btn>}
        <Btn kind="danger" onClick={async () => { if (await confirm(`Delete "${o.name}"? This removes its quotations and activities too.`)) { setCrm((s) => ({ ...s, opps: s.opps.filter((x) => x.id !== id), quotes: s.quotes.filter((q) => q.oppId !== id), activities: s.activities.filter((a) => a.oppId !== id) })); toast("Opportunity deleted", "amber"); onClose(); } }}>Delete</Btn></>}>
      <ol className="mb-5 flex flex-wrap gap-1.5" aria-label="Deal stage">{STAGES.filter((s) => s !== "Lost").map((s, i) => <li key={s} className={`rounded-full px-3 py-1 text-sm font-medium ${o.stage === s ? "bg-slate-900 text-white" : i < idx && o.stage !== "Lost" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-500"}`}>{s}</li>)}{o.stage === "Lost" && <li className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">Lost</li>}</ol>
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h4 className="mb-2 text-base font-semibold text-slate-900">Deal summary</h4>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-[15px]">
            <dt className="text-slate-500">Value</dt><dd className="font-display text-2xl font-semibold tabular-nums">{money(o.value, "USD", 0)}</dd>
            <dt className="text-slate-500">Stage</dt><dd><select aria-label="Stage" className="rounded border border-slate-300 px-2 py-1" value={o.stage} onChange={(e) => (e.target.value === "Lost" ? setLost(true) : setStage(e.target.value as Stage))}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></dd>
            <dt className="text-slate-500">Priority</dt><dd><Badge tone={prioTone[prioOf(o)]}>{prioOf(o)}</Badge></dd>
            <dt className="text-slate-500">Probability</dt><dd>{pct(STAGE_PROB[o.stage])} · weighted {money(o.value * STAGE_PROB[o.stage], "USD", 0)}</dd>
            <dt className="text-slate-500">Salesperson</dt><dd><select aria-label="Salesperson" className="rounded border border-slate-300 px-2 py-1" value={o.ownerId} onChange={(e) => { setCrm((s) => ({ ...s, opps: s.opps.map((x) => (x.id === id ? { ...x, ownerId: e.target.value } : x)) })); toast(`Assigned to ${repName(e.target.value)}`); }}>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></dd>
            <dt className="text-slate-500">Close date</dt><dd>{fmtDate(o.closeDate)}</dd><dt className="text-slate-500">Created</dt><dd>{fmtDate(o.createdAt)}</dd><dt className="text-slate-500">Last activity</dt><dd>{fmtDate(lastActivityOf(crm, o))}</dd>
            {o.lostReason && <><dt className="text-slate-500">Lost reason</dt><dd className="text-red-700">{o.lostReason}</dd></>}
          </dl>
          <h4 className="mb-2 mt-6 flex items-center justify-between text-base font-semibold text-slate-900">Follow-ups<Btn small onClick={() => setAct(true)} testid="schedule">+ Schedule</Btn></h4>
          <ul className="space-y-2">{acts.map((a) => <li key={a.id} className="flex items-center gap-2 text-[15px]"><input type="checkbox" aria-label={`Mark ${a.subject} done`} checked={a.done} onChange={() => setCrm((s) => ({ ...s, activities: s.activities.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) }))} /><span className={a.done ? "text-slate-400 line-through" : ""}>{a.subject}</span><span className="ml-auto text-sm text-slate-500">{fmtShort(a.due)}</span></li>)}{acts.length === 0 && <li className="text-slate-400">No follow-ups yet.</li>}</ul>
        </section>
        <section>
          <h4 className="mb-2 text-base font-semibold text-slate-900">Notes</h4>
          <div className="flex gap-2"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" aria-label="Add a note" className="w-full rounded-md border border-slate-300 px-2.5 py-1.5" /><Btn kind="primary" onClick={() => { if (!note.trim()) return toast("Write a note first", "red"); setCrm((s) => ({ ...s, opps: s.opps.map((x) => (x.id === id ? { ...x, notes: [newNote(note.trim()), ...x.notes] } : x)) })); setNote(""); toast("Note added"); }} testid="add-note">Add</Btn></div>
          <div className="mt-3"><Timeline items={o.notes.map((n) => ({ id: n.id, at: `${fmtDate(n.at)} · ${n.by}`, title: n.text }))} /></div>
          <h4 className="mb-2 mt-6 flex items-center justify-between text-base font-semibold text-slate-900">Quotations
            <Btn small onClick={() => { const n = `Q-2026-${String(crm.quotes.length + 101).padStart(4, "0")}`; const q: Quote = { id: uid("q"), number: n, oppId: id, date: DEMO_TODAY, validUntil: addDays(DEMO_TODAY, 30), lines: [{ desc: o.name, qty: 1, price: o.value }], discount: 0, tax: 0, status: "Draft" }; setCrm((s) => ({ ...s, quotes: [q, ...s.quotes] })); toast(`Draft quotation ${n} created`); }}>+ Draft from deal value</Btn></h4>
          {quotes.length ? <ul className="divide-y divide-slate-100">{quotes.map((q) => <li key={q.id} className="flex items-center gap-3 py-2 text-[15px]"><span className="font-medium">{q.number}</span><Badge tone={q.status === "Accepted" ? "green" : q.status === "Declined" ? "red" : q.status === "Sent" ? "blue" : "slate"}>{q.status}</Badge><span className="ml-auto tabular-nums">{money(quoteTotals(q).total)}</span><Btn small onClick={() => setQuote(q.id)}>Preview</Btn></li>)}</ul> : <p className="text-slate-400">No quotations yet.</p>}
        </section>
      </div>
      {edit && <OppForm crm={crm} setCrm={setCrm} reps={reps} existing={o} onClose={() => setEdit(false)} />}
      {act && <ActivityForm crm={crm} setCrm={setCrm} reps={reps} defaults={{ oppId: id, ownerId: o.ownerId, contactId: o.contactId }} onClose={() => setAct(false)} />}
      {quote && <QuoteView crm={crm} setCrm={setCrm} coName={coName} contactName={contactName} id={quote} onClose={() => setQuote(null)} />}
      {lost && <Modal title="Mark as lost" small onClose={() => setLost(false)} footer={<><Btn onClick={() => setLost(false)}>Cancel</Btn><Btn kind="danger" testid="confirm-lost" onClick={() => { setStage("Lost", { lostReason: reason || "No reason given" }); setLost(false); }}>Mark lost</Btn></>}><TextIn label="Why was it lost?" value={reason} onChange={(e) => setReason(e.target.value)} /></Modal>}
    </Drawer>
  );
}

/* ───────── Activities ───────── */
function ActivityForm({ crm, setCrm, reps, defaults, onClose }: { crm: CrmState; setCrm: Ctx["setCrm"]; reps: Ctx["reps"]; defaults?: Partial<Activity>; onClose(): void }) {
  const toast = useToast(); const [f, setF] = useState({ type: "Call" as Activity["type"], subject: "", due: addDays(DEMO_TODAY, 3), ownerId: defaults?.ownerId ?? reps[0]?.id ?? "", oppId: defaults?.oppId ?? "" }); const [err, setErr] = useState<Record<string, string>>({});
  const save = () => { const e: Record<string, string> = {}; if (f.subject.trim().length < 3) e.subject = "Describe the follow-up"; if (!f.due) e.due = "Pick a due date"; setErr(e); if (Object.keys(e).length) return;
    setCrm((s) => ({ ...s, activities: [{ id: uid("a"), done: false, contactId: defaults?.contactId, ...f, subject: f.subject.trim(), oppId: f.oppId || undefined }, ...s.activities] })); logActivity("CRM", `Follow-up scheduled: ${f.subject}`); toast("Follow-up scheduled"); onClose(); };
  return (<Modal title="Schedule follow-up" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-activity">Schedule</Btn></>}>
    <div className="grid gap-3 sm:grid-cols-2"><SelectIn label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Activity["type"] })} options={["Call", "Email", "Meeting", "Demo", "Task"]} /><TextIn label="Due date" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} error={err.due} />
      <TextIn label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} error={err.subject} className="sm:col-span-2" /><SelectIn label="Assigned to" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} options={reps.map((r) => ({ value: r.id, label: r.name }))} />
      <SelectIn label="Related deal" value={f.oppId} onChange={(e) => setF({ ...f, oppId: e.target.value })} options={[{ value: "", label: "None" }, ...crm.opps.map((o) => ({ value: o.id, label: o.name }))]} /></div></Modal>);
}
function Activities({ crm, setCrm, reps, repName, coName, openOpp, owner: ws }: Ctx) {
  const [form, setForm] = useState(false); const [status, setStatus] = useState(""); const [type, setType] = useState(""); const [owner, setOwner] = useState(ws);
  const rows = crm.activities.filter((a) => (!status || (status === "done" ? a.done : status === "overdue" ? !a.done && a.due < DEMO_TODAY : !a.done)) && (!type || a.type === type) && (!owner || a.ownerId === owner));
  const cols: Col<Activity>[] = [{ key: "done", label: "Done", noSort: true, noCsv: true, render: (a) => <input type="checkbox" aria-label={`Complete ${a.subject}`} checked={a.done} onChange={() => setCrm((s) => ({ ...s, activities: s.activities.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) }))} /> },
    { key: "type", label: "Type", render: (a) => <Badge>{a.type}</Badge> }, { key: "subject", label: "Subject" }, { key: "deal", label: "Deal", value: (a) => (a.oppId ? coName(crm.opps.find((o) => o.id === a.oppId)?.companyId ?? "") : "—"), render: (a) => (a.oppId ? <button className="text-blue-700 hover:underline" onClick={() => openOpp(a.oppId!)}>{coName(crm.opps.find((o) => o.id === a.oppId)?.companyId ?? "")}</button> : "—") },
    { key: "owner", label: "Owner", value: (a) => repName(a.ownerId) }, { key: "due", label: "Due", render: (a) => <span className={!a.done && a.due < DEMO_TODAY ? "font-semibold text-red-700" : ""}>{fmtDate(a.due)}{!a.done && a.due < DEMO_TODAY ? " · overdue" : ""}</span> }];
  return (<><PageHead title="Sales activities" sub="Calls, emails, meetings and tasks. Simulated: nothing is actually sent or booked." actions={<Btn kind="primary" onClick={() => setForm(true)} testid="new-activity">+ Schedule follow-up</Btn>} />
    <DataTable rows={rows} columns={cols} rowKey={(a) => a.id} exportName="crm-activities" defaultSort={{ key: "due", dir: 1 }} toolbar={<><FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "overdue", label: "Overdue" }, { value: "done", label: "Done" }]} /><FilterSelect label="Type" value={type} onChange={setType} options={["Call", "Email", "Meeting", "Demo", "Task"]} /><FilterSelect label="Owner" value={owner} onChange={setOwner} options={reps.map((r) => ({ value: r.id, label: r.name }))} /></>} testid="activity-table" />
    {form && <ActivityForm crm={crm} setCrm={setCrm} reps={reps} onClose={() => setForm(false)} />}</>);
}

/* ───────── Quotations ───────── */
function QuoteView({ crm, setCrm, coName, contactName, id, onClose, onEdit }: { crm: CrmState; setCrm: Ctx["setCrm"]; coName(id: string): string; contactName(id: string): string; id: string; onClose(): void; onEdit?(q: Quote): void }) {
  const toast = useToast(); const vq = crm.quotes.find((q) => q.id === id); if (!vq) return null;
  const opp = crm.opps.find((o) => o.id === vq.oppId); const t = quoteTotals(vq);
  return (
    <Modal title={`Quotation ${vq.number}`} wide onClose={onClose} footer={<>
      <select aria-label="Quotation status" value={vq.status} className="rounded border border-slate-300 px-2 py-1" onChange={(e) => { setCrm((s) => ({ ...s, quotes: s.quotes.map((q) => (q.id === vq.id ? { ...q, status: e.target.value as Quote["status"] } : q)) })); toast(`Status: ${e.target.value}`); }}>{["Draft", "Sent", "Accepted", "Declined"].map((x) => <option key={x}>{x}</option>)}</select>
      {onEdit && <Btn onClick={() => { onEdit(vq); onClose(); }}>Edit</Btn>}<Btn kind="primary" onClick={printNow} testid="print-quote">Print</Btn></>}>
      <PrintSheet>
        <div className="flex justify-between"><div><h2 className="font-display text-2xl font-semibold">Quotation</h2><p className="text-sm text-slate-500">{vq.number}</p></div><div className="text-right text-sm"><p className="font-semibold">NorthPeak Software Ltd (fictional)</p><p className="text-slate-500">Date {fmtDate(vq.date)} · valid until {fmtDate(vq.validUntil)}</p></div></div>
        <p className="mt-4 text-sm"><span className="text-slate-500">Prepared for</span><br /><strong>{coName(opp?.companyId ?? "")}</strong> · {contactName(opp?.contactId ?? "")}</p>
        <table className="mt-5 w-full text-sm"><thead><tr className="border-b-2 border-slate-300 text-left text-sm text-slate-500"><th className="py-1">Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{vq.lines.map((l, i) => <tr key={i} className="border-b border-slate-100"><td className="py-1.5">{l.desc}</td><td className="text-right">{l.qty}</td><td className="text-right">{money(l.price)}</td><td className="text-right">{money(l.qty * l.price)}</td></tr>)}</tbody></table>
        <dl className="ml-auto mt-4 grid w-64 grid-cols-2 gap-1 text-sm"><dt>Subtotal</dt><dd className="text-right">{money(t.subtotal)}</dd><dt>Discount ({pct(vq.discount)})</dt><dd className="text-right">−{money(t.disc)}</dd><dt>Tax ({pct(vq.tax)})</dt><dd className="text-right">{money(t.tax)}</dd><dt className="border-t border-slate-300 pt-1 font-semibold">Total</dt><dd className="border-t border-slate-300 pt-1 text-right font-display text-lg font-semibold" data-testid="quote-total">{money(t.total)}</dd></dl>
        <p className="mt-6 text-sm text-slate-500">Demonstration quotation with fictional data. Not a binding offer.</p>
      </PrintSheet></Modal>
  );
}
function Quotes({ crm, setCrm, coName, contactName }: Ctx) {
  const [view, setView] = useState<string | null>(null); const [edit, setEdit] = useState<Quote | "new" | null>(null);
  const cols: Col<Quote>[] = [{ key: "number", label: "Quote #", render: (q) => <span className="font-medium">{q.number}</span> }, { key: "deal", label: "Opportunity", value: (q) => crm.opps.find((o) => o.id === q.oppId)?.name ?? "—" }, { key: "co", label: "Customer", value: (q) => coName(crm.opps.find((o) => o.id === q.oppId)?.companyId ?? "") },
    { key: "date", label: "Date", render: (q) => fmtDate(q.date) }, { key: "total", label: "Total", align: "right", value: (q) => quoteTotals(q).total, render: (q) => money(quoteTotals(q).total) }, { key: "status", label: "Status", render: (q) => <Badge tone={q.status === "Accepted" ? "green" : q.status === "Declined" ? "red" : q.status === "Sent" ? "blue" : "slate"}>{q.status}</Badge> }];
  return (<><PageHead title="Quotations" sub="Preview and print quotations. Marking one Sent only changes its status here; nothing is emailed." actions={<Btn kind="primary" onClick={() => setEdit("new")} testid="new-quote">+ New quotation</Btn>} />
    <DataTable rows={crm.quotes} columns={cols} rowKey={(q) => q.id} onRow={(q) => setView(q.id)} exportName="crm-quotations" testid="quote-table" />
    {view && <QuoteView crm={crm} setCrm={setCrm} coName={coName} contactName={contactName} id={view} onClose={() => setView(null)} onEdit={(q) => setEdit(q)} />}
    {edit && <QuoteEditor crm={crm} setCrm={setCrm} existing={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}</>);
}
function QuoteEditor({ crm, setCrm, existing, onClose }: { crm: CrmState; setCrm: Ctx["setCrm"]; existing?: Quote; onClose(): void }) {
  const toast = useToast(); const [oppId, setOppId] = useState(existing?.oppId ?? crm.opps[0]?.id ?? ""); const [lines, setLines] = useState(existing?.lines ?? [{ desc: "", qty: 1, price: 0 }]); const [discount, setDiscount] = useState(String((existing?.discount ?? 0) * 100)); const [tax, setTax] = useState(String((existing?.tax ?? 0) * 100)); const [err, setErr] = useState("");
  const t = quoteTotals({ lines, discount: Number(discount) / 100 || 0, tax: Number(tax) / 100 || 0 });
  const save = () => { if (lines.some((l) => !l.desc.trim() || !(l.qty > 0) || l.price < 0)) return setErr("Every line needs a description, a quantity above 0 and a price of 0 or more."); if (!(Number(discount) >= 0 && Number(discount) <= 100) || !(Number(tax) >= 0 && Number(tax) <= 100)) return setErr("Discount and tax must be between 0 and 100%.");
    const rec = { oppId, lines, discount: Number(discount) / 100, tax: Number(tax) / 100 };
    if (existing) setCrm((s) => ({ ...s, quotes: s.quotes.map((q) => (q.id === existing.id ? { ...q, ...rec } : q)) })); else setCrm((s) => ({ ...s, quotes: [{ id: uid("q"), number: `Q-2026-${String(s.quotes.length + 101).padStart(4, "0")}`, date: DEMO_TODAY, validUntil: addDays(DEMO_TODAY, 30), status: "Draft", ...rec }, ...s.quotes] }));
    toast("Quotation saved"); onClose(); };
  return (<Modal title={existing ? `Edit ${existing.number}` : "New quotation"} wide onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-quote">Save quotation</Btn></>}>
    <SelectIn label="Opportunity" value={oppId} onChange={(e) => setOppId(e.target.value)} options={crm.opps.map((o) => ({ value: o.id, label: `${o.name} (${crm.companies.find((c) => c.id === o.companyId)?.name})` }))} />
    <table className="mt-4 w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th>Description</th><th className="w-20">Qty</th><th className="w-28">Unit price</th><th className="w-28 text-right">Amount</th><th className="w-8" /></tr></thead>
      <tbody>{lines.map((l, i) => <tr key={i}><td className="pr-2"><input aria-label="Description" className="w-full rounded border border-slate-300 px-2 py-1" value={l.desc} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, desc: e.target.value } : x)))} /></td><td className="pr-2"><input aria-label="Quantity" type="number" min={1} className="w-full rounded border border-slate-300 px-2 py-1" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} /></td><td className="pr-2"><input aria-label="Unit price" type="number" min={0} className="w-full rounded border border-slate-300 px-2 py-1" value={l.price} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, price: Number(e.target.value) } : x)))} /></td><td className="text-right tabular-nums">{money(l.qty * l.price)}</td><td><button type="button" aria-label="Remove line" className="text-red-600" onClick={() => setLines(lines.filter((_, k) => k !== i))}>✕</button></td></tr>)}</tbody></table>
    <Btn small className="mt-2" onClick={() => setLines([...lines, { desc: "", qty: 1, price: 0 }])} testid="add-line">+ Add line</Btn>
    <div className="mt-4 flex flex-wrap items-end gap-3"><TextIn label="Discount %" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-28" /><TextIn label="Tax %" type="number" value={tax} onChange={(e) => setTax(e.target.value)} className="w-28" /><p className="ml-auto text-right text-sm">Subtotal {money(t.subtotal)} · Discount −{money(t.disc)} · Tax {money(t.tax)}<br /><strong className="font-display text-lg" data-testid="editor-total">Total {money(t.total)}</strong></p></div>
    {err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}</Modal>);
}

/* ───────── Leads ───────── */
function LeadForm({ reps, existing, onSave, onClose }: { reps: Ctx["reps"]; existing?: Lead; onSave(l: Omit<Lead, "id" | "createdAt" | "notes">): void; onClose(): void }) {
  const [f, setF] = useState({ name: existing?.name ?? "", company: existing?.company ?? "", email: existing?.email ?? "", source: existing?.source ?? "Website", status: existing?.status ?? ("New" as Lead["status"]), score: String(existing?.score ?? 50), ownerId: existing?.ownerId ?? reps[0]?.id ?? "", value: String(existing?.value ?? "") }); const [err, setErr] = useState<Record<string, string>>({});
  const save = () => { const e: Record<string, string> = {}; if (f.name.trim().length < 2) e.name = "Enter the lead's name"; if (!f.company.trim()) e.company = "Enter a company"; if (!emailOk(f.email)) e.email = "Enter a valid email address"; if (!(Number(f.value) >= 0) || f.value === "") e.value = "Enter an estimated value (0 or more)"; if (!(Number(f.score) >= 0 && Number(f.score) <= 100)) e.score = "Score is 0–100"; setErr(e); if (Object.keys(e).length) return; onSave({ ...f, name: f.name.trim(), company: f.company.trim(), score: Number(f.score), value: Number(f.value) }); };
  return (<Modal title={existing ? "Edit lead" : "New lead"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-lead">Save lead</Btn></>}>
    <div className="grid gap-3 sm:grid-cols-2"><TextIn label="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err.name} /><TextIn label="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} error={err.company} /><TextIn label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err.email} />
      <TextIn label="Estimated value (USD)" type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} error={err.value} /><SelectIn label="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} options={["Website", "Referral", "Trade show", "Cold outreach", "Webinar"]} />
      <SelectIn label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Lead["status"] })} options={["New", "Contacted", "Qualified", "Unqualified"]} /><TextIn label="Score (0–100)" type="number" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} error={err.score} /><SelectIn label="Owner" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} options={reps.map((r) => ({ value: r.id, label: r.name }))} /></div></Modal>);
}
function Leads({ crm, setCrm, reps, repName, owner: ws, focus }: Ctx) {
  const toast = useToast(); const confirm = useConfirm(); const [form, setForm] = useState<Lead | "new" | null>(null); const [status, setStatus] = useState(""); const [source, setSource] = useState(""); const [owner, setOwner] = useState(ws); const [open, setOpen] = useState<string | null>(focus);
  const rows = crm.leads.filter((l) => (!status || l.status === status) && (!source || l.source === source) && (!owner || l.ownerId === owner));
  const convert = (l: Lead) => { const co = crm.companies.find((c) => c.name.toLowerCase() === l.company.toLowerCase()); const coId = co?.id ?? uid("c"); const kId = uid("k"); const oId = uid("o");
    setCrm((s) => ({ ...s, companies: co ? s.companies : [...s.companies, { id: coId, name: l.company, industry: "Other", size: "10–50", city: "—", country: "—", website: "", ownerId: l.ownerId, notes: [] }],
      contacts: [...s.contacts, { id: kId, name: l.name, title: "Lead contact", email: l.email, phone: "", companyId: coId, ownerId: l.ownerId, lastContact: DEMO_TODAY, notes: [] }],
      opps: [{ id: oId, name: `${l.company}: new opportunity`, companyId: coId, contactId: kId, value: l.value, stage: "Qualified", ownerId: l.ownerId, closeDate: addDays(DEMO_TODAY, 60), createdAt: DEMO_TODAY, notes: [] }, ...s.opps], leads: s.leads.map((x) => (x.id === l.id ? { ...x, status: "Qualified" } : x)) }));
    logActivity("CRM", `Lead ${l.name} converted to an opportunity`); toast("Lead converted: opportunity created in Qualified"); void co; return oId; };
  const cols: Col<Lead>[] = [{ key: "name", label: "Lead", render: (l) => <div><p className="font-medium text-slate-900">{l.name}</p><p className="text-xs text-slate-500">{l.email}</p></div>, value: (l) => l.name }, { key: "company", label: "Company" }, { key: "source", label: "Source" }, { key: "status", label: "Status", render: (l) => <Badge tone={leadTone[l.status]}>{l.status}</Badge> },
    { key: "score", label: "Score", align: "right" }, { key: "value", label: "Est. value", align: "right", render: (l) => money(l.value, "USD", 0), value: (l) => l.value }, { key: "owner", label: "Owner", value: (l) => repName(l.ownerId) },
    { key: "actions", label: "", noSort: true, noCsv: true, render: (l) => <div className="flex gap-1" onClick={(e) => e.stopPropagation()}><Btn small onClick={() => setForm(l)} aria-label={`Edit ${l.name}`}>Edit</Btn><Btn small onClick={() => convert(l)} disabled={l.status === "Unqualified"} aria-label={`Convert ${l.name}`}>Convert</Btn><Btn small kind="danger" aria-label={`Delete ${l.name}`} onClick={async () => { if (await confirm(`Delete lead ${l.name}?`)) { setCrm((s) => ({ ...s, leads: s.leads.filter((x) => x.id !== l.id) })); toast("Lead deleted", "amber"); } }}>Delete</Btn></div> }];
  const lead = crm.leads.find((l) => l.id === open);
  return (<><PageHead title="Leads" sub={`${crm.leads.length} leads. Convert a qualified lead to create the company, contact and opportunity.`} actions={<Btn kind="primary" onClick={() => setForm("new")} testid="new-lead">+ New lead</Btn>} />
    <DataTable rows={rows} columns={cols} rowKey={(l) => l.id} onRow={(l) => setOpen(l.id)} exportName="crm-leads" searchPlaceholder="Search leads…" testid="lead-table"
      toolbar={<><FilterSelect label="Status" value={status} onChange={setStatus} options={["New", "Contacted", "Qualified", "Unqualified"]} /><FilterSelect label="Source" value={source} onChange={setSource} options={["Website", "Referral", "Trade show", "Cold outreach", "Webinar"]} /><FilterSelect label="Owner" value={owner} onChange={setOwner} options={reps.map((r) => ({ value: r.id, label: r.name }))} /></>} />
    {form && <LeadForm reps={reps} existing={form === "new" ? undefined : form} onClose={() => setForm(null)} onSave={(rec) => { if (form === "new") { setCrm((s) => ({ ...s, leads: [{ id: uid("L"), createdAt: DEMO_TODAY, notes: [], ...rec }, ...s.leads] })); logActivity("CRM", `Lead created: ${rec.name}`); toast("Lead created"); } else { setCrm((s) => ({ ...s, leads: s.leads.map((x) => (x.id === form.id ? { ...x, ...rec } : x)) })); toast("Lead updated"); } setForm(null); }} />}
    {lead && <NotesDrawer title={lead.name} sub={`${lead.company} · ${lead.source}`} notes={lead.notes} onClose={() => setOpen(null)} onAdd={(t) => { setCrm((s) => ({ ...s, leads: s.leads.map((x) => (x.id === lead.id ? { ...x, notes: [newNote(t), ...x.notes] } : x)) })); toast("Note added"); }} />}</>);
}
function NotesDrawer({ title, sub, notes, onClose, onAdd, children }: { title: string; sub: string; notes: Note[]; onClose(): void; onAdd(t: string): void; children?: React.ReactNode }) {
  const [t, setT] = useState(""); const toast = useToast();
  return (<Drawer title={<span>{title}<span className="block text-xs font-normal text-slate-500">{sub}</span></span>} onClose={onClose}>
    {children}<h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</h4><div className="mt-2 flex gap-2"><input aria-label="New note" value={t} onChange={(e) => setT(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Add a note…" /><Btn kind="primary" testid="drawer-add-note" onClick={() => { if (!t.trim()) return toast("Write a note first", "red"); onAdd(t.trim()); setT(""); }}>Add</Btn></div>
    <div className="mt-3"><Timeline items={notes.map((n) => ({ id: n.id, at: `${fmtDate(n.at)} · ${n.by}`, title: n.text }))} /></div></Drawer>);
}

/* ───────── Contacts & companies ───────── */
function Contacts({ crm, setCrm, reps, repName, coName, openOpp, owner: ws, focus }: Ctx) {
  const toast = useToast(); const confirm = useConfirm(); const [open, setOpen] = useState<string | null>(focus); const [form, setForm] = useState<Contact | "new" | null>(null); const [co, setCo] = useState(""); const [owner, setOwner] = useState(ws);
  const rows = crm.contacts.filter((c) => (!co || c.companyId === co) && (!owner || c.ownerId === owner)); const c = crm.contacts.find((x) => x.id === open);
  const cols: Col<Contact>[] = [{ key: "name", label: "Contact", render: (k) => <span className="flex items-center gap-2"><Avatar name={k.name} /><span><span className="block font-medium text-slate-900">{k.name}</span><span className="block text-xs text-slate-500">{k.title}</span></span></span>, value: (k) => k.name }, { key: "co", label: "Company", value: (k) => coName(k.companyId) }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "owner", label: "Owner", value: (k) => repName(k.ownerId) }, { key: "lastContact", label: "Last contact", render: (k) => fmtDate(k.lastContact) }];
  return (<><PageHead title="Contacts" sub="Open a contact for the full profile, linked deals, activities and notes." actions={<Btn kind="primary" onClick={() => setForm("new")} testid="new-contact">+ New contact</Btn>} />
    <DataTable rows={rows} columns={cols} rowKey={(k) => k.id} onRow={(k) => setOpen(k.id)} exportName="crm-contacts" searchPlaceholder="Search contacts…" toolbar={<><FilterSelect label="Company" value={co} onChange={setCo} options={crm.companies.map((x) => ({ value: x.id, label: x.name }))} /><FilterSelect label="Owner" value={owner} onChange={setOwner} options={reps.map((r) => ({ value: r.id, label: r.name }))} /></>} testid="contact-table" />
    {c && <NotesDrawer title={c.name} sub={`${c.title} · ${coName(c.companyId)}`} notes={c.notes} onClose={() => setOpen(null)} onAdd={(t) => { setCrm((s) => ({ ...s, contacts: s.contacts.map((x) => (x.id === c.id ? { ...x, notes: [newNote(t), ...x.notes] } : x)) })); toast("Note added"); }}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm"><dt className="text-slate-500">Email</dt><dd>{c.email}</dd><dt className="text-slate-500">Phone</dt><dd>{c.phone || "—"}</dd><dt className="text-slate-500">Account owner</dt><dd>{repName(c.ownerId)}</dd><dt className="text-slate-500">Last contact</dt><dd>{fmtDate(c.lastContact)}</dd></dl>
      <div className="mt-3 flex gap-2"><Btn small onClick={() => { setForm(c); setOpen(null); }}>Edit</Btn><Btn small kind="danger" onClick={async () => { if (await confirm(`Delete ${c.name}?`)) { setCrm((s) => ({ ...s, contacts: s.contacts.filter((x) => x.id !== c.id) })); setOpen(null); toast("Contact deleted", "amber"); } }}>Delete</Btn></div>
      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Linked opportunities</h4><ul className="mt-1 space-y-1 text-sm">{crm.opps.filter((o) => o.contactId === c.id).map((o) => <li key={o.id}><button className="text-blue-700 hover:underline" onClick={() => openOpp(o.id)}>{o.name}</button> <Badge tone={stageTone(o.stage)}>{o.stage}</Badge> <span className="text-slate-500">{money(o.value, "USD", 0)}</span></li>)}{!crm.opps.some((o) => o.contactId === c.id) && <li className="text-slate-400">None</li>}</ul>
      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Activities</h4><ul className="mt-1 space-y-1 text-sm">{crm.activities.filter((a) => a.contactId === c.id).map((a) => <li key={a.id} className={a.done ? "text-slate-400 line-through" : ""}>{a.type}: {a.subject} <span className="text-xs text-slate-500">({fmtShort(a.due)})</span></li>)}</ul></NotesDrawer>}
    {form && <ContactForm crm={crm} reps={reps} existing={form === "new" ? undefined : form} onClose={() => setForm(null)} onSave={(rec) => { if (form === "new") { setCrm((s) => ({ ...s, contacts: [{ id: uid("k"), lastContact: DEMO_TODAY, notes: [], ...rec }, ...s.contacts] })); logActivity("CRM", `Contact created: ${rec.name}`); toast("Contact created"); } else { setCrm((s) => ({ ...s, contacts: s.contacts.map((x) => (x.id === form.id ? { ...x, ...rec } : x)) })); toast("Contact updated"); } setForm(null); }} />}</>);
}
function ContactForm({ crm, reps, existing, onSave, onClose }: { crm: CrmState; reps: Ctx["reps"]; existing?: Contact; onSave(c: Omit<Contact, "id" | "lastContact" | "notes">): void; onClose(): void }) {
  const [f, setF] = useState({ name: existing?.name ?? "", title: existing?.title ?? "", email: existing?.email ?? "", phone: existing?.phone ?? "", companyId: existing?.companyId ?? crm.companies[0]?.id ?? "", ownerId: existing?.ownerId ?? reps[0]?.id ?? "" }); const [err, setErr] = useState<Record<string, string>>({});
  const save = () => { const e: Record<string, string> = {}; if (f.name.trim().length < 2) e.name = "Enter a name"; if (!emailOk(f.email)) e.email = "Enter a valid email"; setErr(e); if (!Object.keys(e).length) onSave({ ...f, name: f.name.trim() }); };
  return (<Modal title={existing ? "Edit contact" : "New contact"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-contact">Save contact</Btn></>}><div className="grid gap-3 sm:grid-cols-2"><TextIn label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err.name} /><TextIn label="Job title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><TextIn label="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err.email} /><TextIn label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /><SelectIn label="Company" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })} options={crm.companies.map((c) => ({ value: c.id, label: c.name }))} /><SelectIn label="Account owner" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} options={reps.map((r) => ({ value: r.id, label: r.name }))} /></div></Modal>);
}
function Companies({ crm, setCrm, reps, repName, openOpp, focus }: Ctx) {
  const toast = useToast(); const [open, setOpen] = useState<string | null>(focus); const [form, setForm] = useState<Company | "new" | null>(null); const [ind, setInd] = useState("");
  const rows = crm.companies.filter((c) => !ind || c.industry === ind); const c = crm.companies.find((x) => x.id === open);
  const won = (id: string) => sum(crm.opps.filter((o) => o.companyId === id && o.stage === "Won"), (o) => o.value);
  const cols: Col<Company>[] = [{ key: "name", label: "Company", render: (x) => <span className="font-medium text-slate-900">{x.name}</span> }, { key: "industry", label: "Industry" }, { key: "size", label: "Size" }, { key: "loc", label: "Location", value: (x) => `${x.city}, ${x.country}` }, { key: "contacts", label: "Contacts", align: "right", value: (x) => crm.contacts.filter((k) => k.companyId === x.id).length }, { key: "open", label: "Open pipeline", align: "right", value: (x) => sum(openOppsOf(crm.opps.filter((o) => o.companyId === x.id)), (o) => o.value), render: (x) => money(sum(openOppsOf(crm.opps.filter((o) => o.companyId === x.id)), (o) => o.value), "USD", 0) }, { key: "won", label: "Won", align: "right", value: (x) => won(x.id), render: (x) => money(won(x.id), "USD", 0) }, { key: "owner", label: "Owner", value: (x) => repName(x.ownerId) }];
  return (<><PageHead title="Companies" actions={<Btn kind="primary" onClick={() => setForm("new")} testid="new-company">+ New company</Btn>} />
    <DataTable rows={rows} columns={cols} rowKey={(x) => x.id} onRow={(x) => setOpen(x.id)} exportName="crm-companies" searchPlaceholder="Search companies…" toolbar={<FilterSelect label="Industry" value={ind} onChange={setInd} options={[...new Set(crm.companies.map((x) => x.industry))].sort()} />} testid="company-table" />
    {c && <NotesDrawer title={c.name} sub={`${c.industry} · ${c.city}, ${c.country}`} notes={c.notes} onClose={() => setOpen(null)} onAdd={(t) => { setCrm((s) => ({ ...s, companies: s.companies.map((x) => (x.id === c.id ? { ...x, notes: [newNote(t), ...x.notes] } : x)) })); toast("Note added"); }}>
      <p className="text-sm text-slate-600">{c.website} · {c.size} employees · owner {repName(c.ownerId)}</p><div className="mt-2"><Btn small onClick={() => { setForm(c); setOpen(null); }}>Edit</Btn></div>
      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Contacts</h4><ul className="mt-1 text-sm">{crm.contacts.filter((k) => k.companyId === c.id).map((k) => <li key={k.id}>{k.name} <span className="text-slate-500">· {k.title}</span></li>)}</ul>
      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Opportunities</h4><ul className="mt-1 space-y-1 text-sm">{crm.opps.filter((o) => o.companyId === c.id).map((o) => <li key={o.id}><button className="text-blue-700 hover:underline" onClick={() => openOpp(o.id)}>{o.name}</button> <Badge tone={stageTone(o.stage)}>{o.stage}</Badge> {money(o.value, "USD", 0)}</li>)}</ul></NotesDrawer>}
    {form && <CompanyForm reps={reps} existing={form === "new" ? undefined : form} onClose={() => setForm(null)} onSave={(rec) => { if (form === "new") { setCrm((s) => ({ ...s, companies: [{ id: uid("c"), notes: [], website: "", ...rec }, ...s.companies] })); logActivity("CRM", `Company created: ${rec.name}`); toast("Company created"); } else { setCrm((s) => ({ ...s, companies: s.companies.map((x) => (x.id === form.id ? { ...x, ...rec } : x)) })); toast("Company updated"); } setForm(null); }} />}</>);
}
function CompanyForm({ reps, existing, onSave, onClose }: { reps: Ctx["reps"]; existing?: Company; onSave(c: Omit<Company, "id" | "notes" | "website">): void; onClose(): void }) {
  const [f, setF] = useState({ name: existing?.name ?? "", industry: existing?.industry ?? "", size: existing?.size ?? "10–50", city: existing?.city ?? "", country: existing?.country ?? "", ownerId: existing?.ownerId ?? reps[0]?.id ?? "" }); const [err, setErr] = useState<Record<string, string>>({});
  const save = () => { const e: Record<string, string> = {}; if (f.name.trim().length < 2) e.name = "Enter a company name"; if (!f.industry.trim()) e.industry = "Enter an industry"; setErr(e); if (!Object.keys(e).length) onSave({ ...f, name: f.name.trim() }); };
  return (<Modal title={existing ? "Edit company" : "New company"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-company">Save company</Btn></>}><div className="grid gap-3 sm:grid-cols-2"><TextIn label="Company name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err.name} /><TextIn label="Industry" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} error={err.industry} /><SelectIn label="Size" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} options={["10–50", "50–200", "200–500", "500+"]} /><SelectIn label="Account owner" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })} options={reps.map((r) => ({ value: r.id, label: r.name }))} /><TextIn label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /><TextIn label="Country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></div></Modal>);
}

/* ───────── Reports ───────── */
function Reports({ crm, reps, repName, coName }: Ctx) {
  const [tab, setTab] = useState("summary"); const m = crmMetrics(crm);
  const byOwner = reps.map((r) => { const mine = crm.opps.filter((o) => o.ownerId === r.id); const w = mine.filter((o) => o.stage === "Won"), l = mine.filter((o) => o.stage === "Lost"); return { id: r.id, name: r.name, open: sum(openOppsOf(mine), (o) => o.value), forecast: sum(openOppsOf(mine), (o) => o.value * STAGE_PROB[o.stage]), won: sum(w, (o) => o.value), wonN: w.length, lostN: l.length, rate: w.length + l.length ? w.length / (w.length + l.length) : 0 }; });
  const byStage = STAGES.map((s) => ({ stage: s, n: crm.opps.filter((o) => o.stage === s).length, value: sum(crm.opps.filter((o) => o.stage === s), (o) => o.value) }));
  const months = lastNMonths(8, "2026-06-30").slice(0); const fc = months.map((k) => ({ label: monthLabel(k), values: { weighted: sum(openOppsOf(crm.opps).filter((o) => monthKey(o.closeDate) === k), (o) => o.value * STAGE_PROB[o.stage]), won: sum(wonOpps(crm.opps).filter((o) => monthKey(o.closeDate) === k), (o) => o.value) } }));
  const lostReasons = Object.entries(groupBy(m.lost, (o) => o.lostReason ?? "No reason")).map(([label, v]) => ({ label, value: v.length }));
  const exportCustomers = () => downloadCsv("crm-customers", [["Company", "Industry", "Country", "Contact", "Title", "Email", "Owner"], ...crm.contacts.map((k) => { const c = crm.companies.find((x) => x.id === k.companyId); return [c?.name, c?.industry, c?.country, k.name, k.title, k.email, repName(k.ownerId)]; })]);
  const exportOpps = () => downloadCsv("crm-opportunities-report", [["Opportunity", "Company", "Stage", "Value", "Probability", "Weighted value", "Owner", "Close date"], ...crm.opps.map((o) => [o.name, coName(o.companyId), o.stage, o.value, STAGE_PROB[o.stage], o.value * STAGE_PROB[o.stage], repName(o.ownerId), o.closeDate])]);
  return (<><PageHead title="Sales reports" sub="All figures are calculated from the current records." actions={<><Btn onClick={exportCustomers} testid="export-customers">Export customers CSV</Btn><Btn onClick={exportOpps} testid="export-opps">Export opportunities CSV</Btn></>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ id: "summary", label: "Summary" }, { id: "owner", label: "By salesperson" }, { id: "stage", label: "By stage" }, { id: "forecast", label: "Forecast" }, { id: "lost", label: "Lost deals" }]} />
    <div className="mt-4 space-y-4">
      {tab === "summary" && <Summary crm={crm} repName={repName} coName={coName} />}
      {tab === "owner" && <Panel pad={false}><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-sm text-slate-500"><tr><th className="p-2">Salesperson</th><th className="p-2 text-right">Open</th><th className="p-2 text-right">Forecast</th><th className="p-2 text-right">Won</th><th className="p-2 text-right">Won / lost</th><th className="p-2 text-right">Win rate</th></tr></thead><tbody>{byOwner.map((r) => <tr key={r.id} className="border-t"><td className="p-2 font-medium">{r.name}</td><td className="p-2 text-right tabular-nums">{money(r.open, "USD", 0)}</td><td className="p-2 text-right tabular-nums">{money(r.forecast, "USD", 0)}</td><td className="p-2 text-right tabular-nums">{money(r.won, "USD", 0)}</td><td className="p-2 text-right">{r.wonN} / {r.lostN}</td><td className="p-2 text-right">{pct(r.rate)}</td></tr>)}</tbody></table></Panel>}
      {tab === "stage" && <Panel title="Pipeline by stage"><BarChart ariaLabel="Value by stage" data={byStage.map((s) => ({ label: s.stage, values: { value: s.value } }))} series={[{ key: "value", label: "Deal value" }]} fmt={moneyK} /><p className="mt-2 text-xs text-slate-500">{byStage.map((s) => `${s.stage}: ${s.n} deals`).join(" · ")}</p></Panel>}
      {tab === "forecast" && <Panel title="Won and weighted forecast by expected close month"><BarChart ariaLabel="Forecast by month" data={fc} series={[{ key: "won", label: "Won" }, { key: "weighted", label: "Weighted open pipeline" }]} stacked fmt={moneyK} /></Panel>}
      {tab === "lost" && <Panel title={`Lost deals (${m.lost.length}), ${money(sum(m.lost, (o) => o.value), "USD", 0)}`}>{lostReasons.length ? <Donut slices={lostReasons} center={<>{m.lost.length}<br />lost</>} /> : <Empty>No lost deals.</Empty>}</Panel>}
    </div></>);
}

/* ───────── Summary (first tab of Reports) ───────── */
function Summary({ crm, repName, coName }: Pick<Ctx, "crm" | "repName" | "coName">) {
  const m = crmMetrics(crm);
  const byStage = STAGES.filter((s) => s !== "Won" && s !== "Lost").map((s) => ({ label: s, value: sum(crm.opps.filter((o) => o.stage === s), (o) => o.value) }));
  const months = lastNMonths(6); const wonByMonth = months.map((k) => ({ label: monthLabel(k), values: { won: sum(wonOpps(crm.opps).filter((o) => monthKey(o.closeDate) === k), (o) => o.value) } }));
  const sources = Object.entries(groupBy(crm.leads, (l) => l.source)).map(([label, v]) => ({ label, value: v.length }));
  const upcoming = crm.activities.filter((a) => !a.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  const board = Object.entries(groupBy(crm.opps, (o) => o.ownerId)).map(([id, v]) => ({ label: repName(id), value: sum(v.filter((o) => o.stage === "Won"), (o) => o.value), sub: `${money(sum(openOppsOf(v), (o) => o.value), "USD", 0)} open` })).sort((a, b) => b.value - a.value);
  return (
    <>
      <p className="mb-3 text-[15px] text-slate-600">{`Calculated from ${crm.opps.length} opportunities, ${crm.leads.length} leads and ${crm.activities.length} activities. Demo date ${fmtDate(DEMO_TODAY)}.`}</p>
      <KpiRow>
        <Kpi label="Open pipeline" value={moneyK(m.pipeline)} sub={`${m.open.length} open deals`} testid="kpi-pipeline" />
        <Kpi label="Weighted forecast" value={moneyK(m.forecast)} sub="value × stage probability" testid="kpi-forecast" />
        <Kpi label="Won revenue" value={moneyK(m.wonValue)} sub={`${m.won.length} deals won`} testid="kpi-won" />
        <Kpi label="Win rate" value={pct(m.winRate)} sub={`${m.won.length} won / ${m.lost.length} lost`} />
        <Kpi label="Avg. deal size" value={moneyK(m.avgDeal)} sub="won deals" />
        <Kpi label="Overdue follow-ups" value={crm.activities.filter((a) => !a.done && a.due < DEMO_TODAY).length} tone={crm.activities.some((a) => !a.done && a.due < DEMO_TODAY) ? "red" : undefined} />
      </KpiRow>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Pipeline value by stage" className="lg:col-span-2"><HBars items={byStage} fmt={(n) => money(n, "USD", 0)} /></Panel>
        <Panel title="Lead sources"><Donut slices={sources} center={<>{crm.leads.length}<br />leads</>} /></Panel>
        <Panel title="Won revenue, last 6 months" className="lg:col-span-2"><BarChart ariaLabel="Won revenue by month" data={wonByMonth} series={[{ key: "won", label: "Won revenue" }]} fmt={(n) => moneyK(n)} /></Panel>
        <Panel title="Salesperson leaderboard"><HBars items={board} fmt={(n) => money(n, "USD", 0)} /></Panel>
        <Panel title="Upcoming follow-ups" className="lg:col-span-3" pad={false}>
          <ul className="divide-y divide-slate-100">{upcoming.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm"><Badge tone={a.due < DEMO_TODAY ? "red" : "slate"}>{a.type}</Badge><span className="flex-1">{a.subject}</span><span className="text-xs text-slate-500">{repName(a.ownerId)} · due {fmtShort(a.due)}</span>{a.oppId && <span className="text-sm text-slate-600">{coName(crm.opps.find((o) => o.id === a.oppId)?.companyId ?? "")}</span>}</li>)}</ul>
        </Panel>
      </div>
    </>
  );
}
