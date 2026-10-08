import Link from "next/link";
import type { Metadata } from "next";
import { CapabilityGroups, Chips, CtaBand, FaqList, SectionHead } from "@/components/Blocks";
import ProjectCard from "@/components/ProjectCard";
import { DivisionGlyph, HeroVisual } from "@/components/Visuals";
import { DIVISIONS, TECH_GROUPS, WHY_US } from "@/lib/divisions";
import { getFaqs, getFeaturedProjects, getHome } from "@/lib/db";

export const metadata: Metadata = {
  title: { absolute: "Neo Forge Technology — Software, AI, Automation & CAD/BIM Engineering" },
  alternates: { canonical: "/" },
};

export default async function Home() {
  const [home, faqs] = await Promise.all([getHome(), getFaqs()]);
  const featured = await getFeaturedProjects(home.featuredProjectIds);
  const cv = DIVISIONS[0];

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-paper/10">
        <div className="absolute inset-0 grid-bg [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
        <div className="container-x relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_.9fr]">
          <div className="animate-rise">
            <p className="eyebrow">{home.heroEyebrow}</p>
            <h1 className="h-display mt-5 text-[2.6rem] sm:text-6xl xl:text-7xl">{home.heroHeading}</h1>
            <p className="mt-6 max-w-xl text-base text-paper/70 sm:text-lg">{home.heroDescription}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/contact" className="btn-primary">{home.primaryCta} →</Link>
              <Link href="/portfolio" className="btn-ghost">{home.secondaryCta}</Link>
            </div>
          </div>
          <div className="animate-rise [animation-delay:.15s]"><HeroVisual /></div>
        </div>
        <div className="container-x relative grid gap-px border-t border-paper/10 bg-paper/10 sm:grid-cols-3">
          {home.capabilities.map((c, i) => (
            <div key={c.title} className="bg-ink-950 p-6">
              <p className="font-mono text-[10px] text-forge">0{i + 1}</p>
              <h3 className="mt-1 font-semibold">{c.title}</h3>
              <p className="mt-1 text-sm text-paper/60">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* THREE DIVISIONS */}
      <section className="container-x py-20 sm:py-28">
        <SectionHead eyebrow="Three technology divisions" title="One engineering team across AI, business software and CAD/BIM.">
          Each division has its own depth, its own portfolio and the same standard: software that ships and keeps working.
        </SectionHead>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {DIVISIONS.map((d) => (
            <article key={d.slug} className="group flex flex-col border border-paper/15 bg-ink-900 p-6 transition-colors hover:border-forge sm:p-8">
              <div className="flex items-start justify-between text-paper/50 group-hover:text-forge"><span className="font-mono text-xs text-forge">{d.code}</span><DivisionGlyph slug={d.slug} /></div>
              <h3 className="mt-6 text-xl font-semibold">{d.name}</h3>
              <p className="mt-2 text-sm text-paper/60">{d.tagline}</p>
              <ul className="mt-5 flex flex-wrap gap-1.5">
                {d.groups.slice(0, 6).map((g) => <li key={g.title} className="border border-paper/15 px-2 py-1 font-mono text-[11px] text-paper/70">{g.title}</li>)}
              </ul>
              <div className="mt-auto flex gap-5 pt-8 text-sm">
                <Link href={`/${d.slug}`} className="text-forge hover:underline">Capabilities →</Link>
                <Link href={`/portfolio/${d.slug}`} className="text-paper/70 hover:text-forge">Portfolio →</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FEATURED WORK */}
      {featured.length > 0 && (
        <section className="bg-ink-900">
          <div className="container-x py-20 sm:py-28">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHead eyebrow="Selected work" title="Featured projects" />
              <Link href="/portfolio" className="text-sm font-medium text-forge-dim hover:underline">All projects →</Link>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
          </div>
        </section>
      )}

      {/* AI SECTION PREVIEW */}
      <section className="border-y border-paper/10 bg-ink-900">
        <div className="container-x py-20 sm:py-28">
          <SectionHead eyebrow={`${cv.code} / ${cv.short}`} title="Systems that see, predict and decide.">{cv.intro}</SectionHead>
          <div className="mt-10"><CapabilityGroups division={{ ...cv, groups: cv.groups.slice(0, 3) }} /></div>
          <div className="mt-8"><Link href="/computer-vision" className="btn-ghost">Explore Computer Vision / AI →</Link></div>
        </div>
      </section>

      {/* WHY */}
      <section className="container-x py-20 sm:py-28">
        <SectionHead eyebrow="Why Neo Forge Technology" title="Built by engineers, for real workflows." />
        <div className="mt-12 grid gap-px border border-paper/15 bg-paper/15 sm:grid-cols-2 lg:grid-cols-5">
          {WHY_US.map((w, i) => (
            <div key={w.title} className="bg-ink-950 p-6">
              <p className="font-mono text-xs text-forge">0{i + 1}</p>
              <h3 className="mt-3 font-semibold">{w.title}</h3>
              <p className="mt-2 text-sm text-paper/60">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TECH */}
      <section className="border-t border-paper/10 bg-ink-900">
        <div className="container-x py-20">
          <SectionHead eyebrow="Technology" title="Relevant technologies across our work.">A representative view of the tools and platforms we work with — projects use the subset that fits the problem.</SectionHead>
          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            {TECH_GROUPS.map((g) => (<div key={g.title}><h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-forge">{g.title}</h3><Chips items={g.items} /></div>))}
          </div>
        </div>
      </section>

      {faqs.length > 0 && (
        <section className="container-x py-20 sm:py-24">
          <SectionHead eyebrow="FAQ" title="Common questions" />
          <div className="mt-8"><FaqList faqs={faqs} /></div>
        </section>
      )}
      <CtaBand title="Ready to build something that works in production?" sub="Send a short brief. We'll come back with scope, approach and an honest view of risk." />
    </>
  );
}
