/** Pure finance calculations. Every report is derived from invoices, bills, expenses and payments; nothing is hard-coded. */
import { EQUIPMENT, FIN_START, LOAN, OPENING_CASH, type Account, type Bill, type Expense, type FinLine, type Invoice, type Payment } from "./seed-fin";
import { DEMO_TODAY, addDays, daysBetween, monthKey, onBank, round2 } from "./util";

export interface FinData { accounts: Account[]; invoices: Invoice[]; bills: Bill[]; expenses: Expense[] }
export const lineNet = (lines: FinLine[]) => round2(lines.reduce((a, l) => a + l.qty * l.price, 0));
export const docTotals = (d: { lines: FinLine[]; taxRate: number }) => { const subtotal = lineNet(d.lines), tax = round2(subtotal * d.taxRate); return { subtotal, tax, total: round2(subtotal + tax) }; };
export const paidOf = (d: { payments: Payment[] }, asOf = "9999-12-31") => round2(d.payments.filter((p) => p.date <= asOf).reduce((a, p) => a + p.amount, 0));
export const balanceOf = (d: { lines: FinLine[]; taxRate: number; payments: Payment[] }, asOf = "9999-12-31") => round2(docTotals(d).total - paidOf(d, asOf));
export type DocStatus = "Draft" | "Paid" | "Partially paid" | "Overdue" | "Open";
export const invStatus = (i: Invoice, today = DEMO_TODAY): DocStatus => (i.draft ? "Draft" : balanceOf(i) <= 0.004 ? "Paid" : i.due < today ? "Overdue" : paidOf(i) > 0 ? "Partially paid" : "Open");
export const billStatus = (b: Bill, today = DEMO_TODAY): DocStatus => (balanceOf(b) <= 0.004 ? "Paid" : b.due < today ? "Overdue" : paidOf(b) > 0 ? "Partially paid" : "Open");

export const PERIODS = [{ id: "mtd", label: "This month (Mar 2026)", from: "2026-03-01", to: "2026-03-31" }, { id: "lm", label: "Last month (Feb 2026)", from: "2026-02-01", to: "2026-02-28" }, { id: "qtd", label: "This quarter (Q1 2026)", from: "2026-01-01", to: "2026-03-31" }, { id: "pq", label: "Previous quarter (Q4 2025)", from: "2025-10-01", to: "2025-12-31" }, { id: "all", label: "All data (Oct 2025 – Mar 2026)", from: FIN_START, to: "2026-03-31" }];
export const periodOf = (id: string) => PERIODS.find((p) => p.id === id) ?? PERIODS[2];
const within = (d: string, from: string, to: string) => d >= from && d <= to;

