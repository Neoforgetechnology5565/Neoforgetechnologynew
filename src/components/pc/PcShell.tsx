"use client";
import type { ReactNode } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";

export const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40";
export const GO = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40";
export const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
export const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
export const INPUT = "rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100";
export const TAB = (on: boolean) => `rounded-md border px-3 py-1.5 text-xs font-medium ${on ? "border-blue-500 bg-blue-600/20 text-white" : "border-slate-700 text-slate-300 hover:border-blue-500"}`;

/** Shared frame for the point-cloud demos 26-28: Neo Forge header, honesty notice, footer. */
export default function PcShell({ branding, title, project, status, notice, footer, children, actions }: { branding: Branding; title: string; project: string; status: string; notice: string; footer: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <DemoShell branding={branding} app={title} project={project} status={status} badge="Computer Vision · prototype" actions={actions}
      back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision" footer={footer}>
      <div className="mx-auto max-w-[1600px] space-y-3 p-3 sm:p-4">
        <div role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[13px] leading-snug text-amber-100" data-testid="notice">{notice}</div>
        {children}
      </div>
    </DemoShell>
  );
}
export function Slider({ label, value, min, max, step, unit, onChange, hint, id }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; hint?: string; id?: string }) {
  return (
    <label className="block text-xs text-slate-300"><span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-slate-100">{value}{unit ? ` ${unit}` : ""}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} data-testid={id} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-blue-500" />{hint && <span className="block text-[11px] text-slate-500">{hint}</span>}</label>
  );
}
export const Badge = ({ ok, children }: { ok: boolean | null; children: ReactNode }) => <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ok === null ? "border-slate-600 text-slate-300" : ok ? "border-green-500/50 bg-green-500/10 text-green-300" : "border-red-500/50 bg-red-500/10 text-red-300"}`}>{children}</span>;
export function download(name: string, blob: Blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
