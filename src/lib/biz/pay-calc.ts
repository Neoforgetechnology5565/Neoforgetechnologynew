/** Pure payroll / attendance calculations. Rules are DEMONSTRATION ASSUMPTIONS, not any country's legal payroll rules. */
import type { Employee, LeaveReq } from "./seed-hrm";
import { DEMO_TODAY, addDays, isWeekend, round2, workingDays } from "./util";

export type ShiftKey = "Early" | "Day" | "Late" | "Off";
export const SHIFTS: Record<ShiftKey, { start: string; end: string; label: string }> = { Early: { start: "07:00", end: "15:00", label: "Early 07:00–15:00" }, Day: { start: "09:00", end: "17:00", label: "Day 09:00–17:00" }, Late: { start: "13:00", end: "21:00", label: "Late 13:00–21:00" }, Off: { start: "", end: "", label: "Off" } };
export interface Att { id: string; empId: string; date: string; in: string; out: string; note?: string }
export interface ShiftAssign { id: string; empId: string; date: string; shift: ShiftKey }
export interface PayItem { id: string; name: string; type: "earning" | "deduction"; kind: "fixed" | "percent"; value: number }
export interface PayConfig { otWeekday: number; otWeekend: number; dailyHours: number; breakMin: number; graceMin: number; hourlyDivisor: number; taxBands: { upTo: number | null; rate: number }[]; items: PayItem[] }
export interface PayLine { empId: string; base: number; otWeekdayHrs: number; otWeekendHrs: number; otPay: number; earnings: { name: string; amount: number }[]; gross: number; deductions: { name: string; amount: number }[]; tax: number; absenceDays: number; lateMinutes: number; net: number }
export interface PayRun { id: string; period: string; status: "Draft" | "Finalised"; createdAt: string; lines: PayLine[] }

export const PAY_TODAY = "2026-03-16"; // the "current working day" for clock events in the demo
export const DEFAULT_CONFIG = (): PayConfig => ({ otWeekday: 1.5, otWeekend: 2.0, dailyHours: 8, breakMin: 30, graceMin: 5, hourlyDivisor: 2080, taxBands: [{ upTo: 3000, rate: 0.1 }, { upTo: 8000, rate: 0.2 }, { upTo: null, rate: 0.3 }],
  items: [{ id: "i1", name: "Transport allowance", type: "earning", kind: "fixed", value: 120 }, { id: "i2", name: "Pension contribution", type: "deduction", kind: "percent", value: 5 }, { id: "i3", name: "Health insurance", type: "deduction", kind: "fixed", value: 85 }] });
export const RULES_TEXT = "Demonstration rules: overtime = paid hours beyond 8 per weekday at 1.5×, all weekend hours at 2.0×; hourly rate = annual salary ÷ 2,080; a 30-minute unpaid break is removed from shifts over 5 hours; late = clocked in more than 5 minutes after shift start; each unpaid absence deducts base pay ÷ working days in the month; income tax uses three illustrative monthly bands (10% / 20% / 30%). These are not legal or country-specific payroll rules.";

const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const hoursOf = (a: Pick<Att, "in" | "out">, breakMin = 30) => { if (!a.in || !a.out) return 0; let m = mins(a.out) - mins(a.in); if (m < 0) m += 1440; if (m > 300) m -= breakMin; return round2(Math.max(0, m) / 60); };
export const defaultShift = (e: Pick<Employee, "dept">, date: string): ShiftKey => (isWeekend(date) ? "Off" : e.dept === "Operations" ? "Early" : e.dept === "Customer Support" ? (Math.floor((new Date(date + "T00:00:00Z").getTime() / 86400000 + 3) / 7) % 2 ? "Late" : "Day") : "Day");
export const shiftFor = (e: Pick<Employee, "id" | "dept">, date: string, assigns: ShiftAssign[]): ShiftKey => assigns.find((a) => a.empId === e.id && a.date === date)?.shift ?? defaultShift(e, date);
export const lateMinutes = (a: Att, shift: ShiftKey, grace = 5) => { const s = SHIFTS[shift]; if (!s.start || !a.in) return 0; const d = mins(a.in) - mins(s.start); return d > grace ? d : 0; };
export const overtimeOf = (a: Att, cfg: PayConfig) => { const h = hoursOf(a, cfg.breakMin); return isWeekend(a.date) ? { wk: 0, we: h } : { wk: round2(Math.max(0, h - cfg.dailyHours)), we: 0 }; };
export const onLeave = (leave: LeaveReq[], empId: string, date: string) => leave.some((l) => l.empId === empId && l.status === "Approved" && l.from <= date && l.to >= date);

