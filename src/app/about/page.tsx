import Link from "next/link";
import type { Metadata } from "next";
import { Chips, CtaBand, FaqList, SectionHead } from "@/components/Blocks";
import { DIVISIONS, WHY_US } from "@/lib/divisions";
import { getAbout, getFaqs } from "@/lib/db";

export const metadata: Metadata = {
  title: "About",
  description: "Neo Forge Technology is a software engineering company spanning AI, computer vision, enterprise software, business automation and CAD/BIM engineering technology.",
  alternates: { canonical: "/about" },
};

export default async function About() {
  const [about, faqs] = await Promise.all([getAbout(), getFaqs()]);
  return (
    <>
      <section className="bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">About</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold sm:text-6xl">{about.headline}</h1>
          <p className="mt-6 max-w-2xl whitespace-pre-line text-lg text-slate-300">{about.description}</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">Approach</p><p className="mt-4 whitespace-pre-line leading-relaxed text-stone-600">{about.approach}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">Where we work</p><div className="mt-4"><Chips items={about.capabilities} /></div></div>
      </section>
      <section className="bg-stone-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Three divisions" title="Focused depth in each area." />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {DIVISIONS.map((d) => (<Link key={d.slug} href={`/${d.slug}`} className="rounded-2xl border border-stone-200 bg-white p-7 transition hover:border-blue-400 hover:shadow-lg"><p className="text-xs font-semibold text-blue-600">{d.code}</p><h3 className="mt-2 font-display text-xl font-semibold">{d.name}</h3><p className="mt-2 text-sm text-stone-500">{d.tagline}</p></Link>))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Why Neo Forge Technology" title="What you can expect." />
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {WHY_US.map((w) => (<div key={w.title}><div className="h-1 w-10 rounded-full bg-blue-500" /><h3 className="mt-4 font-display text-lg font-semibold">{w.title}</h3><p className="mt-2 text-sm text-stone-500">{w.body}</p></div>))}
        </div>
      </section>
      {faqs.length > 0 && <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6 lg:px-8"><SectionHead eyebrow="FAQ" title="Frequently asked questions" /><div className="mt-8"><FaqList faqs={faqs} /></div></section>}
      <CtaBand title="Let's talk about your project." />
    </>
  );
}
