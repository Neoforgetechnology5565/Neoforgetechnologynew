"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ChatSession from "./ChatSession";

/** Floating contact button → menu (chat / WhatsApp / email) → popup chat. */
export default function ContactWidget({ enabled, greeting, whatsapp, email }: { enabled: boolean; greeting: string; whatsapp: string; email: string }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [chat, setChat] = useState(false);
  const [unseen, setUnseen] = useState(0);
  if (path.startsWith("/admin") || path === "/live-chat") return null;
  const wa = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hello Neo Forge Technology, I'd like to discuss a project.")}` : "";
  if (!enabled && !wa && !email) return null;

  const row = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-stone-700 hover:bg-stone-50";
  return (
    <div className="fixed bottom-5 right-4 z-50 flex flex-col items-end gap-3 sm:right-6">
      {/* ChatSession stays mounted (hidden) once opened so polling and unread counts keep working */}
      {enabled && (
        <section aria-label="Live chat" className={`${chat ? "flex" : "hidden"} h-[min(34rem,calc(100dvh-7rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl`}>
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div><p className="text-sm font-semibold text-stone-900">Chat with Neo Forge</p><p className="text-[11px] text-blue-600">We reply here and by email</p></div>
            <button onClick={() => setChat(false)} aria-label="Close chat" className="p-1 text-stone-500 hover:text-stone-900">✕</button>
          </header>
          <ChatSession greeting={greeting} active={chat} onUnread={(n) => setUnseen((u) => u + n)} className="flex-1" />
        </section>
      )}
      {menu && !chat && (
        <div className="w-64 overflow-hidden rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl">
          <p className="px-3 py-2 text-sm font-semibold text-stone-900">Contact Neo Forge</p>
          {enabled && <button type="button" className={row} onClick={() => { setChat(true); setMenu(false); setUnseen(0); }}><span aria-hidden>💬</span> Chat with us</button>}
          {wa && <a className={row} href={wa} target="_blank" rel="noopener noreferrer"><span aria-hidden>🟢</span> WhatsApp</a>}
          {email && <a className={row} href={`mailto:${email}`}><span aria-hidden>✉️</span> Email</a>}
        </div>
      )}
      <button type="button" aria-label="Contact us" aria-expanded={menu || chat}
        onClick={() => { if (chat) setChat(false); else setMenu((v) => !v); setUnseen(0); }}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-xl text-white shadow-xl transition hover:bg-blue-600">
        {menu || chat ? "✕" : "💬"}
        {!menu && !chat && unseen > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{unseen > 9 ? "9+" : unseen}</span>}
      </button>
    </div>
  );
}
