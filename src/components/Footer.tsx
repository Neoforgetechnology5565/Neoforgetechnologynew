"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DIVISIONS } from "@/lib/divisions";
import type { Branding, Category, ContactSettings } from "@/lib/types";
import Logo from "./Logo";

/** Hidden inside /admin. Contains no link to the admin area. */
export default function Footer({ contact, categories, branding }: { contact: ContactSettings; categories: Category[]; branding: Branding }) {
  if (usePathname().startsWith("/admin")) return null;
  const socials = [["LinkedIn", contact.linkedin], ["GitHub", contact.github], ["X", contact.x], ["YouTube", contact.youtube]].filter(([, u]) => u);
  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Logo media={branding.logoDark} trim={branding.autoTrim} height={44} dark />
            <p className="mt-3 text-sm leading-relaxed">Software engineering, AI, automation and CAD/BIM engineering technology.</p>
            <ul className="mt-4 space-y-1 text-sm">
              {contact.email && <li><a className="hover:text-blue-400" href={`mailto:${contact.email}`}>{contact.email}</a></li>}
              {contact.phone && <li>{contact.phone}</li>}
              {contact.location && <li>{contact.location}</li>}
            </ul>
          </div>
          {DIVISIONS.map((d) => (
            <div key={d.slug}>
              <Link href={`/${d.slug}`} className="text-sm font-semibold uppercase tracking-wider text-slate-200 hover:text-blue-400">{d.short}</Link>
              <ul className="mt-4 space-y-2 text-sm">
                {categories.filter((c) => c.division === d.slug && c.enabled).slice(0, 8).map((c) => (
                  <li key={c.id}><Link href={`/${d.slug}/${c.slug}`} className="hover:text-blue-400">{c.name}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-8 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Neo Forge Technology. All rights reserved.</p>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1" aria-label="Footer">
            <Link href="/portfolio" className="hover:text-blue-400">Portfolio</Link>
            <Link href="/technology" className="hover:text-blue-400">Technology</Link>
            <Link href="/live-chat" className="hover:text-blue-400">Live Chat</Link>
            <Link href="/about" className="hover:text-blue-400">About</Link>
            <Link href="/contact" className="hover:text-blue-400">Contact</Link>
            {socials.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">{n}</a>)}
          </nav>
        </div>
      </div>
    </footer>
  );
}
