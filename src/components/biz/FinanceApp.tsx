"use client";
import { useMemo, useState } from "react";
import { logActivity, resetDb, useSlice } from "@/lib/biz/db";
import { AGE_BUCKETS, PERIODS, ageBucket, balanceOf, balanceSheet, billStatus, cashSummary, docTotals, invStatus, monthlyPL, paidOf, periodOf, profitAndLoss, type DocStatus } from "@/lib/biz/fin-calc";
import type { Bill, Expense, FinLine, Invoice } from "@/lib/biz/seed-fin";
import { DEMO_CURRENCY, DEMO_TODAY, addDays, downloadCsv, fmtDate, groupBy, monthLabel, money, moneyK, pct, round2, sum, uid } from "@/lib/biz/util";
import type { Branding } from "@/lib/types";
import { Badge, BarChart, Btn, DataTable, Donut, Empty, ErpShell, FilterSelect, HBars, Kpi, KpiRow, LineChart, Modal, Notice, PageHead, Panel, PrintSheet, SelectIn, Tabs, TextIn, printNow, useConfirm, useToast, type Col } from "./kit";

const NAV = [{ id: "dash", label: "Dashboard", group: "Overview" }, { id: "analytics", label: "Financial analytics", group: "Overview" },
  { id: "invoices", label: "Customer invoices", group: "Sales" }, { id: "ar", label: "Accounts receivable", group: "Sales" },
  { id: "bills", label: "Supplier bills", group: "Purchases" }, { id: "ap", label: "Accounts payable", group: "Purchases" }, { id: "expenses", label: "Expenses", group: "Purchases" },
  { id: "payments", label: "Payments & transactions", group: "Cash" }, { id: "accounts", label: "Chart of accounts", group: "Ledger" },
  { id: "pnl", label: "Profit & loss", group: "Reports" }, { id: "bs", label: "Balance sheet", group: "Reports" }, { id: "cf", label: "Cash flow", group: "Reports" }];
const sTone = (s: DocStatus) => (s === "Paid" ? "green" : s === "Overdue" ? "red" : s === "Partially paid" ? "amber" : s === "Draft" ? "slate" : "blue") as "green" | "red" | "amber" | "slate" | "blue";
const M = (n: number) => money(n, DEMO_CURRENCY);

export default function FinanceApp({ branding }: { branding: Branding }) {
  const [screen, setScreen] = useState("dash"); const [period, setPeriod] = useState("qtd");
  const [fin] = useSlice("fin");
  const overdue = fin.invoices.filter((i) => invStatus(i) === "Overdue").length;
  return (
    <ErpShell branding={branding} title="NorthPeak Finance" subtitle={`Accounting & reporting · ${DEMO_CURRENCY} · demo date ${fmtDate(DEMO_TODAY)}`} nav={NAV.map((n) => (n.id === "invoices" ? { ...n, badge: overdue || undefined } : n))} active={screen} onNav={setScreen} onReset={() => resetDb(["fin"])}
      note="Demonstration accounting software with fictional data. Not certified accounting, audit or tax software, and tax rates are demo assumptions. Stored only in this browser (localStorage); no server or database.">
      {screen === "dash" && <Dash period={period} setPeriod={setPeriod} go={setScreen} />}
      {screen === "analytics" && <Analytics period={period} setPeriod={setPeriod} />}
      {screen === "invoices" && <Invoices />}
      {screen === "ar" && <Ageing kind="ar" />}
      {screen === "bills" && <Bills />}
      {screen === "ap" && <Ageing kind="ap" />}
      {screen === "expenses" && <Expenses />}
      {screen === "payments" && <Transactions />}
      {screen === "accounts" && <Accounts period={period} />}
      {screen === "pnl" && <PnL period={period} setPeriod={setPeriod} />}
      {screen === "bs" && <BalanceSheetScreen period={period} setPeriod={setPeriod} />}
      {screen === "cf" && <CashFlow period={period} setPeriod={setPeriod} />}
    </ErpShell>
  );
}
const PeriodSelect = ({ value, onChange }: { value: string; onChange(v: string): void }) => <select aria-label="Reporting period" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" data-testid="period">{PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>;
const custName = (cos: { id: string; name: string }[], id: string) => cos.find((c) => c.id === id)?.name ?? "Unknown customer";

/* ───────── Dashboard ───────── */
function Dash({ period, setPeriod, go }: { period: string; setPeriod(v: string): void; go(s: string): void }) {
  const [fin] = useSlice("fin"); const [crm] = useSlice("crm"); const pr = periodOf(period);
  const pl = profitAndLoss(fin, pr.from, pr.to), cash = cashSummary(fin, pr.from, pr.to);
  const arTotal = sum(fin.invoices.filter((i) => !i.draft), (i) => balanceOf(i)), apTotal = sum(fin.bills, (b) => balanceOf(b));
  const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]; const mp = monthlyPL(fin, months);
  const od = fin.invoices.filter((i) => invStatus(i) === "Overdue").sort((a, b) => balanceOf(b) - balanceOf(a));
  return (<>
    <PageHead title="Finance dashboard" sub={`${pr.label}. Every figure is calculated from invoices, bills, expenses and payments.`} actions={<PeriodSelect value={period} onChange={setPeriod} />} />
    <KpiRow><Kpi label="Revenue" value={moneyK(pl.totalRevenue)} sub="invoiced, excl. tax" testid="kpi-revenue" /><Kpi label="Expenses" value={moneyK(pl.totalExpenses)} sub="bills + expenses" /><Kpi label="Net profit" value={moneyK(pl.netProfit)} tone={pl.netProfit < 0 ? "red" : undefined} sub={pl.totalRevenue ? `${pct(pl.netProfit / pl.totalRevenue)} margin` : ""} testid="kpi-profit" />
      <Kpi label="Cash at bank" value={moneyK(cash.closing)} sub={`net ${moneyK(cash.net)} in period`} /><Kpi label="Receivable" value={moneyK(arTotal)} sub={`${od.length} overdue`} tone={od.length ? "amber" : undefined} onClick={() => go("ar")} testid="kpi-ar" /><Kpi label="Payable" value={moneyK(apTotal)} onClick={() => go("ap")} /></KpiRow>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Panel title="Revenue vs expenses by month" className="lg:col-span-2"><BarChart ariaLabel="Revenue vs expenses" data={mp.map((m) => ({ label: monthLabel(m.month), values: { revenue: m.revenue, expenses: m.expenses } }))} series={[{ key: "revenue", label: "Revenue" }, { key: "expenses", label: "Expenses", color: "#f59e0b" }]} fmt={moneyK} /></Panel>
      <Panel title="Overdue invoices" pad={false}><ul className="divide-y divide-slate-100">{od.slice(0, 6).map((i) => <li key={i.id} className="flex items-center justify-between px-4 py-2 text-sm"><span><span className="font-medium">{i.number}</span><span className="block text-xs text-slate-500">{custName(crm.companies, i.customerId)} · due {fmtDate(i.due)}</span></span><span className="tabular-nums text-red-700">{M(balanceOf(i))}</span></li>)}{od.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Nothing overdue.</li>}</ul></Panel>
      <Panel title="Profit trend" className="lg:col-span-3"><LineChart ariaLabel="Monthly profit" area data={mp.map((m) => ({ label: monthLabel(m.month), values: { profit: m.profit } }))} series={[{ key: "profit", label: "Net profit" }]} fmt={moneyK} height={160} /></Panel>
    </div></>);
}

