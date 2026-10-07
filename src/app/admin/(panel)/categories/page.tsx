"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, Field, PageTitle, lines, useToast } from "@/components/admin/ui";
import { DIVISIONS } from "@/lib/divisions";
import type { Category } from "@/lib/types";

const blank = { name: "", division: "computer-vision", description: "", capabilities: "", enabled: true };
type Form = typeof blank & { id?: string };

export default function Categories() {
  const [items, setItems] = useState<Category[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const toast = useToast();
  const load = useCallback(() => api<{ items: Category[] }>("/api/admin/categories").then((r) => setItems(r.items)).catch(toast.err), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const body = { name: form.name, division: form.division, description: form.description, capabilities: lines(form.capabilities), enabled: form.enabled, order: form.id ? items.find((i) => i.id === form.id)?.order ?? 0 : items.filter((i) => i.division === form.division).length };
    try {
      await api(form.id ? `/api/admin/categories/${form.id}` : "/api/admin/categories", form.id ? "PUT" : "POST", body);
      toast.ok("Category saved"); setForm(null); load();
    } catch (er) { toast.err(er); }
  }
  async function remove(c: Category) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await api(`/api/admin/categories/${c.id}`, "DELETE"); toast.ok("Deleted"); load(); } catch (er) { toast.err(er); }
  }
  async function toggle(c: Category) {
    try { await api(`/api/admin/categories/${c.id}`, "PUT", { name: c.name, division: c.division, description: c.description, capabilities: c.capabilities, enabled: !c.enabled, order: c.order }); load(); } catch (er) { toast.err(er); }
  }
  async function move(list: Category[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    try { await api("/api/admin/categories", "PATCH", { orders: next.map((c, idx) => ({ id: c.id, order: idx })) }); load(); } catch (er) { toast.err(er); }
  }

  return (
    <>
      <PageTitle title="Categories"><button className="btn-primary !py-2" onClick={() => setForm({ ...blank })}>Add category</button></PageTitle>
      {form && (
        <Card className="mb-6">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input required className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Division"><select className="field" value={form.division} disabled={!!form.id} onChange={(e) => setForm({ ...form, division: e.target.value })}>{DIVISIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Description"><textarea className="field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
            <div className="sm:col-span-2"><Field label="Capabilities" hint="One per line"><textarea className="field" rows={4} value={form.capabilities} onChange={(e) => setForm({ ...form, capabilities: e.target.value })} /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled (visible on the public site)</label>
            <div className="flex gap-2 sm:col-span-2"><button className="btn-primary !py-2">Save</button><button type="button" className="btn-ghost !py-2" onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        </Card>
      )}
      {DIVISIONS.map((d) => {
        const list = items.filter((c) => c.division === d.slug);
        return (
          <section key={d.slug} className="mb-8">
            <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-forge">{d.code} · {d.name}</h2>
            <div className="divide-y divide-paper/10 border border-paper/15 bg-ink-900">
              {list.length === 0 && <p className="p-4 text-sm text-paper/50">No categories.</p>}
              {list.map((c, i) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="flex"><button aria-label="Move up" className="px-2 hover:text-forge" onClick={() => move(list, i, -1)}>↑</button><button aria-label="Move down" className="px-2 hover:text-forge" onClick={() => move(list, i, 1)}>↓</button></div>
                  <div className="min-w-0 flex-1"><p className={c.enabled ? "" : "text-paper/40 line-through"}>{c.name}</p>{c.description && <p className="truncate text-xs text-paper/45">{c.description}</p>}</div>
                  <button className="text-xs text-paper/60 hover:text-forge" onClick={() => toggle(c)}>{c.enabled ? "Disable" : "Enable"}</button>
                  <button className="text-xs hover:text-forge" onClick={() => setForm({ id: c.id, name: c.name, division: c.division, description: c.description, capabilities: c.capabilities.join("\n"), enabled: c.enabled })}>Edit</button>
                  <button className="text-xs text-red-400 hover:underline" onClick={() => remove(c)}>Delete</button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {toast.el}
    </>
  );
}
