"use client";
import Link from "next/link";
import { useState } from "react";
import { COUNTRIES, DIAL, PRIORITY_COUNTRIES } from "@/lib/countries";
import { BUDGET_DISCUSS, BUDGETS, CONTACT_METHODS, CURRENCIES, SERVICE_OPTIONS, TIMELINES } from "@/lib/inquiry-options";
import type { MediaRef } from "@/lib/types";
import { analyticsAllowed } from "@/lib/consent";
import { enablePush, pushSupported } from "@/lib/push-client";
import FileDrop from "./FileDrop";

const F = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-blue-600 focus:outline-none";
const L = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500";
const ORDERED = [...PRIORITY_COUNTRIES.map((c) => COUNTRIES.find((x) => x[0] === c)!), ...COUNTRIES.filter((x) => !PRIORITY_COUNTRIES.includes(x[0]))];
const FIELD_LABEL: Record<string, string> = { name: "name", email: "a valid business email", country: "country", phone: "phone number", message: "project description (at least 10 characters)", service: "service", budget: "budget" };

/** Only when the visitor accepted statistics: lets us see which visit led to this message. */
function visitorLink(): { vid?: string } {
  try { const v = analyticsAllowed() && navigator.doNotTrack !== "1" ? localStorage.getItem("nf_vid") : null; return v ? { vid: v } : {}; } catch { return {}; }
}

