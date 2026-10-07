import type { MetadataRoute } from "next";
import { getPublishedProjects } from "@/lib/db";
import { DIVISIONS } from "@/lib/divisions";
import { siteUrl } from "@/lib/utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const projects = await getPublishedProjects();
  return [
    ...["", "/portfolio", "/about", "/contact", "/technology"].map((p) => ({ url: `${base}${p}` })),
    ...DIVISIONS.flatMap((d) => [{ url: `${base}/${d.slug}` }, { url: `${base}/portfolio/${d.slug}` }]),
    ...projects.map((p) => ({ url: `${base}/portfolio/${p.division}/${p.slug}`, lastModified: new Date(p.updatedAt) })),
  ];
}
