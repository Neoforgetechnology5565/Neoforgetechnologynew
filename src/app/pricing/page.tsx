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
  ["Tell us the problem", "Describe the workflow, the data and the systems involved in the contact form or a consultation."],
  ["We review and ask questions", "We check feasibility and clarify anything that changes the effort."],
  ["You receive a written quote", "A defined scope, what is included and what is not, so you can compare it with your budget."],
];

export default function Pricing() {
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Pricing</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Every project is quoted to its scope.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">We build custom software, so there is no one-size price list. You get a written quote after we understand what you need.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact" className="rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-blue-400">Request a quote</Link>
            <Link href="/book" className="rounded-full border border-slate-600 px-6 py-3 text-sm font-medium hover:border-blue-400">Book a consultation</Link>
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
      <CtaBand title="Ready for a quote?" sub="Tell us what you want to build or automate and we will reply by email." />
    </>
  );
}
