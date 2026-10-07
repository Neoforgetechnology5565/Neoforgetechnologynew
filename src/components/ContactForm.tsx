"use client";
import { useState } from "react";
import { DIVISIONS, PROJECT_TYPES } from "@/lib/divisions";
import type { MediaRef } from "@/lib/types";
import FileDrop from "./FileDrop";

const BUDGETS = ["Under $5k", "$5k – $15k", "$15k – $50k", "$50k – $150k", "$150k+", "Not sure yet"];
const TIMELINES = ["ASAP", "1–3 months", "3–6 months", "6+ months", "Flexible"];

export default function ContactForm({ initialDivision = "" }: { initialDivision?: string }) {
  const [files, setFiles] = useState<MediaRef[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setState("sending");
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(f.entries());
    const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, files }) });
    if (res.ok) { setState("done"); return; }
    const j = await res.json().catch(() => ({}));
    setError(j.issues ? "Please check the highlighted fields — name, a valid email, and a description of at least 10 characters are required." : j.error || "Something went wrong. Please try again.");
    setState("idle");
  }

  if (state === "done")
    return (
      <div className="border border-signal/40 bg-signal/5 p-8" role="status">
        <p className="eyebrow !text-signal">Received</p>
        <h3 className="mt-2 text-2xl font-semibold">Thanks — your inquiry is in.</h3>
        <p className="mt-2 text-paper/70">An engineer will review the details and reply by email.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate={false}>
      <div><label className="label" htmlFor="name">Name *</label><input id="name" name="name" required maxLength={120} className="field" autoComplete="name" /></div>
      <div><label className="label" htmlFor="email">Email *</label><input id="email" name="email" type="email" required className="field" autoComplete="email" /></div>
      <div><label className="label" htmlFor="company">Company</label><input id="company" name="company" maxLength={160} className="field" autoComplete="organization" /></div>
      <div>
        <label className="label" htmlFor="projectType">Project type *</label>
        <select id="projectType" name="projectType" required className="field" defaultValue="">
          <option value="" disabled>Select…</option>
          {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="division">Technology division</label>
        <select id="division" name="division" className="field" defaultValue={initialDivision}>
          <option value="">Not sure</option>
          {DIVISIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor="budget">Budget</label><select id="budget" name="budget" className="field" defaultValue=""><option value="">Prefer to discuss</option>{BUDGETS.map((b) => <option key={b}>{b}</option>)}</select></div>
      <div><label className="label" htmlFor="timeline">Timeline</label><select id="timeline" name="timeline" className="field" defaultValue=""><option value="">Flexible</option>{TIMELINES.map((b) => <option key={b}>{b}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="message">Project description *</label><textarea id="message" name="message" required minLength={10} maxLength={5000} rows={6} className="field" placeholder="What are you trying to build or automate? What systems are involved?" /></div>
      <div className="sm:col-span-2">
        <FileDrop label="Attachments (optional)" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple max={3} endpoint="/api/upload-sign" value={files} onChange={setFiles} hint="JPG, PNG, WEBP or PDF · up to 15 MB each" />
      </div>
      <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="sm:col-span-2">
        {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full sm:w-auto" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send inquiry"}</button>
      </div>
    </form>
  );
}
