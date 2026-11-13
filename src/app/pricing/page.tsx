import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, SectionHead } from "@/components/Blocks";

export const metadata: Metadata = {
  title: "Pricing",
  description: "How Neo Forge Technology prices custom software: every project is scoped and quoted individually. What affects the cost and how to get a quote.",
  alternates: { canonical: "/pricing" },
};

const FACTORS: [string, string][] = [
  ["Scope", "What the software has to do, how many workflows or screens it covers, and what is out of scope."],
  ["Data and models", "For AI and computer vision: how much labelled data exists, how accurate the result needs to be, and where it will run."],
  ["Integrations", "The systems it must connect to, such as an existing ERP, CRM, camera network, Revit or AutoCAD."],
  ["Deployment and support", "Cloud, on-premise or edge hardware, and whether you want ongoing maintenance after delivery."],
];
const STEPS: [string, string][] = [
  ["Tell us the problem", "Describe the workflow, the data and the systems involved in the inquiry form, or request a call in your own time zone."],
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
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Every project is quoted to its scope.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">We build custom software, so there is no one-size price list. Quotations are prepared in US dollars after we understand what you need, and every one is customised to the project.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact?intent=quote#inquiry" className="rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-blue-400">Request a customised quotation</Link>
            <Link href="/contact#meeting" className="rounded-full border border-slate-600 px-6 py-3 text-sm font-semibold text-white hover:border-blue-400">Request a call</Link>
                      </div>
        </div>
      </section>
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
        <p className="mt-6 max-w-3xl text-sm text-stone-600">We do not publish fixed prices because the same service (for example &ldquo;ANPR software&rdquo;) can be a small integration or a multi-site system. The price follows the scope in your quotation.</p>
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
        <p className="mt-6 max-w-3xl text-sm text-stone-600">The budget ranges in our inquiry form help us suggest an approach. They are not price lists.</p>
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
