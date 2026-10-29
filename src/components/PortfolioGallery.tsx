"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import DemoPreview, { type PreviewKind } from "./DemoPreview";

export interface GalleryItem { id: string; group: "crm-hrm-erp" | "computer-vision" | "cad-bim"; no: string; title: string; desc: string; tags: string[]; href: string; appHref?: string; status: "live" | "soon"; layout?: string; cover?: string; preview: PreviewKind }
const GROUPS = [{ id: "", label: "Everything" }, { id: "crm-hrm-erp", label: "CRM / ERP / HRM" }, { id: "computer-vision", label: "Computer Vision & AI" }, { id: "cad-bim", label: "CAD / BIM" }];

/** Curated demo gallery: search, filter by division, and open any interactive demo. Items without a working app say so. */
export default function PortfolioGallery({ items }: { items: GalleryItem[] }) {
  const [q, setQ] = useState(""); const [group, setGroup] = useState(""); const [liveOnly, setLiveOnly] = useState(false);
  const rows = useMemo(() => { const s = q.trim().toLowerCase(); return items.filter((i) => (!group || i.group === group) && (!liveOnly || i.status === "live") && (!s || `${i.title} ${i.desc} ${i.tags.join(" ")} ${i.layout ?? ""}`.toLowerCase().includes(s))); }, [items, q, group, liveOnly]);
  const count = (g: string) => items.filter((i) => !g || i.group === g).length;
  return (
    <section aria-label="Demo gallery" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search demos, tags, layouts…" aria-label="Search demos" className="w-full rounded-full border border-stone-300 bg-white px-4 py-2.5 text-[15px] sm:w-80" />
        <div role="group" aria-label="Filter by division" className="flex flex-wrap gap-2">{GROUPS.map((g) => <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)} className={`rounded-full border px-4 py-1.5 text-[15px] font-medium ${group === g.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700 hover:border-blue-600"}`}>{g.label} <span className="opacity-70">{count(g.id)}</span></button>)}</div>
        <label className="ml-auto flex items-center gap-2 text-[15px] text-stone-700"><input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} />Interactive now</label>
      </div>
      <p className="mt-3 text-[15px] text-stone-600" role="status" aria-live="polite">{rows.length} of {items.length} demos shown.</p>
      <ul className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="gallery">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            {d.cover ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.cover} alt="" loading="lazy" width={800} height={450} className="aspect-[16/9] w-full rounded-lg border border-stone-200 object-cover" data-testid="cover" /> : <DemoPreview kind={d.preview} />}
            <div className="mt-4 flex items-center justify-between gap-2"><span className="text-[15px] font-semibold text-blue-700">{GROUPS.find((g) => g.id === d.group)?.label} · {d.no}</span><span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${d.status === "live" ? "bg-blue-50 text-blue-700" : "bg-stone-100 text-stone-600"}`}>{d.status === "live" ? "Interactive" : "In development"}</span></div>
            <h3 className="mt-1 font-display text-xl font-semibold leading-snug text-stone-900">{d.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-stone-600">{d.desc}</p>
            {d.layout && <p className="mt-2 text-[15px] text-stone-700"><span className="font-semibold">Workspace:</span> {d.layout}</p>}
            <ul className="mt-3 flex flex-wrap gap-1.5">{d.tags.slice(0, 5).map((t) => <li key={t} className="rounded-full bg-stone-100 px-2.5 py-1 text-[13px] font-medium text-stone-700">{t}</li>)}</ul>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              {d.status === "live" && d.appHref ? <><Link href={d.appHref} className="rounded-full bg-stone-900 px-4 py-2 text-[15px] font-medium text-white hover:bg-blue-700">Open demo</Link><Link href={d.href} className="rounded-full border border-stone-300 px-4 py-2 text-[15px] font-medium text-stone-800 hover:border-blue-600">Details</Link></> : <span className="rounded-full bg-stone-100 px-4 py-2 text-[15px] font-medium text-stone-600">Demo coming soon</span>}
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="mt-8 rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-600">No demos match. Clear the search or choose another division.</p>}
    </section>
  );
}
