"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DIVISIONS } from "@/lib/divisions";
import { SERVICE_FOR_CATEGORY } from "@/lib/services";
import type { Branding, Category } from "@/lib/types";
import Logo from "./Logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
];

/** Hover menu. Services lists every sub-category by area; Portfolio lists the three areas. */
function Menu({ label, href, on, wide, children }: { label: string; href: string; on: boolean; wide?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <Link href={href} aria-haspopup="true" aria-expanded={open} onFocus={() => setOpen(true)} onClick={() => setOpen(false)}
        className={cn("text-sm font-medium transition-colors hover:text-blue-600", on ? "text-blue-600" : "text-stone-700")}>{label} <span aria-hidden className="text-[10px] text-stone-400">▾</span></Link>
      {open && (
        <div className={cn("absolute left-1/2 top-full -translate-x-1/2 pt-3", wide ? "w-[52rem] max-w-[calc(100vw-2rem)]" : "w-72")} onClick={() => setOpen(false)}>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">{children}</div>
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
  if (path.startsWith("/admin") || /^\/demos\/[^/]+\/app/.test(path)) return null;
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
          <Menu label="Services" href="/services" on={path.startsWith("/services")} wide>
            <div className="grid max-h-[28rem] gap-6 overflow-y-auto p-5 md:grid-cols-3">
              {DIVISIONS.map((d) => (
                <div key={d.slug}>
                  <Link href={`/services#${d.slug}`} className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-600 hover:underline">{d.short}</Link>
                  <ul className="mt-2 space-y-0.5">
                    {subsOf(d.slug).map((s) => <li key={s.id}><Link href={SERVICE_FOR_CATEGORY[s.slug] ? `/services/${SERVICE_FOR_CATEGORY[s.slug]}` : `/services#${s.slug}`} className="block rounded-lg px-2 py-1.5 text-sm text-stone-700 hover:bg-stone-50 hover:text-blue-700">{s.name}</Link></li>)}
                  </ul>
                </div>
              ))}
            </div>
            <Link href="/services" className="block border-t border-stone-100 px-5 py-3 text-sm font-medium text-blue-600 hover:bg-stone-50">All services explained →</Link>
          </Menu>
          <Menu label="Portfolio" href="/portfolio" on={path.startsWith("/portfolio")}>
            <div className="p-2">
              {DIVISIONS.map((d) => <Link key={d.slug} href={`/portfolio/${d.slug}`} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-stone-900 hover:bg-stone-50 hover:text-blue-700">{d.short}</Link>)}
            </div>
          </Menu>
          {LINKS.map((l) => link(l.href, l.label))}
          <Menu label="Contact" href="/contact" on={path.startsWith("/contact") || path.startsWith("/live-chat")}>
            <div className="p-2">
              <Link href="/live-chat" className="block rounded-xl px-3 py-2.5 hover:bg-stone-50"><span className="block text-sm font-semibold text-stone-900">Live chat</span><span className="mt-0.5 block text-xs leading-snug text-stone-500">Talk to us now and get replies right away.</span></Link>
              <Link href="/contact" className="block rounded-xl px-3 py-2.5 hover:bg-stone-50"><span className="block text-sm font-semibold text-stone-900">Send an enquiry</span><span className="mt-0.5 block text-xs leading-snug text-stone-500">Describe your project and we reply by email.</span></Link>
            </div>
          </Menu>
        </nav>
        <div className="hidden items-center gap-2 lg:flex"><Link href="/contact" className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600">Start a Project</Link></div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Toggle menu" className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 lg:hidden">
          <div className="space-y-1"><span className="block h-0.5 w-5 bg-stone-900" /><span className="block h-0.5 w-5 bg-stone-900" /><span className="block h-0.5 w-5 bg-stone-900" /></div>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-stone-200 bg-white px-4 pb-6 pt-2 lg:hidden">
          <Link href="/" className="block rounded-md px-2 py-2.5 text-sm font-medium text-stone-700">Home</Link>
          {[["services", "Services", "/services#"], ["portfolio", "Portfolio", "/portfolio/"]].map(([key, label, base]) => (
            <div key={key}>
              <div className="flex items-center justify-between">
                <Link href={`/${key}`} className="flex-1 rounded-md px-2 py-2.5 text-sm font-medium text-stone-700">{label}</Link>
                <button type="button" aria-label={`Toggle ${label}`} aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? null : key)} className="flex h-8 w-8 items-center justify-center text-stone-400">{expanded === key ? "−" : "+"}</button>
              </div>
              {expanded === key && (
                <div className="ml-3 flex flex-col gap-1 border-l border-stone-200 pl-3">
                  {key === "portfolio"
                    ? DIVISIONS.map((d) => <Link key={d.slug} href={`/portfolio/${d.slug}`} className="rounded-md px-2 py-2 text-sm text-stone-500">{d.short}</Link>)
                    : DIVISIONS.flatMap((d) => [<Link key={d.slug} href={`/services#${d.slug}`} className="rounded-md px-2 pt-2 text-xs font-semibold uppercase tracking-wider text-blue-600">{d.short}</Link>, ...subsOf(d.slug).map((s) => <Link key={s.id} href={SERVICE_FOR_CATEGORY[s.slug] ? `/services/${SERVICE_FOR_CATEGORY[s.slug]}` : `${base}${s.slug}`} className="rounded-md px-2 py-1.5 text-sm text-stone-500">{s.name}</Link>)])}
                </div>
              )}
            </div>
          ))}
          {LINKS.map((l) => <Link key={l.href} href={l.href} className="block rounded-md px-2 py-2.5 text-sm font-medium text-stone-700">{l.label}</Link>)}
          <Link href="/contact" className="block rounded-md px-2 py-2.5 text-sm font-medium text-stone-700">Contact: send an enquiry</Link>
          <Link href="/live-chat" className="block rounded-md px-2 py-2.5 text-sm font-medium text-stone-700">Contact: live chat</Link>
                    <Link href="/contact" className="mt-2 block rounded-full bg-stone-900 px-5 py-2.5 text-center text-sm font-medium text-white">Start a Project</Link>
        </nav>
      )}
    </header>
  );
}
