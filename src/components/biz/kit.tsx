"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Logo from "@/components/Logo";
import type { Branding } from "@/lib/types";
import { downloadCsv, num } from "@/lib/biz/util";

/* ───────────────────────── Shell ───────────────────────── */
export interface NavItem { id: string; label: string; badge?: number | string; group?: string }
type Tone = "green" | "amber" | "red" | "blue" | "slate" | "violet";
const ToastCtx = createContext<(msg: string, tone?: Tone) => void>(() => undefined);
const ConfirmCtx = createContext<(msg: string, opts?: { yes?: string; danger?: boolean }) => Promise<boolean>>(async () => false);
export const useToast = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);

/** Toasts + confirmation dialogs + footer note, shared by every demo regardless of its layout. */
export function AppProviders({ note, children, className = "" }: { note?: string; children: ReactNode; className?: string }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: Tone }[]>([]);
  const [conf, setConf] = useState<{ msg: string; yes: string; danger: boolean; res(v: boolean): void } | null>(null);
  const toast = useCallback((msg: string, tone: Tone = "green") => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, msg, tone }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500); }, []);
  const confirm = useCallback((msg: string, o?: { yes?: string; danger?: boolean }) => new Promise<boolean>((res) => setConf({ msg, yes: o?.yes ?? "Confirm", danger: o?.danger ?? true, res })), []);
  return (
    <ToastCtx.Provider value={toast}><ConfirmCtx.Provider value={confirm}>
      <div className={`erp-root app-readable flex min-h-screen flex-col ${className}`}>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <footer className="no-print border-t border-slate-800 bg-slate-900 px-4 py-2.5 text-[13px] leading-snug text-slate-300">{note ?? "Interactive frontend demonstration with fictional data. Everything runs in your browser and is stored only in this browser's localStorage. There is no server or shared database, and nothing is sent anywhere."}</footer>
        <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[70] flex w-80 flex-col gap-2" role="status" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={`pointer-events-auto rounded-lg border px-3 py-2.5 text-[15px] shadow-lg ${t.tone === "red" ? "border-red-300 bg-red-50 text-red-800" : t.tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-300 bg-white text-slate-800"}`} data-testid="toast">{t.msg}</div>)}
        </div>
        {conf && (
          <Modal title="Please confirm" onClose={() => { conf.res(false); setConf(null); }} small footer={<><Btn onClick={() => { conf.res(false); setConf(null); }}>Cancel</Btn><Btn kind={conf.danger ? "danger" : "primary"} onClick={() => { conf.res(true); setConf(null); }} testid="confirm-yes">{conf.yes}</Btn></>}>
            <p className="text-[15px] text-slate-700">{conf.msg}</p>
          </Modal>
        )}
      </div>
    </ConfirmCtx.Provider></ToastCtx.Provider>
  );
}
/** Reset control: asks for confirmation, then restores the demo's sample data. */
export function ResetButton({ onReset, label = "Reset demo data", className = "" }: { onReset(): void; label?: string; className?: string }) {
  const confirm = useConfirm(); const toast = useToast();
  return <button type="button" className={className || "rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium hover:border-blue-400 hover:text-white"} onClick={async () => { if (await confirm("Restore the original sample data for this demo? Your changes in this browser will be lost.", { yes: "Reset data" })) { onReset(); toast("Sample data restored"); } }}>{label}</button>;
}
export function BrandLogo({ branding, back = "/portfolio/crm-hrm-erp", dark = true, height = 32 }: { branding: Branding; back?: string; dark?: boolean; height?: number }) {
  return <Link href={back} aria-label="Neo Forge Technology: back to demos" className="shrink-0"><Logo media={dark ? branding.logoDark : branding.logoLight} trim={branding.autoTrim} height={height} dark={dark} priority /></Link>;
}
export function DemoLinks({ back = "/portfolio/crm-hrm-erp", compact }: { back?: string; compact?: boolean }) {
  const c = "rounded-md border border-slate-500/60 px-3 py-1.5 text-sm font-medium hover:border-blue-400";
  return <><Link href={back} className={c}>{compact ? "← Demos" : "← All demos"}</Link><Link href="/contact?division=crm-hrm-erp" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500">{compact ? "Request similar" : "Request similar software"}</Link></>;
}
export const DemoBadge = ({ text = "Demonstration · local sample data" }: { text?: string }) => <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-[13px] font-semibold text-amber-600">{text}</span>;

/** Legacy sidebar layout (no demo uses it any more; kept for reference). */
export function ErpShell({ branding, title, subtitle, nav, active, onNav, actions, onReset, resetLabel = "Reset demo data", back = { href: "/portfolio/crm-hrm-erp", label: "← All demos" }, children, note }: {
  branding: Branding; title: string; subtitle: string; nav: NavItem[]; active: string; onNav(id: string): void; actions?: ReactNode; onReset(): void; resetLabel?: string; back?: { href: string; label: string }; children: ReactNode; note?: string;
}) {
  return (
    <AppProviders note={note} className="bg-slate-100 text-slate-800">
      <header className="no-print flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5 text-slate-200"><BrandLogo branding={branding} back={back.href} /><div><h1 className="text-base font-semibold text-white">{title}</h1><p className="text-sm text-slate-400">{subtitle}</p></div><DemoBadge /><div className="ml-auto flex flex-wrap items-center gap-2">{actions}<ResetButton onReset={onReset} label={resetLabel} /><DemoLinks back={back.href} /></div></header>
      <div className="flex flex-1 flex-col lg:flex-row"><nav className="no-print shrink-0 bg-slate-950 p-2 lg:w-60">{nav.map((n) => <button key={n.id} type="button" data-nav={n.id} aria-current={n.id === active ? "page" : undefined} onClick={() => onNav(n.id)} className={`block w-full rounded-md px-3 py-2 text-left text-[15px] ${n.id === active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}>{n.label}</button>)}</nav><main className="min-w-0 flex-1 p-5" id="app-main">{children}</main></div>
    </AppProviders>
  );
}

