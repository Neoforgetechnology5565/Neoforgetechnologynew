import Link from "next/link";
import { CtaBand, SectionHead } from "@/components/Blocks";
import { CV_DEMOS, CV_DISCLAIMER } from "@/lib/cv-demos";
import DemoPreview, { previewFor } from "@/components/DemoPreview";

/** Computer Vision & AI portfolio: interactive demo cards. Demos are released one at a time. */
export default function CvDemoCenter({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Computer Vision & AI · Sample works</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Computer vision you can try.</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Working demonstrations of the vision systems we build. Each one says plainly what it runs: real model inference on your own clip, reference annotations on a synthetic sample, or a planned feature. Nothing is passed off as something it is not.</p>
          <p className="mt-4 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{CV_DISCLAIMER}</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Sample works" title="Interactive demonstrations">Twenty-one demonstrations. Each opens a working application that runs real models or real calculations through its own small Python service; without that service the app says so and shows nothing. Every demo page lists what is implemented and what is only a labelled preview.</SectionHead>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CV_DEMOS.map((d) => (
            <li key={d.slug} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6">
              {d.cover ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.cover} alt="" loading="lazy" width={800} height={450} className="mb-4 aspect-[16/9] w-full rounded-lg border border-stone-200 object-cover" data-testid="cover" /> : <DemoPreview kind={previewFor("computer-vision", d.slug)} className="mb-4" />}
              <div className="flex items-center justify-between"><span className="font-display text-2xl font-semibold text-blue-600">{d.no}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${d.status === "live" ? "bg-blue-50 text-blue-700" : "bg-stone-100 text-stone-500"}`}>{d.status === "live" ? "Interactive demo ready" : "In development"}</span></div>
              <h2 className="mt-3 font-display text-xl font-semibold text-stone-900">{d.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{d.problem}</p>
              <p className="mt-2 text-sm text-stone-700"><span className="font-semibold">Workspace:</span> {d.layout}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5">{d.tags.map((t) => <li key={t} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">{t}</li>)}</ul>
              <div className="mt-6 flex flex-1 flex-wrap items-end gap-2">
                {d.status === "live"
                  ? <><Link href={`/ai-demos/${d.slug}/app`} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Launch Interactive Demo</Link>
                    <Link href={`/ai-demos/${d.slug}`} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-blue-600 hover:text-blue-700">View Features</Link></>
                  : <span className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-400" aria-disabled>Demo coming soon</span>}
                <Link href="/contact?division=computer-vision" className="rounded-full px-2 py-2 text-sm font-medium text-blue-700 hover:underline">Request Similar Software</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {children}
      <CtaBand division="computer-vision" title="Need a vision system for your site or product?" sub="Tell us what you want to detect or measure. We will reply with an honest view of what is feasible." />
    </>
  );
}
