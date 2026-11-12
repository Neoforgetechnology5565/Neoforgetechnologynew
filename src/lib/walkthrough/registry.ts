/** Discovers the demo registry from the site's own catalogues, so a newly added demo appears in the manager without edits here. */
import { SUITE } from "@/lib/bim/suite";
import { CV_DEMOS } from "@/lib/cv-demos";
import { DEMOS } from "@/lib/demos";
import { ERP_COVERED } from "@/lib/erp-demos";
import type { DemoEntry } from "./schema";

const FAMILY_CV: Record<string, string> = {
  "ai-cctv-intelligence-security-analytics": "cctv", "ai-factory-workforce-ppe-compliance": "ppe", "vehicle-detection-tracking-counting": "vehicle", "ai-roof-measurement": "roof", "ai-medical-imaging-analysis": "med", "sports-video-intelligence": "sports",
  "ai-visual-inspection": "defects", "ai-animal-detection-smart-farming": "farm", "ai-human-activity-fall-aggression-detection": "activity", "ai-document-intelligence-ocr": "documents", "ai-shoe-foot-measurement-fitting": "foot",
  "ai-restaurant-employee-monitoring": "vi", "ai-table-tennis-video-intelligence": "vi", "ai-basketball-video-intelligence": "vi",
};
export function listDemos(): DemoEntry[] {
  const out: DemoEntry[] = [];
  for (const d of CV_DEMOS) if (d.status === "live") out.push({ key: `cv-${d.slug}`, no: d.no, title: d.title, group: "Computer Vision & AI", family: FAMILY_CV[d.slug] ?? "ml", appPath: `/ai-demos/${d.slug}/app`, summary: d.problem, features: d.features, honest: d.honest });
  for (const d of ERP_COVERED) out.push({ key: `erp-${d.slug}`, no: d.no, title: d.title, group: "CRM / HRM / ERP", family: "erp", appPath: `/erp-demos/${d.slug}/app`, summary: d.problem, features: d.features, honest: d.simulated });
  for (const d of DEMOS) if (d.status === "live") out.push({ key: `cad-${d.slug}`, no: d.no, title: d.title, group: "CAD / BIM", family: "cad", appPath: `/demos/${d.slug}/app`, summary: d.problem, features: d.features, honest: "Runs on clearly labelled sample data; no connection to the desktop CAD/BIM product." });
  for (const d of SUITE) if (d.status === "live") out.push({ key: `suite-${d.slug}`, no: d.no, title: d.title, group: "CAD / BIM", family: d.key === "geometry" ? "geometry" : "suite", appPath: `/cad-bim-suite/${d.slug}/app`, summary: d.short, features: d.features, honest: d.statusNote });
  return out;
}
export const demoByKey = (k: string) => listDemos().find((d) => d.key === k);