/* ───────── Invoices ───────── */
function LinesEditor({ lines, setLines, accounts }: { lines: FinLine[]; setLines(l: FinLine[]): void; accounts: { id: string; name: string }[] }) {
  const set = (i: number, p: Partial<FinLine>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...p } : l)));
  return (<div><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th>Description</th><th className="w-20">Qty</th><th className="w-28">Unit price</th><th className="w-44">Account</th><th className="w-28 text-right">Amount</th><th className="w-6" /></tr></thead>
    <tbody>{lines.map((l, i) => <tr key={i}><td className="pr-2 pb-1"><input aria-label="Line description" className="w-full rounded border border-slate-300 px-2 py-1" value={l.desc} onChange={(e) => set(i, { desc: e.target.value })} /></td><td className="pr-2"><input aria-label="Line quantity" type="number" min={0} className="w-full rounded border border-slate-300 px-2 py-1" value={l.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} /></td><td className="pr-2"><input aria-label="Line unit price" type="number" min={0} className="w-full rounded border border-slate-300 px-2 py-1" value={l.price} onChange={(e) => set(i, { price: Number(e.target.value) })} /></td>
      <td className="pr-2"><select aria-label="Line account" className="w-full rounded border border-slate-300 px-1 py-1" value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.id} {a.name}</option>)}</select></td><td className="text-right tabular-nums">{M(l.qty * l.price)}</td><td><button type="button" aria-label="Remove line" className="text-red-600" onClick={() => setLines(lines.filter((_, k) => k !== i))}>✕</button></td></tr>)}</tbody></table>
    <Btn small className="mt-2" onClick={() => setLines([...lines, { desc: "", qty: 1, price: 0, accountId: accounts[0]?.id ?? "4000" }])} testid="add-line">+ Add line item</Btn></div>);
}
const validLines = (l: FinLine[]) => l.length > 0 && l.every((x) => x.desc.trim() && x.qty > 0 && x.price >= 0);

