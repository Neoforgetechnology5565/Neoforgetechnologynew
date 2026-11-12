"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, Field, PageTitle, useToast } from "@/components/admin/ui";
import type { Review } from "@/lib/types";

const body = (r: Partial<Review>, order: number) => ({
  name: r.name ?? "", role: r.role ?? "", quote: r.quote ?? "", rating: r.rating ?? 0, source: r.source ?? "", sourceUrl: r.sourceUrl ?? "",
  enabled: r.enabled !== false, order: r.order ?? order,
  kind: r.kind ?? "verified", permission: r.permission === true, evidence: r.evidence ?? "",
});

export default function Reviews() {
  const [items, setItems] = useState<Review[]>([]);
  const [edit, setEdit] = useState<Partial<Review> | null>(null);
  const [seeded, setSeeded] = useState(true);
  const toast = useToast();
  const load = useCallback(() => api<{ items: Review[]; samplesSeeded: boolean }>("/api/admin/reviews").then((r) => { setItems(r.items); setSeeded(r.samplesSeeded); }).catch(toast.err), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    try { await api(edit.id ? `/api/admin/reviews/${edit.id}` : "/api/admin/reviews", edit.id ? "PUT" : "POST", body(edit, items.length)); toast.ok("Saved"); setEdit(null); load(); } catch (er) { toast.err(er); }
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= items.length) return;
    try { await Promise.all([items[i], items[j]].map((x, k) => api(`/api/admin/reviews/${x.id}`, "PUT", body({ ...x, order: k === 0 ? j : i }, 0)))); load(); } catch (er) { toast.err(er); }
  }
  async function remove(r: Review) { if (confirm("Delete this review?")) { await api(`/api/admin/reviews/${r.id}`, "DELETE").catch(toast.err); load(); } }
  async function seed() { try { await api("/api/admin/reviews/seed-samples", "POST"); toast.ok("Imported"); load(); } catch (er) { toast.err(er); } }
  const rated = items.filter((r) => r.enabled && r.kind === "verified" && r.rating > 0).length;

  return (
    <>
      <PageTitle title="Reviews"><button className="btn-primary !py-2" onClick={() => setEdit({ enabled: true, rating: 5, kind: "verified" })}>Add review</button></PageTitle>
      <Card className="mb-5 text-sm text-paper/75">
        <p><b>Verified</b> entries must be real reviews from real clients, with their permission, and keep proof (an email, or a link to the review on another site). Illustrative entries must stay marked <b>Sample</b>: they are shown under their own disclosure and never count toward star markup. Invented or edited reviews presented as real break Google&apos;s rules and the law in many countries.</p>
        <p className="mt-2">Reviews appear as a quote section on the home page and on every service page. Once you have <b>3 or more visible reviews with a star rating</b>, star-rating markup is added to your service pages automatically ({rated} so far). Google decides whether to show stars; reviews about your own business often don&apos;t get them, but they still help visitors trust you.</p>
      </Card>
      {!seeded && (
        <Card className="mb-5 text-sm text-paper/75"><p>The home page is showing <b>20 built-in illustrative testimonials</b> under an &quot;Illustrative Testimonials&quot; disclosure. Import them to edit, hide or delete each one here.</p><button className="btn-primary mt-3 !py-2" onClick={seed}>Import the 20 sample testimonials</button></Card>
      )}
      {edit && (
        <Card className="mb-5"><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Content type"><select className="field" value={edit.kind ?? "verified"} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Review["kind"] })}><option value="verified">Verified: a genuine client review</option><option value="sample">Sample: illustrative testimonial</option></select></Field>
          <p className="self-end text-xs text-paper/55">{(edit.kind ?? "verified") === "sample" ? "Shown under the Illustrative Testimonials disclosure. No platform, link or stars are shown." : "Shown as a genuine review. Needs the client's permission and proof."}</p>
          <Field label="Client name *"><input required className="field" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Role / company"><input className="field" value={edit.role ?? ""} onChange={(e) => setEdit({ ...edit, role: e.target.value })} placeholder="BIM Manager, Example Ltd" /></Field>
          <div className="sm:col-span-2"><Field label="Review text * (as the client wrote it)"><textarea required minLength={10} rows={4} className="field" value={edit.quote ?? ""} onChange={(e) => setEdit({ ...edit, quote: e.target.value })} /></Field></div>
        {(edit.kind ?? "verified") === "verified" && <>
          <Field label="Star rating"><select className="field" value={edit.rating ?? 0} onChange={(e) => setEdit({ ...edit, rating: Number(e.target.value) })}><option value={0}>No rating</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select></Field>
          <Field label="Where it was published (optional)"><input className="field" value={edit.source ?? ""} onChange={(e) => setEdit({ ...edit, source: e.target.value })} placeholder="Clutch, LinkedIn, Google…" /></Field>
          <div className="sm:col-span-2"><Field label="Link to the original (optional)"><input className="field" value={edit.sourceUrl ?? ""} onChange={(e) => setEdit({ ...edit, sourceUrl: e.target.value })} placeholder="https://" /></Field></div>
          <Field label="Proof kept (email, screenshot, date) if there is no link"><input className="field" value={edit.evidence ?? ""} onChange={(e) => setEdit({ ...edit, evidence: e.target.value })} placeholder="Email from client, 12 Mar 2026" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.permission === true} onChange={(e) => setEdit({ ...edit, permission: e.target.checked })} /> The client agreed to this being published</label>
        </>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.enabled !== false} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Visible on the site</label>
          <div className="flex gap-2 sm:col-span-2"><button className="btn-primary !py-2">Save</button><button type="button" className="btn-ghost !py-2" onClick={() => setEdit(null)}>Cancel</button></div>
        </form></Card>
      )}
      <div className="divide-y divide-paper/10 border border-paper/15 bg-ink-900">
        {items.length === 0 && <p className="p-5 text-sm text-paper/50">No reviews yet. Nothing is shown on the site until you add real ones.</p>}
        {items.map((r, i) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="flex"><button aria-label="Move up" className="px-2 hover:text-forge" onClick={() => move(i, -1)}>↑</button><button aria-label="Move down" className="px-2 hover:text-forge" onClick={() => move(i, 1)}>↓</button></div>
            <div className="min-w-0 flex-1 basis-60"><p className={r.enabled ? "" : "text-paper/40"}><span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase ${r.kind === "sample" ? "bg-paper/10 text-paper/60" : "bg-green-100 text-green-800"}`}>{r.kind}</span>{r.name}{r.role ? ` · ${r.role}` : ""}{r.kind === "verified" && r.rating ? ` · ${"★".repeat(r.rating)}` : ""}</p><p className="truncate text-xs text-paper/45">{r.quote}</p></div>
            <button className="text-xs hover:text-forge" onClick={() => setEdit(r)}>Edit</button>
            <button className="text-xs text-red-400" onClick={() => remove(r)}>Delete</button>
          </div>
        ))}
      </div>
      {toast.el}
    </>
  );
}
