import "server-only";
import { SUITE } from "@/lib/bim/suite";
import { CV_DEMOS } from "@/lib/cv-demos";
import { DEMOS } from "@/lib/demos";
import { ERP_COVERED } from "@/lib/erp-demos";
import { SERVICES } from "@/lib/services";
import type { Project } from "@/lib/types";
import type { Titles } from "./aggregate";

/** Readable names for the keys the dashboard shows, from the site's own catalogues. */
export function makeTitles(projects: Project[]): Titles {
  const demos = new Map<string, string>();
  for (const d of CV_DEMOS) demos.set(`ai-demos/${d.slug}`, d.title);
  for (const d of ERP_COVERED) demos.set(`erp-demos/${d.slug}`, d.title);
  for (const d of DEMOS) demos.set(`demos/${d.slug}`, d.title);
  for (const d of SUITE) demos.set(`cad-bim-suite/${d.slug}`, d.title);
  return {
    service: (slug) => SERVICES.find((s) => s.slug === slug)?.name ?? slug.replace(/-/g, " "),
    demo: (key) => demos.get(key) ?? key,
    project: (key) => { const [division, slug] = key.split("~").length > 1 ? key.split("~") : key.split("/"); return projects.find((p) => p.slug === slug && (p.division === division || !division))?.title ?? key.replace(/[~/]/g, " / "); },
  };
}
