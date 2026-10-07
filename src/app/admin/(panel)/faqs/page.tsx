"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, Field, PageTitle, useToast } from "@/components/admin/ui";
import type { Faq } from "@/lib/types";

export default function Faqs() {
  const [items, setItems] = useState<Faq[]>([]);
  const [edit, setEdit] = useState<Partial<Faq> | null>(null);
  const toast = useToast();
  const load = useCallback(() => api<{ items: Faq[] }>("/api/admin/faqs").then((r) => setItems(r.items)).catch(toast.err), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const body = { question: edit.question ?? "", answer: edit.answer ?? "", enabled: edit.enabled !== false, order: edit.order ?? items.length };
    try { await api(edit.id ? `/api/admin/faqs/${edit.id}` : "/api/admin/faqs", edit.id ? "PUT" : "POST", body); toast.ok("Saved"); setEdit(null); load(); } catch (er) { toast.err(er); }
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= items.length) return;
    const a = items[i], b = items[j];
    try {
      await Promise.all([a, b].map((x, k) => api(`/api/admin/faqs/${x.id}`, "PUT", { question: x.question, answer: x.answer, enabled: x.enabled, order: k === 0 ? j : i })));
      load();
    } catch (er) { toast.err(er); }
  }
  async function remove(f: Faq) { if (confirm("Delete this FAQ?")) { await api(`/api/admin/faqs/${f.id}`, "DELETE").catch(toast.err); load(); } }

  return (
    <>
      <PageTitle title="FAQs"><button className="btn-primary !py-2" onClick={() => setEdit({ enabled: true })}>Add FAQ</button></PageTitle>
      {edit && (
        <Card className="mb-5"><form onSubmit={save} className="grid gap-4">
          <Field label="Question"><input required className="field" value={edit.question ?? ""} onChange={(e) => setEdit({ ...edit, question: e.target.value })} /></Field>
          <Field label="Answer"><textarea rows={4} className="field" value={edit.answer ?? ""} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.enabled !== false} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Visible</label>
          <div className="flex gap-2"><button className="btn-primary !py-2">Save</button><button type="button" className="btn-ghost !py-2" onClick={() => setEdit(null)}>Cancel</button></div>
        </form></Card>
      )}
      <div className="divide-y divide-paper/10 border border-paper/15 bg-ink-900">
        {items.length === 0 && <p className="p-5 text-sm text-paper/50">No FAQs.</p>}
        {items.map((f, i) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="flex"><button aria-label="Move up" className="px-2 hover:text-forge" onClick={() => move(i, -1)}>↑</button><button aria-label="Move down" className="px-2 hover:text-forge" onClick={() => move(i, 1)}>↓</button></div>
            <div className="min-w-0 flex-1 basis-60"><p className={f.enabled ? "" : "text-paper/40"}>{f.question}</p><p className="truncate text-xs text-paper/45">{f.answer}</p></div>
            <button className="text-xs hover:text-forge" onClick={() => setEdit(f)}>Edit</button>
            <button className="text-xs text-red-400" onClick={() => remove(f)}>Delete</button>
          </div>
        ))}
      </div>
      {toast.el}
    </>
  );
}
