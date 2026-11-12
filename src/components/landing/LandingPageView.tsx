import Link from "next/link";
import { CtaBand, SectionHead } from "@/components/Blocks";
import JsonLd from "@/components/JsonLd";
import { DIVISION_MAP } from "@/lib/divisions";
import { LANDING_PAGES } from "@/lib/landing-pages";
import type { LandingPage } from "@/lib/landing-types";
import { landingLd } from "@/lib/landing-seo";
import { SERVICE_MAP } from "@/lib/services";
import LandingArt from "./LandingArt";
import LandingIcon from "./LandingIcon";

/** One SEO landing page. Server-rendered; no client JavaScript. */
export default function LandingPageView({ page: p }: { page: LandingPage }) {
  const d = DIVISION_MAP[p.division], others = LANDING_PAGES.filter((x) => x.slug !== p.slug && (x.division === p.division || x.slug === "ai-development")).slice(0, 4);
  const services = p.relatedServices.map((s) => SERVICE_MAP[s]).filter(Boolean);
  return (
    <>
      <JsonLd data={landingLd(p)} />
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <nav aria-label="Breadcrumb" className="text-sm text-slate-400"><ol className="flex flex-wrap gap-x-2"><li><Link href="/" className="hover:text-blue-400">Home</Link> /</li><li><Link href="/services" className="hover:text-blue-400">Services</Link> /</li><li aria-current="page" className="text-slate-200">{p.name}</li></ol></nav>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">{p.eyebrow}</p>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl lg:text-[2.6rem]">{p.h1}</h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">{p.lead}</p>
            <ul className="mt-6 space-y-2 text-slate-200">{p.value.map((v) => <li key={v} className="flex gap-3"><span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-400" />{v}</li>)}</ul>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href={`/contact?division=${p.division}`} className="rounded-full bg-blue-500 px-7 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-blue-400">Discuss Your Project</Link>
              <Link href={`/portfolio/${p.division}`} className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold transition hover:border-blue-400 hover:text-blue-300">Explore Our Work</Link>
            </div>
          </div>
          <LandingArt kind={p.art} alt={p.artAlt} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Overview" title={`Understanding ${p.name}`} />
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-stone-700">{p.overview.what}</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-6"><h3 className="font-display text-lg font-semibold text-stone-900">Problems it solves</h3><ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-stone-700">{p.overview.solves.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div className="rounded-2xl border border-stone-200 bg-white p-6"><h3 className="font-display text-lg font-semibold text-stone-900">Who needs it</h3><ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-stone-700">{p.overview.who.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div className="rounded-2xl border border-stone-200 bg-white p-6 md:col-span-2 lg:col-span-1"><h3 className="font-display text-lg font-semibold text-stone-900">What NeoForge Technologies develops</h3><p className="mt-3 text-sm leading-relaxed text-stone-700">{p.overview.build}</p><p className="mt-3 text-sm leading-relaxed text-stone-700">{p.overview.useful}</p></div>
        </div>
      </section>

      <section className="bg-stone-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Capabilities" title="Core services and capabilities" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {p.capabilities.map((c) => (
              <article key={c.title} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><LandingIcon name={c.icon} /></span>
                <h3 className="mt-4 font-display text-lg font-semibold text-stone-900">{c.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-stone-700">{c.text}</p>
                <p className="mt-4 border-t border-stone-100 pt-3 text-xs font-medium text-stone-500"><span className="sr-only">Technologies: </span>{c.tech}</p>
              </article>))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Applications" title="Applications and use cases" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {p.useCases.map((u) => <article key={u.industry} className="rounded-2xl border border-stone-200 p-6"><h3 className="font-display text-lg font-semibold text-stone-900">{u.industry}</h3><p className="mt-2 text-sm leading-relaxed text-stone-700">{u.text}</p></article>)}
        </div>
      </section>

      <section className="bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Technologies" title="Technologies and tools" dark />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {p.tech.map((g) => <div key={g.group}><h3 className="text-sm font-semibold uppercase tracking-wider text-blue-400">{g.group}</h3><ul className="mt-3 flex flex-wrap gap-2">{g.items.map((i) => <li key={i} className="rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-200">{i}</li>)}</ul></div>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Process" title="Our development process" />
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {p.process.map((s, i) => <li key={s.title} className="rounded-2xl border border-stone-200 p-6"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-slate-950">{i + 1}</span><h3 className="mt-4 font-display text-lg font-semibold text-stone-900">{s.title}</h3><p className="mt-2 text-sm leading-relaxed text-stone-700">{s.text}</p></li>)}
        </ol>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl rounded-2xl border border-amber-300 bg-amber-50 p-7" role="note"><h2 className="font-display text-xl font-semibold text-stone-900">{p.limits.title}</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-stone-800">{p.limits.points.map((x) => <li key={x}>{x}</li>)}</ul></div></section>

      <section id="work" className="bg-stone-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Related work" title="Demonstrations and related services" />
          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <div><h3 className="font-display text-lg font-semibold text-stone-900">Portfolio projects and demos</h3><p className="mt-1 text-sm text-stone-600">Working demonstrations on sample data. They show how we approach this kind of project; they are not client deployments.</p>
              <ul className="mt-4 space-y-3">{p.work.map((w) => <li key={w.href}><Link href={w.href} className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-blue-400"><span className="font-medium text-blue-700">{w.title}</span><span className="mt-0.5 block text-sm text-stone-600">{w.note}</span></Link></li>)}</ul>
              <p className="mt-4 text-sm"><Link href={`/portfolio/${p.division}`} className="font-medium text-blue-700 hover:underline">All {d.short} projects →</Link></p></div>
            <div><h3 className="font-display text-lg font-semibold text-stone-900">Related services</h3><p className="mt-1 text-sm text-stone-600">More detail on specific services within this area.</p>
              <ul className="mt-4 space-y-3">{services.map((s) => <li key={s.slug}><Link href={`/services/${s.slug}`} className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-blue-400"><span className="font-medium text-blue-700">{s.name}</span></Link></li>)}</ul>
              <p className="mt-4 text-sm"><Link href="/services" className="font-medium text-blue-700 hover:underline">← All NeoForge Technologies services</Link></p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead eyebrow="FAQ" title={`${p.name}: frequently asked questions`} />
        <div className="mt-8 divide-y divide-stone-200 border-y border-stone-200">
          {p.faqs.map((f) => <details key={f.q} className="group py-4"><summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-display text-lg font-medium text-stone-900"><h3 className="text-lg font-medium">{f.q}</h3><span aria-hidden className="mt-1 text-blue-600 transition group-open:rotate-45">+</span></summary><p className="mt-3 leading-relaxed text-stone-700">{f.a}</p></details>)}
        </div>
      </section>

      <section className="border-t border-stone-200 bg-stone-50 py-14"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><h2 className="font-display text-xl font-semibold text-stone-900">More from NeoForge Technologies</h2>
        <ul className="mt-4 flex flex-wrap gap-3">{others.map((o) => <li key={o.slug}><Link href={`/${o.slug}`} className="inline-block rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:border-blue-400 hover:text-blue-700">{o.name}</Link></li>)}<li><Link href="/services" className="inline-block rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-400">All services</Link></li></ul></div></section>

      <CtaBand division={p.division} title={`Planning a ${p.name.toLowerCase()} project?`} sub="Tell us what you want to build or automate and what data you have. We will reply with an honest view of what is feasible, what we would need to confirm and how we would test it." />
    </>
  );
}