/* ───────────────────────── Primitives ───────────────────────── */
export const TONE: Record<Tone, string> = { green: "bg-blue-100 text-blue-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-700", blue: "bg-sky-100 text-sky-800", slate: "bg-slate-200 text-slate-700", violet: "bg-violet-100 text-violet-800" };
export const Badge = ({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>;
export function Btn({ kind = "default", small, children, ...p }: { kind?: "default" | "primary" | "danger" | "ghost"; small?: boolean; testid?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { testid, ...rest } = p;
  const k = { default: "border border-slate-300 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-700", primary: "bg-blue-600 text-white hover:bg-blue-700 border border-transparent", danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50", ghost: "text-slate-600 hover:bg-slate-200 border border-transparent" }[kind];
  return <button type="button" data-testid={testid} {...rest} className={`rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-50 ${small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${k} ${rest.className ?? ""}`}>{children}</button>;
}
export const Panel = ({ title, actions, children, className = "", pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) => (
  <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
    {(title || actions) && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5"><h2 className="font-display text-sm font-semibold text-slate-900">{title}</h2><div className="flex flex-wrap items-center gap-2">{actions}</div></div>}
    <div className={pad ? "p-4" : ""}>{children}</div>
  </section>
);
export const Kpi = ({ label, value, sub, tone, onClick, testid }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; onClick?: () => void; testid?: string }) => {
  const inner = <><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 font-display text-3xl font-semibold tabular-nums ${tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-slate-900"}`}>{value}</p>{sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}</>;
  const cls = "h-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm";
  return onClick ? <button type="button" data-testid={testid} onClick={onClick} className={`${cls} hover:border-blue-500`}>{inner}</button> : <div data-testid={testid} className={cls}>{inner}</div>;
};
export const KpiRow = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">{children}</div>;
export const PageHead = ({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) => (
  <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-[30px] font-semibold leading-tight text-slate-900">{title}</h2>{sub && <p className="mt-1 text-[15px] text-slate-600">{sub}</p>}</div><div className="flex flex-wrap items-center gap-2">{actions}</div></div>
);
export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
export const Notice = ({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) => <p className={`rounded-lg border px-3 py-2 text-xs ${tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-900" : tone === "red" ? "border-red-300 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-900"}`}>{children}</p>;
export const Avatar = ({ name, size = 28 }: { name: string; size?: number }) => <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-800" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>;

/* ───────────────────────── Forms ───────────────────────── */
export const INPUT = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100";
export function Field({ label, error, hint, children, className = "" }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>{children}{hint && !error && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}{error && <span role="alert" className="mt-0.5 block text-[11px] font-medium text-red-600">{error}</span>}</label>;
}
export const TextIn = ({ label, error, hint, className, ...p }: { label: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) => <Field label={label} error={error} hint={hint} className={className}><input {...p} className={`${INPUT} ${error ? "!border-red-400" : ""}`} aria-invalid={!!error} /></Field>;
export const SelectIn = ({ label, error, options, className, ...p }: { label: string; error?: string; options: (string | { value: string; label: string })[] } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <Field label={label} error={error} className={className}><select {...p} className={`${INPUT} ${error ? "!border-red-400" : ""}`}>{options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
);
export const AreaIn = ({ label, error, className, ...p }: { label: string; error?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <Field label={label} error={error} className={className}><textarea rows={3} {...p} className={`${INPUT} ${error ? "!border-red-400" : ""}`} /></Field>;

/** Escape closes only the top-most dialog or drawer. */
const layers: symbol[] = [];
function useEscape(onClose: () => void) { const ref = useRef(onClose); ref.current = onClose; useEffect(() => { const me = Symbol("layer"); layers.push(me); const k = (e: KeyboardEvent) => e.key === "Escape" && layers[layers.length - 1] === me && ref.current(); window.addEventListener("keydown", k); return () => { window.removeEventListener("keydown", k); layers.splice(layers.indexOf(me), 1); }; }, []); }
export function Modal({ title, onClose, children, footer, small, wide }: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode; small?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose); useEffect(() => { ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus(); }, []);
  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`w-full rounded-xl bg-white shadow-2xl ${small ? "max-w-md" : wide ? "max-w-4xl" : "max-w-2xl"}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><h3 className="font-display text-base font-semibold text-slate-900">{title}</h3><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded px-2 text-slate-500 hover:bg-slate-100">✕</button></div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
/** Slide-over drawer for record details. */
export function Drawer({ title, onClose, children, footer, wide }: { title: ReactNode; onClose(): void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="no-print fixed inset-0 z-[55] flex justify-end bg-slate-950/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label="Details" className={`flex h-full w-full flex-col bg-white shadow-2xl ${wide ? "max-w-4xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><h3 className="font-display text-base font-semibold text-slate-900">{title}</h3><button type="button" onClick={onClose} aria-label="Close details" className="rounded px-2 text-slate-500 hover:bg-slate-100">✕</button></div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </aside>
    </div>
  );
}
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange(id: string): void }) {
  return <div role="tablist" className="no-print flex flex-wrap gap-1 border-b border-slate-200">{tabs.map((t) => <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${value === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}{t.count != null && <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-600">{t.count}</span>}</button>)}</div>;
}
export const Segmented = ({ options, value, onChange, label }: { options: { id: string; label: string }[]; value: string; onChange(id: string): void; label?: string }) => (
  <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-xs">{options.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={`px-2.5 py-1.5 font-medium ${value === o.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{o.label}</button>)}</div>
);
export const SearchBox = ({ value, onChange, placeholder = "Search…" }: { value: string; onChange(v: string): void; placeholder?: string }) => (
  <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={`${INPUT} !w-56`} />
);
export const FilterSelect = ({ label, value, onChange, options, all = "All" }: { label: string; value: string; onChange(v: string): void; options: (string | { value: string; label: string })[]; all?: string }) => (
  <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${INPUT} !w-auto`}><option value="">{label}: {all}</option>{options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select>
);

/* ───────────────────────── Data table ───────────────────────── */
export interface Col<T> { key: string; label: string; render?(r: T): ReactNode; value?(r: T): string | number; align?: "right"; className?: string; noSort?: boolean; noCsv?: boolean }
export function DataTable<T>({ rows, columns, rowKey, onRow, pageSize = 10, exportName, empty = "No records match.", toolbar, search = true, searchPlaceholder = "Search…", defaultSort, footer, dense, testid, rowClass }: {
  rowClass?(r: T): string; rows: T[]; columns: Col<T>[]; rowKey(r: T): string; onRow?(r: T): void; pageSize?: number; exportName?: string; empty?: ReactNode; toolbar?: ReactNode; search?: boolean; searchPlaceholder?: string; defaultSort?: { key: string; dir: 1 | -1 }; footer?: ReactNode; dense?: boolean; testid?: string;
}) {
  const [q, setQ] = useState(""); const [page, setPage] = useState(0); const [sort, setSort] = useState(defaultSort ?? null);
  const val = (c: Col<T>, r: T) => (c.value ? c.value(r) : ((r as Record<string, unknown>)[c.key] as string | number) ?? "");
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return s ? rows.filter((r) => columns.some((c) => String(val(c, r)).toLowerCase().includes(s))) : rows; }, [rows, q, columns]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = useMemo(() => { if (!sort) return filtered; const c = columns.find((x) => x.key === sort.key); if (!c) return filtered; return [...filtered].sort((a, b) => { const x = val(c, a), y = val(c, b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir; }); }, [filtered, sort, columns]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize)), cur = Math.min(page, pages - 1), view = sorted.slice(cur * pageSize, cur * pageSize + pageSize);
  useEffect(() => setPage(0), [q, rows.length]);
  return (
    <div data-testid={testid}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {search && <SearchBox value={q} onChange={setQ} placeholder={searchPlaceholder} />}{toolbar}
        {exportName && <Btn small className="ml-auto" onClick={() => downloadCsv(exportName, [columns.filter((c) => !c.noCsv).map((c) => c.label), ...sorted.map((r) => columns.filter((c) => !c.noCsv).map((c) => val(c, r)))])}>Export CSV ({sorted.length})</Btn>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500"><tr>{columns.map((c) => (
            <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : ""}`} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
              {c.noSort ? c.label : <button type="button" className="font-semibold uppercase tracking-wider hover:text-slate-900" onClick={() => setSort(sort?.key === c.key ? { key: c.key, dir: (sort.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 })}>{c.label}{sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>}
            </th>))}</tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={`border-t border-slate-100 ${onRow ? "cursor-pointer hover:bg-blue-50/60" : ""} ${rowClass?.(r) ?? ""}`}>
                {columns.map((c) => <td key={c.key} className={`${dense ? "px-3 py-1.5" : "px-3 py-2"} align-middle ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>{c.render ? c.render(r) : String(val(c, r))}</td>)}
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">{empty}</td></tr>}
          </tbody>
          {footer && <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">{footer}</tfoot>}
        </table>
      </div>
      {sorted.length > pageSize && (
        <div className="no-print mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>{cur * pageSize + 1}–{Math.min(sorted.length, cur * pageSize + pageSize)} of {sorted.length}</span>
          <div className="flex gap-1"><Btn small disabled={cur === 0} onClick={() => setPage(cur - 1)}>Prev</Btn><span className="px-2 py-1">Page {cur + 1} / {pages}</span><Btn small disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Btn></div>
        </div>
      )}
      {sorted.length <= pageSize && sorted.length > 0 && <p className="no-print mt-1 text-xs text-slate-400">{sorted.length} record{sorted.length === 1 ? "" : "s"}</p>}
    </div>
  );
}

/* ───────────────────────── Kanban ───────────────────────── */
export function Kanban<T>({ columns, items, colOf, idOf, onMove, renderCard, colFooter, colWidth = "w-64" }: { colWidth?: string; columns: { id: string; label: string; tone?: Tone }[]; items: T[]; colOf(i: T): string; idOf(i: T): string; onMove(id: string, col: string): void; renderCard(i: T): ReactNode; colFooter?(colId: string, items: T[]): ReactNode }) {
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" data-testid="kanban">
      {columns.map((c) => {
        const its = items.filter((i) => colOf(i) === c.id);
        return (
          <div key={c.id} data-col={c.id} onDragOver={(e) => { e.preventDefault(); setOver(c.id); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) onMove(id, c.id); }}
            className={`flex ${colWidth} shrink-0 flex-col rounded-xl border bg-slate-50 ${over === c.id ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
            <div className="flex items-center justify-between px-3 py-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-600">{c.label}</span><Badge tone={c.tone ?? "slate"}>{its.length}</Badge></div>
            <div className="flex min-h-[60px] flex-1 flex-col gap-2 px-2 pb-2">
              {its.map((i) => (
                <div key={idOf(i)} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", idOf(i)); e.dataTransfer.effectAllowed = "move"; }} data-card={idOf(i)} className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing">
                  {renderCard(i)}
                  <select aria-label="Move to column" value={c.id} onChange={(e) => onMove(idOf(i), e.target.value)} className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[11px] text-slate-600">{columns.map((x) => <option key={x.id} value={x.id}>Move to: {x.label}</option>)}</select>
                </div>
              ))}
              {its.length === 0 && <p className="py-3 text-center text-[11px] text-slate-400">Drop cards here</p>}
            </div>
            {colFooter && <div className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500">{colFooter(c.id, its)}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Charts (SVG) ───────────────────────── */
export const PALETTE = ["#34821d", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b", "#14b8a6", "#ec4899"];
export interface Series { key: string; label: string; color?: string }
const niceMax = (m: number) => { if (m <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const Legend = ({ series }: { series: Series[] }) => <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">{series.map((s, i) => <span key={s.key}><span style={{ color: s.color ?? PALETTE[i % PALETTE.length] }}>■</span> {s.label}</span>)}</p>;

export function BarChart({ data, series, stacked, height = 200, fmt = (n) => num(n), onBar, ariaLabel }: { data: { label: string; values: Record<string, number> }[]; series: Series[]; stacked?: boolean; height?: number; fmt?(n: number): string; onBar?(label: string, key: string): void; ariaLabel: string }) {
  const W = 560, H = height, pl = 44, pb = 22, pt = 8, iw = W - pl - 6, ih = H - pb - pt;
  const max = niceMax(Math.max(0, ...data.map((d) => (stacked ? series.reduce((a, s) => a + Math.max(0, d.values[s.key] ?? 0), 0) : Math.max(...series.map((s) => d.values[s.key] ?? 0))))));
  const bw = iw / Math.max(1, data.length), gw = bw * 0.7, sw = stacked ? gw : gw / series.length;
  return (
    <div><svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={pl} x2={W - 6} y1={pt + ih * (1 - t)} y2={pt + ih * (1 - t)} stroke="#e2e8f0" /><text x={pl - 4} y={pt + ih * (1 - t) + 3} textAnchor="end" fontSize="11.5" fill="#64748b">{fmt(max * t)}</text></g>)}
      {data.map((d, i) => { let acc = 0; return (
        <g key={d.label}>
          {series.map((s, k) => { const v = Math.max(0, d.values[s.key] ?? 0), h = (v / max) * ih, x = pl + i * bw + (bw - gw) / 2 + (stacked ? 0 : k * sw), y = stacked ? pt + ih - ((acc + v) / max) * ih : pt + ih - h; acc += v;
            return <rect key={s.key} x={x} y={y} width={Math.max(1, sw - 1)} height={h} rx={1.5} fill={s.color ?? PALETTE[k % PALETTE.length]} className={onBar ? "cursor-pointer hover:opacity-80" : ""} onClick={onBar ? () => onBar(d.label, s.key) : undefined}><title>{`${d.label} · ${s.label}: ${fmt(v)}`}</title></rect>; })}
          <text x={pl + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fill="#64748b">{d.label}</text>
        </g>); })}
    </svg><Legend series={series} /></div>
  );
}
export function LineChart({ data, series, height = 200, fmt = (n) => num(n), ariaLabel, area }: { data: { label: string; values: Record<string, number> }[]; series: Series[]; height?: number; fmt?(n: number): string; ariaLabel: string; area?: boolean }) {
  const W = 560, H = height, pl = 44, pb = 22, pt = 8, iw = W - pl - 10, ih = H - pb - pt;
  const all = data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)); const min = Math.min(0, ...all), max = niceMax(Math.max(...all, 1)), span = max - min || 1;
  const X = (i: number) => pl + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw), Y = (v: number) => pt + ih - ((v - min) / span) * ih;
  return (
    <div><svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={pl} x2={W - 10} y1={pt + ih * (1 - t)} y2={pt + ih * (1 - t)} stroke="#e2e8f0" /><text x={pl - 4} y={pt + ih * (1 - t) + 3} textAnchor="end" fontSize="11.5" fill="#64748b">{fmt(min + span * t)}</text></g>)}
      {series.map((s, k) => { const c = s.color ?? PALETTE[k % PALETTE.length], pts = data.map((d, i) => `${X(i)},${Y(d.values[s.key] ?? 0)}`).join(" ");
        return <g key={s.key}>{area && <polygon points={`${X(0)},${Y(0)} ${pts} ${X(data.length - 1)},${Y(0)}`} fill={c} opacity={0.12} />}<polyline points={pts} fill="none" stroke={c} strokeWidth={2} />{data.map((d, i) => <circle key={i} cx={X(i)} cy={Y(d.values[s.key] ?? 0)} r={3} fill={c}><title>{`${d.label} · ${s.label}: ${fmt(d.values[s.key] ?? 0)}`}</title></circle>)}</g>; })}
      {data.map((d, i) => (data.length <= 12 || i % Math.ceil(data.length / 12) === 0) && <text key={i} x={X(i)} y={H - 6} textAnchor="middle" fontSize="11.5" fill="#64748b">{d.label}</text>)}
    </svg><Legend series={series} /></div>
  );
}
export function Donut({ slices, center, size = 150, onSlice, fmt = (n) => num(n) }: { slices: { label: string; value: number; color?: string }[]; center?: ReactNode; size?: number; onSlice?(label: string): void; fmt?(n: number): string }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1; let a0 = -Math.PI / 2; const R = 50, r = 32;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Breakdown chart">
        {total === 0 ? null : slices.map((s, i) => { const frac = s.value / total, a1 = a0 + frac * Math.PI * 2; if (frac <= 0) return null; const big = frac > 0.5 ? 1 : 0; const P = (a: number, rr: number) => `${(60 + rr * Math.cos(a)).toFixed(3)} ${(60 + rr * Math.sin(a)).toFixed(3)}`; // fixed precision: server and browser trig must serialise identically
          const d = frac >= 0.9999 ? `M60 ${60 - R} A${R} ${R} 0 1 1 59.99 ${60 - R} L59.99 ${60 - r} A${r} ${r} 0 1 0 60 ${60 - r}Z` : `M${P(a0, R)} A${R} ${R} 0 ${big} 1 ${P(a1, R)} L${P(a1, r)} A${r} ${r} 0 ${big} 0 ${P(a0, r)}Z`; a0 = a1;
          return <path key={s.label} d={d} fill={s.color ?? PALETTE[i % PALETTE.length]} className={onSlice ? "cursor-pointer hover:opacity-80" : ""} onClick={onSlice ? () => onSlice(s.label) : undefined}><title>{`${s.label}: ${fmt(s.value)} (${((s.value / total) * 100).toFixed(0)}%)`}</title></path>; })}
        <foreignObject x="30" y="42" width="60" height="36"><div className="flex h-full items-center justify-center text-center text-[10px] font-semibold leading-tight text-slate-700">{center}</div></foreignObject>
      </svg>
      <ul className="space-y-1 text-xs">{slices.map((s, i) => <li key={s.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} /><span className="text-slate-600">{s.label}</span><span className="ml-auto pl-3 font-semibold tabular-nums text-slate-800">{fmt(s.value)}</span></li>)}</ul>
    </div>
  );
}
export function HBars({ items, fmt = (n) => num(n), onClick, max }: { items: { label: string; value: number; color?: string; sub?: string }[]; fmt?(n: number): string; onClick?(label: string): void; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return <ul className="space-y-2">{items.map((i, k) => <li key={i.label} className="text-xs"><button type="button" disabled={!onClick} onClick={() => onClick?.(i.label)} className="block w-full text-left"><div className="flex justify-between text-slate-600"><span>{i.label}{i.sub && <span className="text-slate-400"> · {i.sub}</span>}</span><span className="font-semibold tabular-nums text-slate-800">{fmt(i.value)}</span></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-full rounded" style={{ width: `${Math.max(2, (i.value / m) * 100)}%`, background: i.color ?? PALETTE[k % PALETTE.length] }} /></div></button></li>)}</ul>;
}
export const Progress = ({ value, tone = "green", label }: { value: number; tone?: "green" | "amber" | "red"; label?: string }) => <div className="h-2 w-full rounded bg-slate-200" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><div className={`h-full rounded ${tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;

export function Timeline({ items }: { items: { id: string; at: string; title: ReactNode; sub?: ReactNode; tone?: Tone }[] }) {
  return <ol className="relative ml-2 space-y-3 border-l border-slate-200 pl-4">{items.map((i) => <li key={i.id} className="relative"><span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${i.tone === "red" ? "bg-red-500" : i.tone === "amber" ? "bg-amber-500" : "bg-blue-600"}`} /><p className="text-[11px] text-slate-400">{i.at}</p><p className="text-sm text-slate-800">{i.title}</p>{i.sub && <p className="text-xs text-slate-500">{i.sub}</p>}</li>)}{items.length === 0 && <li className="text-sm text-slate-400">Nothing yet.</li>}</ol>;
}

/** Wrap printable documents. Only .print-area is visible when the user prints (see globals.css). */
export const PrintSheet = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`print-area rounded-lg border border-slate-300 bg-white p-6 text-slate-900 ${className}`}>{children}</div>;
/** Prints the on-screen document: it is cloned into #print-root so the app chrome, dialogs and overlays never appear on paper. */
export function printNow() {
  const src = document.querySelector(".print-area");
  if (!src) { window.print(); return; }
  const root = document.createElement("div"); root.id = "print-root"; root.innerHTML = src.outerHTML;
  document.body.appendChild(root); document.body.classList.add("erp-printing");
  const done = () => { root.remove(); document.body.classList.remove("erp-printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print(); setTimeout(done, 1500);
}