function InvoiceEditor({ existing, onClose }: { existing?: Invoice; onClose(): void }) {
  const [fin, setFin] = useSlice("fin"); const [crm] = useSlice("crm"); const toast = useToast();
  const rev = fin.accounts.filter((a) => a.type === "Revenue");
  const [f, setF] = useState({ customerId: existing?.customerId ?? crm.companies[0]?.id ?? "", date: existing?.date ?? DEMO_TODAY, due: existing?.due ?? addDays(DEMO_TODAY, 30), taxRate: String((existing?.taxRate ?? 0.08) * 100), notes: existing?.notes ?? "Payment terms: 30 days.", draft: existing?.draft ?? false });
  const [lines, setLines] = useState<FinLine[]>(existing?.lines ?? [{ desc: "", qty: 1, price: 0, accountId: "4100" }]); const [err, setErr] = useState("");
  const t = docTotals({ lines, taxRate: (Number(f.taxRate) || 0) / 100 });
  const save = () => {
    if (!validLines(lines)) return setErr("Each line item needs a description, a quantity above 0 and a price of 0 or more."); if (!(Number(f.taxRate) >= 0 && Number(f.taxRate) <= 30)) return setErr("Tax rate must be between 0% and 30%."); if (f.due < f.date) return setErr("Due date cannot be before the invoice date.");
    const rec = { customerId: f.customerId, date: f.date, due: f.due, lines, taxRate: Number(f.taxRate) / 100, notes: f.notes, draft: f.draft };
    if (existing) setFin((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === existing.id ? { ...i, ...rec } : i)) }));
    else { const no = s0(fin.invoices.length); setFin((s) => ({ ...s, invoices: [{ id: uid("inv"), number: no, payments: [], ...rec }, ...s.invoices] })); logActivity("Finance", `Invoice ${no} created (${M(t.total)})`); }
    toast(existing ? "Invoice updated" : "Invoice created"); onClose();
  };
  const s0 = (n: number) => `INV-${1001 + n + 100}`;
  return (<Modal title={existing ? `Edit ${existing.number}` : "New invoice"} wide onClose={onClose} footer={<><label className="mr-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={f.draft} onChange={(e) => setF({ ...f, draft: e.target.checked })} />Save as draft (excluded from reports)</label><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-invoice">Save invoice</Btn></>}>
    <div className="grid gap-3 sm:grid-cols-4"><SelectIn label="Customer" className="sm:col-span-2" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} options={crm.companies.map((c) => ({ value: c.id, label: c.name }))} /><TextIn label="Invoice date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /><TextIn label="Due date" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
    <div className="mt-4"><LinesEditor lines={lines} setLines={setLines} accounts={rev} /></div>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><TextIn label="Tax rate % (demo assumption)" type="number" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} className="w-44" /><dl className="grid grid-cols-2 gap-x-6 text-sm"><dt>Subtotal</dt><dd className="text-right tabular-nums" data-testid="inv-subtotal">{M(t.subtotal)}</dd><dt>Tax</dt><dd className="text-right tabular-nums" data-testid="inv-tax">{M(t.tax)}</dd><dt className="font-semibold">Total ({DEMO_CURRENCY})</dt><dd className="text-right font-display text-lg font-semibold tabular-nums" data-testid="inv-total">{M(t.total)}</dd></dl></div>
    <TextIn label="Notes" className="mt-3" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />{err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}</Modal>);
}
function PaymentForm({ doc, kind, onClose, onSave }: { doc: Invoice | Bill; kind: "in" | "out"; onClose(): void; onSave(p: { date: string; amount: number; method: string; ref: string }): void }) {
  const bal = balanceOf(doc); const [f, setF] = useState({ amount: String(bal), date: DEMO_TODAY, method: "Bank transfer", ref: "" }); const [err, setErr] = useState("");
  return (<Modal title={`${kind === "in" ? "Record payment received" : "Record payment made"}: ${doc.number}`} small onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" testid="save-payment" onClick={() => { const a = Number(f.amount); if (!(a > 0)) return setErr("Enter an amount above 0."); if (a > bal + 0.004) return setErr(`The amount cannot exceed the outstanding balance of ${M(bal)}.`); onSave({ ...f, amount: round2(a), ref: f.ref || `${kind === "in" ? "RCPT" : "PAY"}-${Date.now().toString().slice(-5)}` }); }}>Record payment</Btn></>}>
    <Notice tone="blue">Simulated: this only records the payment in this demo. No money moves.</Notice><p className="mt-2 text-sm">Outstanding: <strong>{M(bal)}</strong></p>
    <div className="mt-2 grid gap-3"><TextIn label="Amount" type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /><TextIn label="Payment date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /><SelectIn label="Method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={["Bank transfer", "Card", "Cheque", "Cash"]} /><TextIn label="Reference" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></div>{err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}</Modal>);
}
function Invoices() {
  const [fin, setFin] = useSlice("fin"); const [crm] = useSlice("crm"); const toast = useToast(); const confirm = useConfirm();
  const [edit, setEdit] = useState<Invoice | "new" | null>(null); const [view, setView] = useState<string | null>(null); const [pay, setPay] = useState<string | null>(null); const [status, setStatus] = useState(""); const [cust, setCust] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const rows = fin.invoices.filter((i) => (!status || invStatus(i) === status) && (!cust || i.customerId === cust) && (!from || i.date >= from) && (!to || i.date <= to));
  const cols: Col<Invoice>[] = [{ key: "number", label: "Invoice", render: (i) => <span className="font-medium text-slate-900">{i.number}</span> }, { key: "cust", label: "Customer", value: (i) => custName(crm.companies, i.customerId) }, { key: "date", label: "Date", render: (i) => fmtDate(i.date) }, { key: "due", label: "Due", render: (i) => fmtDate(i.due) },
    { key: "total", label: "Total", align: "right", value: (i) => docTotals(i).total, render: (i) => M(docTotals(i).total) }, { key: "bal", label: "Outstanding", align: "right", value: (i) => (i.draft ? 0 : balanceOf(i)), render: (i) => (i.draft ? "—" : M(balanceOf(i))) }, { key: "status", label: "Status", value: (i) => invStatus(i), render: (i) => <Badge tone={sTone(invStatus(i))}>{invStatus(i)}</Badge> }];
  const inv = fin.invoices.find((i) => i.id === view);
  return (<><PageHead title="Customer invoices" sub="Click an invoice to view, record a payment or print it." actions={<Btn kind="primary" onClick={() => setEdit("new")} testid="new-invoice">+ New invoice</Btn>} />
    <DataTable rows={rows} columns={cols} rowKey={(i) => i.id} onRow={(i) => setView(i.id)} exportName="finance-invoices" searchPlaceholder="Search invoices…" testid="invoice-table" defaultSort={{ key: "date", dir: -1 }}
      toolbar={<><FilterSelect label="Status" value={status} onChange={setStatus} options={["Draft", "Open", "Partially paid", "Paid", "Overdue"]} /><FilterSelect label="Customer" value={cust} onChange={setCust} options={crm.companies.map((c) => ({ value: c.id, label: c.name }))} /><label className="flex items-center gap-1 text-xs text-slate-500">From <input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /></label><label className="flex items-center gap-1 text-xs text-slate-500">To <input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /></label></>} />
    {edit && <InvoiceEditor existing={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    {inv && (() => { const t = docTotals(inv), bal = balanceOf(inv), st = invStatus(inv); return (
      <Modal title={`Invoice ${inv.number}`} wide onClose={() => setView(null)} footer={<>{!inv.draft && bal > 0.004 && <Btn kind="primary" onClick={() => setPay(inv.id)} testid="record-payment">Record payment</Btn>}{inv.draft && <Btn kind="primary" onClick={() => { setFin((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === inv.id ? { ...i, draft: false } : i)) })); toast("Invoice issued"); }}>Issue invoice</Btn>}<Btn onClick={() => { setEdit(inv); setView(null); }}>Edit</Btn><Btn onClick={printNow} testid="print-invoice">Print invoice</Btn>
        <Btn kind="danger" onClick={async () => { if (inv.payments.length) return toast("This invoice has payments recorded and cannot be deleted.", "red"); if (await confirm(`Delete invoice ${inv.number}?`)) { setFin((s) => ({ ...s, invoices: s.invoices.filter((i) => i.id !== inv.id) })); setView(null); toast("Invoice deleted", "amber"); } }}>Delete</Btn></>}>
        <PrintSheet>
          <div className="flex justify-between"><div><h2 className="font-display text-2xl font-semibold">INVOICE</h2><p className="text-sm text-slate-500">{inv.number}</p><p className="mt-1"><Badge tone={sTone(st)}>{st}</Badge></p></div><div className="text-right text-sm"><p className="font-semibold">NorthPeak Software Ltd</p><p className="text-slate-500">12 Demo Street · Austin (fictional)<br />Currency: {DEMO_CURRENCY}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><p className="text-xs uppercase text-slate-500">Bill to</p><p className="font-semibold">{custName(crm.companies, inv.customerId)}</p></div><div className="text-right"><p>Date: {fmtDate(inv.date)}</p><p>Due: {fmtDate(inv.due)}</p></div></div>
          <table className="mt-5 w-full text-sm"><thead><tr className="border-b-2 border-slate-300 text-left text-xs uppercase text-slate-500"><th className="py-1">Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead><tbody>{inv.lines.map((l, i) => <tr key={i} className="border-b border-slate-100"><td className="py-1.5">{l.desc}</td><td className="text-right">{l.qty}</td><td className="text-right">{M(l.price)}</td><td className="text-right">{M(l.qty * l.price)}</td></tr>)}</tbody></table>
          <dl className="ml-auto mt-4 grid w-72 grid-cols-2 gap-1 text-sm"><dt>Subtotal</dt><dd className="text-right">{M(t.subtotal)}</dd><dt>Tax ({pct(inv.taxRate, 1)})</dt><dd className="text-right">{M(t.tax)}</dd><dt className="border-t pt-1 font-semibold">Total</dt><dd className="border-t pt-1 text-right font-semibold" data-testid="view-total">{M(t.total)}</dd><dt>Paid</dt><dd className="text-right">−{M(paidOf(inv))}</dd><dt className="font-semibold">Balance due</dt><dd className="text-right font-display text-lg font-semibold" data-testid="view-balance">{M(inv.draft ? t.total : bal)}</dd></dl>
          {inv.payments.length > 0 && <div className="mt-4 text-xs text-slate-600"><p className="font-semibold">Payments received</p>{inv.payments.map((p) => <p key={p.id}>{fmtDate(p.date)} · {p.method} · {p.ref} · {M(p.amount)}</p>)}</div>}
          <p className="mt-6 text-xs text-slate-400">{inv.notes} Demonstration document with fictional data.</p>
        </PrintSheet></Modal>); })()}
    {pay && (() => { const d = fin.invoices.find((i) => i.id === pay)!; return <PaymentForm doc={d} kind="in" onClose={() => setPay(null)} onSave={(p) => { setFin((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === d.id ? { ...i, payments: [...i.payments, { id: uid("p"), ...p }] } : i)) })); logActivity("Finance", `Payment ${M(p.amount)} recorded on ${d.number}`); toast(`Payment of ${M(p.amount)} recorded`); setPay(null); }} />; })()}</>);
}

