import type { DivisionSlug } from "./divisions";

export interface MediaRef {
  url: string;
  publicId: string;
  resourceType: "image" | "video" | "raw";
  format?: string;
  bytes?: number;
  name?: string;
  width?: number;
  height?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  division: DivisionSlug;
  description: string;
  capabilities: string[];
  enabled: boolean;
  order: number;
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  division: DivisionSlug;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  summary: string;
  description: string;
  cover: MediaRef | null;
  gallery: MediaRef[];
  documents: MediaRef[];
  files: MediaRef[];
  videoUrl: string;
  /** YouTube / Vimeo links shown as clickable thumbnails */
  videoLinks: string[];
  video: MediaRef | null;
  technologies: string[];
  features: string[];
  challenge: string;
  solution: string;
  results: string;
  pipeline: string[];
  featured: boolean;
  status: "draft" | "published";
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  order: number;
  enabled: boolean;
}

export interface HomeContent {
  heroEyebrow: string;
  heroHeading: string;
  heroDescription: string;
  primaryCta: string;
  secondaryCta: string;
  featuredProjectIds: string[];
  capabilities: { title: string; body: string }[];
}

export interface AboutContent {
  headline: string;
  description: string;
  approach: string;
  capabilities: string[];
}

export interface ContactSettings {
  email: string;
  phone: string;
  whatsapp: string;
  location: string;
  linkedin: string;
  github: string;
  x: string;
  youtube: string;
  chatEnabled: boolean;
  chatGreeting: string;
}

export interface Branding {
  /** Logo for LIGHT backgrounds (dark lettering) — used in the header */
  logoLight: MediaRef | null;
  /** Logo for DARK backgrounds (white lettering) — used in the footer */
  logoDark: MediaRef | null;
  /** Square icon — favicon, app icon, browser tab */
  icon: MediaRef | null;
  /** Crop uniform empty margins around the logos automatically (Cloudinary e_trim) */
  autoTrim: boolean;
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  company: string;
  projectType: string;
  division: string;
  budget: string;
  timeline: string;
  message: string;
  files: MediaRef[];
  status: "unread" | "read";
  createdAt: number;
}
