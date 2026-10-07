"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaRef } from "@/lib/types";
import { uploadToCloudinary } from "@/lib/upload";

interface Msg { id: string; from: "visitor" | "admin"; text: string; file: MediaRef | null; createdAt: number }
interface Conv { id: string; token: string }
const KEY = "nf_chat";

export default function ChatWidget({ enabled, greeting, whatsapp }: { enabled: boolean; greeting: string; whatsapp: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setConv(JSON.parse(s)); } catch { /* ignore */ }
  }, []);

  const poll = useCallback(async () => {
    if (!conv) return;
    try {
      const r = await fetch(`/api/chat/${conv.id}?after=${last.current}`, { headers: { "x-chat-token": conv.token } });
      if (r.status === 403) { localStorage.removeItem(KEY); setConv(null); setMsgs([]); last.current = 0; return; }
      if (!r.ok) return;
      const { messages } = (await r.json()) as { messages: Msg[] };
      if (messages.length) {
        last.current = messages[messages.length - 1].createdAt;
        setMsgs((m) => [...m, ...messages.filter((x) => !m.some((y) => y.id === x.id))]);
        if (!openRef.current) setUnseen((u) => u + messages.filter((x) => x.from === "admin").length);
      }
    } catch { /* offline: retry on next tick */ }
  }, [conv]);

  useEffect(() => {
    if (!conv) return;
    poll();
    const t = setInterval(() => !document.hidden && poll(), open ? 4000 : 20000);
    return () => clearInterval(t);
  }, [conv, open, poll]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs, open]);
  useEffect(() => { if (open) setUnseen(0); }, [open]);

  if (path.startsWith("/admin")) return null;
  const wa = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hello Neo Forge Technology, I'd like to discuss a project.")}` : "";
  if (!enabled && !wa) return null;

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Could not start the chat."); return; }
    const c = (await r.json()) as Conv;
    localStorage.setItem(KEY, JSON.stringify(c));
    last.current = 0; setMsgs([]); setConv(c);
  }

  async function send(payload: { text?: string; file?: MediaRef }) {
    if (!conv) return;
    setError("");
    const r = await fetch(`/api/chat/${conv.id}`, { method: "POST", headers: { "Content-Type": "application/json", "x-chat-token": conv.token }, body: JSON.stringify({ text: payload.text ?? "", file: payload.file ?? null }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Message failed to send."); return; }
    poll();
  }

  async function attach(file: File) {
    setBusy(true);
    try {
      const m = await uploadToCloudinary(file, { endpoint: "/api/upload-sign", kind: "image" });
      await send({ file: m });
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <section aria-label="Live chat" className="flex h-[min(34rem,calc(100dvh-6rem))] w-[min(22rem,calc(100vw-2rem))] flex-col border border-paper/20 bg-ink-900 shadow-2xl">
          <header className="flex items-center justify-between border-b border-paper/10 px-4 py-3">
            <div><p className="text-sm font-medium">Chat with Neo Forge</p><p className="font-mono text-[10px] uppercase tracking-wider text-signal">● Engineers online during business hours</p></div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="p-1 text-paper/60 hover:text-paper">✕</button>
          </header>
          {!conv ? (
            <form onSubmit={start} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <p className="text-sm text-paper/70">{greeting}</p>
              <input name="name" required maxLength={100} placeholder="Your name" aria-label="Your name" className="field" />
              <input name="email" type="email" placeholder="Email (so we can follow up)" aria-label="Email" className="field" />
              <textarea name="message" required maxLength={2000} rows={4} placeholder="How can we help?" aria-label="Message" className="field flex-1" />
              {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
              <button className="btn-primary" disabled={busy}>{busy ? "Starting…" : "Start conversation"}</button>
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-center text-xs text-paper/60 hover:text-forge">or continue on WhatsApp →</a>}
            </form>
          ) : (
            <>
              <div ref={list} className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.from === "visitor" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-3 py-2 text-sm ${m.from === "visitor" ? "bg-forge text-ink-950" : "bg-ink-700 text-paper"}`}>
                      {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                      {m.file && <a href={m.file.url} target="_blank" rel="noopener noreferrer" className="underline">📎 {m.file.name || "attachment"}</a>}
                    </div>
                  </div>
                ))}
              </div>
              {error && <p role="alert" className="px-4 pb-1 text-xs text-red-400">{error}</p>}
              <form onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { setText(""); send({ text: t }); } }} className="flex items-center gap-2 border-t border-paper/10 p-3">
                <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} aria-label="Attach image or PDF" className="px-2 text-paper/60 hover:text-forge">📎</button>
                <input ref={fileInput} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ""; }} />
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Type a message…" aria-label="Message" className="field !py-2" />
                <button className="btn-primary !px-3 !py-2" aria-label="Send">➤</button>
              </form>
            </>
          )}
        </section>
      )}
      <div className="flex items-center gap-2">
        {wa && !open && (
          <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="flex h-12 w-12 items-center justify-center bg-[#25d366] text-ink-950 shadow-lg" title="WhatsApp">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.300 1.700 2.100 1.200 1 2.200 1.400 2.500 1.500.3.1.5.1.7-.1l.9-1c.2-.3.4-.2.6-.1l1.900.9c.3.1.5.2.5.3.1.2.1.700-.1 1.300Z" /></svg>
          </a>
        )}
        {enabled && (
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="relative flex h-12 items-center gap-2 bg-forge px-4 text-sm font-medium text-ink-950 shadow-lg hover:bg-forge-soft">
            <span aria-hidden>💬</span> {open ? "Close" : "Chat"}
            {unseen > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center bg-ink-950 px-1 font-mono text-[10px] text-forge ring-1 ring-forge">{unseen}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
