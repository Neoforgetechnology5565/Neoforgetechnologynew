"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Card, PageTitle, useToast } from "@/components/admin/ui";
import type { Report, Row, VisitorSummary } from "@/lib/analytics/aggregate";
import type { Live } from "@/lib/analytics/live";
import AlertsPanel from "./AlertsPanel";

type Tab = "overview" | "international" | "locations" | "sources" | "pages" | "clicks" | "navigation" | "visitors" | "contacts" | "alerts";
const TABS: [Tab, string][] = [["overview", "Overview"], ["international", "International"], ["locations", "Locations"], ["sources", "Sources & devices"], ["pages", "Pages & interest"], ["clicks", "Clicks"], ["navigation", "Navigation"], ["visitors", "Visitors"], ["contacts", "Contacts"], ["alerts", "Alerts"]];
interface Detail extends VisitorSummary { journey: { p: string; t: number }[]; clickLog: { p: string; l: string; t: number }[]; language: string; ipTimezone: string }
const when = (t: number) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const n0 = (n: number) => n.toLocaleString();

function Bars({ rows, empty = "No data yet.", testid, unit }: { rows: Row[]; empty?: string; testid?: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="text-sm text-paper/50" data-testid={testid}>{empty}</p>;
  return (
    <ul className="space-y-2 text-sm" data-testid={testid}>
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex justify-between gap-3"><span className="min-w-0 truncate" title={r.sub ? `${r.label}, ${r.sub}` : r.label}>{r.label}{r.sub && <span className="text-paper/45"> · {r.sub}</span>}</span><span className="shrink-0 font-mono text-forge">{n0(r.n)}{unit}{r.n2 !== undefined && <span className="text-paper/40"> / {n0(r.n2)}</span>}</span></div>
          <div className="mt-0.5 h-1 bg-paper/10"><div className="h-1 bg-forge/70" style={{ width: `${Math.max(2, (r.n / max) * 100)}%` }} /></div>
        </li>))}
    </ul>
  );
}
const Panel = ({ title, note, children, testid }: { title: string; note?: string; children: React.ReactNode; testid?: string }) => <Card><div data-testid={testid}><h2 className="font-semibold">{title}</h2>{note && <p className="mb-3 mt-0.5 text-xs text-paper/50">{note}</p>}<div className={note ? "" : "mt-3"}>{children}</div></div></Card>;
const Kpi = ({ label, value, sub, id }: { label: string; value: string; sub?: string; id: string }) => <div className="border border-paper/15 bg-ink-900 p-4" data-testid={id}><p className="label !mb-2">{label}</p><p className="text-3xl font-semibold">{value}</p>{sub && <p className="mt-1 text-xs text-paper/45">{sub}</p>}</div>;
const APPROX = "Approximate: estimated from the visitor's IP address by the hosting provider, at best to city level. It can be wrong, especially for VPNs and mobile networks. “Unknown” means no location could be determined.";

