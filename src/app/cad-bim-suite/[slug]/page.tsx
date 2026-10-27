import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/Blocks";
import { SUITE, SUITE_DISCLAIMER, SUITE_MAP } from "@/lib/bim/suite";

type Params = { params: Promise<{ slug: string }> };
export const generateStaticParams = () => SUITE.map((d) => ({ slug: d.slug }));
export async function generateMetadata({ params }: Params): Promise<Metadata> { const d = SUITE_MAP[(await params).slug]; return d ? { title: `${d.title} — CAD/BIM application`, description: d.short, alternates: { canonical: `/cad-bim-suite/${d.slug}` } } : {}; }
export default async function Page({ params }: Params) {
  const d = SUITE_MAP[(await params).slug]; if (!d) notFound();
  return (
    <>
      <section className="bg-slate-950 py-16 text-white"><div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm text-slate-400"><Link href="/portfolio/cad-bim#full-stack-suite" className="hover:text-blue-400">CAD/BIM portfolio</Link> / {d.no}</p>
        <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">{d.title}</h1><p className="mt-4 max-w-2xl text-lg text-slate-300">{d.short}</p>
        <div className="mt-8 flex flex-wrap gap-3">{d.status === "live" ? <Link href={`/cad-bim-suite/${d.slug}/app`} className="rounded-full bg-blue-500 px-7 py-3.5 text-sm font-semibold text-slate-950 hover:bg-blue-400">Launch application</Link> : <span className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold text-slate-400">Not built yet</span>}<Link href="/contact?division=cad-bim" className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold hover:border-blue-400">Request similar software</Link></div>
      </div></section>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="font-display text-xl font-semibold text-stone-900">Status</h2><p className="mt-2 text-stone-700">{d.statusNote}</p>
        {d.features.length > 0 && <><h2 className="mt-10 font-display text-2xl font-semibold text-stone-900">What it does</h2><ul className="mt-4 grid gap-3 sm:grid-cols-2">{d.features.map((f) => <li key={f} className="rounded-xl border border-stone-200 p-4 text-stone-700">{f}</li>)}</ul></>}
        <h2 className="mt-10 font-display text-xl font-semibold text-stone-900">Supported files and engines</h2><p className="mt-2 text-stone-700"><b>Files:</b> {d.formats}. <b>Engines:</b> {d.engines}.</p>
        <p className="mt-8 rounded-lg bg-stone-50 p-4 text-sm text-stone-600">{SUITE_DISCLAIMER}</p>
      </section>
      <CtaBand division="cad-bim" title="Need something like this?" sub="Tell us your workflow." />
    </>
  );
}