export function profitAndLoss(f: FinData, from: string, to: string) {
  const name = (id: string) => f.accounts.find((a) => a.id === id)?.name ?? id; const rev = new Map<string, number>(), exp = new Map<string, number>();
  for (const i of f.invoices) if (!i.draft && within(i.date, from, to)) for (const l of i.lines) rev.set(l.accountId, round2((rev.get(l.accountId) ?? 0) + l.qty * l.price));
  for (const b of f.bills) if (within(b.date, from, to)) for (const l of b.lines) exp.set(l.accountId, round2((exp.get(l.accountId) ?? 0) + l.qty * l.price));
  for (const e of f.expenses) if (within(e.date, from, to)) exp.set(e.accountId, round2((exp.get(e.accountId) ?? 0) + e.amount));
  const rows = (m: Map<string, number>) => [...m.entries()].sort().map(([id, amount]) => ({ id, name: name(id), amount }));
  const revenue = rows(rev), expenses = rows(exp), totalRevenue = round2(revenue.reduce((a, r) => a + r.amount, 0)), totalExpenses = round2(expenses.reduce((a, r) => a + r.amount, 0));
  const cogs = round2(exp.get("5000") ?? 0);
  return { revenue, expenses, totalRevenue, totalExpenses, cogs, grossProfit: round2(totalRevenue - cogs), netProfit: round2(totalRevenue - totalExpenses) };
}
export function cashSummary(f: FinData, from: string, to: string) {
  const receipts = round2(f.invoices.flatMap((i) => i.payments).filter((p) => within(p.date, from, to)).reduce((a, p) => a + p.amount, 0));
  const billPay = round2(f.bills.flatMap((i) => i.payments).filter((p) => within(p.date, from, to)).reduce((a, p) => a + p.amount, 0));
  const expPay = round2(f.expenses.filter((e) => within(e.date, from, to)).reduce((a, e) => a + e.amount, 0));
  const cashAt = (d: string) => round2(OPENING_CASH + f.invoices.flatMap((i) => i.payments).filter((p) => p.date <= d).reduce((a, p) => a + p.amount, 0) - f.bills.flatMap((i) => i.payments).filter((p) => p.date <= d).reduce((a, p) => a + p.amount, 0) - f.expenses.filter((e) => e.date <= d).reduce((a, e) => a + e.amount, 0));
  return { receipts, billPay, expPay, net: round2(receipts - billPay - expPay), opening: cashAt(addDays(from, -1)), closing: cashAt(to) };
}
export function balanceSheet(f: FinData, asOf: string) {
  const cash = cashSummary(f, FIN_START, asOf).closing;
  const live = (d: string) => d <= asOf;
  const ar = round2(f.invoices.filter((i) => !i.draft && live(i.date)).reduce((a, i) => a + balanceOf(i, asOf), 0));
  const ap = round2(f.bills.filter((b) => live(b.date)).reduce((a, b) => a + balanceOf(b, asOf), 0));
  const outTax = f.invoices.filter((i) => !i.draft && live(i.date)).reduce((a, i) => a + docTotals(i).tax, 0), inTax = f.bills.filter((b) => live(b.date)).reduce((a, b) => a + docTotals(b).tax, 0);
  const tax = round2(outTax - inTax); const pl = profitAndLoss(f, FIN_START, asOf);
  const assets = { cash, ar, equipment: EQUIPMENT }, liabilities = { ap, tax, loan: LOAN };
  const opening = OPENING_CASH + EQUIPMENT - LOAN; const totalAssets = round2(cash + ar + EQUIPMENT), totalLiab = round2(ap + tax + LOAN);
  return { assets, liabilities, equity: { opening, earnings: pl.netProfit }, totalAssets, totalLiab, totalEquity: round2(opening + pl.netProfit), balanced: Math.abs(totalAssets - totalLiab - (opening + pl.netProfit)) < 0.01 };
}
export const AGE_BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;
export const ageBucket = (due: string, today = DEMO_TODAY) => { const d = daysBetween(due, today); return d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4; };
export function monthlyPL(f: FinData, months: string[]) { return months.map((m) => { const pl = profitAndLoss(f, `${m}-01`, `${m}-31`); return { month: m, revenue: pl.totalRevenue, expenses: pl.totalExpenses, profit: pl.netProfit }; }); }
export const monthsOf = (f: FinData) => [...new Set([...f.invoices.map((i) => monthKey(i.date)), ...f.expenses.map((e) => monthKey(e.date))])].sort();

