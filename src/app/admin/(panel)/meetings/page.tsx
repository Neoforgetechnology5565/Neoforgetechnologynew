"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { PageTitle, useToast } from "@/components/admin/ui";
import { COUNTRY_NAME } from "@/lib/countries";
import { formatSlot, MEETING_DEFAULTS, type MeetingSettings } from "@/lib/meetings";
import type { MeetingRequest } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Meetings() {
  const toast = useToast();
  const [items, setItems] = useState<MeetingRequest[]>([]);
  const [s, setS] = useState<MeetingSettings>(MEETING_DEFAULTS);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const load = useCallback(() => api<{ items: MeetingRequest[] }>("/api/admin/meetings").then((r) => setItems(r.items)).catch(toast.err), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); api<{ item: MeetingSettings }>("/api/admin/content/meetings").then((r) => setS({ ...MEETING_DEFAULTS, ...r.item })).catch(toast.err); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(m: MeetingRequest, status: "confirmed" | "declined") {
    try {
      const r = await api<{ emailed: boolean; emailError?: string }>(`/api/admin/meetings/${m.id}`, "PATCH", { status, message: msg[m.id] ?? "" });
      toast.ok(r.emailed ? `Marked ${status}; the visitor was emailed.` : `Marked ${status}, but the email was NOT sent${r.emailError ? ` (${r.emailError})` : ""}. Please contact ${m.email} yourself.`);
      load();
    } catch (e) { toast.err(e); }
  }
  async function save() { try { await api("/api/admin/content/meetings", "PUT", s); toast.ok("Meeting settings saved"); } catch (e) { toast.err(e); } }
  const num = (k: keyof MeetingSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  const open = items.filter((m) => m.status === "requested").length;

  return (
    <>
      <PageTitle title={`Meeting requests (${open} waiting)`} />
      <section className="mb-8 border border-paper/15 bg-ink-900 p-5" data-testid="meeting-settings">
        <h2 className="text-lg font-semibold">Availability</h2>
        <p className="mt-1 text-xs text-paper/55">Visitors can request any free slot inside these working hours, shown in their own time zone. Nothing is booked until you confirm it below. Set the time zone to where your team works; until you do it is UTC.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> Accept meeting requests</label>
          <div><p className="label">Team time zone (IANA)</p><input className="field" value={s.tz} onChange={(e) => setS({ ...s, tz: e.target.value })} placeholder="Africa/Lagos" /></div>
          <div><p className="label">Start hour</p><input className="field" type="number" min={0} max={23} value={s.startHour} onChange={num("startHour")} /></div>
          <div><p className="label">End hour</p><input className="field" type="number" min={1} max={24} value={s.endHour} onChange={num("endHour")} /></div>
          <div><p className="label">Call length (minutes)</p><select className="field" value={s.durationMin} onChange={(e) => setS({ ...s, durationMin: Number(e.target.value) as 30 | 45 | 60 })}>{[30, 45, 60].map((d) => <option key={d}>{d}</option>)}</select></div>
          <div><p className="label">Days offered ahead</p><input className="field" type="number" min={1} max={60} value={s.horizonDays} onChange={num("horizonDays")} /></div>
          <div><p className="label">Minimum notice (hours)</p><input className="field" type="number" min={0} max={240} value={s.leadHours} onChange={num("leadHours")} /></div>
          <div className="sm:col-span-3"><p className="label">Working days</p><div className="flex flex-wrap gap-3 text-sm">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1.5"><input type="checkbox" checked={s.days.includes(i)} onChange={(e) => setS({ ...s, days: e.target.checked ? [...s.days, i].sort() : s.days.filter((x) => x !== i) })} />{d}</label>)}</div></div>
          <div className="sm:col-span-3"><p className="label">External booking page (optional: Calendly, Cal.com …)</p><input className="field" value={s.bookingUrl} onChange={(e) => setS({ ...s, bookingUrl: e.target.value })} placeholder="https://" /></div>
        </div>
        <button className="btn-primary mt-4 !py-2" onClick={save}>Save settings</button>
      </section>

      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-paper/50">No meeting requests yet.</p>}
        {items.map((m) => (
          <article key={m.id} className="border border-paper/15 bg-ink-900 p-4 text-sm" data-testid="meeting-row" data-status={m.status}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold">{m.name}{m.company ? ` · ${m.company}` : ""}</p><a className="text-forge" href={`mailto:${m.email}`}>{m.email}</a>{m.phone && <span className="ml-3 text-paper/60">{m.phone}</span>}<p className="text-xs text-paper/50">{COUNTRY_NAME[m.country] || m.country}</p></div>
              <span className={`border px-2 py-0.5 text-xs uppercase ${m.status === "confirmed" ? "border-green-500 text-green-400" : m.status === "declined" ? "border-paper/30 text-paper/50" : "border-amber-400 text-amber-300"}`}>{m.status === "requested" ? "Waiting for you" : m.status}</span>
            </div>
            <p className="mt-3"><b>{m.purpose}</b> · {m.durationMin} min</p>
            <p className="text-paper/80">Visitor: {formatSlot(m.start, m.tz)} <span className="text-paper/40">({m.tz})</span></p>
            <p className="text-paper/80">Our time: {formatSlot(m.start, s.tz)}</p>
            {m.notes && <p className="mt-2 whitespace-pre-wrap text-paper/70">{m.notes}</p>}
            {m.status === "requested" ? (
              <div className="mt-3">
                <textarea className="field" rows={2} placeholder="Optional message to the visitor (e.g. meeting link, or another time)" value={msg[m.id] ?? ""} onChange={(e) => setMsg({ ...msg, [m.id]: e.target.value })} />
                <div className="mt-2 flex gap-3"><button className="btn-primary !py-1.5" onClick={() => decide(m, "confirmed")}>Confirm and email</button><button className="text-red-400" onClick={() => decide(m, "declined")}>Decline and email</button></div>
              </div>
            ) : m.message && <p className="mt-2 text-xs text-paper/50">Your message: {m.message}</p>}
          </article>
        ))}
      </div>
      {toast.el}
    </>
  );
}
