import { SectionHead } from "@/components/Blocks";
import type { Review } from "@/lib/types";

/** Client reviews entered in Admin → Reviews. Renders nothing when there are none. */
export default function Testimonials({ reviews, title = "What clients say" }: { reviews: Review[]; title?: string }) {
  if (!reviews.length) return null;
  return (
    <section className="bg-stone-50 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Reviews" title={title} />
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reviews.slice(0, 6).map((r) => (
            <figure key={r.id} className="rounded-2xl border border-stone-200 bg-white p-6">
              {r.rating > 0 && <p className="text-blue-600" aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}<span className="text-stone-300">{"★".repeat(5 - r.rating)}</span></p>}
              <blockquote className="mt-3 text-stone-700">“{r.quote}”</blockquote>
              <figcaption className="mt-4 text-sm"><span className="font-semibold text-stone-900">{r.name}</span>{r.role && <span className="text-stone-500"> · {r.role}</span>}
                {r.source && (r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="ml-2 text-blue-700 hover:underline">via {r.source}</a> : <span className="ml-2 text-stone-400">via {r.source}</span>)}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
