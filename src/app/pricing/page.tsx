import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, SectionHead } from "@/components/Blocks";
import { PRICING, PRICING_DISCLAIMER, RANGES, type Tier } from "@/lib/pricing";

export const metadata: Metadata = {
  title: { absolute: "Software Development Pricing in USD | NeoForge Technologies" },
  description: "Indicative USD budget ranges for computer vision and AI, CAD/BIM and CRM/HRM/ERP software projects, with what each range suits and how to request a quote.",
  alternates: { canonical: "/pricing" },
};

const FACTORS: [string, string][] = [
  ["Scope", "What the software has to do, how many workflows or screens it covers, and what is out of scope."],
  ["Data and models", "For AI and computer vision: how much labelled data exists, how accurate the result needs to be, and where it will run."],
  ["Integrations", "The systems it must connect to, such as an existing ERP, CRM, camera network, Revit or AutoCAD."],
  ["Deployment and support", "Cloud, on-premise or edge hardware, and whether you want ongoing maintenance after delivery."],
];
const STEPS: [string, string][] = [
  ["Tell us the problem", "Describe the workflow, the data and the systems involved in the inquiry form."],
  ["We review and ask questions", "We check feasibility and clarify anything that changes the effort."],
  ["You receive a written quotation", "A defined scope, what is included and what is not, so you can compare it with your budget."],
];
const INCLUDED: [string, string][] = [
  ["Scope of work", "The deliverables written out, the workflows covered, and what is explicitly out of scope."],
  ["Milestones", "The work split into stages, each with a described result you can review before the next stage starts."],
  ["Timeline", "An estimated duration per milestone, with the assumptions behind it (for example when you supply data or access)."],
  ["Price in USD", "A price per milestone or for the whole scope, in US dollars. Another currency can be requested; see below."],
  ["Assumptions and dependencies", "What we need from you (data, access, decisions) and what happens to the estimate if it changes."],
  ["Support after delivery", "What help is included after hand-over and how further maintenance can be arranged."],
];
const MILESTONES: [string, string][] = [
  ["1. Discovery and scope", "We confirm the problem, the data and the success criteria, and agree the written scope."],
  ["2. Prototype or proof of concept", "A working first version on your real or representative data, so accuracy and fit can be judged early."],
  ["3. Build and integrate", "The production features and the connections to your existing systems."],
  ["4. Test and hand over", "Testing against the agreed criteria, documentation, deployment, and a walkthrough with your team."],
];
const BUDGETS: [string, string][] = [
  ["Smaller or uncertain budget", "Start with discovery or a proof of concept, then decide on the full build with real results in hand."],
  ["Defined budget", "Tell us the figure in the inquiry form; we will propose a scope that fits it and say plainly what would not fit."],
  ["Larger programmes", "Split into milestones that are quoted and reviewed one at a time."],
];

