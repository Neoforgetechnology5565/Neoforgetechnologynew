import Link from "next/link";
import Logo from "@/components/Logo";
import { getBranding, getContactSettings } from "@/lib/db";

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

/** End-of-article call to action: logo, what we can build, and every way to reach us (managed under Site content → Contact and Branding). */
export default async function BlogContactCard() {
  const [c, b] = await Promise.all([getContactSettings(), getBranding()]);
  const wa = c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/[^\d]/g, "")}` : "";
  return (
    <aside aria-labelledby="blog-contact" className="mt-12 rounded-2xl border border-blue-200 bg-gradient-to-br from-white to-blue-50 p-6 sm:p-8">
      <Logo media={b.logoLight} trim={b.autoTrim} height={40} />
      <h2 id="blog-contact" className="mt-6 font-display text-2xl font-semibold text-stone-900 sm:text-3xl">Have something in mind? We can build it.</h2>
      <p className="mt-3 text-stone-700">Custom software, AI and computer vision, automation, CRM / HRM / ERP systems, CAD and BIM tools. Whatever you need, tell us about it and we will work out how to build it for you.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/contact" className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">Contact us →</Link>
        {c.phone && <a href={telHref(c.phone)} className="rounded-lg border border-blue-300 bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">Call {c.phone}</a>}
        {c.email && <a href={`mailto:${c.email}`} className="rounded-lg border border-blue-300 bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">{c.email}</a>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-blue-300 bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">WhatsApp</a>}
      </div>
    </aside>
  );
}
