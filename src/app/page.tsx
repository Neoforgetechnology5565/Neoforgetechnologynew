import Link from "next/link";
import type { Metadata } from "next";
import { Chips, CtaBand, FaqList, SectionHead } from "@/components/Blocks";
import HeroSlideshow, { type HeroSlide } from "@/components/HeroSlideshow";
import ProjectCard from "@/components/ProjectCard";
import { DivisionGlyph, HeroVisual } from "@/components/Visuals";
import { img } from "@/lib/cloudinary";
import { getCategories, getFaqs, getFeaturedProjects, getHome } from "@/lib/db";
import { DIVISIONS, TECH_GROUPS, WHY_US } from "@/lib/divisions";

export const metadata: Metadata = {
  title: { absolute: "Neo Forge Technology — Software, AI, Automation & CAD/BIM Engineering" },
  alternates: { canonical: "/" },
};

export default async function Home() {
  const [home, faqs, cats] = await Promise.all([getHome(), getFaqs(), getCategories()]);
  const featured = await getFeaturedProjects(home.featuredProjectIds);
  const slides: HeroSlide[] = featured.filter((p) => p.cover).slice(0, 6).map((p) => ({ url: img(p.cover, { w: 1600 }), title: p.title }));
  const subs = (slug: string) => cats.filter((c) => c.division === slug && c.enabled).sort((a, b) => a.order - b.order);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <HeroSlideshow slides={slides} />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/70 to-slate-950" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:py-32">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-400">{home.heroEyebrow}</p>
            <h1 className="mt-6 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">{home.heroHeading}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">{home.heroDescription}</p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/contact" className="rounded-full bg-blue-500 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-400">{home.primaryCta}</Link>
              <Link href="#work" className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-blue-400 hover:text-blue-300">{home.secondaryCta}</Link>
            </div>
          </div>
          {slides.length === 0 && <div className="hidden lg:block"><HeroVisual /></div>}
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-px border-t border-slate-800 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
          {home.capabilities.map((c, i) => (
            <div key={c.title} className="py-6 sm:pr-8">
              <p className="text-xs font-semibold text-blue-400">0{i + 1}</p>
              <h3 className="mt-1 font-display text-lg font-semibold">{c.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Three divisions: alternating white / dark / white */}
      {DIVISIONS.map((d, i) => {
        const dark = i === 1;
        const list = subs(d.slug);
        return (
          <section key={d.slug} id={i === 0 ? "work" : undefined} className={dark ? "bg-slate-950 py-24 text-white" : "py-24"}>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-2xl">
                  <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${dark ? "text-blue-400" : "text-blue-600"}`}>Division {d.code}</p>
                  <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">{d.name}</h2>
                  <p className={`mt-4 ${dark ? "text-slate-300" : "text-stone-500"}`}>{d.intro}</p>
                </div>
                <div className="flex items-center gap-6">
                  <span className={`hidden sm:block ${dark ? "text-blue-400" : "text-blue-600"}`}><DivisionGlyph slug={d.slug} /></span>
                  <Link href={`/${d.slug}`} className={`text-sm font-medium ${dark ? "text-slate-300 hover:text-blue-400" : "text-stone-700 hover:text-blue-600"}`}>View all {d.short} →</Link>
                </div>
              </div>
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(list.length ? list.map((s) => ({ key: s.id, name: s.name, desc: s.description, href: `/${d.slug}/${s.slug}` }))
                  : d.groups.map((g) => ({ key: g.title, name: g.title, desc: g.items.slice(0, 4).join(" · "), href: `/${d.slug}#${g.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` }))).slice(0, 9).map((c) => (
                  <Link key={c.key} href={c.href} className={`group rounded-2xl border p-7 transition ${dark ? "border-slate-800 hover:border-blue-400" : "border-stone-200 hover:border-blue-400 hover:shadow-lg"}`}>
                    <h3 className={`font-display text-xl font-semibold ${dark ? "text-white group-hover:text-blue-400" : "text-stone-900 group-hover:text-blue-600"}`}>{c.name}</h3>
                    {c.desc && <p className={`mt-2 line-clamp-3 text-sm leading-relaxed ${dark ? "text-slate-400" : "text-stone-500"}`}>{c.desc}</p>}
                    <span className={`mt-4 inline-block text-sm font-medium ${dark ? "text-blue-400" : "text-blue-600"}`}>Explore →</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* Featured */}
      {featured.length > 0 && (
        <section className="bg-stone-50 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHead eyebrow="Selected work" title="Featured projects" />
              <Link href="/portfolio" className="text-sm font-medium text-stone-700 hover:text-blue-600">All projects →</Link>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{featured.map((p, i) => <ProjectCard key={p.id} p={p} priority={i < 3} />)}</div>
          </div>
        </section>
      )}

      {/* About blurb */}
      <section className="bg-stone-100 py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">About the company</p>
          <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Neo Forge Technology</h2>
          <p className="mt-6 text-lg leading-relaxed text-stone-600">A software engineering company working across artificial intelligence, enterprise software and engineering technology — building systems that run in production, not demonstrations.</p>
          <Link href="/about" className="mt-6 inline-block text-sm font-semibold text-blue-600 hover:text-blue-700">Learn more about us →</Link>
        </div>
      </section>

      {/* Why us */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Why Neo Forge Technology" title="Why choose us" />
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {WHY_US.map((w) => (
            <div key={w.title}><div className="h-1 w-10 rounded-full bg-blue-500" /><h3 className="mt-4 font-display text-lg font-semibold">{w.title}</h3><p className="mt-2 text-sm leading-relaxed text-stone-500">{w.body}</p></div>
          ))}
        </div>
      </section>

      {/* Tech */}
      <section className="border-y border-stone-200 bg-stone-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Technology" title="Relevant technologies across our work.">A representative view of the tools and platforms we work with — projects use the subset that fits the problem.</SectionHead>
          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            {TECH_GROUPS.map((g) => (<div key={g.title}><h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">{g.title}</h3><Chips items={g.items} /></div>))}
          </div>
        </div>
      </section>

      {faqs.length > 0 && (
        <section className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
          <SectionHead eyebrow="FAQ" title="Common questions" />
          <div className="mt-8"><FaqList faqs={faqs} /></div>
        </section>
      )}
      <CtaBand title="Let's build something that works in production." sub="Send a short brief. We'll come back with scope, approach and an honest view of risk." />
    </>
  );
}
