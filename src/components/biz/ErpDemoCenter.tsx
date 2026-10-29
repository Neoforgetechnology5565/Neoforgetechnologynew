import Link from "next/link";
import { CtaBand, SectionHead } from "@/components/Blocks";
import { ERP_COVERED as ERP_DEMOS, ERP_DISCLAIMER } from "@/lib/erp-demos";
import DemoPreview, { previewFor } from "@/components/DemoPreview";

/** CRM / HRM / ERP portfolio: ten interactive frontend demonstrations. */
export default function ErpDemoCenter({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">CRM / HRM / ERP · Sample works</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Business software you can click through.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Ten working demonstrations of the platforms we build: sales, finance, people, payroll, stock, purchasing, support, marketing, projects and executive analytics. Create records, move deals, record payments, run payroll and watch the totals and charts update.</p>
          <p className="mt-4 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{ERP_DISCLAIMER}</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Sample works" title="Interactive demonstrations">Each demo has its own layout and workflows. The demos share one local sample dataset, so a goods receipt in Procurement changes stock in Inventory, and the Executive dashboard reads them all.</SectionHead>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {ERP_DEMOS.map((d) => (
            <li key={d.slug} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6">
              {d.cover ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.cover} alt={`${d.title} (screenshot)`} loading="lazy" width={800} height={450} className="mb-4 aspect-[16/9] w-full rounded-lg border border-stone-200 object-cover" data-testid="cover" /> : <DemoPreview kind={previewFor("crm-hrm-erp", d.slug)} className="mb-4" />}
              <div className="flex items-center justify-between"><span className="font-display text-2xl font-semibold text-blue-600">{d.no}</span><span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">Interactive demo ready</span></div>
              <h2 className="mt-3 font-display text-xl font-semibold text-stone-900">{d.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{d.problem}</p>
              <p className="mt-2 text-sm text-stone-700"><span className="font-semibold">Workspace:</span> {d.layout}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5">{d.tags.map((t) => <li key={t} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">{t}</li>)}</ul>
              <div className="mt-6 flex flex-1 flex-wrap items-end gap-2">
                <Link href={`/erp-demos/${d.slug}/app`} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Launch Interactive Demo</Link>
                <Link href={`/erp-demos/${d.slug}`} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-blue-600 hover:text-blue-700">View Features</Link>
                <Link href="/contact?division=crm-hrm-erp" className="rounded-full px-2 py-2 text-sm font-medium text-blue-700 hover:underline">Request Similar Software</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {children}
      <CtaBand division="crm-hrm-erp" title="Need a business platform like this?" sub="Tell us how your team works today. We will reply with an honest view of what to build first." />
    </>
  );
}
