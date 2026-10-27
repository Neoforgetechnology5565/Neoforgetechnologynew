import assert from "node:assert/strict";
import { balanceSheet, balanceOf, cashSummary, docTotals, invStatus, profitAndLoss, monthlyPL } from "./fin-calc";
import { seedFin } from "./seed-fin";
import { quoteTotals, seedCrm, STAGE_PROB } from "./seed-crm";

// ---- finance: every statement derives from the same records and the balance sheet balances for any date
const fin = seedFin();
for (const d of ["2025-10-31", "2025-12-31", "2026-01-31", "2026-03-15", "2026-03-31"]) assert.equal(balanceSheet(fin, d).balanced, true, `balance sheet balances at ${d}`);
const all = profitAndLoss(fin, "2025-10-01", "2026-03-31");
assert.ok(Math.abs(all.netProfit - monthlyPL(fin, ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]).reduce((a, m) => a + m.profit, 0)) < 0.01, "monthly P&L sums to the period P&L");
assert.ok(all.totalRevenue > 0 && all.totalExpenses > 0);
const t = docTotals({ lines: [{ desc: "a", qty: 2, price: 500, accountId: "4000" }, { desc: "b", qty: 1, price: 250, accountId: "4000" }], taxRate: 0.08 });
assert.deepEqual([t.subtotal, t.tax, t.total], [1250, 100, 1350]);
// recording a payment lowers the balance, changes status and raises cash
const inv = fin.invoices.find((i) => invStatus(i) === "Open")!; const bal = balanceOf(inv); const cash0 = cashSummary(fin, "2025-10-01", "2026-03-15").closing;
inv.payments.push({ id: "x", date: "2026-03-14", amount: bal, method: "Bank transfer", ref: "T" });
assert.equal(balanceOf(inv), 0); assert.equal(invStatus(inv), "Paid"); assert.ok(Math.abs(cashSummary(fin, "2025-10-01", "2026-03-15").closing - (cash0 + bal)) < 0.01);
assert.equal(balanceSheet(fin, "2026-03-15").balanced, true, "still balanced after a payment");

// ---- crm
const q = quoteTotals({ lines: [{ desc: "x", qty: 2, price: 1500 }], discount: 0.1, tax: 0.2 }); assert.equal(q.total, 3240);
const crm = seedCrm(); const open = crm.opps.filter((o) => o.stage !== "Won" && o.stage !== "Lost"); assert.ok(open.reduce((a, o) => a + o.value * STAGE_PROB[o.stage], 0) > 0);

// ---- payroll rules (documented demo assumptions)
import { DEFAULT_CONFIG, hoursOf, overtimeOf, payLine, taxOf, runTotals, lateMinutes } from "./pay-calc";
import { seedHrm } from "./seed-hrm";
import { seedPay } from "./seed-pay";
const cfg = DEFAULT_CONFIG();
assert.equal(hoursOf({ in: "09:00", out: "17:30" }), 8, "8.5h shift minus 30 min break");
assert.deepEqual(overtimeOf({ id: "x", empId: "e", date: "2026-03-10", in: "09:00", out: "19:30" }, cfg), { wk: 2, we: 0 }, "weekday overtime beyond 8 paid hours");
assert.deepEqual(overtimeOf({ id: "x", empId: "e", date: "2026-03-07", in: "08:00", out: "12:30" }, cfg), { wk: 0, we: 4.5 }, "weekend hours all overtime");
assert.equal(lateMinutes({ id: "a", empId: "e", date: "2026-03-10", in: "09:20", out: "" }, "Day"), 20); assert.equal(lateMinutes({ id: "a", empId: "e", date: "2026-03-10", in: "09:04", out: "" }, "Day"), 0, "grace period");
assert.equal(taxOf(2000, cfg.taxBands), 200); assert.equal(taxOf(5000, cfg.taxBands), 300 + 400); assert.equal(taxOf(10000, cfg.taxBands), 300 + 1000 + 600);
const hr = seedHrm(), pay = seedPay(); const emp = hr.employees.find((e) => e.id === "e15")!;
const line = payLine(emp, "2026-03", pay.attendance, hr.leave, pay.shifts, cfg, "2026-03-15");
assert.equal(Math.round((line.gross - line.tax - line.deductions.reduce((a, d) => a + d.amount, 0) - line.net) * 100), 0, "net = gross − tax − deductions");
assert.equal(line.base, Math.round((emp.salary / 12) * 100) / 100);
const tot = runTotals(pay.runs[0].lines); assert.ok(tot.net > 0 && tot.net < tot.gross);

// ---- inventory: stock is derived from the ledger; no negative stock; weighted-average valuation
import { seedInv } from "./seed-inv";
import { avgCosts, stockMap, valuation } from "./inv-calc";
const iv = seedInv(); const sm = stockMap(iv.movements);
assert.ok([...sm.values()].every((q) => q >= 0), "no negative stock anywhere in the seed");
const trf = iv.movements.filter((m) => m.type.startsWith("Transfer")); assert.equal(trf.reduce((a, m) => a + m.qty, 0), 0, "transfers net to zero");
const lowCount = iv.products.filter((p) => { const t = [...sm].filter(([k]) => k.startsWith(p.id + "|")).reduce((a, [, q]) => a + q, 0); return t <= p.reorder; }).length; assert.ok(lowCount >= 5 && lowCount < iv.products.length, `a realistic number of low-stock items (${lowCount})`);
const p0 = iv.products[0]; const base = valuation(iv.products, iv.movements).find((v) => v.id === p0.id)!;
const more = [...iv.movements, { id: "m99999", date: "2026-03-15", productId: p0.id, whId: "w1", type: "Receipt" as const, qty: base.qty, unitCost: base.avg * 2, ref: "T", note: "" }];
assert.ok(Math.abs(avgCosts(iv.products, more).get(p0.id)! - base.avg * 1.5) < 0.02, "doubling stock at twice the cost raises the average by 50%");
console.log("biz: all tests passed");
