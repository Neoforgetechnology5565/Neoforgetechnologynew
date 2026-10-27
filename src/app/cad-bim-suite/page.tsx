import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand } from "@/components/Blocks";
import { SUITE, SUITE_DISCLAIMER } from "@/lib/bim/suite";

export const metadata: Metadata = { title: "Full-stack CAD/BIM software suite — 11 applications", description: "Eleven CAD/BIM applications with a real backend: upload DXF, SVG, image or IFC files, process them on the server, inspect results and download outputs. Status of each application is stated honestly.", alternates: { canonical: "/cad-bim-suite" } };
const BADGE = { live: "bg-emerald-100 text-emerald-800", partial: "bg-amber-100 text-amber-800", planned: "bg-stone-100 text-stone-600" } as const;
export default function SuitePage() {
  return (
    <>
      <section className="bg-slate-950 py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">CAD / BIM · full-stack suite</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Eleven CAD/BIM applications with a real backend.</h1>
          <p className="mt-4 max-w-3xl text-slate-300">Unlike the browser-only samples elsewhere in this portfolio, these applications accept real files, process them on the server, store projects and produce downloadable outputs. Each card says exactly what is built and tested today.</p>
          <p className="mt-4 max-w-3xl rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{SUITE_DISCLAIMER}</p>
          <p className="mt-4 text-sm text-slate-400">Looking for the earlier browser-only samples? <Link href="/portfolio/cad-bim" className="text-blue-400 hover:underline">CAD/BIM sample demos →</Link></p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SUITE.map((d) => (
            <li key={d.slug} className={`flex flex-col rounded-2xl border p-6 ${d.status === "live" ? "border-emerald-300 bg-white" : "border-stone-200 bg-stone-50"}`}>
              <div className="flex items-center justify-between"><span className="font-display text-2xl font-semibold text-blue-600">{d.no}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[d.status]}`}>{d.status === "live" ? "Built & tested" : d.status === "partial" ? "Partly built" : "Not built yet"}</span></div>
              <h2 className="mt-3 font-display text-xl font-semibold text-stone-900">{d.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{d.short}</p>
              <p className="mt-2 text-sm text-stone-500"><b className="text-stone-700">Formats:</b> {d.formats}</p>
              <p className="mt-1 text-sm text-stone-500">{d.statusNote}</p>
              <div className="mt-5 flex flex-1 flex-wrap items-end gap-2">
                {d.status === "live" ? <Link href={`/cad-bim-suite/${d.slug}/app`} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Launch application</Link> : <span className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-400" aria-disabled>Not available yet</span>}
                <Link href={`/cad-bim-suite/${d.slug}`} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-blue-600">Details</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <CtaBand division="cad-bim" title="Need a CAD/BIM tool like this for your team?" sub="Tell us the workflow. We will reply with an honest view of what is feasible." />
    </>
  );
}
