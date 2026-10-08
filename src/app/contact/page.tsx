import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { getContactSettings } from "@/lib/db";
import { isDivisionSlug } from "@/lib/divisions";

export const metadata: Metadata = {
  title: "Contact — Start a Project",
  description: "Tell Neo Forge Technology about your AI, computer vision, CRM/HRM/ERP automation or CAD/BIM software project.",
  alternates: { canonical: "/contact" },
};

export default async function Contact({ searchParams }: { searchParams: Promise<{ division?: string }> }) {
  const [{ division }, c] = await Promise.all([searchParams, getContactSettings()]);
  const links = [["LinkedIn", c.linkedin], ["GitHub", c.github], ["X", c.x], ["YouTube", c.youtube]].filter(([, u]) => u);
  const dt = "text-xs font-semibold uppercase tracking-wider text-stone-400";
  return (
    <>
      <section className="bg-slate-950 py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Contact</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Start a project</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Describe what you want to build or automate. The more specific you are about the workflow and the systems involved, the more useful our reply will be.</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8">
        <dl className="space-y-6 text-sm">
          {c.email && <div><dt className={dt}>Email</dt><dd className="mt-1"><a className="text-stone-900 hover:text-blue-600" href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
          {c.phone && <div><dt className={dt}>Phone</dt><dd className="mt-1 text-stone-900">{c.phone}</dd></div>}
          {c.whatsapp && <div><dt className={dt}>WhatsApp</dt><dd className="mt-1"><a className="text-stone-900 hover:text-blue-600" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${c.whatsapp}`}>Message us on WhatsApp</a></dd></div>}
          {c.location && <div><dt className={dt}>Location</dt><dd className="mt-1 text-stone-900">{c.location}</dd></div>}
          {links.length > 0 && <div><dt className={dt}>Elsewhere</dt><dd className="mt-1 flex flex-wrap gap-x-4">{links.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer" className="text-stone-900 hover:text-blue-600">{n}</a>)}</dd></div>}
          {!c.email && !c.phone && !c.whatsapp && <p className="text-stone-500">Use the form and we&apos;ll reply by email.</p>}
        </dl>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"><ContactForm initialDivision={division && isDivisionSlug(division) ? division : ""} /></div>
      </div>
    </>
  );
}
