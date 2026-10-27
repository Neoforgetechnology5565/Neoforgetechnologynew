/** Shared helpers for the CRM / ERP / HRM demos: dates, money, ids, CSV. All pure and browser-safe. */
export const DEMO_TODAY = "2026-03-15"; // fixed "today" so overdue / ageing numbers are reproducible
export const DEMO_CURRENCY = "USD";

export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const money = (n: number, cur = DEMO_CURRENCY, dp = 2) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n || 0);
export const moneyK = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `$${(n / 1e3).toFixed(0)}k` : money(n, DEMO_CURRENCY, 0));
export const num = (n: number, dp = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp }).format(n || 0);
export const pct = (n: number, dp = 0) => `${(n * 100).toFixed(dp)}%`;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const D = (s: string) => new Date(s.length === 10 ? s + "T00:00:00Z" : s);
export const fmtDate = (s: string) => (s ? D(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
export const fmtShort = (s: string) => (s ? D(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) : "—");
export const addDays = (s: string, n: number) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86400000);
export const monthKey = (s: string) => s.slice(0, 7);
export const monthLabel = (k: string) => D(k + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
export const isoNow = () => `${DEMO_TODAY}T${new Date().toTimeString().slice(0, 5)}`;
export const weekday = (s: string) => D(s).getUTCDay(); // 0 = Sunday
export const isWeekend = (s: string) => weekday(s) === 0 || weekday(s) === 6;
export const lastNMonths = (n: number, end = DEMO_TODAY) => { const [y, m] = end.split("-").map(Number); return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)); return d.toISOString().slice(0, 7); }); };

export const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
export const groupBy = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, T[]>>((a, x) => { (a[f(x)] ??= []).push(x); return a; }, {});
export const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** Deterministic pseudo-random in [0,1) from a string: used only to build the fixed seed datasets. */
export const hash01 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };

const cell = (v: unknown) => { const t = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(t) ? "'" + t : t).replace(/"/g, '""')}"`; };
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n");
export function downloadFile(name: string, text: string, type = "text/plain") {
  const u = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export const downloadCsv = (name: string, rows: unknown[][]) => downloadFile(name.endsWith(".csv") ? name : `${name}.csv`, toCsv(rows), "text/csv");
export const downloadJson = (name: string, data: unknown) => downloadFile(name.endsWith(".json") ? name : `${name}.json`, JSON.stringify(data, null, 2), "application/json");
export const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** Working days (Mon–Fri) in an inclusive date range. */
export const workingDays = (from: string, to: string) => { let n = 0; for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) n++; return n; };
export const tenureYears = (hire: string, today = DEMO_TODAY) => Math.max(0, daysBetween(hire, today) / 365.25);

/** Local date-time helpers for "YYYY-MM-DDTHH:MM" strings (no timezone parsing, so server and browser agree). */
export const DEMO_NOW = "2026-03-15T12:00";
export const dtMs = (s: string) => { const [d, t = "00:00"] = s.split("T"); const [y, m, day] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return Date.UTC(y, m - 1, day, h, mi); };
export const addHours = (s: string, h: number) => { const d = new Date(dtMs(s) + h * 3600000); return d.toISOString().slice(0, 16); };
export const hoursBetween = (a: string, b: string) => (dtMs(b) - dtMs(a)) / 3600000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDt = (s: string) => { const [d, t = ""] = s.split("T"); const [, m, day] = d.split("-").map(Number); return `${String(day).padStart(2, "0")} ${MON[m - 1]} ${t}`; };
export const fmtHours = (h: number) => (Math.abs(h) < 1 ? `${Math.round(Math.abs(h) * 60)} min` : Math.abs(h) < 48 ? `${Math.abs(h).toFixed(1)} h` : `${(Math.abs(h) / 24).toFixed(1)} days`);
