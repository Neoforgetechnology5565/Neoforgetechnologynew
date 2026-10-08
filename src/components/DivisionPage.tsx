import Link from "next/link";
import type { Metadata } from "next";
import { CapabilityGroups, Chips, CtaBand, SectionHead } from "@/components/Blocks";
import ProjectCard from "@/components/ProjectCard";
import { DivisionGlyph, Pipeline } from "@/components/Visuals";
import { getCategories, getPublishedProjects } from "@/lib/db";
import { DIVISION_MAP, type DivisionSlug } from "@/lib/divisions";

export function divisionMetadata(slug: DivisionSlug): Metadata {
  const d = DIVISION_MAP[slug];
  return { title: d.name, description: d.metaDescription, alternates: { canonical: `/${slug}` }, openGraph: { title: `${d.name} | Neo Forge Technology`, description: d.metaDescription, url: `/${slug}` } };
}

export default async function DivisionPage({ slug }: { slug: DivisionSlug }) {
  const d = DIVISION_MAP[slug];
  const [cats, all] = await Promise.all([getCategories(), getPublishedProjects()]);
  const subs = cats.filter((c) => c.division === slug && c.enabled).sort((a, b) => a.order - b.order);
  const projects = all.filter((p) => p.division === slug).slice(0, 3);
  return (
    <>
      <section className="bg-slate-950 py-20 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.4fr_.6fr] lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-400"><Link href="/" className="hover:text-blue-400">Home</Link><span>/</span><span className="text-slate-200">{d.short}</span></div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Division {d.code}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">{d.name}</h1>
            <p className="mt-4 max-w-2xl text-slate-300">{d.intro}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href={`/contact?division=${d.slug}`} className="rounded-full bg-blue-500 px-7 py-3.5 text-sm font-semibold text-white hover:bg-blue-400">Start a Project</Link>
              <Link href={`/portfolio/${d.slug}`} className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold text-white hover:border-blue-400 hover:text-blue-300">View portfolio</Link>
            </div>
          </div>
          <div className="hidden justify-self-end text-blue-400 lg:block"><div className="scale-[2] origin-top-right"><DivisionGlyph slug={d.slug} /></div></div>
        </div>
        <div className="mx-auto mt-14 max-w-7xl px-4 sm:px-6 lg:px-8"><Pipeline steps={d.pipeline} dark /></div>
      </section>

      {subs.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Areas of work" title={`${d.short} sub-categories`} />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {subs.map((s) => (
              <div key={s.id} className="flex flex-col justify-between rounded-2xl border border-stone-200 p-8 transition hover:border-blue-400 hover:shadow-lg">
                <div>
                  <h2 className="font-display text-xl font-semibold text-stone-900">{s.name}</h2>
                  {s.description && <p className="mt-3 text-sm leading-relaxed text-stone-500">{s.description}</p>}
                  {s.capabilities.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {s.capabilities.slice(0, 4).map((c) => <span key={c} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">{c}</span>)}
                      {s.capabilities.length > 4 && <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500">+{s.capabilities.length - 4} more</span>}
                    </div>
                  )}
                </div>
                <Link href={`/${slug}/${s.slug}`} className="mt-6 inline-block text-sm font-semibold text-stone-900 hover:text-blue-600">Explore {s.name} →</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-stone-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Capabilities" title={d.tagline} />
          <div className="mt-10"><CapabilityGroups division={d} /></div>
          {d.technologies?.map((g) => (
            <div key={g.title} className="mt-12">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">{g.title}</h3>
              <Chips items={g.items} />
              <p className="mt-3 text-xs text-stone-400">Shown as relevant technologies — each project uses the subset that suits the problem.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead eyebrow="Portfolio" title={`Recent ${d.short} work`} />
          <Link href={`/portfolio/${d.slug}`} className="text-sm font-medium text-stone-700 hover:text-blue-600">Full portfolio →</Link>
        </div>
        {projects.length ? <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{projects.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
          : <p className="mt-8 rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">Case studies for this division are being added. Contact us to discuss a similar project.</p>}
      </section>
      <CtaBand division={d.slug} title={`Planning a ${d.short} project?`} />
    </>
  );
}
