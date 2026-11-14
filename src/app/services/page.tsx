import Link from "next/link";
import type { Metadata } from "next";
import { Chips, CtaBand, SectionHead } from "@/components/Blocks";
import JsonLd from "@/components/JsonLd";
import { getCategories } from "@/lib/db";
import { DIVISIONS } from "@/lib/divisions";
import { DIVISION_SERVICES } from "@/lib/division-services";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import { HUB_FAQS, HUB_ITEMS } from "@/lib/services-hub";
import { siteUrl } from "@/lib/utils";
import { SERVICES, SERVICE_FOR_CATEGORY } from "@/lib/services";

const TITLE = "Our Software Development & AI Services | NeoForge Technologies";
const DESC = "Explore NeoForge Technologies services, including AI development, computer vision, CCTV analytics, ANPR software, 3D reconstruction, CAD/BIM and CRM/ERP solutions.";
export const metadata: Metadata = {
  title: { absolute: TITLE }, description: DESC,
  keywords: ["Software Development Services", "AI Development Services", "Computer Vision Services", "Software Engineering Services", "CCTV Analytics Solutions", "ANPR Software Development", "3D Reconstruction Services", "CAD and BIM Development", "CRM and ERP Development"],
  alternates: { canonical: "/services" }, robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "NeoForge Technologies", title: TITLE, description: DESC, url: "/services", images: [DEFAULT_OG_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [DEFAULT_OG_IMAGE.url] },
};

