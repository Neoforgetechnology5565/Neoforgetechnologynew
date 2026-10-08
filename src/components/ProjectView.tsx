/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { Chips, CtaBand, SectionHead } from "@/components/Blocks";
import Gallery from "@/components/Gallery";
import { CldImg } from "@/components/Media";
import ProjectCard from "@/components/ProjectCard";
import { Pipeline } from "@/components/Visuals";
import { img, isPdf, pdfThumb, videoPoster } from "@/lib/cloudinary";
import { resolveVideos } from "@/lib/video-server";
import VideoLinks from "@/components/VideoLinks";
import { getRelated } from "@/lib/db";
import { DIVISION_MAP } from "@/lib/divisions";
import { projectHref } from "@/lib/paths";
import type { Project } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

export function projectMetadata(p: Project): Metadata {
  const desc = p.summary || p.description.slice(0, 160);
  return {
    title: p.title,
    description: desc,
    alternates: { canonical: projectHref(p) },
    openGraph: { title: p.title, description: desc, type: "article", images: p.cover ? [{ url: img(p.cover, { w: 1200, h: 630 }) }] : undefined },
  };
}

const Prose = ({ text }: { text: string }) => <div className="space-y-4 leading-relaxed text-stone-600">{text.split(/\n{2,}/).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</div>;
const Label = ({ children }: { children: React.ReactNode }) => <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">{children}</p>;

export default async function ProjectView({ p }: { p: Project }) {
  const d = DIVISION_MAP[p.division];
  const related = await getRelated(p);
  const videos = await resolveVideos(p.videoLinks);
  const steps = p.pipeline.length ? p.pipeline : d.pipeline;
  const jsonLd = { "@context": "https://schema.org", "@type": "CreativeWork", name: p.title, description: p.summary, creator: { "@type": "Organization", name: "Neo Forge Technology" }, dateModified: new Date(p.updatedAt).toISOString() };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <Link href="/" className="hover:text-blue-400">Home</Link><span>/</span>
            <Link href={`/${p.division}`} className="hover:text-blue-400">{d.short}</Link>
            {p.categorySlug && <><span>/</span><Link href={`/${p.division}/${p.categorySlug}`} className="hover:text-blue-400">{p.categoryName}</Link></>}
          </div>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-tight sm:text-5xl">{p.title}</h1>
          {p.summary && <p className="mt-5 max-w-2xl text-lg text-slate-300">{p.summary}</p>}
        </div>
      </section>
      {p.cover && (
        <div className="mx-auto -mt-px max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"><CldImg media={p.cover} alt={`${p.title} — main visual`} priority sizes="(min-width:1280px) 1200px, 100vw" widths={[640, 1000, 1400, 2000]} ratio={16 / 9} /></div>
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {(p.description || p.technologies.length > 0) && (
          <section className="grid gap-10 lg:grid-cols-[2fr_1fr]">
            <div><Label>Overview</Label><div className="mt-4">{p.description && <Prose text={p.description} />}</div></div>
            <aside className="space-y-6 rounded-2xl bg-stone-50 p-6">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Division</p><Link href={`/${p.division}`} className="mt-1 block font-medium text-stone-900 hover:text-blue-600">{d.name}</Link></div>
              {p.categoryName && <div><p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Category</p><p className="mt-1 font-medium text-stone-900">{p.categoryName}</p></div>}
              {p.technologies.length > 0 && <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Technology</p><Chips items={p.technologies} /></div>}
            </aside>
          </section>
        )}

        <section aria-label="Solution flow"><Pipeline steps={steps} /></section>

        {(p.challenge || p.solution) && (
          <section className="grid gap-6 md:grid-cols-2">
            {p.challenge && <div className="rounded-2xl border border-stone-200 p-7 sm:p-8"><Label>Challenge</Label><div className="mt-4"><Prose text={p.challenge} /></div></div>}
            {p.solution && <div className="rounded-2xl border border-stone-200 p-7 sm:p-8"><Label>Solution</Label><div className="mt-4"><Prose text={p.solution} /></div></div>}
          </section>
        )}

        {p.features.length > 0 && (
          <section>
            <SectionHead eyebrow="Features" title="What it does" />
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {p.features.map((f, i) => <li key={f + i} className="rounded-2xl border border-stone-200 p-5 text-sm text-stone-700"><span className="mb-2 block text-xs font-semibold text-blue-600">{String(i + 1).padStart(2, "0")}</span>{f}</li>)}
            </ul>
          </section>
        )}

        {(p.gallery.length > 0 || p.video || videos.length > 0) && (
          <section>
            <SectionHead eyebrow="Visuals" title="Screenshots, diagrams & video" />
            {p.video && (
              <div className="mt-8 aspect-video overflow-hidden rounded-2xl bg-black">
                <video controls preload="none" poster={videoPoster(p.video)} className="h-full w-full"><source src={p.video.url} /></video>
              </div>
            )}
            {videos.length > 0 && <div className="mt-8"><VideoLinks items={videos} /></div>}
            {p.gallery.length > 0 && <div className="mt-6"><Gallery items={p.gallery} title={p.title} /></div>}
          </section>
        )}

        {p.results && <section className="rounded-2xl bg-blue-50 p-7 sm:p-10"><Label>Results</Label><div className="mt-4"><Prose text={p.results} /></div></section>}

        {(p.documents.length > 0 || p.files.length > 0) && (
          <section>
            <SectionHead eyebrow="Documents" title="Downloads" />
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[...p.documents, ...p.files].map((m) => (
                <li key={m.publicId}>
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-1 hover:shadow-lg">
                    {isPdf(m) && pdfThumb(m) ? <img src={pdfThumb(m)} alt={`Preview of ${m.name || "document"}`} loading="lazy" className="aspect-[3/4] w-full bg-white object-cover object-top" /> : <div className="flex aspect-[3/4] items-center justify-center bg-stone-100 text-sm font-semibold uppercase text-stone-400">{m.format || "file"}</div>}
                    <div className="p-3 text-sm"><p className="truncate font-medium text-stone-900">{m.name || m.publicId.split("/").pop()}</p><p className="text-xs text-stone-400">{(m.format || "").toUpperCase()} {formatBytes(m.bytes)} · Open ↗</p></div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {related.length > 0 && (
          <section>
            <SectionHead eyebrow="Related" title={`More ${d.short} projects`} />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((r) => <ProjectCard key={r.id} p={r} />)}</div>
          </section>
        )}
      </div>
      <CtaBand division={p.division} />
    </>
  );
}
