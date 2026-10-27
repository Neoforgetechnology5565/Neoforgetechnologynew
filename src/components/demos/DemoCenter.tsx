import Link from "next/link";
import { CtaBand, SectionHead } from "@/components/Blocks";
import { PROCESS } from "@/lib/services";
import { DEMOS, DEMO_DISCLAIMER } from "@/lib/demos";

/** CAD/BIM portfolio: the interactive demo cards. Shown at /portfolio/cad-bim (and /demos). */
export default function DemoCenter({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">CAD / BIM · Sample works and services</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Sample works and what we offer.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">We build software for CAD and BIM teams: plugins, automation and engineering tools. Below is what we offer, and working sample demonstrations you can open, click around in and test with your own inputs. Try the software, don&apos;t just look at it.</p>
          <p className="mt-4 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{DEMO_DISCLAIMER}</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5"><div className="min-w-0 flex-1"><p className="font-display text-lg font-semibold text-stone-900">New: full-stack CAD/BIM suite with a real backend</p><p className="mt-1 text-sm text-stone-700">Upload a 2D plan (DXF, SVG, image or IFC), get a 3D building with interior, exterior and MEP/HVAC, run clash detection and download IFC, GLB, DXF and PDF. Each application states exactly what is built.</p></div><Link href="/cad-bim-suite" className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600">Open the suite</Link></div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Sample works" title="Interactive demonstrations">Ten working samples of the kinds of tools we can build. They run in your browser on invented sample data, so you can test them without installing anything.</SectionHead>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
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
      <section className="border-y border-stone-200 bg-stone-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="How it works" title="From your idea to working software" />
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((x, i) => <li key={x.title}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">{i + 1}</span><h3 className="mt-3 font-display text-lg font-semibold text-stone-900">{x.title}</h3><p className="mt-1 text-sm leading-relaxed text-stone-600">{x.text}</p></li>)}
          </ol>
          <p className="mt-8 max-w-3xl text-sm text-stone-500">The demos above are samples to show what is possible. Your tool is built around your own standards, files and software versions, and we agree scope, timeline and price in writing before any work starts.</p>
        </div>
      </section>
      {children}
      <CtaBand division="cad-bim" title="Need something like this for your team?" sub="Tell us the workflow you want to automate. We will reply with an honest view of what is feasible." />
    </>
  );
}
