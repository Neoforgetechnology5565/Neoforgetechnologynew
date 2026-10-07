"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { PageTitle, useToast } from "@/components/admin/ui";
import { DIVISION_MAP, DIVISIONS } from "@/lib/divisions";
import type { Project } from "@/lib/types";

export default function Projects() {
  const [items, setItems] = useState<Project[]>([]);
  const [div, setDiv] = useState("");
  const toast = useToast();
  const load = useCallback(() => api<{ items: Project[] }>("/api/admin/projects").then((r) => setItems(r.items)).catch(toast.err), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const shown = items.filter((p) => !div || p.division === div);

  const patch = (p: Project, body: object) => api(`/api/admin/projects/${p.id}`, "PATCH", body).then(load).catch(toast.err);
  async function remove(p: Project) {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try { await api(`/api/admin/projects/${p.id}`, "DELETE"); toast.ok("Deleted"); load(); } catch (e) { toast.err(e); }
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= shown.length) return;
    const next = [...shown]; [next[i], next[j]] = [next[j], next[i]];
    try { await api("/api/admin/projects", "PATCH", { orders: next.map((p, idx) => ({ id: p.id, order: idx })) }); load(); } catch (e) { toast.err(e); }
  }

  return (
    <>
      <PageTitle title="Projects"><Link href="/admin/projects/new" className="btn-primary !py-2">New project</Link></PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ slug: "", short: "All" }, ...DIVISIONS].map((d) => <button key={d.slug} onClick={() => setDiv(d.slug)} className={`border px-3 py-1.5 font-mono text-xs ${div === d.slug ? "border-forge bg-forge text-ink-950" : "border-paper/25"}`}>{d.short}</button>)}
      </div>
      {div === "" && <p className="mb-3 text-xs text-paper/45">Ordering applies to the list currently shown. Filter by division to reorder within it.</p>}
      <div className="divide-y divide-paper/10 border border-paper/15 bg-ink-900">
        {shown.length === 0 && <p className="p-6 text-sm text-paper/50">No projects yet.</p>}
        {shown.map((p, i) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="flex"><button aria-label="Move up" disabled={!div} className="px-2 hover:text-forge disabled:opacity-30" onClick={() => move(i, -1)}>↑</button><button aria-label="Move down" disabled={!div} className="px-2 hover:text-forge disabled:opacity-30" onClick={() => move(i, 1)}>↓</button></div>
            <div className="min-w-0 flex-1 basis-48">
              <Link href={`/admin/projects/${p.id}`} className="font-medium hover:text-forge">{p.title}</Link>
              <p className="truncate font-mono text-[11px] text-paper/45">{DIVISION_MAP[p.division]?.short} · {p.categoryName || "uncategorised"} · /{p.slug}</p>
            </div>
            <span className={`px-2 py-0.5 font-mono text-[10px] uppercase ${p.status === "published" ? "bg-signal/20 text-signal" : "bg-paper/10 text-paper/60"}`}>{p.status}</span>
            <button className={`text-xs ${p.featured ? "text-forge" : "text-paper/50"} hover:underline`} onClick={() => patch(p, { featured: !p.featured })}>{p.featured ? "★ Featured" : "☆ Feature"}</button>
            <button className="text-xs hover:text-forge" onClick={() => patch(p, { status: p.status === "published" ? "draft" : "published" })}>{p.status === "published" ? "Unpublish" : "Publish"}</button>
            {p.status === "published" && <Link href={`/portfolio/${p.division}/${p.slug}`} target="_blank" className="text-xs text-paper/60 hover:text-forge">View ↗</Link>}
            <Link href={`/admin/projects/${p.id}`} className="text-xs hover:text-forge">Edit</Link>
            <button className="text-xs text-red-400 hover:underline" onClick={() => remove(p)}>Delete</button>
          </div>
        ))}
      </div>
      {toast.el}
    </>
  );
}
