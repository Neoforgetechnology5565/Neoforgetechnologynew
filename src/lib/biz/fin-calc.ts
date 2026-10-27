/** Pure finance calculations. Every report is derived from invoices, bills, expenses and payments; nothing is hard-coded. */
import { EQUIPMENT, FIN_START, LOAN, OPENING_CASH, type Account, type Bill, type Expense, type FinLine, type Invoice, type Payment } from "./seed-fin";
import { DEMO_TODAY, addDays, daysBetween, monthKey, round2 } from "./util";

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