export function monthStats(e: Employee, period: string, att: Att[], leave: LeaveReq[], assigns: ShiftAssign[], cfg: PayConfig, asOf = DEMO_TODAY) {
  const from = `${period}-01`, to = `${period}-31`, end = to < asOf ? to : asOf; const mine = att.filter((a) => a.empId === e.id && a.date >= from && a.date <= to);
  let otWk = 0, otWe = 0, late = 0, lateCount = 0, hours = 0; for (const a of mine) { const o = overtimeOf(a, cfg); otWk += o.wk; otWe += o.we; hours += hoursOf(a, cfg.breakMin); const l = lateMinutes(a, shiftFor(e, a.date, assigns), cfg.graceMin); if (l) { late += l; lateCount++; } }
  let absent = 0; if (e.hireDate <= end) for (let d = from < e.hireDate ? e.hireDate : from; d <= end; d = addDays(d, 1)) if (!isWeekend(d) && !mine.some((a) => a.date === d) && !onLeave(leave, e.id, d)) absent++;
  return { days: mine.length, hours: round2(hours), otWk: round2(otWk), otWe: round2(otWe), lateMinutes: late, lateCount, absent, workingDays: workingDays(from, lastDay(period)) };
}
export const lastDay = (period: string) => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const taxOf = (monthlyTaxable: number, bands: PayConfig["taxBands"]) => { let tax = 0, lo = 0; for (const b of bands) { const hi = b.upTo ?? Infinity; if (monthlyTaxable > lo) tax += (Math.min(monthlyTaxable, hi) - lo) * b.rate; lo = hi; } return round2(tax); };

export function payLine(e: Employee, period: string, att: Att[], leave: LeaveReq[], assigns: ShiftAssign[], cfg: PayConfig, asOf = DEMO_TODAY): PayLine {
  const s = monthStats(e, period, att, leave, assigns, cfg, asOf), base = round2(e.salary / 12), rate = e.salary / cfg.hourlyDivisor;
  const otPay = round2(s.otWk * rate * cfg.otWeekday + s.otWe * rate * cfg.otWeekend);
  const earnings = cfgEarnings(cfg, base), absenceDed = s.absent ? round2((base / Math.max(1, workingDays(`${period}-01`, lastDay(period)))) * s.absent) : 0;
  const gross = round2(base + otPay + earnings.reduce((a, x) => a + x.amount, 0));
  const deductions = [...cfg.items.filter((i) => i.type === "deduction").map((i) => ({ name: i.name, amount: round2(i.kind === "percent" ? (base * i.value) / 100 : i.value) })), ...(absenceDed ? [{ name: "Unpaid absence", amount: absenceDed }] : [])];
  const tax = taxOf(Math.max(0, gross - absenceDed), cfg.taxBands); const net = round2(gross - tax - deductions.reduce((a, x) => a + x.amount, 0));
  return { empId: e.id, base, otWeekdayHrs: s.otWk, otWeekendHrs: s.otWe, otPay, earnings, gross, deductions, tax, absenceDays: s.absent, lateMinutes: s.lateMinutes, net };
}
const cfgEarnings = (cfg: PayConfig, base: number) => cfg.items.filter((i) => i.type === "earning").map((i) => ({ name: i.name, amount: round2(i.kind === "percent" ? (base * i.value) / 100 : i.value) }));
export const runTotals = (lines: PayLine[]) => ({ gross: round2(lines.reduce((a, l) => a + l.gross, 0)), tax: round2(lines.reduce((a, l) => a + l.tax, 0)), ded: round2(lines.reduce((a, l) => a + l.deductions.reduce((x, d) => x + d.amount, 0), 0)), net: round2(lines.reduce((a, l) => a + l.net, 0)), ot: round2(lines.reduce((a, l) => a + l.otPay, 0)) });
export const payable = (emps: Employee[], period: string) => emps.filter((e) => e.status !== "Resigned" && e.hireDate <= lastDay(period));