const abs = (p: string) => `${siteUrl()}${p}`;
const servicesLd = () => ({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "CollectionPage", "@id": abs("/services#webpage"), url: abs("/services"), name: TITLE, description: DESC, inLanguage: "en", isPartOf: { "@id": abs("/#website") }, breadcrumb: { "@id": abs("/services#breadcrumb") }, mainEntity: { "@id": abs("/services#list") } },
    { "@type": "ItemList", "@id": abs("/services#list"), name: "NeoForge Technologies service areas", itemListElement: HUB_ITEMS.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/${p.slug}`), name: p.name })) },
    { "@type": "BreadcrumbList", "@id": abs("/services#breadcrumb"), itemListElement: [{ name: "Home", path: "/" }, { name: "Services", path: "/services" }].map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })) },
    { "@type": "FAQPage", "@id": abs("/services#faq"), mainEntity: HUB_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
});

export default async function Services() {
  const cats = (await getCategories()).filter((c) => c.enabled).sort((a, b) => a.order - b.order);
  return (
    <>
      <JsonLd data={servicesLd()} />
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="text-sm text-slate-400"><ol className="flex flex-wrap gap-x-2"><li><Link href="/" className="hover:text-blue-400">Home</Link> /</li><li aria-current="page" className="text-slate-200">Services</li></ol></nav>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Services</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold leading-tight sm:text-5xl">Software Development Services for AI, Computer Vision, CAD/BIM and Business Systems</h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-300">NeoForge Technologies is a software engineering company. We build AI and machine learning software, computer vision and video analytics, CAD and BIM tools, and CRM, ERP and automation systems, each scoped around a measurable problem and tested on your own data.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/contact" className="rounded-full bg-blue-500 px-7 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-blue-400">Discuss Your Project</Link>
            <Link href="/portfolio" className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold transition hover:border-blue-400 hover:text-blue-300">Explore Our Work</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="About us" title="About NeoForge Technologies" />
        <p className="mt-5 text-lg leading-relaxed text-stone-700">We are a software engineering company that works where data, images and engineering meet business operations. Our teams build the model, the pipeline, the application and the integration, so a project arrives as working software your staff can use, not as a prototype.</p>
        <p className="mt-4 leading-relaxed text-stone-700">Our approach is simple: define the decision the software must support, test on your real data early, report accuracy and limits honestly, and keep a person in charge wherever mistakes are costly. The portfolio shows working demonstrations on sample data, labelled as such.</p>
      </section>

      <section className="bg-stone-50 py-14" aria-labelledby="three-divisions" data-testid="three-divisions">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><SectionHead eyebrow="What we build" title="All our services, by division">Every service we offer, listed under its division. Each links to the page that covers it.</SectionHead></div>
        <div className="mx-auto mt-8 grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {DIVISION_SERVICES.map((d) => (
            <article key={d.slug} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-7" data-testid={`division-${d.slug}`}>
              <h3 className="font-display text-xl font-semibold text-stone-900"><Link href={d.landing} className="hover:text-blue-700">{d.name}</Link></h3>
              <ul className="mt-4 space-y-1.5 text-sm">{d.items.map(([n, h]) => <li key={n}><Link href={h} className="text-stone-700 hover:text-blue-700 hover:underline">{n}</Link></li>)}</ul>
              <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm font-semibold"><Link href={d.landing} className="text-blue-700 hover:underline">Explore {d.short}</Link><Link href={`/pricing#${d.slug === "computer-vision" ? "computer-vision-ai" : d.slug}`} className="text-blue-700 hover:underline">Pricing</Link></p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Technologies" title="Technologies and capabilities" />
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[["AI and vision", ["Python", "PyTorch", "TensorFlow", "OpenCV", "ONNX Runtime", "scikit-learn"]], ["Video and 3D", ["RTSP and FFmpeg", "YOLO-family detectors", "COLMAP", "Open3D", "Three.js"]], ["CAD and BIM", ["Revit API", "AutoCAD .NET API", "IFC", "Autodesk Platform Services"]], ["Business systems", ["TypeScript and Next.js", "Node.js", "PostgreSQL", "REST APIs and webhooks"]]].map(([g, items]) => <div key={g as string}><h3 className="text-sm font-semibold uppercase tracking-wider text-blue-700">{g as string}</h3><div className="mt-3"><Chips items={items as string[]} /></div></div>)}
        </div>
      </section>

      <div className="border-t border-stone-200 bg-stone-50 pb-0 pt-14 text-center"><h2 className="font-display text-3xl font-semibold text-stone-900">Specialist services by area</h2><p className="mx-auto mt-3 max-w-2xl px-4 text-stone-600">The detailed service pages within each area.</p></div>
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
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-label="All detailed service pages">
        <SectionHead eyebrow="Service pages" title="All detailed service pages" />
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {DIVISIONS.map((d) => <div key={d.slug}><h3 className="text-sm font-semibold uppercase tracking-wider text-blue-700">{d.short}</h3><ul className="mt-3 space-y-1.5 text-sm">{SERVICES.filter((x) => x.division === d.slug).map((x) => <li key={x.slug}><Link href={`/services/${x.slug}`} className="text-stone-700 hover:text-blue-700 hover:underline">{x.name}</Link></li>)}</ul></div>)}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Portfolio" title="Related portfolio projects" />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HUB_ITEMS.flatMap((p) => p.work.slice(0, 1)).map((w) => <li key={w.href}><Link href={w.href} className="block h-full rounded-xl border border-stone-200 bg-white p-4 hover:border-blue-400"><span className="font-medium text-blue-700">{w.title}</span><span className="mt-0.5 block text-sm text-stone-600">{w.note}</span></Link></li>)}
        </ul>
        <p className="mt-6 text-sm"><Link href="/portfolio" className="font-medium text-blue-700 hover:underline">See the full portfolio →</Link></p>
      </section>
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="FAQ" title="Frequently asked questions" />
        <div className="mt-8 divide-y divide-stone-200 border-y border-stone-200">
          {HUB_FAQS.map((f) => <details key={f.q} className="group py-4"><summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-display text-lg font-medium text-stone-900"><h3 className="text-lg font-medium">{f.q}</h3><span aria-hidden className="mt-1 text-blue-600 transition group-open:rotate-45">+</span></summary><p className="mt-3 leading-relaxed text-stone-700">{f.a}</p></details>)}
        </div>
      </section>
      <CtaBand title="Tell us what you want to build" sub="Describe the problem and send a few sample images, files or screenshots. We will reply with an honest view of scope and approach." />
    </>
  );
}
