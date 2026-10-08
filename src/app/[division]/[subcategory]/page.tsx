import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chips, CtaBand } from "@/components/Blocks";
import ProjectCard from "@/components/ProjectCard";
import { getCategories, getPublishedProjects } from "@/lib/db";
import { DIVISION_MAP, isDivisionSlug } from "@/lib/divisions";

type Params = { params: Promise<{ division: string; subcategory: string }> };

async function load(division: string, sub: string) {
  if (!isDivisionSlug(division)) return null;
  const cats = await getCategories();
  const category = cats.find((c) => c.division === division && c.slug === sub);
  return category ? { category, siblings: cats.filter((c) => c.division === division && c.id !== category.id) } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { division, subcategory } = await params;
  const r = await load(division, subcategory);
  if (!r) return {};
  return { title: `${r.category.name} — ${DIVISION_MAP[division].short}`, description: r.category.description || DIVISION_MAP[division].metaDescription, alternates: { canonical: `/${division}/${subcategory}` } };
}

export default async function SubcategoryPage({ params }: Params) {
  const { division, subcategory } = await params;
  const r = await load(division, subcategory);
  if (!r) notFound();
  const d = DIVISION_MAP[division];
  const projects = (await getPublishedProjects()).filter((p) => p.categoryId === r.category.id);
  return (
    <>
      <section className="bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Link href="/" className="hover:text-blue-400">Home</Link><span>/</span>
            <Link href={`/${division}`} className="hover:text-blue-400">{d.short}</Link><span>/</span>
            <span className="text-slate-200">{r.category.name}</span>
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">{r.category.name}</h1>
          {r.category.description && <p className="mt-4 max-w-2xl text-slate-300">{r.category.description}</p>}
          {r.category.capabilities.length > 0 && <div className="mt-6"><Chips items={r.category.capabilities} dark /></div>}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {projects.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{projects.map((p, i) => <ProjectCard key={p.id} p={p} priority={i < 3} />)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 p-16 text-center"><p className="font-display text-xl text-stone-400">Projects coming soon.</p></div>
        )}
        {r.siblings.length > 0 && (
          <div className="mt-16 border-t border-stone-200 pt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">More in {d.short}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {r.siblings.map((s) => <Link key={s.id} href={`/${division}/${s.slug}`} className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:border-blue-600 hover:text-blue-600">{s.name}</Link>)}
            </div>
          </div>
        )}
      </section>
      <CtaBand division={division} />
    </>
  );
}
