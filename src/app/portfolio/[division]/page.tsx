import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/Blocks";
import PortfolioFilter from "@/components/PortfolioFilter";
import { DIVISION_MAP, DIVISIONS, isDivisionSlug } from "@/lib/divisions";
import { getCategories, getPublishedProjects } from "@/lib/db";

export const generateStaticParams = () => DIVISIONS.map((d) => ({ division: d.slug }));
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ division: string }> }): Promise<Metadata> {
  const { division } = await params;
  const d = DIVISION_MAP[division];
  if (!d) return {};
  return { title: `${d.short} Portfolio`, description: `${d.name} projects by Neo Forge Technology. ${d.metaDescription}`, alternates: { canonical: `/portfolio/${division}` } };
}

export default async function DivisionPortfolio({ params }: { params: Promise<{ division: string }> }) {
  const { division } = await params;
  if (!isDivisionSlug(division)) notFound();
  const d = DIVISION_MAP[division];
  const [all, cats] = await Promise.all([getPublishedProjects(), getCategories()]);
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm text-slate-400"><Link href="/portfolio" className="hover:text-blue-400">Portfolio</Link><span>/</span><span className="text-slate-200">{d.short}</span></div>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">{d.name}</h1>
          <p className="mt-4 max-w-2xl text-slate-300">{d.tagline}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {DIVISIONS.filter((x) => x.slug !== division).map((x) => <Link key={x.slug} href={`/portfolio/${x.slug}`} className="rounded-full border border-slate-600 px-4 py-1.5 hover:border-blue-400 hover:text-blue-300">{x.short} →</Link>)}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <PortfolioFilter projects={all.filter((p) => p.division === division)} categories={cats.filter((c) => c.division === division).map((c) => ({ id: c.id, name: c.name }))} />
      </section>
      <CtaBand division={division} />
    </>
  );
}
