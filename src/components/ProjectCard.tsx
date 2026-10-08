import Link from "next/link";
import { DIVISION_MAP } from "@/lib/divisions";
import { projectHref } from "@/lib/paths";
import type { Project } from "@/lib/types";
import { CldImg } from "./Media";
import { DivisionGlyph } from "./Visuals";

export default function ProjectCard({ p, priority }: { p: Project; priority?: boolean }) {
  const d = DIVISION_MAP[p.division];
  return (
    <Link href={projectHref(p)} className="group block overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {p.cover ? (
          <CldImg media={p.cover} alt={`${p.title} — ${d?.short ?? ""} project`} priority={priority} sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" widths={[400, 640, 900]} className="transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-300"><DivisionGlyph slug={p.division} /></div>
        )}
        {p.featured && <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">Featured</span>}
        {p.documents.length > 0 && <span className="absolute right-3 top-3 rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-white">PDF</span>}
      </div>
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{p.categoryName || d?.short}</p>
        <h3 className="mt-1 font-display text-lg font-semibold text-stone-900">{p.title}</h3>
        {p.summary && <p className="mt-1.5 line-clamp-2 text-sm text-stone-500">{p.summary}</p>}
        {p.technologies.length > 0 && <p className="mt-3 truncate text-xs text-stone-400">{p.technologies.slice(0, 4).join(" · ")}</p>}
      </div>
    </Link>
  );
}
