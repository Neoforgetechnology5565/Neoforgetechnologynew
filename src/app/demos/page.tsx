import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand } from "@/components/Blocks";
import { DEMOS, DEMO_DISCLAIMER } from "@/lib/demos";

export const metadata: Metadata = {
  title: "CAD/BIM Interactive Demo Center",
  description: "Try working demonstrations of CAD/BIM software Neo Forge Technology can build: Revit automation, AutoCAD, SketchUp, BricsCAD, BIM data, batch processing and engineering tools. Sample data only.",
  alternates: { canonical: "/demos" },
};

export default function Demos() {
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">CAD / BIM · Interactive demos</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Try the software, don&apos;t just look at it.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Working demonstrations of the engineering tools we can build for CAD and BIM teams. Open one, click around, change values and see what happens.</p>
          <p className="mt-4 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{DEMO_DISCLAIMER}</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {DEMOS.map((d) => (
            <li key={d.slug} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex items-center justify-between"><span className="font-display text-2xl font-semibold text-blue-600">{d.no}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${d.status === "live" ? "bg-blue-50 text-blue-700" : "bg-stone-100 text-stone-500"}`}>{d.status === "live" ? "Interactive demo ready" : "In development"}</span></div>
              <h2 className="mt-3 font-display text-xl font-semibold text-stone-900">{d.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{d.problem}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5">{d.tags.map((t) => <li key={t} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">{t}</li>)}</ul>
              <div className="mt-6 flex flex-1 flex-wrap items-end gap-2">
                {d.status === "live"
                  ? <Link href={`/demos/${d.slug}/app`} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Launch Interactive Demo</Link>
                  : <span className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-400" aria-disabled>Demo coming soon</span>}
                <Link href={`/demos/${d.slug}`} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-blue-600 hover:text-blue-700">View Features</Link>
                <Link href={`/contact?division=cad-bim`} className="rounded-full px-2 py-2 text-sm font-medium text-blue-700 hover:underline">Request Similar Software</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <CtaBand division="cad-bim" title="Need something like this for your team?" sub="Tell us the workflow you want to automate. We will reply with an honest view of what is feasible." />
    </>
  );
}