/* ───────── Bills ───────── */
function BillEditor({ existing, onClose }: { existing?: Bill; onClose(): void }) {
  const [fin, setFin] = useSlice("fin"); const toast = useToast(); const exp = fin.accounts.filter((a) => a.type === "Expense");
  const [f, setF] = useState({ supplier: existing?.supplier ?? "", date: existing?.date ?? DEMO_TODAY, due: existing?.due ?? addDays(DEMO_TODAY, 30), taxRate: String((existing?.taxRate ?? 0.08) * 100) }); const [lines, setLines] = useState<FinLine[]>(existing?.lines ?? [{ desc: "", qty: 1, price: 0, accountId: "5000" }]); const [err, setErr] = useState("");
  const t = docTotals({ lines, taxRate: (Number(f.taxRate) || 0) / 100 });
  const save = () => { if (f.supplier.trim().length < 2) return setErr("Enter the supplier name."); if (!validLines(lines)) return setErr("Each line needs a description, a quantity above 0 and a price of 0 or more."); if (f.due < f.date) return setErr("Due date cannot be before the bill date.");
    const rec = { supplier: f.supplier.trim(), date: f.date, due: f.due, lines, taxRate: Number(f.taxRate) / 100 };
    if (existing) setFin((s) => ({ ...s, bills: s.bills.map((b) => (b.id === existing.id ? { ...b, ...rec } : b)) })); else { setFin((s) => ({ ...s, bills: [{ id: uid("bill"), number: `BILL-${600 + s.bills.length}`, payments: [], notes: "", ...rec }, ...s.bills] })); logActivity("Finance", `Supplier bill from ${rec.supplier} (${M(t.total)})`); }
    toast(existing ? "Bill updated" : "Bill created"); onClose(); };
  return (<Modal title={existing ? `Edit ${existing.number}` : "New supplier bill"} wide onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-bill">Save bill</Btn></>}>
    <div className="grid gap-3 sm:grid-cols-4"><TextIn label="Supplier" list="fin-suppliers" className="sm:col-span-2" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /><datalist id="fin-suppliers">{[...new Set(fin.bills.map((b) => b.supplier))].map((s) => <option key={s} value={s} />)}</datalist><TextIn label="Bill date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /><TextIn label="Due date" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
    <div className="mt-4"><LinesEditor lines={lines} setLines={setLines} accounts={exp} /></div><div className="mt-4 flex items-end justify-between"><TextIn label="Tax rate %" type="number" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} className="w-32" /><p className="text-right text-sm">Subtotal {M(t.subtotal)} · Tax {M(t.tax)}<br /><strong className="font-display text-lg">Total {M(t.total)}</strong></p></div>{err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}</Modal>);
}
function Bills() {
  const [fin, setFin] = useSlice("fin"); const toast = useToast(); const confirm = useConfirm(); const [edit, setEdit] = useState<Bill | "new" | null>(null); const [pay, setPay] = useState<string | null>(null); const [status, setStatus] = useState("");
  const rows = fin.bills.filter((b) => !status || billStatus(b) === status);
  const cols: Col<Bill>[] = [{ key: "number", label: "Bill", render: (b) => <span className="font-medium">{b.number}</span> }, { key: "supplier", label: "Supplier" }, { key: "date", label: "Date", render: (b) => fmtDate(b.date) }, { key: "due", label: "Due", render: (b) => fmtDate(b.due) }, { key: "total", label: "Total", align: "right", value: (b) => docTotals(b).total, render: (b) => M(docTotals(b).total) }, { key: "bal", label: "Outstanding", align: "right", value: (b) => balanceOf(b), render: (b) => M(balanceOf(b)) }, { key: "st", label: "Status", value: (b) => billStatus(b), render: (b) => <Badge tone={sTone(billStatus(b))}>{billStatus(b)}</Badge> },
    { key: "act", label: "", noSort: true, noCsv: true, render: (b) => <div className="flex gap-1">{balanceOf(b) > 0.004 && <Btn small onClick={() => setPay(b.id)} aria-label={`Pay ${b.number}`}>Pay</Btn>}<Btn small onClick={() => setEdit(b)}>Edit</Btn><Btn small kind="danger" onClick={async () => { if (b.payments.length) return toast("This bill has payments recorded and cannot be deleted.", "red"); if (await confirm(`Delete ${b.number}?`)) { setFin((s) => ({ ...s, bills: s.bills.filter((x) => x.id !== b.id) })); toast("Bill deleted", "amber"); } }}>Delete</Btn></div> }];
  return (<><PageHead title="Supplier bills" actions={<Btn kind="primary" onClick={() => setEdit("new")} testid="new-bill">+ New bill</Btn>} /><DataTable rows={rows} columns={cols} rowKey={(b) => b.id} exportName="finance-bills" toolbar={<FilterSelect label="Status" value={status} onChange={setStatus} options={["Open", "Partially paid", "Paid", "Overdue"]} />} defaultSort={{ key: "date", dir: -1 }} testid="bill-table" />
    {edit && <BillEditor existing={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    {pay && (() => { const d = fin.bills.find((b) => b.id === pay)!; return <PaymentForm doc={d} kind="out" onClose={() => setPay(null)} onSave={(p) => { setFin((s) => ({ ...s, bills: s.bills.map((b) => (b.id === d.id ? { ...b, payments: [...b.payments, { id: uid("bp"), ...p }] } : b)) })); logActivity("Finance", `Paid ${M(p.amount)} on ${d.number}`); toast(`Payment of ${M(p.amount)} recorded`); setPay(null); }} />; })()}</>);
}

/* ───────── Expenses ───────── */
function Expenses() {
  const [fin, setFin] = useSlice("fin"); const toast = useToast(); const confirm = useConfirm(); const [edit, setEdit] = useState<Expense | "new" | null>(null); const [cat, setCat] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const accts = fin.accounts.filter((a) => a.type === "Expense"); const aName = (id: string) => accts.find((a) => a.id === id)?.name ?? id;
  const rows = fin.expenses.filter((e) => (!cat || e.accountId === cat) && (!from || e.date >= from) && (!to || e.date <= to)); const total = sum(rows, (e) => e.amount);
  const cols: Col<Expense>[] = [{ key: "date", label: "Date", render: (e) => fmtDate(e.date) }, { key: "vendor", label: "Vendor" }, { key: "cat", label: "Category", value: (e) => aName(e.accountId) }, { key: "note", label: "Description" }, { key: "method", label: "Method" }, { key: "amount", label: "Amount", align: "right", render: (e) => M(e.amount) },
    { key: "act", label: "", noSort: true, noCsv: true, render: (e) => <div className="flex gap-1"><Btn small onClick={() => setEdit(e)}>Edit</Btn><Btn small kind="danger" onClick={async () => { if (await confirm(`Delete this ${M(e.amount)} expense?`)) { setFin((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== e.id) })); toast("Expense deleted", "amber"); } }}>Delete</Btn></div> }];
  return (<><PageHead title="Expenses" sub="Paid expenses by category. Filter by date range and category." actions={<Btn kind="primary" onClick={() => setEdit("new")} testid="new-expense">+ New expense</Btn>} />
    <DataTable rows={rows} columns={cols} rowKey={(e) => e.id} exportName="finance-expenses" defaultSort={{ key: "date", dir: -1 }} testid="expense-table" toolbar={<><FilterSelect label="Category" value={cat} onChange={setCat} options={accts.map((a) => ({ value: a.id, label: a.name }))} /><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /></>}
      footer={<tr><td colSpan={5} className="px-3 py-2 text-right">Total of {rows.length} filtered expenses</td><td className="px-3 py-2 text-right tabular-nums" data-testid="expense-total">{M(total)}</td><td /></tr>} />
    {edit && <ExpenseForm existing={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSave={(rec) => { if (edit === "new") { setFin((s) => ({ ...s, expenses: [{ id: uid("ex"), ...rec }, ...s.expenses] })); logActivity("Finance", `Expense recorded: ${rec.vendor} ${M(rec.amount)}`); toast("Expense created"); } else { setFin((s) => ({ ...s, expenses: s.expenses.map((x) => (x.id === edit.id ? { ...x, ...rec } : x)) })); toast("Expense updated"); } setEdit(null); }} />}</>);
}
function ExpenseForm({ existing, onSave, onClose }: { existing?: Expense; onSave(e: Omit<Expense, "id">): void; onClose(): void }) {
  const [fin] = useSlice("fin"); const [f, setF] = useState({ date: existing?.date ?? DEMO_TODAY, accountId: existing?.accountId ?? "6700", vendor: existing?.vendor ?? "", amount: String(existing?.amount ?? ""), method: existing?.method ?? "Card", note: existing?.note ?? "" }); const [err, setErr] = useState<Record<string, string>>({});
  const save = () => { const e: Record<string, string> = {}; if (f.vendor.trim().length < 2) e.vendor = "Enter the vendor"; if (!(Number(f.amount) > 0)) e.amount = "Amount must be above 0"; if (!f.date) e.date = "Pick a date"; setErr(e); if (!Object.keys(e).length) onSave({ ...f, vendor: f.vendor.trim(), amount: round2(Number(f.amount)) }); };
  return (<Modal title={existing ? "Edit expense" : "New expense"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-expense">Save expense</Btn></>}><div className="grid gap-3 sm:grid-cols-2"><TextIn label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={err.date} /><SelectIn label="Category" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })} options={fin.accounts.filter((a) => a.type === "Expense").map((a) => ({ value: a.id, label: a.name }))} /><TextIn label="Vendor" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} error={err.vendor} /><TextIn label="Amount (USD)" type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} error={err.amount} /><SelectIn label="Payment method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={["Card", "Bank transfer", "Cash"]} /><TextIn label="Description" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div></Modal>);
}

/* ───────── Payments / transactions ledger ───────── */
function Transactions() {
  const [fin, setFin] = useSlice("fin"); const [crm] = useSlice("crm"); const toast = useToast(); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [cat, setCat] = useState(""); const [rec, setRec] = useState<null | "in" | "out">(null); const [pick, setPick] = useState("");
  type Tx = { id: string; date: string; type: string; party: string; ref: string; category: string; method: string; amount: number };
  const all: Tx[] = useMemo(() => [
    ...fin.invoices.flatMap((i) => i.payments.map((p) => ({ id: p.id, date: p.date, type: "Receipt", party: custName(crm.companies, i.customerId), ref: `${p.ref} (${i.number})`, category: "Customer receipts", method: p.method, amount: p.amount }))),
    ...fin.bills.flatMap((b) => b.payments.map((p) => ({ id: p.id, date: p.date, type: "Supplier payment", party: b.supplier, ref: `${p.ref} (${b.number})`, category: "Supplier payments", method: p.method, amount: -p.amount }))),
    ...fin.expenses.map((e) => ({ id: e.id, date: e.date, type: "Expense", party: e.vendor, ref: e.note, category: fin.accounts.find((a) => a.id === e.accountId)?.name ?? "", method: e.method, amount: -e.amount }))].sort((a, b) => b.date.localeCompare(a.date)), [fin, crm.companies]);
  const rows = all.filter((t) => (!from || t.date >= from) && (!to || t.date <= to) && (!cat || t.category === cat)); const cats = [...new Set(all.map((t) => t.category))].sort();
  const cols: Col<Tx>[] = [{ key: "date", label: "Date", render: (t) => fmtDate(t.date) }, { key: "type", label: "Type", render: (t) => <Badge tone={t.amount > 0 ? "green" : "slate"}>{t.type}</Badge> }, { key: "party", label: "Party" }, { key: "ref", label: "Reference" }, { key: "category", label: "Category" }, { key: "method", label: "Method" }, { key: "amount", label: "Amount", align: "right", render: (t) => <span className={t.amount < 0 ? "text-slate-700" : "font-medium text-blue-700"}>{M(t.amount)}</span> }];
  const openInv = fin.invoices.filter((i) => !i.draft && balanceOf(i) > 0.004), openBills = fin.bills.filter((b) => balanceOf(b) > 0.004);
  const target = rec === "in" ? fin.invoices.find((i) => i.id === pick) : rec === "out" ? fin.bills.find((b) => b.id === pick) : undefined;
  return (<><PageHead title="Payments & transactions" sub="All cash movements. Filter by date and category." actions={<><Btn onClick={() => { setRec("in"); setPick(openInv[0]?.id ?? ""); }} testid="rec-in">Record receipt</Btn><Btn onClick={() => { setRec("out"); setPick(openBills[0]?.id ?? ""); }} testid="rec-out">Record supplier payment</Btn></>} />
    <DataTable rows={rows} columns={cols} rowKey={(t) => t.id} exportName="finance-transactions" testid="tx-table" toolbar={<><FilterSelect label="Category" value={cat} onChange={setCat} options={cats} /><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /></>}
      footer={<tr><td colSpan={6} className="px-3 py-2 text-right">Net of {rows.length} filtered transactions</td><td className="px-3 py-2 text-right tabular-nums" data-testid="tx-net">{M(sum(rows, (t) => t.amount))}</td></tr>} />
    {rec && !target && <Modal title={rec === "in" ? "Record receipt" : "Record supplier payment"} small onClose={() => setRec(null)} footer={<Btn onClick={() => setRec(null)}>Close</Btn>}><Empty>There are no open {rec === "in" ? "invoices" : "bills"} to pay.</Empty></Modal>}
    {rec && target && <>{(rec === "in" ? openInv.length : openBills.length) > 1 && <Modal title={rec === "in" ? "Choose invoice" : "Choose bill"} small onClose={() => setRec(null)} footer={<Btn onClick={() => setRec(null)}>Cancel</Btn>}><SelectIn label={rec === "in" ? "Invoice" : "Bill"} value={pick} onChange={(e) => setPick(e.target.value)} options={(rec === "in" ? openInv : openBills).map((d) => ({ value: d.id, label: `${d.number} · outstanding ${M(balanceOf(d))}` }))} /></Modal>}
      <PaymentForm doc={target} kind={rec} onClose={() => setRec(null)} onSave={(p) => { if (rec === "in") setFin((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === target.id ? { ...i, payments: [...i.payments, { id: uid("p"), ...p }] } : i)) })); else setFin((s) => ({ ...s, bills: s.bills.map((b) => (b.id === target.id ? { ...b, payments: [...b.payments, { id: uid("bp"), ...p }] } : b)) })); logActivity("Finance", `${rec === "in" ? "Receipt" : "Payment"} ${M(p.amount)} on ${target.number}`); toast(`Payment of ${M(p.amount)} recorded`); setRec(null); }} /></>}</>);
}

