import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/Blocks";
import JsonLd from "@/components/JsonLd";
import { CldImg } from "@/components/Media";
import PostCard from "@/components/PostCard";
import VideoLinks from "@/components/VideoLinks";
import { img } from "@/lib/cloudinary";
import { getPost, getRelatedPosts } from "@/lib/db";
import { DIVISION_MAP } from "@/lib/divisions";
import { articleLd, breadcrumbLd } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import { headingsOf, Markdown, readingMinutes } from "@/lib/markdown";
import { resolveVideos } from "@/lib/video-server";
import { formatDate } from "@/lib/utils";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await getPost((await params).slug);
  if (!p) return {};
  const description = p.seoDescription || p.excerpt || p.content.replace(/[#*_`>\[\]()!-]/g, "").slice(0, 155);
  const title = p.seoTitle || p.title;
  return {
    title, description,
    alternates: { canonical: `/blog/${p.slug}` },
    openGraph: { type: "article", title, description, url: `/blog/${p.slug}`, publishedTime: p.publishedAt ? new Date(p.publishedAt).toISOString() : undefined, modifiedTime: new Date(p.updatedAt).toISOString(), authors: [p.author], tags: p.tags, images: p.cover ? [{ url: img(p.cover, { w: 1200, h: 630 }), width: 1200, height: 630, alt: p.coverAlt || p.title }] : [DEFAULT_OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [p.cover ? img(p.cover, { w: 1200, h: 630 }) : DEFAULT_OG_IMAGE.url] },
  };
}

export default async function Article({ params }: Params) {
  const p = await getPost((await params).slug);
  if (!p) notFound();
  const [related, videos] = await Promise.all([getRelatedPosts(p), resolveVideos(p.videoLinks)]);
  const toc = headingsOf(p.content).filter((h) => h.level === 2);
  const d = p.division ? DIVISION_MAP[p.division] : null;

  return (
    <>
      <JsonLd data={[articleLd(p), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }, { name: p.title, path: `/blog/${p.slug}` }])]} />
      <article>
        <header className="bg-slate-950 text-white">
          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400"><Link href="/" className="hover:text-blue-400">Home</Link><span>/</span><Link href="/blog" className="hover:text-blue-400">Blog</Link></div>
            <h1 className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-5xl">{p.title}</h1>
            {p.excerpt && <p className="mt-5 text-lg text-slate-300">{p.excerpt}</p>}
            <p className="mt-6 text-sm text-slate-400">By {p.author}{p.publishedAt ? ` · ${formatDate(p.publishedAt)}` : ""} · {readingMinutes(p.content)} min read</p>
          </div>
        </header>
        {p.cover && <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6 lg:px-8"><div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"><CldImg media={p.cover} alt={p.coverAlt || p.title} priority sizes="(min-width:1024px) 1000px, 100vw" widths={[640, 1000, 1400]} ratio={16 / 9} /></div></div>}

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          {toc.length >= 3 && (
            <nav aria-label="On this page" className="mb-10 rounded-2xl bg-stone-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">On this page</p>
              <ol className="mt-3 space-y-1.5 text-sm">{toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-stone-700 hover:text-blue-600">{h.text}</a></li>)}</ol>
            </nav>
          )}
          <div className="text-lg"><Markdown source={p.content} /></div>
          {videos.length > 0 && <div className="mt-10"><VideoLinks items={videos} /></div>}

          {p.tags.length > 0 && <ul className="mt-10 flex flex-wrap gap-2">{p.tags.map((t) => <li key={t} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">#{t}</li>)}</ul>}

          {d && (
            <aside className="mt-10 rounded-2xl border border-blue-200 bg-blue-50/50 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Related service</p>
              <h2 className="mt-2 font-display text-xl font-semibold text-stone-900">{d.name}</h2>
              <p className="mt-1 text-sm text-stone-600">{d.tagline}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium"><Link href={`/${d.slug}`} className="text-blue-700 hover:underline">Explore {d.short} →</Link><Link href={`/portfolio/${d.slug}`} className="text-blue-700 hover:underline">See our work →</Link></div>
            </aside>
          )}
        </div>
      </article>
      {related.length > 0 && (
        <section className="bg-stone-50 py-16"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">Keep reading</p><h2 className="mt-3 font-display text-3xl font-semibold">Related articles</h2><div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((r) => <PostCard key={r.id} p={r} />)}</div></div></section>
      )}
      <CtaBand division={p.division || undefined} />
    </>
  );
}
