"use client";
import { useMemo, useState } from "react";
import type { Ext, Issue, Table } from "@/lib/bim/demos/types";
import { BTN, CARD, FIELD, H3, SEV, Tabs } from "./ui";

export function Headline({ ext }: { ext: Ext }) {
  return <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="headline">{ext.headline.map((h) => <div key={h.label} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"><p className="text-lg font-bold leading-tight text-white" data-testid={`kpi-${h.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{h.value}</p><p className="text-xs text-slate-400">{h.label}{h.note ? ` · ${h.note}` : ""}</p></div>)}</div>;
}
export function DataTable({ t, onElement, selected }: { t: Table; onElement?: (id: string) => void; selected?: string | null }) {
  const [q, setQ] = useState(""); const [limit, setLimit] = useState(200); const [sort, setSort] = useState<{ c: number; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => { let r = t.rows; if (q.trim()) { const s = q.toLowerCase(); r = r.filter((x) => x.some((c) => String(c ?? "").toLowerCase().includes(s))); } if (sort) { const { c, dir } = sort; r = [...r].sort((a, b) => { const x = a[c], y = b[c]; if (typeof x === "number" && typeof y === "number") return (x - y) * dir; return String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true }) * dir; }); } return r; }, [t, q, sort]);
  return (
    <div data-testid={`table-${t.id}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-white">{t.title}</h4><span className="text-xs text-slate-500">{rows.length} row(s)</span><input aria-label={`Filter ${t.title}`} placeholder="Filter…" className={`${FIELD} !w-44`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {t.note && <p className="mb-2 text-xs text-slate-400">{t.note}</p>}
      <div className="max-h-[28rem] overflow-auto rounded border border-slate-800"><table className="w-full min-w-max text-left text-xs"><thead className="sticky top-0 bg-slate-800 text-slate-200"><tr>{t.columns.map((c, i) => <th key={i} className="cursor-pointer whitespace-nowrap px-2 py-1.5 font-semibold" onClick={() => setSort((s) => (s?.c === i ? { c: i, dir: (s.dir * -1) as 1 | -1 } : { c: i, dir: 1 }))} aria-sort={sort?.c === i ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>{c}{sort?.c === i ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>)}</tr></thead>
        <tbody>{rows.slice(0, limit).map((r, i) => { const id = t.elementCol !== undefined ? String(r[t.elementCol] ?? "") : ""; const on = !!id && selected === id; return <tr key={i} className={`border-t border-slate-800 ${on ? "bg-yellow-500/15" : "hover:bg-slate-800/50"} ${id && onElement ? "cursor-pointer" : ""}`} onClick={id && onElement ? () => onElement(id) : undefined}>{r.map((c, j) => <td key={j} className={`px-2 py-1 align-top text-slate-200 ${typeof c === "number" ? "tabular-nums" : ""} ${j === t.elementCol && onElement ? "text-blue-300 underline" : ""}`}>{c === null || c === undefined ? "" : String(c)}</td>)}</tr>; })}</tbody></table></div>
      {rows.length > limit && <button type="button" className={`${BTN} mt-2`} onClick={() => setLimit((l) => l + 300)}>Show more ({rows.length - limit} left)</button>}
    </div>
  );
}
export function IssueList({ issues, onSelect, selected }: { issues: Issue[]; onSelect?: (i: Issue) => void; selected?: string | null }) {
  const [sev, setSev] = useState<"all" | Issue["severity"]>("all"); const [rule, setRule] = useState("all"); const rules = useMemo(() => [...new Set(issues.map((i) => i.rule))], [issues]);
  const list = issues.filter((i) => (sev === "all" || i.severity === sev) && (rule === "all" || i.rule === rule)); const n = (s: Issue["severity"]) => issues.filter((i) => i.severity === s).length;
  return (
    <div data-testid="issues">
      <div className="mb-2 flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-white">Findings</h4>
        <Tabs label="Severity" value={sev} onChange={setSev} items={[{ id: "all", label: "All", badge: issues.length }, { id: "error", label: "Errors", badge: n("error") }, { id: "warning", label: "Warnings", badge: n("warning") }, { id: "info", label: "Info", badge: n("info") }]} />
        <select aria-label="Filter by rule" className={`${FIELD} !w-44`} value={rule} onChange={(e) => setRule(e.target.value)}><option value="all">All rules</option>{rules.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
      {list.length === 0 ? <p className="rounded border border-slate-800 p-3 text-sm text-slate-400">{issues.length ? "No findings match the filter." : "No findings."}</p> : <ul className="max-h-[30rem] space-y-1.5 overflow-auto pr-1">{list.slice(0, 400).map((i) => <li key={i.id}><button type="button" onClick={() => onSelect?.(i)} data-testid={`issue-${i.rule}`} className={`w-full rounded border p-2 text-left text-xs ${SEV[i.severity]} ${selected === i.id ? "ring-2 ring-yellow-400" : ""}`}><span className="font-semibold">{i.id} · {i.title}</span><span className="mt-0.5 block text-[11px] opacity-80">{i.rule}{i.element ? ` · ${i.element}` : ""}</span><span className="mt-0.5 block opacity-90">{i.detail}</span></button></li>)}</ul>}
      {list.length > 400 && <p className="mt-1 text-xs text-slate-500">Showing 400 of {list.length}; export the CSV for the full list.</p>}
    </div>
  );
}
export default function AnalysisPanel({ ext, assumptions, warnings, limitations, onElement, onIssue, selected, extra }: { ext: Ext; assumptions: string[]; warnings: string[]; limitations: string[]; onElement?: (id: string) => void; onIssue?: (i: Issue) => void; selected?: string | null; extra?: React.ReactNode }) {
  const [tab, setTab] = useState<string>(ext.tables[0]?.id ?? "findings"); const t = ext.tables.find((x) => x.id === tab);
  return (
    <div className="space-y-3">
      <Headline ext={ext} />
      {extra}
      <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr]">
        <section className={CARD}><Tabs label="Tables" value={tab} onChange={setTab} items={[...ext.tables.map((x) => ({ id: x.id, label: x.title.length > 28 ? x.title.slice(0, 26) + "…" : x.title, badge: x.rows.length })), { id: "findings", label: "Findings", badge: ext.issues.length }]} /><div className="mt-3">{tab === "findings" ? <IssueList issues={ext.issues} onSelect={onIssue} selected={selected} /> : t ? <DataTable t={t} onElement={onElement} selected={selected} /> : null}</div></section>
        <div className="space-y-3">
          {tab !== "findings" && ext.issues.length > 0 && <section className={CARD}><IssueList issues={ext.issues.slice(0, 80)} onSelect={onIssue} selected={selected} /></section>}
          <section className={CARD}><h3 className={H3}>Assumptions</h3>{assumptions.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="mt-1 text-sm text-slate-400">None recorded.</p>}<h3 className={`${H3} mt-4`}>Warnings</h3>{warnings.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200">{warnings.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="mt-1 text-sm text-slate-400">None.</p>}</section>
          <section className={CARD}><h3 className={H3}>Limitations</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{[...ext.notes, ...limitations].map((a, i) => <li key={i}>{a}</li>)}</ul></section>
        </div>
      </div>
    </div>
  );
}