/* ───────── Ageing ───────── */
function Ageing({ kind }: { kind: "ar" | "ap" }) {
  const [fin] = useSlice("fin"); const [crm] = useSlice("crm");
  const docs = (kind === "ar" ? fin.invoices.filter((i) => !i.draft) : fin.bills).filter((d) => balanceOf(d) > 0.004);
  const party = (d: Invoice | Bill) => ("customerId" in d ? custName(crm.companies, d.customerId) : d.supplier);
  const buckets = AGE_BUCKETS.map((b, i) => ({ label: b, value: round2(sum(docs.filter((d) => ageBucket(d.due) === i), (d) => balanceOf(d))) }));
  const rows = docs.map((d) => ({ id: d.id, number: d.number, party: party(d), due: d.due, balance: balanceOf(d), bucket: AGE_BUCKETS[ageBucket(d.due)] }));
  const cols: Col<(typeof rows)[number]>[] = [{ key: "number", label: kind === "ar" ? "Invoice" : "Bill" }, { key: "party", label: kind === "ar" ? "Customer" : "Supplier" }, { key: "due", label: "Due", render: (r) => fmtDate(r.due) }, { key: "bucket", label: "Age", render: (r) => <Badge tone={r.bucket === "Current" ? "blue" : r.bucket === "1–30 days" ? "amber" : "red"}>{r.bucket}</Badge> }, { key: "balance", label: "Outstanding", align: "right", render: (r) => M(r.balance) }];
  return (<><PageHead title={kind === "ar" ? "Accounts receivable" : "Accounts payable"} sub={`Ageing of outstanding ${kind === "ar" ? "customer invoices" : "supplier bills"} as of ${fmtDate(DEMO_TODAY)}.`} />
    <KpiRow><Kpi label="Total outstanding" value={M(sum(buckets, (b) => b.value))} testid="ageing-total" /><Kpi label="Overdue" value={M(sum(buckets.slice(1), (b) => b.value))} tone="amber" /><Kpi label="Documents" value={docs.length} /></KpiRow>
    <div className="mt-4 grid gap-4 lg:grid-cols-3"><Panel title="Ageing buckets" className="lg:col-span-1"><HBars items={buckets} fmt={M} /></Panel><div className="lg:col-span-2"><DataTable rows={rows} columns={cols} rowKey={(r) => r.id} exportName={`finance-${kind}-ageing`} defaultSort={{ key: "due", dir: 1 }} testid="ageing-table" /></div></div></>);
}

