export interface AlertRule { id: string; metric: string; op: ">=" | "<="; threshold: number; enabled: boolean }
export interface Approval { id: string; type: "Discount" | "Purchase" | "Expense" | "Budget change" | "Hiring"; title: string; amount: number; requester: string; justification: string; status: "Pending" | "Approved" | "Rejected"; createdAt: string; decidedAt?: string; note?: string }
export const seedExec = () => ({
  alerts: [
    { id: "a1", metric: "lowStock", op: ">=", threshold: 5, enabled: true }, { id: "a2", metric: "overdueInvoices", op: ">=", threshold: 3, enabled: true }, { id: "a3", metric: "overdueTickets", op: ">=", threshold: 3, enabled: true },
    { id: "a4", metric: "overBudgetProjects", op: ">=", threshold: 1, enabled: true }, { id: "a5", metric: "cash", op: "<=", threshold: 20000, enabled: true }, { id: "a6", metric: "pendingApprovals", op: ">=", threshold: 10, enabled: true },
  ] as AlertRule[],
  approvals: [
    { id: "ap1", type: "Discount", title: "15% discount for Verdant Retail renewal", amount: 26250, requester: "e05", justification: "Multi-year renewal; competitor quote attached.", status: "Pending", createdAt: "2026-03-13" },
    { id: "ap2", type: "Budget change", title: "Increase budget of Production dashboard by $12,000", amount: 12000, requester: "e14", justification: "Scope added for operator tablet UI.", status: "Pending", createdAt: "2026-03-12" },
    { id: "ap3", type: "Hiring", title: "Open second Senior Developer position", amount: 118000, requester: "e14", justification: "Platform migration backlog.", status: "Pending", createdAt: "2026-03-10" },
    { id: "ap4", type: "Expense", title: "Conference travel, three staff", amount: 7400, requester: "e07", justification: "Annual industry conference.", status: "Approved", createdAt: "2026-03-02", decidedAt: "2026-03-04", note: "Approved within the marketing budget." },
    { id: "ap5", type: "Purchase", title: "Replace four office chairs", amount: 560, requester: "e20", justification: "Failed ergonomic assessment.", status: "Approved", createdAt: "2026-02-26", decidedAt: "2026-02-27", note: "Approved." },
    { id: "ap6", type: "Discount", title: "25% discount for Quartz Legal pilot", amount: 7750, requester: "e02", justification: "Pilot conversion.", status: "Rejected", createdAt: "2026-02-20", decidedAt: "2026-02-22", note: "Above the discount policy limit." },
  ] as Approval[],
});
