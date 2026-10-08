import type { Project } from "./types";

/** Canonical project URL: /division/sub-category/project (falls back to /portfolio/division/project when uncategorised). */
export const projectHref = (p: Pick<Project, "division" | "slug" | "categorySlug">) =>
  p.categorySlug ? `/${p.division}/${p.categorySlug}/${p.slug}` : `/portfolio/${p.division}/${p.slug}`;
