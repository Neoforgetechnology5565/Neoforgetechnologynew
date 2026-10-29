import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand } from "@/components/Blocks";
import ProjectCard from "@/components/ProjectCard";
import { getCategories, getPublishedProjects } from "@/lib/db";
import { DIVISIONS } from "@/lib/divisions";
import PortfolioGallery, { type GalleryItem } from "@/components/PortfolioGallery";
import { previewFor } from "@/components/DemoPreview";
import { ERP_DEMOS } from "@/lib/erp-demos";
import { CV_DEMOS } from "@/lib/cv-demos";
import { DEMOS } from "@/lib/demos";
import { SUITE } from "@/lib/bim/suite";
import type { PreviewKind } from "@/components/DemoPreview";

const SUITE_PREVIEW: Record<string, PreviewKind> = { plan3d: "model", "cad-analysis": "plan", "bim-viewer": "model", "point-cloud": "cloud", interop: "split", floorplan: "plan", structural: "plan", mep: "model", "bim-qc": "document", qto: "calc", collab: "kanban" };

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Selected Neo Forge Technology projects across computer vision & AI, CRM/HRM/ERP automation and CAD/BIM engineering software.",
  alternates: { canonical: "/portfolio" },
};

export default async function Portfolio() {
  const [projects, cats] = await Promise.all([getPublishedProjects(), getCategories()]);
  const items: GalleryItem[] = [
    ...ERP_DEMOS.map((d): GalleryItem => ({ id: `erp-${d.slug}`, group: "crm-hrm-erp", no: d.no, title: d.title, desc: d.problem, tags: d.tags, href: `/erp-demos/${d.slug}`, appHref: `/erp-demos/${d.slug}/app`, status: "live", layout: d.layout, preview: previewFor("crm-hrm-erp", d.slug) })),
    ...CV_DEMOS.map((d): GalleryItem => ({ id: `cv-${d.slug}`, group: "computer-vision", no: d.no, title: d.title, desc: d.problem, tags: d.tags, href: `/ai-demos/${d.slug}`, appHref: d.status === "live" ? `/ai-demos/${d.slug}/app` : undefined, status: d.status, layout: d.layout, cover: d.cover, preview: previewFor("computer-vision", d.slug) })),
    ...DEMOS.map((d): GalleryItem => ({ id: `cad-${d.slug}`, group: "cad-bim", no: d.no, title: d.title, desc: d.problem, tags: d.tags, href: `/demos/${d.slug}`, appHref: d.status === "live" ? `/demos/${d.slug}/app` : undefined, status: d.status, preview: previewFor("cad-bim", d.slug) })),
    ...SUITE.map((d): GalleryItem => ({ id: `suite-${d.slug}`, group: "cad-bim", no: d.no, title: d.title, desc: d.short, tags: d.formats.split(/,\s*/).slice(0, 4), href: `/cad-bim-suite/${d.slug}`, appHref: `/cad-bim-suite/${d.slug}/app`, status: "live", preview: SUITE_PREVIEW[d.key] ?? "model" })),
  ];
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Portfolio</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Work, organised by technology area.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">A gallery of interactive demonstrations across three divisions, each with its own workspace layout. Search, filter, and open any demo. Items marked “In development” have no working app yet.</p>
          <nav aria-label="Portfolio divisions" className="mt-8 flex flex-wrap gap-2">
            {DIVISIONS.map((d) => <a key={d.slug} href={`#${d.slug}`} className="rounded-full border border-slate-600 px-4 py-1.5 text-sm font-medium hover:border-blue-400 hover:text-blue-300">{d.short}</a>)}
          </nav>
        </div>
      </section>
      <PortfolioGallery items={items} />
      <div className="border-t border-stone-200 bg-stone-50 py-10 text-center"><h2 className="font-display text-2xl font-semibold text-stone-900">Case studies by division</h2></div>
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
