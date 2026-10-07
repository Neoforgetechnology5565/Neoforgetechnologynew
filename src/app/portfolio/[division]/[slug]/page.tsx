/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chips, CtaBand, SectionHead } from "@/components/Blocks";
import Gallery from "@/components/Gallery";
import { CldImg } from "@/components/Media";
import ProjectCard from "@/components/ProjectCard";
import { Pipeline } from "@/components/Visuals";
import { embedUrl, img, isPdf, pdfThumb, videoPoster } from "@/lib/cloudinary";
import { getProject, getRelated } from "@/lib/db";
import { DIVISION_MAP } from "@/lib/divisions";
import { formatBytes } from "@/lib/utils";

type Params = { params: Promise<{ division: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { division, slug } = await params;
  const p = await getProject(division, slug);
  if (!p) return {};
  const desc = p.summary || p.description.slice(0, 160);
  return {
    title: p.title,
    description: desc,
    alternates: { canonical: `/portfolio/${division}/${slug}` },
    openGraph: { title: p.title, description: desc, type: "article", images: p.cover ? [{ url: img(p.cover, { w: 1200, h: 630 }) }] : undefined },
  };
}

const Prose = ({ text }: { text: string }) => <div className="space-y-4 text-base leading-relaxed text-paper/75">{text.split(/\n{2,}/).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</div>;

export default async function ProjectPage({ params }: Params) {
  const { division, slug } = await params;
  const p = await getProject(division, slug);
  if (!p) notFound();
  const d = DIVISION_MAP[division];
  const related = await getRelated(p);
  const embed = embedUrl(p.videoUrl);
  const steps = p.pipeline.length ? p.pipeline : d.pipeline;
  const jsonLd = { "@context": "https://schema.org", "@type": "CreativeWork", name: p.title, description: p.summary, creator: { "@type": "Organization", name: "Neo Forge Technology" }, dateModified: new Date(p.updatedAt).toISOString() };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="border-b border-paper/10">
        <div className="container-x py-12 sm:py-16">
          <p className="eyebrow">
            <Link href="/portfolio" className="hover:underline">Portfolio</Link> / <Link href={`/portfolio/${division}`} className="hover:underline">{d.short}</Link>
            {p.categoryName && <> / {p.categoryName}</>}
          </p>
          <h1 className="h-display mt-4 max-w-4xl text-4xl sm:text-6xl">{p.title}</h1>
          {p.summary && <p className="mt-5 max-w-2xl text-lg text-paper/70">{p.summary}</p>}
        </div>
        {p.cover && <div className="container-x pb-12"><div className="overflow-hidden border border-paper/15 bg-ink-900"><CldImg media={p.cover} alt={`${p.title} — main visual`} priority sizes="(min-width:1280px) 1200px, 100vw" widths={[640, 1000, 1400, 2000]} ratio={16 / 9} /></div></div>}
      </section>

      <div className="container-x space-y-16 py-14 sm:space-y-24 sm:py-20">
        {(p.description || p.technologies.length > 0) && (
          <section className="grid gap-10 lg:grid-cols-[2fr_1fr]">
            <div><p className="eyebrow mb-3">Overview</p>{p.description && <Prose text={p.description} />}</div>
            <aside className="space-y-6 border-l border-paper/10 pl-6">
              <div><p className="label">Division</p><Link href={`/${division}`} className="hover:text-forge">{d.name}</Link></div>
              {p.categoryName && <div><p className="label">Category</p><p>{p.categoryName}</p></div>}
              {p.technologies.length > 0 && <div><p className="label">Technology</p><Chips items={p.technologies} /></div>}
            </aside>
          </section>
        )}

        <section aria-label="Solution flow"><Pipeline steps={steps} /></section>

        {(p.challenge || p.solution) && (
          <section className="grid gap-px border border-paper/15 bg-paper/15 md:grid-cols-2">
            {p.challenge && <div className="bg-ink-950 p-6 sm:p-8"><p className="eyebrow mb-3">Challenge</p><Prose text={p.challenge} /></div>}
            {p.solution && <div className="bg-ink-950 p-6 sm:p-8"><p className="eyebrow mb-3">Solution</p><Prose text={p.solution} /></div>}
          </section>
        )}

        {p.features.length > 0 && (
          <section>
            <SectionHead eyebrow="Features" title="What it does" />
            <ul className="mt-8 grid gap-px border border-paper/15 bg-paper/15 sm:grid-cols-2 lg:grid-cols-3">
              {p.features.map((f, i) => <li key={f + i} className="bg-ink-950 p-5 text-sm"><span className="mb-2 block font-mono text-[10px] text-forge">{String(i + 1).padStart(2, "0")}</span>{f}</li>)}
            </ul>
          </section>
        )}

        {(p.gallery.length > 0 || p.video || embed) && (
          <section>
            <SectionHead eyebrow="Visuals" title="Screenshots, diagrams & video" />
            {(p.video || embed) && (
              <div className="mt-8 aspect-video overflow-hidden border border-paper/15 bg-black">
                {p.video ? <video controls preload="none" poster={videoPoster(p.video)} className="h-full w-full"><source src={p.video.url} /></video>
                  : <iframe src={embed} title={`${p.title} video`} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" />}
              </div>
            )}
            {p.gallery.length > 0 && <div className="mt-6"><Gallery items={p.gallery} title={p.title} /></div>}
          </section>
        )}

        {p.results && (
          <section className="border border-forge/40 bg-forge/5 p-6 sm:p-10"><p className="eyebrow mb-3">Results</p><Prose text={p.results} /></section>
        )}

        {(p.documents.length > 0 || p.files.length > 0) && (
          <section>
            <SectionHead eyebrow="Documents" title="Downloads" />
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[...p.documents, ...p.files].map((m) => (
                <li key={m.publicId}>
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="group block border border-paper/15 bg-ink-900 transition-colors hover:border-forge">
                    {isPdf(m) && pdfThumb(m) ? <img src={pdfThumb(m)} alt={`Preview of ${m.name || "document"}`} loading="lazy" className="aspect-[3/4] w-full bg-white object-cover object-top" /> : <div className="flex aspect-[3/4] items-center justify-center font-mono text-sm uppercase text-paper/40 grid-bg">{m.format || "file"}</div>}
                    <div className="p-3 text-sm"><p className="truncate">{m.name || m.publicId.split("/").pop()}</p><p className="font-mono text-[11px] text-paper/50">{(m.format || "").toUpperCase()} {formatBytes(m.bytes)} · Open ↗</p></div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {related.length > 0 && (
          <section>
            <SectionHead eyebrow="Related" title={`More ${d.short} projects`} />
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{related.map((r) => <ProjectCard key={r.id} p={r} />)}</div>
          </section>
        )}
      </div>
      <CtaBand division={division} />
    </>
  );
}