/* ───────── Accounts ───────── */
function Accounts({ period }: { period: string }) {
  const [fin] = useSlice("fin"); const pr = periodOf(period); const pl = profitAndLoss(fin, pr.from, pr.to); const bs = balanceSheet(fin, pr.to);
  const bal = (id: string, type: string) => type === "Revenue" ? pl.revenue.find((r) => r.id === id)?.amount ?? 0 : type === "Expense" ? pl.expenses.find((r) => r.id === id)?.amount ?? 0 : ({ "1000": bs.assets.cash, "1100": bs.assets.ar, "1500": bs.assets.equipment, "2000": bs.liabilities.ap, "2100": bs.liabilities.tax, "2500": bs.liabilities.loan, "3000": bs.equity.opening, "3900": bs.equity.earnings } as Record<string, number>)[id] ?? 0;
  const rows = fin.accounts.map((a) => ({ ...a, balance: bal(a.id, a.type) }));
  const cols: Col<(typeof rows)[number]>[] = [{ key: "code", label: "Code" }, { key: "name", label: "Account" }, { key: "type", label: "Type", render: (a) => <Badge tone={a.type === "Revenue" ? "green" : a.type === "Expense" ? "amber" : "slate"}>{a.type}</Badge> }, { key: "balance", label: "Balance / period total", align: "right", render: (a) => M(a.balance) }];
  return (<><PageHead title="Chart of accounts" sub={`Balances as at ${fmtDate(pr.to)}; revenue and expenses for ${pr.label}. Derived from the transactions.`} /><DataTable rows={rows} columns={cols} rowKey={(a) => a.id} pageSize={25} exportName="finance-chart-of-accounts" /></>);
}

