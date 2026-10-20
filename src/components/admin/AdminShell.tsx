"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Counts { unreadInquiries: number; unreadChats: number; online: number; onlinePages: { path: string; n: number }[] }

const NAV = [
  ["/admin", "Dashboard"], ["/admin/projects", "Projects"], ["/admin/blog", "Blog"], ["/admin/categories", "Categories"], ["/admin/content", "Site content"], ["/admin/branding", "Branding"],
  ["/admin/faqs", "FAQs"], ["/admin/reviews", "Reviews"], ["/admin/inbox", "Inquiries"], ["/admin/chats", "Live chat"], ["/admin/analytics", "Analytics"], ["/admin/maintenance", "Maintenance"],
];

export default function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<Counts | null>(null);
  const [toast, setToast] = useState("");
  const prev = useRef<Counts | null>(null);

  // Poll the small counts endpoint: badges on the menu, a "visitors online" number, a heads-up when something new arrives.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/admin/counts");
        if (!r.ok) return;
        const n = (await r.json()) as Counts;
        if (stop) return;
        const p = prev.current;
        if (p) {
          if (n.unreadChats > p.unreadChats) setToast(`💬 New chat message (${n.unreadChats} unread)`);
          else if (n.unreadInquiries > p.unreadInquiries) setToast(`✉️ New inquiry (${n.unreadInquiries} unread)`);
          else if (n.online > p.online) setToast(`👀 A visitor just arrived — ${n.online} online now`);
        }
        prev.current = n;
        setC(n);
      } catch { /* offline: try again next tick */ }
    };
    tick();
    const t = setInterval(tick, 12_000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 6000); return () => clearTimeout(t); }, [toast]);
  const total = (c?.unreadChats || 0) + (c?.unreadInquiries || 0);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = total ? `(${total}) ${base}` : base;
  }, [total, path]);
  const badge = (href: string) => (href === "/admin/chats" ? c?.unreadChats : href === "/admin/inbox" ? c?.unreadInquiries : 0) || 0;
  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.href = "/admin/login";
  }
  const nav = (
    <nav className="space-y-0.5 p-3" aria-label="Admin">
      {NAV.map(([href, label]) => {
        const on = href === "/admin" ? path === href : path.startsWith(href);
        const n = badge(href);
        return <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center justify-between px-3 py-2 text-sm ${on ? "bg-forge text-white" : "text-paper/75 hover:bg-paper/10"}`}>{label}{n > 0 && <span className={`min-w-5 rounded-full px-1.5 text-center font-mono text-[11px] font-semibold ${on ? "bg-white text-forge" : "bg-forge text-white"}`} aria-label={`${n} unread`}>{n}</span>}</Link>;
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
        {c && <p className="mx-3 mb-1 flex items-center gap-2 border border-paper/15 px-3 py-2 text-xs text-paper/70" title={c.onlinePages.map((p) => `${p.n} on ${p.path}`).join(" · ")}><span className={`inline-block h-2 w-2 rounded-full ${c.online ? "bg-forge" : "bg-paper/25"}`} aria-hidden />{c.online} visitor{c.online === 1 ? "" : "s"} online now</p>}
        {nav}
        <div className="space-y-2 border-t border-paper/10 p-4 text-xs text-paper/60">
          <p className="truncate">{email}</p>
          <div className="flex gap-4"><Link href="/" target="_blank" className="hover:text-forge">View site ↗</Link><button onClick={logout} className="hover:text-forge">Sign out</button></div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-4 sm:p-8">{children}</div>
      {toast && <div role="status" className="fixed bottom-5 right-5 z-50 max-w-xs border border-forge bg-white px-4 py-3 text-sm shadow-xl">{toast}</div>}
    </div>
  );
}
