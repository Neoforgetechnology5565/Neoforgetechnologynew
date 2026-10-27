"use client";
/** Small shared pieces of the suite's application chrome. */
import type { ReactNode } from "react";
import { ApiError } from "./api";

export const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40";
export const GO = "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40";
export const FIELD = "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500";
export const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
export const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
export const msg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");
export const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const SEV: Record<string, string> = { error: "bg-red-900/50 text-red-200 border-red-700/60", warning: "bg-amber-900/40 text-amber-200 border-amber-700/60", info: "bg-slate-800 text-slate-300 border-slate-700" };
export function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) { return <label className="block text-xs text-slate-300"><span className="mb-1 block font-medium">{label}</span>{children}{help && <span className="mt-1 block text-slate-500">{help}</span>}</label>; }
export function Tabs<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string; badge?: number | string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">{items.map((t) => <button key={t.id} role="tab" type="button" aria-selected={value === t.id} data-testid={`tab-${t.id}`} onClick={() => onChange(t.id)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${value === t.id ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-300 hover:border-blue-500 hover:text-white"}`}>{t.label}{t.badge !== undefined && <span className="ml-1.5 rounded bg-black/30 px-1.5 text-[11px]">{t.badge}</span>}</button>)}</div>;
}
