"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DIVISIONS, type Division } from "@/lib/divisions";
import type { Branding, Category } from "@/lib/types";
import Logo from "./Logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/live-chat", label: "Live Chat" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function Dropdown({ d, subs, path }: { d: Division; subs: Category[]; path: string }) {
  const [open, setOpen] = useState(false);
  const href = `/${d.slug}`;
  const on = path === href || path.startsWith(href + "/");
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <Link href={href} aria-haspopup="true" aria-expanded={open} onFocus={() => setOpen(true)}
        className={cn("text-sm font-medium transition-colors hover:text-blue-600", on ? "text-blue-600" : "text-stone-700")}>{d.navLabel}</Link>
      {open && (
        <div className="absolute left-1/2 top-full w-80 -translate-x-1/2 pt-3">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
            <p className="border-b border-stone-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">{d.short}</p>
            <div className="max-h-[22rem] overflow-y-auto p-2">
              {subs.map((s) => (
                <Link key={s.id} href={`${href}/${s.slug}`} className="block rounded-xl px-3 py-2.5 transition hover:bg-stone-50">
                  <span className="block text-sm font-semibold text-stone-900">{s.name}</span>
                  {s.description && <span className="mt-0.5 block text-xs leading-snug text-stone-500">{s.description}</span>}
                </Link>
              ))}
              {subs.length === 0 && <p className="px-3 py-2 text-sm text-stone-500">{d.tagline}</p>}
            </div>
            <Link href={href} className="block border-t border-stone-100 px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-stone-50">View all {d.short} →</Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar({ categories, branding }: { categories: Category[]; branding: Branding }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  if (path.startsWith("/admin")) return null;
  const subsOf = (slug: string) => categories.filter((c) => c.division === slug && c.enabled).sort((a, b) => a.order - b.order);
  const link = (href: string, label: string) => (
    <Link key={href} href={href} className={cn("text-sm font-medium transition-colors hover:text-blue-600", (href === "/" ? path === "/" : path.startsWith(href)) ? "text-blue-600" : "text-stone-700")}>{label}</Link>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center" aria-label="Neo Forge Technology home">
          <Logo media={branding.logoLight} trim={branding.autoTrim} height={44} priority />
        </Link>
        <nav className="hidden items-center gap-6 xl:gap-7 lg:flex" aria-label="Primary">
          {link("/", "Home")}
          {DIVISIONS.map((d) => <Dropdown key={d.slug} d={d} subs={subsOf(d.slug)} path={path} />)}
          {LINKS.map((l) => link(l.href, l.label))}
        </nav>
        <div className="hidden lg:block"><Link href="/contact" className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600">Start a Project</Link></div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Toggle menu" className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 lg:hidden">
          <div className="space-y-1"><span className="block h-0.5 w-5 bg-stone-900" /><span className="block h-0.5 w-5 bg-stone-900" /><span className="block h-0.5 w-5 bg-stone-900" /></div>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-stone-200 bg-white px-4 pb-6 pt-2 lg:hidden">
          <Link href="/" className="block rounded-md px-2 py-2.5 text-sm font-medium text-stone-700">Home</Link>
          {DIVISIONS.map((d) => (
            <div key={d.slug}>
              <div className="flex items-center justify-between">
                <Link href={`/${d.slug}`} className="flex-1 rounded-md px-2 py-2.5 text-sm font-medium text-stone-700">{d.navLabel}</Link>
                <button type="button" aria-label={`Toggle ${d.short}`} aria-expanded={expanded === d.slug} onClick={() => setExpanded(expanded === d.slug ? null : d.slug)} className="flex h-8 w-8 items-center justify-center text-stone-400">{expanded === d.slug ? "−" : "+"}</button>
              </div>
              {expanded === d.slug && (
                <div className="ml-3 flex flex-col gap-1 border-l border-stone-200 pl-3">
                  {subsOf(d.slug).map((s) => <Link key={s.id} href={`/${d.slug}/${s.slug}`} className="rounded-md px-2 py-2 text-sm text-stone-500">{s.name}</Link>)}
                </div>
              )}
            </div>
          ))}
          {LINKS.map((l) => <Link key={l.href} href={l.href} className="block rounded-md px-2 py-2.5 text-sm font-medium text-stone-700">{l.label}</Link>)}
          <Link href="/contact" className="mt-3 block rounded-full bg-stone-900 px-5 py-2.5 text-center text-sm font-medium text-white">Start a Project</Link>
        </nav>
      )}
    </header>
  );
}
