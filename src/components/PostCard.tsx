import Link from "next/link";
import { DIVISION_MAP } from "@/lib/divisions";
import { readingMinutes } from "@/lib/markdown";
import type { Post } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { CldImg } from "./Media";

export default function PostCard({ p, priority }: { p: Post; priority?: boolean }) {
  const d = p.division ? DIVISION_MAP[p.division] : null;
  return (
    <Link href={`/blog/${p.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[16/9] overflow-hidden bg-stone-100">
        {p.cover ? <CldImg media={p.cover} alt={p.coverAlt || p.title} priority={priority} sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" widths={[400, 640, 900]} className="transition duration-500 group-hover:scale-105" />
          : <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-900 to-blue-900 p-6 text-center font-display text-lg text-white/80">{p.title}</div>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{d?.short ?? p.tags[0] ?? "Article"}</p>
        <h3 className="mt-1 font-display text-lg font-semibold leading-snug text-stone-900 group-hover:text-blue-700">{p.title}</h3>
        {p.excerpt && <p className="mt-2 line-clamp-3 text-sm text-stone-500">{p.excerpt}</p>}
        <p className="mt-auto pt-4 text-xs text-stone-400">{[p.publishedAt ? formatDate(p.publishedAt) : "", `${readingMinutes(p.content)} min read`].filter(Boolean).join(" · ")}</p>
      </div>
    </Link>
  );
}