/** A cash movement as the books record it; `onBank` says whether the sample bank statement shows it. */
export interface CashTx { id: string; date: string; kind: "Receipt" | "Supplier payment" | "Expense"; party: string; ref: string; amount: number; onBank: boolean }
export function cashMovements(f: FinData, custName: (id: string) => string): CashTx[] {
  return [
    ...f.invoices.flatMap((i) => i.payments.map((p) => ({ id: p.id, date: p.date, kind: "Receipt" as const, party: custName(i.customerId), ref: `${p.ref} (${i.number})`, amount: p.amount, onBank: onBank(p.id) }))),
    ...f.bills.flatMap((b) => b.payments.map((p) => ({ id: p.id, date: p.date, kind: "Supplier payment" as const, party: b.supplier, ref: `${p.ref} (${b.number})`, amount: -p.amount, onBank: onBank(p.id) }))),
    ...f.expenses.map((e) => ({ id: e.id, date: e.date, kind: "Expense" as const, party: e.vendor, ref: e.note, amount: -e.amount, onBank: onBank(e.id) })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
/** One bank-statement line with no matching book entry yet (the user can record it as an expense). */
export const BANK_ONLY = { id: "bank-chg-0326", date: "2026-03-14", desc: "Bank charges (statement)", amount: -42.5, expenseId: "exbank-chg-0326" };

/** Double-entry view of the same records: every posting has a debit or a credit, and total debits always equal total credits. */
export interface LedgerRow { id: string; date: string; ref: string; desc: string; account: string; category: string; debit: number; credit: number; status: string }
export function ledgerRows(f: FinData, custName: (id: string) => string, reconciled: string[] = []): LedgerRow[] {
  const aName = (id: string) => `${id} ${f.accounts.find((a) => a.id === id)?.name ?? ""}`.trim();
  const out: LedgerRow[] = []; const add = (id: string, date: string, ref: string, desc: string, acct: string, category: string, debit: number, credit: number, status: string) => { if (debit || credit) out.push({ id, date, ref, desc, account: aName(acct), category, debit: round2(debit), credit: round2(credit), status }); };
  const byAcct = (lines: FinLine[]) => { const m = new Map<string, number>(); for (const l of lines) m.set(l.accountId, round2((m.get(l.accountId) ?? 0) + l.qty * l.price)); return [...m.entries()]; };
  for (const i of f.invoices) { if (i.draft) continue; const t = docTotals(i), st = invStatus(i), who = custName(i.customerId);
    add(`${i.id}-ar`, i.date, i.number, `Invoice to ${who}`, "1100", "Sales invoice", t.total, 0, st);
    byAcct(i.lines).forEach(([a, v]) => add(`${i.id}-rev-${a}`, i.date, i.number, `Invoice to ${who}`, a, "Sales invoice", 0, v, st)); add(`${i.id}-tax`, i.date, i.number, `Sales tax on ${i.number}`, "2100", "Sales invoice", 0, t.tax, st);
    for (const p of i.payments) { const s = reconciled.includes(p.id) ? "Reconciled" : "Unreconciled"; add(`${p.id}-d`, p.date, p.ref, `Receipt from ${who} (${i.number})`, "1000", "Customer receipt", p.amount, 0, s); add(`${p.id}-c`, p.date, p.ref, `Receipt from ${who} (${i.number})`, "1100", "Customer receipt", 0, p.amount, s); } }
  for (const b of f.bills) { const t = docTotals(b), st = billStatus(b);
    byAcct(b.lines).forEach(([a, v]) => add(`${b.id}-exp-${a}`, b.date, b.number, `Bill from ${b.supplier}`, a, "Supplier bill", v, 0, st)); add(`${b.id}-tax`, b.date, b.number, `Input tax on ${b.number}`, "2100", "Supplier bill", t.tax, 0, st); add(`${b.id}-ap`, b.date, b.number, `Bill from ${b.supplier}`, "2000", "Supplier bill", 0, t.total, st);
    for (const p of b.payments) { const s = reconciled.includes(p.id) ? "Reconciled" : "Unreconciled"; add(`${p.id}-d`, p.date, p.ref, `Payment to ${b.supplier} (${b.number})`, "2000", "Supplier payment", p.amount, 0, s); add(`${p.id}-c`, p.date, p.ref, `Payment to ${b.supplier} (${b.number})`, "1000", "Supplier payment", 0, p.amount, s); } }
  for (const e of f.expenses) { const s = reconciled.includes(e.id) ? "Reconciled" : "Unreconciled"; add(`${e.id}-d`, e.date, e.id.toUpperCase(), `${e.vendor}: ${e.note}`, e.accountId, "Expense", e.amount, 0, s); add(`${e.id}-c`, e.date, e.id.toUpperCase(), `${e.vendor}: ${e.note}`, "1000", "Expense", 0, e.amount, s); }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.ref.localeCompare(b.ref));
}
