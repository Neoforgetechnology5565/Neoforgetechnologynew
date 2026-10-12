import Link from "next/link";
import type { Metadata } from "next";
import { CtaBand } from "@/components/Blocks";
import JsonLd from "@/components/JsonLd";
import PostCard from "@/components/PostCard";
import { getPublishedPosts } from "@/lib/db";
import { breadcrumbLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Blog: AI, Automation & BIM Insights",
  description: "Practical articles from Neo Forge Technology on computer vision, machine learning, CRM/HRM/ERP automation, and Revit, AutoCAD and SketchUp plugin development.",
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/feed.xml" } },
};

export default async function Blog() {
  const posts = (await getPublishedPosts()).slice(0, 60);
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }])} />
      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm text-slate-400"><Link href="/" className="hover:text-blue-400">Home</Link><span>/</span><span className="text-slate-200">Blog</span></div>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">Insights from the engineering team</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Practical notes on computer vision, AI automation, business software and CAD/BIM plugin development.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        {posts.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{posts.map((p, i) => <PostCard key={p.id} p={p} priority={i < 3} />)}</div>
          : <div className="rounded-2xl border border-dashed border-stone-300 p-16 text-center"><p className="font-display text-xl text-stone-400">Articles are coming soon.</p></div>}
      </section>
      <CtaBand title="Have a project in mind?" />
    </>
  );
}
