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
  const projects = all.filter((p) => p.division === division);
  return (
    <>
      <section className="border-b border-paper/10 grid-bg">
        <div className="container-x py-16 sm:py-20">
          <p className="eyebrow"><Link href="/portfolio" className="hover:underline">Portfolio</Link> / {d.code}</p>
          <h1 className="h-display mt-3 text-4xl sm:text-5xl">{d.name}</h1>
          <p className="mt-4 max-w-2xl text-paper/65">{d.tagline}</p>
          <div className="mt-6 flex gap-2 font-mono text-xs">
            {DIVISIONS.filter((x) => x.slug !== division).map((x) => <Link key={x.slug} href={`/portfolio/${x.slug}`} className="border border-paper/20 px-3 py-1.5 hover:border-forge hover:text-forge">{x.short} →</Link>)}
          </div>
        </div>
      </section>
      <section className="container-x py-12 sm:py-16">
        <PortfolioFilter projects={projects} categories={cats.filter((c) => c.division === division).map((c) => ({ id: c.id, name: c.name }))} />
      </section>
      <CtaBand division={division} />
    </>
  );
}
