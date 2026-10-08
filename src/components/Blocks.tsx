import Link from "next/link";
import type { ReactNode } from "react";
import type { Division } from "@/lib/divisions";
import type { Faq } from "@/lib/types";

export const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function SectionHead({ eyebrow, title, children, dark, center }: { eyebrow: string; title: string; children?: ReactNode; dark?: boolean; center?: boolean }) {
  return (
    <div className={`max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${dark ? "text-blue-400" : "text-blue-600"}`}>{eyebrow}</p>
      <h2 className={`mt-3 font-display text-3xl font-semibold sm:text-4xl ${dark ? "text-white" : "text-stone-900"}`}>{title}</h2>
      {children && <p className={`mt-4 text-base leading-relaxed ${dark ? "text-slate-300" : "text-stone-500"}`}>{children}</p>}
    </div>
  );
}

/** Capability groups as rounded spec cards. */
export function CapabilityGroups({ division }: { division: Division }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {division.groups.map((g) => (
        <section key={g.title} id={anchor(g.title)} className="scroll-mt-24 rounded-2xl border border-stone-200 bg-white p-7">
          <h3 className="flex items-baseline justify-between font-display text-xl font-semibold text-stone-900">{g.title}<span className="text-xs font-medium text-blue-600">{g.items.length}</span></h3>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {g.items.map((i) => <li key={i} className="rounded-full bg-stone-100 px-2.5 py-1 text-[12px] font-medium text-stone-600">{i}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Chips({ items, dark }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((t) => <li key={t} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${dark ? "border-slate-700 text-slate-300" : "border-stone-200 bg-white text-stone-700"}`}>{t}</li>)}
    </ul>
  );
}

export function CtaBand({ title = "Have a similar project? Let's talk.", sub = "Tell us about the workflow, the data and the systems involved. We'll respond with an honest view of scope and approach.", division }: { title?: string; sub?: string; division?: string }) {
  return (
    <section className="bg-slate-950 py-24 text-white">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h2>
        <p className="mt-4 text-slate-300">{sub}</p>
        <Link href={`/contact${division ? `?division=${division}` : ""}`} className="mt-8 inline-block rounded-full bg-blue-500 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-400">Start a Project</Link>
      </div>
    </section>
  );
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  if (!faqs.length) return null;
  return (
    <div className="divide-y divide-stone-200 border-y border-stone-200">
      {faqs.map((f) => (
        <details key={f.id} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-stone-900">
            {f.question}<span className="text-blue-600 group-open:hidden">+</span><span className="hidden text-blue-600 group-open:inline">−</span>
          </summary>
          <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-stone-500">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
