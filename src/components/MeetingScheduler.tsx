"use client";
import { useEffect, useMemo, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { pushEvent } from "@/lib/marketing";
import { dayKey, formatSlot, MEETING_PURPOSES } from "@/lib/meetings";

const F = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-blue-600 focus:outline-none";
const L = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500";
interface Offer { enabled: boolean; slots: number[]; tz: string; durationMin: number; bookingUrl: string }

function zones(): string[] { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone"); } catch { return []; } }
const hhmm = (ms: number, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
const dayLabel = (ms: number, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(ms);

/** Visitor-facing meeting request. Shows each slot in the visitor's own time zone and the team's; it only ever creates a *request*. */
export default function MeetingScheduler() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tz, setTz] = useState("UTC");
  const [day, setDay] = useState("");
  const [start, setStart] = useState<number | null>(null);
  const [country, setCountry] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [startedAt] = useState(() => Date.now());
  const all = useMemo(zones, []);

  useEffect(() => { try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); } catch { /* keep UTC */ } }, []);
  const load = () => fetch("/api/meetings", { cache: "no-store" }).then((r) => r.json()).then((j) => { setOffer(j); setLoadError(false); }).catch(() => setLoadError(true));
  useEffect(() => { load(); }, []);

  const days = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of offer?.slots ?? []) { const k = dayKey(s, tz); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  }, [offer, tz]);
  useEffect(() => { if (days.length && !days.some(([k]) => k === day)) { setDay(days[0][0]); setStart(null); } }, [days, day]);
  const times = days.find(([k]) => k === day)?.[1] ?? [];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!start || !offer) return;
    setError(""); setState("sending");
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const r = await fetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, phoneCountry: phoneCountry || country || undefined, tz, start, startedAt }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.id) { pushEvent("meeting_request", { purpose: String(payload.purpose || "") }); setState("done"); return; } if (r.ok) { setState("done"); return; }
      if (r.status === 409) { setStart(null); load(); }
      setError(Array.isArray(j.issues) ? "Please check your details: name, a valid email, country and (if given) a valid phone number." : j.error || "Something went wrong. Please try again.");
    } catch { setError("We couldn't reach the server. Check your connection and try again."); }
    setState("idle");
  }

  if (loadError) return <p className="text-sm text-stone-600">We couldn&apos;t load available times right now. Please use the inquiry form above and we&apos;ll propose a time by email.</p>;
  if (!offer) return <p className="text-sm text-stone-500" aria-busy="true">Loading available times…</p>;
  if (!offer.enabled || offer.slots.length === 0) return <p className="text-sm text-stone-600">No call times are open for request at the moment. Send an inquiry and we&apos;ll propose a time by email.{offer.bookingUrl && <> You can also <a className="underline" href={offer.bookingUrl} target="_blank" rel="noopener noreferrer">use our booking page</a>.</>}</p>;
  if (state === "done") return (
    <div className="rounded-2xl bg-blue-50 p-6" role="status" data-testid="meeting-done">
      <h3 className="font-display text-xl font-semibold text-stone-900">Request sent — not confirmed yet</h3>
      <p className="mt-2 text-sm text-stone-700">You asked for {start && formatSlot(start, tz)} (your time) — {start && formatSlot(start, offer.tz)} for us. We&apos;ve emailed you a copy. A person on our team will confirm it, or suggest another time, by email. Until you get that confirmation, the call is not booked.</p>
    </div>
  );
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="meeting-form" data-clarity-mask="True">
      <div className="sm:col-span-2">
        <label className={L} htmlFor="mtz">Your time zone</label>
        <select id="mtz" className={F} value={tz} onChange={(e) => { setTz(e.target.value); setStart(null); }}>
          {(all.includes(tz) ? all : [tz, ...all]).map((z) => <option key={z}>{z}</option>)}
        </select>
        <p className="mt-1 text-xs text-stone-500">Detected from your browser. Times below are shown in this zone; our working hours are in {offer.tz}. Calls are {offer.durationMin} minutes.</p>
      </div>
      <div className="sm:col-span-2">
        <p className={L}>Choose a day</p>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="Day">
          {days.map(([k, v]) => <button type="button" key={k} onClick={() => { setDay(k); setStart(null); }} className={`rounded-lg border px-3 py-2 text-sm ${k === day ? "border-blue-600 bg-blue-50 font-semibold" : "border-stone-300"}`}>{dayLabel(v[0], tz).replace(/^(\w+) /, "$1 ")}</button>)}
        </div>
      </div>
      <div className="sm:col-span-2">
        <p className={L}>Choose a time ({tz})</p>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="Time">
          {times.map((t) => <button type="button" key={t} data-slot={t} onClick={() => setStart(t)} aria-selected={start === t} className={`rounded-lg border px-3 py-2 text-sm ${start === t ? "border-blue-600 bg-blue-600 text-white" : "border-stone-300"}`} title={`${formatSlot(t, offer.tz)} for us`}>{hhmm(t, tz)}</button>)}
        </div>
        {start && <p className="mt-2 text-sm text-stone-700" data-testid="meeting-both">You: {formatSlot(start, tz)} · Us: {formatSlot(start, offer.tz)}</p>}
      </div>
      <div><label className={L} htmlFor="mname">Full name *</label><input id="mname" name="name" required maxLength={120} className={F} autoComplete="name" /></div>
      <div><label className={L} htmlFor="memail">Business email *</label><input id="memail" name="email" type="email" required className={F} autoComplete="email" /></div>
      <div><label className={L} htmlFor="mcompany">Company</label><input id="mcompany" name="company" maxLength={160} className={F} autoComplete="organization" /></div>
      <div>
        <label className={L} htmlFor="mcountry">Country *</label>
        <select id="mcountry" name="country" required className={F} value={country} onChange={(e) => { setCountry(e.target.value); setPhoneCountry(e.target.value); }}>
          <option value="" disabled>Select…</option>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
      </div>
      <div><label className={L} htmlFor="mphone">Phone (with country code, optional)</label><input id="mphone" name="phone" type="tel" maxLength={30} className={F} placeholder="+44 …" autoComplete="tel" /></div>
      <div><label className={L} htmlFor="mpurpose">Purpose *</label><select id="mpurpose" name="purpose" required className={F} defaultValue="Project discovery call">{MEETING_PURPOSES.map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="sm:col-span-2"><label className={L} htmlFor="mnotes">Anything we should know beforehand? (optional)</label><textarea id="mnotes" name="notes" rows={3} maxLength={1500} className={F} /></div>
      <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="sm:col-span-2">
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <button className="rounded-full bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50" disabled={state === "sending" || !start}>{state === "sending" ? "Sending…" : start ? "Request this time" : "Choose a time first"}</button>
        <p className="mt-2 text-xs text-stone-500">This sends a request. Your meeting is only booked once we confirm it by email.</p>
        {offer.bookingUrl && <p className="mt-1 text-xs text-stone-500">Prefer to pick a time yourself? <a className="underline" href={offer.bookingUrl} target="_blank" rel="noopener noreferrer">Use our booking page</a>.</p>}
      </div>
    </form>
  );
}
