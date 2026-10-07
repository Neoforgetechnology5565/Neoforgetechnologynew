import Link from "next/link";
import { DIVISIONS } from "@/lib/divisions";
import type { ContactSettings } from "@/lib/types";

export default function Footer({ contact }: { contact: ContactSettings }) {
  const socials = [["LinkedIn", contact.linkedin], ["GitHub", contact.github], ["X", contact.x], ["YouTube", contact.youtube]].filter(([, u]) => u);
  return (
    <footer className="border-t border-paper/10 bg-ink-950">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div>
          <p className="font-semibold tracking-tight">NEO FORGE <span className="font-mono text-[10px] tracking-[0.25em] text-paper/50">TECHNOLOGY</span></p>
          <p className="mt-3 max-w-xs text-sm text-paper/60">Software engineering, AI, automation and CAD/BIM engineering technology.</p>
          <ul className="mt-4 space-y-1 text-sm text-paper/70">
            {contact.email && <li><a className="hover:text-forge" href={`mailto:${contact.email}`}>{contact.email}</a></li>}
            {contact.phone && <li>{contact.phone}</li>}
            {contact.location && <li>{contact.location}</li>}
          </ul>
        </div>
        {DIVISIONS.map((d) => (
          <div key={d.slug}>
            <p className="eyebrow">{d.code}</p>
            <Link href={`/${d.slug}`} className="mt-1 block text-sm font-medium hover:text-forge">{d.name}</Link>
            <ul className="mt-3 space-y-1.5 text-sm text-paper/60">
              {d.groups.slice(0, 5).map((g) => <li key={g.title}>{g.title}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="container-x flex flex-col gap-3 border-t border-paper/10 py-5 text-xs text-paper/50 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Neo Forge Technology. All rights reserved.</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Footer">
          <Link href="/portfolio" className="hover:text-forge">Portfolio</Link>
          <Link href="/technology" className="hover:text-forge">Technology</Link>
          <Link href="/about" className="hover:text-forge">About</Link>
          <Link href="/contact" className="hover:text-forge">Contact</Link>
          {socials.map(([n, u]) => <a key={n} href={u} rel="noopener noreferrer" target="_blank" className="hover:text-forge">{n}</a>)}
        </nav>
      </div>
    </footer>
  );
}
