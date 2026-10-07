"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DIVISIONS } from "@/lib/divisions";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mega, setMega] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { setOpen(false); setMega(null); }, [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setMega(null), setOpen(false));
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  if (path.startsWith("/admin")) return null;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-paper/10 bg-ink-950/90 backdrop-blur" onMouseLeave={() => setMega(null)}>
      <div className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Neo Forge Technology home">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden><path d="M3 25V3l22 22V3" fill="none" stroke="#ff6a1a" strokeWidth="3" strokeLinejoin="miter" /></svg>
          <span className="font-semibold tracking-tight">NEO FORGE <span className="font-mono text-[10px] tracking-[0.25em] text-paper/50">TECHNOLOGY</span></span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          <Link href="/" className={navCls(active("/"))}>Home</Link>
          {DIVISIONS.map((d) => (
            <div key={d.slug} className="relative" onMouseEnter={() => setMega(d.slug)}>
              <Link href={`/${d.slug}`} className={navCls(active(`/${d.slug}`))} aria-haspopup="true" aria-expanded={mega === d.slug} onFocus={() => setMega(d.slug)}>
                {d.navLabel} <span aria-hidden className="text-paper/40">▾</span>
              </Link>
              {mega === d.slug && (
                <div className="absolute left-1/2 top-full w-[34rem] -translate-x-1/2 pt-2">
                  <div className="border border-paper/15 bg-ink-900 p-5 shadow-2xl">
                    <p className="eyebrow mb-1">{d.code} / {d.short}</p>
                    <p className="mb-4 text-sm text-paper/60">{d.tagline}</p>
                    <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {d.groups.map((g) => (
                        <li key={g.title}>
                          <Link href={`/${d.slug}#${g.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="block py-1 text-sm text-paper/80 hover:text-forge">{g.title}</Link>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex gap-4 border-t border-paper/10 pt-3 text-sm">
                      <Link href={`/${d.slug}`} className="text-forge hover:underline">Overview →</Link>
                      <Link href={`/portfolio/${d.slug}`} className="text-paper/70 hover:text-forge">Portfolio →</Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {LINKS.slice(1).map((l) => <Link key={l.href} href={l.href} className={navCls(active(l.href))}>{l.label}</Link>)}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/contact" className="btn-primary hidden !px-4 !py-2 sm:inline-flex">Start a Project</Link>
          <button className="flex h-10 w-10 items-center justify-center border border-paper/20 lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Toggle menu">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden stroke="currentColor" strokeWidth="1.8">{open ? <path d="M3 3l12 12M15 3L3 15" /> : <path d="M2 5h14M2 9h14M2 13h14" />}</svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-paper/10 bg-ink-950 lg:hidden" aria-label="Mobile">
          <div className="container-x py-4">
            <Link href="/" className="block border-b border-paper/10 py-3">Home</Link>
            {DIVISIONS.map((d) => (
              <div key={d.slug} className="border-b border-paper/10">
                <button className="flex w-full items-center justify-between py-3 text-left" aria-expanded={expanded === d.slug} onClick={() => setExpanded(expanded === d.slug ? null : d.slug)}>
                  {d.navLabel}<span className="font-mono text-paper/50">{expanded === d.slug ? "−" : "+"}</span>
                </button>
                {expanded === d.slug && (
                  <ul className="pb-3 pl-3 text-sm text-paper/75">
                    <li><Link className="block py-2 text-forge" href={`/${d.slug}`}>Overview</Link></li>
                    {d.groups.map((g) => <li key={g.title}><Link className="block py-2" href={`/${d.slug}#${g.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{g.title}</Link></li>)}
                    <li><Link className="block py-2" href={`/portfolio/${d.slug}`}>Portfolio</Link></li>
                  </ul>
                )}
              </div>
            ))}
            {LINKS.slice(1).map((l) => <Link key={l.href} href={l.href} className="block border-b border-paper/10 py-3">{l.label}</Link>)}
            <Link href="/contact" className="btn-primary mt-5 w-full">Start a Project</Link>
          </div>
        </nav>
      )}
    </header>
  );
}

const navCls = (on: boolean) => `px-3 py-2 text-sm transition-colors hover:text-forge ${on ? "text-forge" : "text-paper/80"}`;
