import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { SectionHead } from "@/components/Blocks";
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
  return (
    <div className="container-x grid gap-14 py-16 sm:py-24 lg:grid-cols-[.8fr_1.2fr]">
      <div>
        <SectionHead eyebrow="Contact" title="Start a project.">Describe what you want to build or automate. The more specific you are about the workflow and the systems involved, the more useful our reply will be.</SectionHead>
        <dl className="mt-10 space-y-5 text-sm">
          {c.email && <div><dt className="label">Email</dt><dd><a className="hover:text-forge" href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
          {c.phone && <div><dt className="label">Phone</dt><dd>{c.phone}</dd></div>}
          {c.whatsapp && <div><dt className="label">WhatsApp</dt><dd><a className="hover:text-forge" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${c.whatsapp}`}>Message us on WhatsApp</a></dd></div>}
          {c.location && <div><dt className="label">Location</dt><dd>{c.location}</dd></div>}
          {links.length > 0 && <div><dt className="label">Elsewhere</dt><dd className="flex flex-wrap gap-x-4">{links.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer" className="hover:text-forge">{n}</a>)}</dd></div>}
        </dl>
      </div>
      <div className="border border-paper/15 bg-ink-900 p-6 sm:p-8"><ContactForm initialDivision={division && isDivisionSlug(division) ? division : ""} /></div>
    </div>
  );
}
