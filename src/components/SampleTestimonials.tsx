"use client";
import { useState } from "react";
import type { SampleTestimonial } from "@/lib/sample-testimonials";

const PAGE = 6;

/** Illustrative testimonials. Always disclosed as such: no platform, link or star rating, and no average is computed. */
export default function SampleTestimonials({ items }: { items: SampleTestimonial[] }) {
  const [shown, setShown] = useState(PAGE);
  if (!items.length) return null;
  const visible = items.slice(0, shown);
  return (
    <section aria-labelledby="clients-say" className="bg-white py-20" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="inline-block rounded-full bg-[#E9F7EF] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#11643A]">Illustrative Testimonials</p>
        <h2 id="clients-say" className="mt-3 text-3xl font-semibold text-stone-900 sm:text-4xl">What Our Clients Say</h2>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-stone-600">Explore examples of the feedback and experiences associated with our software, AI, engineering, and digital solutions.</p>
        <p role="note" className="mt-4 max-w-3xl rounded-lg border border-[#16834A]/30 bg-[#E9F7EF] p-3 text-[13px] leading-relaxed text-[#11643A]">These testimonials are illustrative examples of the types of projects and feedback associated with our services. They are not independently verified customer reviews.</p>
        <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-live="polite">
          {visible.map((t) => (
            <li key={t.id}>
              <figure className="flex h-full flex-col rounded-2xl border border-stone-200 border-t-4 border-t-[#16834A] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <span aria-hidden className="text-4xl leading-none text-[#16834A]">“</span>
                <blockquote className="-mt-2 flex-1 text-[15px] leading-relaxed text-stone-700">{t.quote}</blockquote>
                <figcaption className="mt-5 border-t border-stone-100 pt-4 text-[15px]"><span className="font-semibold text-stone-900">{t.name}</span><span className="block text-[13px] text-stone-500">{t.role}</span><span className="mt-2 inline-block rounded bg-[#E9F7EF] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#11643A]">Illustrative example</span></figcaption>
              </figure>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          {shown < items.length && <button type="button" onClick={() => setShown((n) => Math.min(n + PAGE, items.length))} className="rounded-lg bg-[#16834A] px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#11643A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16834A] focus-visible:ring-offset-2">Load more testimonials</button>}
          <p className="text-[13px] text-stone-500" data-testid="sample-count">Showing {visible.length} of {items.length}</p>
        </div>
      </div>
    </section>
  );
}
