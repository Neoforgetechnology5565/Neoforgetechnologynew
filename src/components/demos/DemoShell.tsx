import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_DISCLAIMER } from "@/lib/demos";

/** Shared chrome for every interactive demo: title bar with a way back, demo badge, reset slot and the sample-data disclaimer. */
export default function DemoShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-200">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
        <Link href="/demos" className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-sky-500 hover:text-white">← All demos</Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-white">{title}</h1>
          <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Interactive demo · sample data</span>
        <div className="ml-auto flex items-center gap-2">{actions}<Link href="/contact?division=cad-bim" className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">Request similar software</Link></div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-slate-800 bg-slate-900 px-4 py-2 text-[11px] leading-snug text-slate-400">{DEMO_DISCLAIMER}</footer>
    </div>
  );
}
