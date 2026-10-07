import Link from "next/link";
import type { ReactNode } from "react";
import type { Division } from "@/lib/divisions";
import type { Faq } from "@/lib/types";

export function SectionHead({ eyebrow, title, children, light }: { eyebrow: string; title: string; children?: ReactNode; light?: boolean }) {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className={`h-display mt-3 text-3xl sm:text-4xl lg:text-5xl ${light ? "text-ink-950" : ""}`}>{title}</h2>
      {children && <p className={`mt-4 text-base sm:text-lg ${light ? "text-ink-950/70" : "text-paper/65"}`}>{children}</p>}
    </div>
  );
}

export const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Capability groups rendered as engineered spec columns rather than logo walls. */
export function CapabilityGroups({ division, light }: { division: Division; light?: boolean }) {
  return (
    <div className={`grid gap-px border sm:grid-cols-2 lg:grid-cols-3 ${light ? "border-ink-950/15 bg-ink-950/15" : "border-paper/15 bg-paper/15"}`}>
      {division.groups.map((g) => (
        <section key={g.title} id={anchor(g.title)} className={`scroll-mt-24 p-6 ${light ? "bg-paper" : "bg-ink-950"}`}>
          <h3 className="flex items-baseline justify-between font-semibold">{g.title}<span className="font-mono text-[10px] text-forge">{String(g.items.length).padStart(2, "0")}</span></h3>
          <ul className={`mt-4 space-y-1.5 text-sm ${light ? "text-ink-950/75" : "text-paper/70"}`}>
            {g.items.map((i) => (
              <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-forge" />{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Chips({ items, light }: { items: string[]; light?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((t) => (
        <li key={t} className={`border px-3 py-1.5 font-mono text-xs ${light ? "border-ink-950/20" : "border-paper/20"}`}>{t}</li>
      ))}
    </ul>
  );
}

export function CtaBand({ title = "Have a similar project? Let's talk.", sub = "Tell us about the workflow, the data and the systems involved. We'll respond with an honest view of scope and approach.", division }: { title?: string; sub?: string; division?: string }) {
  return (
    <section className="bg-forge text-ink-950">
      <div className="container-x flex flex-col items-start justify-between gap-6 py-14 md:flex-row md:items-center">
        <div className="max-w-2xl">
          <h2 className="h-display text-3xl sm:text-4xl">{title}</h2>
          <p className="mt-3 text-ink-950/75">{sub}</p>
        </div>
        <Link href={`/contact${division ? `?division=${division}` : ""}`} className="btn-dark shrink-0">Start a Project →</Link>
      </div>
    </section>
  );
}

export function FaqList({ faqs, light }: { faqs: Faq[]; light?: boolean }) {
  if (!faqs.length) return null;
  return (
    <div className={`divide-y border-y ${light ? "divide-ink-950/15 border-ink-950/15" : "divide-paper/15 border-paper/15"}`}>
      {faqs.map((f) => (
        <details key={f.id} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
            {f.question}<span className="font-mono text-forge group-open:hidden">+</span><span className="hidden font-mono text-forge group-open:inline">−</span>
          </summary>
          <p className={`mt-3 max-w-3xl whitespace-pre-line text-sm ${light ? "text-ink-950/70" : "text-paper/65"}`}>{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
