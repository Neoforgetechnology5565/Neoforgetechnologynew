"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { PageTitle, useToast } from "@/components/admin/ui";
import type { Post } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function BlogAdmin() {
  const [items, setItems] = useState<Post[]>([]);
  const toast = useToast();
  const load = useCallback(() => api<{ items: Post[] }>("/api/admin/posts").then((r) => setItems(r.items)).catch(toast.err), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const toggle = (p: Post) => api(`/api/admin/posts/${p.id}`, "PATCH", { status: p.status === "published" ? "draft" : "published" }).then(load).catch(toast.err);
  async function remove(p: Post) {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try { await api(`/api/admin/posts/${p.id}`, "DELETE"); toast.ok("Deleted"); load(); } catch (e) { toast.err(e); }
  }
  return (
    <>
      <PageTitle title="Blog articles"><Link href="/admin/blog/new" className="btn-primary !py-2">New article</Link></PageTitle>
      <p className="mb-4 max-w-3xl text-sm text-paper/60">Published articles appear at <b>/blog</b>, in the sitemap (Google finds them automatically) and in the RSS feed.</p>
      <div className="divide-y divide-paper/10 border border-paper/15 bg-ink-900">
        {items.length === 0 && <p className="p-6 text-sm text-paper/50">No articles yet. Click “New article”.</p>}
        {items.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1 basis-60">
              <Link href={`/admin/blog/${p.id}`} className="font-medium hover:text-forge">{p.title}</Link>
              <p className="truncate font-mono text-[11px] text-paper/45">/blog/{p.slug}{p.publishedAt ? ` · ${formatDate(p.publishedAt)}` : ""}{p.tags.length ? ` · ${p.tags.join(", ")}` : ""}</p>
            </div>
            <span className={`px-2 py-0.5 font-mono text-[10px] uppercase ${p.status === "published" ? "bg-signal/20 text-signal" : "bg-paper/10 text-paper/60"}`}>{p.status}</span>
            <button className="text-xs hover:text-forge" onClick={() => toggle(p)}>{p.status === "published" ? "Unpublish" : "Publish"}</button>
            {p.status === "published" && <Link href={`/blog/${p.slug}`} target="_blank" className="text-xs text-paper/60 hover:text-forge">View ↗</Link>}
            <Link href={`/admin/blog/${p.id}`} className="text-xs hover:text-forge">Edit</Link>
            <button className="text-xs text-red-600 hover:underline" onClick={() => remove(p)}>Delete</button>
          </div>
        ))}
      </div>
      {toast.el}
    </>
  );
}
