"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, PageTitle } from "@/components/admin/ui";

interface A { totals: { views?: number; visits?: number; uniqueVisitors?: number }; series: { day: string; views: number; visits: number }[]; pages: [string, number][]; countries: [string, number][]; projects: [string, number][] }

function Table({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <Card><h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-paper/50">No data yet.</p> : (
        <ul className="divide-y divide-paper/10 text-sm">{rows.map(([k, v]) => <li key={k} className="flex justify-between gap-3 py-1.5"><span className="truncate">{k}</span><span className="font-mono text-forge">{v}</span></li>)}</ul>
      )}
    </Card>
  );
}

export default function Analytics() {
  const [a, setA] = useState<A | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<A>("/api/admin/analytics").then(setA).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-red-400">{err}</p>;
  if (!a) return <p className="text-paper/50">Loading…</p>;
  const max = Math.max(1, ...a.series.map((s) => s.views));
  const last30 = a.series.reduce((n, s) => ({ v: n.v + s.views, u: n.u + s.visits }), { v: 0, u: 0 });
  return (
    <>
      <PageTitle title="Analytics" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Total visits", a.totals.visits ?? 0], ["Unique visitors", a.totals.uniqueVisitors ?? 0], ["Page views (all time)", a.totals.views ?? 0], ["Page views (30 d)", last30.v]] as const).map(([l, v]) => (
          <div key={l} className="border border-paper/15 bg-ink-900 p-4"><p className="label !mb-2">{l}</p><p className="text-3xl font-semibold">{v}</p></div>
        ))}
      </div>
      <Card className="mt-4">
        <h2 className="mb-4 font-semibold">Page views — last 30 days</h2>
        <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Bar chart of daily page views">
          {a.series.map((s) => (<div key={s.day} className="group relative flex-1 bg-forge/80 hover:bg-forge" style={{ height: `${Math.max(2, (s.views / max) * 100)}%` }}><span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap bg-ink-700 px-2 py-1 font-mono text-[10px] group-hover:block">{s.day.slice(5)}: {s.views}</span></div>))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-paper/40"><span>{a.series[0]?.day}</span><span>{a.series.at(-1)?.day}</span></div>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Table title="Popular pages" rows={a.pages} /><Table title="Portfolio project views" rows={a.projects} /><Table title="Countries" rows={a.countries} />
      </div>
      <p className="mt-4 text-xs text-paper/40">First-party and cookie-less. A random visitor id is kept in the browser&apos;s local storage; IP addresses are not stored. Country is derived by the host. Do-Not-Track is respected. Country data appears on Vercel deployments.</p>
    </>
  );
}
