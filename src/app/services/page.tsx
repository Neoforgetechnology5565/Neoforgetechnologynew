import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, SectionHead } from "@/components/Blocks";
import JsonLd from "@/components/JsonLd";
import { DIVISIONS } from "@/lib/divisions";
import { breadcrumbLd } from "@/lib/jsonld";
import { SERVICES } from "@/lib/services";

export const metadata: Metadata = {
  title: "Services: Software, AI & CAD/BIM Development",
  description: "Revit and AutoCAD plugins, IFC validation, custom CRM and ERP, business automation, computer vision and quality inspection. See what we build.",
  alternates: { canonical: "/services" },
};

export default function Services() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }])} />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead h1 eyebrow="Services" title="What we build for you">Custom software for engineering and business teams. Pick the area closest to your problem, or tell us what you need and we will find the right approach.</SectionHead>
        {DIVISIONS.map((d) => (
          <div key={d.slug} className="mt-14">
            <h2 className="font-display text-2xl font-semibold text-stone-900">{d.name}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICES.filter((s) => s.division === d.slug).map((s) => (
                <Link key={s.slug} href={`/services/${s.slug}`} className="group rounded-2xl border border-stone-200 p-6 transition hover:border-blue-400 hover:shadow-lg">
                  <h3 className="font-display text-lg font-semibold text-stone-900 group-hover:text-blue-700">{s.name}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-600">{s.intro}</p>
                  <span className="mt-4 inline-block text-sm font-medium text-blue-700">Learn more →</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
      <CtaBand title="Not sure which service fits?" sub="Describe the problem. We'll recommend an approach, not a product." />
    </>
  );
}
