import Link from "next/link";
import type { Metadata } from "next";
import { CapabilityGroups, Chips, CtaBand, SectionHead } from "@/components/Blocks";
import ProjectCard from "@/components/ProjectCard";
import { DivisionGlyph, Pipeline } from "@/components/Visuals";
import { DIVISION_MAP, type DivisionSlug } from "@/lib/divisions";
import { getPublishedProjects } from "@/lib/db";

export function divisionMetadata(slug: DivisionSlug): Metadata {
  const d = DIVISION_MAP[slug];
  return {
    title: d.name,
    description: d.metaDescription,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: `${d.name} | Neo Forge Technology`, description: d.metaDescription, url: `/${slug}` },
  };
}

export default async function DivisionPage({ slug }: { slug: DivisionSlug }) {
  const d = DIVISION_MAP[slug];
  const projects = (await getPublishedProjects()).filter((p) => p.division === slug).slice(0, 3);
  return (
    <>
      <section className="relative overflow-hidden border-b border-paper/10">
        <div className="absolute inset-0 grid-bg [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
        <div className="container-x relative grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.3fr_.7fr]">
          <div>
            <p className="eyebrow">Division {d.code}</p>
            <h1 className="h-display mt-4 text-4xl sm:text-6xl">{d.name}</h1>
            <p className="mt-5 max-w-2xl text-lg text-paper/70">{d.intro}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={`/contact?division=${d.slug}`} className="btn-primary">Start a Project →</Link>
              <Link href={`/portfolio/${d.slug}`} className="btn-ghost">View portfolio</Link>
            </div>
          </div>
          <div className="hidden justify-self-end text-forge lg:block"><div className="scale-[2.2] origin-top-right"><DivisionGlyph slug={d.slug} /></div></div>
        </div>
        <div className="container-x relative pb-12"><Pipeline steps={d.pipeline} /></div>
      </section>

      <section className="container-x py-16 sm:py-24">
        <SectionHead eyebrow="Capabilities" title={d.tagline} />
        <div className="mt-10"><CapabilityGroups division={d} /></div>
        {d.technologies?.map((g) => (
          <div key={g.title} className="mt-12">
            <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-forge">{g.title}</h3>
            <Chips items={g.items} />
            <p className="mt-3 text-xs text-paper/45">Shown as relevant technologies — each project uses the subset that suits the problem.</p>
          </div>
        ))}
      </section>

      <section className="bg-paper text-ink-950">
        <div className="container-x py-16 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHead eyebrow="Portfolio" title={`Recent ${d.short} work`} light />
            <Link href={`/portfolio/${d.slug}`} className="text-sm font-medium text-forge-dim hover:underline">Full portfolio →</Link>
          </div>
          {projects.length ? (
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{projects.map((p) => <ProjectCard key={p.id} p={p} light />)}</div>
          ) : (
            <p className="mt-8 border border-dashed border-ink-950/25 p-8 text-ink-950/60">Case studies for this division are being added. Contact us to discuss a similar project.</p>
          )}
        </div>
      </section>
      <CtaBand division={d.slug} title={`Planning a ${d.short} project?`} />
    </>
  );
}
