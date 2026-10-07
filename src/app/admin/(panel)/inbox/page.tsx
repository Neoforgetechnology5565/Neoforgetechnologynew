"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { PageTitle, useToast } from "@/components/admin/ui";
import { formatBytes, formatDateTime } from "@/lib/utils";
import type { Inquiry } from "@/lib/types";

export default function Inbox() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const toast = useToast();
  const load = useCallback(() => api<{ items: Inquiry[] }>("/api/admin/inquiries").then((r) => setItems(r.items)).catch(toast.err), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const cur = items.find((i) => i.id === sel);

  async function setStatus(i: Inquiry, status: "read" | "unread") {
    setItems((l) => l.map((x) => (x.id === i.id ? { ...x, status } : x)));
    await api(`/api/admin/inquiries/${i.id}`, "PATCH", { status }).catch(toast.err);
  }
  function open(i: Inquiry) { setSel(i.id); if (i.status === "unread") setStatus(i, "read"); }
  async function remove(i: Inquiry) {
    if (!confirm("Delete this inquiry permanently?")) return;
    await api(`/api/admin/inquiries/${i.id}`, "DELETE").catch(toast.err);
    setSel(null); load();
  }

  return (
    <>
      <PageTitle title={`Inquiries (${items.filter((i) => i.status === "unread").length} unread)`} />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className={`${cur ? "hidden lg:block" : ""} max-h-[75dvh] divide-y divide-paper/10 overflow-y-auto border border-paper/15 bg-ink-900`}>
          {items.length === 0 && <p className="p-5 text-sm text-paper/50">No inquiries yet.</p>}
          {items.map((i) => (
            <button key={i.id} onClick={() => open(i)} className={`block w-full p-3 text-left text-sm hover:bg-paper/5 ${sel === i.id ? "bg-paper/10" : ""}`}>
              <div className="flex items-center justify-between gap-2"><span className={i.status === "unread" ? "font-semibold" : "text-paper/70"}>{i.status === "unread" && <span className="mr-2 inline-block h-2 w-2 bg-forge" />}{i.name}</span><span className="text-[11px] text-paper/45">{formatDateTime(i.createdAt)}</span></div>
              <p className="truncate text-xs text-paper/50">{i.projectType}{i.company ? ` · ${i.company}` : ""}</p>
            </button>
          ))}
        </div>
        {cur ? (
          <article className="border border-paper/15 bg-ink-900 p-5">
            <button className="mb-3 text-sm text-forge lg:hidden" onClick={() => setSel(null)}>← Back</button>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-xl font-semibold">{cur.name}</h2><a className="text-sm text-forge" href={`mailto:${cur.email}`}>{cur.email}</a></div>
              <div className="flex gap-3 text-sm"><button className="hover:text-forge" onClick={() => setStatus(cur, cur.status === "read" ? "unread" : "read")}>Mark {cur.status === "read" ? "unread" : "read"}</button><button className="text-red-400" onClick={() => remove(cur)}>Delete</button></div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              {([["Company", cur.company], ["Project type", cur.projectType], ["Division", cur.division], ["Budget", cur.budget], ["Timeline", cur.timeline], ["Received", formatDateTime(cur.createdAt)], ["Status", cur.status]] as const).map(([k, v]) => v ? <div key={k}><dt className="label">{k}</dt><dd>{v}</dd></div> : null)}
            </dl>
            <p className="label mt-6">Message</p>
            <p className="whitespace-pre-wrap text-sm text-paper/85">{cur.message}</p>
            {cur.files?.length > 0 && (<><p className="label mt-6">Attachments</p><ul className="space-y-1 text-sm">{cur.files.map((f) => <li key={f.publicId}><a className="text-forge hover:underline" href={f.url} target="_blank" rel="noopener noreferrer">{f.name || f.publicId} ({formatBytes(f.bytes)})</a></li>)}</ul></>)}
          </article>
        ) : <div className="hidden border border-dashed border-paper/20 p-10 text-center text-sm text-paper/45 lg:block">Select an inquiry</div>}
      </div>
      {toast.el}
    </>
  );
}
