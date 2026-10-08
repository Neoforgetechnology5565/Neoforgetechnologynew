import type { MetadataRoute } from "next";
import { getCategories, getPublishedProjects } from "@/lib/db";
import { DIVISIONS } from "@/lib/divisions";
import { projectHref } from "@/lib/paths";
import { siteUrl } from "@/lib/utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [projects, cats] = await Promise.all([getPublishedProjects(), getCategories()]);
  return [
    ...["", "/portfolio", "/about", "/contact", "/technology", "/live-chat"].map((p) => ({ url: `${base}${p}` })),
    ...DIVISIONS.flatMap((d) => [{ url: `${base}/${d.slug}` }, { url: `${base}/portfolio/${d.slug}` }]),
    ...cats.map((c) => ({ url: `${base}/${c.division}/${c.slug}` })),
    ...projects.map((p) => ({ url: `${base}${projectHref(p)}`, lastModified: new Date(p.updatedAt) })),
  ];
}