export default function AnalyticsDashboard() {
  const [days, setDays] = useState(30), [tab, setTab] = useState<Tab>("overview"), [r, setR] = useState<Report | null>(null), [err, setErr] = useState("");
  const [visitors, setVisitors] = useState<VisitorSummary[] | null>(null), [contacts, setContacts] = useState<VisitorSummary[] | null>(null), [detail, setDetail] = useState<Detail | null>(null), [q, setQ] = useState("");
  const [live, setLive] = useState<Live | null>(null);
  const toast = useToast();
  useEffect(() => { // visitors online now: refreshed every 10 s while this tab is visible
    let stop = false; const tick = () => { if (document.hidden) return; api<Live>("/api/admin/analytics/live").then((x) => !stop && setLive(x)).catch(() => undefined); };
    tick(); const t = setInterval(tick, 10_000); return () => { stop = true; clearInterval(t); };
  }, []);
  const load = useCallback(() => { setR(null); api<Report>(`/api/admin/analytics?days=${days}`).then(setR).catch((e) => setErr(e.message)); }, [days]);
  useEffect(load, [load]);
  useEffect(() => { if (tab === "visitors" && !visitors) api<{ items: VisitorSummary[] }>("/api/admin/analytics/visitors?filter=all&limit=100").then((x) => setVisitors(x.items)).catch(toast.err); if (tab === "contacts" && !contacts) api<{ items: VisitorSummary[] }>("/api/admin/analytics/visitors?filter=contacted&limit=100").then((x) => setContacts(x.items)).catch(toast.err); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  async function open(id: string) { try { setDetail(await api<Detail>(`/api/admin/analytics/visitors/${id}`)); } catch (e) { toast.err(e); } }
  async function erase(d: Detail) {
    if (!confirm("Erase this visitor's record? The anonymous daily totals are kept.")) return;
    try { await api(`/api/admin/analytics/visitors/${d.id}`, "DELETE"); setDetail(null); setVisitors((v) => v && v.filter((x) => x.id !== d.id)); setContacts((v) => v && v.filter((x) => x.id !== d.id)); toast.ok("Visitor record erased"); } catch (e) { toast.err(e); }
  }
  if (err) return <p className="text-red-400">{err}</p>;
  if (!r) return <p className="text-paper/50">Loading…</p>;
  const max = Math.max(1, ...r.series.map((s) => s.views)), shown = (visitors ?? []).filter((v) => !q || `${v.place} ${v.source} ${v.landing} ${v.device} ${v.browser}`.toLowerCase().includes(q.toLowerCase()));
  const share = (rows: Row[]) => rows.map((x) => ({ ...x }));
  return (
    <>
      <PageTitle title="Analytics">
        <select aria-label="Time range" className="field !w-auto !py-2" value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="range"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
        <button type="button" className="btn-ghost !py-2" onClick={load}>Refresh</button>
      </PageTitle>
      <p className="mb-4 text-sm text-paper/60" data-testid="range-label">{r.from} to {r.to}. Only visitors who accepted statistics are counted; Do-Not-Track is respected.</p>
      {!r.hasData && <p className="mb-4 border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="no-data">No visits recorded in this period yet. Data appears once visitors accept statistics on the live site (Firebase must be configured, and location needs a Vercel deployment).</p>}
      <Card className="mb-4"><div data-testid="live">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><span className={`inline-block h-2.5 w-2.5 rounded-full ${live && live.online > 0 ? "animate-pulse bg-green-400" : "bg-paper/30"}`} aria-hidden />Online now</p>
          <p className="text-3xl font-semibold" data-testid="live-count" aria-live="polite">{live ? live.online : "…"}</p>
          <p className="text-xs text-paper/50">open pages in the last 90 seconds, updated every 10 seconds{live ? ` · ${new Date(live.updatedAt).toLocaleTimeString()}` : ""}</p>
        </div>
        {live && live.online === 0 && <p className="mt-2 text-sm text-paper/50" data-testid="live-empty">Nobody is on the site right now.</p>}
        {live && live.online > 0 && <div className="mt-3 grid gap-4 sm:grid-cols-2"><div><p className="label !mb-1">Pages being viewed</p><ul className="space-y-1 text-sm" data-testid="live-pages">{live.pages.map((p) => <li key={p.path} className="flex justify-between gap-3"><span className="truncate font-mono text-xs">{p.path}</span><span className="font-mono text-forge">{p.n}</span></li>)}</ul></div>
          <div><p className="label !mb-1">Countries (approximate)</p><ul className="space-y-1 text-sm" data-testid="live-countries">{live.countries.map((c) => <li key={c.code} className="flex justify-between gap-3"><span>{c.name}</span><span className="font-mono text-forge">{c.n}</span></li>)}</ul></div></div>}
      </div></Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi id="k-visits" label="Visits" value={n0(r.kpis.visits)} sub="a visit ends after 30 minutes idle" /><Kpi id="k-views" label="Page views" value={n0(r.kpis.pageViews)} /><Kpi id="k-ppv" label="Pages per visit" value={String(r.kpis.pagesPerVisit)} /><Kpi id="k-new" label="New visitors" value={n0(r.kpis.newVisitors)} sub={`${n0(r.kpis.uniqueVisitorsAllTime)} unique all time`} />
        <Kpi id="k-inq" label="Contact enquiries" value={n0(r.kpis.inquiries)} sub="from visitors who accepted statistics" /><Kpi id="k-conv" label="Enquiries per 100 visits" value={String(r.kpis.conversionPct)} /><Kpi id="k-clicks" label="Clicks tracked" value={n0(r.kpis.clicks)} sub="buttons and links, labels only" />
      </div>
      <div role="tablist" aria-label="Analytics sections" className="mt-5 flex flex-wrap gap-1 border-b border-paper/15">
        {TABS.map(([id, label]) => <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={`tab-${id}`} className={`px-3 py-2 text-sm ${tab === id ? "border-b-2 border-forge text-white" : "text-paper/60 hover:text-white"}`}>{label}</button>)}
      </div>
      <div className="mt-4 space-y-4">
        {tab === "overview" && <>
          <Card><h2 className="mb-4 font-semibold">Page views and visits per day</h2>
            <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Bar chart of daily page views" data-testid="chart">{r.series.map((s) => (<div key={s.day} className="group relative flex-1 bg-forge/80 hover:bg-forge" style={{ height: `${Math.max(2, (s.views / max) * 100)}%` }}><span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap bg-ink-700 px-2 py-1 font-mono text-[10px] group-hover:block">{s.day.slice(5)}: {s.views} views, {s.visits} visits</span></div>))}</div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-paper/40"><span>{r.series[0]?.day}</span><span>{r.series.at(-1)?.day}</span></div></Card>
          <div className="grid gap-4 lg:grid-cols-3"><Panel title="Where visitors come from" note="Traffic channel, per visit"><Bars rows={r.channels} testid="ov-channels" /></Panel><Panel title="Top countries (approximate)" note="Visits"><Bars rows={r.countries.slice(0, 8)} testid="ov-countries" /></Panel><Panel title="Popular pages" note="Page views"><Bars rows={r.pages.slice(0, 8)} testid="ov-pages" /></Panel></div>
        </>}
        {tab === "international" && (() => {
          const i = r.international, topShare = i.inquiries && i.countries[0] ? Math.round((i.countries[0].n / i.inquiries) * 100) : null, quote = i.intents.find((x) => x.key === "quote")?.n ?? 0;
          const newPct = r.kpis.visits ? Math.round((r.kpis.newVisitors / r.kpis.visits) * 100) : null;
          return <>
          <p role="note" className="border border-paper/15 bg-ink-900 p-3 text-sm text-paper/70" data-testid="intl-note">Inquiry and meeting figures come from the forms themselves (the country the person chose), so they include everyone who wrote to us. Visit figures count only visitors who accepted statistics and are approximate. No names, emails, phone numbers or IP addresses appear here.</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="intl-kpis">
            <Kpi id="ik-inq" label="Inquiries (forms)" value={n0(i.inquiries)} sub="all senders" /><Kpi id="ik-countries" label="Countries with inquiries" value={n0(i.distinctCountries)} sub={topShare === null ? "" : `top country: ${topShare}% of inquiries`} />
            <Kpi id="ik-quote" label="Quotation requests" value={n0(quote)} sub={i.inquiries ? `${Math.round((quote / i.inquiries) * 100)}% of inquiries` : ""} /><Kpi id="ik-meet" label="Meeting requests" value={n0(i.meetings)} sub="requested, not necessarily confirmed" />
            <Kpi id="ik-resp" label="Median first reply" value={r.response?.medianHours == null ? "—" : `${r.response.medianHours} h`} sub={r.response ? `${r.response.answered} answered · ${r.response.unanswered} waiting` : ""} /><Kpi id="ik-24" label="Replied within 24 h" value={r.response?.within24hPct == null ? "—" : `${r.response.within24hPct}%`} sub="of answered inquiries" />
            <Kpi id="ik-new" label="New visitors" value={newPct === null ? "—" : `${newPct}%`} sub={`${n0(r.kpis.newVisitors)} new of ${n0(r.kpis.visits)} visits (statistics visitors)`} /><Kpi id="ik-rate" label="Inquiries per 100 visits" value={String(r.kpis.conversionPct)} sub="linked inquiries only" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Countries that send inquiries" note="Country chosen in the inquiry form" testid="intl-countries"><Bars rows={i.countries} empty="No inquiries with a country yet." /></Panel>
            <Panel title="Countries that request meetings" note="Country chosen in the meeting form" testid="intl-meet-countries"><Bars rows={i.meetingCountries} empty="No meeting requests yet." /></Panel>
            <Panel title="Services people ask for" note="Service chosen in the inquiry form" testid="intl-services"><Bars rows={i.services} empty="No inquiries yet." /></Panel>
            <Panel title="Services international visitors read" note="Service pages viewed (statistics visitors)" testid="intl-viewed"><Bars rows={r.services} empty="No service pages viewed yet." /></Panel>
            <Panel title="Countries visiting" note="Visits (approximate)" testid="intl-visits"><Bars rows={r.countries.map((c) => ({ ...c }))} /></Panel>
            <Panel title="Portfolio and demo interest" note="Projects and demos viewed" testid="intl-portfolio"><Bars rows={[...r.projects, ...r.demos].sort((a, b) => b.n - a.n).slice(0, 10)} empty="None yet." /></Panel>
            <Panel title="Request type" testid="intl-intents"><Bars rows={i.intents} empty="None yet." /></Panel><Panel title="Preferred contact method" testid="intl-methods"><Bars rows={i.methods} empty="None yet." /></Panel>
            <Panel title="Currency requested" testid="intl-currencies"><Bars rows={i.currencies} empty="None yet." /></Panel><Panel title="Meeting purposes" testid="intl-purposes"><Bars rows={i.meetingPurposes} empty="None yet." /></Panel>
          </div>
          <Card><h2 className="font-semibold">Contact button clicks</h2><p className="mb-3 mt-0.5 text-xs text-paper/50">Buttons and links whose label mentions contact, quote, call, WhatsApp or email.</p>
            {(() => { const rows = r.clicks.filter((c) => /contact|quote|quotation|call|whatsapp|email|inquiry|enquiry/i.test(c.label)); return !rows.length ? <p className="text-sm text-paper/50" data-testid="intl-no-clicks">None recorded yet.</p> : <ul className="space-y-1 text-sm" data-testid="intl-clicks">{rows.map((c, k) => <li key={k} className="flex justify-between gap-3"><span className="truncate">{c.label} <span className="text-paper/40">on {c.path}</span></span><span>{c.n}</span></li>)}</ul>; })()}</Card>
          </>; })()}
        {tab === "locations" && <>
          <p role="note" className="border border-paper/15 bg-ink-900 p-3 text-sm text-paper/70" data-testid="approx-note">{APPROX} Precise (GPS) location is never requested.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Countries" note="Visits / page views" testid="loc-countries"><Bars rows={share(r.countries)} /></Panel>
            <Panel title="States, provinces and regions" note="Visits. The code is shown when we have no name for a region." testid="loc-regions"><Bars rows={r.regions} empty="No regions yet. Region data needs a Vercel deployment." /></Panel>
            <Panel title="Cities (approximate)" note="Visits" testid="loc-cities"><Bars rows={r.cities} empty="No cities yet." /></Panel>
            <Panel title="Visitor time zones" note="Reported by the visitor's browser" testid="loc-timezones"><Bars rows={r.timezones} /></Panel>
          </div></>}
        {tab === "sources" && <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Traffic channels" note="Per visit" testid="src-channels"><Bars rows={r.channels} /></Panel><Panel title="Sources" note="Search engines, social networks, newsletters and campaigns" testid="src-sources"><Bars rows={r.sources} /></Panel>
          <Panel title="Referring websites" note="Host name only; the full address is never kept" testid="src-referrers"><Bars rows={r.referrers} empty="No referring websites yet." /></Panel><Panel title="Campaigns (utm_campaign)" testid="src-campaigns"><Bars rows={r.campaigns} empty="No tagged campaigns yet." /></Panel>
          <Panel title="Device type" testid="dev-devices"><Bars rows={r.devices} /></Panel><Panel title="Browsers" testid="dev-browsers"><Bars rows={r.browsers} /></Panel><Panel title="Operating systems" testid="dev-os"><Bars rows={r.os} /></Panel>
        </div>}
        {tab === "pages" && <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Popular pages" note="Page views" testid="pg-pages"><Bars rows={r.pages} /></Panel><Panel title="Entry pages" note="The first page of a visit" testid="pg-entries"><Bars rows={r.entries} /></Panel>
          <Panel title="Services viewed" testid="in-services"><Bars rows={r.services} empty="No service pages viewed yet." /></Panel><Panel title="Portfolio projects viewed" testid="in-projects"><Bars rows={r.projects} empty="No portfolio projects viewed yet." /></Panel>
          <Panel title="Demos opened" testid="in-demos"><Bars rows={r.demos} empty="No demos opened yet." /></Panel><Panel title="Blog posts read" testid="in-blogs"><Bars rows={r.blogs} empty="No blog posts read yet." /></Panel>
        </div>}
        {tab === "clicks" && <Card><h2 className="font-semibold">What visitors click</h2><p className="mb-3 mt-0.5 text-xs text-paper/50">Buttons and links, by their visible label. Nothing typed into a form is recorded, email addresses and phone numbers are removed, and demo workspaces are not click-tracked.</p>
          {!r.clicks.length ? <p className="text-sm text-paper/50" data-testid="no-clicks">No clicks recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm" data-testid="clicks-table"><thead className="text-paper/50"><tr><th className="py-1 pr-3">Element</th><th className="pr-3">Type</th><th className="pr-3">On page</th><th className="text-right">Clicks</th></tr></thead>
            <tbody>{r.clicks.map((c, i) => <tr key={i} className="border-t border-paper/10"><td className="max-w-[260px] truncate py-1.5 pr-3">{c.label}</td><td className="pr-3 text-paper/60">{c.kind}</td><td className="max-w-[260px] truncate pr-3 font-mono text-xs text-paper/70">{c.path}</td><td className="text-right font-mono text-forge">{c.n}</td></tr>)}</tbody></table></div>}</Card>}
        {tab === "navigation" && <div className="grid gap-4 lg:grid-cols-2">
          <Card><h2 className="font-semibold">How visitors move between pages</h2><p className="mb-3 mt-0.5 text-xs text-paper/50">Page-to-page steps within a visit, most common first.</p>
            {!r.flows.length ? <p className="text-sm text-paper/50" data-testid="no-flows">No navigation recorded yet.</p> : <ul className="space-y-1.5 text-sm" data-testid="flows">{r.flows.map((f, i) => <li key={i} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate font-mono text-xs"><span className="text-paper/70">{f.from}</span> <span className="text-forge">→</span> {f.to}</span><span className="shrink-0 font-mono text-forge">{f.n}</span></li>)}</ul>}</Card>
          <Panel title="Where visits start" note="Entry pages" testid="nav-entries"><Bars rows={r.entries} /></Panel>
        </div>}
        {tab === "visitors" && <Card>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Recent visitors</h2><p className="text-xs text-paper/50">Random ids only: no names, no IP addresses. Records are deleted after 180 days.</p></div><input className="field !w-64" placeholder="Filter by place, source, page…" aria-label="Filter visitors" value={q} onChange={(e) => setQ(e.target.value)} data-testid="visitor-filter" /></div>
          <p className="mt-2 text-xs text-paper/50">{APPROX}</p>
          {!visitors ? <p className="mt-3 text-sm text-paper/50">Loading…</p> : !shown.length ? <p className="mt-3 text-sm text-paper/50" data-testid="no-visitors">No visitors to show.</p> : (
            <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm" data-testid="visitors-table"><thead className="text-paper/50"><tr><th className="py-1 pr-3">Last visit</th><th className="pr-3">First visit</th><th className="pr-3">Location (approx.)</th><th className="pr-3">Source</th><th className="pr-3">Device</th><th className="pr-3 text-right">Pages</th><th className="pr-3 text-right">Visits</th><th className="pr-3 text-right">Clicks</th><th>Contacted</th></tr></thead>
              <tbody>{shown.map((v) => <tr key={v.id} className="cursor-pointer border-t border-paper/10 hover:bg-paper/5" tabIndex={0} onClick={() => open(v.id)} onKeyDown={(e) => e.key === "Enter" && open(v.id)} data-testid={`visitor-${v.id}`}><td className="py-1.5 pr-3 whitespace-nowrap">{when(v.lastSeen)}</td><td className="pr-3 whitespace-nowrap text-paper/60">{when(v.firstSeen)}</td><td className="pr-3">{v.place}</td><td className="pr-3">{v.source}</td><td className="pr-3 text-paper/70">{v.device || "—"}{v.browser ? ` · ${v.browser}` : ""}</td><td className="pr-3 text-right font-mono">{v.pages}</td><td className="pr-3 text-right font-mono">{v.visits}</td><td className="pr-3 text-right font-mono">{v.clicks}</td><td>{v.converted ? <span className="bg-green-500/20 px-1.5 py-0.5 text-xs text-green-300">Yes</span> : <span className="text-paper/40">—</span>}</td></tr>)}</tbody></table></div>)}
        </Card>}
        {tab === "alerts" && <AlertsPanel />}
        {tab === "contacts" && <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2"><Panel title="Enquiries by traffic channel" note={`${r.conversions.total} in this period`} testid="cv-channels"><Bars rows={r.conversions.channels} empty="No linked enquiries yet." /></Panel><Panel title="Enquiries by country (approximate)" testid="cv-countries"><Bars rows={r.conversions.countries} empty="No linked enquiries yet." /></Panel></div>
          <Card><h2 className="font-semibold">Visitors who contacted us</h2><p className="mb-3 mt-0.5 text-xs text-paper/50">Only visitors who accepted statistics before sending a message can be linked. The message itself is in Inquiries.</p>
            {!contacts ? <p className="text-sm text-paper/50">Loading…</p> : !contacts.length ? <p className="text-sm text-paper/50" data-testid="no-contacts">No enquiries have been linked to a visit yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm" data-testid="contacts-table"><thead className="text-paper/50"><tr><th className="py-1 pr-3">Contacted</th><th className="pr-3">Location (approx.)</th><th className="pr-3">Came from</th><th className="pr-3">Landing page</th><th className="pr-3 text-right">Pages</th><th className="text-right">Visits</th></tr></thead>
                <tbody>{contacts.map((v) => <tr key={v.id} className="cursor-pointer border-t border-paper/10 hover:bg-paper/5" tabIndex={0} onClick={() => open(v.id)} onKeyDown={(e) => e.key === "Enter" && open(v.id)} data-testid={`contact-${v.id}`}><td className="py-1.5 pr-3 whitespace-nowrap">{when(v.convertedAt ?? 0)}</td><td className="pr-3">{v.place}</td><td className="pr-3">{v.source}</td><td className="pr-3 font-mono text-xs">{v.landing || "—"}</td><td className="pr-3 text-right font-mono">{v.pages}</td><td className="text-right font-mono">{v.visits}</td></tr>)}</tbody></table></div>)}
          </Card></div>}
      </div>
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDetail(null)}>
          <aside role="dialog" aria-label="Visitor detail" className="h-full w-full max-w-md overflow-y-auto bg-ink-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="visitor-detail">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{detail.place}</h2><p className="text-xs text-paper/50">Approximate location · visitor <span className="font-mono">{detail.id.slice(0, 8)}…</span></p></div><button type="button" className="btn-ghost !py-1.5" onClick={() => setDetail(null)} aria-label="Close" data-testid="detail-close">✕</button></div>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-paper/50">First visit</dt><dd>{when(detail.firstSeen)}</dd><dt className="text-paper/50">Last visit</dt><dd>{when(detail.lastSeen)}</dd><dt className="text-paper/50">Came from</dt><dd>{detail.source} <span className="text-paper/40">({detail.channel})</span></dd><dt className="text-paper/50">Landing page</dt><dd className="font-mono text-xs">{detail.landing || "—"}</dd>
              <dt className="text-paper/50">Device</dt><dd>{[detail.device, detail.browser, detail.os].filter(Boolean).join(" · ") || "—"}</dd><dt className="text-paper/50">Time zone</dt><dd>{detail.timezone || "Unknown"}</dd><dt className="text-paper/50">Language</dt><dd>{detail.language || "—"}</dd><dt className="text-paper/50">Pages / visits / clicks</dt><dd>{detail.pages} / {detail.visits} / {detail.clicks}</dd>
              <dt className="text-paper/50">Contacted us</dt><dd>{detail.converted ? `Yes, ${when(detail.convertedAt ?? 0)}` : "No"}</dd>
            </dl>
            <h3 className="mt-5 font-semibold">Pages viewed (latest {detail.journey.length})</h3>
            <ol className="mt-2 space-y-1 text-sm" data-testid="journey">{detail.journey.map((j, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate font-mono text-xs">{j.p}</span><span className="shrink-0 text-xs text-paper/45">{when(j.t)}</span></li>)}</ol>
            <h3 className="mt-5 font-semibold">Clicks (latest {detail.clickLog.length})</h3>
            {!detail.clickLog.length ? <p className="mt-2 text-sm text-paper/50">None recorded.</p> : <ul className="mt-2 space-y-1 text-sm" data-testid="clicklog">{detail.clickLog.map((c, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{c.l}</span><span className="shrink-0 font-mono text-xs text-paper/45">{c.p}</span></li>)}</ul>}
            <button type="button" className="btn-ghost mt-6 !py-2 text-red-400" onClick={() => erase(detail)} data-testid="erase-visitor">Erase this visitor&apos;s record</button>
          </aside>
        </div>)}
      <p className="mt-6 text-xs text-paper/40">First-party and cookie-less. A random visitor id is kept in the visitor&apos;s browser after they accept statistics. IP addresses, raw user agents and full referrer addresses are never stored. Location is the hosting provider&apos;s approximate, IP-derived estimate. Individual visit records are deleted after 180 days; daily totals are anonymous.</p>
      {toast.el}
    </>
  );
}
