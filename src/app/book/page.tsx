import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { getContactSettings } from "@/lib/db";
import { isDivisionSlug } from "@/lib/divisions";

export const metadata: Metadata = {
  title: "Book a Consultation",
  description: "Book a consultation with Neo Forge Technology to talk through your AI, computer vision, automation or CAD/BIM software idea.",
  alternates: { canonical: "/book" },
};

export default async function Book({ searchParams }: { searchParams: Promise<{ division?: string }> }) {
  const [{ division }, c] = await Promise.all([searchParams, getContactSettings()]);
  return (
    <>
      <section className="bg-slate-950 py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Consultation</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Book a consultation</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Talk your idea through with us before you commit to anything. Tell us the topic and when suits you, and we will reply by email to confirm a time.</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8">
        <div className="space-y-4 text-sm text-stone-600">
          <p className="font-semibold text-stone-900">What to include</p>
          <ul className="list-disc space-y-1 pl-5"><li>What you want to build or automate</li><li>The systems or data involved</li><li>Days and times that suit you, and your time zone</li></ul>
          {(c.email || c.phone) && <p className="pt-2">Prefer to reach us directly? {c.email && <a className="text-blue-700 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>} {c.phone && <span>· {c.phone}</span>}</p>}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <ContactForm initialDivision={division && isDivisionSlug(division) ? division : ""} defaultMessage={"I'd like to book a consultation.\nTopic: \nPreferred days/times and time zone: "} />
        </div>
      </div>
    </>
  );
}
