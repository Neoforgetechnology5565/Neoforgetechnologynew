import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand } from "@/components/Blocks";
import ProjectCard from "@/components/ProjectCard";
import { getCategories, getPublishedProjects } from "@/lib/db";
import { DIVISIONS } from "@/lib/divisions";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Selected Neo Forge Technology projects across computer vision & AI, CRM/HRM/ERP automation and CAD/BIM engineering software.",
  alternates: { canonical: "/portfolio" },
};

export default async function Portfolio() {
  const [projects, cats] = await Promise.all([getPublishedProjects(), getCategories()]);
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Portfolio</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Work, organised by technology area.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Three divisions, three portfolios. Choose where to start.</p>
          <nav aria-label="Portfolio divisions" className="mt-8 flex flex-wrap gap-2">
            {DIVISIONS.map((d) => <a key={d.slug} href={`#${d.slug}`} className="rounded-full border border-slate-600 px-4 py-1.5 text-sm font-medium hover:border-blue-400 hover:text-blue-300">{d.short}</a>)}
          </nav>
        </div>
      </section>
      {DIVISIONS.map((d, i) => {
        const list = projects.filter((p) => p.division === d.slug);
        const subs = cats.filter((c) => c.division === d.slug && c.enabled && list.some((p) => p.categoryId === c.id));
        return (
          <section key={d.slug} id={d.slug} className={`scroll-mt-16 ${i % 2 ? "bg-stone-50" : ""}`}>
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">Division {d.code}</p><h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{d.name}</h2></div>
                <Link href={`/portfolio/${d.slug}`} className="text-sm font-medium text-stone-700 hover:text-blue-600">Open full portfolio →</Link>
              </div>
              {subs.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{subs.map((s) => <Link key={s.id} href={`/${d.slug}/${s.slug}`} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-blue-50 hover:text-blue-700">{s.name}</Link>)}</div>}
              {list.length ? <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{list.slice(0, 6).map((p) => <ProjectCard key={p.id} p={p} />)}</div>
                : <p className="mt-8 rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">Case studies for this division are coming soon.</p>}
            </div>
          </section>
        );
      })}
      <CtaBand />
    </>
  );
}
