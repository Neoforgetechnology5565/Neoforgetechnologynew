import type { DivisionSlug } from "./divisions";

export type IconName = "eye" | "shield" | "cpu" | "chart" | "cube" | "layers" | "file" | "truck" | "camera" | "users" | "database" | "gear" | "brain" | "scan" | "code" | "plug" | "target" | "clock";
export type ArtKind = "vision" | "ai" | "cctv" | "anpr" | "recon" | "cad" | "erp" | "medical";
export interface Capability { title: string; text: string; tech: string; icon: IconName }
export interface UseCase { industry: string; text: string }
export interface TechGroup { group: string; items: string[] }
export interface Step { title: string; text: string }
export interface Faq { q: string; a: string }
export interface RelatedLink { title: string; href: string; note: string }

/** One SEO landing page. Text is general: it describes what we build and how, and makes no claims about clients, accuracy figures or results. */
export interface LandingPage {
  slug: string;
  /** Short name for cards and links */
  name: string;
  division: DivisionSlug;
  primary: string;
  keywords: string[];
  /** Absolute <title>, about 60 characters */
  metaTitle: string;
  /** About 150-160 characters */
  metaDescription: string;
  h1: string;
  eyebrow: string;
  lead: string;
  /** Business value, shown beside the hero */
  value: string[];
  art: ArtKind;
  artAlt: string;
  overview: { what: string; solves: string[]; who: string[]; build: string; useful: string };
  capabilities: Capability[];
  useCases: UseCase[];
  tech: TechGroup[];
  process: Step[];
  /** An honest limits box: accuracy, hardware, data, validation */
  limits: { title: string; points: string[] };
  faqs: Faq[];
  /** Existing /services/[slug] pages */
  relatedServices: string[];
  /** Existing demos and projects */
  work: RelatedLink[];
}
