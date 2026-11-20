import { ReactNode } from "react";
export const BTN = "rounded border border-ink-600 bg-ink-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-accent hover:text-white disabled:opacity-40 disabled:hover:border-ink-600";
export const GO = "rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40";
export const fmt = (v: number, d = 2) => !Number.isFinite(v) ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
export const int = (v: number) => !Number.isFinite(v) ? "-" : Math.round(v).toLocaleString();
export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return <section className="border-b border-ink-700 p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>{right}</div>{children}</section>;
}
export function Num({ label, value, onChange, min, max, step = 1, hint, id }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string; id?: string }) {
  return <label className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-300" title={hint}><span className="flex-1">{label}</span><input data-testid={id} type="number" className="w-24 text-right" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, v) : v) : v); }} /></label>;
}
export function Range({ label, value, onChange, min, max, step, id, suffix = "" }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; id?: string; suffix?: string }) {
  return <label className="mt-1.5 block text-xs text-slate-300"><span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-slate-400">{fmt(value, step < 0.1 ? 2 : step < 1 ? 1 : 0)}{suffix}</span></span><input data-testid={id} type="range" className="w-full" min={min} max={max} step={step} value={Number.isFinite(value) ? value : min} onChange={(e) => onChange(parseFloat(e.target.value))} /></label>;
}
export function Check({ label, checked, onChange, id, disabled, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; id?: string; disabled?: boolean; hint?: string }) {
  return <label className={`mt-1.5 flex items-center gap-2 text-xs ${disabled ? "text-slate-500" : "text-slate-200"}`} title={hint}><input data-testid={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
export function Sel({ label, value, onChange, options, id }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; id?: string }) {
  return <label className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-300"><span>{label}</span><select data-testid={id} value={value} onChange={(e) => onChange(e.target.value)} className="max-w-[170px]">{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}
export function Badge({ kind, children }: { kind: "ok" | "warn" | "bad" | "off"; children: ReactNode }) {
  const c = { ok: "border-emerald-500/50 text-emerald-300", warn: "border-amber-500/50 text-amber-300", bad: "border-red-500/60 text-red-300", off: "border-slate-600 text-slate-400" }[kind]; return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c}`}>{children}</span>;
}
export function Step({ label, on, onToggle, children, id, note }: { label: string; on: boolean; onToggle: (v: boolean) => void; children?: ReactNode; id: string; note?: string }) {
  return <div className="mt-2 rounded border border-ink-700 bg-ink-900/60 px-2.5 py-1.5"><Check id={id} label={<b className="font-medium">{label}</b>} checked={on} onChange={onToggle} />{note && <p className="ml-6 text-[11px] text-slate-500">{note}</p>}{on && children && <div className="ml-6 pb-1">{children}</div>}</div>;
}