export default function ContactForm({ initialDivision = "", defaultMessage = "", initialIntent = "project" }: { initialDivision?: string; defaultMessage?: string; initialIntent?: "project" | "quote" }) {
  const [country, setCountry] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [startedAt] = useState(() => Date.now());
  const initialService = SERVICE_OPTIONS.find((o) => o.division && o.division === initialDivision)?.value ?? "";
  const [files, setFiles] = useState<MediaRef[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ id: string; token: string } | null>(null);
  const [notify, setNotify] = useState<"idle" | "on" | "failed">("idle");

  async function turnOnNotifications() {
    if (!sent) return;
    try {
      const sub = await enablePush();
      const r = await fetch("/api/contact/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sent.id, token: sent.token, sub }) });
      setNotify(r.ok ? "on" : "failed");
    } catch { setNotify("failed"); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setState("sending");
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(f.entries());
    let tz: string | undefined; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* optional */ }
    setFieldErrors({});
    let res: Response;
    try { res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, phoneCountry: phoneCountry || country || undefined, tz, startedAt, files, ...visitorLink() }) }); }
    catch { setError("We couldn't reach the server. Check your connection and try again — your details are still in the form."); setState("idle"); return; }
    if (res.ok) { const j = await res.json().catch(() => ({})); if (j.id && j.token) setSent({ id: j.id, token: j.token }); setState("done"); return; }
    const j = await res.json().catch(() => ({}));
    if (Array.isArray(j.issues)) {
      const fe: Record<string, string> = {};
      for (const it of j.issues as { path?: (string | number)[]; message?: string }[]) { const k = String(it.path?.[0] ?? ""); if (k && !fe[k]) fe[k] = (k === "phone" || k === "budget") && it.message ? it.message : `Please check the ${FIELD_LABEL[k] || k}.`; }
      setFieldErrors(fe);
      setError(`Please fix: ${Object.keys(fe).map((k) => FIELD_LABEL[k] || k).join(", ")}.`);
    } else setError(j.error || "Something went wrong. Please try again.");
    setState("idle");
  }

  if (state === "done")
    return (
      <div className="rounded-2xl bg-blue-50 p-8" role="status">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">Received</p>
        <h3 className="mt-2 font-display text-2xl font-semibold text-stone-900">Thanks — your inquiry is in.</h3>
        <p className="mt-2 text-stone-600">An engineer will review the details and reply by email. We&apos;ve also sent a confirmation to the address you gave.</p>
        {sent && pushSupported() && typeof Notification !== "undefined" && Notification.permission !== "denied" && notify === "idle" && <button type="button" onClick={turnOnNotifications} className="mt-4 rounded-full border border-blue-600 px-5 py-2 text-sm font-semibold text-blue-700 hover:bg-white">🔔 Notify me on this device when you reply</button>}
        {notify === "on" && <p className="mt-4 text-sm text-stone-700">🔔 Done. We&apos;ll notify this device when we reply.</p>}
        {notify === "failed" && <p className="mt-4 text-sm text-red-600">Notifications couldn&apos;t be turned on. You&apos;ll still get our reply by email.</p>}
      </div>
    );

  return (
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate={false}>
      <div className="sm:col-span-2 flex flex-wrap gap-4 text-sm text-stone-700" role="radiogroup" aria-label="What would you like?">
        <label className="flex items-center gap-2"><input type="radio" name="intent" value="project" defaultChecked={initialIntent === "project"} /> Discuss a project</label>
        <label className="flex items-center gap-2"><input type="radio" name="intent" value="quote" defaultChecked={initialIntent === "quote"} /> Request a customised quotation (USD by default)</label>
      </div>
      <div><label className={L} htmlFor="name">Full name *</label><input id="name" name="name" required maxLength={120} className={F} autoComplete="name" />{fieldErrors.name && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.name}</p>}</div>
      <div><label className={L} htmlFor="email">Business email *</label><input id="email" name="email" type="email" required className={F} autoComplete="email" />{fieldErrors.email && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.email}</p>}</div>
      <div><label className={L} htmlFor="company">Company</label><input id="company" name="company" maxLength={160} className={F} autoComplete="organization" /></div>
      <div>
        <label className={L} htmlFor="country">Country *</label>
        <select id="country" name="country" required className={F} value={country} onChange={(e) => { setCountry(e.target.value); setPhoneCountry(e.target.value); }} autoComplete="country">
          <option value="" disabled>Select your country…</option>
          {ORDERED.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>{fieldErrors.country && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.country}</p>}
      </div>
      <div className="sm:col-span-2">
        <label className={L} htmlFor="phone">Phone (with country code)</label>
        <div className="flex gap-2">
          <select aria-label="Country dial code" className={`${F} !w-36 shrink-0`} value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)}>
            <option value="">Code…</option>
            {ORDERED.map(([c, , d]) => <option key={c} value={c}>{c} +{d}</option>)}
          </select>
          <input id="phone" name="phone" type="tel" inputMode="tel" maxLength={30} className={F} autoComplete="tel-national" placeholder={phoneCountry ? `+${DIAL[phoneCountry]} …` : "Choose a code, or type +<country code> …"} />
        </div>{fieldErrors.phone && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.phone}</p>}
        <p className="mt-1 text-xs text-stone-500">Optional unless you prefer a call or WhatsApp. Checked against the selected country&apos;s numbering plan.</p>
      </div>
      <div className="sm:col-span-2">
        <label className={L} htmlFor="service">Service required *</label>
        <select id="service" name="service" required className={F} defaultValue={initialService}>
          <option value="" disabled>Select…</option>
          {SERVICE_OPTIONS.map((o) => <option key={o.value}>{o.value}</option>)}
        </select>{fieldErrors.service && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.service}</p>}
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div><label className={L} htmlFor="budget">Estimated budget *</label><select id="budget" name="budget" required className={F} defaultValue="" onInvalid={(e) => e.currentTarget.setCustomValidity("Please select a budget")} onChange={(e) => e.currentTarget.setCustomValidity("")} aria-invalid={!!fieldErrors.budget}><option value="" disabled>Select a budget…</option><option>{BUDGET_DISCUSS}</option>{BUDGETS.map((b) => <option key={b}>{b}</option>)}</select>{fieldErrors.budget && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.budget}</p>}</div>
        <div><label className={L} htmlFor="currency">Currency</label><select id="currency" name="currency" className={F} defaultValue="USD">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div><label className={L} htmlFor="timeline">Expected timeline</label><select id="timeline" name="timeline" className={F} defaultValue=""><option value="">Flexible</option>{TIMELINES.map((b) => <option key={b}>{b}</option>)}</select></div>
      <div className="sm:col-span-2"><label className={L} htmlFor="preferredContact">Preferred communication method</label><select id="preferredContact" name="preferredContact" className={F} defaultValue="email">{CONTACT_METHODS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
      <div className="sm:col-span-2"><label className={L} htmlFor="message">Project description *</label><textarea id="message" name="message" required minLength={10} maxLength={5000} rows={6} defaultValue={defaultMessage} className={F} placeholder="What are you trying to build or automate? What systems are involved?" />{fieldErrors.message && <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.message}</p>}</div>
      <div className="sm:col-span-2">
        <FileDrop light label="Attachments (optional)" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple max={3} endpoint="/api/upload-sign" value={files} onChange={setFiles} hint="JPG, PNG, WEBP or PDF · up to 15 MB each" />
      </div>
      <input type="hidden" name="division" value={initialDivision} />
      <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="sm:col-span-2">
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <p className="w-full text-xs text-stone-500">By sending this you agree to our <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>
        <button className="rounded-full bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send inquiry"}</button>
      </div>
    </form>
  );
}