export default function Pricing() {
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Pricing</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Software development pricing in USD</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Indicative budget ranges for our three divisions. Every project is then scoped and quoted individually, in US dollars, after we understand what you need.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact?intent=quote#inquiry" className="rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-blue-400">Request a customised quotation</Link>
                      </div>
        </div>
      </section>
      <nav aria-label="Pricing divisions" className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur" data-testid="pricing-nav">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-3 sm:px-6 lg:px-8">
          {PRICING.map((d) => <a key={d.id} href={`#${d.id}`} className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-semibold text-stone-800 hover:border-blue-600 hover:text-blue-700">{d.name}</a>)}
        </div>
      </nav>
      {PRICING.map((d, i) => (
        <section key={d.id} id={d.id} className={`scroll-mt-16 ${i % 2 ? "bg-stone-50" : ""}`} aria-labelledby={`${d.id}-h`} data-testid={`pricing-${d.id}`}>
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <SectionHead eyebrow="Pricing" title={d.name}><span id={`${d.id}-h`} className="sr-only">{d.name} pricing</span></SectionHead>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {(["BASIC", "STANDARD", "PREMIUM"] as Tier[]).map((t) => {
                const x = d.tiers[t], std = t === "STANDARD";
                return (
                  <article key={t} data-testid={`tier-${d.id}-${t}`} data-standard={std} className={`flex flex-col rounded-2xl bg-white p-7 ${std ? "border-2 border-blue-600 bg-blue-50/40 shadow-md" : "border border-stone-200"}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">{t}</p>
                    <p className="mt-2 font-display text-3xl font-semibold text-stone-900" data-testid="range">{RANGES[t]} <span className="text-sm font-normal text-stone-500">USD</span></p>
                    <p className="mt-1 text-xs text-stone-500">Indicative project budget</p>
                    <h3 className="mt-5 text-sm font-semibold text-stone-900">Suitable for</h3>
                    <ul className="mt-2 space-y-1.5 text-sm text-stone-700">{x.suitable.map((s) => <li key={s} className="flex gap-2"><span aria-hidden className="text-blue-600">✓</span>{s}</li>)}</ul>
                    <h3 className="mt-5 text-sm font-semibold text-stone-900">Typical deliverables</h3>
                    <ul className="mt-2 space-y-1.5 text-sm text-stone-700">{x.deliverables.map((s) => <li key={s} className="flex gap-2"><span aria-hidden className="text-blue-600">•</span>{s}</li>)}</ul>
                    <Link href={`/contact?division=${d.slug}&intent=quote#inquiry`} className={`mt-auto inline-block rounded-full px-5 py-2.5 text-center text-sm font-semibold ${std ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-blue-600 text-blue-700 hover:bg-blue-50"}`} style={{ marginTop: "1.5rem" }}>Request a Quote</Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ))}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8"><p role="note" data-testid="pricing-disclaimer" className="rounded-xl border border-stone-300 bg-stone-50 p-5 text-sm leading-relaxed text-stone-700">{PRICING_DISCLAIMER}</p></section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="What affects the cost" title="Four things decide the price" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {FACTORS.map(([t, b]) => <div key={t} className="rounded-2xl border border-stone-200 bg-white p-7"><h3 className="font-display text-xl font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{b}</p></div>)}
        </div>
      </section>
      <section className="bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHead eyebrow="How to get a quote" title="Three steps" />
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map(([t, b], i) => <li key={t} className="rounded-2xl border border-stone-200 bg-white p-7"><span className="font-display text-3xl font-semibold text-blue-600">{i + 1}</span><h3 className="mt-2 font-display text-lg font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{b}</p></li>)}
          </ol>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="What a quotation includes" title="Written, scoped and in US dollars" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map(([t, b]) => <div key={t} className="rounded-2xl border border-stone-200 bg-white p-6"><h3 className="font-display text-lg font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{b}</p></div>)}
        </div>
        <p className="mt-6 max-w-3xl text-sm text-stone-600">The ranges above are indicative, not fixed prices: the same service (for example &ldquo;ANPR software&rdquo;) can be a small integration or a multi-site system. The price in your quotation follows its scope.</p>
      </section>
      <section className="bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Milestones and timeline" title="Work is staged, so you can review as it goes" />
          <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {MILESTONES.map(([t, b]) => <li key={t} className="rounded-2xl border border-stone-200 bg-white p-6"><h3 className="font-display text-lg font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{b}</p></li>)}
          </ol>
          <p className="mt-6 max-w-3xl text-sm text-stone-600">Durations are estimated per milestone in your quotation, based on the scope and on what you can provide and when. We do not quote a generic timeline before we have seen the project.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Different budgets" title="Tell us your range, we will scope to it" />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {BUDGETS.map(([t, b]) => <div key={t} className="rounded-2xl border border-stone-200 bg-white p-6"><h3 className="font-display text-lg font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{b}</p></div>)}
        </div>
        <p className="mt-6 max-w-3xl text-sm text-stone-600">The budget options in our inquiry form help us suggest an approach. They are not price lists.</p>
      </section>
      <section className="bg-stone-50">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Currency" title="US dollars by default" />
          <p className="mt-4 text-sm leading-relaxed text-stone-700">Quotations are prepared in USD. If you need another currency (for example GBP, EUR, CAD or AUD) tell us in the inquiry form: we will state any converted figure together with the exchange rate, its source and the date it was taken, because rates move. We do not show live converted prices on this site.</p>
          <p className="mt-3 text-sm text-stone-700">Details on communication, onboarding, delivery and support are on <Link href="/how-we-work" className="underline">How we work</Link>.</p>
        </div>
      </section>
      <CtaBand title="Ready for a quote?" sub="Tell us what you want to build or automate and we will reply by email." />
    </>
  );
}
