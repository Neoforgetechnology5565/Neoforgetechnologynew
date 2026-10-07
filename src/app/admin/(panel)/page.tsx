"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, PageTitle } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils";

interface D { projects: { total: number; published: number; draft: number }; inquiries: { total: number; unread: number }; unreadChats: number; visits: number; views: number; uniqueVisitors: number; activity: { at: number; kind: string; text: string; href: string }[] }

export default function Dashboard() {
  const [d, setD] = useState<D | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<D>("/api/admin/dashboard").then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-red-400">{err}</p>;
  if (!d) return <p className="text-paper/50">Loading…</p>;
  const stats: [string, number, string][] = [
    ["Total projects", d.projects.total, "/admin/projects"], ["Published", d.projects.published, "/admin/projects"], ["Drafts", d.projects.draft, "/admin/projects"],
    ["Inquiries", d.inquiries.total, "/admin/inbox"], ["Unread inquiries", d.inquiries.unread, "/admin/inbox"], ["Unread chat messages", d.unreadChats, "/admin/chats"],
    ["Website visits", d.visits, "/admin/analytics"], ["Page views", d.views, "/admin/analytics"], ["Unique visitors", d.uniqueVisitors, "/admin/analytics"],
  ];
  return (
    <>
      <PageTitle title="Dashboard"><Link href="/admin/projects/new" className="btn-primary !py-2">New project</Link></PageTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {stats.map(([l, v, h]) => (<Link key={l} href={h} className="border border-paper/15 bg-ink-900 p-4 hover:border-forge"><p className="label !mb-2">{l}</p><p className="text-3xl font-semibold">{v}</p></Link>))}
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Recent activity</h2>
        {d.activity.length === 0 ? <p className="text-sm text-paper/50">Nothing yet.</p> : (
          <ul className="divide-y divide-paper/10">
            {d.activity.map((a, i) => (<li key={i}><Link href={a.href} className="flex flex-wrap items-center gap-x-3 py-2.5 text-sm hover:text-forge"><span className="w-16 font-mono text-[11px] uppercase text-forge">{a.kind}</span><span className="min-w-0 flex-1 truncate">{a.text}</span><span className="text-xs text-paper/45">{formatDateTime(a.at)}</span></Link></li>))}
          </ul>
        )}
      </Card>
    </>
  );
}
