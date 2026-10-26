import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/Blocks";
import { DEMOS, DEMO_DISCLAIMER, DEMO_MAP } from "@/lib/demos";

type Params = { params: Promise<{ slug: string }> };
export const generateStaticParams = () => DEMOS.map((d) => ({ slug: d.slug }));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = DEMO_MAP[(await params).slug];
  return d ? { title: `${d.title} — interactive demo`, description: d.problem, alternates: { canonical: `/demos/${d.slug}` } } : {};
}

export default async function DemoPage({ params }: Params) {
  const d = DEMO_MAP[(await params).slug];
  if (!d) notFound();
  return (
    <>
      <section className="bg-slate-950 py-16 text-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-slate-400"><Link href="/demos" className="hover:text-blue-400">CAD/BIM demos</Link> / {d.no}</p>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">{d.title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">{d.problem}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {d.status === "live" ? <Link href={`/demos/${d.slug}/app`} className="rounded-full bg-blue-500 px-7 py-3.5 text-sm font-semibold text-slate-950 hover:bg-blue-400">Launch Interactive Demo</Link>
              : <span className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold text-slate-400">Demo in development</span>}
            <Link href="/contact?division=cad-bim" className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold hover:border-blue-400">Request Similar Software</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl font-semibold text-stone-900">{d.status === "live" ? "What you can do in the demo" : "Planned features"}</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">{d.features.map((f) => <li key={f} className="flex gap-3 rounded-xl border border-stone-200 p-4 text-stone-700"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />{f}</li>)}</ul>
        <h2 className="mt-12 font-display text-xl font-semibold text-stone-900">Technology focus</h2>
        <ul className="mt-3 flex flex-wrap gap-2">{d.tags.map((t) => <li key={t} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-600">{t}</li>)}</ul>
        <p className="mt-10 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{DEMO_DISCLAIMER} The browser demo does not run Revit, AutoCAD, SketchUp or BricsCAD; it simulates the workflow on invented data.</p>
      </section>
      <CtaBand division="cad-bim" />
    </>
  );
}
