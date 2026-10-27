import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_DISCLAIMER } from "@/lib/demos";
import type { Branding } from "@/lib/types";
import Logo from "@/components/Logo";

/** Shared chrome for every interactive demo: Neo Forge logo, app title, project, status, actions and the sample-data disclaimer. */
export default function DemoShell({ branding, app, project, status, actions, children }: { branding: Branding; app: string; project: string; status: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-200">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900 px-3 py-2.5 sm:px-4">
        <Link href="/portfolio/cad-bim" aria-label="Neo Forge Technology — back to CAD/BIM portfolio" className="shrink-0"><Logo media={branding.logoDark} trim={branding.autoTrim} height={34} dark priority /></Link>
        <span className="hidden h-8 w-px bg-slate-700 sm:block" aria-hidden />
        <div className="min-w-0">
          <h1 className="truncate font-display text-base font-semibold text-white">{app}</h1>
          <p className="truncate text-[11px] text-slate-400">{project} · <span className="text-blue-400">{status}</span></p>
        </div>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Simulated demo · sample data</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {actions}
          <Link href="/portfolio/cad-bim" className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-blue-500 hover:text-white">← All demos</Link>
          <Link href="/contact?division=cad-bim" className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">Request similar software</Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-slate-800 bg-slate-900 px-4 py-2 text-[11px] leading-snug text-slate-400">{DEMO_DISCLAIMER} This browser demo does not connect to the desktop application.</footer>
    </div>
  );
}
