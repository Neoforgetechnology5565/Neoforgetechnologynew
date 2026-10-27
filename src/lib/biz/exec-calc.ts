/** Cross-module KPIs for the executive demo. Every number is derived from the other demos' records (same local store). */
import type { DB } from "./seeds";
import { avgCosts, stockMap, totalQty } from "./inv-calc";
import { balanceOf, billStatus, balanceSheet, cashSummary, invStatus, profitAndLoss } from "./fin-calc";
import { STAGE_PROB } from "./seed-crm";
import { costOf, progressOf, taskOverdue } from "./proj-calc";
import { overdue as ticketOverdue } from "./desk-calc";
import { DEMO_TODAY, round2, sum } from "./util";

export interface Period { id: string; label: string; from: string; to: string }
export const PERIODS: Period[] = [{ id: "mtd", label: "This month (Mar 2026)", from: "2026-03-01", to: "2026-03-31" }, { id: "lm", label: "Last month (Feb 2026)", from: "2026-02-01", to: "2026-02-28" }, { id: "qtd", label: "This quarter (Q1 2026)", from: "2026-01-01", to: "2026-03-31" }, { id: "pq", label: "Previous quarter (Q4 2025)", from: "2025-10-01", to: "2025-12-31" }, { id: "all", label: "All data (Oct 2025 – Mar 2026)", from: "2025-10-01", to: "2026-03-31" }];
export const inPeriod = (d: string, p: Period) => d.slice(0, 10) >= p.from && d.slice(0, 10) <= p.to;

export function kpis(db: DB, p: Period) {
  const fin = db.fin, pl = profitAndLoss(fin, p.from, p.to), cash = cashSummary(fin, p.from, p.to); const bs = balanceSheet(fin, p.to > DEMO_TODAY ? DEMO_TODAY : p.to);
  const open = db.crm.opps.filter((o) => o.stage !== "Won" && o.stage !== "Lost"), won = db.crm.opps.filter((o) => o.stage === "Won"), lost = db.crm.opps.filter((o) => o.stage === "Lost");
  const map = stockMap(db.inv.movements), avg = avgCosts(db.inv.products, db.inv.movements);
  const invValue = round2(sum(db.inv.products, (pr) => totalQty(map, pr.id, db.inv.warehouses) * (avg.get(pr.id) ?? pr.cost))); const lowStock = db.inv.products.filter((pr) => totalQty(map, pr.id, db.inv.warehouses) <= pr.reorder).length;
  const openPos = db.proc.orders.filter((o) => ["Sent", "Partially received"].includes(o.status)); const openPoValue = round2(sum(openPos, (o) => sum(o.lines, (l) => Math.max(0, l.qty - l.received) * l.price)));
  const active = db.hrm.employees.filter((e) => e.status !== "Resigned"); const latestRun = [...db.pay.runs].sort((a, b) => b.period.localeCompare(a.period))[0];
  const tickets = db.desk.tickets, openTickets = tickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed"); const resolved = tickets.filter((t) => t.resolution); const slaMet = resolved.filter((t) => (t.resolution?.at ?? "9") <= t.due);
  const sent = db.mkt.campaigns.filter((c) => c.metrics); const mDel = sum(sent, (c) => c.metrics!.delivered), mOpen = sum(sent, (c) => c.metrics!.opened);
  const projects = db.proj.projects; const overBudget = projects.filter((x) => costOf(db.proj, x.id) > x.budget).length; const activeProjects = projects.filter((x) => x.status === "Active");
  const pendingApprovals = db.exec.approvals.filter((a) => a.status === "Pending").length + db.proc.requisitions.filter((r) => r.status === "Submitted").length + db.hrm.leave.filter((l) => l.status === "Pending").length;
  return {
    revenue: pl.totalRevenue, expenses: pl.totalExpenses, netProfit: pl.netProfit, cash: cash.closing, bsBalanced: bs.balanced, ar: round2(sum(fin.invoices.filter((i) => !i.draft), (i) => balanceOf(i))), ap: round2(sum(fin.bills, (b) => balanceOf(b))),
    overdueInvoices: fin.invoices.filter((i) => invStatus(i) === "Overdue").length, overdueBills: fin.bills.filter((b) => billStatus(b) === "Overdue").length,
    pipeline: sum(open, (o) => o.value), forecast: sum(open, (o) => o.value * STAGE_PROB[o.stage]), wonValue: sum(won, (o) => o.value), winRate: won.length + lost.length ? won.length / (won.length + lost.length) : 0, openDeals: open.length,
    invValue, lowStock, openPoValue, openPoCount: openPos.length,
    headcount: active.length, payrollGross: latestRun ? sum(latestRun.lines, (l) => l.gross) : 0, payrollNet: latestRun ? sum(latestRun.lines, (l) => l.net) : 0, payrollPeriod: latestRun?.period ?? "",
    openTickets: openTickets.length, overdueTickets: tickets.filter(ticketOverdue).length, slaRate: resolved.length ? slaMet.length / resolved.length : 0,
    simOpenRate: mDel ? mOpen / mDel : 0, activeProjects: activeProjects.length, overBudgetProjects: overBudget, avgProgress: activeProjects.length ? sum(activeProjects, (x) => progressOf(db.proj, x.id)) / activeProjects.length : 0, overdueTasks: db.proj.tasks.filter(taskOverdue).length, projectCost: round2(sum(projects, (x) => costOf(db.proj, x.id))),
    pendingApprovals,
  };
}
export const ALERT_METRICS: Record<string, { label: string; unit: "count" | "money"; hint: string }> = {
  lowStock: { label: "Low / out-of-stock products", unit: "count", hint: "Inventory" }, overdueInvoices: { label: "Overdue customer invoices", unit: "count", hint: "Finance" }, overdueTickets: { label: "Overdue support tickets", unit: "count", hint: "Helpdesk" },
  overBudgetProjects: { label: "Projects over budget", unit: "count", hint: "Projects" }, cash: { label: "Cash at bank", unit: "money", hint: "Finance" }, pendingApprovals: { label: "Pending approvals (all sources)", unit: "count", hint: "Workflow" }, overdueTasks: { label: "Overdue project tasks", unit: "count", hint: "Projects" }, overdueBills: { label: "Overdue supplier bills", unit: "count", hint: "Finance" },
};
export const alertFires = (value: number, r: { op: string; threshold: number }) => (r.op === ">=" ? value >= r.threshold : value <= r.threshold);
