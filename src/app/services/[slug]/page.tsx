import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chips, CtaBand, FaqList, SectionHead } from "@/components/Blocks";
import JsonLd from "@/components/JsonLd";
import PostCard from "@/components/PostCard";
import { getPublishedPosts } from "@/lib/db";
import { DIVISION_MAP } from "@/lib/divisions";
import { breadcrumbLd, faqLd, serviceLandingLd } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import { SERVICE_MAP, SERVICES } from "@/lib/services";
import { EXTRAS, PROCESS_TITLES } from "@/lib/services-extra";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const s = SERVICE_MAP[(await params).slug];
  if (!s) return {};
  return {
    title: s.metaTitle,
    description: s.metaDescription,
    alternates: { canonical: `/services/${s.slug}` },
    openGraph: { title: s.metaTitle, description: s.metaDescription, url: `/services/${s.slug}`, images: [DEFAULT_OG_IMAGE] },
    twitter: { card: "summary_large_image", title: s.metaTitle, description: s.metaDescription, images: [DEFAULT_OG_IMAGE.url] },
  };
}

export default async function ServicePage({ params }: Params) {
  const s = SERVICE_MAP[(await params).slug];
  if (!s) notFound();
  const d = DIVISION_MAP[s.division];
  const posts = await getPublishedPosts();
  const articles = posts.filter((p) => p.division === s.division).slice(0, 3);
  const others = SERVICES.filter((x) => x.slug !== s.slug && x.division === s.division);
  const x = EXTRAS[s.slug];
  const faqs = s.faqs.map((f, i) => ({ id: `${s.slug}-${i}`, question: f.q, answer: f.a, order: i, enabled: true }));

  return (
    <>
      <JsonLd data={[serviceLandingLd(s), faqLd(faqs), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }, { name: s.name, path: `/services/${s.slug}` }])]} />
      <section className="bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-slate-400"><Link href="/" className="hover:text-blue-400">Home</Link> / <Link href="/services" className="hover:text-blue-400">Services</Link> / {s.name}</p>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">{d.name}</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">{s.h1}</h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-300">{s.intro}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href={`/contact?division=${s.division}`} className="rounded-full bg-blue-500 px-7 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-blue-400">Ask about this service</Link>
            <Link href="/book" className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-blue-400">Book a consultation</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Features and what we can do" title={`${s.name}: what you get`} />
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">{s.build.map((b) => <li key={b} className="flex gap-3 rounded-xl border border-stone-200 p-4 text-stone-700"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />{b}</li>)}</ul>
        <div className="mt-12 rounded-2xl bg-stone-50 p-6">
          <h2 className="font-display text-xl font-semibold text-stone-900">This is a good fit if…</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-stone-700">{s.fit.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
        <div className="mt-6 rounded-2xl border border-stone-200 p-6">
          <h2 className="font-display text-xl font-semibold text-stone-900">Typical uses</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-stone-700">{x.useCases.map((u) => <li key={u}>{u}</li>)}</ul>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-stone-50 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="How it works" title="A simple process, no surprises" />
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{x.process.map((text, i) => <li key={i}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">{i + 1}</span><h3 className="mt-3 font-display text-lg font-semibold text-stone-900">{PROCESS_TITLES[i]}</h3><p className="mt-1 text-sm leading-relaxed text-stone-600">{text}</p></li>)}</ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Technologies we use for this</h2>
        <div className="mt-4"><Chips items={s.tech} /></div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead eyebrow="FAQ" title={`${s.name}: common questions`} />
        <div className="mt-8"><FaqList faqs={faqs} /></div>
      </section>

      {articles.length > 0 && (
        <section className="bg-stone-50 py-16"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">From the blog</p><div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{articles.map((p) => <PostCard key={p.id} p={p} />)}</div></div></section>
      )}

      {others.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-xl font-semibold text-stone-900">Related services</h2>
          <ul className="mt-4 flex flex-wrap gap-3">{others.map((o) => <li key={o.slug}><Link href={`/services/${o.slug}`} className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-blue-500 hover:text-blue-700">{o.name}</Link></li>)}<li><Link href="/services" className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-blue-500 hover:text-blue-700">All services →</Link></li></ul>
        </section>
      )}

      <CtaBand division={s.division} title={`Need ${s.name.toLowerCase()}?`} sub={x.cta} />
    </>
  );
}
