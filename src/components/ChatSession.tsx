"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaRef } from "@/lib/types";
import { uploadToCloudinary } from "@/lib/upload";

interface Msg { id: string; from: "visitor" | "admin"; text: string; file: MediaRef | null; createdAt: number }
interface Conv { id: string; token: string }
const KEY = "nf_chat";

/**
 * The conversation itself (start form → message list → composer). Used by the floating popup and the /live-chat page.
 * Polls the server: every 4 s while `active`, every 20 s otherwise (so unread counts still update).
 */
export default function ChatSession({ greeting, active, onUnread, className = "" }: { greeting: string; active: boolean; onUnread?: (n: number) => void; className?: string }) {
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setConv(JSON.parse(s)); } catch { /* ignore */ } }, []);

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
        if (!activeRef.current) onUnread?.(messages.filter((x) => x.from === "admin").length);
      }
    } catch { /* offline: retry next tick */ }
  }, [conv, onUnread]);

  useEffect(() => {
    if (!conv) return;
    poll();
    const t = setInterval(() => !document.hidden && poll(), active ? 4000 : 20000);
    return () => clearInterval(t);
  }, [conv, active, poll]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs, active]);

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
    try { await send({ file: await uploadToCloudinary(file, { endpoint: "/api/upload-sign", kind: "image" }) }); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-blue-600 focus:outline-none";

  if (!conv)
    return (
      <form onSubmit={start} className={`flex flex-col gap-3 overflow-y-auto bg-stone-50 p-4 ${className}`}>
        <p className="text-sm text-stone-600">{greeting}</p>
        <input name="name" required maxLength={100} placeholder="Your name" aria-label="Your name" className={input} />
        <input name="email" type="email" placeholder="Email (so we can follow up)" aria-label="Email" className={input} />
        <textarea name="message" required maxLength={2000} rows={4} placeholder="How can we help?" aria-label="Message" className={`${input} flex-1`} />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <button className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50" disabled={busy}>{busy ? "Starting…" : "Start conversation"}</button>
      </form>
    );

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={list} className="flex-1 space-y-2 overflow-y-auto bg-stone-50 px-4 py-4" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.from === "visitor" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.from === "visitor" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm border border-stone-200 bg-white text-stone-800"}`}>
              {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
              {m.file && <a href={m.file.url} target="_blank" rel="noopener noreferrer" className="underline">📎 {m.file.name || "attachment"}</a>}
            </div>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="bg-white px-4 pt-2 text-xs text-red-600">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { setText(""); send({ text: t }); } }} className="flex items-center gap-2 border-t border-stone-200 bg-white p-3">
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} aria-label="Attach image or PDF" className="px-2 text-stone-500 hover:text-blue-600">📎</button>
        <input ref={fileInput} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ""; }} />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Type a message…" aria-label="Message" className={input} />
        <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" aria-label="Send">Send</button>
      </form>
    </div>
  );
}