/* ───────── Reports ───────── */
function PnL({ period, setPeriod }: { period: string; setPeriod(v: string): void }) {
  const [fin] = useSlice("fin"); const pr = periodOf(period); const pl = profitAndLoss(fin, pr.from, pr.to);
  const exp = () => downloadCsv(`profit-and-loss-${pr.id}`, [["Section", "Account", `Amount (${DEMO_CURRENCY})`], ...pl.revenue.map((r) => ["Revenue", r.name, r.amount]), ["Revenue", "Total revenue", pl.totalRevenue], ...pl.expenses.map((r) => ["Expenses", r.name, r.amount]), ["Expenses", "Total expenses", pl.totalExpenses], ["Result", "Net profit", pl.netProfit]]);
  const Row = ({ l, v, bold }: { l: string; v: number; bold?: boolean }) => <tr className={bold ? "border-t-2 border-slate-300 font-semibold" : "border-t border-slate-100"}><td className="py-1.5">{l}</td><td className="text-right tabular-nums">{M(v)}</td></tr>;
  return (<><PageHead title="Profit & loss" sub="Accrual basis: invoices (excl. tax) less bills and expenses." actions={<><PeriodSelect value={period} onChange={setPeriod} /><Btn onClick={exp} testid="export-pnl">Export CSV</Btn><Btn onClick={printNow} testid="print-pnl">Print</Btn></>} />
    <PrintSheet className="max-w-3xl"><h3 className="font-display text-xl font-semibold">Profit & loss statement</h3><p className="text-sm text-slate-500">NorthPeak Software Ltd (fictional) · {pr.label} · {DEMO_CURRENCY} · demonstration report, not certified</p>
      <table className="mt-4 w-full text-sm"><tbody><tr><td colSpan={2} className="pt-2 text-xs font-semibold uppercase text-slate-500">Revenue</td></tr>{pl.revenue.map((r) => <Row key={r.id} l={r.name} v={r.amount} />)}<Row l="Total revenue" v={pl.totalRevenue} bold />
        <tr><td colSpan={2} className="pt-4 text-xs font-semibold uppercase text-slate-500">Expenses</td></tr>{pl.expenses.map((r) => <Row key={r.id} l={r.name} v={r.amount} />)}<Row l="Total expenses" v={pl.totalExpenses} bold /><Row l="Gross profit (revenue less cost of sales)" v={pl.grossProfit} /><tr className="border-t-2 border-slate-800 text-base font-semibold"><td className="py-2">Net profit</td><td className="text-right tabular-nums" data-testid="net-profit">{M(pl.netProfit)}</td></tr></tbody></table></PrintSheet></>);
}
function BalanceSheetScreen({ period, setPeriod }: { period: string; setPeriod(v: string): void }) {
  const [fin] = useSlice("fin"); const pr = periodOf(period); const b = balanceSheet(fin, pr.to);
  const exp = () => downloadCsv(`balance-sheet-${pr.id}`, [["Section", "Line", `Amount (${DEMO_CURRENCY})`], ["Assets", "Cash at bank", b.assets.cash], ["Assets", "Accounts receivable", b.assets.ar], ["Assets", "Equipment (net)", b.assets.equipment], ["Assets", "Total assets", b.totalAssets], ["Liabilities", "Accounts payable", b.liabilities.ap], ["Liabilities", "Sales tax payable (net)", b.liabilities.tax], ["Liabilities", "Bank loan", b.liabilities.loan], ["Liabilities", "Total liabilities", b.totalLiab], ["Equity", "Share capital & opening reserves", b.equity.opening], ["Equity", "Earnings to date", b.equity.earnings], ["Equity", "Total equity", b.totalEquity]]);
  const R = ({ l, v, bold }: { l: string; v: number; bold?: boolean }) => <tr className={bold ? "border-t-2 border-slate-300 font-semibold" : "border-t border-slate-100"}><td className="py-1.5">{l}</td><td className="text-right tabular-nums">{M(v)}</td></tr>;
  return (<><PageHead title="Balance sheet preview" sub={`As at ${fmtDate(pr.to)}. A preview built from the demo transactions, not a certified statement.`} actions={<><PeriodSelect value={period} onChange={setPeriod} /><Btn onClick={exp}>Export CSV</Btn><Btn onClick={printNow}>Print</Btn></>} />
    <PrintSheet className="max-w-3xl"><h3 className="font-display text-xl font-semibold">Balance sheet</h3><p className="text-sm text-slate-500">As at {fmtDate(pr.to)} · {DEMO_CURRENCY}</p>
      <table className="mt-4 w-full text-sm"><tbody><tr><td colSpan={2} className="text-xs font-semibold uppercase text-slate-500">Assets</td></tr><R l="Cash at bank" v={b.assets.cash} /><R l="Accounts receivable" v={b.assets.ar} /><R l="Equipment (net book value)" v={b.assets.equipment} /><R l="Total assets" v={b.totalAssets} bold />
        <tr><td colSpan={2} className="pt-4 text-xs font-semibold uppercase text-slate-500">Liabilities</td></tr><R l="Accounts payable" v={b.liabilities.ap} /><R l="Sales tax payable (net)" v={b.liabilities.tax} /><R l="Bank loan" v={b.liabilities.loan} /><R l="Total liabilities" v={b.totalLiab} bold />
        <tr><td colSpan={2} className="pt-4 text-xs font-semibold uppercase text-slate-500">Equity</td></tr><R l="Share capital & opening reserves" v={b.equity.opening} /><R l="Earnings to date" v={b.equity.earnings} /><R l="Total equity" v={b.totalEquity} bold /><R l="Total liabilities + equity" v={round2(b.totalLiab + b.totalEquity)} bold /></tbody></table>
      <p className={`mt-3 text-sm font-medium ${b.balanced ? "text-blue-700" : "text-red-700"}`} data-testid="bs-check">{b.balanced ? "✓ Balanced: assets equal liabilities plus equity." : "Out of balance"}</p></PrintSheet></>);
}
function CashFlow({ period, setPeriod }: { period: string; setPeriod(v: string): void }) {
  const [fin] = useSlice("fin"); const pr = periodOf(period); const c = cashSummary(fin, pr.from, pr.to);
  const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"].filter((m) => `${m}-31` >= pr.from && `${m}-01` <= pr.to); const mc = months.map((m) => cashSummary(fin, `${m}-01`, `${m}-31`));
  const exp = () => downloadCsv(`cash-flow-${pr.id}`, [["Line", `Amount (${DEMO_CURRENCY})`], ["Opening cash", c.opening], ["Receipts from customers", c.receipts], ["Payments to suppliers", -c.billPay], ["Expenses paid", -c.expPay], ["Net cash movement", c.net], ["Closing cash", c.closing]]);
  return (<><PageHead title="Cash flow summary" sub="Direct method, from recorded receipts and payments." actions={<><PeriodSelect value={period} onChange={setPeriod} /><Btn onClick={exp} testid="export-cf">Export CSV</Btn></>} />
    <KpiRow><Kpi label="Opening cash" value={M(c.opening)} /><Kpi label="Receipts" value={M(c.receipts)} /><Kpi label="Payments out" value={M(c.billPay + c.expPay)} /><Kpi label="Net movement" value={M(c.net)} tone={c.net < 0 ? "red" : undefined} /><Kpi label="Closing cash" value={M(c.closing)} testid="cf-closing" /></KpiRow>
    <Panel title="Cash in vs cash out by month" className="mt-4"><BarChart ariaLabel="Cash flow by month" data={months.map((m, i) => ({ label: monthLabel(m), values: { in: mc[i].receipts, out: mc[i].billPay + mc[i].expPay } }))} series={[{ key: "in", label: "Cash in" }, { key: "out", label: "Cash out", color: "#f59e0b" }]} fmt={moneyK} /></Panel></>);
}

