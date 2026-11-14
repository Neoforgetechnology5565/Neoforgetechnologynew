import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, SectionHead } from "@/components/Blocks";
import JsonLd from "@/components/JsonLd";
import { breadcrumbLd } from "@/lib/jsonld";
import { SPORT_CAPABILITIES, SPORTS } from "@/lib/sports-analytics";
import { siteUrl } from "@/lib/utils";

const TITLE = "Sports Analytics Software Development | NeoForge";
const DESC = "Sports video analytics software: player and ball tracking, court mapping, heat maps and match review tools for football, table tennis, basketball and more.";
export const metadata: Metadata = {
  title: { absolute: TITLE }, description: DESC, alternates: { canonical: "/sports-analytics" },
  openGraph: { type: "website", siteName: "NeoForge Technologies", title: TITLE, description: DESC, url: "/sports-analytics" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};
const WORKS: [string, string, string][] = [
  ["Football video intelligence", "/ai-demos/sports-video-intelligence", "Detect and track players and the ball in football match video, with the gaps shown honestly."],
  ["Table tennis video intelligence", "/ai-demos/ai-table-tennis-video-intelligence", "Track players and the ball, calibrate the table and review ball-visible segments."],
  ["Basketball video intelligence", "/ai-demos/ai-basketball-video-intelligence", "Track players and the ball, map the court from reference points, with heat maps and possession candidates."],
];
const PROCESS: [string, string][] = [
  ["1. Footage and goals", "We look at your cameras, angles and footage, and agree which questions the analysis must answer."],
  ["2. Calibration and tracking", "We calibrate the court or pitch and tune player and ball tracking on your own video."],
  ["3. Review and measure", "Results are shown with their gaps, and accuracy is measured on a sample of your footage that you check."],
  ["4. Deliver", "A working tool for your analysts, with documentation and the agreed support."],
];
export default function SportsAnalytics() {
  const abs = (p: string) => `${siteUrl()}${p}`;
  return (
    <>
      <JsonLd data={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }, { name: "Sports analytics", path: "/sports-analytics" }]), { "@context": "https://schema.org", "@type": "Service", name: "Sports analytics software development", provider: { "@id": abs("/#organization") }, url: abs("/sports-analytics"), description: DESC, serviceType: "Sports video analytics" }]} />
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400"><Link href="/" className="hover:text-blue-400">Home</Link><span>/</span><Link href="/services" className="hover:text-blue-400">Services</Link><span>/</span><span className="text-slate-200">Sports analytics</span></nav>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Computer vision</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold sm:text-5xl">Sports Analytics Software Development</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">Video analytics for coaches, clubs, academies and sports technology companies: track players and the ball, map the court or pitch, and turn match footage into heat maps, events and review tools.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact?division=computer-vision&intent=quote#inquiry" className="rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-blue-400">Request a sports analytics quotation</Link>
            <Link href="/ai-demos/sports-video-intelligence" className="rounded-full border border-slate-600 px-6 py-3 text-sm font-semibold text-white hover:border-blue-400">See a working demo</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" data-testid="sports-capabilities">
        <SectionHead eyebrow="What we build" title="Sports analytics capabilities" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SPORT_CAPABILITIES.map(([t, d]) => <div key={t} className="rounded-2xl border border-stone-200 bg-white p-6"><h3 className="font-display text-lg font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{d}</p></div>)}
        </div>
      </section>
      <section className="bg-stone-50" aria-labelledby="sports-list-h">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Sports" title="Sports we can build for"><span id="sports-list-h" className="sr-only">Sports list</span>Twenty sports, from the ones we have demonstrated to others we can adapt the same techniques to.</SectionHead>
          <ul className="mt-8 flex flex-wrap gap-2 text-sm" data-testid="sports-list">
            {SPORTS.map((x) => <li key={x.name} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-stone-800">{x.demo ? <Link href={x.demo.href} className="font-semibold text-blue-700 hover:underline" title={x.demo.label}>{x.name} · demo</Link> : x.name}</li>)}
          </ul>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-stone-600">Working demonstrations exist for football, table tennis and basketball (sample footage, labelled as such). The other sports are ones we can build for, not ready-made products: each needs its own camera set-up, court or pitch calibration and tuning on your footage, so accuracy is measured on your video, not promised in advance.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Working demonstrations" title="Sports analytics demos" />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {WORKS.map(([t, h, d]) => <Link key={h} href={h} className="rounded-2xl border border-stone-200 bg-white p-6 transition hover:border-blue-400 hover:shadow-lg"><h3 className="font-display text-lg font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{d}</p><p className="mt-3 text-sm font-semibold text-blue-700">Open demo →</p></Link>)}
        </div>
      </section>
      <section className="bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHead eyebrow="How a project runs" title="From footage to a tool your analysts use" />
          <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">{PROCESS.map(([t, d]) => <li key={t} className="rounded-2xl border border-stone-200 bg-white p-6"><h3 className="font-display text-lg font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{d}</p></li>)}</ol>
          <p className="mt-6 text-sm text-stone-600">Related: <Link href="/computer-vision-development" className="underline">computer vision development</Link>, <Link href="/cctv-analytics" className="underline">video analytics</Link>, <Link href="/pricing#computer-vision-ai" className="underline">pricing</Link> and <Link href="/how-we-work" className="underline">how we work</Link>.</p>
        </div>
      </section>
      <CtaBand division="computer-vision" title="Have footage to analyse? Let's talk." sub="Tell us the sport, the cameras and what you want to learn, and we will reply with an honest view of scope and approach." />
    </>
  );
}
