import { PAGES_A } from "./landing-pages-a";
import { PAGES_B } from "./landing-pages-b";
import type { LandingPage } from "./landing-types";

/** The eight SEO landing pages, in the order they appear on the Services page. */
const ORDER = ["computer-vision-development", "ai-development", "cctv-analytics", "anpr-software", "3d-reconstruction", "cad-bim-development", "crm-erp-development", "medical-imaging-ai"];
const ALL = [...PAGES_A, ...PAGES_B];
export const LANDING_PAGES: LandingPage[] = ORDER.map((s) => ALL.find((p) => p.slug === s)!);
export const LANDING_MAP: Record<string, LandingPage> = Object.fromEntries(LANDING_PAGES.map((p) => [p.slug, p]));
export type { LandingPage } from "./landing-types";
