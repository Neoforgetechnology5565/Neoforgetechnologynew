import Link from "next/link";
import { DIVISION_MAP } from "@/lib/divisions";
import type { Project } from "@/lib/types";
import { CldImg } from "./Media";
import { DivisionGlyph } from "./Visuals";

export default function ProjectCard({ p, light }: { p: Project; light?: boolean }) {
  const d = DIVISION_MAP[p.division];
  return (
    <Link href={`/portfolio/${p.division}/${p.slug}`} className={`group block border transition-colors hover:border-forge ${light ? "border-ink-950/15 bg-white text-ink-950" : "border-paper/15 bg-ink-900"}`}>
      <div className="relative aspect-[16/10] overflow-hidden bg-ink-800">
        {p.cover ? (
          <CldImg media={p.cover} alt={`${p.title} — ${d?.short ?? ""} project`} sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" widths={[400, 640, 900]} className="transition-transform duration-700 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-paper/30 grid-bg"><DivisionGlyph slug={p.division} /></div>
        )}
        {p.featured && <span className="absolute left-3 top-3 bg-forge px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-950">Featured</span>}
      </div>
      <div className="p-5">
        <p className="font-mono text-[11px] uppercase tracking-wider text-forge">{d?.short}{p.categoryName ? ` · ${p.categoryName}` : ""}</p>
        <h3 className="mt-2 text-lg font-semibold leading-snug">{p.title}</h3>
        {p.summary && <p className={`mt-2 line-clamp-2 text-sm ${light ? "text-ink-950/65" : "text-paper/60"}`}>{p.summary}</p>}
        {p.technologies.length > 0 && (
          <p className={`mt-3 truncate font-mono text-[11px] ${light ? "text-ink-950/50" : "text-paper/45"}`}>{p.technologies.slice(0, 4).join(" · ")}</p>
        )}
      </div>
    </Link>
  );
}
