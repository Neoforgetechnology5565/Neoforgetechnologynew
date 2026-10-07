import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, SectionHead } from "@/components/Blocks";
import ProjectCard from "@/components/ProjectCard";
import { DIVISIONS } from "@/lib/divisions";
import { getCategories, getPublishedProjects } from "@/lib/db";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Selected Neo Forge Technology projects across computer vision & AI, CRM/HRM/ERP automation and CAD/BIM engineering software.",
  alternates: { canonical: "/portfolio" },
};

export default async function Portfolio() {
  const [projects, cats] = await Promise.all([getPublishedProjects(), getCategories()]);
  return (
    <>
      <section className="border-b border-paper/10 grid-bg">
        <div className="container-x py-16 sm:py-24">
          <SectionHead eyebrow="Portfolio" title="Work, organised by technology area.">Three divisions, three portfolios. Choose where to start.</SectionHead>
          <nav aria-label="Portfolio divisions" className="mt-8 flex flex-wrap gap-2">
            {DIVISIONS.map((d) => <a key={d.slug} href={`#${d.slug}`} className="border border-paper/25 px-3 py-1.5 font-mono text-xs hover:border-forge hover:text-forge">{d.code} {d.short}</a>)}
          </nav>
        </div>
      </section>
      {DIVISIONS.map((d, i) => {
        const list = projects.filter((p) => p.division === d.slug);
        const subs = cats.filter((c) => c.division === d.slug && list.some((p) => p.categoryId === c.id));
        return (
          <section key={d.slug} id={d.slug} className={`scroll-mt-16 border-b border-paper/10 ${i % 2 ? "bg-ink-900" : ""}`}>
            <div className="container-x py-16">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="eyebrow">Division {d.code}</p><h2 className="h-display mt-2 text-3xl sm:text-4xl">{d.name}</h2></div>
                <Link href={`/portfolio/${d.slug}`} className="text-sm text-forge hover:underline">Open full portfolio →</Link>
              </div>
              {subs.length > 0 && <p className="mt-4 font-mono text-xs text-paper/50">{subs.map((s) => s.name).join(" · ")}</p>}
              {list.length ? (
                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{list.slice(0, 6).map((p) => <ProjectCard key={p.id} p={p} />)}</div>
              ) : (
                <p className="mt-8 border border-dashed border-paper/25 p-8 text-paper/60">Case studies for this division are coming soon.</p>
              )}
            </div>
          </section>
        );
      })}
      <CtaBand />
    </>
  );
}
