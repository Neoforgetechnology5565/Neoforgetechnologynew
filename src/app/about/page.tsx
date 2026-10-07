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
      <section className="border-b border-paper/10 grid-bg">
        <div className="container-x py-16 sm:py-24">
          <p className="eyebrow">About</p>
          <h1 className="h-display mt-4 max-w-4xl text-4xl sm:text-6xl">{about.headline}</h1>
          <p className="mt-6 max-w-2xl whitespace-pre-line text-lg text-paper/70">{about.description}</p>
        </div>
      </section>
      <section className="container-x grid gap-12 py-16 sm:py-24 lg:grid-cols-2">
        <div><p className="eyebrow">Approach</p><p className="mt-4 whitespace-pre-line text-paper/75">{about.approach}</p></div>
        <div><p className="eyebrow">Where we work</p><div className="mt-4"><Chips items={about.capabilities} /></div></div>
      </section>
      <section className="border-y border-paper/10 bg-ink-900">
        <div className="container-x py-16 sm:py-24">
          <SectionHead eyebrow="Three divisions" title="Focused depth in each area." />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {DIVISIONS.map((d) => (<a key={d.slug} href={`/${d.slug}`} className="border border-paper/15 p-6 hover:border-forge"><p className="font-mono text-xs text-forge">{d.code}</p><h3 className="mt-2 font-semibold">{d.name}</h3><p className="mt-2 text-sm text-paper/60">{d.tagline}</p></a>))}
          </div>
        </div>
      </section>
      <section className="container-x py-16 sm:py-24">
        <SectionHead eyebrow="Why Neo Forge Technology" title="What you can expect." />
        <div className="mt-10 grid gap-px border border-paper/15 bg-paper/15 sm:grid-cols-2 lg:grid-cols-5">
          {WHY_US.map((w, i) => (<div key={w.title} className="bg-ink-950 p-6"><p className="font-mono text-xs text-forge">0{i + 1}</p><h3 className="mt-3 font-semibold">{w.title}</h3><p className="mt-2 text-sm text-paper/60">{w.body}</p></div>))}
        </div>
      </section>
      {faqs.length > 0 && (<section className="container-x pb-16 sm:pb-24"><SectionHead eyebrow="FAQ" title="Frequently asked questions" /><div className="mt-8"><FaqList faqs={faqs} /></div></section>)}
      <CtaBand title="Let's talk about your project." />
    </>
  );
}
