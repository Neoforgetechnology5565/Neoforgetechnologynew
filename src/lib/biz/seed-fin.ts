import { seedHrm } from "./seed-hrm";
import { seedCrm } from "./seed-crm";
import { addDays, hash01, onBank, DEMO_TODAY } from "./util";

export interface FinLine { desc: string; qty: number; price: number; accountId: string }
export interface Payment { id: string; date: string; amount: number; method: string; ref: string }
export interface Invoice { id: string; number: string; customerId: string; date: string; due: string; lines: FinLine[]; taxRate: number; draft: boolean; payments: Payment[]; notes: string }
export interface Bill { id: string; number: string; supplier: string; date: string; due: string; lines: FinLine[]; taxRate: number; payments: Payment[]; notes: string }
export interface Expense { id: string; date: string; accountId: string; vendor: string; amount: number; method: string; note: string }
export interface Account { id: string; code: string; name: string; type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense"; system?: boolean }

export const OPENING_CASH = 180000, EQUIPMENT = 62000, LOAN = 40000, OPENING_DATE = "2025-10-01";
export const FIN_START = "2025-10-01";
export const SUPPLIERS_FIN = ["Apex Office Supplies", "CloudNimbus Hosting", "Brightline Telecom", "Steelcraft Fixtures", "Orion Electronics Distribution", "Greenleaf Packaging", "Summit Logistics", "Paragon Professional Services"];
export const EXPENSE_ACCOUNTS = ["5000", "6000", "6100", "6200", "6300", "6400", "6500", "6600", "6700", "6800"];

const ACCOUNTS: Account[] = [
  { id: "1000", code: "1000", name: "Cash at bank", type: "Asset", system: true }, { id: "1100", code: "1100", name: "Accounts receivable", type: "Asset", system: true }, { id: "1500", code: "1500", name: "Equipment (net book value)", type: "Asset", system: true },
  { id: "2000", code: "2000", name: "Accounts payable", type: "Liability", system: true }, { id: "2100", code: "2100", name: "Sales tax payable (net)", type: "Liability", system: true }, { id: "2500", code: "2500", name: "Bank loan", type: "Liability", system: true },
  { id: "3000", code: "3000", name: "Share capital & opening reserves", type: "Equity", system: true }, { id: "3900", code: "3900", name: "Earnings to date", type: "Equity", system: true },
  { id: "4000", code: "4000", name: "Software subscriptions", type: "Revenue" }, { id: "4100", code: "4100", name: "Implementation services", type: "Revenue" }, { id: "4200", code: "4200", name: "Support & maintenance", type: "Revenue" },
  { id: "5000", code: "5000", name: "Cost of sales (hosting & third-party)", type: "Expense" }, { id: "6000", code: "6000", name: "Salaries & wages", type: "Expense" }, { id: "6100", code: "6100", name: "Rent", type: "Expense" }, { id: "6200", code: "6200", name: "Utilities", type: "Expense" },
  { id: "6300", code: "6300", name: "Software & subscriptions", type: "Expense" }, { id: "6400", code: "6400", name: "Travel", type: "Expense" }, { id: "6500", code: "6500", name: "Marketing", type: "Expense" }, { id: "6600", code: "6600", name: "Professional fees", type: "Expense" }, { id: "6700", code: "6700", name: "Office supplies", type: "Expense" }, { id: "6800", code: "6800", name: "Telecom", type: "Expense" },
];
const REV_LINES: [string, string, number][] = [["Platform subscription (annual)", "4000", 18000], ["Platform subscription (quarterly)", "4000", 6500], ["Implementation sprint", "4100", 9500], ["Integration & data migration", "4100", 14000], ["Custom reporting module", "4100", 11000], ["Premium support (quarterly)", "4200", 4200], ["Maintenance retainer", "4200", 2800]];

export const seedFin = () => {
  const cos = seedCrm().companies, emps = seedHrm().employees;
  const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
  const invoices: Invoice[] = []; let n = 1001;
  months.forEach((m, mi) => [3, 8, 12, 18, 23, 27].forEach((day, i) => {
    const date = `${m}-${String(day).padStart(2, "0")}`; if (date > DEMO_TODAY) return;
    const cust = cos[(mi * 5 + i * 3) % cos.length]; const k = `${m}${i}`;
    const lines: FinLine[] = [0, 1, 2].slice(0, 1 + Math.floor(hash01(k + "n") * 3)).map((x) => { const t = REV_LINES[Math.floor(hash01(k + x) * REV_LINES.length)]; const qty = t[2] > 10000 ? 1 + Math.floor(hash01(k + x + "q") * 3) : 1 + Math.floor(hash01(k + x + "q") * 6); return { desc: t[0], accountId: t[1], qty, price: t[2] }; });
    const due = addDays(date, 30); const gross = lines.reduce((a, l) => a + l.qty * l.price, 0) * 1.08; const r = hash01(k + "pay");
    const payments: Payment[] = []; const draft = date >= "2026-03-10" && i >= 4;
    if (!draft) {
      if (r < 0.7 && addDays(due, -Math.floor(hash01(k + "d") * 12)) <= DEMO_TODAY) payments.push({ id: `p${n}a`, date: addDays(due, -Math.floor(hash01(k + "d") * 12)), amount: Math.round(gross * 100) / 100, method: ["Bank transfer", "Card", "Bank transfer"][i % 3], ref: `RCPT-${n}` });
      else if (r < 0.82 && date < "2026-03-01") payments.push({ id: `p${n}a`, date: addDays(date, 20), amount: Math.round(gross * 0.5 * 100) / 100, method: "Bank transfer", ref: `RCPT-${n}` });
    }
    invoices.push({ id: `inv${n}`, number: `INV-${n}`, customerId: cust.id, date, due, lines, taxRate: 0.08, draft, payments, notes: "Payment terms: 30 days." }); n++;
  }));
  const bills: Bill[] = []; let b = 501;
  months.forEach((m, mi) => [5, 11, 17, 24].forEach((day, i) => {
    const date = `${m}-${String(day).padStart(2, "0")}`; if (date > DEMO_TODAY) return; const k = `b${m}${i}`;
    const sup = SUPPLIERS_FIN[(mi + i * 2) % SUPPLIERS_FIN.length]; const acct = ["5000", "6300", "6800", "6700", "6600", "5000"][(mi + i) % 6]; const amt = Math.round((3000 + hash01(k) * 22000) / 10) * 10;
    const due = addDays(date, 30); const gross = amt * 1.08; const pay = addDays(due, -Math.floor(hash01(k + "d") * 10));
    bills.push({ id: `bill${b}`, number: `BILL-${b}`, supplier: sup, date, due, lines: [{ desc: `${sup}: monthly supply`, qty: 1, price: amt, accountId: acct }], taxRate: 0.08, payments: pay <= DEMO_TODAY && hash01(k + "p") < 0.85 ? [{ id: `bp${b}`, date: pay, amount: Math.round(gross * 100) / 100, method: "Bank transfer", ref: `PAY-${b}` }] : [], notes: "" }); b++;
  }));
  const payroll = Math.round(emps.reduce((a, e) => a + e.salary, 0) / 12);
  const expenses: Expense[] = []; let x = 1;
  months.forEach((m) => {
    const d = (day: number) => `${m}-${String(day).padStart(2, "0")}`; const push = (day: number, accountId: string, vendor: string, amount: number, note: string, method = "Bank transfer") => { if (d(day) <= DEMO_TODAY) expenses.push({ id: `ex${x++}`, date: d(day), accountId, vendor, amount, method, note }); };
    push(25, "6000", "Payroll run (summary)", payroll, `Gross salaries ${m} (from the HR demo roster)`); push(1, "6100", "Lakeside Offices LLC", 14500, "Office rent"); push(9, "6200", "Metro Utilities", Math.round(2100 + hash01(m + "u") * 600), "Electricity & water");
    push(14, "6300", "Cloud tools suite", 4800, "Software licences", "Card"); push(16, "6500", "Ad platform", Math.round(8000 + hash01(m + "m") * 6000), "Digital advertising", "Card"); push(20, "6400", "Travel & accommodation", Math.round(1500 + hash01(m + "t") * 4500), "Client visits", "Card"); push(22, "6600", "Hartley & Co accountants", 3200, "Bookkeeping & audit support");
  });
  const reconciled = [...invoices.flatMap((i) => i.payments), ...bills.flatMap((i) => i.payments), ...expenses].filter((t) => t.date <= "2026-02-28" && onBank(t.id)).map((t) => t.id);
  return { accounts: ACCOUNTS, invoices, bills, expenses, reconciled, nextNo: { inv: n, bill: b } };
};
