import Link from "next/link";
import type { Metadata } from "next";
import { Chips, CtaBand, SectionHead } from "@/components/Blocks";
import JsonLd from "@/components/JsonLd";
import { getCategories } from "@/lib/db";
import { DIVISIONS } from "@/lib/divisions";
import { breadcrumbLd } from "@/lib/jsonld";
import { SERVICE_FOR_CATEGORY } from "@/lib/services";

export const metadata: Metadata = {
  title: "Services",
  description: "Everything Neo Forge Technology builds: computer vision and AI, CRM/HRM/ERP and workflow automation, and CAD/BIM engineering software — each service explained.",
  alternates: { canonical: "/services" },
};

export default async function Services() {
  const cats = (await getCategories()).filter((c) => c.enabled).sort((a, b) => a.order - b.order);
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }])} />
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Services</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">What we build, explained.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Three areas of software engineering. Each service below says what it is and what it is for. Open a service to see its features and what we can do for you. Finished work is in the portfolio.</p>
          <nav aria-label="Service areas" className="mt-8 flex flex-wrap gap-2">
            {DIVISIONS.map((d) => <a key={d.slug} href={`#${d.slug}`} className="rounded-full border border-slate-600 px-4 py-1.5 text-sm font-medium hover:border-blue-400 hover:text-blue-300">{d.short}</a>)}
          </nav>
        </div>
      </section>
      {DIVISIONS.map((d, i) => (
        <section key={d.slug} id={d.slug} className={`scroll-mt-20 ${i % 2 ? "bg-stone-50" : ""}`}>
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <SectionHead eyebrow={`Area ${d.code}`} title={d.name}>{d.intro}</SectionHead>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {cats.filter((c) => c.division === d.slug).map((c) => (
                <article key={c.id} id={c.slug} className="scroll-mt-24 flex flex-col rounded-2xl border border-stone-200 bg-white p-7">
                  <h3 className="font-display text-xl font-semibold text-stone-900">{c.name}</h3>
                  {c.description && <p className="mt-2 text-sm leading-relaxed text-stone-600">{c.description}</p>}
                  {c.capabilities.length > 0 && <div className="mt-4"><Chips items={c.capabilities} /></div>}
                  <p className="mt-5 pt-1 text-sm font-medium">
                    <Link href={SERVICE_FOR_CATEGORY[c.slug] ? `/services/${SERVICE_FOR_CATEGORY[c.slug]}` : `/contact?division=${d.slug}`} className="text-blue-700 hover:underline">Features, what we can do and ask about this →</Link>
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}
      <CtaBand />
    </>
  );
}
