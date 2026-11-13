import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand, SectionHead } from "@/components/Blocks";
import { getMeetingSettings } from "@/lib/db";
import JsonLd from "@/components/JsonLd";
import { breadcrumbLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: { absolute: "How We Work With International Clients | NeoForge" },
  description: "How NeoForge Technologies works with clients remotely: communication, time zones, onboarding, milestones, delivery and support after hand-over.",
  alternates: { canonical: "/how-we-work" },
};

const BLOCKS: { id: string; eyebrow: string; title: string; items: [string, string][] }[] = [
  { id: "communication", eyebrow: "Communication", title: "Email first, calls when they help", items: [
    ["Written by default", "Scope, decisions and changes are confirmed in writing so everyone has the same record."],
    ["Calls on request", "You can request a video or phone call in your own time zone from the contact page. A request is confirmed by a person; it is not booked automatically."],
    ["Your channel", "The inquiry form asks how you prefer to be contacted: email, video call, phone or WhatsApp."],
  ] },
  { id: "onboarding", eyebrow: "Onboarding", title: "From first message to agreed scope", items: [
    ["1. Inquiry", "You describe the project, your country, budget range and timeline. Nothing is public and no account is needed."],
    ["2. Review", "We read it, check feasibility and may ask clarifying questions."],
    ["3. Quotation", "A written scope, milestones, timeline and price in USD. See the pricing page for what it contains."],
    ["4. Kick-off", "Once you accept, we agree how data and access are shared, and who reviews each milestone on your side."],
  ] },
  { id: "delivery", eyebrow: "Delivery", title: "Staged, reviewable, remote", items: [
    ["Milestones", "Work is delivered in stages, each with a described result you can review before the next begins."],
    ["Remote delivery", "We work with clients remotely; software is delivered as deployable code and documentation, or deployed to your environment."],
    ["Sensitive data", "Tell us in the inquiry if the project involves confidential material. Handling of data and confidentiality terms, including an NDA if you require one, are agreed in writing before you share it."],
  ] },
  { id: "support", eyebrow: "Support", title: "After hand-over", items: [
    ["Included support", "What help is included after delivery is written into the quotation."],
    ["Maintenance", "Ongoing maintenance, monitoring or further development can be arranged separately if you want it."],
  ] },
];

export default async function HowWeWork() {
  const m = await getMeetingSettings();
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "How we work", path: "/how-we-work" }])} />
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Working with us</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">How we work with international clients</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Clear communication, a written scope, staged delivery and honest support. We work remotely and schedule calls in your time zone.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact?intent=quote#inquiry" className="rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-blue-400">Send an inquiry</Link>
            <Link href="/contact#meeting" className="rounded-full border border-slate-600 px-6 py-3 text-sm font-semibold text-white hover:border-blue-400">Request a call</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Time zones" title="Meetings in your time zone" />
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-stone-700">Our availability for calls is {String(m.startHour).padStart(2, "0")}:00–{String(m.endHour).padStart(2, "0")}:00 {m.tz}, on the days shown when you request a call. The scheduler detects your zone, lets you change it, and shows every time in both your zone and ours, so there is nothing to convert. Calls last {m.durationMin} minutes.</p>
      </section>
      {BLOCKS.map((b, i) => (
        <section key={b.id} id={b.id} className={i % 2 === 0 ? "bg-stone-50" : ""}>
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <SectionHead eyebrow={b.eyebrow} title={b.title} />
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {b.items.map(([t, d]) => <div key={t} className="rounded-2xl border border-stone-200 bg-white p-6"><h3 className="font-display text-lg font-semibold text-stone-900">{t}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{d}</p></div>)}
            </div>
          </div>
        </section>
      ))}
      <CtaBand title="Start with an inquiry or a call" sub="Tell us about the project, or request a time that suits your time zone." />
    </>
  );
}
