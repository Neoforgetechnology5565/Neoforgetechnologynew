import type { MetadataRoute } from "next";
import { getCategories, getPublishedPosts, getPublishedProjects } from "@/lib/db";
import { DIVISIONS } from "@/lib/divisions";
import { projectHref } from "@/lib/paths";
import { SERVICES } from "@/lib/services";
import { siteUrl } from "@/lib/utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [projects, cats, posts] = await Promise.all([getPublishedProjects(), getCategories(), getPublishedPosts()]);
  return [
    ...["", "/portfolio", "/about", "/contact", "/technology", "/live-chat", "/blog", "/privacy", "/terms", "/services"].map((p) => ({ url: `${base}${p}` })),
    ...SERVICES.map((s) => ({ url: `${base}/services/${s.slug}` })),
    ...DIVISIONS.flatMap((d) => [{ url: `${base}/${d.slug}` }, { url: `${base}/portfolio/${d.slug}` }]),
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: new Date(p.updatedAt || p.publishedAt) })),
    ...cats.map((c) => ({ url: `${base}/${c.division}/${c.slug}` })),
    ...projects.map((p) => ({ url: `${base}${projectHref(p)}`, lastModified: new Date(p.updatedAt) })),
  ];
}
