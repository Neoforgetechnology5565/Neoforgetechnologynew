"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  ["/admin", "Dashboard"], ["/admin/projects", "Projects"], ["/admin/categories", "Categories"], ["/admin/content", "Site content"], ["/admin/branding", "Branding"],
  ["/admin/faqs", "FAQs"], ["/admin/inbox", "Inquiries"], ["/admin/chats", "Live chat"], ["/admin/analytics", "Analytics"], ["/admin/maintenance", "Maintenance"],
];

export default function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.href = "/admin/login";
  }
  const nav = (
    <nav className="space-y-0.5 p-3" aria-label="Admin">
      {NAV.map(([href, label]) => {
        const on = href === "/admin" ? path === href : path.startsWith(href);
        return <Link key={href} href={href} onClick={() => setOpen(false)} className={`block px-3 py-2 text-sm ${on ? "bg-forge text-white" : "text-paper/75 hover:bg-paper/10"}`}>{label}</Link>;
      })}
    </nav>
  );
  return (
    <div className="min-h-dvh bg-ink-950 lg:flex">
      <header className="flex items-center justify-between border-b border-paper/10 bg-ink-900 px-4 py-3 lg:hidden">
        <span className="font-semibold">Neo Forge Admin</span>
        <button onClick={() => setOpen(!open)} className="border border-paper/25 px-3 py-1.5 text-sm" aria-expanded={open}>Menu</button>
      </header>
      <aside className={`${open ? "block" : "hidden"} border-b border-paper/10 bg-ink-900 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r`}>
        <div className="hidden p-5 lg:block"><p className="font-semibold">NEO FORGE</p><p className="font-mono text-[10px] uppercase tracking-widest text-paper/50">Admin console</p></div>
        {nav}
        <div className="space-y-2 border-t border-paper/10 p-4 text-xs text-paper/60">
          <p className="truncate">{email}</p>
          <div className="flex gap-4"><Link href="/" target="_blank" className="hover:text-forge">View site ↗</Link><button onClick={logout} className="hover:text-forge">Sign out</button></div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-4 sm:p-8">{children}</div>
    </div>
  );
}
