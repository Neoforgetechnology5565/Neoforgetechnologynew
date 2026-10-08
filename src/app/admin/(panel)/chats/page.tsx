"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/admin/api";
import { PageTitle, useToast } from "@/components/admin/ui";
import { uploadToCloudinary } from "@/lib/upload";
import { formatDateTime } from "@/lib/utils";
import type { MediaRef } from "@/lib/types";

interface Chat { id: string; name: string; email: string; updatedAt: number; lastMessage?: string; unreadAdmin?: number }
interface Msg { id: string; from: "visitor" | "admin"; text: string; file: MediaRef | null; createdAt: number }

export default function Chats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const loadList = useCallback(() => api<{ items: Chat[] }>("/api/admin/chats").then((r) => setChats(r.items)).catch(() => {}), []);
  useEffect(() => { loadList(); const t = setInterval(() => !document.hidden && loadList(), 8000); return () => clearInterval(t); }, [loadList]);

  const poll = useCallback(async () => {
    if (!sel) return;
    const r = await api<{ messages: Msg[] }>(`/api/admin/chats/${sel}?after=${last.current}`).catch(() => null);
    if (r?.messages.length) {
      last.current = r.messages[r.messages.length - 1].createdAt;
      setMsgs((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
    }
  }, [sel]);
  useEffect(() => { setMsgs([]); last.current = 0; if (!sel) return; poll(); const t = setInterval(() => !document.hidden && poll(), 4000); return () => clearInterval(t); }, [sel, poll]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs]);

  async function send(payload: { text?: string; file?: MediaRef }) {
    try { await api(`/api/admin/chats/${sel}`, "POST", { text: payload.text ?? "", file: payload.file ?? null }); poll(); loadList(); } catch (e) { toast.err(e); }
  }
  async function remove() {
    if (!sel || !confirm("Delete this conversation?")) return;
    await api(`/api/admin/chats/${sel}`, "DELETE").catch(toast.err);
    setSel(null); loadList();
  }
  const cur = chats.find((c) => c.id === sel);
  const unread = chats.reduce((n, c) => n + (c.unreadAdmin || 0), 0);

  return (
    <>
      <PageTitle title={`Live chat (${unread} unread)`} />
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className={`${sel ? "hidden lg:block" : ""} max-h-[75dvh] divide-y divide-paper/10 overflow-y-auto border border-paper/15 bg-ink-900`}>
          {chats.length === 0 && <p className="p-5 text-sm text-paper/50">No conversations yet.</p>}
          {chats.map((c) => (
            <button key={c.id} onClick={() => setSel(c.id)} className={`block w-full p-3 text-left text-sm hover:bg-paper/5 ${sel === c.id ? "bg-paper/10" : ""}`}>
              <div className="flex justify-between gap-2"><span className={c.unreadAdmin ? "font-semibold" : ""}>{c.name}</span>{!!c.unreadAdmin && <span className="bg-forge px-1.5 font-mono text-[10px] text-white">{c.unreadAdmin}</span>}</div>
              <p className="truncate text-xs text-paper/50">{c.lastMessage}</p><p className="text-[11px] text-paper/35">{formatDateTime(c.updatedAt)}</p>
            </button>
          ))}
        </div>
        {cur ? (
          <section className="flex h-[75dvh] flex-col border border-paper/15 bg-ink-900">
            <header className="flex items-center justify-between border-b border-paper/10 p-3 text-sm">
              <div><button className="mr-3 text-forge lg:hidden" onClick={() => setSel(null)}>←</button><b>{cur.name}</b> {cur.email && <a className="ml-2 text-forge" href={`mailto:${cur.email}`}>{cur.email}</a>}</div>
              <button className="text-xs text-red-400" onClick={remove}>Delete</button>
            </header>
            <div ref={box} className="flex-1 space-y-2 overflow-y-auto p-4">
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.from === "admin" ? "justify-end" : ""}`}>
                  <div className={`max-w-[80%] px-3 py-2 text-sm ${m.from === "admin" ? "bg-forge text-white" : "bg-ink-700"}`}>
                    {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                    {m.file && <a href={m.file.url} target="_blank" rel="noopener noreferrer" className="underline">📎 {m.file.name || "attachment"}</a>}
                    <p className="mt-1 text-[10px] opacity-60">{formatDateTime(m.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
            <form className="flex gap-2 border-t border-paper/10 p-3" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { setText(""); send({ text: t }); } }}>
              <button type="button" aria-label="Attach" className="px-2" onClick={() => fileIn.current?.click()}>📎</button>
              <input ref={fileIn} hidden type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { try { send({ file: await uploadToCloudinary(f, { kind: "image", folder: "chat" }) }); } catch (er) { toast.err(er); } } }} />
              <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply…" aria-label="Reply" />
              <button className="btn-primary !py-2">Send</button>
            </form>
          </section>
        ) : <div className="hidden border border-dashed border-paper/20 p-10 text-center text-sm text-paper/45 lg:block">Select a conversation</div>}
      </div>
      {toast.el}
    </>
  );
}