/* ───────── Analytics ───────── */
function Analytics({ period, setPeriod }: { period: string; setPeriod(v: string): void }) {
  const [fin] = useSlice("fin"); const [crm] = useSlice("crm"); const pr = periodOf(period); const pl = profitAndLoss(fin, pr.from, pr.to); const [tab, setTab] = useState("rev");
  const inv = fin.invoices.filter((i) => !i.draft && i.date >= pr.from && i.date <= pr.to);
  const byCust = Object.entries(groupBy(inv, (i) => i.customerId)).map(([id, v]) => ({ label: custName(crm.companies, id), value: round2(sum(v, (i) => docTotals(i).subtotal)) })).sort((a, b) => b.value - a.value).slice(0, 8);
  const status = Object.entries(groupBy(fin.invoices, (i) => invStatus(i))).map(([label, v]) => ({ label, value: v.length }));
  const paidInv = fin.invoices.filter((i) => paidOf(i) > 0 && balanceOf(i) <= 0.004); const dso = paidInv.length ? sum(paidInv, (i) => Math.max(...i.payments.map((p) => Math.round((new Date(p.date).getTime() - new Date(i.date).getTime()) / 86400000)))) / paidInv.length : 0;
  return (<><PageHead title="Financial analytics" sub={pr.label} actions={<PeriodSelect value={period} onChange={setPeriod} />} />
    <KpiRow><Kpi label="Gross margin" value={pl.totalRevenue ? pct(pl.grossProfit / pl.totalRevenue) : "—"} /><Kpi label="Net margin" value={pl.totalRevenue ? pct(pl.netProfit / pl.totalRevenue) : "—"} /><Kpi label="Avg. days to pay" value={dso.toFixed(0)} sub={`${paidInv.length} paid invoices`} /><Kpi label="Invoices in period" value={inv.length} /></KpiRow>
    <div className="mt-4"><Tabs value={tab} onChange={setTab} tabs={[{ id: "rev", label: "Revenue by customer" }, { id: "exp", label: "Expenses by category" }, { id: "st", label: "Invoice status" }]} /></div>
    <Panel className="mt-3">{tab === "rev" && (byCust.length ? <HBars items={byCust} fmt={M} /> : <Empty>No invoices in this period.</Empty>)}{tab === "exp" && <Donut slices={pl.expenses.map((e) => ({ label: e.name, value: e.amount }))} fmt={moneyK} center={<>{moneyK(pl.totalExpenses)}</>} size={170} />}{tab === "st" && <Donut slices={status} center={<>{fin.invoices.length}<br />invoices</>} />}</Panel></>);
}
